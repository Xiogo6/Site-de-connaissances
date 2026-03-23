const defaultKnowledge = [
  {
    id: "memoire-active",
    title: "Memoire active",
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
  },
  {
    id: "revision-active",
    title: "Revision active",
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
  },
  {
    id: "charge-cognitive",
    title: "Charge cognitive",
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
  },
  {
    id: "systeme-personnel",
    title: "Systeme personnel",
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
  },
];

const storageKey = "atlas-connaissance-notes";

const state = {
  notes: loadNotes(),
  activeNoteId: null,
  filter: "",
  graphPositions: new Map(),
  activeTab: "knowledge",
  quiz: {
    questions: [],
    index: 0,
    score: 0,
    answerVisible: false,
  },
};

const elements = {
  searchInput: document.querySelector("#search-input"),
  knowledgeList: document.querySelector("#knowledge-list"),
  pageCount: document.querySelector("#page-count"),
  newNoteButton: document.querySelector("#new-note-button"),
  duplicateNoteButton: document.querySelector("#duplicate-note-button"),
  exportButton: document.querySelector("#export-button"),
  importInput: document.querySelector("#import-input"),
  tabs: [...document.querySelectorAll(".tab")],
  panels: {
    knowledge: document.querySelector("#knowledge-tab"),
    graph: document.querySelector("#graph-tab"),
    quiz: document.querySelector("#quiz-tab"),
  },
  titleInput: document.querySelector("#note-title"),
  tagsInput: document.querySelector("#note-tags"),
  contentInput: document.querySelector("#note-content"),
  saveButton: document.querySelector("#save-button"),
  previewTitle: document.querySelector("#preview-title"),
  previewTags: document.querySelector("#preview-tags"),
  previewContent: document.querySelector("#preview-content"),
  noteStatus: document.querySelector("#note-status"),
  outgoingLinks: document.querySelector("#outgoing-links"),
  backlinks: document.querySelector("#backlinks"),
  suggestedLinks: document.querySelector("#suggested-links"),
  linkCount: document.querySelector("#link-count"),
  backlinkCount: document.querySelector("#backlink-count"),
  quizCount: document.querySelector("#quiz-count"),
  graphCanvas: document.querySelector("#graph-canvas"),
  graphFocus: document.querySelector("#graph-focus"),
  resetGraphButton: document.querySelector("#reset-graph-button"),
  quizScope: document.querySelector("#quiz-scope"),
  quizTagWrapper: document.querySelector("#quiz-tag-wrapper"),
  quizTag: document.querySelector("#quiz-tag"),
  quizAmount: document.querySelector("#quiz-amount"),
  generateQuizButton: document.querySelector("#generate-quiz-button"),
  quizTitle: document.querySelector("#quiz-title"),
  quizProgress: document.querySelector("#quiz-progress"),
  quizCard: document.querySelector("#quiz-card"),
  showAnswerButton: document.querySelector("#show-answer-button"),
  markCorrectButton: document.querySelector("#mark-correct-button"),
  markWrongButton: document.querySelector("#mark-wrong-button"),
  quizSummary: document.querySelector("#quiz-summary"),
};

init();

function init() {
  if (!state.notes.length) {
    state.notes = structuredClone(defaultKnowledge);
    saveNotes();
  }

  state.activeNoteId = state.notes[0]?.id ?? null;
  bindEvents();
  renderEverything();
}

function bindEvents() {
  elements.searchInput.addEventListener("input", (event) => {
    state.filter = event.target.value.trim().toLowerCase();
    renderKnowledgeList();
  });

  elements.newNoteButton.addEventListener("click", () => {
    const note = createEmptyNote();
    state.notes.unshift(note);
    state.activeNoteId = note.id;
    saveNotes();
    renderEverything();
    elements.titleInput.focus();
  });

  elements.duplicateNoteButton.addEventListener("click", () => {
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
  elements.tagsInput.addEventListener("input", renderLivePreview);
  elements.contentInput.addEventListener("input", renderLivePreview);

  elements.exportButton.addEventListener("click", exportNotes);
  elements.importInput.addEventListener("change", importNotes);

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

  elements.quizScope.addEventListener("change", () => {
    elements.quizTagWrapper.classList.toggle(
      "is-hidden",
      elements.quizScope.value !== "tag"
    );
    renderStats();
  });

  elements.quizTag.addEventListener("input", renderStats);
  elements.generateQuizButton.addEventListener("click", buildQuizSession);
  elements.showAnswerButton.addEventListener("click", showQuizAnswer);
  elements.markCorrectButton.addEventListener("click", () => scoreQuiz(true));
  elements.markWrongButton.addEventListener("click", () => scoreQuiz(false));

  elements.previewContent.addEventListener("click", handleRenderedLinkClick);
  elements.outgoingLinks.addEventListener("click", handleChipClick);
  elements.backlinks.addEventListener("click", handleChipClick);
  elements.suggestedLinks.addEventListener("click", handleSuggestedLinkClick);
  elements.graphFocus.addEventListener("click", handleGraphFocusClick);

  window.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      saveCurrentNote();
    }
  });
}

function renderEverything() {
  renderTabs();
  renderKnowledgeList();
  hydrateEditorFromActiveNote();
  renderPreview();
  renderConnections();
  renderStats();
  drawGraph();
  renderQuizCard();
}

function renderTabs() {
  elements.tabs.forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.tab === state.activeTab);
  });

  Object.entries(elements.panels).forEach(([key, panel]) => {
    panel.classList.toggle("is-active", key === state.activeTab);
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
    button.innerHTML = `
      <strong>${escapeHtml(note.title)}</strong>
      <p>${escapeHtml(extractSummary(note.content))}</p>
      <small>${escapeHtml(note.tags.slice(0, 3).join(" · ") || "Sans tag")}</small>
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
  elements.tagsInput.value = note.tags.join(", ");
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
    tags: parseTags(elements.tagsInput.value),
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
  elements.previewContent.innerHTML = renderNoteHtml(note.content);
  elements.noteStatus.textContent = isDraft ? "Brouillon" : "Synchronise";

  note.tags.forEach((tag) => {
    const node = document.createElement("span");
    node.className = "tag";
    node.textContent = tag;
    elements.previewTags.appendChild(node);
  });
}

function renderConnections(note = getActiveNote()) {
  if (!note) {
    return;
  }

  const outgoing = unique(extractLinks(note.content));
  const backlinks = getBacklinks(note.title, note.id);
  const suggested = getSuggestedLinks(note).map((item) => item.title);

  renderChipCollection(elements.outgoingLinks, outgoing, "Aucun lien sortant");
  renderChipCollection(elements.backlinks, backlinks, "Aucun backlink");
  renderChipCollection(
    elements.suggestedLinks,
    suggested,
    "Aucune suggestion pour le moment"
  );
}

function renderChipCollection(container, values, emptyMessage) {
  container.innerHTML = "";

  if (!values.length) {
    const empty = document.createElement("span");
    empty.className = "pill pill-soft";
    empty.textContent = emptyMessage;
    container.appendChild(empty);
    return;
  }

  values.forEach((value) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.dataset.linkTitle = value;
    chip.textContent = value;
    container.appendChild(chip);
  });
}

function renderStats(draftNote = null) {
  const note = draftNote ?? getActiveNote();
  const outgoing = note ? unique(extractLinks(note.content)).length : 0;
  const backlinks = note ? getBacklinks(note.title, note.id).length : 0;
  const quizCandidates = generateQuizQuestions(getQuizNotes()).length;

  elements.linkCount.textContent = String(outgoing);
  elements.backlinkCount.textContent = String(backlinks);
  elements.quizCount.textContent = String(quizCandidates);
}

function saveCurrentNote() {
  const current = getActiveNote();
  if (!current) {
    return;
  }

  const previousTitle = current.title;
  const nextTitle = elements.titleInput.value.trim() || "Sans titre";

  current.title = nextTitle;
  current.tags = parseTags(elements.tagsInput.value);
  current.content = elements.contentInput.value.trim();
  current.updatedAt = new Date().toISOString();

  if (previousTitle !== nextTitle) {
    renameLinksAcrossNotes(previousTitle, nextTitle, current.id);
  }

  saveNotes();
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
  const payload = JSON.stringify(state.notes, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "atlas-connaissance.json";
  anchor.click();
  URL.revokeObjectURL(url);
}

function importNotes(event) {
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
    tags: [],
    content: `# ${title}

Idee centrale :

- 

Liens utiles : [[Systeme personnel]]`,
    createdAt: now,
    updatedAt: now,
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

  const now = new Date().toISOString();
  const note = {
    id: generateId(title),
    title: title.trim(),
    tags: [],
    content: `# ${title.trim()}

Definition :

- 
`,
    createdAt: now,
    updatedAt: now,
  };

  state.notes.unshift(note);
  state.activeNoteId = note.id;
  state.activeTab = "knowledge";
  saveNotes();
  renderEverything();
}

function drawGraph() {
  const notes = state.notes;
  const width = 960;
  const height = 620;
  const centerX = width / 2;
  const centerY = height / 2;
  const noteByTitle = new Map(notes.map((note) => [note.title, note]));
  const edges = [];

  notes.forEach((note) => {
    extractLinks(note.content).forEach((title) => {
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
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    group.dataset.nodeId = note.id;
    group.style.cursor = "pointer";

    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", position.x);
    circle.setAttribute("cy", position.y);
    circle.setAttribute("r", current ? "20" : "16");
    circle.setAttribute("class", `graph-node${current ? " is-current" : ""}`);

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
  const available = generateQuizQuestions(getQuizNotes());
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

  if (isCorrect) {
    state.quiz.score += 1;
  }

  state.quiz.index += 1;
  state.quiz.answerVisible = false;
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

  return state.notes;
}

function generateQuizQuestions(notes) {
  const questions = [];
  const titlePool = notes.map((note) => note.title);

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
        if (concept && answer) {
          questions.push({
            source: note.title,
            question: `Que signifie "${concept.trim()}" ?`,
            answer,
            choices: buildChoices(answer, titlePool),
          });
        }
      }

      if (line.startsWith("- ")) {
        const statement = line.slice(2).trim();
        const words = statement.split(" ");
        if (words.length > 3) {
          const hidden = words[0];
          questions.push({
            source: note.title,
            question: `Completez : ${statement.replace(hidden, "...")}`,
            answer: statement,
            choices: buildChoices(statement, titlePool),
          });
        }
      }

      const relation = line.match(/^(.+?) est (.+)$/i);
      if (relation) {
        questions.push({
          source: note.title,
          question: `Qu'est-ce que "${relation[1].trim()}" ?`,
          answer: relation[2].trim(),
          choices: buildChoices(relation[2].trim(), titlePool),
        });
      }
    });

    unique(extractLinks(note.content)).forEach((linkedTitle) => {
      questions.push({
        source: note.title,
        question: `Quelle page est liee depuis "${note.title}" ?`,
        answer: linkedTitle,
        choices: buildChoices(linkedTitle, titlePool),
      });
    });
  });

  return deduplicateQuestions(questions);
}

function buildChoices(answer, titlePool) {
  const others = shuffle(
    titlePool.filter((title) => title.toLowerCase() !== answer.toLowerCase())
  ).slice(0, 3);
  return shuffle([answer, ...others]);
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

  if (!state.filter) {
    return ordered;
  }

  return ordered.filter((note) => {
    const haystack = `${note.title} ${note.tags.join(" ")} ${note.content}`.toLowerCase();
    return haystack.includes(state.filter);
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
    tags: Array.isArray(note.tags)
      ? note.tags.map(String).map((tag) => tag.trim()).filter(Boolean)
      : [],
    content: typeof note.content === "string" ? note.content : "",
    createdAt: typeof note.createdAt === "string" ? note.createdAt : new Date().toISOString(),
    updatedAt: typeof note.updatedAt === "string" ? note.updatedAt : new Date().toISOString(),
  };
}

function loadNotes() {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return structuredClone(defaultKnowledge);
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.map(normalizeImportedNote)
      : structuredClone(defaultKnowledge);
  } catch (error) {
    return structuredClone(defaultKnowledge);
  }
}

function saveNotes() {
  window.localStorage.setItem(storageKey, JSON.stringify(state.notes));
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
