alter table public.notes
  add column if not exists quiz_questions jsonb not null default '[]'::jsonb;

create or replace function public.get_app_payload()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'settings',
    jsonb_build_object(
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
    on conflict (slug) do nothing;

    insert into public.note_tags (note_id, tag_id)
    select note.id, tag.id
    from temp_notes temp
    join public.notes note on note.slug = temp.slug
    cross join lateral unnest(temp.tags) as t(tag_name)
    join public.tags tag on tag.slug = public.slugify_text(trim(t.tag_name))
    on conflict do nothing;
  end if;

  return jsonb_build_object('success', true);
end;
$$;
