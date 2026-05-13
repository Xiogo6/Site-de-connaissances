# Atlas de Connaissance - Contexte de Reprise

## But du site

Application web statique de gestion de connaissances personnelles, pensée pour :

- ecrire des pages reliees par liens wiki `[[...]]`
- organiser les pages en dossiers et sous-dossiers
- visualiser le reseau dans un graphe
- generer des quiz simples
- rester utilisable sur mobile et desktop

## Architecture rapide

- `index.html`
  Structure globale de l interface.
- `app.js`
  Initialisation de l etat global.
- `scripts/config.js`
  Types de pages, templates par defaut, constantes.
- `scripts/dom.js`
  Tous les selecteurs DOM centralises.
- `scripts/helpers.js`
  Utilitaires texte, tags, rendu markdown simple, dates flexibles.
- `scripts/data.js`
  Chargement/sauvegarde locale, snapshots, sync Supabase.
- `scripts/notes.js`
  Logique des pages, dossiers, edition, liens hierarchiques.
- `scripts/renderers.js`
  Rendu global de l interface.
- `scripts/events.js`
  Bindings UI, mobile, menus, swipe, recherche.
- `scripts/graph.js`
  Graphe, zoom, drag de noeuds, pan tactile.
- `scripts/quiz.js`
  Quiz.
- `styles/*.css`
  Base visuelle et responsive.

## Conventions fonctionnelles importantes

- Le mode normal d une page est la lecture.
- `Editer` ouvre le panneau d edition.
- `Enregistrer` ou `Annuler` quittent l edition et reviennent en lecture.
- Une nouvelle page ou un nouveau dossier sont des brouillons temporaires tant qu ils ne sont pas enregistres.
- Les dossiers sont des pages normales de type `folder`.
- Deplacer une page dans un dossier cree aussi des liens hierarchiques dans le contenu.
- Les templates sont appliques automatiquement sur une page encore vierge ou encore basee sur son modele.
- Le champ `Titre` reste lie au premier `# Titre` du contenu quand ce premier titre existe.

## Types de pages disponibles

- `concept`
- `definition`
- `person`
- `event`
- `experience`
- `folder`
- `hub`
- `procedure`
- `question`

## Dates

Le systeme de date est volontairement flexible.

Formats acceptes :

- `900`
- `1453-05`
- `1789-07-14`

Modes disponibles :

- `reference`
- `life`
- `range`

Les quiz exploitent ces dates flexibles sans obliger un jour exact.

## Tags

Les tags sont normalises pour limiter les doublons courants :

- minuscules
- accents retires
- pluriels simples reduits quand c est raisonnable

Exemples attendus :

- `Sport` -> `sport`
- `sports` -> `sport`
- `drapeaux` -> `drapeau`

Des suggestions apparaissent pendant la saisie dans l editeur principal et dans la note rapide.

## Quiz

Le quiz fonctionne en rappel actif, sans propositions visibles.

Scopes actuels :

- toutes les pages
- page active
- dossier
- tag
- pages a revoir

Le scope `dossier` inclut le dossier et toutes ses descendances.

## Mobile

Points UX specifiques deja en place :

- barre principale fixe en bas
- sidebar gauche ouvrable en bouton et en swipe gauche -> droite
- note rapide flottante
- pendant l edition, le bouton flottant devient un raccourci `Enregistrer`
- graphe deplacable au doigt

## Points a surveiller pour les prochaines iterations

- politique de retention des snapshots
- meilleure logique de fusion des tags proches mais non triviaux
- zoom/pan du graphe encore perfectible si le reseau grossit beaucoup
- focus automatique de la recherche selon les contraintes iPhone/Safari

## Regle de prudence

Ne pas modifier brutalement la politique de snapshots ou la sync distante sans validation explicite, car ces deux zones touchent a la securite des donnees.
