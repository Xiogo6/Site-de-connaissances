-- A client payload is a partial replica, not an instruction to delete absent data.
-- Keep explicit deletion markers and merge replicas before invoking the legacy writer.

create table if not exists public.note_tombstones (
  slug text primary key,
  deleted_at timestamptz not null default now()
);

alter table public.note_tombstones enable row level security;
revoke all on table public.note_tombstones from public, anon, authenticated;

create or replace function public.protect_note_from_stale_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  tombstone_created_at timestamptz;
begin
  select deleted_at
  into tombstone_created_at
  from public.note_tombstones
  where slug = new.slug;

  if tombstone_created_at is null then
    return new;
  end if;

  if coalesce(new.updated_at, new.created_at, '-infinity'::timestamptz) <= tombstone_created_at then
    return null;
  end if;

  delete from public.note_tombstones where slug = new.slug;
  return new;
end;
$$;

drop trigger if exists a_protect_note_from_stale_write_trigger on public.notes;
create trigger a_protect_note_from_stale_write_trigger
before insert or update on public.notes
for each row
execute function public.protect_note_from_stale_write();

create or replace function public.protect_note_from_implicit_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.note_tombstones where slug = old.slug
  ) then
    return old;
  end if;

  return null;
end;
$$;

drop trigger if exists protect_note_from_implicit_delete_trigger on public.notes;
create trigger protect_note_from_implicit_delete_trigger
before delete on public.notes
for each row
execute function public.protect_note_from_implicit_delete();

create or replace function public.register_note_deletions(deletions jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if jsonb_typeof(deletions) <> 'array' then
    return jsonb_build_object('success', false, 'deleted', 0);
  end if;

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

  delete from public.notes note
  using public.note_tombstones tombstone
  where note.slug = tombstone.slug
    and note.updated_at <= tombstone.deleted_at;

  return jsonb_build_object(
    'success', true,
    'deleted', jsonb_array_length(deletions)
  );
end;
$$;

create or replace function public.get_note_deletions()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object('id', slug, 'deletedAt', deleted_at)
      order by deleted_at desc
    ),
    '[]'::jsonb
  )
  from public.note_tombstones;
$$;

-- Only snapshots older than the 30 newest entries may be deleted, regardless
-- of whether the deletion comes from pruning or from an incomplete client.
create or replace function public.protect_recent_snapshot_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (
    select count(*)
    from public.snapshots snapshot
    where (snapshot.created_at, snapshot.id) > (old.created_at, old.id)
  ) >= 30 then
    return old;
  end if;

  return null;
end;
$$;

drop trigger if exists protect_recent_snapshot_history_trigger on public.snapshots;
create trigger protect_recent_snapshot_history_trigger
before delete on public.snapshots
for each row
execute function public.protect_recent_snapshot_history();

create or replace function public.prune_snapshot_history(max_snapshots integer default 30)
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
    where ranked_snapshots.snapshot_rank > greatest(max_snapshots, 30)
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
  perform public.prune_snapshot_history(30);
  return null;
end;
$$;

alter function public.sync_app_payload(jsonb) rename to sync_app_payload_legacy_v59;
revoke all on function public.sync_app_payload_legacy_v59(jsonb) from public, anon, authenticated;

create or replace function public.sync_app_payload(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  server_payload jsonb;
  safe_payload jsonb := coalesce(payload, '{}'::jsonb);
  merged_notes jsonb;
  merged_snapshots jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('atlas_sync_app_payload'));

  if jsonb_typeof(safe_payload -> 'deletedNotes') = 'array' then
    perform public.register_note_deletions(safe_payload -> 'deletedNotes');
  end if;

  server_payload := coalesce(public.get_app_payload(), '{}'::jsonb);

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
          1 as source_priority
        from jsonb_array_elements(coalesce(safe_payload -> 'notes', '[]'::jsonb)) note

        union all

        select
          note,
          trim(note ->> 'id') as note_id,
          coalesce((note ->> 'updatedAt')::timestamptz, 'epoch'::timestamptz) as updated_at,
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

grant execute on function public.get_note_deletions() to anon, authenticated;
grant execute on function public.register_note_deletions(jsonb) to anon, authenticated;
grant execute on function public.prune_snapshot_history(integer) to anon, authenticated;
grant execute on function public.sync_app_payload(jsonb) to anon, authenticated;

select public.prune_snapshot_history(30);
