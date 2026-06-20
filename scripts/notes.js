(function initializeNotesModule(global) {
  const AtlasApp = (global.AtlasApp = global.AtlasApp || {});

  AtlasApp.createNotesModule = function createNotesModule(context) {
    const {
      extractLinks,
      normalizeFlexibleDateInput,
      normalizeLinkTitle,
      normalizeTag,
      parseTags,
      unique,
    } = AtlasApp.helpers;
    const systemFolders = {
      triage: "à trier",
      dailyRoot: "Kevin Barbet",
      daily: "Daily",
    };

  function getFilteredNotes() {
    const ordered = [...context.state.notes].sort((left, right) => {
      return left.title.localeCompare(right.title, "fr", { sensitivity: "base" });
    });

    return ordered.filter((note) => {
      const haystack = `${note.title} ${note.tags.join(" ")} ${note.content}`.toLowerCase();
      if (context.state.filter && !haystack.includes(context.state.filter)) {
        return false;
      }

      if (context.state.typeFilter !== "all" && note.type !== context.state.typeFilter) {
        return false;
      }

      if (
        context.state.tagFilter !== "all" &&
        !note.tags.some((tag) => tag.toLowerCase() === context.state.tagFilter.toLowerCase())
      ) {
        return false;
      }

      if (context.state.favoritesOnly && !note.favorite) {
        return false;
      }

      return true;
    });
  }

  function getActiveNote() {
    return context.state.notes.find((note) => note.id === context.state.activeNoteId) ?? null;
  }

  function generateUntitledName() {
    let index = context.state.notes.length + 1;
    let candidate = `Nouvelle page ${index}`;

    while (context.state.notes.some((note) => note.title === candidate)) {
      index += 1;
      candidate = `Nouvelle page ${index}`;
    }

    return candidate;
  }

  function createNoteMetadata(overrides = {}) {
    return {
      hasDate: false,
      dateMode: "reference",
      singleDate: "",
      startDate: "",
      endDate: "",
      ...overrides,
    };
  }

  function getTodayFlexibleDate() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function createDailyMetadata() {
    return createNoteMetadata({
      hasDate: true,
      dateMode: "reference",
      singleDate: getTodayFlexibleDate(),
    });
  }

  function findNoteByTitle(title, options = {}) {
    const normalizedTitle = normalizeLinkTitle(title);
    const type = typeof options.type === "string" ? options.type : null;
    const parentId = options.parentId === undefined ? undefined : options.parentId;

    return (
      context.state.notes.find((note) => {
        if (normalizeLinkTitle(note.title) !== normalizedTitle) {
          return false;
        }

        if (type && note.type !== type) {
          return false;
        }

        if (parentId !== undefined && note.parentId !== parentId) {
          return false;
        }

        return true;
      }) ?? null
    );
  }

  function createFolderNote(title, parentId = null) {
    const now = new Date().toISOString();
    return {
      id: context.data.generateId(title),
      title,
      type: "folder",
      parentId,
      favorite: false,
      tags: [],
      content: `# ${title}`,
      quizQuestions: [],
      metadata: createNoteMetadata(),
      createdAt: now,
      updatedAt: now,
      review: context.data.createReviewState(),
    };
  }

  function ensureFolder(title, parentId = null) {
    const existing = findNoteByTitle(title, { parentId, type: "folder" });
    if (existing) {
      return existing;
    }

    const folder = createFolderNote(title, parentId);
    context.state.notes.unshift(folder);

    if (parentId) {
      const parent = context.state.notes.find((note) => note.id === parentId);
      if (parent) {
        ensureBidirectionalHierarchyLinks(parent, folder);
      }
    }

    return folder;
  }

  function ensureDefaultFolders() {
    const rootFolder = ensureFolder(systemFolders.dailyRoot);
    const dailyFolder = ensureFolder(systemFolders.daily, rootFolder.id);
    const triageFolder = ensureFolder(systemFolders.triage);
    const didChange = migrateDailyNotesToDefaultFolder(dailyFolder.id);
    return {
      rootFolder,
      dailyFolder,
      triageFolder,
      didChange,
    };
  }

  function migrateDailyNotesToDefaultFolder(targetDailyFolderId) {
    let didChange = false;

    context.state.notes.forEach((note) => {
      if (note.type !== "daily") {
        return;
      }

      const previousParentId = note.parentId;
      if (previousParentId === targetDailyFolderId) {
        return;
      }

      if (previousParentId) {
        const previousParent = context.state.notes.find(
          (candidate) => candidate.id === previousParentId
        );
        if (previousParent) {
          previousParent.content = removeWikiLinkLine(previousParent.content, note.title);
          note.content = removeWikiLinkLine(note.content, previousParent.title);
          previousParent.updatedAt = new Date().toISOString();
        }
      }

      note.parentId = targetDailyFolderId;
      note.updatedAt = new Date().toISOString();

      const targetParent = context.state.notes.find(
        (candidate) => candidate.id === targetDailyFolderId
      );
      if (targetParent) {
        ensureBidirectionalHierarchyLinks(targetParent, note);
      }

      didChange = true;
    });

    return didChange;
  }

  function getDefaultParentIdForType(type) {
    if (type === "daily") {
      return ensureDefaultFolders().dailyFolder.id;
    }

    if (type === "folder") {
      return null;
    }

    return ensureDefaultFolders().triageFolder.id;
  }

  function hasAnyDateInput() {
    return Boolean(
      context.elements.noteDateSingle.value.trim() ||
        context.elements.noteDateStart.value.trim() ||
        context.elements.noteDateEnd.value.trim()
    );
  }

  function applyDailyDateToEditorIfEmpty() {
    if (context.elements.typeInput.value !== "daily" || hasAnyDateInput()) {
      return;
    }

    context.elements.noteHasDate.value = "true";
    context.elements.noteDateMode.value = "reference";
    context.elements.noteDateSingle.value = context.helpers.formatFlexibleDate(getTodayFlexibleDate());
    context.elements.noteDateStart.value = "";
    context.elements.noteDateEnd.value = "";
    context.renderers.renderStructuredFields();
  }

  function collectMetadataFromInputs() {
    const metadata = createNoteMetadata();
    metadata.dateMode = context.elements.noteDateMode.value;
    metadata.hasDate = metadata.dateMode !== "none";

    if (!metadata.hasDate) {
      metadata.dateMode = "reference";
      return metadata;
    }

    if (metadata.dateMode === "range" || metadata.dateMode === "life") {
      metadata.startDate = normalizeFlexibleDateInput(context.elements.noteDateStart.value);
      metadata.endDate = normalizeFlexibleDateInput(context.elements.noteDateEnd.value);
    } else {
      metadata.singleDate = normalizeFlexibleDateInput(context.elements.noteDateSingle.value);
    }

    return metadata;
  }

  function createEmptyNote() {
    const type = context.data.getNoteTypeEntries()[0]?.id || "concept";
    const title = "";
    const now = new Date().toISOString();
    return {
      id: context.data.generateId("page"),
      title,
      type,
      parentId: getDefaultParentIdForType(type),
      favorite: false,
      tags: [],
      content: "",
      quizQuestions: [],
      metadata: createNoteMetadata(),
      createdAt: now,
      updatedAt: now,
      review: context.data.createReviewState(),
    };
  }

  function rememberEditorTemplateSeed(type, title, content) {
    context.state.editorTemplateSeed = {
      type,
      title,
      content,
    };
  }

  function clearEditorTemplateSeed() {
    context.state.editorTemplateSeed = null;
  }

  function rememberEditedNote(noteId) {
    if (!noteId) {
      return;
    }

    context.state.settings.lastEditedNoteId = noteId;
  }

  function isEditorUsingAutoTemplate() {
    const seed = context.state.editorTemplateSeed;
    if (!seed) {
      return !context.elements.contentInput.value.trim();
    }

    return context.elements.contentInput.value.trim() === seed.content.trim();
  }

  function applyEditorTemplate(type, title) {
    const content = context.data.buildTemplateContent(type, title || "Sans titre");
    context.elements.contentInput.value = content;
    rememberEditorTemplateSeed(type, title || "Sans titre", content);
    context.renderers.renderLivePreview();
  }

  function syncMarkdownHeadingWithTitle(nextTitle) {
    const content = context.elements.contentInput.value;
    if (!content) {
      context.elements.contentInput.value = `# ${nextTitle || "Sans titre"}`;
      return;
    }

    const lines = content.split("\n");
    const headingIndex = lines.findIndex((line) => line.trim().length > 0);
    if (headingIndex === -1) {
      context.elements.contentInput.value = `# ${nextTitle || "Sans titre"}`;
      return;
    }

    if (!lines[headingIndex].startsWith("# ")) {
      return;
    }

    lines[headingIndex] = `# ${nextTitle || "Sans titre"}`;
    context.elements.contentInput.value = lines.join("\n");
  }

  function getBacklinks(title, excludedId) {
    const targetTitle = normalizeLinkTitle(title);
    return context.state.notes
      .filter(
        (note) =>
          note.id !== excludedId &&
          extractLinks(note.content).some((linkTitle) => normalizeLinkTitle(linkTitle) === targetTitle)
      )
      .map((note) => note.title);
  }

  function getSuggestedLinks(note) {
    const text = `${note.title} ${note.content}`.toLowerCase();
    const outgoing = new Set(extractLinks(note.content).map((linkTitle) => normalizeLinkTitle(linkTitle)));

    return context.state.notes
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
      .filter(
        (candidate) =>
          candidate.score > 0 && !outgoing.has(normalizeLinkTitle(candidate.title))
      )
      .sort((left, right) => right.score - left.score)
      .slice(0, 6);
  }

  function getBacklinkContexts(title, excludedId) {
    const targetTitle = normalizeLinkTitle(title);
    return context.state.notes
      .filter(
        (note) =>
          note.id !== excludedId &&
          extractLinks(note.content).some((linkTitle) => normalizeLinkTitle(linkTitle) === targetTitle)
      )
      .map((note) => {
        const snippet = extractLinkContext(note.content, title);
        return {
          title: note.title,
          body: snippet || "Le lien est present dans cette page.",
        };
      });
  }

  function extractLinkContext(content, title) {
    const targetTitle = normalizeLinkTitle(title);
    const lines = content
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const match = lines.find((line) =>
      extractLinks(line).some((linkTitle) => normalizeLinkTitle(linkTitle) === targetTitle)
    );
    if (!match) {
      return "";
    }

    const matchingLink = extractLinks(match).find(
      (linkTitle) => normalizeLinkTitle(linkTitle) === targetTitle
    );
    return matchingLink ? match.replace(`[[${matchingLink}]]`, title) : match;
  }

  function extractOutline(content) {
    return content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("## "))
      .map((line) => line.slice(3));
  }

  function getParentNote(note) {
    return context.state.notes.find((candidate) => candidate.id === note.parentId) ?? null;
  }

  function getParentTitle(note) {
    return getParentNote(note)?.title ?? "";
  }

  function getChildNotes(noteId) {
    return context.state.notes.filter((candidate) => candidate.parentId === noteId);
  }

  function sanitizeParentId(noteId, parentId) {
    if (!parentId || parentId === noteId) {
      return null;
    }

    let currentParent = parentId;
    while (currentParent) {
      if (currentParent === noteId) {
        return null;
      }

      currentParent =
        context.state.notes.find((candidate) => candidate.id === currentParent)?.parentId || null;
    }

    return parentId;
  }

  function isPendingNewNote(note = getActiveNote()) {
    return Boolean(note && context.state.pendingNewNoteId === note.id);
  }

  function getEditorParentId(note = getActiveNote()) {
    if (!note) {
      return null;
    }

    const directClassify = Boolean(context.elements.directClassifyInput?.checked);
    if (isPendingNewNote(note) && !directClassify) {
      return sanitizeParentId(note.id, getDefaultParentIdForType(context.elements.typeInput.value));
    }

    return sanitizeParentId(note.id, context.elements.parentInput.value || null);
  }

  function syncNewPageClassificationControls() {
    const active = getActiveNote();
    const pending = isPendingNewNote(active);
    const directClassify = Boolean(context.elements.directClassifyInput?.checked);

    context.elements.directClassifyToggle?.classList.toggle("is-hidden", !pending);
    context.elements.parentField?.classList.toggle("is-hidden", !pending || !directClassify);

    if (pending && !directClassify) {
      context.elements.parentInput.value =
        getDefaultParentIdForType(context.elements.typeInput.value) || "";
    }
  }

  function handleEditorClassificationModeChange() {
    syncNewPageClassificationControls();
    context.renderers.renderLivePreview();
  }

  function canMoveNote(noteId, targetId) {
    if (!targetId || noteId === targetId) {
      return false;
    }

    return sanitizeParentId(noteId, targetId) === targetId;
  }

  function generateFolderName() {
    let index = 1;
    let candidate = `Nouveau dossier ${index}`;

    while (context.state.notes.some((note) => note.title === candidate)) {
      index += 1;
      candidate = `Nouveau dossier ${index}`;
    }

    return candidate;
  }

  function getHierarchyLinks(note) {
    const links = [];
    const parent = getParentNote(note);
    const children = getChildNotes(note.id);

    if (parent) {
      links.push(`Parent: ${parent.title}`);
    }

    children.forEach((child) => {
      links.push(`Enfant: ${child.title}`);
    });

    return links;
  }

  function ensureWikiLinkLine(content, title, label) {
    const targetTitle = normalizeLinkTitle(title);
    const lines = content.split("\n");
    if (
      lines.some((line) =>
        extractLinks(line).some((linkTitle) => normalizeLinkTitle(linkTitle) === targetTitle)
      )
    ) {
      return content;
    }

    const suffix = content.trim().endsWith("\n") ? "" : "\n";
    return `${content}${suffix}\n${label} : [[${title}]]`;
  }

  function removeWikiLinkLine(content, title) {
    const targetTitle = normalizeLinkTitle(title);
    return content
      .split("\n")
      .filter(
        (line) =>
          !extractLinks(line).some((linkTitle) => normalizeLinkTitle(linkTitle) === targetTitle)
      )
      .join("\n")
      .replace(/\n{3,}/g, "\n\n");
  }

  function ensureBidirectionalHierarchyLinks(parent, child) {
    parent.content = ensureWikiLinkLine(parent.content, child.title, "Contient");
    child.content = ensureWikiLinkLine(child.content, parent.title, "Dans");
    parent.updatedAt = new Date().toISOString();
    child.updatedAt = new Date().toISOString();
  }

  function buildHierarchyForest() {
    const buildNode = (note, ancestry = new Set()) => {
      const nextAncestry = new Set(ancestry);
      nextAncestry.add(note.id);

      return {
        ...note,
        children: getChildNotes(note.id)
          .filter((child) => !nextAncestry.has(child.id))
          .sort((left, right) => left.title.localeCompare(right.title, "fr", { sensitivity: "base" }))
          .map((child) => buildNode(child, nextAncestry)),
      };
    };

    return context.state.notes
      .filter((note) => {
        return (
          !note.parentId ||
          !context.state.notes.some((candidate) => candidate.id === note.parentId)
        );
      })
      .sort((left, right) => left.title.localeCompare(right.title, "fr", { sensitivity: "base" }))
      .map((note) => buildNode(note));
  }

  function getConnectionCount(note) {
    return unique(extractLinks(note.content)).length + getBacklinks(note.title, note.id).length;
  }

  function isFolderCollapsed(noteId) {
    return context.state.settings.collapsedFolders.includes(noteId);
  }

  function toggleFolderCollapse(noteId) {
    if (!noteId) {
      return;
    }

    if (isFolderCollapsed(noteId)) {
      context.state.settings.collapsedFolders = context.state.settings.collapsedFolders.filter(
        (id) => id !== noteId
      );
    } else {
      context.state.settings.collapsedFolders = [
        ...context.state.settings.collapsedFolders,
        noteId,
      ];
    }

    context.data.saveNotes();
    context.renderers.renderKnowledgeList();
    context.renderers.renderSidebarRecap();
    context.renderers.renderOrganization();
  }

  function getMostConnectedNotes() {
    return [...context.state.notes]
      .sort((left, right) => getConnectionCount(right) - getConnectionCount(left))
      .slice(0, 8);
  }

  function renameLinksAcrossNotes(previousTitle, nextTitle, activeId) {
    const targetTitle = normalizeLinkTitle(previousTitle);
    context.state.notes.forEach((note) => {
      if (note.id === activeId) {
        return;
      }

      note.content = note.content.replace(/\[\[([^[\]]+)\]\]/g, (match, linkedTitle) => {
        return normalizeLinkTitle(linkedTitle) === targetTitle ? `[[${nextTitle}]]` : match;
      });
    });
  }

  function saveCurrentNote(options = {}) {
    const { stayInEdit = false } = options;
    if (context.data.isReadOnlyMode()) {
      return;
    }

    const current = getActiveNote();
    if (!current) {
      return;
    }

    const previousTitle = current.title;
    const previousParentId = current.parentId;
    const nextTitle = context.elements.titleInput.value.trim() || "Sans titre";
    syncMarkdownHeadingWithTitle(nextTitle);

    current.title = nextTitle;
    current.type = context.elements.typeInput.value;
    current.tags = parseTags(context.elements.tagsInput.value);
    current.parentId = getEditorParentId(current);
    current.favorite = context.elements.favoriteInput.checked;
    current.content = context.elements.contentInput.value.trim();
    current.quizQuestions = context.data.normalizeQuizQuestionCollection(
      context.state.editorQuizQuestions,
      current.id
    );
    current.metadata = collectMetadataFromInputs();
    current.updatedAt = new Date().toISOString();
    rememberEditedNote(current.id);

    if (previousTitle !== nextTitle) {
      renameLinksAcrossNotes(previousTitle, nextTitle, current.id);
    }

    if (previousParentId && previousParentId !== current.parentId) {
      const previousParent = context.state.notes.find((note) => note.id === previousParentId);
      if (previousParent) {
        previousParent.content = removeWikiLinkLine(previousParent.content, current.title);
        current.content = removeWikiLinkLine(current.content, previousParent.title);
      }
    }

    if (current.parentId) {
      const parent = context.state.notes.find((note) => note.id === current.parentId);
      if (parent) {
        ensureBidirectionalHierarchyLinks(parent, current);
      }
    }

    context.state.editorQuizQuestions = context.data.normalizeQuizQuestionCollection(
      current.quizQuestions,
      current.id
    );
    context.state.editorQuizQuestionsNoteId = current.id;
    context.data.saveNotes();
    context.data.saveAutomaticSnapshot(`Maj ${current.title}`);
    if (context.state.pendingNewNoteId === current.id) {
      context.state.pendingNewNoteId = null;
      context.state.previousActiveNoteId = null;
    }
    context.state.noteViewMode = stayInEdit ? "edit" : "read";
    clearEditorTemplateSeed();
    context.renderers.renderEverything();
  }

  function discardPendingNewNote() {
    const pendingId = context.state.pendingNewNoteId;
    if (!pendingId) {
      return;
    }

    context.state.notes = context.state.notes.filter((note) => note.id !== pendingId);
    const fallbackNote =
      context.state.notes.find((note) => note.id === context.state.previousActiveNoteId) ??
      context.state.notes[0] ??
      null;

    context.state.activeNoteId = fallbackNote?.id ?? null;
    context.state.pendingNewNoteId = null;
    context.state.previousActiveNoteId = null;
    context.state.noteViewMode = "read";
    clearEditorTemplateSeed();
    context.data.saveNotes({ skipRemote: true });
    context.renderers.renderEverything();
  }

  function cancelEditingNote() {
    if (context.state.pendingNewNoteId === context.state.activeNoteId) {
      discardPendingNewNote();
      return;
    }

    context.state.noteViewMode = "read";
    clearEditorTemplateSeed();
    context.renderers.renderEverything();
  }

  function saveTemplate() {
    if (context.data.isReadOnlyMode()) {
      return;
    }

    const value =
      context.state.templateDrafts[context.state.activeTemplateType] ??
      context.elements.templateEditor.value;
    context.state.settings.templates = {
      ...context.data.getTemplates(),
      [context.state.activeTemplateType]: value,
    };
    context.state.templateDrafts[context.state.activeTemplateType] = value;
    context.data.saveNotes();
  }

  function resetTemplate() {
    if (context.data.isReadOnlyMode()) {
      return;
    }

    context.state.settings.templates = {
      ...context.data.getTemplates(),
      [context.state.activeTemplateType]:
        context.data.getDefaultTemplateForType(context.state.activeTemplateType),
    };
    context.state.templateDrafts[context.state.activeTemplateType] =
      context.state.settings.templates[context.state.activeTemplateType];
    context.data.saveNotes();
    context.renderers.renderTemplateEditor();
  }

  function addCustomType() {
    if (context.data.isReadOnlyMode()) {
      return;
    }

    const label = context.elements.newTypeLabelInput?.value.trim();
    if (!label) {
      return;
    }

    const id = context.data.generateId(`type-${label}`, []).replace(/^type-/, "") || "type";
    const reserved = new Set(context.data.getNoteTypeEntries().map((entry) => entry.id));
    let candidate = id;
    let index = 2;

    while (reserved.has(candidate)) {
      candidate = `${id}-${index}`;
      index += 1;
    }

    context.state.settings.customNoteTypes = [
      ...(context.state.settings.customNoteTypes || []),
      { id: candidate, label },
    ];
    context.elements.newTypeLabelInput.value = "";
    context.data.saveNotes();
    context.renderers.renderEverything();
  }

  function updateTypeLabel(type, label) {
    if (context.data.isReadOnlyMode()) {
      return;
    }

    const nextLabel = String(label || "").trim();
    if (!nextLabel) {
      return;
    }

    const customIndex = (context.state.settings.customNoteTypes || []).findIndex(
      (entry) => entry.id === type
    );

    if (customIndex >= 0) {
      context.state.settings.customNoteTypes[customIndex] = {
        ...context.state.settings.customNoteTypes[customIndex],
        label: nextLabel,
      };
    } else {
      context.state.settings.typeLabels = {
        ...(context.state.settings.typeLabels || {}),
        [type]: nextLabel,
      };
    }

    context.data.saveNotes();
  }

  function isTypeUsed(type) {
    return context.state.notes.some((note) => note.type === type);
  }

  function deleteCustomType(type) {
    if (context.data.isReadOnlyMode()) {
      return;
    }

    const customTypes = context.state.settings.customNoteTypes || [];
    if (isTypeUsed(type)) {
      return;
    }

    context.state.settings.customNoteTypes = customTypes.filter((entry) => entry.id !== type);
    context.state.settings.deletedNoteTypes = unique([
      ...(context.state.settings.deletedNoteTypes || []),
      type,
    ]);

    if (context.state.settings.templates?.[type]) {
      const templates = { ...context.state.settings.templates };
      delete templates[type];
      context.state.settings.templates = templates;
    }

    if (context.state.settings.typeLabels?.[type]) {
      const typeLabels = { ...context.state.settings.typeLabels };
      delete typeLabels[type];
      context.state.settings.typeLabels = typeLabels;
    }

    delete context.state.templateDrafts[type];

    context.data.saveNotes();
    context.renderers.renderEverything();
  }

  function handleEditorTypeChange() {
    syncNewPageClassificationControls();
    applyDailyDateToEditorIfEmpty();
    context.renderers.renderStructuredFields();
    clearEditorTemplateSeed();
    context.renderers.renderLivePreview();
  }

  function handleEditorTitleChange() {
    const note = getActiveNote();
    const title = context.elements.titleInput.value.trim() || note?.title || "Sans titre";

    syncMarkdownHeadingWithTitle(title);
    context.renderers.renderLivePreview();
  }

  function handleEditorContentChange() {
    if (!isEditorUsingAutoTemplate()) {
      clearEditorTemplateSeed();
    }

    const firstMeaningfulLine = context.elements.contentInput.value
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.length > 0);

    if (firstMeaningfulLine?.startsWith("# ")) {
      const nextTitle = firstMeaningfulLine.slice(2).trim() || "Sans titre";
      if (context.elements.titleInput.value !== nextTitle) {
        context.elements.titleInput.value = nextTitle;
      }
    }
  }

  function moveNoteToParent(noteId, parentId) {
    if (context.data.isReadOnlyMode()) {
      return;
    }

    const note = context.state.notes.find((candidate) => candidate.id === noteId);
    if (!note) {
      return;
    }

    const previousParentId = note.parentId;
    const sanitizedParentId = sanitizeParentId(note.id, parentId);
    note.parentId = sanitizedParentId;

    if (previousParentId && previousParentId !== sanitizedParentId) {
      const previousParent = context.state.notes.find((candidate) => candidate.id === previousParentId);
      if (previousParent) {
        previousParent.content = removeWikiLinkLine(previousParent.content, note.title);
        note.content = removeWikiLinkLine(note.content, previousParent.title);
      }
    }

    if (sanitizedParentId) {
      const parent = context.state.notes.find((candidate) => candidate.id === sanitizedParentId);
      if (parent) {
        context.state.settings.collapsedFolders = context.state.settings.collapsedFolders.filter(
          (id) => id !== sanitizedParentId
        );
        ensureBidirectionalHierarchyLinks(parent, note);
      }
    }

    note.updatedAt = new Date().toISOString();
    rememberEditedNote(note.id);
    context.data.saveNotes();
    context.data.saveAutomaticSnapshot(`Organisation ${note.title}`);
    resetDragState();
    context.renderers.renderEverything();
  }

  function moveNoteToRoot(noteId) {
    moveNoteToParent(noteId, null);
  }

  function duplicateNoteById(noteId) {
    if (context.data.isReadOnlyMode()) {
      return;
    }

    const source = context.state.notes.find((note) => note.id === noteId);
    if (!source) {
      return;
    }

    const now = new Date().toISOString();
    const duplicate = context.data.normalizeImportedNote(
      {
        ...source,
        id: context.data.generateId(`${source.title}-copie`),
        title: `${source.title} copie`,
        createdAt: now,
        updatedAt: now,
        review: context.data.createReviewState(),
      },
      context.state.notes
    );
    context.state.notes.unshift(duplicate);
    context.state.activeNoteId = duplicate.id;
    rememberEditedNote(duplicate.id);
    context.data.saveNotes();
    context.data.saveAutomaticSnapshot(`Duplication ${source.title}`);
    context.renderers.renderEverything();
  }

  function deleteNoteById(noteId) {
    if (context.data.isReadOnlyMode()) {
      return;
    }

    const note = context.state.notes.find((candidate) => candidate.id === noteId);
    if (!note) {
      return;
    }

    const confirmed = window.confirm(`Supprimer "${note.title}" ?`);
    if (!confirmed) {
      return;
    }

    context.state.notes = context.state.notes
      .filter((candidate) => candidate.id !== noteId)
      .map((candidate) => {
        if (candidate.parentId === noteId) {
          candidate.parentId = null;
        }
        candidate.content = removeWikiLinkLine(candidate.content, note.title);
        return candidate;
      });

    context.state.settings.collapsedFolders = context.state.settings.collapsedFolders.filter(
      (id) => id !== noteId
    );
    context.state.explorerMenuNoteId = null;
    context.state.organizationMenuNoteId = null;
    clearEditorTemplateSeed();

    if (context.state.activeNoteId === noteId) {
      context.state.activeNoteId = context.state.notes[0]?.id ?? null;
      context.state.noteViewMode = "read";
    }

    context.data.saveNotes();
    context.data.saveAutomaticSnapshot(`Suppression ${note.title}`);
    context.renderers.renderEverything();
  }

  function resetDragState() {
    context.state.dragState.noteId = null;
    context.state.dragState.dropTargetId = null;
    context.state.dragState.dropToRoot = false;
  }

  function clearOrganizationDropHighlights() {
    [context.elements.organizationTree, context.elements.knowledgeList].forEach((tree) => {
      tree
        ?.querySelectorAll("[data-note-id].is-drop-target, [data-note-id].is-dragging")
        .forEach((node) => {
          node.classList.remove("is-drop-target", "is-dragging");
        });
    });
    context.elements.organizationRootDrop?.classList.remove("is-over");
    context.elements.knowledgeList?.classList.remove("is-root-drop-target");
  }

  function highlightOrganizationTarget(targetId) {
    clearOrganizationDropHighlights();
    [context.elements.organizationTree, context.elements.knowledgeList].forEach((tree) => {
      const target = tree?.querySelector(`[data-note-id="${targetId}"]`);
      const source = context.state.dragState.noteId
        ? tree?.querySelector(`[data-note-id="${context.state.dragState.noteId}"]`)
        : null;

      if (target) {
        target.classList.add("is-drop-target");
      }

      if (source) {
        source.classList.add("is-dragging");
      }
    });
  }

  function createFolderFromOrganization() {
    if (context.data.isReadOnlyMode()) {
      return;
    }

    const title = generateFolderName();
    const now = new Date().toISOString();
    const active = getActiveNote();
    const previousActiveId = context.state.activeNoteId;
    const folder = {
      id: context.data.generateId(title),
      title,
      type: "folder",
      parentId: active?.type === "folder" ? active.id : null,
      favorite: false,
      tags: [],
      content: `# ${title}`,
      quizQuestions: [],
      metadata: createNoteMetadata(),
      createdAt: now,
      updatedAt: now,
      review: context.data.createReviewState(),
    };

    context.state.notes.unshift(folder);
    if (folder.parentId) {
      const parent = context.state.notes.find((note) => note.id === folder.parentId);
      if (parent) {
        ensureBidirectionalHierarchyLinks(parent, folder);
      }
    }

    context.state.previousActiveNoteId = previousActiveId;
    context.state.pendingNewNoteId = folder.id;
    context.state.activeNoteId = folder.id;
    context.state.activeTab = "knowledge";
    context.state.noteViewMode = "edit";
    context.state.organizationMenuNoteId = null;
    context.state.explorerMenuNoteId = null;
    context.data.saveNotes();
    context.data.saveAutomaticSnapshot("Creation dossier");
    context.renderers.renderEverything();
    window.requestAnimationFrame(() => {
      context.elements.titleInput.focus();
      context.elements.titleInput.select();
    });
  }

  function moveActiveNoteToRoot() {
    const active = getActiveNote();
    if (!active || context.data.isReadOnlyMode()) {
      return;
    }

    moveNoteToParent(active.id, null);
  }

  function openQuickCapture() {
    if (context.data.isReadOnlyMode()) {
      return;
    }

    context.state.quickCaptureOpen = true;
    context.elements.quickLinkActive.checked = false;
    if (context.elements.quickType) {
      context.elements.quickType.value = "concept";
    }
    context.renderers.renderQuickCapture();
    context.elements.quickTitle.focus();
  }

  function closeQuickCapture() {
    context.state.quickCaptureOpen = false;
    resetQuickCaptureDraft();
    context.renderers.renderQuickCapture();
  }

  function resetQuickCaptureDraft() {
    context.elements.quickTitle.value = "";
    context.elements.quickTags.value = "";
    context.elements.quickContent.value = "";
    context.elements.quickLinkActive.checked = false;
    if (context.elements.quickType) {
      context.elements.quickType.value = "concept";
    }
    context.renderers.renderTagSuggestions("quick");
  }

  function saveQuickCapture() {
    if (context.data.isReadOnlyMode()) {
      return;
    }

    const title = context.elements.quickTitle.value.trim() || generateUntitledName();
    const active = getActiveNote();
    const shouldLink = context.elements.quickLinkActive.checked && active;
    const tags = parseTags(context.elements.quickTags.value);
    const body = context.elements.quickContent.value.trim();
    const type = context.elements.quickType?.value || "concept";
    const parentId = getDefaultParentIdForType(type);
    const now = new Date().toISOString();
    const note = {
      id: context.data.generateId(title),
      title,
      type,
      parentId,
      favorite: false,
      tags,
      content: `# ${title}

${body || "Idee a developper."}${shouldLink ? `\n\nVoir aussi : [[${active.title}]]` : ""}`,
      quizQuestions: [],
      metadata: createNoteMetadata(),
      createdAt: now,
      updatedAt: now,
      review: context.data.createReviewState(),
    };

    if (note.parentId) {
      const parent = context.state.notes.find((candidate) => candidate.id === note.parentId);
      if (parent) {
        ensureBidirectionalHierarchyLinks(parent, note);
      }
    }

    context.state.notes.unshift(note);
    context.state.activeNoteId = note.id;
    rememberEditedNote(note.id);
    closeQuickCapture();
    context.data.saveNotes();
    context.data.saveAutomaticSnapshot("Note rapide");
    context.renderers.renderEverything();
  }

  function getFolderDescendantNotes(folderId) {
    if (!folderId) {
      return [];
    }

    const collected = [];
    const queue = [folderId];
    const seen = new Set();

    while (queue.length) {
      const currentId = queue.shift();
      if (!currentId || seen.has(currentId)) {
        continue;
      }

      seen.add(currentId);
      const note = context.state.notes.find((candidate) => candidate.id === currentId);
      if (note) {
        collected.push(note);
        getChildNotes(note.id).forEach((child) => queue.push(child.id));
      }
    }

    return collected;
  }

  function openOrCreateNote(title) {
    const normalized = normalizeLinkTitle(title);
    const existing = context.state.notes.find(
      (note) => normalizeLinkTitle(note.title) === normalized
    );

    if (existing) {
      context.state.activeNoteId = existing.id;
      context.state.activeTab = "knowledge";
      context.state.noteViewMode = "read";
      context.renderers.renderEverything();
      return;
    }

    if (context.data.isReadOnlyMode()) {
      return;
    }

    const trimmedTitle = title.trim();
    const now = new Date().toISOString();
    const note = {
      id: context.data.generateId(trimmedTitle),
      title: trimmedTitle,
      type: "concept",
      parentId: getDefaultParentIdForType("concept"),
      favorite: false,
      tags: [],
      content: `# ${trimmedTitle}`,
      quizQuestions: [],
      metadata: createNoteMetadata(),
      createdAt: now,
      updatedAt: now,
      review: context.data.createReviewState(),
    };

    context.state.notes.unshift(note);
    context.state.activeNoteId = note.id;
    context.state.activeTab = "knowledge";
    context.state.noteViewMode = "read";
    rememberEditedNote(note.id);
    context.data.saveNotes();
    context.renderers.renderEverything();
  }

  function appendSuggestedLinkToActiveNote(title) {
    if (context.data.isReadOnlyMode()) {
      return;
    }

    const note = getActiveNote();
    if (!note) {
      return;
    }

    const normalizedTitle = normalizeLinkTitle(title);
    if (extractLinks(note.content).some((linkTitle) => normalizeLinkTitle(linkTitle) === normalizedTitle)) {
      return;
    }

    const separator = note.content.trim().endsWith("\n") ? "" : "\n";
    note.content = `${note.content}${separator}\nVoir aussi : [[${title}]]`;
    note.updatedAt = new Date().toISOString();
    rememberEditedNote(note.id);
    context.data.saveNotes();
    context.renderers.renderEverything();
  }

  function getDueNotes(sourceNotes = context.state.notes) {
    const now = Date.now();
    return sourceNotes
      .filter((note) => {
        const next = Date.parse(note.review?.nextReviewAt || "");
        return Number.isNaN(next) || next <= now;
      })
      .sort((left, right) => {
        return (
          Date.parse(left.review?.nextReviewAt || "") -
          Date.parse(right.review?.nextReviewAt || "")
        );
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

    return `Prochaine: ${context.helpers.formatDate(note.review?.nextReviewAt)}`;
  }

  function getAllTags() {
    return unique(
      context.state.notes.flatMap((note) => note.tags).filter(Boolean).sort((left, right) => {
        return left.localeCompare(right, "fr", { sensitivity: "base" });
      })
    );
  }

  function renameTag(oldTag, nextTag) {
    if (context.data.isReadOnlyMode()) {
      return false;
    }

    const source = normalizeTag(oldTag);
    const target = normalizeTag(nextTag);
    if (!source || !target || source === target) {
      return false;
    }

    let didChange = false;

    context.state.notes.forEach((note) => {
      if (!Array.isArray(note.tags) || !note.tags.length) {
        return;
      }

      const hasSource = note.tags.some((tag) => normalizeTag(tag) === source);
      if (!hasSource) {
        return;
      }

      note.tags = unique(
        note.tags
          .map((tag) => (normalizeTag(tag) === source ? target : tag))
          .filter(Boolean)
      );
      didChange = true;
    });

    if (!didChange) {
      return false;
    }

    if (context.state.tagFilter && normalizeTag(context.state.tagFilter) === source) {
      context.state.tagFilter = target;
    }

    if (context.state.graphTagFilter && normalizeTag(context.state.graphTagFilter) === source) {
      context.state.graphTagFilter = target;
    }

    if (context.state.timeline?.tag && normalizeTag(context.state.timeline.tag) === source) {
      context.state.timeline.tag = target;
    }

    if (context.elements.quizTag && normalizeTag(context.elements.quizTag.value) === source) {
      context.elements.quizTag.value = target;
    }

    if (
      context.state.graphSelection?.kind === "tag" &&
      normalizeTag(context.state.graphSelection.id.replace("tag::", "")) === source
    ) {
      context.state.graphSelection = { kind: "tag", id: `tag::${target}` };
    }

    context.data.saveNotes();
    context.renderers.renderEverything();
    return true;
  }

  function isOrphanNote(note, sourceNotes = context.state.notes) {
    const outgoing = unique(extractLinks(note.content));
    const backlinks = sourceNotes.filter((candidate) => {
      return candidate.id !== note.id && extractLinks(candidate.content).includes(note.title);
    });
    const hasParent = Boolean(note.parentId);
    const hasChildren = sourceNotes.some((candidate) => candidate.parentId === note.id);
    return outgoing.length === 0 && backlinks.length === 0 && !hasParent && !hasChildren;
  }

  return {
    addCustomType,
    appendSuggestedLinkToActiveNote,
    buildHierarchyForest,
    cancelEditingNote,
    canMoveNote,
    clearOrganizationDropHighlights,
    closeQuickCapture,
    createEmptyNote,
    createFolderFromOrganization,
    deleteNoteById,
    describeReviewState,
    duplicateNoteById,
    extractLinkContext,
    extractOutline,
    getActiveNote,
    getAllTags,
    getBacklinkContexts,
    getBacklinks,
    getChildNotes,
    collectMetadataFromInputs,
    getConnectionCount,
    getDueNotes,
    getFilteredNotes,
    getFolderDescendantNotes,
    getHierarchyLinks,
    getMostConnectedNotes,
    ensureDefaultFolders,
    getDefaultParentIdForType,
    getEditorParentId,
    getParentNote,
    getParentTitle,
    getSuggestedLinks,
    highlightOrganizationTarget,
    handleEditorClassificationModeChange,
    handleEditorContentChange,
    handleEditorTitleChange,
    handleEditorTypeChange,
    isFolderCollapsed,
    isNoteDue,
    isOrphanNote,
    renameTag,
    moveActiveNoteToRoot,
    moveNoteToParent,
    moveNoteToRoot,
    openOrCreateNote,
    openQuickCapture,
    discardPendingNewNote,
    removeWikiLinkLine,
    resetDragState,
    resetTemplate,
    sanitizeParentId,
    saveCurrentNote,
    saveQuickCapture,
    saveTemplate,
    syncNewPageClassificationControls,
    toggleFolderCollapse,
    deleteCustomType,
    isTypeUsed,
    updateTypeLabel,
  };
  };
})(window);
