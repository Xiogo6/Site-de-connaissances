create extension if not exists pg_cron with schema pg_catalog;

create or replace function public.create_daily_snapshot()
returns uuid
language plpgsql
security definer
set search_path = public
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

  perform public.prune_snapshot_history(5);

  return snapshot_id;
end;
$$;

do $$
begin
  if exists (
    select 1
    from cron.job
    where jobname = 'daily_app_snapshot'
  ) then
    perform cron.unschedule('daily_app_snapshot');
  end if;

  perform cron.schedule(
    'daily_app_snapshot',
    '0 1 * * *',
    $job$select public.create_daily_snapshot();$job$
  );
end;
$$;

grant execute on function public.create_daily_snapshot() to anon, authenticated;

select public.create_daily_snapshot();
