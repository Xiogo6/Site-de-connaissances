-- C-01 : fermer l'acces anonyme a l'espace de connaissance.
--
-- Le depot est public : scripts/config.js, et donc la cle publiable, sont
-- lisibles par tout le monde. Tant que les fonctions ci-dessous etaient
-- accordees au role "anon", cette cle suffisait a telecharger l'integralite
-- des pages et a les remplacer.
--
-- A partir d'ici, seul un utilisateur authentifie peut les appeler.
--
-- ---------------------------------------------------------------------------
-- A APPLIQUER EN DERNIER, ET DANS CET ORDRE
-- ---------------------------------------------------------------------------
--   1. Creer le compte proprietaire dans le tableau de bord Supabase
--      (Authentication > Users > Add user), avec email et mot de passe.
--
--   2. OBLIGATOIRE : desactiver l'inscription publique dans
--      Authentication > Sign In / Providers > "Allow new users to sign up".
--      Sans cela, n'importe qui peut creer un compte avec la cle publiable,
--      devenir "authenticated", et cette migration n'aura servi a rien.
--
--   3. Verifier que la connexion fonctionne dans l'application, en local,
--      avant d'appliquer ce fichier. Une fois applique, une application qui
--      n'a pas de session valable ne lit plus rien.
--
--   4. Regenerer la cle publiable dans Supabase apres coup : l'actuelle
--      restera dans l'historique Git pour toujours.
-- ---------------------------------------------------------------------------

revoke execute on function public.get_app_payload() from anon;
revoke execute on function public.get_snapshot(text) from anon;
revoke execute on function public.sync_app_payload(jsonb) from anon;
revoke execute on function public.sync_client_settings(jsonb) from anon;
revoke execute on function public.register_note_deletions(jsonb) from anon;
revoke execute on function public.restore_deleted_notes(jsonb) from anon;
revoke execute on function public.get_note_deletions() from anon;
revoke execute on function public.prune_snapshot_history(integer) from anon;
revoke execute on function public.create_daily_snapshot() from anon;

grant execute on function public.get_app_payload() to authenticated;
grant execute on function public.get_snapshot(text) to authenticated;
grant execute on function public.sync_app_payload(jsonb) to authenticated;
grant execute on function public.sync_client_settings(jsonb) to authenticated;
grant execute on function public.register_note_deletions(jsonb) to authenticated;
grant execute on function public.restore_deleted_notes(jsonb) to authenticated;
grant execute on function public.get_note_deletions() to authenticated;
grant execute on function public.prune_snapshot_history(integer) to authenticated;
grant execute on function public.create_daily_snapshot() to authenticated;
