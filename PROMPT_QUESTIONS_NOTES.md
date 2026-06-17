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
- tu peux proposer des variantes de bonne reponse
- chaque reponse doit tenir en 3 mots maximum
- utilise plusieurs orthographes ou formulations proches dans le tableau `answers`
- si une info est absente ou trop incertaine, n invente rien
- si un autre sujet partage la meme reponse, une double reference est autorisee

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
