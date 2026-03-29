(function initializeNotesModule(global) {
  const AtlasApp = (global.AtlasApp = global.AtlasApp || {});

  AtlasApp.createNotesModule = function createNotesModule(context) {
    const { extractLinks, parseTags, unique } = AtlasApp.helpers;
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

  function createEmptyNote() {
    const title = generateUntitledName();
    const now = new Date().toISOString();
    return {
      id: context.data.generateId(title),
      title,
      type: "concept",
      parentId: null,
      favorite: false,
      tags: [],
      content: context.data.buildTemplateContent("concept", title),
      createdAt: now,
      updatedAt: now,
      review: context.data.createReviewState(),
    };
  }

  function getBacklinks(title, excludedId) {
    return context.state.notes
      .filter((note) => note.id !== excludedId && extractLinks(note.content).includes(title))
      .map((note) => note.title);
  }

  function getSuggestedLinks(note) {
    const text = `${note.title} ${note.content}`.toLowerCase();
    const outgoing = new Set(extractLinks(note.content));

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
      .filter((candidate) => candidate.score > 0 && !outgoing.has(candidate.title))
      .sort((left, right) => right.score - left.score)
      .slice(0, 6);
  }

  function getBacklinkContexts(title, excludedId) {
    return context.state.notes
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
    const lines = content
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
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

  function canMoveNote(noteId, targetId) {
    if (!targetId || noteId === targetId) {
      return false;
    }

    return sanitizeParentId(noteId, targetId) === targetId;
  }

  function getFolderMoveOptions(noteId) {
    return context.state.notes
      .filter((note) => note.id !== noteId && (note.type === "folder" || note.type === "hub"))
      .filter((note) => canMoveNote(noteId, note.id))
      .sort((left, right) => left.title.localeCompare(right.title, "fr", { sensitivity: "base" }));
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
    const marker = `[[${title}]]`;
    if (content.includes(marker)) {
      return content;
    }

    const suffix = content.trim().endsWith("\n") ? "" : "\n";
    return `${content}${suffix}\n${label} : ${marker}`;
  }

  function removeWikiLinkLine(content, title) {
    return content
      .split("\n")
      .filter((line) => !line.includes(`[[${title}]]`))
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
    context.renderers.renderOrganization();
  }

  function getMostConnectedNotes() {
    return [...context.state.notes]
      .sort((left, right) => getConnectionCount(right) - getConnectionCount(left))
      .slice(0, 8);
  }

  function renameLinksAcrossNotes(previousTitle, nextTitle, activeId) {
    context.state.notes.forEach((note) => {
      if (note.id === activeId) {
        return;
      }

      note.content = note.content.replaceAll(`[[${previousTitle}]]`, `[[${nextTitle}]]`);
    });
  }

  function saveCurrentNote() {
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

    current.title = nextTitle;
    current.type = context.elements.typeInput.value;
    current.tags = parseTags(context.elements.tagsInput.value);
    current.parentId = sanitizeParentId(
      current.id,
      context.elements.parentInput.value || null
    );
    current.favorite = context.elements.favoriteInput.checked;
    current.content = context.elements.contentInput.value.trim();
    current.updatedAt = new Date().toISOString();

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
        if (parent.type !== "folder") {
          parent.type = "folder";
        }
        ensureBidirectionalHierarchyLinks(parent, current);
      }
    }

    context.data.saveNotes();
    context.data.saveAutomaticSnapshot(`Maj ${current.title}`);
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
        context.data.getDefaultSettings().templates[context.state.activeTemplateType],
    };
    context.state.templateDrafts[context.state.activeTemplateType] =
      context.state.settings.templates[context.state.activeTemplateType];
    context.data.saveNotes();
    context.renderers.renderTemplateEditor();
  }

  function applyTemplateToActiveNote() {
    if (context.data.isReadOnlyMode()) {
      return;
    }

    const note = getActiveNote();
    if (!note) {
      return;
    }

    const title = context.elements.titleInput.value.trim() || note.title || "Sans titre";
    const type = context.elements.typeInput.value;
    context.elements.contentInput.value = context.data.buildTemplateContent(type, title);
    context.renderers.renderLivePreview();
  }

  function exportNotes() {
    context.data.downloadJsonFile("knowledge-base.json", context.state.notes);
  }

  function importNotes(event) {
    if (context.data.isReadOnlyMode()) {
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

        context.state.notes = context.data.normalizeNoteCollection(parsed);
        context.state.activeNoteId = context.state.notes[0]?.id ?? null;
        context.data.saveNotes();
        context.data.saveAutomaticSnapshot("Import JSON");
        context.renderers.renderEverything();
        event.target.value = "";
      } catch (error) {
        alert("Impossible d'importer ce fichier JSON.");
      }
    };

    reader.readAsText(file);
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
        if (parent.type !== "folder") {
          parent.type = "folder";
        }
        context.state.settings.collapsedFolders = context.state.settings.collapsedFolders.filter(
          (id) => id !== sanitizedParentId
        );
        ensureBidirectionalHierarchyLinks(parent, note);
      }
    }

    note.updatedAt = new Date().toISOString();
    context.data.saveNotes();
    context.data.saveAutomaticSnapshot(`Organisation ${note.title}`);
    resetDragState();
    context.renderers.renderEverything();
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

    if (context.state.activeNoteId === noteId) {
      context.state.activeNoteId = context.state.notes[0]?.id ?? null;
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
    context.elements.organizationTree
      ?.querySelectorAll(".hierarchy-node.is-drop-target, .hierarchy-node.is-dragging")
      .forEach((node) => {
        node.classList.remove("is-drop-target", "is-dragging");
      });
    context.elements.organizationRootDrop?.classList.remove("is-over");
  }

  function highlightOrganizationTarget(targetId) {
    clearOrganizationDropHighlights();
    const target = context.elements.organizationTree?.querySelector(
      `[data-note-id="${targetId}"]`
    );
    const source = context.state.dragState.noteId
      ? context.elements.organizationTree?.querySelector(
          `[data-note-id="${context.state.dragState.noteId}"]`
        )
      : null;

    if (target) {
      target.classList.add("is-drop-target");
    }

    if (source) {
      source.classList.add("is-dragging");
    }
  }

  function createFolderFromOrganization() {
    if (context.data.isReadOnlyMode()) {
      return;
    }

    const title = generateFolderName();
    const now = new Date().toISOString();
    const active = getActiveNote();
    const folder = {
      id: context.data.generateId(title),
      title,
      type: "folder",
      parentId: active?.type === "folder" ? active.id : null,
      favorite: false,
      tags: ["dossier"],
      content: context.data.buildTemplateContent("folder", title),
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

    context.state.activeNoteId = folder.id;
    context.data.saveNotes();
    context.data.saveAutomaticSnapshot("Creation dossier");
    context.renderers.renderEverything();
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
    context.renderers.renderQuickCapture();
    context.elements.quickTitle.focus();
  }

  function closeQuickCapture() {
    context.state.quickCaptureOpen = false;
    context.renderers.renderQuickCapture();
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
    const now = new Date().toISOString();
    const note = {
      id: context.data.generateId(title),
      title,
      type: "concept",
      parentId: shouldLink ? active.id : null,
      favorite: false,
      tags,
      content: `# ${title}

${body || "Idee a developper."}${shouldLink ? `\n\nVoir aussi : [[${active.title}]]` : ""}`,
      createdAt: now,
      updatedAt: now,
      review: context.data.createReviewState(),
    };

    if (note.parentId && active) {
      if (active.type !== "folder") {
        active.type = "folder";
      }
      ensureBidirectionalHierarchyLinks(active, note);
    }

    context.state.notes.unshift(note);
    context.state.activeNoteId = note.id;
    context.elements.quickTitle.value = "";
    context.elements.quickTags.value = "";
    context.elements.quickContent.value = "";
    context.elements.quickLinkActive.checked = true;
    closeQuickCapture();
    context.data.saveNotes();
    context.data.saveAutomaticSnapshot("Capture rapide");
    context.renderers.renderEverything();
  }

  function openOrCreateNote(title) {
    const normalized = title.trim().toLowerCase();
    const existing = context.state.notes.find((note) => note.title.toLowerCase() === normalized);

    if (existing) {
      context.state.activeNoteId = existing.id;
      context.state.activeTab = "knowledge";
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
      parentId: null,
      favorite: false,
      tags: [],
      content: context.data.buildTemplateContent("concept", trimmedTitle),
      createdAt: now,
      updatedAt: now,
      review: context.data.createReviewState(),
    };

    context.state.notes.unshift(note);
    context.state.activeNoteId = note.id;
    context.state.activeTab = "knowledge";
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

    const separator = note.content.trim().endsWith("\n") ? "" : "\n";
    note.content = `${note.content}${separator}\nVoir aussi : [[${title}]]`;
    note.updatedAt = new Date().toISOString();
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
    appendSuggestedLinkToActiveNote,
    applyTemplateToActiveNote,
    buildHierarchyForest,
    canMoveNote,
    clearOrganizationDropHighlights,
    closeQuickCapture,
    createEmptyNote,
    createFolderFromOrganization,
    deleteNoteById,
    describeReviewState,
    duplicateNoteById,
    exportNotes,
    extractLinkContext,
    extractOutline,
    getActiveNote,
    getAllTags,
    getBacklinkContexts,
    getBacklinks,
    getChildNotes,
    getConnectionCount,
    getDueNotes,
    getFilteredNotes,
    getFolderMoveOptions,
    getHierarchyLinks,
    getMostConnectedNotes,
    getParentNote,
    getParentTitle,
    getSuggestedLinks,
    highlightOrganizationTarget,
    importNotes,
    isFolderCollapsed,
    isNoteDue,
    isOrphanNote,
    moveActiveNoteToRoot,
    moveNoteToParent,
    openOrCreateNote,
    openQuickCapture,
    removeWikiLinkLine,
    resetDragState,
    resetTemplate,
    sanitizeParentId,
    saveCurrentNote,
    saveQuickCapture,
    saveTemplate,
    toggleFolderCollapse,
  };
  };
})(window);
