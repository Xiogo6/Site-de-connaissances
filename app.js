const defaultKnowledge = [
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
];

const storageKey = "atlas-connaissance-notes";
const appStorageKey = "atlas-connaissance-app";
const snapshotStorageKey = "atlas-connaissance-snapshots";
const dataVersion = 3;
const noteTypeLabels = {
  concept: "Concept",
  hub: "Hub",
  procedure: "Procedure",
  question: "Question",
};
const reviewIntervalsInHours = [0, 12, 24, 72, 168, 336];

const state = {
  notes: loadNotes(),
  settings: loadSettings(),
  snapshots: loadSnapshots(),
  activeNoteId: null,
  filter: "",
  typeFilter: "all",
  tagFilter: "all",
  favoritesOnly: false,
  graphTagFilter: "all",
  graphFocusMode: "all",
  graphPositions: new Map(),
  activeTab: "knowledge",
  sourceMode: getSourceMode(),
  quickCaptureOpen: false,
  quiz: {
    questions: [],
    index: 0,
    score: 0,
    answerVisible: false,
  },
};

const elements = {
  searchInput: document.querySelector("#search-input"),
  clearFiltersButton: document.querySelector("#clear-filters-button"),
  typeFilter: document.querySelector("#type-filter"),
  tagFilter: document.querySelector("#tag-filter"),
  favoritesFilter: document.querySelector("#favorites-filter"),
  knowledgeList: document.querySelector("#knowledge-list"),
  pageCount: document.querySelector("#page-count"),
  newNoteButton: document.querySelector("#new-note-button"),
  duplicateNoteButton: document.querySelector("#duplicate-note-button"),
  exportButton: document.querySelector("#export-button"),
  importInput: document.querySelector("#import-input"),
  dueReviewCount: document.querySelector("#due-review-count"),
  dueReviewList: document.querySelector("#due-review-list"),
  workspaceBanner: document.querySelector("#workspace-banner"),
  tabs: [...document.querySelectorAll(".tab")],
  panels: {
    knowledge: document.querySelector("#knowledge-tab"),
    graph: document.querySelector("#graph-tab"),
    quiz: document.querySelector("#quiz-tab"),
    publish: document.querySelector("#publish-tab"),
  },
  titleInput: document.querySelector("#note-title"),
  typeInput: document.querySelector("#note-type"),
  tagsInput: document.querySelector("#note-tags"),
  favoriteInput: document.querySelector("#note-favorite"),
  contentInput: document.querySelector("#note-content"),
  saveButton: document.querySelector("#save-button"),
  previewTitle: document.querySelector("#preview-title"),
  previewTags: document.querySelector("#preview-tags"),
  previewMeta: document.querySelector("#preview-meta"),
  previewContent: document.querySelector("#preview-content"),
  noteStatus: document.querySelector("#note-status"),
  outgoingLinks: document.querySelector("#outgoing-links"),
  backlinks: document.querySelector("#backlinks"),
  backlinkContexts: document.querySelector("#backlink-contexts"),
  suggestedLinks: document.querySelector("#suggested-links"),
  noteOutline: document.querySelector("#note-outline"),
  pageTotalCount: document.querySelector("#page-total-count"),
  linkCount: document.querySelector("#link-count"),
  orphanCount: document.querySelector("#orphan-count"),
  quizCount: document.querySelector("#quiz-count"),
  graphCanvas: document.querySelector("#graph-canvas"),
  graphFocus: document.querySelector("#graph-focus"),
  graphTagFilter: document.querySelector("#graph-tag-filter"),
  graphFocusMode: document.querySelector("#graph-focus-mode"),
  resetGraphButton: document.querySelector("#reset-graph-button"),
  quizScope: document.querySelector("#quiz-scope"),
  quizTagWrapper: document.querySelector("#quiz-tag-wrapper"),
  quizTag: document.querySelector("#quiz-tag"),
  quizMode: document.querySelector("#quiz-mode"),
  quizAmount: document.querySelector("#quiz-amount"),
  generateQuizButton: document.querySelector("#generate-quiz-button"),
  quizTitle: document.querySelector("#quiz-title"),
  quizProgress: document.querySelector("#quiz-progress"),
  quizCard: document.querySelector("#quiz-card"),
  showAnswerButton: document.querySelector("#show-answer-button"),
  markCorrectButton: document.querySelector("#mark-correct-button"),
  markWrongButton: document.querySelector("#mark-wrong-button"),
  quizSummary: document.querySelector("#quiz-summary"),
  publishStatusCopy: document.querySelector("#publish-status-copy"),
  publishMeta: document.querySelector("#publish-meta"),
  downloadPublishButton: document.querySelector("#download-publish-button"),
  downloadBackupButton: document.querySelector("#download-backup-button"),
  copyPublishedLinkButton: document.querySelector("#copy-published-link-button"),
  saveSnapshotButton: document.querySelector("#save-snapshot-button"),
  restoreLatestSnapshotButton: document.querySelector("#restore-latest-snapshot-button"),
  snapshotList: document.querySelector("#snapshot-list"),
  quickCaptureToggle: document.querySelector("#quick-capture-toggle"),
  quickCapturePanel: document.querySelector("#quick-capture-panel"),
  quickCaptureClose: document.querySelector("#quick-capture-close"),
  quickTitle: document.querySelector("#quick-title"),
  quickTags: document.querySelector("#quick-tags"),
  quickContent: document.querySelector("#quick-content"),
  quickLinkActive: document.querySelector("#quick-link-active"),
  quickSaveButton: document.querySelector("#quick-save-button"),
};

init();

async function init() {
  if (!state.notes.length) {
    state.notes = structuredClone(defaultKnowledge);
    saveNotes();
  }

  await loadPublishedNotesIfNeeded();
  state.activeNoteId = state.notes[0]?.id ?? null;
  syncDynamicControls();
  bindEvents();
  renderEverything();
  registerServiceWorker();
}

function bindEvents() {
  elements.searchInput.addEventListener("input", (event) => {
    state.filter = event.target.value.trim().toLowerCase();
    renderEverything();
  });

  elements.typeFilter.addEventListener("change", (event) => {
    state.typeFilter = event.target.value;
    renderEverything();
  });

  elements.tagFilter.addEventListener("change", (event) => {
    state.tagFilter = event.target.value;
    renderEverything();
  });

  elements.favoritesFilter.addEventListener("change", (event) => {
    state.favoritesOnly = event.target.checked;
    renderEverything();
  });

  elements.clearFiltersButton.addEventListener("click", () => {
    state.filter = "";
    state.typeFilter = "all";
    state.tagFilter = "all";
    state.favoritesOnly = false;
    elements.searchInput.value = "";
    elements.typeFilter.value = "all";
    elements.tagFilter.value = "all";
    elements.favoritesFilter.checked = false;
    renderEverything();
  });

  elements.newNoteButton.addEventListener("click", () => {
    if (isReadOnlyMode()) {
      return;
    }
    const note = createEmptyNote();
    state.notes.unshift(note);
    state.activeNoteId = note.id;
    saveNotes();
    renderEverything();
    elements.titleInput.focus();
  });

  elements.duplicateNoteButton.addEventListener("click", () => {
    if (isReadOnlyMode()) {
      return;
    }
    const current = getActiveNote();
    if (!current) {
      return;
    }

    const duplicate = {
      ...current,
      id: generateId(`${current.title}-copie`),
      title: `${current.title} copie`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    state.notes.unshift(duplicate);
    state.activeNoteId = duplicate.id;
    saveNotes();
    renderEverything();
  });

  elements.saveButton.addEventListener("click", saveCurrentNote);
  elements.titleInput.addEventListener("input", renderLivePreview);
  elements.typeInput.addEventListener("change", renderLivePreview);
  elements.tagsInput.addEventListener("input", renderLivePreview);
  elements.favoriteInput.addEventListener("change", renderLivePreview);
  elements.contentInput.addEventListener("input", renderLivePreview);

  elements.exportButton.addEventListener("click", exportNotes);
  elements.importInput.addEventListener("change", importNotes);
  elements.downloadPublishButton.addEventListener("click", downloadPublishedSnapshot);
  elements.downloadBackupButton.addEventListener("click", downloadFullBackup);
  elements.copyPublishedLinkButton.addEventListener("click", copyPublishedLink);
  elements.saveSnapshotButton.addEventListener("click", saveManualSnapshot);
  elements.restoreLatestSnapshotButton.addEventListener("click", restoreLatestSnapshot);

  elements.tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      state.activeTab = tab.dataset.tab;
      renderTabs();
      if (state.activeTab === "graph") {
        drawGraph();
      }
    });
  });

  elements.resetGraphButton.addEventListener("click", () => {
    state.graphPositions.clear();
    drawGraph();
  });

  elements.graphCanvas.addEventListener("click", handleGraphClick);
  elements.graphTagFilter.addEventListener("change", (event) => {
    state.graphTagFilter = event.target.value;
    drawGraph();
  });
  elements.graphFocusMode.addEventListener("change", (event) => {
    state.graphFocusMode = event.target.value;
    drawGraph();
  });

  elements.quizScope.addEventListener("change", () => {
    elements.quizTagWrapper.classList.toggle(
      "is-hidden",
      elements.quizScope.value !== "tag"
    );
    renderStats();
  });

  elements.quizTag.addEventListener("input", renderStats);
  elements.quizMode.addEventListener("change", renderStats);
  elements.generateQuizButton.addEventListener("click", buildQuizSession);
  elements.showAnswerButton.addEventListener("click", showQuizAnswer);
  elements.markCorrectButton.addEventListener("click", () => scoreQuiz(true));
  elements.markWrongButton.addEventListener("click", () => scoreQuiz(false));

  elements.previewContent.addEventListener("click", handleRenderedLinkClick);
  elements.outgoingLinks.addEventListener("click", handleChipClick);
  elements.backlinks.addEventListener("click", handleChipClick);
  elements.suggestedLinks.addEventListener("click", handleSuggestedLinkClick);
  elements.graphFocus.addEventListener("click", handleGraphFocusClick);
  elements.quickCaptureToggle.addEventListener("click", toggleQuickCapture);
  elements.quickCaptureClose.addEventListener("click", toggleQuickCapture);
  elements.quickSaveButton?.addEventListener("click", saveQuickCapture);

  window.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      saveCurrentNote();
    }
  });
}

function renderEverything() {
  syncDynamicControls();
  renderTabs();
  renderWorkspaceBanner();
  renderKnowledgeList();
  hydrateEditorFromActiveNote();
  syncEditorAvailability();
  renderPreview();
  renderConnections();
  renderStats();
  renderDueReviewList();
  drawGraph();
  renderQuizCard();
  renderPublishCenter();
  renderQuickCapture();
}

function renderTabs() {
  elements.tabs.forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.tab === state.activeTab);
  });

  Object.entries(elements.panels).forEach(([key, panel]) => {
    panel.classList.toggle("is-active", key === state.activeTab);
  });
}

function renderWorkspaceBanner() {
  const publishedUrl = buildPublishedUrl();
  elements.workspaceBanner.innerHTML = "";

  const callout = document.createElement("div");
  callout.className = "workspace-callout";

  if (isReadOnlyMode()) {
    callout.innerHTML = `
      <strong>Snapshot publie</strong>
      <span>Lecture seule depuis GitHub Pages.</span>
      <a class="button" href="./index.html">Ouvrir l'espace local</a>
    `;
  } else {
    callout.innerHTML = `
      <strong>Espace local editable</strong>
      <span>Les changements restent sur cet appareil tant qu'ils ne sont pas publies.</span>
      <a class="button" href="${escapeHtml(publishedUrl)}">Voir la version publiee</a>
    `;
  }

  elements.workspaceBanner.appendChild(callout);
}

function syncEditorAvailability() {
  const readOnly = isReadOnlyMode();
  [
    elements.titleInput,
    elements.typeInput,
    elements.tagsInput,
    elements.favoriteInput,
    elements.contentInput,
    elements.saveButton,
    elements.newNoteButton,
    elements.duplicateNoteButton,
    elements.importInput,
    elements.quickCaptureToggle,
    elements.quickTitle,
    elements.quickTags,
    elements.quickContent,
    elements.quickLinkActive,
    elements.quickSaveButton,
  ].forEach((element) => {
    if (!element) {
      return;
    }
    element.disabled = readOnly;
  });
}

function renderKnowledgeList() {
  const filtered = getFilteredNotes();
  elements.pageCount.textContent = `${filtered.length} page${filtered.length > 1 ? "s" : ""}`;
  elements.knowledgeList.innerHTML = "";

  filtered.forEach((note, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "knowledge-item fade-in";
    button.style.animationDelay = `${index * 30}ms`;
    button.classList.toggle("is-active", note.id === state.activeNoteId);
    const due = isNoteDue(note);
    button.innerHTML = `
      <div class="knowledge-item-head">
        <strong>${escapeHtml(note.title)}</strong>
        ${note.favorite ? '<span class="pill">Favori</span>' : ""}
      </div>
      <p>${escapeHtml(extractSummary(note.content))}</p>
      <div class="knowledge-item-meta">
        <span>${escapeHtml(noteTypeLabels[note.type] || "Concept")}</span>
        <span>${escapeHtml(note.tags.slice(0, 2).join(" | ") || "Sans tag")}</span>
        <span class="${due ? "pill pill-due" : "pill pill-soft"}">${escapeHtml(
          due ? "A revoir" : describeReviewState(note)
        )}</span>
      </div>
    `;
    button.addEventListener("click", () => {
      state.activeNoteId = note.id;
      renderEverything();
    });
    elements.knowledgeList.appendChild(button);
  });
}

function hydrateEditorFromActiveNote() {
  const note = getActiveNote();
  if (!note) {
    return;
  }

  elements.titleInput.value = note.title;
  elements.typeInput.value = note.type;
  elements.tagsInput.value = note.tags.join(", ");
  elements.favoriteInput.checked = Boolean(note.favorite);
  elements.contentInput.value = note.content;
}

function renderLivePreview() {
  const activeNote = getActiveNote();
  if (!activeNote) {
    return;
  }

  const draftNote = {
    ...activeNote,
    title: elements.titleInput.value.trim() || "Sans titre",
    type: elements.typeInput.value,
    tags: parseTags(elements.tagsInput.value),
    favorite: elements.favoriteInput.checked,
    content: elements.contentInput.value,
  };

  renderPreview(draftNote, true);
  renderConnections(draftNote);
  renderStats(draftNote);
}

function renderPreview(note = getActiveNote(), isDraft = false) {
  if (!note) {
    return;
  }

  elements.previewTitle.textContent = note.title || "Sans titre";
  elements.previewTags.innerHTML = "";
  elements.previewMeta.innerHTML = "";
  elements.previewContent.innerHTML = renderNoteHtml(note.content);
  elements.noteStatus.textContent = isDraft ? "Brouillon" : "Synchronise";

  const typeTag = document.createElement("span");
  typeTag.className = "tag tag-type";
  typeTag.textContent = noteTypeLabels[note.type] || "Concept";
  elements.previewTags.appendChild(typeTag);

  if (note.favorite) {
    const favoriteTag = document.createElement("span");
    favoriteTag.className = "tag tag-favorite";
    favoriteTag.textContent = "Favori";
    elements.previewTags.appendChild(favoriteTag);
  }

  note.tags.forEach((tag) => {
    const node = document.createElement("span");
    node.className = "tag";
    node.textContent = tag;
    elements.previewTags.appendChild(node);
  });

  const updatedMeta = document.createElement("span");
  updatedMeta.textContent = `Maj: ${formatDate(note.updatedAt)}`;
  const reviewMeta = document.createElement("span");
  reviewMeta.textContent = `Revision: ${describeReviewState(note)}`;
  elements.previewMeta.appendChild(updatedMeta);
  elements.previewMeta.appendChild(reviewMeta);
}

function renderConnections(note = getActiveNote()) {
  if (!note) {
    return;
  }

  const outgoing = unique(extractLinks(note.content));
  const backlinks = getBacklinks(note.title, note.id);
  const suggested = getSuggestedLinks(note).map((item) => item.title);
  const outline = extractOutline(note.content);
  const backlinkContexts = getBacklinkContexts(note.title, note.id);

  renderChipCollection(elements.outgoingLinks, outgoing, "Aucun lien sortant");
  renderChipCollection(elements.backlinks, backlinks, "Aucun backlink");
  renderChipCollection(
    elements.suggestedLinks,
    suggested,
    "Aucune suggestion pour le moment"
  );
  renderChipCollection(elements.noteOutline, outline, "Aucun sous-titre detecte", false);
  renderInsightList(elements.backlinkContexts, backlinkContexts, "Aucun contexte de backlink");
}

function renderChipCollection(container, values, emptyMessage, interactive = true) {
  container.innerHTML = "";

  if (!values.length) {
    const empty = document.createElement("span");
    empty.className = "pill pill-soft";
    empty.textContent = emptyMessage;
    container.appendChild(empty);
    return;
  }

  values.forEach((value) => {
    const chip = document.createElement(interactive ? "button" : "span");
    if (interactive) {
      chip.type = "button";
      chip.dataset.linkTitle = value;
    }
    chip.className = "chip";
    chip.textContent = value;
    container.appendChild(chip);
  });
}

function renderStats(draftNote = null) {
  const sourceNotes = draftNote
    ? state.notes.map((note) => (note.id === draftNote.id ? draftNote : note))
    : state.notes;
  const totalLinks = sourceNotes.reduce((count, note) => {
    return count + unique(extractLinks(note.content)).length;
  }, 0);
  const orphanNotes = sourceNotes.filter((note) => isOrphanNote(note, sourceNotes)).length;
  const dueCount = getDueNotes(sourceNotes).length;

  elements.pageTotalCount.textContent = String(sourceNotes.length);
  elements.linkCount.textContent = String(totalLinks);
  elements.orphanCount.textContent = String(orphanNotes);
  elements.quizCount.textContent = String(dueCount);
}

function saveCurrentNote() {
  if (isReadOnlyMode()) {
    return;
  }

  const current = getActiveNote();
  if (!current) {
    return;
  }

  const previousTitle = current.title;
  const nextTitle = elements.titleInput.value.trim() || "Sans titre";

  current.title = nextTitle;
  current.type = elements.typeInput.value;
  current.tags = parseTags(elements.tagsInput.value);
  current.favorite = elements.favoriteInput.checked;
  current.content = elements.contentInput.value.trim();
  current.updatedAt = new Date().toISOString();

  if (previousTitle !== nextTitle) {
    renameLinksAcrossNotes(previousTitle, nextTitle, current.id);
  }

  saveNotes();
  saveAutomaticSnapshot(`Maj ${current.title}`);
  renderEverything();
}

function renameLinksAcrossNotes(previousTitle, nextTitle, activeId) {
  state.notes.forEach((note) => {
    if (note.id === activeId) {
      return;
    }

    note.content = note.content.replaceAll(
      `[[${previousTitle}]]`,
      `[[${nextTitle}]]`
    );
  });
}

function exportNotes() {
  downloadJsonFile("knowledge-base.json", state.notes);
}

function importNotes(event) {
  if (isReadOnlyMode()) {
    event.target.value = "";
    return;
  }

  const [file] = event.target.files || [];
  if (!file) {
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!Array.isArray(parsed)) {
        throw new Error("Format invalide");
      }

      state.notes = parsed.map(normalizeImportedNote);
      state.activeNoteId = state.notes[0]?.id ?? null;
      saveNotes();
      saveAutomaticSnapshot("Import JSON");
      renderEverything();
      event.target.value = "";
    } catch (error) {
      alert("Impossible d'importer ce fichier JSON.");
    }
  };

  reader.readAsText(file);
}

function createEmptyNote() {
  const title = generateUntitledName();
  const now = new Date().toISOString();
  return {
    id: generateId(title),
    title,
    type: "concept",
    favorite: false,
    tags: [],
    content: `# ${title}

Idee centrale :

- 

Liens utiles : [[Systeme personnel]]`,
    createdAt: now,
    updatedAt: now,
    review: createReviewState(),
  };
}

function generateUntitledName() {
  let index = state.notes.length + 1;
  let candidate = `Nouvelle page ${index}`;

  while (state.notes.some((note) => note.title === candidate)) {
    index += 1;
    candidate = `Nouvelle page ${index}`;
  }

  return candidate;
}

function getBacklinks(title, excludedId) {
  return state.notes
    .filter((note) => note.id !== excludedId && extractLinks(note.content).includes(title))
    .map((note) => note.title);
}

function getSuggestedLinks(note) {
  const text = `${note.title} ${note.content}`.toLowerCase();
  const outgoing = new Set(extractLinks(note.content));

  return state.notes
    .filter((candidate) => candidate.id !== note.id)
    .map((candidate) => {
      const tagHits = candidate.tags.reduce((count, tag) => {
        return count + (text.includes(tag.toLowerCase()) ? 1 : 0);
      }, 0);
      const titleHit = text.includes(candidate.title.toLowerCase()) ? 2 : 0;
      return {
        title: candidate.title,
        score: tagHits + titleHit,
      };
    })
    .filter((candidate) => candidate.score > 0 && !outgoing.has(candidate.title))
    .sort((left, right) => right.score - left.score)
    .slice(0, 6);
}

function getBacklinkContexts(title, excludedId) {
  return state.notes
    .filter((note) => note.id !== excludedId && extractLinks(note.content).includes(title))
    .map((note) => {
      const snippet = extractLinkContext(note.content, title);
      return {
        title: note.title,
        body: snippet || "Le lien est present dans cette page.",
      };
    });
}

function extractLinkContext(content, title) {
  const lines = content.split("\n").map((line) => line.trim()).filter(Boolean);
  const target = `[[${title}]]`;
  const match = lines.find((line) => line.includes(target));
  return match ? match.replace(target, title) : "";
}

function extractOutline(content) {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("## "))
    .map((line) => line.slice(3));
}

function renderInsightList(container, items, emptyMessage) {
  container.innerHTML = "";

  if (!items.length) {
    const empty = document.createElement("span");
    empty.className = "pill pill-soft";
    empty.textContent = emptyMessage;
    container.appendChild(empty);
    return;
  }

  items.forEach((item) => {
    const card = document.createElement("article");
    card.className = "insight-card";
    card.innerHTML = `
      <strong>${escapeHtml(item.title)}</strong>
      <p>${escapeHtml(item.body)}</p>
    `;
    container.appendChild(card);
  });
}

function renderDueReviewList() {
  const dueNotes = getDueNotes().slice(0, 6);
  elements.dueReviewCount.textContent = `${dueNotes.length} a revoir`;
  elements.dueReviewList.innerHTML = "";

  if (!dueNotes.length) {
    const empty = document.createElement("span");
    empty.className = "pill pill-soft";
    empty.textContent = "Rien d'urgent pour l'instant";
    elements.dueReviewList.appendChild(empty);
    return;
  }

  dueNotes.forEach((note) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "due-item";
    button.innerHTML = `
      <strong>${escapeHtml(note.title)}</strong>
      <p>${escapeHtml(noteTypeLabels[note.type] || "Concept")} | ${escapeHtml(
        note.tags.slice(0, 2).join(" | ") || "Sans tag"
      )}</p>
    `;
    button.addEventListener("click", () => {
      state.activeNoteId = note.id;
      state.activeTab = "knowledge";
      renderEverything();
    });
    elements.dueReviewList.appendChild(button);
  });
}

function renderPublishCenter() {
  const lastUpdated = state.notes.reduce((latest, note) => {
    return Date.parse(note.updatedAt || "") > Date.parse(latest || "") ? note.updatedAt : latest;
  }, "");
  const lastSnapshot = state.snapshots[0] ?? null;

  elements.publishStatusCopy.textContent = isReadOnlyMode()
    ? "Vous consultez le snapshot publie. Pour modifier, basculez vers l'espace local."
    : "Votre espace local contient vos brouillons, revisions et captures rapides.";

  elements.publishMeta.innerHTML = `
    <span>Version donnees: v${dataVersion}</span>
    <span>Pages: ${state.notes.length}</span>
    <span>Derniere maj locale: ${formatDate(lastUpdated)}</span>
    <span>Dernier snapshot: ${lastSnapshot ? formatDate(lastSnapshot.createdAt) : "aucun"}</span>
  `;

  elements.snapshotList.innerHTML = "";

  if (!state.snapshots.length) {
    const empty = document.createElement("span");
    empty.className = "pill pill-soft";
    empty.textContent = "Aucun snapshot local enregistre";
    elements.snapshotList.appendChild(empty);
  } else {
    state.snapshots.slice(0, 6).forEach((snapshot) => {
      const item = document.createElement("article");
      item.className = "snapshot-item";
      item.innerHTML = `
        <strong>${escapeHtml(snapshot.label)}</strong>
        <span>${escapeHtml(formatDate(snapshot.createdAt))}</span>
        <span>${snapshot.noteCount} pages</span>
      `;

      const button = document.createElement("button");
      button.type = "button";
      button.className = "button";
      button.textContent = "Restaurer";
      button.disabled = isReadOnlyMode();
      button.addEventListener("click", () => restoreSnapshotById(snapshot.id));
      item.appendChild(button);
      elements.snapshotList.appendChild(item);
    });
  }

  const disableMutating = isReadOnlyMode();
  elements.saveSnapshotButton.disabled = disableMutating;
  elements.restoreLatestSnapshotButton.disabled = disableMutating || !state.snapshots.length;
}

function renderQuickCapture() {
  elements.quickCapturePanel.classList.toggle("is-hidden", !state.quickCaptureOpen);
}

function toggleQuickCapture() {
  if (isReadOnlyMode()) {
    return;
  }

  state.quickCaptureOpen = !state.quickCaptureOpen;
  renderQuickCapture();
}

function saveQuickCapture() {
  if (isReadOnlyMode()) {
    return;
  }

  const title = elements.quickTitle.value.trim() || generateUntitledName();
  const active = getActiveNote();
  const shouldLink = elements.quickLinkActive.checked && active;
  const tags = parseTags(elements.quickTags.value);
  const body = elements.quickContent.value.trim();
  const now = new Date().toISOString();
  const note = {
    id: generateId(title),
    title,
    type: "concept",
    favorite: false,
    tags,
    content: `# ${title}

${body || "Idee a developper."}${shouldLink ? `\n\nVoir aussi : [[${active.title}]]` : ""}`,
    createdAt: now,
    updatedAt: now,
    review: createReviewState(),
  };

  state.notes.unshift(note);
  state.activeNoteId = note.id;
  elements.quickTitle.value = "";
  elements.quickTags.value = "";
  elements.quickContent.value = "";
  elements.quickLinkActive.checked = true;
  state.quickCaptureOpen = false;
  saveNotes();
  saveAutomaticSnapshot("Capture rapide");
  renderEverything();
}

function syncDynamicControls() {
  populateSelect(
    elements.typeFilter,
    [{ value: "all", label: "Tous les types" }, ...Object.keys(noteTypeLabels).map((type) => ({
      value: type,
      label: noteTypeLabels[type],
    }))],
    state.typeFilter
  );

  const tagOptions = [
    { value: "all", label: "Tous les tags" },
    ...getAllTags().map((tag) => ({ value: tag, label: tag })),
  ];
  populateSelect(elements.tagFilter, tagOptions, state.tagFilter);
  populateSelect(elements.graphTagFilter, tagOptions, state.graphTagFilter);
  elements.favoritesFilter.checked = state.favoritesOnly;
  elements.graphFocusMode.value = state.graphFocusMode;
}

function populateSelect(select, options, selectedValue) {
  const previous = selectedValue ?? select.value;
  select.innerHTML = "";
  options.forEach((option) => {
    const node = document.createElement("option");
    node.value = option.value;
    node.textContent = option.label;
    node.selected = option.value === previous;
    select.appendChild(node);
  });
}

function renderNoteHtml(content) {
  const blocks = [];
  const lines = content.split("\n");
  let listBuffer = [];

  const flushList = () => {
    if (!listBuffer.length) {
      return;
    }

    blocks.push(`<ul>${listBuffer.map((item) => `<li>${item}</li>`).join("")}</ul>`);
    listBuffer = [];
  };

  lines.forEach((line) => {
    const trimmed = line.trim();

    if (!trimmed) {
      flushList();
      return;
    }

    if (trimmed.startsWith("- ")) {
      listBuffer.push(renderInline(trimmed.slice(2)));
      return;
    }

    flushList();

    if (trimmed.startsWith("## ")) {
      blocks.push(`<h2>${renderInline(trimmed.slice(3))}</h2>`);
      return;
    }

    if (trimmed.startsWith("# ")) {
      blocks.push(`<h1>${renderInline(trimmed.slice(2))}</h1>`);
      return;
    }

    blocks.push(`<p>${renderInline(trimmed)}</p>`);
  });

  flushList();
  return blocks.join("");
}

function renderInline(text) {
  const escaped = escapeHtml(text);
  return escaped.replace(/\[\[([^[\]]+)\]\]/g, (_, title) => {
    const safeTitle = escapeHtml(title.trim());
    return `<a class="note-link" data-link-title="${safeTitle}">${safeTitle}</a>`;
  });
}

function handleRenderedLinkClick(event) {
  const link = event.target.closest("[data-link-title]");
  if (!link) {
    return;
  }

  openOrCreateNote(link.dataset.linkTitle);
}

function handleChipClick(event) {
  const chip = event.target.closest("[data-link-title]");
  if (!chip) {
    return;
  }

  openOrCreateNote(chip.dataset.linkTitle);
}

function handleSuggestedLinkClick(event) {
  if (isReadOnlyMode()) {
    return;
  }

  const chip = event.target.closest("[data-link-title]");
  if (!chip) {
    return;
  }

  const note = getActiveNote();
  if (!note) {
    return;
  }

  const title = chip.dataset.linkTitle;
  const separator = note.content.trim().endsWith("\n") ? "" : "\n";
  note.content = `${note.content}${separator}\nVoir aussi : [[${title}]]`;
  note.updatedAt = new Date().toISOString();
  saveNotes();
  renderEverything();
}

function openOrCreateNote(title) {
  const normalized = title.trim().toLowerCase();
  const existing = state.notes.find((note) => note.title.toLowerCase() === normalized);

  if (existing) {
    state.activeNoteId = existing.id;
    state.activeTab = "knowledge";
    renderEverything();
    return;
  }

  if (isReadOnlyMode()) {
    return;
  }

  const now = new Date().toISOString();
  const note = {
    id: generateId(title),
    title: title.trim(),
    type: "concept",
    favorite: false,
    tags: [],
    content: `# ${title.trim()}

Definition :

- 
`,
    createdAt: now,
    updatedAt: now,
    review: createReviewState(),
  };

  state.notes.unshift(note);
  state.activeNoteId = note.id;
  state.activeTab = "knowledge";
  saveNotes();
  renderEverything();
}

function drawGraph() {
  const notes = getGraphNotes();
  const width = 960;
  const height = 620;
  const centerX = width / 2;
  const centerY = height / 2;
  const noteByTitle = new Map(notes.map((note) => [note.title, note]));
  const edges = [];

  notes.forEach((note) => {
    unique(extractLinks(note.content)).forEach((title) => {
      const target = noteByTitle.get(title);
      if (target) {
        edges.push({ from: note.id, to: target.id });
      }
    });
  });

  notes.forEach((note, index) => {
    if (!state.graphPositions.has(note.id)) {
      const angle = (Math.PI * 2 * index) / Math.max(notes.length, 1);
      state.graphPositions.set(note.id, {
        x: centerX + Math.cos(angle) * 180,
        y: centerY + Math.sin(angle) * 180,
      });
    }
  });

  for (let pass = 0; pass < 180; pass += 1) {
    const forces = new Map(notes.map((note) => [note.id, { x: 0, y: 0 }]));

    for (let i = 0; i < notes.length; i += 1) {
      for (let j = i + 1; j < notes.length; j += 1) {
        const first = notes[i];
        const second = notes[j];
        const a = state.graphPositions.get(first.id);
        const b = state.graphPositions.get(second.id);
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        const distance = Math.max(Math.hypot(dx, dy), 1);
        const repulsion = 2800 / (distance * distance);
        dx /= distance;
        dy /= distance;

        forces.get(first.id).x += dx * repulsion;
        forces.get(first.id).y += dy * repulsion;
        forces.get(second.id).x -= dx * repulsion;
        forces.get(second.id).y -= dy * repulsion;
      }
    }

    edges.forEach((edge) => {
      const from = state.graphPositions.get(edge.from);
      const to = state.graphPositions.get(edge.to);
      let dx = to.x - from.x;
      let dy = to.y - from.y;
      const distance = Math.max(Math.hypot(dx, dy), 1);
      const spring = (distance - 140) * 0.008;
      dx /= distance;
      dy /= distance;

      forces.get(edge.from).x += dx * spring;
      forces.get(edge.from).y += dy * spring;
      forces.get(edge.to).x -= dx * spring;
      forces.get(edge.to).y -= dy * spring;
    });

    notes.forEach((note) => {
      const position = state.graphPositions.get(note.id);
      const force = forces.get(note.id);
      position.x += force.x + (centerX - position.x) * 0.002;
      position.y += force.y + (centerY - position.y) * 0.002;
      position.x = clamp(position.x, 60, width - 60);
      position.y = clamp(position.y, 60, height - 60);
    });
  }

  elements.graphCanvas.innerHTML = "";

  if (!notes.length) {
    renderGraphFocus();
    return;
  }

  edges.forEach((edge) => {
    const from = state.graphPositions.get(edge.from);
    const to = state.graphPositions.get(edge.to);
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", from.x);
    line.setAttribute("y1", from.y);
    line.setAttribute("x2", to.x);
    line.setAttribute("y2", to.y);
    line.setAttribute("class", "graph-edge");
    elements.graphCanvas.appendChild(line);
  });

  notes.forEach((note) => {
    const position = state.graphPositions.get(note.id);
    const current = note.id === state.activeNoteId;
    const degree = getNodeDegree(note.id, edges);
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    group.dataset.nodeId = note.id;
    group.style.cursor = "pointer";

    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", position.x);
    circle.setAttribute("cy", position.y);
    circle.setAttribute("r", String(current ? 20 + Math.min(degree, 3) : 14 + Math.min(degree, 4)));
    circle.setAttribute("class", `graph-node${current ? " is-current" : ""}`);
    circle.setAttribute("fill", getTypeColor(note.type));

    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", position.x + 24);
    label.setAttribute("y", position.y + 4);
    label.setAttribute("class", "graph-label");
    label.textContent = note.title;

    group.appendChild(circle);
    group.appendChild(label);
    elements.graphCanvas.appendChild(group);
  });

  renderGraphFocus();
}

function handleGraphClick(event) {
  const group = event.target.closest("[data-node-id]");
  if (!group) {
    return;
  }

  state.activeNoteId = group.dataset.nodeId;
  renderEverything();
}

function renderGraphFocus() {
  const note = getActiveNote();
  if (!note) {
    elements.graphFocus.innerHTML = "<p>Aucune page selectionnee.</p>";
    return;
  }

  const outgoing = unique(extractLinks(note.content));
  const backlinks = getBacklinks(note.title, note.id);

  elements.graphFocus.innerHTML = `
    <p><strong>${escapeHtml(note.title)}</strong></p>
    <p>${escapeHtml(extractSummary(note.content))}</p>
    <p><strong>Type :</strong> ${escapeHtml(noteTypeLabels[note.type] || "Concept")}</p>
    <p><strong>Liens sortants :</strong> ${escapeHtml(outgoing.join(", ") || "Aucun")}</p>
    <p><strong>Backlinks :</strong> ${escapeHtml(backlinks.join(", ") || "Aucun")}</p>
    <button type="button" class="button" data-open-active-note>Ouvrir cette page</button>
  `;
}

function handleGraphFocusClick(event) {
  const button = event.target.closest("[data-open-active-note]");
  if (!button) {
    return;
  }

  state.activeTab = "knowledge";
  renderEverything();
}

function buildQuizSession() {
  const available = generateQuizQuestions(getQuizNotes(), elements.quizMode.value);
  const amount = clamp(Number(elements.quizAmount.value) || 6, 3, 20);
  const picked = shuffle(available).slice(0, amount);
  state.quiz = {
    questions: picked,
    index: 0,
    score: 0,
    answerVisible: false,
  };
  renderQuizCard();
}

function showQuizAnswer() {
  if (!state.quiz.questions.length || state.quiz.index >= state.quiz.questions.length) {
    return;
  }

  state.quiz.answerVisible = true;
  renderQuizCard();
}

function scoreQuiz(isCorrect) {
  if (!state.quiz.questions.length || state.quiz.index >= state.quiz.questions.length) {
    return;
  }

  const current = state.quiz.questions[state.quiz.index];
  if (isCorrect) {
    state.quiz.score += 1;
  }

  if (current?.noteId) {
    updateReviewState(current.noteId, isCorrect);
  }

  state.quiz.index += 1;
  state.quiz.answerVisible = false;
  saveNotes();
  renderStats();
  renderDueReviewList();
  renderQuizCard();
}

function renderQuizCard() {
  const total = state.quiz.questions.length;

  if (!total) {
    elements.quizTitle.textContent = "Aucun quiz lance";
    elements.quizProgress.textContent = "0 / 0";
    elements.quizCard.className = "quiz-card empty-state";
    elements.quizCard.textContent =
      "Le quiz apparaitra ici a partir de vos connaissances.";
    elements.quizSummary.textContent =
      "Ajoutez des definitions, des relations ou des listes pour produire plus de questions.";
    return;
  }

  if (state.quiz.index >= total) {
    elements.quizTitle.textContent = "Session terminee";
    elements.quizProgress.textContent = `${total} / ${total}`;
    elements.quizCard.className = "quiz-card";
    elements.quizCard.innerHTML = `
      <h4>Score final : ${state.quiz.score} / ${total}</h4>
      <p>Relancez un quiz pour continuer la revision active.</p>
    `;
    elements.quizSummary.textContent =
      "Conseil : les paires \"Concept : definition\" donnent les meilleures questions.";
    return;
  }

  const current = state.quiz.questions[state.quiz.index];
  elements.quizTitle.textContent = "Quiz de revision";
  elements.quizProgress.textContent = `${state.quiz.index + 1} / ${total}`;
  elements.quizCard.className = "quiz-card";
  elements.quizCard.innerHTML = `
    <h4>${escapeHtml(current.question)}</h4>
    <p><strong>Source :</strong> ${escapeHtml(current.source)}</p>
    <p><strong>Mode :</strong> ${escapeHtml(current.modeLabel)}</p>
    ${
      current.choices.length
        ? `<div class="chip-list">${current.choices
            .map((choice) => `<span class="pill pill-soft">${escapeHtml(choice)}</span>`)
            .join("")}</div>`
        : "<p>Essayez de repondre sans regarder la reponse.</p>"
    }
    ${
      state.quiz.answerVisible
        ? `<p><strong>Reponse :</strong> ${escapeHtml(current.answer)}</p>`
        : `<p>Utilisez "Voir la reponse" apres avoir tente un rappel actif.</p>`
    }
  `;
  elements.quizSummary.textContent = state.quiz.answerVisible
    ? "Indiquez ensuite si vous connaissiez la reponse."
    : "Repondez mentalement avant de reveler la reponse.";
}

function getQuizNotes() {
  const scope = elements.quizScope.value;
  const active = getActiveNote();

  if (scope === "current") {
    return active ? [active] : [];
  }

  if (scope === "tag") {
    const tag = elements.quizTag.value.trim().toLowerCase();
    return state.notes.filter((note) =>
      note.tags.some((candidate) => candidate.toLowerCase() === tag)
    );
  }

  if (scope === "due") {
    return getDueNotes();
  }

  return state.notes;
}

function generateQuizQuestions(notes, mode = "mixed") {
  const questions = [];
  const titlePool = notes.map((note) => note.title);
  const answerPool = buildAnswerPool(notes);

  notes.forEach((note) => {
    const lines = note.content
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    lines.forEach((line) => {
      if (line.startsWith("#")) {
        return;
      }

      if (line.includes(" : ")) {
        const [concept, ...rest] = line.split(" : ");
        const answer = rest.join(" : ").trim();
        if (concept && answer && (mode === "mixed" || mode === "definition")) {
          questions.push({
            noteId: note.id,
            source: note.title,
            question: `Que signifie "${concept.trim()}" ?`,
            answer,
            choices: buildChoices(answer, answerPool),
            mode: "definition",
            modeLabel: "Definition",
          });
        }
      }

      if (line.startsWith("- ")) {
        const statement = line.slice(2).trim();
        const words = statement.split(" ");
        if (words.length > 3 && (mode === "mixed" || mode === "bullet")) {
          const hidden = words[0];
          questions.push({
            noteId: note.id,
            source: note.title,
            question: `Completez : ${statement.replace(hidden, "...")}`,
            answer: statement,
            choices: buildChoices(statement, answerPool),
            mode: "bullet",
            modeLabel: "Phrase a completer",
          });
        }
      }

      const relation = line.match(/^(.+?) est (.+)$/i);
      if (relation && (mode === "mixed" || mode === "definition")) {
        questions.push({
          noteId: note.id,
          source: note.title,
          question: `Qu'est-ce que "${relation[1].trim()}" ?`,
          answer: relation[2].trim(),
          choices: buildChoices(relation[2].trim(), answerPool),
          mode: "definition",
          modeLabel: "Definition",
        });
      }
    });

    if (mode === "mixed" || mode === "link") {
      unique(extractLinks(note.content)).forEach((linkedTitle) => {
        questions.push({
          noteId: note.id,
          source: note.title,
          question: `Quelle page est liee depuis "${note.title}" ?`,
          answer: linkedTitle,
          choices: buildChoices(linkedTitle, titlePool),
          mode: "link",
          modeLabel: "Lien",
        });
      });
    }
  });

  return deduplicateQuestions(questions);
}

function buildChoices(answer, titlePool) {
  const others = shuffle(
    titlePool.filter((title) => title.toLowerCase() !== answer.toLowerCase())
  ).slice(0, 3);
  return shuffle([answer, ...others]);
}

function buildAnswerPool(notes) {
  const values = [];

  notes.forEach((note) => {
    values.push(note.title);
    note.content
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line) => {
        if (line.includes(" : ")) {
          const [, ...rest] = line.split(" : ");
          const answer = rest.join(" : ").trim();
          if (answer) {
            values.push(answer);
          }
        }

        if (line.startsWith("- ")) {
          values.push(line.slice(2).trim());
        }

        const relation = line.match(/^(.+?) est (.+)$/i);
        if (relation) {
          values.push(relation[2].trim());
        }
      });
  });

  return unique(values.filter(Boolean));
}

function deduplicateQuestions(questions) {
  const seen = new Set();
  return questions.filter((item) => {
    const key = `${item.source}|${item.question}|${item.answer}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function extractLinks(content) {
  return [...content.matchAll(/\[\[([^[\]]+)\]\]/g)].map((match) => match[1].trim());
}

function getFilteredNotes() {
  const ordered = [...state.notes].sort((left, right) => {
    return left.title.localeCompare(right.title, "fr", { sensitivity: "base" });
  });

  return ordered.filter((note) => {
    const haystack = `${note.title} ${note.tags.join(" ")} ${note.content}`.toLowerCase();
    if (state.filter && !haystack.includes(state.filter)) {
      return false;
    }

    if (state.typeFilter !== "all" && note.type !== state.typeFilter) {
      return false;
    }

    if (
      state.tagFilter !== "all" &&
      !note.tags.some((tag) => tag.toLowerCase() === state.tagFilter.toLowerCase())
    ) {
      return false;
    }

    if (state.favoritesOnly && !note.favorite) {
      return false;
    }

    return true;
  });
}

function getActiveNote() {
  return state.notes.find((note) => note.id === state.activeNoteId) ?? null;
}

function parseTags(value) {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function normalizeImportedNote(note) {
  const title =
    typeof note.title === "string" && note.title.trim() ? note.title.trim() : "Sans titre";

  return {
    id: typeof note.id === "string" && note.id.trim() ? note.id : generateId(title),
    title,
    type: typeof note.type === "string" && noteTypeLabels[note.type] ? note.type : "concept",
    favorite: Boolean(note.favorite),
    tags: Array.isArray(note.tags)
      ? note.tags.map(String).map((tag) => tag.trim()).filter(Boolean)
      : [],
    content: typeof note.content === "string" ? note.content : "",
    createdAt: typeof note.createdAt === "string" ? note.createdAt : new Date().toISOString(),
    updatedAt: typeof note.updatedAt === "string" ? note.updatedAt : new Date().toISOString(),
    review: createReviewState(note.review),
  };
}

function loadNotes() {
  try {
    const raw = window.localStorage.getItem(appStorageKey) || window.localStorage.getItem(storageKey);
    if (!raw) {
      return structuredClone(defaultKnowledge);
    }

    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.notes)) {
      return parsed.notes.map(normalizeImportedNote);
    }
    return Array.isArray(parsed)
      ? parsed.map(normalizeImportedNote)
      : structuredClone(defaultKnowledge);
  } catch (error) {
    return structuredClone(defaultKnowledge);
  }
}

async function loadPublishedNotesIfNeeded() {
  const params = new URLSearchParams(window.location.search);
  const forcePublished = params.get("source") === "published";
  const hasLocalData = Boolean(window.localStorage.getItem(storageKey));

  if (hasLocalData && !forcePublished) {
    return;
  }

  try {
    const response = await fetch("./knowledge-base.json", { cache: "no-store" });
    if (!response.ok) {
      return;
    }

    const parsed = await response.json();
    if (!Array.isArray(parsed) || !parsed.length) {
      return;
    }

    state.notes = parsed.map(normalizeImportedNote);
    if (!forcePublished) {
      saveNotes();
    }
  } catch (error) {
    // Ignore if no published dataset is available.
  }
}

function saveNotes() {
  const payload = {
    version: dataVersion,
    updatedAt: new Date().toISOString(),
    settings: state.settings,
    notes: state.notes,
  };
  window.localStorage.setItem(appStorageKey, JSON.stringify(payload));
  window.localStorage.setItem(storageKey, JSON.stringify(state.notes));
}

function loadSettings() {
  try {
    const raw = window.localStorage.getItem(appStorageKey);
    if (!raw) {
      return {
        publishedUrl: "",
        lastPublishAt: null,
      };
    }

    const parsed = JSON.parse(raw);
    return {
      publishedUrl: typeof parsed?.settings?.publishedUrl === "string" ? parsed.settings.publishedUrl : "",
      lastPublishAt:
        typeof parsed?.settings?.lastPublishAt === "string" ? parsed.settings.lastPublishAt : null,
    };
  } catch (error) {
    return {
      publishedUrl: "",
      lastPublishAt: null,
    };
  }
}

function loadSnapshots() {
  try {
    const raw = window.localStorage.getItem(snapshotStorageKey);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function saveSnapshots() {
  window.localStorage.setItem(snapshotStorageKey, JSON.stringify(state.snapshots));
}

function createReviewState(review = {}) {
  return {
    streak: Number(review?.streak) || 0,
    lastReviewedAt: typeof review?.lastReviewedAt === "string" ? review.lastReviewedAt : null,
    nextReviewAt:
      typeof review?.nextReviewAt === "string"
        ? review.nextReviewAt
        : new Date().toISOString(),
  };
}

function getSourceMode() {
  const params = new URLSearchParams(window.location.search);
  return params.get("source") === "published" ? "published" : "workspace";
}

function isReadOnlyMode() {
  return state.sourceMode === "published";
}

function buildPublishedUrl() {
  if (state.settings.publishedUrl) {
    return state.settings.publishedUrl;
  }

  const url = new URL(window.location.href);
  url.searchParams.set("source", "published");
  return url.toString();
}

function downloadJsonFile(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function downloadPublishedSnapshot() {
  const payload = state.notes.map((note) => normalizeImportedNote(note));
  state.settings.lastPublishAt = new Date().toISOString();
  state.settings.publishedUrl = buildPublishedUrl();
  saveNotes();
  downloadJsonFile("knowledge-base.json", payload);
  renderPublishCenter();
}

function downloadFullBackup() {
  const payload = {
    version: dataVersion,
    exportedAt: new Date().toISOString(),
    settings: state.settings,
    notes: state.notes,
    snapshots: state.snapshots,
  };
  downloadJsonFile("atlas-connaissance-backup.json", payload);
}

async function copyPublishedLink() {
  const url = buildPublishedUrl();
  state.settings.publishedUrl = url;
  saveNotes();

  try {
    await navigator.clipboard.writeText(url);
    elements.publishStatusCopy.textContent = "Lien publie copie dans le presse-papiers.";
  } catch (error) {
    elements.publishStatusCopy.textContent = `Lien publie: ${url}`;
  }
}

function saveManualSnapshot() {
  if (isReadOnlyMode()) {
    return;
  }

  saveAutomaticSnapshot("Snapshot manuel");
  renderPublishCenter();
}

function saveAutomaticSnapshot(label) {
  const now = new Date().toISOString();
  const snapshot = {
    id: `${Date.now()}`,
    label,
    createdAt: now,
    noteCount: state.notes.length,
    notes: state.notes.map((note) => normalizeImportedNote(note)),
  };
  state.snapshots.unshift(snapshot);
  state.snapshots = state.snapshots.slice(0, 12);
  saveSnapshots();
}

function restoreLatestSnapshot() {
  if (!state.snapshots.length || isReadOnlyMode()) {
    return;
  }

  restoreSnapshotById(state.snapshots[0].id);
}

function restoreSnapshotById(snapshotId) {
  if (isReadOnlyMode()) {
    return;
  }

  const snapshot = state.snapshots.find((item) => item.id === snapshotId);
  if (!snapshot) {
    return;
  }

  state.notes = snapshot.notes.map(normalizeImportedNote);
  state.activeNoteId = state.notes[0]?.id ?? null;
  saveNotes();
  renderEverything();
}

function updateReviewState(noteId, isCorrect) {
  const note = state.notes.find((candidate) => candidate.id === noteId);
  if (!note) {
    return;
  }

  const review = createReviewState(note.review);
  const now = new Date();

  if (isCorrect) {
    review.streak = Math.min(review.streak + 1, reviewIntervalsInHours.length - 1);
  } else {
    review.streak = 0;
  }

  review.lastReviewedAt = now.toISOString();
  review.nextReviewAt = new Date(
    now.getTime() + reviewIntervalsInHours[review.streak] * 60 * 60 * 1000
  ).toISOString();
  note.review = review;
  note.updatedAt = now.toISOString();
}

function getDueNotes(sourceNotes = state.notes) {
  const now = Date.now();
  return sourceNotes
    .filter((note) => {
      const next = Date.parse(note.review?.nextReviewAt || "");
      return Number.isNaN(next) || next <= now;
    })
    .sort((left, right) => {
      return Date.parse(left.review?.nextReviewAt || "") - Date.parse(right.review?.nextReviewAt || "");
    });
}

function isNoteDue(note) {
  const next = Date.parse(note.review?.nextReviewAt || "");
  return Number.isNaN(next) || next <= Date.now();
}

function describeReviewState(note) {
  if (isNoteDue(note)) {
    return "A revoir";
  }

  return `Prochaine: ${formatDate(note.review?.nextReviewAt)}`;
}

function getAllTags() {
  return unique(
    state.notes.flatMap((note) => note.tags).filter(Boolean).sort((left, right) => {
      return left.localeCompare(right, "fr", { sensitivity: "base" });
    })
  );
}

function isOrphanNote(note, sourceNotes = state.notes) {
  const outgoing = unique(extractLinks(note.content));
  const backlinks = sourceNotes.filter((candidate) => {
    return candidate.id !== note.id && extractLinks(candidate.content).includes(note.title);
  });
  return outgoing.length === 0 && backlinks.length === 0;
}

function getGraphNotes() {
  const base = state.graphTagFilter === "all"
    ? state.notes
    : state.notes.filter((note) =>
        note.tags.some((tag) => tag.toLowerCase() === state.graphTagFilter.toLowerCase())
      );

  if (state.graphFocusMode !== "neighbors") {
    return base;
  }

  const active = getActiveNote();
  if (!active) {
    return base;
  }

  const neighborTitles = new Set(unique(extractLinks(active.content)));
  getBacklinks(active.title, active.id).forEach((title) => neighborTitles.add(title));

  return base.filter((note) => note.id === active.id || neighborTitles.has(note.title));
}

function getNodeDegree(nodeId, edges) {
  return edges.filter((edge) => edge.from === nodeId || edge.to === nodeId).length;
}

function getTypeColor(type) {
  if (type === "hub") {
    return "#f2d8a7";
  }

  if (type === "procedure") {
    return "#d8ead9";
  }

  if (type === "question") {
    return "#f4d5cc";
  }

  return "#fffaf2";
}

function formatDate(value) {
  if (!value) {
    return "jamais";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "inconnue";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  const protocol = window.location.protocol;
  if (protocol !== "https:" && protocol !== "http:" && !window.location.hostname.includes("localhost")) {
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  });
}

function generateId(input) {
  const base =
    input
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "page";

  let candidate = base;
  let index = 2;

  while (state.notes.some((note) => note.id === candidate)) {
    candidate = `${base}-${index}`;
    index += 1;
  }

  return candidate;
}

function extractSummary(content) {
  return (
    content
      .replace(/[#*\-[\]]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 110) || "Aucun contenu"
  );
}

function unique(values) {
  return values.filter((value, index, list) => list.indexOf(value) === index);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function shuffle(items) {
  const clone = [...items];
  for (let index = clone.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [clone[index], clone[swapIndex]] = [clone[swapIndex], clone[index]];
  }
  return clone;
}
