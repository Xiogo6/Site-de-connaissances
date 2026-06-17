# Atlas de Connaissance

Site statique pour organiser vos connaissances en reseau, visualiser les liens entre les pages et generer des quiz simples a partir de vos notes.

## Structure du projet

Le projet a ete reorganise pour separer les responsabilites sans ajouter de build step.

- `index.html` : structure de la page et points d'ancrage du DOM
- `app.js` : point d'entree tres court qui assemble les modules
- `scripts/config.js` : donnees par defaut et constantes globales
- `scripts/dom.js` : centralisation des selecteurs DOM
- `scripts/helpers.js` : helpers purs reutilisables
- `scripts/data.js` : persistance locale, snapshots, publication, templates
- `scripts/notes.js` : logique metier autour des notes, de l'organisation et de la note rapide
- `scripts/renderers.js` : rendu de l'interface hors graphe et quiz
- `scripts/graph.js` : modele et rendu du graphe
- `scripts/quiz.js` : generation et rendu des quiz
- `scripts/events.js` : branchement des interactions utilisateur
- `styles/` : styles separes par couches (`tokens`, `base`, `layout`, `components`, `features`)

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
- snapshots locaux de secours
- centre de publication GitHub Pages
- note rapide pour mobile
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

## Workflow V3

1. travaillez dans l'espace local editable
2. capturez rapidement une idee si besoin
3. enregistrez un snapshot local avant une grosse modification
4. quand vous etes satisfait, telechargez `knowledge-base.json` depuis l'onglet `Publication`
5. remplacez le fichier du depot GitHub par ce nouveau snapshot
6. poussez sur GitHub Pages
7. consultez la version en ligne avec `?source=published`

## Modes

- `espace local editable` : vos changements sont stockes sur l'appareil courant
- `snapshot publie` : lecture seule de la version poussee sur GitHub Pages
- `note rapide` : creation ultra rapide d'une note depuis mobile ou desktop

## Limite actuelle

La version actuelle est excellente pour un usage local et pour une consultation mobile publiee, mais elle ne synchronise pas encore automatiquement les modifications entre ordinateur et telephone. Pour une vraie synchro en temps reel, il faudra ajouter un backend ou une base distante.

## IA personnelle avec Gemini

- une cle Gemini peut etre enregistree localement dans l'onglet `Parametres`
- la cle reste sur l'appareil courant et n'est pas envoyee dans la sync Supabase
- le bouton `Gemini: re-ecrire la note` ne fait que la relecture
- le bouton `Gemini: generer les questions` lance la fabrication des quiz de facon separée
- le bouton `Annuler la re-ecriture` permet de revenir en arriere si le resultat ne convient pas
- cette voie est pratique pour un usage perso sur telephone sans maintenir de backend

## Donnees

Les donnees sont stockees dans le `localStorage` du navigateur sous la cle `atlas-connaissance-notes`.
