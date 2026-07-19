-- A user-confirmed page save must win over clock skew and background syncs.
-- Other pages in the full client replica still use newest-write-wins merging.

create or replace function public.sync_app_payload(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
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

revoke all on function public.sync_app_payload(jsonb) from public;
grant execute on function public.sync_app_payload(jsonb) to anon, authenticated;
