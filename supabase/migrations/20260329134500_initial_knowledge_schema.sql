create extension if not exists pgcrypto with schema extensions;

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

create table public.app_settings (
  id boolean primary key default true,
  site_name text not null default 'Atlas de Connaissance',
  published_url text,
  last_publish_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_settings_singleton_check check (id)
);

create table public.notes (
  id uuid primary key default extensions.gen_random_uuid(),
  slug text not null unique,
  title text not null,
  type text not null default 'concept',
  content_md text not null default '',
  summary text,
  is_favorite boolean not null default false,
  review_streak integer not null default 0,
  last_reviewed_at timestamptz,
  next_review_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint notes_type_check
    check (type in ('concept', 'hub', 'procedure', 'question')),
  constraint notes_review_streak_check
    check (review_streak >= 0)
);

create table public.tags (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  color text,
  created_at timestamptz not null default now()
);

create table public.note_tags (
  note_id uuid not null references public.notes (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (note_id, tag_id)
);

create table public.note_links (
  id uuid primary key default extensions.gen_random_uuid(),
  source_note_id uuid not null references public.notes (id) on delete cascade,
  target_note_id uuid references public.notes (id) on delete set null,
  target_title_raw text,
  created_at timestamptz not null default now(),
  constraint note_links_target_check
    check (target_note_id is not null or target_title_raw is not null)
);

create table public.snapshots (
  id uuid primary key default extensions.gen_random_uuid(),
  label text not null,
  kind public.snapshot_kind not null default 'manual',
  payload jsonb not null,
  created_at timestamptz not null default now()
);

comment on table public.app_settings is 'Configuration globale du site en mode mono-utilisateur.';
comment on table public.notes is 'Table principale des pages de connaissance.';
comment on column public.note_links.target_title_raw is 'Titre cible conserve quand le lien pointe vers une page pas encore creee.';
comment on table public.snapshots is 'Snapshots complets ou exports publies au format JSONB.';

insert into public.app_settings (id)
values (true)
on conflict (id) do nothing;

create index notes_updated_at_idx on public.notes (updated_at desc);
create index notes_next_review_at_idx on public.notes (next_review_at);
create index notes_type_idx on public.notes (type);
create index notes_is_favorite_idx on public.notes (is_favorite);
create index note_tags_tag_id_idx on public.note_tags (tag_id);
create index note_links_source_note_id_idx on public.note_links (source_note_id);
create index note_links_target_note_id_idx on public.note_links (target_note_id);
create index snapshots_created_at_idx on public.snapshots (created_at desc);

create trigger app_settings_set_updated_at
before update on public.app_settings
for each row
execute function public.handle_updated_at();

create trigger notes_set_updated_at
before update on public.notes
for each row
execute function public.handle_updated_at();
