# Supabase pour Atlas de Connaissance

Cette structure pose une base simple, lisible et evolutive pour ton site.

## Ce que cree la migration

- `profiles` : profil lie a `auth.users`
- `workspaces` : un espace de connaissance
- `workspace_members` : les acces et roles
- `notes` : contenu partage
- `tags` et `note_tags` : filtres et classement
- `note_links` : liens wiki entre notes
- `user_note_state` : favoris et revision par utilisateur
- `workspace_snapshots` : snapshots / exports complets en `jsonb`

## Pourquoi cette separation

- `notes` garde uniquement le contenu partage
- `user_note_state` garde les donnees personnelles
- `note_links` garde la structure du graphe
- `workspace_snapshots` garde les sauvegardes sans sur-complexifier le schema

Cette separation t'evite de melanger dans la meme table :

- le contenu commun
- les preferences utilisateur
- les donnees calculees

## Ce qu'il ne faut pas stocker au debut

Ne cree pas de tables specifiques pour :

- backlinks
- suggestions de liens
- compteurs de liens
- pages orphelines
- quiz generes

Ces elements peuvent etre recalcules a partir de `notes`, `note_links` et `user_note_state`.

## Mapping depuis ton site actuel

- `title` -> `notes.title`
- `type` -> `notes.type`
- `content` -> `notes.content_md`
- `createdAt` / `updatedAt` -> `notes.created_at` / `notes.updated_at`
- `tags[]` -> `tags` + `note_tags`
- `favorite` -> `user_note_state.is_favorite`
- `review.streak` -> `user_note_state.review_streak`
- `review.lastReviewedAt` -> `user_note_state.last_reviewed_at`
- `review.nextReviewAt` -> `user_note_state.next_review_at`

## Ordre conseille pour l'integration

1. Creer le projet Supabase.
2. Appliquer cette migration.
3. Connecter l'authentification.
4. Creer un workspace par defaut pour l'utilisateur.
5. Migrer les notes locales vers `notes`, `tags`, `note_tags` et `note_links`.
6. Migrer les favoris et la revision vers `user_note_state`.
7. Garder `workspace_snapshots` pour les exports complets et les versions publiees.

## Regles a garder dans le temps

- Utiliser des migrations pour tous les changements de schema.
- Garder la RLS active sur toutes les tables exposees.
- Indexer les cles etrangeres et les filtres frequents.
- Ajouter une nouvelle table seulement si la donnee ne peut pas etre derivee proprement.
- Si une donnee appartient a l'utilisateur et pas a la note, la mettre hors de `notes`.

## Bonnes prochaines etapes

- Ajouter une table `note_revisions` si tu veux un vrai versioning par note.
- Ajouter Supabase Storage si tu veux des images ou des fichiers joints.
- Ajouter une vue `review_queue` si tu veux simplifier les requetes de revision cote front.
