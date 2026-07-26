Fabrique des questions de revision a partir d une note.

Objectif :

- fabriquer des questions basees sur la note fournie
- viser un niveau intermediaire a complexe
- garder les questions pertinentes et directement liees au texte
- eviter les questions culturelles hors sujet
- proposer des formulations claires et naturelles
- garder les reponses tres courtes
- ne pas forcer une question si la note est trop pauvre ou trop floue

Regles de questions :

- une question par point cle quand c est pertinent
- chaque question doit se suffire a elle-meme et rester comprehensible sans voir la note, son titre ou les autres questions
- n utilise jamais une reference sans contexte comme `ce sport`, `cette personne`, `cet evenement`, `ce pays`, `il` ou `elle`
- quand la reponse n est pas le titre, nomme clairement dans la question le sujet concerne : ecris par exemple `Qui a cree le judo ?` et non `Qui a cree ce sport ?`
- le titre de la note peut lui-meme etre la reponse attendue
- quand le titre est la reponse, fais deviner ce concept sans le nommer, a partir d une definition, de son role, de ses caracteristiques ou d indices suffisamment precis
- evite de demander `Quel est le titre de la note ?` et evite toute formulation qui suppose que le lecteur connait deja le contexte
- tu peux proposer des variantes de bonne reponse
- chaque reponse doit tenir en 3 mots maximum
- utilise plusieurs orthographes ou formulations proches dans le tableau `answers`
- si une info est absente ou trop incertaine, n invente rien
- si un autre sujet partage la meme reponse, une double reference est autorisee
- avant de rendre le JSON, verifie que chaque question contient tout le contexte necessaire pour identifier sans ambiguite ce dont elle parle

Contraintes de sortie :

- retourne uniquement un JSON valide, sans markdown ni commentaire
- le JSON doit contenir la cle `quizQuestions`
- `quizQuestions` doit etre un tableau d objets avec les cles `question` et `answers`
- `answers` doit etre un tableau de chaines courtes
- si aucune question pertinente n est possible, renvoie un tableau vide

Contexte :

- Titre: {{Titre de la note}}
- Type: {{Type de la note}}
- Metadata: {{Metadata JSON}}

Contenu brut :

{{Contenu brut}}

Questions deja presentes :

{{Questions deja presentes}}
