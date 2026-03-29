(function initializeRenderersModule(global) {
  const AtlasApp = (global.AtlasApp = global.AtlasApp || {});

  AtlasApp.createRenderersModule = function createRenderersModule(context) {
    const { noteTypeLabels } = AtlasApp.config;
    const { escapeHtml, extractLinks, parseTags, renderNoteHtml, unique } = AtlasApp.helpers;
  function renderEverything() {
    syncDynamicControls();
    renderSidebarTabs();
    renderTabs();
    renderWorkspaceBanner();
    renderKnowledgeList();
    hydrateEditorFromActiveNote();
    syncEditorAvailability();
    renderPreview();
    renderConnections();
    renderStats();
    renderDueReviewList();
    context.graph.drawGraph();
    context.quiz.renderQuizCard();
    renderTemplateEditor();
    renderPublishCenter();
    renderQuickCapture();
    renderSidebarRecap();
    renderOrganization();
  }

  function renderTabs() {
    context.elements.tabs.forEach((tab) => {
      tab.classList.toggle("is-active", tab.dataset.tab === context.state.activeTab);
    });

    Object.entries(context.elements.panels).forEach(([key, panel]) => {
      panel.classList.toggle("is-active", key === context.state.activeTab);
    });
  }

  function renderSidebarTabs() {
    context.elements.sidebarTabs.forEach((tab) => {
      tab.classList.toggle("is-active", tab.dataset.sidebarTab === context.state.sidebarTab);
    });

    Object.entries(context.elements.sidebarPanels).forEach(([key, panel]) => {
      panel.classList.toggle("is-active", key === context.state.sidebarTab);
    });
  }

  function renderWorkspaceBanner() {
    const publishedUrl = context.data.buildPublishedUrl();
    context.elements.workspaceBanner.innerHTML = "";

    const callout = document.createElement("div");
    callout.className = "workspace-callout";

    if (context.data.isReadOnlyMode()) {
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

    context.elements.workspaceBanner.appendChild(callout);
  }

  function syncEditorAvailability() {
    const readOnly = context.data.isReadOnlyMode();
    [
      context.elements.titleInput,
      context.elements.typeInput,
      context.elements.tagsInput,
      context.elements.parentInput,
      context.elements.favoriteInput,
      context.elements.contentInput,
      context.elements.applyTemplateButton,
      context.elements.templateType,
      context.elements.templateEditor,
      context.elements.saveTemplateButton,
      context.elements.resetTemplateButton,
      context.elements.saveButton,
      context.elements.newNoteButton,
      context.elements.duplicateNoteButton,
      context.elements.importInput,
      context.elements.quickCaptureToggle,
      context.elements.newFolderButton,
      context.elements.moveRootButton,
      context.elements.quickTitle,
      context.elements.quickTags,
      context.elements.quickContent,
      context.elements.quickLinkActive,
      context.elements.quickSaveButton,
    ].forEach((element) => {
      if (!element) {
        return;
      }

      element.disabled = readOnly;
    });
  }

  function renderKnowledgeList() {
    const filtered = context.notes.getFilteredNotes();
    context.elements.pageCount.textContent = `${filtered.length} page${
      filtered.length > 1 ? "s" : ""
    }`;
    context.elements.knowledgeList.innerHTML = "";

    filtered.forEach((note, index) => {
      const item = document.createElement("article");
      item.className = "knowledge-item fade-in";
      item.style.animationDelay = `${index * 30}ms`;
      item.innerHTML = buildCompactNoteItem(note, {
        menuState: context.state.explorerMenuNoteId,
        openAttr: "data-open-note",
        toggleAttr: "data-toggle-note-menu",
        folderAttr: "data-note-folder-select",
        duplicateAttr: "data-duplicate-note",
        deleteAttr: "data-delete-note",
        rootAttr: "data-move-root",
      });
      context.elements.knowledgeList.appendChild(item);
    });
  }

  function buildCompactNoteItem(note, config) {
    const isMenuOpen = config.menuState === note.id;
    const folderOptions = context.notes.getFolderMoveOptions(note.id);
    const folderLabel = noteTypeLabels[note.type] || "Page";
    const leadingHtml =
      config.leadingHtml || '<span class="tree-toggle-spacer" aria-hidden="true"></span>';

    return `
      <div class="knowledge-item-shell${
        note.id === context.state.activeNoteId ? " is-active" : ""
      }" data-note-id="${note.id}">
        <div class="knowledge-item-row">
          <div class="knowledge-item-main">
            ${leadingHtml}
            <button type="button" class="knowledge-item-title" ${config.openAttr}="${note.id}">
              ${escapeHtml(note.title)}
            </button>
          </div>
          <button type="button" class="knowledge-item-more" ${config.toggleAttr}="${note.id}">
            ...
          </button>
        </div>
        <div class="knowledge-item-menu${isMenuOpen ? "" : " is-hidden"}">
          <span class="pill pill-soft">${escapeHtml(folderLabel)}</span>
          <label>
            <span class="field-label">Deplacer vers un dossier</span>
            <select class="select-input" ${config.folderAttr}="${note.id}">
              <option value="">Choisir un dossier</option>
              ${folderOptions
                .map((folder) => {
                  return `<option value="${folder.id}"${
                    note.parentId === folder.id ? " selected" : ""
                  }>${escapeHtml(folder.title)}</option>`;
                })
                .join("")}
            </select>
          </label>
          <div class="inline-actions">
            <button type="button" class="button" ${config.duplicateAttr}="${note.id}">Dupliquer</button>
            <button type="button" class="button" ${config.rootAttr}="${note.id}">Racine</button>
            <button type="button" class="button button-ghost" ${config.deleteAttr}="${note.id}">Supprimer</button>
          </div>
        </div>
      </div>
    `;
  }

  function hydrateEditorFromActiveNote() {
    const note = context.notes.getActiveNote();
    if (!note) {
      return;
    }

    context.elements.titleInput.value = note.title;
    context.elements.typeInput.value = note.type;
    context.elements.tagsInput.value = note.tags.join(", ");
    context.elements.parentInput.value = note.parentId || "";
    context.elements.favoriteInput.checked = Boolean(note.favorite);
    context.elements.contentInput.value = note.content;
  }

  function renderLivePreview() {
    const activeNote = context.notes.getActiveNote();
    if (!activeNote) {
      return;
    }

    const draftNote = {
      ...activeNote,
      title: context.elements.titleInput.value.trim() || "Sans titre",
      type: context.elements.typeInput.value,
      tags: parseTags(context.elements.tagsInput.value),
      parentId: context.notes.sanitizeParentId(
        activeNote.id,
        context.elements.parentInput.value || null
      ),
      favorite: context.elements.favoriteInput.checked,
      content: context.elements.contentInput.value,
    };

    renderPreview(draftNote, true);
    renderConnections(draftNote);
    renderStats(draftNote);
  }

  function renderTemplateEditor() {
    if (!context.elements.templateEditor) {
      return;
    }

    const templates = context.data.getTemplates();
    const draft = context.state.templateDrafts[context.state.activeTemplateType];
    context.elements.templateEditor.value =
      typeof draft === "string" ? draft : templates[context.state.activeTemplateType] || "";
  }

  function renderPreview(note = context.notes.getActiveNote(), isDraft = false) {
    if (!note) {
      return;
    }

    context.elements.previewTitle.textContent = note.title || "Sans titre";
    context.elements.previewTags.innerHTML = "";
    context.elements.previewMeta.innerHTML = "";
    context.elements.previewContent.innerHTML = renderNoteHtml(note.content);
    context.elements.noteStatus.textContent = isDraft ? "Brouillon" : "Synchronise";

    const typeTag = document.createElement("span");
    typeTag.className = "tag tag-type";
    typeTag.textContent = noteTypeLabels[note.type] || "Concept";
    context.elements.previewTags.appendChild(typeTag);

    if (note.favorite) {
      const favoriteTag = document.createElement("span");
      favoriteTag.className = "tag tag-favorite";
      favoriteTag.textContent = "Favori";
      context.elements.previewTags.appendChild(favoriteTag);
    }

    note.tags.forEach((tag) => {
      const node = document.createElement("span");
      node.className = "tag";
      node.textContent = tag;
      context.elements.previewTags.appendChild(node);
    });

    const updatedMeta = document.createElement("span");
    updatedMeta.textContent = `Maj: ${context.helpers.formatDate(note.updatedAt)}`;
    const reviewMeta = document.createElement("span");
    reviewMeta.textContent = `Revision: ${context.notes.describeReviewState(note)}`;
    const parentMeta = document.createElement("span");
    parentMeta.textContent = `Parent: ${context.notes.getParentTitle(note) || "Aucun"}`;
    const childMeta = document.createElement("span");
    childMeta.textContent = `Enfants: ${context.notes.getChildNotes(note.id).length}`;
    context.elements.previewMeta.appendChild(updatedMeta);
    context.elements.previewMeta.appendChild(reviewMeta);
    context.elements.previewMeta.appendChild(parentMeta);
    context.elements.previewMeta.appendChild(childMeta);
  }

  function renderConnections(note = context.notes.getActiveNote()) {
    if (!note) {
      return;
    }

    const outgoing = unique(extractLinks(note.content));
    const backlinks = context.notes.getBacklinks(note.title, note.id);
    const suggested = context.notes.getSuggestedLinks(note).map((item) => item.title);
    const outline = context.notes.extractOutline(note.content);
    const backlinkContexts = context.notes.getBacklinkContexts(note.title, note.id);
    const hierarchyLinks = context.notes.getHierarchyLinks(note);

    renderChipCollection(context.elements.outgoingLinks, outgoing, "Aucun lien sortant");
    renderChipCollection(context.elements.backlinks, backlinks, "Aucun backlink");
    renderChipCollection(
      context.elements.hierarchyLinks,
      hierarchyLinks,
      "Aucune relation hierarchique",
      false
    );
    renderChipCollection(
      context.elements.suggestedLinks,
      suggested,
      "Aucune suggestion pour le moment"
    );
    renderChipCollection(
      context.elements.noteOutline,
      outline,
      "Aucun sous-titre detecte",
      false
    );
    renderInsightList(
      context.elements.backlinkContexts,
      backlinkContexts,
      "Aucun contexte de backlink"
    );
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
      ? context.state.notes.map((note) => (note.id === draftNote.id ? draftNote : note))
      : context.state.notes;
    const totalLinks = sourceNotes.reduce((count, note) => {
      return count + unique(extractLinks(note.content)).length;
    }, 0);
    const orphanNotes = sourceNotes.filter((note) => context.notes.isOrphanNote(note, sourceNotes)).length;
    const dueCount = context.notes.getDueNotes(sourceNotes).length;

    context.elements.pageTotalCount.textContent = String(sourceNotes.length);
    context.elements.linkCount.textContent = String(totalLinks);
    context.elements.orphanCount.textContent = String(orphanNotes);
    context.elements.quizCount.textContent = String(dueCount);
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
    const dueNotes = context.notes.getDueNotes().slice(0, 6);
    context.elements.dueReviewCount.textContent = `${dueNotes.length} a revoir`;
    context.elements.dueReviewList.innerHTML = "";

    if (!dueNotes.length) {
      const empty = document.createElement("span");
      empty.className = "pill pill-soft";
      empty.textContent = "Rien d'urgent pour l'instant";
      context.elements.dueReviewList.appendChild(empty);
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
        context.state.activeNoteId = note.id;
        context.state.activeTab = "knowledge";
        renderEverything();
      });
      context.elements.dueReviewList.appendChild(button);
    });
  }

  function renderSidebarRecap() {
    const orphanCount = context.state.notes.filter((note) => context.notes.isOrphanNote(note)).length;
    const rootCount = context.state.notes.filter((note) => !note.parentId).length;
    const favoritesCount = context.state.notes.filter((note) => note.favorite).length;

    renderInsightList(
      context.elements.sidebarOverview,
      [
        { title: "Pages racines", body: `${rootCount} page(s) sans parent` },
        { title: "Pages isolees", body: `${orphanCount} page(s) sans liens ni parent` },
        { title: "Favoris", body: `${favoritesCount} page(s) marquees importantes` },
      ],
      "Aucun recap pour le moment"
    );

    renderHierarchyTree(
      context.elements.sidebarHierarchy,
      context.notes.buildHierarchyForest().slice(0, 8),
      0,
      { interactive: false, collapsible: false }
    );
  }

  function renderOrganization() {
    renderOrganizationDropzone();
    renderHierarchyTree(context.elements.organizationTree, context.notes.buildHierarchyForest(), 0);
    renderInsightList(
      context.elements.organizationOrphans,
      context.state.notes
        .filter((note) => context.notes.isOrphanNote(note))
        .slice(0, 8)
        .map((note) => ({ title: note.title, body: "Aucun parent et peu de connexions" })),
      "Aucune page isolee"
    );
    renderInsightList(
      context.elements.organizationRecent,
      [...context.state.notes]
        .sort((left, right) => Date.parse(right.updatedAt || "") - Date.parse(left.updatedAt || ""))
        .slice(0, 8)
        .map((note) => ({
          title: note.title,
          body: `Maj ${context.helpers.formatDate(note.updatedAt)}`,
        })),
      "Aucune page recente"
    );
    renderInsightList(
      context.elements.organizationTopLinks,
      context.notes.getMostConnectedNotes().map((note) => ({
        title: note.title,
        body: `${context.notes.getConnectionCount(note)} lien(s) detecte(s)`,
      })),
      "Pas encore de connexions fortes"
    );
  }

  function renderOrganizationDropzone() {
    context.elements.organizationRootDrop.classList.toggle(
      "is-over",
      context.state.dragState.dropToRoot
    );
  }

  function renderHierarchyTree(container, nodes, depth, options = {}) {
    container.innerHTML = "";

    if (!nodes.length) {
      const empty = document.createElement("span");
      empty.className = "pill pill-soft";
      empty.textContent = "Aucune hierarchie definie";
      container.appendChild(empty);
      return;
    }

    const appendNode = (node, currentDepth) => {
      const interactive = options.interactive !== false;
      const isCollapsible =
        options.collapsible !== false && (node.type === "folder" || node.children.length > 0);
      const isCollapsed = isCollapsible && context.notes.isFolderCollapsed(node.id);
      const item = document.createElement("article");
      item.className = "hierarchy-node";
      item.dataset.depth = String(Math.min(currentDepth, 3));
      item.dataset.noteId = node.id;
      item.draggable = interactive && !context.data.isReadOnlyMode();
      item.classList.toggle("is-drop-target", context.state.dragState.dropTargetId === node.id);
      item.classList.toggle("is-dragging", context.state.dragState.noteId === node.id);
      item.innerHTML = interactive
        ? buildCompactNoteItem(node, {
            menuState: context.state.organizationMenuNoteId,
            openAttr: "data-open-organization-note",
            toggleAttr: "data-toggle-organization-menu",
            folderAttr: "data-organization-folder-select",
            duplicateAttr: "data-duplicate-organization-note",
            deleteAttr: "data-delete-organization-note",
            rootAttr: "data-move-organization-root",
            leadingHtml: isCollapsible
              ? `<button type="button" class="tree-toggle" data-toggle-folder="${node.id}" aria-label="${
                  isCollapsed ? "Deplier" : "Replier"
                }">${isCollapsed ? "+" : "-"}</button>`
              : '<span class="tree-toggle-spacer" aria-hidden="true"></span>',
          })
        : `
          <div class="knowledge-item-shell${
            node.id === context.state.activeNoteId ? " is-active" : ""
          }" data-note-id="${node.id}">
            <div class="knowledge-item-row">
              <div class="knowledge-item-main">
                <span class="tree-toggle-spacer" aria-hidden="true"></span>
                <span class="knowledge-item-title is-static">${escapeHtml(node.title)}</span>
              </div>
            </div>
          </div>
        `;
      container.appendChild(item);

      if (!isCollapsed) {
        node.children.forEach((child) => appendNode(child, currentDepth + 1));
      }
    };

    nodes.forEach((node) => appendNode(node, depth));
  }

  function renderPublishCenter() {
    const lastUpdated = context.state.notes.reduce((latest, note) => {
      return Date.parse(note.updatedAt || "") > Date.parse(latest || "") ? note.updatedAt : latest;
    }, "");
    const lastSnapshot = context.state.snapshots[0] ?? null;

    context.elements.publishStatusCopy.textContent = context.data.isReadOnlyMode()
      ? "Vous consultez le snapshot publie. Pour modifier, basculez vers l'espace local."
      : "Votre espace local contient vos brouillons, revisions et captures rapides.";

    context.elements.publishMeta.innerHTML = `
      <span>Version donnees: v${context.data.dataVersion}</span>
      <span>Pages: ${context.state.notes.length}</span>
      <span>Derniere maj locale: ${context.helpers.formatDate(lastUpdated)}</span>
      <span>Dernier snapshot: ${
        lastSnapshot ? context.helpers.formatDate(lastSnapshot.createdAt) : "aucun"
      }</span>
    `;

    context.elements.snapshotList.innerHTML = "";

    if (!context.state.snapshots.length) {
      const empty = document.createElement("span");
      empty.className = "pill pill-soft";
      empty.textContent = "Aucun snapshot local enregistre";
      context.elements.snapshotList.appendChild(empty);
    } else {
      context.state.snapshots.slice(0, 6).forEach((snapshot) => {
        const item = document.createElement("article");
        item.className = "snapshot-item";
        item.innerHTML = `
          <strong>${escapeHtml(snapshot.label)}</strong>
          <span>${escapeHtml(context.helpers.formatDate(snapshot.createdAt))}</span>
          <span>${snapshot.noteCount} pages</span>
        `;

        const button = document.createElement("button");
        button.type = "button";
        button.className = "button";
        button.textContent = "Restaurer";
        button.disabled = context.data.isReadOnlyMode();
        button.addEventListener("click", () => context.data.restoreSnapshotById(snapshot.id));
        item.appendChild(button);
        context.elements.snapshotList.appendChild(item);
      });
    }

    const disableMutating = context.data.isReadOnlyMode();
    context.elements.saveSnapshotButton.disabled = disableMutating;
    context.elements.restoreLatestSnapshotButton.disabled =
      disableMutating || !context.state.snapshots.length;
  }

  function renderQuickCapture() {
    context.elements.quickCapturePanel.classList.toggle(
      "is-hidden",
      !context.state.quickCaptureOpen
    );
  }

  function syncDynamicControls() {
    populateSelect(
      context.elements.templateType,
      Object.keys(noteTypeLabels).map((type) => ({
        value: type,
        label: noteTypeLabels[type],
      })),
      context.state.activeTemplateType
    );

    populateSelect(
      context.elements.typeFilter,
      [
        { value: "all", label: "Tous les types" },
        ...Object.keys(noteTypeLabels).map((type) => ({
          value: type,
          label: noteTypeLabels[type],
        })),
      ],
      context.state.typeFilter
    );

    const tagOptions = [
      { value: "all", label: "Tous les tags" },
      ...context.notes.getAllTags().map((tag) => ({ value: tag, label: tag })),
    ];
    populateSelect(context.elements.tagFilter, tagOptions, context.state.tagFilter);
    populateSelect(context.elements.graphTagFilter, tagOptions, context.state.graphTagFilter);
    populateSelect(
      context.elements.parentInput,
      [
        { value: "", label: "Aucune" },
        ...context.state.notes
          .filter((note) => note.id !== context.state.activeNoteId)
          .sort((left, right) => left.title.localeCompare(right.title, "fr", { sensitivity: "base" }))
          .map((note) => ({ value: note.id, label: note.title })),
      ],
      context.notes.getActiveNote()?.parentId || ""
    );
    context.elements.favoritesFilter.checked = context.state.favoritesOnly;
    context.elements.graphFocusMode.value = context.state.graphFocusMode;
    context.elements.graphShowTags.checked = context.state.graphShowTags;
    context.elements.templateType.value = context.state.activeTemplateType;
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

  return {
    buildCompactNoteItem,
    hydrateEditorFromActiveNote,
    populateSelect,
    renderChipCollection,
    renderConnections,
    renderDueReviewList,
    renderEverything,
    renderHierarchyTree,
    renderInsightList,
    renderKnowledgeList,
    renderLivePreview,
    renderOrganization,
    renderOrganizationDropzone,
    renderPreview,
    renderPublishCenter,
    renderQuickCapture,
    renderSidebarRecap,
    renderSidebarTabs,
    renderStats,
    renderTabs,
    renderTemplateEditor,
    renderWorkspaceBanner,
    syncDynamicControls,
    syncEditorAvailability,
  };
  };
})(window);
