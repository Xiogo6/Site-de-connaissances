# Supabase pour Atlas de Connaissance

Cette version est simplifiee pour un usage solo.

## Ce que cree la migration

- `app_settings` : configuration globale du site
- `notes` : toutes les pages de connaissance
- `tags` et `note_tags` : les filtres et classements
- `note_links` : les liens wiki entre notes
- `snapshots` : snapshots / exports complets en `jsonb`

## Pourquoi ce schema

Tu m'as precise qu'il n'y a pas besoin de gerer plusieurs utilisateurs.

Du coup :

- pas de `profiles`
- pas de `workspace`
- pas de `workspace_members`
- pas de table d'etat utilisateur separee

Les champs `is_favorite`, `review_streak`, `last_reviewed_at` et `next_review_at` restent directement dans `notes`, car ils representent ton propre usage unique du site.

## Ce qu'il ne faut pas stocker au debut

Ne cree pas de tables specifiques pour :

- backlinks
- suggestions de liens
- compteurs de liens
- pages orphelines
- quiz generes

Ces elements peuvent etre recalcules a partir de `notes` et `note_links`.

## Mapping depuis ton site actuel

- `settings.publishedUrl` -> `app_settings.published_url`
- `settings.lastPublishAt` -> `app_settings.last_publish_at`
- `title` -> `notes.title`
- `type` -> `notes.type`
- `content` -> `notes.content_md`
- `metadata.hasDate/dateMode/singleDate/startDate/endDate` -> `notes.metadata`
- `favorite` -> `notes.is_favorite`
- `review.streak` -> `notes.review_streak`
- `review.lastReviewedAt` -> `notes.last_reviewed_at`
- `review.nextReviewAt` -> `notes.next_review_at`
- `createdAt` / `updatedAt` -> `notes.created_at` / `notes.updated_at`
- `tags[]` -> `tags` + `note_tags`

## Ordre conseille pour l'integration

1. Lier le projet Supabase.
2. Appliquer cette migration.
3. Generer un `seed.sql` depuis `knowledge-base.json`.
4. Executer `seed.sql` pour remplir `notes`, `tags`, `note_tags` et `note_links`.
5. Migrer les snapshots locaux vers `snapshots` si tu veux les conserver en base.
6. Brancher le front sur Supabase.

## Generer le seed SQL

Le script [generate-seed-from-knowledge.mjs](C:/Users/kevin/OneDrive/Bureau/Site%20de%20connaissance/supabase/scripts/generate-seed-from-knowledge.mjs) lit `knowledge-base.json` et produit [seed.sql](C:/Users/kevin/OneDrive/Bureau/Site%20de%20connaissance/supabase/seed.sql).

Commande :

```powershell
node .\supabase\scripts\generate-seed-from-knowledge.mjs
```

Le fichier genere :

- upsert les `notes`
- conserve `notes.metadata` pour les dates de contenu
- upsert les `tags`
- reconstruit `note_tags`
- reconstruit `note_links`

## Regles a garder dans le temps

- Utiliser des migrations pour les changements de schema.
- Ajouter une nouvelle table seulement si la donnee n'est pas derivable proprement.
- Garder `notes` comme table centrale.
- Utiliser `note_links` pour le graphe plutot que recalculer les relations a chaque fois si tu veux gagner en vitesse.

## Point important sur la securite

Si ton site front appelle Supabase directement depuis le navigateur et qu'il n'y a aucune authentification, la base ne sera pas vraiment protegee contre des acces externes.

Pour un site strictement personnel, il y a deux options propres :

- soit tu gardes un acces ecriture seulement via un script local / une fonction serveur
- soit tu ajoutes plus tard une authentification minimale juste pour toi

## Bonnes prochaines etapes

- Ajouter une table `note_revisions` si tu veux un vrai versioning par note.
- Ajouter Supabase Storage si tu veux gerer des images ou fichiers joints.
- Ajouter un script d'import pour convertir automatiquement `knowledge-base.json`.
