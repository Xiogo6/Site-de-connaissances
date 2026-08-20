-- Empecher qu'un snapshot soit vide de son contenu par une mise a jour.
--
-- Il existe deja protect_recent_snapshot_history (19 juillet), qui interdit la
-- SUPPRESSION des 30 snapshots les plus recents. Mais il ne dit rien du
-- CONTENU : une ligne peut survivre en perdant ses notes.
--
-- Le scenario est reel. sync_app_payload fusionne les snapshots du client et
-- du serveur, et privilegie le client a egalite de date. Un client qui envoie
-- un snapshot avec "notes": [] ecrase donc le contenu conserve en base, sans
-- rien supprimer. C'est ce qui serait arrive entre l'allegement du payload
-- (20260819121000) et le deploiement du client correspondant.
--
-- Le client filtre desormais les snapshots dont il ne detient pas les notes,
-- mais cette garantie vit dans le navigateur. Celle-ci vit dans la base.
--
-- Choix de comportement : on repare en silence plutot que de lever une erreur.
-- Refuser la mise a jour ferait echouer toute la synchronisation ; ici on
-- conserve simplement l'ancien contenu et le reste de l'ecriture passe. C'est
-- le meme parti pris que protect_recent_snapshot_history, qui annule la
-- suppression sans interrompre l'appelant.

create or replace function public.protect_snapshot_payload()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  notes_avant integer;
  notes_apres integer;
begin
  notes_avant := case
    when jsonb_typeof(old.payload -> 'notes') = 'array'
      then jsonb_array_length(old.payload -> 'notes')
    else 0
  end;

  notes_apres := case
    when jsonb_typeof(new.payload -> 'notes') = 'array'
      then jsonb_array_length(new.payload -> 'notes')
    else 0
  end;

  -- Un snapshot qui avait du contenu ne doit jamais se retrouver vide.
  if notes_avant > 0 and notes_apres = 0 then
    new.payload := old.payload;
    new.note_count := old.note_count;
  end if;

  return new;
end;
$$;

drop trigger if exists protect_snapshot_payload_trigger on public.snapshots;

create trigger protect_snapshot_payload_trigger
before update on public.snapshots
for each row
execute function public.protect_snapshot_payload();
