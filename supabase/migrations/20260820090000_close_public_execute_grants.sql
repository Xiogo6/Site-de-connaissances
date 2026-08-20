-- C-06 : fermer les fonctions restees accessibles via le role PUBLIC.
--
-- PostgreSQL accorde EXECUTE a PUBLIC par defaut sur toute fonction creee.
-- Les migrations precedentes le savaient et faisaient toujours
--   revoke all on function ... from public;
-- avant d'accorder les droits. Trois fonctions ont echappe a cette regle :
--
--   get_note_deletions()             jamais revoquee de PUBLIC
--   prune_snapshot_history(integer)  jamais revoquee de PUBLIC
--   create_daily_snapshot()          jamais revoquee de PUBLIC
--
-- La migration 20260819122000 les revoquait de "anon", ce qui ne sert a rien :
-- anon conserve le droit herite de PUBLIC. Verifie par sondage : avec la seule
-- cle publiable, get_app_payload repond 401 mais get_note_deletions repond 200.
--
-- Le cas grave est prune_snapshot_history : appelee avec 0, elle supprime la
-- totalite de la table snapshots. La cle publiable etant lisible dans le depot
-- public, n'importe qui pouvait effacer tout l'historique de sauvegardes.
--
-- On applique ici le motif correct : revoquer de PUBLIC et de anon, puis
-- accorder au seul role authenticated.

revoke all on function public.get_note_deletions() from public, anon;
revoke all on function public.prune_snapshot_history(integer) from public, anon;
revoke all on function public.create_daily_snapshot() from public, anon;

grant execute on function public.get_note_deletions() to authenticated;
grant execute on function public.prune_snapshot_history(integer) to authenticated;
grant execute on function public.create_daily_snapshot() to authenticated;

-- Ceinture et bretelles : on repasse sur toutes les fonctions exposees, au cas
-- ou l'une d'elles aurait conserve un droit PUBLIC herite d'une version
-- anterieure. Ces instructions sont sans effet si le droit n'existe pas.
revoke all on function public.get_app_payload() from public, anon;
revoke all on function public.get_snapshot(text) from public, anon;
revoke all on function public.sync_app_payload(jsonb) from public, anon;
revoke all on function public.sync_client_settings(jsonb) from public, anon;
revoke all on function public.register_note_deletions(jsonb) from public, anon;
revoke all on function public.restore_deleted_notes(jsonb) from public, anon;

grant execute on function public.get_app_payload() to authenticated;
grant execute on function public.get_snapshot(text) to authenticated;
grant execute on function public.sync_app_payload(jsonb) to authenticated;
grant execute on function public.sync_client_settings(jsonb) to authenticated;
grant execute on function public.register_note_deletions(jsonb) to authenticated;
grant execute on function public.restore_deleted_notes(jsonb) to authenticated;

-- La fonction interne ne doit etre appelable par personne : seul
-- sync_app_payload l'invoque, et il est security definer.
revoke all on function public.get_app_payload_full() from public, anon, authenticated;
revoke all on function public.sync_app_payload_legacy_v59(jsonb) from public, anon, authenticated;
