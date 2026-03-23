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
- quiz generes depuis les definitions, relations, listes et liens
- sauvegarde locale automatique dans le navigateur
- import / export en JSON

## Ecrire des notes efficaces

- utilisez une page par idee
- ajoutez quelques tags pour regrouper vos themes
- formulez des relations simples comme `Concept : definition`
- reliez vos idees avec `[[Autre page]]`

## Donnees

Les donnees sont stockees dans le `localStorage` du navigateur sous la cle `atlas-connaissance-notes`.
