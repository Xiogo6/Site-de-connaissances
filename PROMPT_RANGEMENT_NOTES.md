Note de travail : miroir du prompt de rangement reellement envoye a Gemini.
Le prompt effectif est construit dans `scripts/ai.js`, fonction `buildPlacementPrompt`.
Toute modification ici doit etre reportee la-bas (et inversement).

Principe : ce prompt ne touche pas au texte de la note. Il lit l arborescence
existante et designe un dossier. C est un appel separe de la reecriture, et cette
separation est le point important.

Pourquoi un appel separe plutot qu une cle de plus dans `buildRewritePrompt` :
`PROMPT_REDACTION_NOTES.md` a deja constate qu entre une consigne restrictive et
une consigne permissive, le modele suit la permissive. `reecris sans rien ajouter`
et `propose un rangement` ne sont pas du meme ordre : la seconde demande de juger,
et un modele qui juge se remet a completer. Les deux comportements ne peuvent pas
cohabiter dans un meme appel.

Ce que le prompt recoit : le catalogue des dossiers sous forme de **chemins
complets** (`Geographie / Pays`), pas de titres seuls. Sans le chemin, le modele
ne voit pas le niveau de generalite de la nomenclature et propose des dossiers
qui doublonnent un parent existant.

Les dossiers proposes sont filtres en amont : une page ne peut pas se ranger dans
elle-meme ni sous une de ses descendances (`canMoveNote`).

---

Tu ranges une note dans une arborescence de dossiers deja en place.
Tu ne reecris pas la note et tu ne la commentes pas.

Regle principale :

- choisis en priorite un dossier de la liste, tel qu il est ecrit
- ne propose un nouveau dossier que si aucun dossier existant ne convient vraiment
- en cas d hesitation entre deux dossiers existants, prends le plus precis
- un dossier existant approximatif vaut mieux qu un nouveau dossier de plus

Objectif :

- respecter la nomenclature existante : sa langue, sa casse, son niveau de detail
- si tu proposes un nouveau dossier, le nommer dans le meme style que les autres
- rester au niveau de generalite des dossiers deja presents
- placer un nouveau dossier sous le dossier existant le plus proche du sujet, plutot qu a la racine

Interdictions :

- ne pas inventer un chemin de dossier qui n est pas dans la liste
- ne pas proposer un nouveau dossier pour une seule note quand un dossier general existe
- ne pas repondre les deux a la fois : un dossier existant ou un nouveau, pas les deux

Tags :

- propose aussi les tags qui manquent a la note, trois au plus
- reprends en priorite un tag deja utilise, ecrit exactement comme dans la liste
- un nouveau tag est en minuscules, sans accent, dans le style des autres
- aucun tag si ceux de la note suffisent

Contraintes de sortie :

- retourne uniquement un JSON valide, sans markdown ni commentaire
- le JSON contient exactement les cles `folder`, `newFolder`, `newFolderParent`, `tags` et `reason`
- `folder` : le chemin exact d un dossier de la liste, sinon null
- `newFolder` : le nom court du seul dossier a creer, sans chemin, sinon null
- `newFolderParent` : si `newFolder` est rempli, le chemin exact du dossier de la liste qui le contiendra, ou null pour la racine ; sinon null
- `folder` et `newFolder` : une seule des deux est non nulle, l autre vaut null
- `tags` : une liste de zero a trois tags a ajouter a la note, jamais un tag qu elle porte deja
- `reason` : une phrase courte, quinze mots au plus

Dossiers existants :

{{Catalogue des chemins}}

Tags deja utilises : {{Tous les tags de l atelier}}
Tags de la note : {{Tags du champ, au moment du clic}}

- Titre: {{Titre de la note}}
- Type: {{Type de la note}}

Contenu brut :

{{Contenu brut}}

---

`temperature` a 0 : on veut le meme rangement pour la meme note, pas une variante
a chaque clic.

Garde-fou cote code, dans `normalizePlacementPayload` : le modele repond un
chemin, pas un identifiant. Un chemin qu on ne retrouve pas dans le catalogue est
traite comme une invention et bascule en proposition de nouveau dossier, plutot
que d etre applique a l aveugle. Cette bascule est volontaire : elle rend une
hallucination visible au lieu de la faire echouer en silence.

La proposition ne range jamais toute seule. Elle preselectionne le dossier dans
le champ `Emplacement` et l enregistrement reste un geste separe.

Les tags, eux, s appliquent tout de suite, comme apres une dictee : ils sont
ajoutes a la suite du champ `Tags`, sans retirer ceux qui y sont
(`mergeSuggestedTags`). Un tag deja present, meme ecrit autrement, n est pas
rajoute, et un tag deja utilise ailleurs garde le libelle de l atelier. Comme
pour le reste du formulaire, rien n est enregistre avant `Enregistrer`.

Un nouveau dossier propose se cree avec le bouton `Creer ce dossier`, sous
`newFolderParent` (ou a la racine) ; il est alors preselectionne, sans que la
page bouge avant l enregistrement.
