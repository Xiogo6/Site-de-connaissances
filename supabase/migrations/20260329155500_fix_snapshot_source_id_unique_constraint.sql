drop index if exists public.snapshots_source_id_idx;

alter table public.snapshots
  drop constraint if exists snapshots_source_id_key;

alter table public.snapshots
  add constraint snapshots_source_id_key unique (source_id);
