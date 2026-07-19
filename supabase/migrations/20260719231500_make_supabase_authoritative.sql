-- Supabase owns the canonical workspace, including client settings.

alter table public.app_settings
  add column if not exists client_state jsonb not null default '{}'::jsonb;

create or replace function public.sync_client_settings(settings_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  canonical_settings jsonb;
begin
  canonical_settings := case
    when jsonb_typeof(settings_payload) = 'object' then settings_payload
    else '{}'::jsonb
  end;

  canonical_settings := canonical_settings || jsonb_build_object(
    'settingsAuthorityVersion', 1
  );

  update public.app_settings
  set client_state = canonical_settings
  where id = true;

  return jsonb_build_object('success', true);
end;
$$;

create or replace function public.get_app_payload()
returns jsonb
language sql
security definer
set search_path = public
stable
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
            'review',
              jsonb_build_object(
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

grant execute on function public.sync_client_settings(jsonb) to anon, authenticated;
grant execute on function public.get_app_payload() to anon, authenticated;
