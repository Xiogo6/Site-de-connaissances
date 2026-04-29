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

    context.state.activeNoteId = getStartupNoteId() ?? context.state.notes[0]?.id ?? null;
    context.renderers.syncDynamicControls();
    context.events.bindEvents();
    context.renderers.renderEverything();
    context.data.registerServiceWorker();
  }

  function getStartupNoteId() {
    const remembered = context.state.notes.find(
      (note) => note.id === context.state.settings.lastEditedNoteId && isMeaningfulNote(note)
    );
    return remembered?.id ?? getLatestEditedNoteId(true) ?? getLatestEditedNoteId(false);
  }

  function getLatestEditedNoteId(onlyMeaningful) {
    return context.state.notes
      .filter((note) => !onlyMeaningful || isMeaningfulNote(note))
      .map((note) => ({
        id: note.id,
        timestamp: Date.parse(note.updatedAt || note.createdAt || ""),
      }))
      .filter((item) => !Number.isNaN(item.timestamp))
      .sort((left, right) => right.timestamp - left.timestamp)[0]?.id;
  }

  function isMeaningfulNote(note) {
    const title = String(note?.title || "").trim();
    const content = String(note?.content || "").trim();
    const body = content
      .replace(new RegExp(`^#\\s+${escapeRegExp(title)}\\s*`, "i"), "")
      .replace(/^#\s+.+$/gm, "")
      .replace(/[\s#*-]/g, "");
    return Boolean(
      body ||
        note?.tags?.length ||
        note?.favorite ||
        note?.parentId ||
        note?.metadata?.hasDate ||
        !/^nouvelle page\s+\d+$/i.test(title)
    );
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
})(window);
