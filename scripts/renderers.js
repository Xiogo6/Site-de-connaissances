(function initializeRenderersModule(global) {
  const AtlasApp = (global.AtlasApp = global.AtlasApp || {});

  AtlasApp.createRenderersModule = function createRenderersModule(context) {
    const { noteTypeLabels } = AtlasApp.config;
    const { escapeHtml, extractLinks, parseTags, renderNoteHtml, unique } = AtlasApp.helpers;
  function renderEverything() {
    syncDynamicControls();
    renderTheme();
    renderSidebarTabs();
    renderSidebarDrawer();
    renderFiltersPanel();
    renderTabs();
    renderWorkspaceBanner();
    renderKnowledgeMode();
    renderKnowledgeList();
    hydrateEditorFromActiveNote();
    renderStructuredFields();
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

    context.elements.utilityLinks.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.utilityTab === context.state.activeTab);
    });

    const utilityActive = ["templates", "publish"].includes(context.state.activeTab);
    context.elements.utilityDrawerOpen.classList.toggle("is-active", utilityActive);
    context.elements.utilityDrawerOpen.setAttribute(
      "aria-expanded",
      context.state.utilityDrawerOpen ? "true" : "false"
    );
    context.elements.utilityDrawer.classList.toggle("is-hidden", !context.state.utilityDrawerOpen);
    context.elements.utilityDrawer.classList.toggle("is-open", context.state.utilityDrawerOpen);
    context.elements.utilityDrawer.setAttribute(
      "aria-hidden",
      context.state.utilityDrawerOpen ? "false" : "true"
    );

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

  function renderFiltersPanel() {
    const hasActiveFilters =
      context.state.typeFilter !== "all" ||
      context.state.tagFilter !== "all" ||
      context.state.favoritesOnly;
    const isOpen = context.state.sidebarFiltersOpen || hasActiveFilters;
    context.elements.filtersPanel.classList.toggle("is-hidden", !isOpen);
    context.elements.filtersToggleButton.textContent = isOpen ? "Masquer" : "Filtres";
    context.elements.filtersToggleButton.classList.toggle("button-primary", hasActiveFilters);
  }

  function renderSidebarDrawer() {
    context.elements.sidebarDrawer.classList.toggle("is-open", context.state.sidebarDrawerOpen);
    context.elements.sidebarDrawerBackdrop.classList.toggle(
      "is-hidden",
      !context.state.sidebarDrawerOpen
    );
    context.elements.sidebarDrawerOpen.setAttribute(
      "aria-expanded",
      context.state.sidebarDrawerOpen ? "true" : "false"
    );
  }

  function renderWorkspaceBanner() {
    context.elements.workspaceBanner.innerHTML = "";

    const callout = document.createElement("div");
    callout.className = "workspace-callout";

    const syncCopy =
      context.data.isRemoteConfigured() && context.state.remote.lastSyncedAt
        ? `Synchronise le ${escapeHtml(
            context.helpers.formatDate(context.state.remote.lastSyncedAt)
          )}`
        : context.data.isRemoteConfigured()
          ? "Synchronisation Supabase en attente"
          : "Supabase non configure";

    callout.innerHTML = `<span>${syncCopy}</span>`;

    context.elements.workspaceBanner.appendChild(callout);
  }

  function renderTheme() {
    const isDark = context.state.settings.theme === "dark";
    document.documentElement.dataset.theme = isDark ? "dark" : "light";
    document.body.dataset.theme = isDark ? "dark" : "light";
    document.documentElement.classList.toggle("theme-dark", isDark);
    document.body.classList.toggle("theme-dark", isDark);
    if (context.elements.themeToggleButton) {
      context.elements.themeToggleButton.classList.toggle("is-active", isDark);
      context.elements.themeToggleButton.querySelector("strong").textContent = isDark
        ? "Mode clair"
        : "Mode nuit";
      context.elements.themeToggleButton.querySelector("span").textContent = isDark
        ? "Revenir a l'affichage clair."
        : "Basculer vers un affichage sombre.";
    }
  }

  function getNoteTypeIconMarkup(type) {
    const icons = {
      concept:
        '<svg viewBox="0 0 24 24" role="presentation"><path d="M8.5 8.2a2.8 2.8 0 0 1 4.6-2.1 2.8 2.8 0 0 1 4.4 2.8 3 3 0 0 1 1.6 4.8 3 3 0 0 1-2 5.2H9a3 3 0 0 1-2-5.2 3 3 0 0 1 1.5-5.5z"></path><path d="M10 9.5c0 1.1.9 1.5.9 2.5s-.9 1.3-.9 2.4M14 8.8c0 1 .9 1.4.9 2.3s-.9 1.3-.9 2.4M12 7.8v8.4"></path></svg>',
      person:
        '<svg viewBox="0 0 24 24" role="presentation"><circle cx="12" cy="8" r="3.2"></circle><path d="M6.5 18c1.6-2.7 3.5-4 5.5-4s3.9 1.3 5.5 4"></path></svg>',
      event:
        '<svg viewBox="0 0 24 24" role="presentation"><path d="M7 4v3M17 4v3M5 8h14"></path><rect x="5" y="6" width="14" height="13" rx="2"></rect></svg>',
      folder:
        '<svg viewBox="0 0 24 24" role="presentation"><path d="M4 8h6l2 2h8v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"></path><path d="M4 8V6a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2"></path></svg>',
      hub:
        '<svg viewBox="0 0 24 24" role="presentation"><circle cx="12" cy="12" r="2.5"></circle><path d="M12 4v3M12 17v3M4 12h3M17 12h3M6.5 6.5l2.1 2.1M15.4 15.4l2.1 2.1M17.5 6.5l-2.1 2.1M8.6 15.4l-2.1 2.1"></path></svg>',
      procedure:
        '<svg viewBox="0 0 24 24" role="presentation"><path d="M7 7h10M7 12h7M7 17h5"></path><circle cx="5" cy="7" r="1"></circle><circle cx="5" cy="12" r="1"></circle><circle cx="5" cy="17" r="1"></circle></svg>',
      question:
        '<svg viewBox="0 0 24 24" role="presentation"><path d="M9.5 9a2.5 2.5 0 1 1 3.7 2.2c-.9.5-1.2 1-1.2 1.8"></path><path d="M12 17h.01"></path><circle cx="12" cy="12" r="9"></circle></svg>',
    };
    return `<span class="note-type-icon note-type-icon-${escapeHtml(type)}" aria-hidden="true">${
      icons[type] || icons.concept
    }</span>`;
  }

  function renderKnowledgeMode() {
    const isEditing = context.state.noteViewMode === "edit";
    context.elements.knowledgeWorkspace.classList.toggle("is-editing", isEditing);
    context.elements.noteModeToggle.textContent = isEditing ? "Fermer l'edition" : "Editer";
    context.elements.noteModeToggle.classList.toggle("button-primary", isEditing);
    context.elements.cancelNoteButton.classList.toggle(
      "is-hidden",
      context.state.pendingNewNoteId !== context.state.activeNoteId
    );
  }

  function syncEditorAvailability() {
    const readOnly = context.data.isReadOnlyMode();
    [
      context.elements.titleInput,
      context.elements.typeInput,
      context.elements.tagsInput,
      context.elements.parentInput,
      context.elements.favoriteInput,
      context.elements.noteHasDate,
      context.elements.noteDateMode,
      context.elements.noteDateSingle,
      context.elements.noteDateStart,
      context.elements.noteDateEnd,
      context.elements.contentInput,
      context.elements.applyTemplateButton,
      context.elements.templateType,
      context.elements.templateEditor,
      context.elements.saveTemplateButton,
      context.elements.resetTemplateButton,
      context.elements.saveButton,
      context.elements.cancelNoteButton,
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
    const filteredIds = new Set(filtered.map((note) => note.id));
    const filterActive =
      context.state.filter ||
      context.state.typeFilter !== "all" ||
      context.state.tagFilter !== "all" ||
      context.state.favoritesOnly;
    const forest = context.notes.buildHierarchyForest();
    const visibleForest = filterActive ? filterHierarchyForest(forest, filteredIds) : forest;

    renderHierarchyTree(context.elements.knowledgeList, visibleForest, 0, {
      interactive: true,
      collapsible: true,
      menuState: context.state.explorerMenuNoteId,
      openAttr: "data-open-note",
      toggleAttr: "data-toggle-note-menu",
      folderAttr: "data-note-folder-select",
      duplicateAttr: "data-duplicate-note",
      deleteAttr: "data-delete-note",
      rootAttr: "data-move-root",
      variant: "flat",
      forceExpanded: filterActive,
      emptyMessage: filterActive
        ? "Aucune page ne correspond aux filtres"
        : "Aucune page pour le moment",
    });
  }

  function filterHierarchyForest(nodes, allowedIds) {
    return nodes
      .map((node) => {
        const children = filterHierarchyForest(node.children, allowedIds);
        if (!allowedIds.has(node.id) && !children.length) {
          return null;
        }

        return {
          ...node,
          children,
        };
      })
      .filter(Boolean);
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
            ${getNoteTypeIconMarkup(note.type)}
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

    const metadata = note.metadata || {};
    context.elements.titleInput.value = note.title;
    context.elements.typeInput.value = note.type;
    context.elements.tagsInput.value = note.tags.join(", ");
    context.elements.parentInput.value = note.parentId || "";
    context.elements.favoriteInput.checked = Boolean(note.favorite);
    context.elements.noteHasDate.checked = Boolean(metadata.hasDate);
    context.elements.noteDateMode.value =
      ["reference", "life", "range"].includes(metadata.dateMode)
        ? metadata.dateMode
        : "reference";
    context.elements.noteDateSingle.value = metadata.singleDate || "";
    context.elements.noteDateStart.value = metadata.startDate || "";
    context.elements.noteDateEnd.value = metadata.endDate || "";
    context.elements.contentInput.value = note.content;
  }

  function renderStructuredFields() {
    const hasDate = context.elements.noteHasDate.checked;
    const mode = context.elements.noteDateMode.value;
    const isRange = mode === "range";
    const labels = {
      reference: "Date de reference",
      life: "Date de naissance",
      range: "Date",
    };

    context.elements.noteDateModeLabel.classList.toggle("is-hidden", !hasDate);
    context.elements.genericDateFields.classList.toggle("is-hidden", !hasDate);
    context.elements.noteDateSingleLabel.classList.toggle(
      "is-hidden",
      !hasDate || isRange || mode === "life"
    );
    context.elements.noteDateStartLabel.classList.toggle(
      "is-hidden",
      !hasDate || (mode !== "range" && mode !== "life")
    );
    context.elements.noteDateEndLabel.classList.toggle(
      "is-hidden",
      !hasDate || (mode !== "range" && mode !== "life")
    );
    context.elements.noteDateStartLabel.querySelector(".field-label").textContent =
      mode === "life" ? "Date de naissance" : "Date de debut";
    context.elements.noteDateEndLabel.querySelector(".field-label").textContent =
      mode === "life" ? "Date de deces" : "Date de fin";
    context.elements.noteDateSingleCopy.textContent = labels[mode] || "Date";
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
      metadata: context.notes.collectMetadataFromInputs(),
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

    const metadata = note.metadata || {};
    context.elements.previewTitle.innerHTML = `${getNoteTypeIconMarkup(note.type)}<span>${escapeHtml(
      note.title || "Sans titre"
    )}</span>`;
    context.elements.previewTags.innerHTML = "";
    context.elements.previewMeta.innerHTML = "";
    context.elements.previewContent.innerHTML = renderNoteHtml(note.content);
    context.elements.noteStatus.textContent = context.data.getSaveStatusLabel(isDraft);

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

    if (metadata.hasDate) {
      const labels = {
        reference: "Date de reference",
        life: "Naissance / deces",
        range: "Periode",
      };
      const dateMeta = document.createElement("span");
      dateMeta.textContent =
        metadata.dateMode === "range"
          ? `${labels.range}: ${formatStructuredDate(metadata.startDate)} -> ${formatStructuredDate(
              metadata.endDate
            )}`
          : metadata.dateMode === "life"
            ? `${labels.life}: ${formatStructuredDate(metadata.startDate)} -> ${formatStructuredDate(
                metadata.endDate
              )}`
          : `${labels[metadata.dateMode] || "Date"}: ${formatStructuredDate(metadata.singleDate)}`;
      context.elements.previewMeta.appendChild(dateMeta);
    }
  }

  function formatStructuredDate(value) {
    if (!value) {
      return "inconnue";
    }

    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(date);
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
      { interactive: false, collapsible: false, variant: "flat" }
    );
  }

  function renderOrganization() {
    renderOrganizationDropzone();
    renderHierarchyTree(context.elements.organizationTree, context.notes.buildHierarchyForest(), 0, {
      variant: "flat",
      allowDrag: true,
    });
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
      empty.textContent = options.emptyMessage || "Aucune hierarchie definie";
      container.appendChild(empty);
      return;
    }

    const appendNode = (node, currentDepth) => {
      const interactive = options.interactive !== false;
      const isCollapsible =
        options.collapsible !== false && (node.type === "folder" || node.children.length > 0);
      const isCollapsed =
        isCollapsible && !options.forceExpanded && context.notes.isFolderCollapsed(node.id);
      const item = document.createElement("article");
      const isFlatVariant = options.variant === "flat";
      item.className = isFlatVariant ? "tree-entry-flat" : "hierarchy-node";
      item.dataset.depth = String(Math.min(currentDepth, 3));
      item.dataset.noteId = node.id;
      item.draggable =
        interactive && !context.data.isReadOnlyMode() && Boolean(options.allowDrag);
      item.classList.toggle("is-drop-target", context.state.dragState.dropTargetId === node.id);
      item.classList.toggle("is-dragging", context.state.dragState.noteId === node.id);
      item.innerHTML = interactive
        ? buildCompactNoteItem(node, {
            menuState: options.menuState ?? context.state.organizationMenuNoteId,
            openAttr: options.openAttr || "data-open-organization-note",
            toggleAttr: options.toggleAttr || "data-toggle-organization-menu",
            folderAttr: options.folderAttr || "data-organization-folder-select",
            duplicateAttr: options.duplicateAttr || "data-duplicate-organization-note",
            deleteAttr: options.deleteAttr || "data-delete-organization-note",
            rootAttr: options.rootAttr || "data-move-organization-root",
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
                ${getNoteTypeIconMarkup(node.type)}
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
      : context.data.isRemoteConfigured()
        ? `${context.data.getRemoteStatusLabel()}. Vos sauvegardes locales restent disponibles en secours.`
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
    renderFiltersPanel,
    renderHierarchyTree,
    renderInsightList,
    renderKnowledgeList,
    renderKnowledgeMode,
    renderLivePreview,
    renderOrganization,
    renderOrganizationDropzone,
    renderPreview,
    renderPublishCenter,
    renderQuickCapture,
    renderSidebarDrawer,
    renderSidebarRecap,
    renderSidebarTabs,
    renderStats,
    renderStructuredFields,
    renderTabs,
    renderTemplateEditor,
    renderWorkspaceBanner,
    syncDynamicControls,
    syncEditorAvailability,
  };
  };
})(window);
