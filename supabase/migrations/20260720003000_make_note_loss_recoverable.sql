-- Never physically remove knowledge pages and keep their previous contents recoverable.

create table if not exists public.note_versions (
  id bigint generated always as identity primary key,
  note_id uuid not null,
  slug text not null,
  operation text not null,
  payload jsonb not null,
  captured_at timestamptz not null default now()
);

alter table public.note_versions enable row level security;
revoke all on table public.note_versions from public, anon, authenticated;

create index if not exists note_versions_slug_captured_at_idx
  on public.note_versions (slug, captured_at desc);

-- Full-workspace syncs touch every row. Only advance updated_at when the row
-- actually changed and no explicit client timestamp was supplied.
create or replace function public.handle_note_updated_at()
returns trigger
language plpgsql
as $$
begin
  if new.updated_at is not distinct from old.updated_at and (
    old.title is distinct from new.title
    or old.type is distinct from new.type
    or old.content_md is distinct from new.content_md
    or old.summary is distinct from new.summary
    or old.is_favorite is distinct from new.is_favorite
    or old.review_streak is distinct from new.review_streak
    or old.last_reviewed_at is distinct from new.last_reviewed_at
    or old.next_review_at is distinct from new.next_review_at
    or old.archived_at is distinct from new.archived_at
    or old.parent_id is distinct from new.parent_id
    or old.metadata is distinct from new.metadata
    or old.quiz_questions is distinct from new.quiz_questions
  ) then
    new.updated_at = now();
  end if;

  return new;
end;
$$;

drop trigger if exists notes_set_updated_at on public.notes;
create trigger notes_set_updated_at
before update on public.notes
for each row
execute function public.handle_note_updated_at();

alter table public.notes drop constraint if exists notes_type_check;
alter table public.notes
  add constraint notes_type_check
  check (type ~ '^[a-z0-9][a-z0-9_-]{0,63}$');

create or replace function public.restore_client_note_type()
returns trigger
language plpgsql
as $$
declare
  client_type text := trim(coalesce(new.metadata ->> '_atlasType', ''));
begin
  if client_type ~ '^[a-z0-9][a-z0-9_-]{0,63}$' then
    new.type = client_type;
  end if;
  return new;
end;
$$;

drop trigger if exists a0_restore_client_note_type_trigger on public.notes;
create trigger a0_restore_client_note_type_trigger
before insert or update on public.notes
for each row
execute function public.restore_client_note_type();

create or replace function public.capture_note_version_before_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  change_operation text;
  previous_payload jsonb;
begin
  if not (
    old.title is distinct from new.title
    or old.type is distinct from new.type
    or old.content_md is distinct from new.content_md
    or old.summary is distinct from new.summary
    or old.is_favorite is distinct from new.is_favorite
    or old.review_streak is distinct from new.review_streak
    or old.last_reviewed_at is distinct from new.last_reviewed_at
    or old.next_review_at is distinct from new.next_review_at
    or old.archived_at is distinct from new.archived_at
    or old.parent_id is distinct from new.parent_id
    or old.metadata is distinct from new.metadata
    or old.quiz_questions is distinct from new.quiz_questions
  ) then
    return new;
  end if;

  change_operation := case
    when old.archived_at is null and new.archived_at is not null then 'archive'
    when old.archived_at is not null and new.archived_at is null then 'restore'
    else 'update'
  end;

  previous_payload := to_jsonb(old) || jsonb_build_object(
    'parentSlug', (
      select parent.slug from public.notes parent where parent.id = old.parent_id
    ),
    'tags', coalesce(
      (
        select jsonb_agg(tag.name order by lower(tag.name))
        from public.note_tags note_tag
        join public.tags tag on tag.id = note_tag.tag_id
        where note_tag.note_id = old.id
      ),
      '[]'::jsonb
    )
  );

  insert into public.note_versions (note_id, slug, operation, payload)
  values (old.id, old.slug, change_operation, previous_payload);

  return new;
end;
$$;

drop trigger if exists b_capture_note_version_trigger on public.notes;
create trigger b_capture_note_version_trigger
before update on public.notes
for each row
execute function public.capture_note_version_before_change();

-- A tombstone can only be cleared by the explicit restoration RPC. A device
-- with a clock set in the future must not be able to resurrect a deleted page.
create or replace function public.protect_note_from_stale_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.note_tombstones where slug = new.slug
  ) then
    return null;
  end if;

  return new;
end;
$$;

-- Even legacy writers and administrative RPCs cannot physically delete a page.
create or replace function public.protect_note_from_implicit_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  return null;
end;
$$;

create or replace function public.register_note_deletions(deletions jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  archived_count integer := 0;
begin
  if jsonb_typeof(deletions) <> 'array' then
    return jsonb_build_object('success', false, 'archived', 0);
  end if;

  with requested_deletions as (
    select
      trim(deletion ->> 'id') as slug,
      case
        when jsonb_typeof(deletion -> 'deletedAt') = 'string'
          then (deletion ->> 'deletedAt')::timestamptz
        else now()
      end as deleted_at
    from jsonb_array_elements(deletions) deletion
    where trim(coalesce(deletion ->> 'id', '')) <> ''
  )
  update public.notes note
  set archived_at = requested.deleted_at
  from requested_deletions requested
  where note.slug = requested.slug
    and note.archived_at is null;

  get diagnostics archived_count = row_count;

  insert into public.note_tombstones (slug, deleted_at)
  select
    trim(deletion ->> 'id'),
    case
      when jsonb_typeof(deletion -> 'deletedAt') = 'string'
        then (deletion ->> 'deletedAt')::timestamptz
      else now()
    end
  from jsonb_array_elements(deletions) deletion
  where trim(coalesce(deletion ->> 'id', '')) <> ''
  on conflict (slug) do update
  set deleted_at = greatest(note_tombstones.deleted_at, excluded.deleted_at);

  return jsonb_build_object(
    'success', true,
    'archived', archived_count,
    'requested', jsonb_array_length(deletions)
  );
end;
$$;

create or replace function public.restore_deleted_notes(restoration_ids jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  restored_count integer := 0;
begin
  if jsonb_typeof(restoration_ids) <> 'array' then
    return jsonb_build_object('success', false, 'restored', 0);
  end if;

  delete from public.note_tombstones tombstone
  where tombstone.slug in (
    select trim(value)
    from jsonb_array_elements_text(restoration_ids) value
    where trim(value) <> ''
  );

  update public.notes note
  set archived_at = null
  where note.slug in (
    select trim(value)
    from jsonb_array_elements_text(restoration_ids) value
    where trim(value) <> ''
  )
    and note.archived_at is not null;

  get diagnostics restored_count = row_count;

  return jsonb_build_object('success', true, 'restored', restored_count);
end;
$$;

-- Include integrity metadata so a truncated HTTP response is never accepted as
-- the new canonical workspace by a client.
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

revoke all on function public.register_note_deletions(jsonb) from public;
revoke all on function public.restore_deleted_notes(jsonb) from public;
revoke all on function public.sync_app_payload(jsonb) from public;
revoke all on function public.sync_client_settings(jsonb) from public;
revoke all on function public.get_app_payload() from public;

grant execute on function public.register_note_deletions(jsonb) to anon, authenticated;
grant execute on function public.restore_deleted_notes(jsonb) to anon, authenticated;
grant execute on function public.sync_app_payload(jsonb) to anon, authenticated;
grant execute on function public.sync_client_settings(jsonb) to anon, authenticated;
grant execute on function public.get_app_payload() to anon, authenticated;
