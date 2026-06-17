(function initializeConfig(global) {
  const AtlasApp = (global.AtlasApp = global.AtlasApp || {});

  AtlasApp.config = {
    defaultKnowledge: [
      {
        id: "memoire-active",
        title: "Memoire active",
        type: "concept",
        favorite: true,
        tags: ["cognition", "memoire", "apprentissage"],
        content: `# Memoire active

La memoire active est l'espace mental qui maintient des informations pendant quelques secondes pour raisonner.

- Elle est limitee en capacite.
- Elle est soutenue par l'attention.
- Elle influence directement [[Revision active]] et [[Charge cognitive]].

Boucle phonologique : maintien verbal temporaire.
Calepin visuo-spatial : maintien des images et positions.
Administrateur central : coordination de l'attention.`,
        createdAt: "2026-03-23T08:00:00.000Z",
        updatedAt: "2026-03-23T08:00:00.000Z",
        review: {
          streak: 2,
          lastReviewedAt: "2026-03-22T19:00:00.000Z",
          nextReviewAt: "2026-03-23T10:00:00.000Z",
        },
      },
      {
        id: "revision-active",
        title: "Revision active",
        type: "procedure",
        favorite: true,
        tags: ["memoire", "apprentissage", "quiz"],
        content: `# Revision active

La revision active consiste a recuperer une information sans la relire tout de suite.

- C'est plus efficace qu'une simple relecture passive.
- Les quiz sont une excellente forme de revision active.
- Cette pratique renforce [[Memoire active]] et la consolidation.

Recuperation : effort de rappel qui renforce la trace.
Feedback : correction qui stabilise la bonne reponse.`,
        createdAt: "2026-03-23T08:10:00.000Z",
        updatedAt: "2026-03-23T08:10:00.000Z",
        review: {
          streak: 1,
          lastReviewedAt: "2026-03-22T18:30:00.000Z",
          nextReviewAt: "2026-03-23T08:00:00.000Z",
        },
      },
      {
        id: "charge-cognitive",
        title: "Charge cognitive",
        type: "concept",
        favorite: false,
        tags: ["cognition", "conception", "clarte"],
        content: `# Charge cognitive

La charge cognitive correspond a la quantite d'effort mental necessaire pour traiter une information.

- Une interface claire en reduit le cout.
- Une structure trop dense nuit a [[Memoire active]].
- Les liens explicites facilitent la navigation conceptuelle.

Charge intrinsique : difficulte propre au sujet.
Charge extrinseque : difficulte creee par la presentation.`,
        createdAt: "2026-03-23T08:20:00.000Z",
        updatedAt: "2026-03-23T08:20:00.000Z",
        review: {
          streak: 0,
          lastReviewedAt: null,
          nextReviewAt: "2026-03-23T07:00:00.000Z",
        },
      },
      {
        id: "systeme-personnel",
        title: "Systeme personnel",
        type: "hub",
        favorite: true,
        tags: ["organisation", "meta", "clarte"],
        content: `# Systeme personnel

Un systeme de connaissance personnel doit respecter la facon dont vous pensez, pas l'inverse.

- Une page doit representer une idee distincte.
- Les liens doivent montrer les influences, dependances et contrastes.
- Le graphe permet de voir la forme globale de la pensee.

Architecture de pensee : organisation personnelle des concepts.
Backlink : page qui cite la page actuelle.`,
        createdAt: "2026-03-23T08:30:00.000Z",
        updatedAt: "2026-03-23T08:30:00.000Z",
        review: {
          streak: 3,
          lastReviewedAt: "2026-03-22T17:00:00.000Z",
          nextReviewAt: "2026-03-26T17:00:00.000Z",
        },
      },
    ],
    storageKey: "atlas-connaissance-notes",
    appStorageKey: "atlas-connaissance-app",
    snapshotStorageKey: "atlas-connaissance-snapshots",
    aiStorageKey: "atlas-connaissance-ai",
    geminiOpenAiBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
    geminiDefaultModel: "gemini-3.5-flash",
    dataVersion: 11,
    supabase: {
      url: "https://cmmlgojptwolqbriexse.supabase.co",
      publishableKey: "sb_publishable_zoF-bkuVgEm9e7cbFG8lwA_kxRIHoPk",
      syncEnabled: true,
    },
    noteTypeLabels: {
      concept: "Concept",
      definition: "Definition",
      person: "Personne",
      event: "Evenement",
      experience: "Experience",
      daily: "Daily",
      folder: "Dossier",
      hub: "Hub",
      procedure: "Procedure",
      question: "Question",
    },
    noteTemplates: {
      concept: `# {{title}}

Definition :

- Idee centrale :
- Ce que cela influence :
- Voir aussi :
`,
      definition: `# {{title}}

Definition :

## En une phrase

- 

## Caracteristiques

- 

## Liens utiles

- 
`,
      person: `# {{title}}

Naissance :
Deces :

## Qui est cette personne ?

- Role :
- Domaine :

## Ce qu'elle a fait

- Realisation 1 :
- Realisation 2 :

## Pages liees

- 
`,
      event: `# {{title}}

Date :
Lieu :

## Resume

- 

## Chronologie

- Avant :
- Pendant :
- Apres :

## Consequences

- 
`,
      experience: `# {{title}}

Contexte :

## Ce qui a ete vecu

- 

## Ce qui en ressort

- 

## Pages liees

- 
`,
      daily: `# {{title}}

Date :

## Aujourd'hui

- 

## A retenir

- 

## Liens

- 
`,
      folder: `# {{title}}

Ce dossier regroupe :

- Themes contenus :
- Questions liees :
- Voir aussi :
`,
      hub: `# {{title}}

Point d'entree :

## Concepts relies

- 

## Questions ouvertes

- 
`,
      procedure: `# {{title}}

Objectif :

## Etapes

- Etape 1 :
- Etape 2 :

## Points de vigilance

- 
`,
      question: `# {{title}}

Question :

Hypotheses :

- 

Pistes de reponse :

- 
`,
    },
    reviewIntervalsInHours: [0, 12, 24, 72, 168, 336],
  };
})(window);
