# Contrat fonctionnel de l’éditeur de pages

Ce fichier est la référence à vérifier avant et après toute refonte de l’éditeur. Une modification visuelle ne doit jamais masquer, désactiver ou rendre inaccessible une fonction listée ici.

## Fonctions obligatoires

| Fonction | Comportement attendu | Point d’entrée principal | Contrôle de non-régression |
| --- | --- | --- | --- |
| Nouvelle page | Ouvre une page plein écran, focalise le titre et conserve la possibilité d’annuler la création. | `#new-full-page-button` | Le titre est actif, le contenu est vide et Annuler retire le brouillon. |
| Éditer une page | Ouvre la page existante sans dupliquer son titre dans le contenu. | `#note-mode-toggle`, `data-*-edit` | Le titre est dans `#note-title`; `#note-content` commence au corps de la note. |
| Enregistrer | Sauvegarde titre, contenu, type, tags, date, dossier et questions. Sur mobile, reste accessible en bas à droite au-dessus des outils. | `#save-button`, `notes.saveCurrentNote()` | Une modification enregistrée est visible en lecture et met à jour `updatedAt`. |
| Annuler les modifications | Abandonne le brouillon courant et revient en lecture. Pour une nouvelle page, supprime uniquement la page temporaire. | `#cancel-note-button`, `notes.cancelEditingNote()` | Les données enregistrées avant l’édition restent inchangées. |
| Supprimer la page | Demande confirmation, crée un snapshot de sécurité puis supprime la page. | `#delete-active-note-button`, `notes.deleteNoteById()` | Le bouton est visible en édition et aucune suppression n’a lieu sans confirmation. |
| Titre et contenu | La première ligne visuelle est le titre; le corps est édité séparément mais sauvegardé en Markdown complet. | `notes.getEditorComposedContent()` | Aucun titre dupliqué dans le textarea ou la lecture. |
| Métadonnées révélables | Type, tags, dossier, date structurée et dernière mise à jour apparaissent en tirant la page vers le bas. | `#editor-metadata-panel` | Le texte d’aide n’encombre pas la zone; les champs restent modifiables. |
| Reclassement | Une nouvelle page et une page existante peuvent être placées dans un autre dossier. | `#note-parent`, `notes.getEditorParentId()` | Le changement met à jour les liens hiérarchiques lors de l’enregistrement. |
| Dernière mise à jour | Affiche la date du dernier enregistrement dans les métadonnées d’édition et en lecture. | `#editor-updated-at`, `note.updatedAt` | La valeur change après une sauvegarde, pas à chaque frappe. |
| Barre de texte | Puce, case, titre, sous-titre, gras, italique, souligné, lien et date restent accessibles au-dessus du clavier. | `.editor-toolbar`, `events.applyEditorFormat()` | La barre ne recouvre jamais la ligne contenant le curseur. |
| Puce et case | Sans sélection, insère uniquement `- ` ou `- [ ] ` et laisse le curseur après le marqueur. | `data-format-action="bullet|checklist"` | Aucun texte d’exemple n’est ajouté ou sélectionné. |
| Sortie de liste | Entrée poursuit une puce; Entrée sur une puce vide quitte la liste et crée un paragraphe. | gestion `keydown` de `#note-content` | Deux Entrées après une puce permettent d’écrire un paragraphe normal. |
| Sauts de ligne | Les lignes vides supplémentaires saisies sont visibles en mode lecture. | `helpers.renderNoteHtml()` | Trois paragraphes avec des espacements différents conservent ces différences. |
| Reformulation Gemini | Reformule le brouillon courant et permet d’annuler la dernière reformulation. | `#ai-assist-button`, `#ai-undo-button`, `ai.rewriteActiveNote()` | Le bouton reste visible; sans clé, il conduit aux réglages Gemini. |
| Questions | Affiche, ajoute, modifie et supprime les questions liées à la page. | `.quiz-bank-panel`, `#add-quiz-question-button` | Les champs sont éditables en mobile et en bureau. |
| Questions Gemini | Génère des questions depuis le contenu de la page. | `#ai-questions-button`, `ai.generateQuestionsForActiveNote()` | Le bouton est visible dans la section Questions et signale l’activité Gemini. |
| Thèmes | Tous les éléments utilisent les variables du thème et gardent un contraste lisible. | `data-theme-preset`, variables `--theme-*` | Tester au minimum Classique clair, Classique nuit et un thème coloré. |
| Clavier mobile | Le viewport visuel pilote la feuille, les commandes et la barre de texte. | `visualViewport`, `--editor-viewport-height` | Avec un viewport réduit, le curseur demeure au-dessus des deux barres. |

## Parcours manuel minimal

1. Ouvrir une nouvelle page, saisir un titre puis appuyer sur Entrée.
2. Saisir du texte jusqu’en bas de l’écran avec le clavier affiché.
3. Insérer une puce et une case sans sélection; vérifier l’absence de texte d’exemple.
4. Appuyer deux fois sur Entrée après une puce, écrire un paragraphe puis vérifier le rendu en lecture.
5. Créer plusieurs lignes vides entre deux paragraphes et vérifier leur restitution.
6. Tirer vers le bas, changer le dossier, le type, les tags et une date.
7. Ouvrir Questions, ajouter/modifier/supprimer une ligne et tester la génération Gemini.
8. Tester Reformuler puis Annuler reformulation.
9. Annuler l’édition et vérifier que les modifications disparaissent.
10. Recommencer, enregistrer avec le bouton flottant et vérifier la date de mise à jour.
11. Tester les thèmes clair, sombre et coloré, en mobile puis en bureau.

## Invariants techniques

- Aucun sélecteur mobile ne doit appliquer `display: none` à `.editor-mini-actions`, `.quiz-bank-panel`, `#save-button`, `#cancel-note-button` ou `#delete-active-note-button`.
- Les boutons flottants réutilisent les actions existantes; ils ne doivent pas créer une seconde logique de sauvegarde.
- Le contenu persisté reste compatible avec les notes existantes: `# Titre`, puis le corps Markdown.
- Les brouillons, questions, liens hiérarchiques et sauvegardes automatiques doivent continuer à passer par les fonctions de données existantes.
- Toute nouvelle refonte de l’éditeur doit exécuter le parcours manuel ci-dessus avant validation.
