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
        when coalesce(note ->> 'type', 'concept') in ('concept', 'folder', 'hub', 'procedure', 'question')
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
      created_at,
      updated_at,
      null
    from temp_notes
    on conflict (slug) do update
    set
      title = excluded.title,
      type = excluded.type,
      content_md = excluded.content_md,
      is_favorite = excluded.is_favorite,
      review_streak = excluded.review_streak,
      last_reviewed_at = excluded.last_reviewed_at,
      next_review_at = excluded.next_review_at,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      parent_id = null,
      archived_at = null;

    update public.notes note
    set parent_id = parent.id
    from temp_notes temp_note
    left join public.notes parent on parent.slug = temp_note.parent_slug
    where note.slug = temp_note.slug;

    create temp table temp_tags (
      name text not null,
      slug text not null
    ) on commit drop;

    insert into temp_tags (name, slug)
    select distinct
      trim(tag_source.tag_name),
      public.slugify_text(trim(tag_source.tag_name))
    from temp_notes
    cross join lateral unnest(temp_notes.tags) as tag_source(tag_name)
    where trim(tag_source.tag_name) <> '';

    delete from public.tags
    where slug not in (select slug from temp_tags);

    insert into public.tags (name, slug)
    select temp_tag.name, temp_tag.slug
    from temp_tags temp_tag
    on conflict (slug) do update
    set name = excluded.name;

    insert into public.note_tags (note_id, tag_id)
    select distinct
      note.id,
      tag.id
    from temp_notes temp_note
    join public.notes note on note.slug = temp_note.slug
    cross join lateral unnest(temp_note.tags) as tag_source(tag_name)
    join public.tags tag on tag.slug = public.slugify_text(trim(tag_source.tag_name))
    where trim(tag_source.tag_name) <> ''
    on conflict (note_id, tag_id) do nothing;

    insert into public.note_links (source_note_id, target_note_id, target_title_raw)
    select distinct
      source_note.id,
      target_note.id,
      link_data.link_title
    from public.notes source_note
    cross join lateral regexp_matches(source_note.content_md, '\[\[([^\[\]]+)\]\]', 'g') as matched_link
    cross join lateral (
      select trim(matched_link[1]) as link_title
    ) link_data
    left join lateral (
      select target.id
      from public.notes target
      where lower(target.title) = lower(link_data.link_title)
      order by target.updated_at desc, target.created_at desc
      limit 1
    ) target_note on true
    where link_data.link_title <> '';
  end if;

  if payload ? 'snapshots' then
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
    from jsonb_array_elements(coalesce(payload -> 'snapshots', '[]'::jsonb)) snapshot;

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
      source_id,
      label,
      'manual'::public.snapshot_kind,
      temp_snapshots.payload,
      created_at,
      note_count
    from temp_snapshots
    on conflict (source_id) do update
    set
      label = excluded.label,
      payload = excluded.payload,
      created_at = excluded.created_at,
      note_count = excluded.note_count;
  end if;

  return jsonb_build_object(
    'notes', (select count(*) from public.notes),
    'tags', (select count(*) from public.tags),
    'snapshots', (select count(*) from public.snapshots),
    'syncedAt', now()
  );
end;
$$;
