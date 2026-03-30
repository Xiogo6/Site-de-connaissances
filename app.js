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
      noteViewMode: "read",
      pendingNewNoteId: null,
      previousActiveNoteId: null,
      sidebarDrawerOpen: false,
      sidebarFiltersOpen: false,
      utilityDrawerOpen: false,
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
      graphPositions: new Map(),
      graphDrag: {
        nodeId: null,
        offsetX: 0,
        offsetY: 0,
      },
      activeTab: "knowledge",
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
      flashcards: {
        cards: [],
        index: 0,
        answerVisible: false,
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
