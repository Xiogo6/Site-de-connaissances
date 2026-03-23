# Atlas de Connaissance

Site statique pour organiser vos connaissances en reseau, visualiser les liens entre les pages et generer des quiz a partir de vos notes.

## Ouvrir le site

Ouvrez simplement `index.html` dans votre navigateur.

## Fonctionnalites

- pages de connaissance avec edition directe
- liens wiki via `[[Nom de page]]`
- creation automatique d'une page si vous cliquez sur un lien inexistant
- backlinks et suggestions de liens
- graphe visuel de toutes les connexions
- filtres par type, tag et favoris
- file de revision avec pages a revoir
- types de page (concept, hub, procedure, question)
- mode publie via `knowledge-base.json`
- quiz generes depuis les definitions, relations, listes et liens
- sauvegarde locale automatique dans le navigateur
- import / export en JSON
- base PWA pour une installation sur telephone une fois le site heberge

## Ecrire des notes efficaces

- utilisez une page par idee
- ajoutez quelques tags pour regrouper vos themes
- formulez des relations simples comme `Concept : definition`
- reliez vos idees avec `[[Autre page]]`

## Version en ligne

- le site peut charger un snapshot publie depuis `knowledge-base.json`
- le bouton d'export genere justement ce fichier
- une fois heberge, ouvrez `?source=published` pour forcer le chargement du snapshot publie

## Limite actuelle

La version actuelle est excellente pour un usage local et pour une consultation mobile publiee, mais elle ne synchronise pas encore automatiquement les modifications entre ordinateur et telephone. Pour une vraie synchro en temps reel, il faudra ajouter un backend ou une base distante.

## Donnees

Les donnees sont stockees dans le `localStorage` du navigateur sous la cle `atlas-connaissance-notes`.
