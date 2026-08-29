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
- `scripts/sport.js`
  Journal d entrainement : seances, modeles de seance, suivi de masse. Sorti
  de events.js et renderers.js ou il pesait 900 lignes. C etait le seul
  ensemble reellement detachable de ces deux fichiers : il ne parlait au reste
  du code qu a travers `context`. Voir la section Journal de sport plus bas.
- `scripts/auth.js`
  Session Supabase : connexion, jeton conserve, rafraichissement automatique.
  Sans session ouverte, l application reste en mode local et n ecrit rien a distance.
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
  Base visuelle et responsive. Six feuilles chargees en parallele, dans l ordre
  tokens, base, layout, components, features, themes. Chaque couche affine la
  precedente : c est voulu, pas un accident.
- `tests/index.html`
  44 tests a ouvrir dans un navigateur, sans dependance ni etape de build.
  Servir en HTTP, sinon cinq tests sont ignores. Voir le README.
- `scripts/version.sh`
  Avance d un cran les vingt-et-une references `?v=` de index.html et le
  `CACHE_NAME` du service worker, ensemble. A lancer avant chaque publication,
  sinon le navigateur sert un melange d anciens et de nouveaux fichiers. Un
  test verifie la coherence.

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

La saisie se fait aussi en chiffres seuls, sans separateur : le pave numerique
du telephone n en propose aucun. Huit chiffres donnent un jour (`14071789`),
six un mois (`071789`), quatre une annee (`1789`). La virgule vaut separateur,
c est la seule touche qu offre le clavier decimal francais.

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

Important : les questions ne sont PAS deduites du contenu. Une page n est
interrogee que si elle possede un tableau `quizQuestions` non vide, saisi a la
main ou genere par Gemini. Une page sans question est invisible pour le quiz,
quel que soit son contenu.

Repondre fait avancer la repetition espacee : `updateReviewState()` met a jour
`review.streak` et `review.nextReviewAt` selon `reviewIntervalsInHours`. Une
page est acquise pour la session si toutes ses questions tirees sont justes.

Scopes actuels :

- toutes les pages
- page active
- dossier
- tag
- pages a revoir

Le scope `dossier` inclut le dossier et toutes ses descendances.

## Journal de sport

Deux tableaux, choisis par le selecteur Seance / Masse.

Le tableau de seance stocke une ligne par exercice dans
`settings.sport.performanceEntries` : `date`, `exercise`, `sets`, `reps`,
`weight`, `rest`, `comment`. Le tableau est trie pour de vrai, de la seance la
plus recente a la plus ancienne, et non a l affichage seulement : partout
ailleurs une ligne est designee par son rang dans le tableau, et deux ordres
differents feraient porter le menu contextuel, la suppression et la navigation
clavier sur la mauvaise ligne. Une ligne encore sans date reste en tete.

Les lignes de meme date forment une seance, annoncee par une ligne d en-tete
repliable qui porte la date lisible, le nombre d exercices et le tonnage. Par
defaut seule la seance la plus recente est ouverte ; ce repli vit en memoire,
pas dans les reglages, car il depend de l ecran du moment. Les lignes n ont
plus de cellule de date : la date appartient a l en-tete, et la changer
deplace toute la seance.

`settings.sport.sessionTemplates` garde les modeles : `{ id, name, exercises }`
ou chaque exercice a la meme forme qu une ligne, sans date. Ajouter un modele
depose ses exercices dans la seance du jour. Un modele se cree de deux facons :
vide depuis le panneau Modeles, ou a partir d une seance deja saisie par
l etoile de son en-tete.

Le tableau de masse, lui, est trie a l affichage et conserve le rang d origine
de chaque ligne. Sa date passe par le selecteur natif du navigateur.

## Mobile

Points UX specifiques deja en place :

- barre principale fixe en bas
- sidebar gauche ouvrable en bouton et en swipe gauche -> droite
- note rapide flottante
- pendant l edition, le bouton flottant devient un raccourci `Enregistrer`
- graphe deplacable au doigt

## Graphe

L espace de mise en page epouse la zone affichee sur grand ecran, ce qui donne
aux noeuds la place de s ecarter. Sur ecran etroit il garde 960 px de large
ramenes a l echelle, sinon les noeuds se chevauchent tous.

Les positions sont conservees dans `localStorage`, une disposition par format
d affichage, chacune avec les dimensions qui l ont produite. Le reglage complet
n a donc lieu qu une fois au lieu de chaque rechargement. Ajouter une page ne
deplace aucun noeud existant : la nouvelle se place au barycentre de ses voisins.

Le volet Bibliotheque s efface sur cet onglet en grand ecran. Le graphe sert a
observer les liens, pas a ouvrir les pages : cliquer un noeud estompe le reste
et fait ressortir la page et ses voisins.

## Points a surveiller pour les prochaines iterations

- `normalizeTag` fabrique des mots inexistants sur les pluriels en -aux
  (`chevaux` donne `chevau`). Ecarte volontairement : la completion propose
  deja les tags existants pendant la saisie, ce qui empeche les doublons en
  amont, et corriger le normaliseur separerait les tags deja enregistres de
  ceux a venir. Un test epingle le comportement actuel pour qu il ne change
  pas par accident.
- Les questions de quiz restent entierement manuelles ou generees par Gemini.
  Des generateurs deduits du contenu (dates, liens, termes en gras) rendraient
  le quiz utilisable sur tout le corpus.
- `prune_snapshot_history(max_snapshots)` declarait un parametre que sa
  version active n utilisait nulle part, les limites etant ecrites en dur,
  30 snapshots quotidiens et 20 d action. Ses trois appelants passaient un
  chiffre sans effet, dont deux passaient `5`. Corrige par la migration
  `20260829120000_drop_prune_snapshot_history_parameter.sql`, a appliquer.
  Attention en relisant l ancien code : `sync_app_payload_legacy_v59` n est
  pas morte malgre son nom et ses droits revoques. `sync_app_payload`, la
  seule fonction que l application appelle, se termine par
  `return public.sync_app_payload_legacy_v59(safe_payload)`, et le `revoke`
  ne bloque pas cet appel interne puisque l appelante est `security definer`.
- Trois migrations Supabase attendent d etre appliquees a la main dans
  l editeur SQL, dans cet ordre :
  `20260820090000_close_public_execute_grants.sql`,
  `20260820100000_protect_snapshot_payload.sql` et
  `20260829120000_drop_prune_snapshot_history_parameter.sql`. Verifier dans la
  base avant de conclure, le depot ne sait pas ce qui y a ete passe.
- `events.js` et `renderers.js` restent volumineux, mais pas pour la meme
  raison, et la mesure separe nettement les deux cas.

  `renderers.js` : 69 fonctions, 117 appels internes, et 65 de ces fonctions
  forment un seul bloc connexe. Le couper demanderait de faire passer les
  appels par un objet exporte, fonction par fonction.

  `events.js` : 92 fonctions, 101 appels internes, mais repartis en 26 groupes
  qui ne s appellent pas entre eux. Deux sont detachables comme l etait le
  sport, sans etat de module partage avec le reste : le tirer-pour-rafraichir
  du fil (16 fonctions, seule variable propre `feedPull`) et la redaction des
  questions de quiz (9 fonctions, aucune variable de module). Verifier ce
  partage avant de sortir quoi que ce soit : c est la seule chose qui rendait
  le bloc sport extractible.

## Regle de prudence

Ne pas modifier brutalement la politique de snapshots ou la sync distante sans
validation explicite, car ces deux zones touchent a la securite des donnees.

Verifier quelle version d une fonction SQL est active avant d en tirer une
conclusion : seize migrations se redefinissent les unes les autres, et lire une
definition au hasard induit en erreur. Prendre la derniere par ordre de nom de
fichier, ou interroger la base.

Ne pas conclure d une recherche vide qu il n y a rien : verifier d abord que la
recherche portait sur la bonne chose.

Certaines pannes ne se voient que dans le navigateur. Un bouton peut rester en
place et ne plus rien faire : c est arrive au bouton d ajout de ligne du sport,
debranche en sortant sport.js de events.js, et rien dans le code ne le
signalait. Deux tests encadrent maintenant ce risque, l un verifie qu aucun
selecteur de dom.js ne vise un element disparu, l autre qu aucun n est laisse
sans lecteur.

L application exige une session ouverte : sans elle, seule la page de connexion
s affiche et le tableau de sport n existe pas dans le DOM. Pour verifier une
modification d interface sans pouvoir se connecter, monter une page d essai qui
charge les vrais scripts et les vraies feuilles de style avec le balisage
extrait de index.html.
