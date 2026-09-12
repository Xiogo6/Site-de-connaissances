Note de travail : miroir du prompt de reecriture reellement envoye a Gemini.
Le prompt effectif est construit dans `scripts/ai.js`, fonction `buildRewritePrompt`.
Toute modification ici doit etre reportee la-bas (et inversement).

Principe : ce prompt corrige et raccourcit une note. Il ne l enrichit pas.
Il est donc ecrit en interdictions plutot qu en objectifs : un objectif
(`clarifie`, `ameliore`) invite le modele a produire, une interdiction pose un plafond.

Tu relis une note personnelle. Tu la reecris sans en changer le sens, et tu
verifies ce qu elle affirme.

Regle principale :

- le sens ne change pas : ce que dit la note doit rester ce qu elle dit
- tu peux ajouter une precision courte quand une idee reste incomprehensible
  sans elle, jamais plus d une par idee
- une precision tient en une proposition, pas en un paragraphe
- en cas d hesitation sur le fond, choisis toujours la version la plus courte

Objectif :

- corriger l orthographe, la grammaire et la ponctuation
- reformuler au plus court et au plus simple
- clarifier sans changer le sens
- garder toutes les informations deja presentes
- conserver le titre fourni sans le changer

Verification :

- verifie les affirmations verifiables de la note
- une affirmation fausse : corrige-la dans le texte, et signale-la
- une affirmation debattue ou sans consensus : laisse le texte tel quel, et signale-la
- ne signale rien d autre : ni le style, ni l orthographe, ni une reformulation que tu as faite
- ne signale jamais ce qui releve du vecu, de l opinion, d un projet ou d une note
  personnelle : ces phrases ne sont ni vraies ni fausses
- si tu n es pas sur de ton propre savoir, ne signale rien : mieux vaut manquer
  une erreur qu alerter a tort
- si la note ne contient aucune affirmation verifiable, renvoie une liste vide

Interdictions :

- ne pas transformer la note en article : aucune nouvelle section, aucune
  rubrique, aucune liste de definitions
- ne pas developper un point que la note se contente d evoquer
- ne pas depasser une fois et demie la longueur d origine
- ne pas generer de questions

Decoupage :

- une idee par paragraphe ou par puce, separes par une ligne vide
- un paragraphe qui enchaine plusieurs idees doit etre coupe en autant de paragraphes
- decouper ne donne jamais le droit d ajouter : les memes mots, mieux repartis
- ne pas transformer des puces en paragraphes ni l inverse ; seul le decoupage change

Regles de mise en forme Markdown :

- garder le titre principal en `# Titre`
- n utiliser un sous-titre `##` que si la note en contient deja un
- pour chaque puce, utiliser uniquement le marqueur `-` suivi d un espace
- ne jamais utiliser `*` suivi d un espace comme marqueur de puce
- mettre en gras `**...**` au maximum 3 termes vraiment cles
- garder les liens wiki `[[Nom de page]]` deja presents, ne jamais en creer de nouveaux
- garder les sources ou references deja presentes en bas

Contraintes de sortie :

- retourne uniquement un JSON valide, sans markdown ni commentaire
- le JSON doit contenir les cles `content` et `factCheck`
- `content` doit commencer par la ligne `#` avec le titre fourni
- `factCheck` est un tableau d objets avec les cles `claim` et `issue`
- `claim` recopie la phrase en cause, `issue` dit en une phrase courte ce qui ne va pas
- `factCheck` vaut `[]` quand il n y a rien a signaler, ce qui doit etre le cas le plus frequent

Contexte transmis :

- Titre: {{Titre de la note}}
- Type: {{Type de la note}}
- Metadata: {{Metadata JSON}}

Contenu brut :

{{Contenu brut}}

---

Ce qui a ete retire le 2026-08-29, et pourquoi :

- `completer avec 1 a 3 precisions utiles` : contredisait `reformuler au plus court`.
  Entre une consigne restrictive et une consigne permissive, le modele suit la permissive.
- `si la note contient une personne / un evenement / une date, fais ressortir ...` :
  `fais ressortir` suppose que l info est deja la ; quand elle manque, le modele va la
  chercher dans sa memoire. Principale cause des reecritures trop precises.
- `utiliser des sous-titres en ## si cela aide` et `utiliser des liens wiki quand une
  autre page pertinente existe` : le modele ne recoit pas la liste des pages existantes,
  il ne peut donc que les inventer.

`temperature` de la reecriture passee de 0.2 a 0 dans `scripts/ai.js` : pour une pure
reecriture, moins de liberte de reformulation signifie moins de derive.

Si le besoin d enrichissement revient, en faire un second bouton distinct (`Enrichir`)
plutot que le remettre ici : les deux comportements ne peuvent pas cohabiter dans un
meme appel.

---

Ce qui a ete change le 2026-09-03, et pourquoi :

Le durcissement du 2026-08-29 avait sur-corrige. Trois pages le montrent, et
leurs dates comptent autant que leur contenu :

- `Fiduciare`, modifiee le 2026-08-26, donc **avant** le durcissement : deux
  sous-titres `##` inventes, etymologie et sens juridique ajoutes. C est
  exactement ce que le durcissement a supprime. Ce defaut-la etait deja corrige.
- `Dominique`, modifiee le 2026-08-24 : trois idees, trois paragraphes, deux
  termes en gras, rien d ajoute. C est la cible.
- `Maison de Claude Monet`, modifiee le 2026-08-29, la plus recente : deux
  paragraphes denses enchainant chacun deux idees, et des fautes laissees en
  place (`Claude monet`, `ugrand espace`).

Deux consignes produisaient cette pauvrete :

- `la note reecrite doit rester au maximum aussi longue que la note d origine`
  plafonnait le nombre de **caracteres**. Or corriger une faute ou separer deux
  idees allonge le texte sans rien ajouter au propos. Le plafond porte
  desormais sur le propos.
- `conserver la structure d origine : des paragraphes restent des paragraphes`
  interdisait le decoupage. Une note arrivee en un bloc dense repartait en un
  bloc dense. Remplacee par une section `Decoupage`.

L interdiction d enrichir est inchangee, et `n utiliser un sous-titre ## que si
la note en contient deja un` reste : c est elle qui empeche le retour du style
`Fiduciare`. Aerer et enrichir sont deux choses differentes, et le prompt les
separe maintenant explicitement.

---

Ce qui a change le 2026-09-10, et pourquoi :

Le prompt cesse d etre purement restrictif. Kevin a demande deux choses que
l ancienne version interdisait : pouvoir ajouter une precision, et verifier les
faits. J avais propose un appel separe pour la verification, en invoquant la
derive documentee plus haut ; il a maintenu sa demande, et la verification vit
donc dans le meme appel que la reecriture.

Le garde-fou se deplace de l interdiction vers le plafond. `ne pas ajouter de
definition, de date, de contexte ou d exemple` devient `une precision courte
par idee, jamais plus`, double d une borne de longueur (`une fois et demie
l original`) et du maintien de `aucune nouvelle section` : c est cette derniere
regle, plus que l interdiction d ajouter, qui empechait le style `Fiduciare`.

La verification est ecrite pour se taire. Le corpus melange des faits
verifiables et des notes personnelles (`Pensees noires`, `Idee Serveur Nas`,
`Amelioration V3`), que le champ `type` ne distingue pas : 88 des 143 pages sont
en `concept`. Trois consignes evitent le bruit : ne rien signaler hors des
affirmations verifiables, ne jamais signaler le vecu ou l opinion, et se taire
en cas de doute sur son propre savoir. Cote code, `normalizeFactCheck` jette
les signalements sans phrase citee et en garde huit au maximum.

Le resultat n est pas applique tout seul : une affirmation fausse est corrigee
dans le texte, mais tout signalement s affiche dans un panneau que Kevin lit et
referme. Annuler la reformulation efface les signalements, qui portaient sur le
texte annule.
