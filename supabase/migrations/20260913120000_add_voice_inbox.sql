-- Boite de reception des dictees vocales.
--
-- La page de dictee (voice.html) transcrit l'audio sur l'appareil, puis depose
-- ICI le texte obtenu. Atlas lit cette table a son demarrage, cree les pages,
-- et supprime les lignes traitees. La table est donc une file d'attente, pas
-- une archive : elle est vide la plupart du temps.
--
-- Pourquoi une table neuve et isolee plutot que la synchronisation existante :
-- sync_app_payload ecrase l'etat complet de l'espace de travail. Un appel
-- partiel, depuis une page qui ne connait qu'une dictee et rien du reste,
-- viderait la base. Rien dans ce fichier ne touche a une table ou une fonction
-- deja en place.
--
-- L'audio, lui, ne quitte jamais l'appareil : seul le texte transite. C'est ce
-- qui evite Supabase Storage, ses buckets et ses politiques d'acces.
--
-- Forme attendue de payload, contrat entre les deux pages :
--
--   {
--     "clientKey":  "uuid, le meme que la colonne client_key",
--     "capturedAt": "2026-09-13T08:14:22.000Z",
--     "durationMs": 13400,
--     "mimeType":   "audio/mp4",
--     "model":      "le modele Gemini qui a transcrit",
--     "transcript": "le texte brut dicte",
--     "structured": { "title": "...", "type": "concept", "tags": [], "content": "..." }
--   }
--
-- Le jsonb laisse ce contrat evoluer sans nouvelle migration : une dictee
-- deposee par une ancienne version de la page restera lisible.

create table public.voice_inbox (
  id uuid primary key default extensions.gen_random_uuid(),
  created_at timestamptz not null default now(),
  payload jsonb not null,
  -- Identifiant genere par l'appareil au moment de la capture, et conserve
  -- jusqu'ici. L'unicite est ce qui rend la file idempotente : si l'insert
  -- reussit mais que la suppression locale echoue, la tentative suivante est
  -- rejetee au lieu de creer un doublon. Cote client, ce rejet vaut donc
  -- confirmation que la ligne est bien arrivee, et non echec.
  client_key text not null unique,
  constraint voice_inbox_payload_is_object
    check (jsonb_typeof(payload) = 'object'),
  constraint voice_inbox_client_key_length
    check (char_length(client_key) between 8 and 200)
);

comment on table public.voice_inbox is
  'File des dictees transcrites, en attente d''ingestion par Atlas. Videe au fur et a mesure.';
comment on column public.voice_inbox.client_key is
  'Identifiant de capture, unique : rend les reprises sans doublon.';

alter table public.voice_inbox enable row level security;

-- Coherent avec 20260819122000_require_authenticated_access.sql et
-- 20260820090000_close_public_execute_grants.sql : la cle publiable est
-- lisible dans un depot public, elle ne doit rien autoriser seule. Seule une
-- session ouverte donne acces.
create policy voice_inbox_insert_authenticated
  on public.voice_inbox
  for insert
  to authenticated
  with check (true);

create policy voice_inbox_select_authenticated
  on public.voice_inbox
  for select
  to authenticated
  using (true);

create policy voice_inbox_delete_authenticated
  on public.voice_inbox
  for delete
  to authenticated
  using (true);

-- Aucune politique UPDATE, volontairement : une ligne de file n'a aucune raison
-- d'etre modifiee. Elle est creee, lue, puis supprimee. Sans politique, toute
-- tentative de modification est refusee, y compris par erreur de programmation.

-- Supabase accorde par defaut des droits aux roles anon et authenticated sur
-- les nouvelles tables du schema public. On reprend explicitement la main :
-- RLS sans droit de table ne suffirait pas a rassurer, et un droit de table
-- sans RLS ne protegerait rien.
revoke all on table public.voice_inbox from anon;
grant select, insert, delete on table public.voice_inbox to authenticated;

-- ---------------------------------------------------------------------------
-- Retour arriere
-- ---------------------------------------------------------------------------
-- Rien d'autre ne depend de cette table : la supprimer ramene la base a son
-- etat d'avant, sans effet sur les pages ni sur les snapshots.
--
--   drop policy if exists voice_inbox_delete_authenticated on public.voice_inbox;
--   drop policy if exists voice_inbox_select_authenticated on public.voice_inbox;
--   drop policy if exists voice_inbox_insert_authenticated on public.voice_inbox;
--   drop table if exists public.voice_inbox;
--
-- Les dictees non encore ingerees seraient perdues cote base, mais l'audio
-- reste sur l'appareil tant qu'Atlas n'a pas confirme l'ingestion.
