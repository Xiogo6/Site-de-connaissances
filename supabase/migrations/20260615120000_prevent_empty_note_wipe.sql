create or replace function public.prevent_empty_note_wipe()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (select count(*) from old_deleted_notes) >= 5
    and not exists (select 1 from public.notes where archived_at is null)
  then
    raise exception 'Refusing to delete every note in one operation.';
  end if;

  return null;
end;
$$;

drop trigger if exists prevent_empty_note_wipe_trigger on public.notes;

create trigger prevent_empty_note_wipe_trigger
after delete on public.notes
referencing old table as old_deleted_notes
for each statement
execute function public.prevent_empty_note_wipe();
