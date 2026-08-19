-- I-05 : ne plus renvoyer le contenu des snapshots au demarrage.
--
-- get_app_payload() renvoyait chaque snapshot avec la totalite de ses notes.
-- A 78 pages cela represente deja 585 Ko telecharges a chaque ouverture, et le
-- volume croit comme (nombre de pages x nombre de snapshots).
--
-- Le payload client ne transporte donc plus que les metadonnees des snapshots.
-- Le contenu se recupere a la demande, uniquement lors d'une restauration,
-- via get_snapshot(id).
--
-- Attention : sync_app_payload fusionne le payload serveur avec celui du client
-- avant d'ecrire. S'il lisait la version allegee, il reecrirait les snapshots
-- avec des notes vides et detruirait l'historique. Le wrapper lit donc
-- get_app_payload_full(), qui reste complete et n'est accordee a personne.

create or replace function public.get_app_payload_full()
returns jsonb language sql security definer stable set search_path = public
as $$
  select jsonb_build_object(
    'settings',
    coalesce(settings.client_state, '{}'::jsonb) || jsonb_build_object(
      'publishedUrl', coalesce(settings.published_url, ''),
      'lastPublishAt', settings.last_publish_at,
      'templates', settings.templates,
      'collapsedFolders', to_jsonb(settings.collapsed_folder_ids)
    ),
    'notes',
    coalesce(
      (
        select jsonb_agg(note_payload order by lower(note_payload ->> 'title'))
        from (
          select jsonb_build_object(
            'id', note.slug,
            'title', note.title,
            'type', note.type,
            'parentId', parent.slug,
            'favorite', note.is_favorite,
            'tags',
              coalesce(
                (
                  select jsonb_agg(tag.name order by lower(tag.name))
                  from public.note_tags note_tag
                  join public.tags tag on tag.id = note_tag.tag_id
                  where note_tag.note_id = note.id
                ),
                '[]'::jsonb
              ),
            'content', note.content_md,
            'quizQuestions', coalesce(note.quiz_questions, '[]'::jsonb),
            'metadata', coalesce(note.metadata, '{}'::jsonb),
            'createdAt', note.created_at,
            'updatedAt', note.updated_at,
            'review', jsonb_build_object(
              'streak', note.review_streak,
              'lastReviewedAt', note.last_reviewed_at,
              'nextReviewAt', note.next_review_at
            )
          ) as note_payload
          from public.notes note
          left join public.notes parent on parent.id = note.parent_id
          where note.archived_at is null
        ) notes_payload
      ),
      '[]'::jsonb
    ),
    'noteCount', (select count(*) from public.notes where archived_at is null),
    'generatedAt', now(),
    'snapshots',
    coalesce(
      (
        select jsonb_agg(snapshot_payload order by (snapshot_payload ->> 'createdAt') desc)
        from (
          select jsonb_build_object(
            'id', coalesce(snapshot.source_id, snapshot.id::text),
            'label', snapshot.label,
            'createdAt', snapshot.created_at,
            'noteCount', snapshot.note_count,
            'notes', coalesce(snapshot.payload -> 'notes', '[]'::jsonb)
          ) as snapshot_payload
          from public.snapshots snapshot
        ) snapshots_payload
      ),
      '[]'::jsonb
    )
  )
  from public.app_settings settings
  where settings.id = true;
$$;
create or replace function public.get_app_payload()
returns jsonb language sql security definer stable set search_path = public
as $$
  select jsonb_build_object(
    'settings',
    coalesce(settings.client_state, '{}'::jsonb) || jsonb_build_object(
      'publishedUrl', coalesce(settings.published_url, ''),
      'lastPublishAt', settings.last_publish_at,
      'templates', settings.templates,
      'collapsedFolders', to_jsonb(settings.collapsed_folder_ids)
    ),
    'notes',
    coalesce(
      (
        select jsonb_agg(note_payload order by lower(note_payload ->> 'title'))
        from (
          select jsonb_build_object(
            'id', note.slug,
            'title', note.title,
            'type', note.type,
            'parentId', parent.slug,
            'favorite', note.is_favorite,
            'tags',
              coalesce(
                (
                  select jsonb_agg(tag.name order by lower(tag.name))
                  from public.note_tags note_tag
                  join public.tags tag on tag.id = note_tag.tag_id
                  where note_tag.note_id = note.id
                ),
                '[]'::jsonb
              ),
            'content', note.content_md,
            'quizQuestions', coalesce(note.quiz_questions, '[]'::jsonb),
            'metadata', coalesce(note.metadata, '{}'::jsonb),
            'createdAt', note.created_at,
            'updatedAt', note.updated_at,
            'review', jsonb_build_object(
              'streak', note.review_streak,
              'lastReviewedAt', note.last_reviewed_at,
              'nextReviewAt', note.next_review_at
            )
          ) as note_payload
          from public.notes note
          left join public.notes parent on parent.id = note.parent_id
          where note.archived_at is null
        ) notes_payload
      ),
      '[]'::jsonb
    ),
    'noteCount', (select count(*) from public.notes where archived_at is null),
    'generatedAt', now(),
    'snapshots',
    coalesce(
      (
        select jsonb_agg(snapshot_payload order by (snapshot_payload ->> 'createdAt') desc)
        from (
          select jsonb_build_object(
            'id', coalesce(snapshot.source_id, snapshot.id::text),
            'label', snapshot.label,
            'createdAt', snapshot.created_at,
            'noteCount', snapshot.note_count
          ) as snapshot_payload
          from public.snapshots snapshot
        ) snapshots_payload
      ),
      '[]'::jsonb
    )
  )
  from public.app_settings settings
  where settings.id = true;
$$;

-- Contenu d'un seul snapshot, charge a la demande lors d'une restauration.
create or replace function public.get_snapshot(snapshot_id text)
returns jsonb language sql security definer stable set search_path = public
as $$
  select jsonb_build_object(
    'id', coalesce(snapshot.source_id, snapshot.id::text),
    'label', snapshot.label,
    'createdAt', snapshot.created_at,
    'noteCount', snapshot.note_count,
    'notes', coalesce(snapshot.payload -> 'notes', '[]'::jsonb)
  )
  from public.snapshots snapshot
  where coalesce(snapshot.source_id, snapshot.id::text) = trim(snapshot_id)
  limit 1;
$$;

create or replace function public.sync_app_payload(payload jsonb)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  server_payload jsonb;
  safe_payload jsonb := coalesce(payload, '{}'::jsonb);
  changed_note_ids text[] := coalesce(
    array(
      select trim(value)
      from jsonb_array_elements_text(
        case
          when jsonb_typeof(safe_payload -> 'changedNoteIds') = 'array'
            then safe_payload -> 'changedNoteIds'
          else '[]'::jsonb
        end
      ) value
      where trim(value) <> ''
    ),
    array[]::text[]
  );
  merged_notes jsonb;
  merged_snapshots jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('atlas_sync_app_payload'));

  if jsonb_typeof(safe_payload -> 'deletedNotes') = 'array' then
    perform public.register_note_deletions(safe_payload -> 'deletedNotes');
  end if;

  server_payload := coalesce(public.get_app_payload_full(), '{}'::jsonb);

  if safe_payload ? 'notes' then
    select coalesce(jsonb_agg(chosen.note order by lower(chosen.note ->> 'title')), '[]'::jsonb)
    into merged_notes
    from (
      select distinct on (candidate.note_id) candidate.note
      from (
        select
          note,
          trim(note ->> 'id') as note_id,
          coalesce((note ->> 'updatedAt')::timestamptz, 'epoch'::timestamptz) as updated_at,
          trim(note ->> 'id') = any(changed_note_ids) as is_explicit_change,
          1 as source_priority
        from jsonb_array_elements(coalesce(safe_payload -> 'notes', '[]'::jsonb)) note

        union all

        select
          note,
          trim(note ->> 'id') as note_id,
          coalesce((note ->> 'updatedAt')::timestamptz, 'epoch'::timestamptz) as updated_at,
          false as is_explicit_change,
          0 as source_priority
        from jsonb_array_elements(coalesce(server_payload -> 'notes', '[]'::jsonb)) note
      ) candidate
      where candidate.note_id <> ''
        and not exists (
          select 1
          from public.note_tombstones tombstone
          where tombstone.slug = candidate.note_id
            and tombstone.deleted_at >= candidate.updated_at
        )
      order by
        candidate.note_id,
        candidate.is_explicit_change desc,
        candidate.updated_at desc,
        candidate.source_priority desc
    ) chosen;

    safe_payload := jsonb_set(safe_payload, '{notes}', merged_notes, true);
  end if;

  if safe_payload ? 'snapshots' then
    select coalesce(
      jsonb_agg(chosen.snapshot order by chosen.created_at desc),
      '[]'::jsonb
    )
    into merged_snapshots
    from (
      select distinct on (candidate.snapshot_id)
        candidate.snapshot,
        candidate.created_at
      from (
        select
          snapshot,
          trim(snapshot ->> 'id') as snapshot_id,
          coalesce((snapshot ->> 'createdAt')::timestamptz, 'epoch'::timestamptz) as created_at,
          1 as source_priority
        from jsonb_array_elements(coalesce(safe_payload -> 'snapshots', '[]'::jsonb)) snapshot

        union all

        select
          snapshot,
          trim(snapshot ->> 'id') as snapshot_id,
          coalesce((snapshot ->> 'createdAt')::timestamptz, 'epoch'::timestamptz) as created_at,
          0 as source_priority
        from jsonb_array_elements(coalesce(server_payload -> 'snapshots', '[]'::jsonb)) snapshot
      ) candidate
      where candidate.snapshot_id <> ''
      order by
        candidate.snapshot_id,
        candidate.created_at desc,
        candidate.source_priority desc
    ) chosen;

    safe_payload := jsonb_set(safe_payload, '{snapshots}', merged_snapshots, true);
  end if;

  return public.sync_app_payload_legacy_v59(safe_payload);
end;
$$;

revoke all on function public.get_app_payload_full() from public, anon, authenticated;
revoke all on function public.get_app_payload() from public;
revoke all on function public.get_snapshot(text) from public;
revoke all on function public.sync_app_payload(jsonb) from public;

grant execute on function public.get_app_payload() to anon, authenticated;
grant execute on function public.get_snapshot(text) to anon, authenticated;
grant execute on function public.sync_app_payload(jsonb) to anon, authenticated;
