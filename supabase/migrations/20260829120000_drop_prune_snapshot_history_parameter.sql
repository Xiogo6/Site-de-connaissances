-- Retirer le parametre que prune_snapshot_history n'a jamais lu.
--
-- La fonction declarait `max_snapshots integer default 30` et ne s'en servait
-- nulle part : les limites sont ecrites en dur dans son corps, 30 snapshots
-- quotidiens et 20 d'action. Ses trois appelants passaient donc un chiffre
-- sans effet.
--
--   create_daily_snapshot            prune_snapshot_history(5)
--   sync_app_payload_legacy_v59      prune_snapshot_history(5)
--   prune_snapshot_history_after_write   prune_snapshot_history(30)
--
-- Les trois sont vivants. Le second surtout : sync_app_payload, la seule
-- fonction que l'application appelle, se termine par
-- `return public.sync_app_payload_legacy_v59(safe_payload)`. Le `5` traverse
-- donc chaque synchronisation.
--
-- Aujourd'hui il ne se passe rien, puisque le parametre est ignore. Le risque
-- est ailleurs : le jour ou quelqu'un rendrait ce parametre effectif, croyant
-- corriger un oubli, chaque synchronisation ramenerait l'historique a 5
-- snapshots. Une signature qui ment finit par etre crue.
--
-- La fonction perd donc son parametre, et les trois appelants sont reecrits a
-- l'identique, un seul appel change dans chacun.
--
-- Deux precautions :
--
--   L'ancienne signature part en premier. Tant que les deux coexistent, un
--   appel `prune_snapshot_history()` sans argument est ambigu, PostgreSQL
--   pouvant le rattacher aussi bien a la version sans parametre qu'a celle
--   dont le parametre a une valeur par defaut.
--
--   Le tout dans une transaction. Entre la suppression et la recreation, les
--   appelants designent une fonction absente ; en dehors d'une transaction,
--   une synchronisation tombant dans cet intervalle echouerait.
--
-- Les attributs de chaque fonction tiennent sur une seule ligne : l'editeur
-- SQL de Supabase coupe l'instruction devant un attribut place en debut de
-- ligne, ce qui avait deja produit un `syntax error at or near "stable"`.

begin;

drop function if exists public.prune_snapshot_history(integer);

-- 1. L'elagage lui-meme, corps inchange, sans le parametre fossile.
create or replace function public.prune_snapshot_history()
returns void language plpgsql security definer set search_path = public
as $$
begin
  delete from public.snapshots
  where id in (
    select id
    from (
      select
        id,
        case
          when coalesce(source_id like 'daily-%', false)
            or label = 'Snapshot quotidien'
            then true
          else false
        end as is_daily,
        row_number() over (
          partition by (
            coalesce(source_id like 'daily-%', false)
            or label = 'Snapshot quotidien'
          )
          order by created_at desc, id desc
        ) as snapshot_rank
      from public.snapshots
    ) ranked_snapshots
    where (
      ranked_snapshots.is_daily
      and ranked_snapshots.snapshot_rank > 30
    ) or (
      not ranked_snapshots.is_daily
      and ranked_snapshots.snapshot_rank > 20
    )
  );
end;
$$;

-- 2. Le declencheur pose sur la table snapshots.
create or replace function public.prune_snapshot_history_after_write()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  perform public.prune_snapshot_history();
  return null;
end;
$$;

-- 3. La tache de snapshot quotidien, reprise a l'identique depuis
--    20260615124500, un seul appel change.
create or replace function public.create_daily_snapshot()
returns uuid language plpgsql security definer set search_path = public
as $$
declare
  snapshot_notes jsonb;
  snapshot_note_count integer;
  snapshot_id uuid;
  snapshot_source_id text;
begin
  snapshot_notes := coalesce(public.get_app_payload() -> 'notes', '[]'::jsonb);
  snapshot_note_count := jsonb_array_length(snapshot_notes);

  if snapshot_note_count = 0 then
    return null;
  end if;

  snapshot_source_id :=
    'daily-' || to_char((now() at time zone 'Europe/Paris')::date, 'YYYY-MM-DD');

  insert into public.snapshots (
    source_id,
    label,
    kind,
    payload,
    created_at,
    note_count
  )
  values (
    snapshot_source_id,
    'Snapshot quotidien',
    'backup'::public.snapshot_kind,
    jsonb_build_object('notes', snapshot_notes),
    now(),
    snapshot_note_count
  )
  on conflict (source_id) do update
  set
    label = excluded.label,
    kind = excluded.kind,
    payload = excluded.payload,
    created_at = excluded.created_at,
    note_count = excluded.note_count
  returning id into snapshot_id;

  perform public.prune_snapshot_history();

  return snapshot_id;
end;
$$;

-- 4. La fonction de synchronisation, reprise a l'identique depuis
--    20260819120000, un seul appel change.
create or replace function public.sync_app_payload_legacy_v59(payload jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions
as $$
declare
  settings_payload jsonb := coalesce(payload -> 'settings', '{}'::jsonb);
begin
  insert into public.app_settings (
    id,
    site_name,
    published_url,
    last_publish_at,
    templates,
    collapsed_folder_ids
  )
  values (
    true,
    coalesce(nullif(trim(settings_payload ->> 'siteName'), ''), 'Atlas de Connaissance'),
    nullif(trim(settings_payload ->> 'publishedUrl'), ''),
    case
      when jsonb_typeof(settings_payload -> 'lastPublishAt') = 'string'
        then (settings_payload ->> 'lastPublishAt')::timestamptz
      else null
    end,
    coalesce(settings_payload -> 'templates', '{}'::jsonb),
    coalesce(
      array(
        select jsonb_array_elements_text(coalesce(settings_payload -> 'collapsedFolders', '[]'::jsonb))
      ),
      array[]::text[]
    )
  )
  on conflict (id) do update
  set
    site_name = excluded.site_name,
    published_url = excluded.published_url,
    last_publish_at = excluded.last_publish_at,
    templates = excluded.templates,
    collapsed_folder_ids = excluded.collapsed_folder_ids;

  if payload ? 'notes' then
    create temp table temp_notes (
      slug text primary key,
      title text not null,
      type text not null,
      parent_slug text,
      is_favorite boolean not null,
      tags text[] not null,
      content_md text not null,
      quiz_questions jsonb not null,
      metadata jsonb not null,
      created_at timestamptz not null,
      updated_at timestamptz not null,
      review_streak integer not null,
      last_reviewed_at timestamptz,
      next_review_at timestamptz
    ) on commit drop;

    insert into temp_notes (
      slug,
      title,
      type,
      parent_slug,
      is_favorite,
      tags,
      content_md,
      quiz_questions,
      metadata,
      created_at,
      updated_at,
      review_streak,
      last_reviewed_at,
      next_review_at
    )
    select
      coalesce(nullif(trim(note ->> 'id'), ''), public.slugify_text(note ->> 'title')),
      coalesce(nullif(trim(note ->> 'title'), ''), 'Sans titre'),
      case
        when coalesce(note ->> 'type', 'concept') in ('concept', 'folder', 'hub', 'procedure', 'question', 'person', 'event')
          then note ->> 'type'
        else 'concept'
      end,
      nullif(trim(note ->> 'parentId'), ''),
      coalesce((note ->> 'favorite')::boolean, false),
      coalesce(
        array(
          select trim(value)
          from jsonb_array_elements_text(coalesce(note -> 'tags', '[]'::jsonb)) value
          where trim(value) <> ''
        ),
        array[]::text[]
      ),
      coalesce(note ->> 'content', ''),
      coalesce(note -> 'quizQuestions', '[]'::jsonb),
      coalesce(note -> 'metadata', '{}'::jsonb),
      coalesce((note ->> 'createdAt')::timestamptz, now()),
      coalesce((note ->> 'updatedAt')::timestamptz, now()),
      greatest(coalesce((note -> 'review' ->> 'streak')::integer, 0), 0),
      case
        when jsonb_typeof(note -> 'review' -> 'lastReviewedAt') = 'string'
          then (note -> 'review' ->> 'lastReviewedAt')::timestamptz
        else null
      end,
      case
        when jsonb_typeof(note -> 'review' -> 'nextReviewAt') = 'string'
          then (note -> 'review' ->> 'nextReviewAt')::timestamptz
        else now()
      end
    from jsonb_array_elements(coalesce(payload -> 'notes', '[]'::jsonb)) note;

    delete from public.note_tags where true;
    delete from public.note_links where true;
    -- C-05 : une page archivee est une page supprimee mais recuperable.
    -- Elle est volontairement absente du payload (get_app_payload la filtre),
    -- donc ce balayage la detruisait definitivement des la synchronisation suivante.
    delete from public.notes
    where slug not in (select slug from temp_notes)
      and archived_at is null;

    insert into public.notes (
      slug,
      title,
      type,
      content_md,
      summary,
      is_favorite,
      review_streak,
      last_reviewed_at,
      next_review_at,
      quiz_questions,
      metadata,
      created_at,
      updated_at,
      parent_id
    )
    select
      slug,
      title,
      type,
      content_md,
      null,
      is_favorite,
      review_streak,
      last_reviewed_at,
      next_review_at,
      quiz_questions,
      metadata,
      created_at,
      updated_at,
      null
    from temp_notes
    on conflict (slug) do update
    set
      title = excluded.title,
      type = excluded.type,
      content_md = excluded.content_md,
      summary = excluded.summary,
      is_favorite = excluded.is_favorite,
      review_streak = excluded.review_streak,
      last_reviewed_at = excluded.last_reviewed_at,
      next_review_at = excluded.next_review_at,
      quiz_questions = excluded.quiz_questions,
      metadata = excluded.metadata,
      updated_at = excluded.updated_at;

    update public.notes note
    set parent_id = parent.id
    from temp_notes temp
    left join public.notes parent on parent.slug = temp.parent_slug
    where note.slug = temp.slug;

    insert into public.tags (name, slug)
    select distinct trim(t.tag_name), public.slugify_text(trim(t.tag_name))
    from temp_notes temp
    cross join lateral unnest(temp.tags) as t(tag_name)
    where trim(t.tag_name) <> ''
    on conflict (slug) do update
    set name = excluded.name;

    insert into public.note_tags (note_id, tag_id)
    select note.id, tag.id
    from temp_notes temp
    join public.notes note on note.slug = temp.slug
    cross join lateral unnest(temp.tags) as t(tag_name)
    join public.tags tag on tag.slug = public.slugify_text(trim(t.tag_name))
    on conflict do nothing;
  end if;

  if payload ? 'snapshots'
    and jsonb_typeof(payload -> 'snapshots') = 'array'
    and jsonb_array_length(payload -> 'snapshots') > 0
  then
    create temp table temp_snapshots (
      source_id text primary key,
      label text not null,
      payload jsonb not null,
      created_at timestamptz not null,
      note_count integer not null
    ) on commit drop;

    insert into temp_snapshots (source_id, label, payload, created_at, note_count)
    select
      coalesce(nullif(trim(snapshot ->> 'id'), ''), md5(snapshot::text)),
      coalesce(nullif(trim(snapshot ->> 'label'), ''), 'Snapshot'),
      jsonb_build_object(
        'notes', coalesce(snapshot -> 'notes', '[]'::jsonb)
      ),
      coalesce((snapshot ->> 'createdAt')::timestamptz, now()),
      greatest(coalesce((snapshot ->> 'noteCount')::integer, 0), 0)
    from jsonb_array_elements(payload -> 'snapshots') snapshot;

    delete from public.snapshots
    where source_id is not null
      and source_id not in (select source_id from temp_snapshots);

    insert into public.snapshots (
      source_id,
      label,
      kind,
      payload,
      created_at,
      note_count
    )
    select
      temp_snapshots.source_id,
      temp_snapshots.label,
      'manual'::public.snapshot_kind,
      temp_snapshots.payload,
      temp_snapshots.created_at,
      temp_snapshots.note_count
    from temp_snapshots
    on conflict (source_id) do update
    set
      label = excluded.label,
      payload = excluded.payload,
      created_at = excluded.created_at,
      note_count = excluded.note_count;

    perform public.prune_snapshot_history();
  end if;

  return jsonb_build_object('success', true);
end;
$$;

-- Une fonction fraichement creee accorde EXECUTE a PUBLIC par defaut. Rien ne
-- l'appelle en direct : le declencheur et les deux fonctions ci-dessus sont
-- `security definer` et s'executent avec les droits de leur proprietaire.
revoke all on function public.prune_snapshot_history() from public, anon, authenticated;

commit;
