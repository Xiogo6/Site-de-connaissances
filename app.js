(function bootstrapApp(global) {
  const AtlasApp = global.AtlasApp;
  const { defaultKnowledge } = AtlasApp.config;

  const context = {
    elements: AtlasApp.createElements(),
    helpers: AtlasApp.helpers,
    state: {
      notes: [],
      settings: {},
      snapshots: [],
      activeNoteId: null,
      activeTemplateType: "concept",
      templateDrafts: {},
      editorTemplateSeed: null,
      noteViewMode: "read",
      pendingNewNoteId: null,
      previousActiveNoteId: null,
      sidebarDrawerOpen: false,
      sidebarFiltersOpen: false,
      utilityDrawerOpen: false,
      tagSuggestionTarget: null,
      sidebarTab: "library",
      explorerMenuNoteId: null,
      organizationMenuNoteId: null,
      filter: "",
      typeFilter: "all",
      tagFilter: "all",
      favoritesOnly: false,
      graphTagFilter: "all",
      graphFocusMode: "all",
      graphShowTags: false,
      graphSelection: null,
      graphZoom: 1,
      graphViewport: {
        panX: 0,
        panY: 0,
      },
      graphPositions: new Map(),
      graphDrag: {
        nodeId: null,
        mode: null,
        pointerId: null,
        activePointers: {},
        pinchStartDistance: 0,
        pinchStartZoom: 1,
        pinchFocalGraphX: 0,
        pinchFocalGraphY: 0,
        offsetX: 0,
        offsetY: 0,
        startClientX: 0,
        startClientY: 0,
        startPanX: 0,
        startPanY: 0,
        moved: false,
        suppressClickUntil: 0,
      },
      activeTab: "knowledge",
      visualizationMode: "graph",
      sourceMode: "workspace",
      quickCaptureOpen: false,
      dragState: {
        noteId: null,
        dropTargetId: null,
        dropToRoot: false,
      },
      quiz: {
        questions: [],
        index: 0,
        score: 0,
        answerVisible: false,
      },
      revisionMode: "quiz",
      flashcards: {
        cards: [],
        index: 0,
        answerVisible: false,
      },
      timeline: {
        scope: "folder",
        folderId: "",
        tag: "",
        selectedNoteId: null,
      },
      remote: {
        enabled: false,
        status: "local",
        lastSyncedAt: null,
        lastError: "",
      },
    },
  };

  context.data = AtlasApp.createDataModule(context);
  context.state.notes = context.data.loadNotes();
  context.state.settings = context.data.loadSettings();
  context.state.snapshots = context.data.loadSnapshots();
  context.state.sourceMode = context.data.getSourceMode();
  context.notes = AtlasApp.createNotesModule(context);
  context.graph = AtlasApp.createGraphModule(context);
  context.quiz = AtlasApp.createQuizModule(context);
  context.renderers = AtlasApp.createRenderersModule(context);
  context.events = AtlasApp.createEventsModule(context);

  init();

  async function init() {
    await context.data.bootstrapWorkspace();

    if (!context.state.notes.length) {
      context.state.notes = structuredClone(defaultKnowledge);
      context.data.saveNotes();
    }

    context.state.activeNoteId = context.state.notes[0]?.id ?? null;
    context.renderers.syncDynamicControls();
    context.events.bindEvents();
    context.renderers.renderEverything();
    context.data.registerServiceWorker();
  }
})(window);
