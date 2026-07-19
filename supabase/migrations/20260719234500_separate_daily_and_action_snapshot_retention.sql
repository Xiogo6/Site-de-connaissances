-- Daily backups and action snapshots have independent retention budgets.
-- A burst of edits or deletions must never evict the daily history.

create or replace function public.protect_recent_snapshot_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_is_daily boolean :=
    coalesce(old.source_id like 'daily-%', false)
    or old.label = 'Snapshot quotidien';
  retention_limit integer := case when old_is_daily then 30 else 20 end;
begin
  if (
    select count(*)
    from public.snapshots snapshot
    where (
      coalesce(snapshot.source_id like 'daily-%', false)
      or snapshot.label = 'Snapshot quotidien'
    ) = old_is_daily
      and (snapshot.created_at, snapshot.id) > (old.created_at, old.id)
  ) >= retention_limit then
    return old;
  end if;

  return null;
end;
$$;

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

select public.prune_snapshot_history(30);
