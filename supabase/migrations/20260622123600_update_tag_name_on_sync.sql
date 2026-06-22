-- Keep the canonical tag label in Supabase aligned with the app payload.
-- Without this, renaming a tag to a label with the same slug keeps the old tags.name.

create or replace function public.prune_snapshot_history(max_snapshots integer default 5)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.snapshots
  where id in (
    select id
    from (
      select
        id,
        row_number() over (order by created_at desc, id desc) as snapshot_rank
      from public.snapshots
    ) ranked_snapshots
    where ranked_snapshots.snapshot_rank > greatest(max_snapshots, 0)
  );
end;
$$;

create or replace function public.prune_snapshot_history_after_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.prune_snapshot_history(5);
  return null;
end;
$$;

drop trigger if exists prune_snapshot_history_trigger on public.snapshots;

create trigger prune_snapshot_history_trigger
after insert or update on public.snapshots
for each statement
execute function public.prune_snapshot_history_after_write();

create or replace function public.sync_app_payload(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
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
    delete from public.notes
    where slug not in (select slug from temp_notes);

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

    perform public.prune_snapshot_history(5);
  end if;

  return jsonb_build_object('success', true);
end;
$$;

grant execute on function public.prune_snapshot_history(integer) to anon, authenticated;
grant execute on function public.sync_app_payload(jsonb) to anon, authenticated;

select public.prune_snapshot_history(5);
