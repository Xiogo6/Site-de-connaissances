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

Interdictions :

- ne pas inventer un chemin de dossier qui n est pas dans la liste
- ne pas proposer un nouveau dossier pour une seule note quand un dossier general existe
- ne pas repondre les deux a la fois : un dossier existant ou un nouveau, pas les deux

Contraintes de sortie :

- retourne uniquement un JSON valide, sans markdown ni commentaire
- le JSON contient exactement les cles `folder`, `newFolder` et `reason`
- `folder` : le chemin exact d un dossier de la liste, sinon null
- `newFolder` : le nom d un dossier a creer, sinon null
- une seule des deux est non nulle, l autre vaut null
- `reason` : une phrase courte, quinze mots au plus

Dossiers existants :

{{Catalogue des chemins}}

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
