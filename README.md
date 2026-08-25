# Atlas de Connaissance

Site statique pour organiser vos connaissances en reseau, visualiser les liens entre les pages et generer des quiz simples a partir de vos notes.

## Structure du projet

Le projet a ete reorganise pour separer les responsabilites sans ajouter de build step.

- `index.html` : structure de la page et points d'ancrage du DOM
- `app.js` : point d'entree tres court qui assemble les modules
- `scripts/config.js` : donnees par defaut et constantes globales
- `scripts/dom.js` : centralisation des selecteurs DOM
- `scripts/helpers.js` : helpers purs reutilisables
- `scripts/auth.js` : session Supabase, connexion, rafraichissement du jeton
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
- graphe visuel de toutes les connexions, dont la disposition est conservee
  d une session a l autre et ne se reorganise pas quand vous ajoutez une page
- filtres par type, tag et favoris
- repetition espacee : repondre juste a un quiz repousse la page, se tromper
  la ramene tout de suite. Les dossiers ne sont pas comptes comme a reviser
- dix types de page : concept, definition, personne, evenement, experience,
  daily, dossier, hub, procedure, question, plus vos types personnalises
- mode publie via `knowledge-base.json`
- quiz en rappel actif, a partir des questions saisies sur chaque page
  (a la main ou generees par Gemini : une page sans question n'est pas interrogee)
- sauvegarde locale automatique dans le navigateur
- snapshots de secours (les 3 plus recents en local, les autres a la demande)
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

## Workflow

Supabase fait autorite : il n y a plus de publication manuelle a faire pour
travailler.

1. connectez-vous une fois sur l appareil
2. ecrivez ; chaque enregistrement part vers Supabase
3. le meme espace vous suit sur vos autres appareils

Le mode `?source=published` reste disponible, mais il ne sert plus qu a exposer
une version figee en lecture seule. Il faut alors telecharger
`knowledge-base.json` depuis l onglet `Publication`, remplacer le fichier du
depot et pousser. Ce n est necessaire que si vous voulez montrer un instantane
public de vos pages, ce qui, le depot etant public, est a peser.

## Modes

- `espace local editable` : vos changements sont stockes sur l'appareil courant
- `snapshot publie` : lecture seule de la version poussee sur GitHub Pages
- `note rapide` : creation ultra rapide d'une note depuis mobile ou desktop

## Connexion

Le depot est public : la cle Supabase presente dans `scripts/config.js` est lisible
par tout le monde. L'acces a l'espace de travail passe donc par une session.

- on saisit son mot de passe **une seule fois par appareil**
- le jeton est ensuite conserve et renouvele automatiquement
- l'application s'ouvre directement aux lancements suivants
- sans session, elle reste en mode local et ne lit ni n'ecrit rien a distance
- `Parametres` > `Session Supabase` permet de se deconnecter

Pour mettre cela en place la premiere fois :

1. creer le compte proprietaire dans Supabase (`Authentication` > `Users`)
2. **desactiver l'inscription publique** (`Authentication` > `Sign In / Providers`),
   sinon n'importe qui peut se creer un compte et l'acces reste ouvert
3. verifier que la connexion fonctionne
4. appliquer `20260819122000_require_authenticated_access.sql`
5. regenerer la cle publiable dans Supabase

## Synchronisation

Supabase fait autorite : au demarrage l'espace de travail est charge depuis la base,
puis chaque enregistrement y est renvoye. Le `localStorage` sert de cache de travail
et de secours hors ligne.

## IA personnelle avec Gemini

- une cle Gemini peut etre enregistree localement dans l'onglet `Parametres`
- la cle reste sur l'appareil courant et n'est pas envoyee dans la sync Supabase
- la cle est enregistree automatiquement pendant la saisie pour etre reutilisable au prochain chargement
- le bouton `Reformuler` ne fait que la relecture
- le bouton `Creer les questions` lance la fabrication des quiz de facon separée
- le bouton `Annuler reformulation` permet de revenir en arriere si le resultat ne convient pas
- cette voie est pratique pour un usage perso sur telephone sans maintenir de backend

## Donnees

Les donnees sont stockees dans le `localStorage` du navigateur sous la cle `atlas-connaissance-notes`.

## Tests

Une page a ouvrir, rien a installer :

```
tests/index.html
```

Ouverte par double-clic, la page fonctionne : 25 tests s'executent. Trois
lisent les fichiers du projet et ont besoin d'une vraie adresse HTTP, car le
navigateur bloque ces lectures en `file://` ; ils sont alors ignores, et la
page explique comment les lancer.

Pour tout executer, depuis le dossier du projet :

```bash
python3 -m http.server 8000
```

puis ouvrir `http://localhost:8000/tests/`. Recharger la page relance tout.

Chaque test epingle quelque chose qui a deja casse une fois. Trois verifient la
coherence du deploiement et valent d'etre relancees avant chaque publication :

- tout script charge par `index.html` figure dans le cache du service worker
  (son absence empechait l'application de demarrer hors ligne)
- toute feuille de style aussi
- aucun selecteur de `dom.js` ne pointe vers un element disparu

Le harnais a lui-meme ete verifie : trois regressions connues ont ete
reintroduites volontairement, les trois ont ete detectees et nommees.

## Sauvegarde robuste

Le point fragile du projet est que l'espace de travail editable vit d'abord dans le navigateur.
Si le `localStorage` est vide, corrompu, ou si vous changez de navigateur/appareil, vos pages peuvent sembler disparaitre.

Pour une vraie sauvegarde hors navigateur :

1. gardez Supabase comme source distante
2. exportez regulierement un backup JSON complet
3. conservez aussi des fichiers dates dans le repo ou dans un dossier externe

Un script est fourni pour cela :

```bash
zsh ./scripts/backup-supabase.sh
```

Il ecrit desormais **hors du depot**, dans `~/Atlas-backups` par defaut, et refuse
d'ecrire dans le dossier du projet : celui-ci est public, et une sauvegarde contient
l'integralite de vos pages. Passez un autre chemin en argument si besoin.

Il faut un jeton d'acces valide depuis la fermeture de l'acces anonyme :

```bash
SUPABASE_ACCESS_TOKEN="<jeton>" zsh ./scripts/backup-supabase.sh
```

Il cree :

- un export complet du payload Supabase
- un export `notes` seul
- un resume des snapshots distants
- une copie `latest` facile a reutiliser

Workflow conseille :

1. avant une grosse session, lancez `zsh ./scripts/backup-supabase.sh`
2. apres une session importante, relancez-le
3. gardez au moins une copie locale hors du navigateur
4. si vous voulez une version publiee, remplacez aussi `knowledge-base.json`
