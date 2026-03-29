create extension if not exists pgcrypto with schema extensions;

create type public.workspace_role as enum ('owner', 'editor', 'viewer');
create type public.snapshot_kind as enum ('manual', 'published', 'backup');

create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    nullif(trim(new.raw_user_meta_data ->> 'username'), ''),
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'name'), '')
    )
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create or replace function public.handle_new_workspace()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.workspace_members (workspace_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (workspace_id, user_id) do nothing;

  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_length_check
    check (username is null or char_length(username) between 3 and 32)
);

create table public.workspaces (
  id uuid primary key default extensions.gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  owner_id uuid not null references public.profiles (id) on delete restrict,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.workspace_role not null default 'viewer',
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table public.notes (
  id uuid primary key default extensions.gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  slug text not null,
  title text not null,
  type text not null default 'concept',
  content_md text not null default '',
  summary text,
  created_by uuid not null references public.profiles (id) on delete restrict,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint notes_type_check
    check (type in ('concept', 'hub', 'procedure', 'question')),
  constraint notes_workspace_slug_key unique (workspace_id, slug)
);

create table public.tags (
  id uuid primary key default extensions.gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null,
  slug text not null,
  color text,
  created_at timestamptz not null default now(),
  constraint tags_workspace_name_key unique (workspace_id, name),
  constraint tags_workspace_slug_key unique (workspace_id, slug)
);

create table public.note_tags (
  note_id uuid not null references public.notes (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (note_id, tag_id)
);

create table public.note_links (
  id uuid primary key default extensions.gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  source_note_id uuid not null references public.notes (id) on delete cascade,
  target_note_id uuid references public.notes (id) on delete set null,
  target_title_raw text,
  created_at timestamptz not null default now(),
  constraint note_links_target_check
    check (target_note_id is not null or target_title_raw is not null)
);

create table public.user_note_state (
  user_id uuid not null references public.profiles (id) on delete cascade,
  note_id uuid not null references public.notes (id) on delete cascade,
  is_favorite boolean not null default false,
  review_streak integer not null default 0,
  last_reviewed_at timestamptz,
  next_review_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, note_id),
  constraint user_note_state_review_streak_check
    check (review_streak >= 0)
);

create table public.workspace_snapshots (
  id uuid primary key default extensions.gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  label text not null,
  kind public.snapshot_kind not null default 'manual',
  payload jsonb not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.user_note_state is 'Etat personnel par utilisateur: favoris, revision et progression individuelle.';
comment on column public.note_links.target_title_raw is 'Titre cible conserve quand le lien pointe vers une page pas encore creee.';
comment on table public.workspace_snapshots is 'Stocke des exports complets ou snapshots publies en JSONB.';

create index workspace_members_user_id_idx on public.workspace_members (user_id);
create index notes_workspace_id_idx on public.notes (workspace_id);
create index notes_workspace_updated_at_idx on public.notes (workspace_id, updated_at desc);
create index tags_workspace_id_idx on public.tags (workspace_id);
create index note_tags_tag_id_idx on public.note_tags (tag_id);
create index note_links_workspace_id_idx on public.note_links (workspace_id);
create index note_links_source_note_id_idx on public.note_links (source_note_id);
create index note_links_target_note_id_idx on public.note_links (target_note_id);
create index user_note_state_next_review_at_idx on public.user_note_state (next_review_at);
create index user_note_state_favorites_idx on public.user_note_state (user_id, is_favorite);
create index workspace_snapshots_workspace_id_idx on public.workspace_snapshots (workspace_id, created_at desc);

create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function public.handle_updated_at();

create trigger workspaces_set_updated_at
before update on public.workspaces
for each row
execute function public.handle_updated_at();

create trigger notes_set_updated_at
before update on public.notes
for each row
execute function public.handle_updated_at();

create trigger user_note_state_set_updated_at
before update on public.user_note_state
for each row
execute function public.handle_updated_at();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

create trigger workspaces_insert_owner_membership
after insert on public.workspaces
for each row
execute function public.handle_new_workspace();

create or replace function public.can_view_workspace(target_workspace_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.workspaces w
    left join public.workspace_members wm
      on wm.workspace_id = w.id
     and wm.user_id = auth.uid()
    where w.id = target_workspace_id
      and (
        w.is_public
        or w.owner_id = auth.uid()
        or wm.user_id is not null
      )
  );
$$;

create or replace function public.can_edit_workspace(target_workspace_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.workspaces w
    left join public.workspace_members wm
      on wm.workspace_id = w.id
     and wm.user_id = auth.uid()
    where w.id = target_workspace_id
      and (
        w.owner_id = auth.uid()
        or wm.role in ('owner', 'editor')
      )
  );
$$;

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.notes enable row level security;
alter table public.tags enable row level security;
alter table public.note_tags enable row level security;
alter table public.note_links enable row level security;
alter table public.user_note_state enable row level security;
alter table public.workspace_snapshots enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (id = auth.uid());

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
to authenticated
with check (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "workspaces_select_member_or_public" on public.workspaces;
create policy "workspaces_select_member_or_public"
on public.workspaces
for select
to authenticated
using (public.can_view_workspace(id));

drop policy if exists "workspaces_insert_owner" on public.workspaces;
create policy "workspaces_insert_owner"
on public.workspaces
for insert
to authenticated
with check (owner_id = auth.uid());

drop policy if exists "workspaces_update_owner" on public.workspaces;
create policy "workspaces_update_owner"
on public.workspaces
for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "workspaces_delete_owner" on public.workspaces;
create policy "workspaces_delete_owner"
on public.workspaces
for delete
to authenticated
using (owner_id = auth.uid());

drop policy if exists "workspace_members_select_visible_workspace" on public.workspace_members;
create policy "workspace_members_select_visible_workspace"
on public.workspace_members
for select
to authenticated
using (public.can_view_workspace(workspace_id));

drop policy if exists "workspace_members_insert_owner_or_editor" on public.workspace_members;
create policy "workspace_members_insert_owner_or_editor"
on public.workspace_members
for insert
to authenticated
with check (public.can_edit_workspace(workspace_id));

drop policy if exists "workspace_members_update_owner_or_editor" on public.workspace_members;
create policy "workspace_members_update_owner_or_editor"
on public.workspace_members
for update
to authenticated
using (public.can_edit_workspace(workspace_id))
with check (public.can_edit_workspace(workspace_id));

drop policy if exists "workspace_members_delete_owner_or_editor" on public.workspace_members;
create policy "workspace_members_delete_owner_or_editor"
on public.workspace_members
for delete
to authenticated
using (public.can_edit_workspace(workspace_id));

drop policy if exists "notes_select_visible_workspace" on public.notes;
create policy "notes_select_visible_workspace"
on public.notes
for select
to authenticated
using (public.can_view_workspace(workspace_id));

drop policy if exists "notes_insert_editor" on public.notes;
create policy "notes_insert_editor"
on public.notes
for insert
to authenticated
with check (
  public.can_edit_workspace(workspace_id)
  and created_by = auth.uid()
);

drop policy if exists "notes_update_editor" on public.notes;
create policy "notes_update_editor"
on public.notes
for update
to authenticated
using (public.can_edit_workspace(workspace_id))
with check (public.can_edit_workspace(workspace_id));

drop policy if exists "notes_delete_editor" on public.notes;
create policy "notes_delete_editor"
on public.notes
for delete
to authenticated
using (public.can_edit_workspace(workspace_id));

drop policy if exists "tags_select_visible_workspace" on public.tags;
create policy "tags_select_visible_workspace"
on public.tags
for select
to authenticated
using (public.can_view_workspace(workspace_id));

drop policy if exists "tags_insert_editor" on public.tags;
create policy "tags_insert_editor"
on public.tags
for insert
to authenticated
with check (public.can_edit_workspace(workspace_id));

drop policy if exists "tags_update_editor" on public.tags;
create policy "tags_update_editor"
on public.tags
for update
to authenticated
using (public.can_edit_workspace(workspace_id))
with check (public.can_edit_workspace(workspace_id));

drop policy if exists "tags_delete_editor" on public.tags;
create policy "tags_delete_editor"
on public.tags
for delete
to authenticated
using (public.can_edit_workspace(workspace_id));

drop policy if exists "note_tags_select_visible_note" on public.note_tags;
create policy "note_tags_select_visible_note"
on public.note_tags
for select
to authenticated
using (
  exists (
    select 1
    from public.notes n
    join public.tags t
      on t.id = note_tags.tag_id
     and t.workspace_id = n.workspace_id
    where n.id = note_tags.note_id
      and public.can_view_workspace(n.workspace_id)
  )
);

drop policy if exists "note_tags_insert_editor" on public.note_tags;
create policy "note_tags_insert_editor"
on public.note_tags
for insert
to authenticated
with check (
  exists (
    select 1
    from public.notes n
    join public.tags t
      on t.id = note_tags.tag_id
     and t.workspace_id = n.workspace_id
    where n.id = note_tags.note_id
      and public.can_edit_workspace(n.workspace_id)
  )
);

drop policy if exists "note_tags_delete_editor" on public.note_tags;
create policy "note_tags_delete_editor"
on public.note_tags
for delete
to authenticated
using (
  exists (
    select 1
    from public.notes n
    join public.tags t
      on t.id = note_tags.tag_id
     and t.workspace_id = n.workspace_id
    where n.id = note_tags.note_id
      and public.can_edit_workspace(n.workspace_id)
  )
);

drop policy if exists "note_links_select_visible_workspace" on public.note_links;
create policy "note_links_select_visible_workspace"
on public.note_links
for select
to authenticated
using (public.can_view_workspace(workspace_id));

drop policy if exists "note_links_insert_editor" on public.note_links;
create policy "note_links_insert_editor"
on public.note_links
for insert
to authenticated
with check (
  public.can_edit_workspace(workspace_id)
  and exists (
    select 1
    from public.notes source_note
    left join public.notes target_note
      on target_note.id = note_links.target_note_id
    where source_note.id = note_links.source_note_id
      and source_note.workspace_id = note_links.workspace_id
      and (
        note_links.target_note_id is null
        or target_note.workspace_id = note_links.workspace_id
      )
  )
);

drop policy if exists "note_links_update_editor" on public.note_links;
create policy "note_links_update_editor"
on public.note_links
for update
to authenticated
using (public.can_edit_workspace(workspace_id))
with check (
  public.can_edit_workspace(workspace_id)
  and exists (
    select 1
    from public.notes source_note
    left join public.notes target_note
      on target_note.id = note_links.target_note_id
    where source_note.id = note_links.source_note_id
      and source_note.workspace_id = note_links.workspace_id
      and (
        note_links.target_note_id is null
        or target_note.workspace_id = note_links.workspace_id
      )
  )
);

drop policy if exists "note_links_delete_editor" on public.note_links;
create policy "note_links_delete_editor"
on public.note_links
for delete
to authenticated
using (public.can_edit_workspace(workspace_id));

drop policy if exists "user_note_state_select_own" on public.user_note_state;
create policy "user_note_state_select_own"
on public.user_note_state
for select
to authenticated
using (
  user_id = auth.uid()
  and exists (
    select 1
    from public.notes n
    where n.id = user_note_state.note_id
      and public.can_view_workspace(n.workspace_id)
  )
);

drop policy if exists "user_note_state_insert_own" on public.user_note_state;
create policy "user_note_state_insert_own"
on public.user_note_state
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.notes n
    where n.id = user_note_state.note_id
      and public.can_view_workspace(n.workspace_id)
  )
);

drop policy if exists "user_note_state_update_own" on public.user_note_state;
create policy "user_note_state_update_own"
on public.user_note_state
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "user_note_state_delete_own" on public.user_note_state;
create policy "user_note_state_delete_own"
on public.user_note_state
for delete
to authenticated
using (user_id = auth.uid());

drop policy if exists "workspace_snapshots_select_visible_workspace" on public.workspace_snapshots;
create policy "workspace_snapshots_select_visible_workspace"
on public.workspace_snapshots
for select
to authenticated
using (public.can_view_workspace(workspace_id));

drop policy if exists "workspace_snapshots_insert_editor" on public.workspace_snapshots;
create policy "workspace_snapshots_insert_editor"
on public.workspace_snapshots
for insert
to authenticated
with check (
  public.can_edit_workspace(workspace_id)
  and (created_by = auth.uid() or created_by is null)
);

drop policy if exists "workspace_snapshots_delete_editor" on public.workspace_snapshots;
create policy "workspace_snapshots_delete_editor"
on public.workspace_snapshots
for delete
to authenticated
using (public.can_edit_workspace(workspace_id));
