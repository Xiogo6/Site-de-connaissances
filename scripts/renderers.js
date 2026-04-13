(function initializeRenderersModule(global) {
  const AtlasApp = (global.AtlasApp = global.AtlasApp || {});

  AtlasApp.createRenderersModule = function createRenderersModule(context) {
    const {
      escapeHtml,
      extractLinks,
      formatFlexibleDate,
      getFlexibleDateTimestamp,
      normalizeTag,
      parseTags,
      renderNoteHtml,
      unique,
    } = AtlasApp.helpers;
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
    context.quiz.renderFlashcards();
    renderTimelineView();
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

    const utilityActive = ["flashcards", "timeline", "settings", "publish"].includes(context.state.activeTab);
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
    window.localStorage.setItem("atlas-connaissance-theme", isDark ? "dark" : "light");
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
      definition:
        '<svg viewBox="0 0 24 24" role="presentation"><path d="M6 5h11a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z"></path><path d="M8 7h7M8 11h8M8 15h5"></path></svg>',
      person:
        '<svg viewBox="0 0 24 24" role="presentation"><circle cx="12" cy="8" r="3.2"></circle><path d="M6.5 18c1.6-2.7 3.5-4 5.5-4s3.9 1.3 5.5 4"></path></svg>',
      event:
        '<svg viewBox="0 0 24 24" role="presentation"><path d="M7 4v3M17 4v3M5 8h14"></path><rect x="5" y="6" width="14" height="13" rx="2"></rect></svg>',
      experience:
        '<svg viewBox="0 0 24 24" role="presentation"><path d="M7 5h10M9 5v4l-3 4a4 4 0 0 0 3.3 6h5.4a4 4 0 0 0 3.3-6l-3-4V5"></path><path d="M9 14h6"></path></svg>',
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
    setActionButtonLabel(
      context.elements.noteModeToggle,
      isEditing ? "Lecture" : "Editer"
    );
    context.elements.noteModeToggle.classList.toggle("button-primary", isEditing);
    context.elements.noteModeToggle.classList.toggle("button-ghost", !isEditing);
    context.elements.cancelNoteButton.classList.toggle(
      "is-hidden",
      !isEditing
    );
    renderPrimaryActionButton(isEditing);
    renderQuickActionButton(isEditing);
  }

  function setActionButtonLabel(button, label) {
    const labelNode = button?.querySelector(".button-label");
    if (labelNode) {
      labelNode.textContent = label;
    } else if (button) {
      button.textContent = label;
    }
  }

  function renderPrimaryActionButton(isEditing) {
    if (!context.elements.newFullPageButton) {
      return;
    }

    if (isEditing && context.state.activeTab === "knowledge" && !context.data.isReadOnlyMode()) {
      context.elements.newFullPageLabel.textContent = "Enregistrer";
      context.elements.newFullPageButton.classList.add("button-primary");
      context.elements.newFullPageIcon.innerHTML = `
        <svg viewBox="0 0 24 24" role="presentation">
          <path d="M6 5h10l2 2v12H6z" />
          <path d="M9 5v5h6V5" />
          <path d="M9 19v-5h6v5" />
        </svg>
      `;
      return;
    }

    context.elements.newFullPageLabel.textContent = "Nouvelle page";
    context.elements.newFullPageButton.classList.remove("button-primary");
    context.elements.newFullPageIcon.innerHTML = `
      <svg viewBox="0 0 24 24" role="presentation">
        <path d="M12 5v14M5 12h14" />
      </svg>
    `;
  }

  function renderQuickActionButton(isEditing) {
    if (!context.elements.quickCaptureToggle) {
      return;
    }

    const shouldSave =
      isEditing && context.state.activeTab === "knowledge" && !context.data.isReadOnlyMode();
    context.elements.quickCaptureToggle.textContent = shouldSave ? "Enregistrer" : "Note rapide";
    context.elements.quickCaptureToggle.classList.toggle("is-save-mode", shouldSave);
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
      ...context.elements.formatButtons,
      context.elements.contentInput,
      context.elements.templateType,
      context.elements.templateEditor,
      context.elements.saveTemplateButton,
      context.elements.resetTemplateButton,
      context.elements.saveButton,
      context.elements.cancelNoteButton,
      context.elements.quickCaptureToggle,
      context.elements.newFolderButton,
      context.elements.quickTitle,
      context.elements.quickTags,
      context.elements.quickType,
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
      editAttr: "data-edit-note",
      toggleAttr: "data-toggle-note-menu",
      rootAttr: "data-root-note",
      duplicateAttr: "data-duplicate-note",
      deleteAttr: "data-delete-note",
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
          <div class="compact-menu-actions">
            <button type="button" class="button" ${config.editAttr}="${note.id}">Editer</button>
            <button type="button" class="button" ${config.rootAttr}="${note.id}">Racine</button>
            <button type="button" class="button" ${config.duplicateAttr}="${note.id}">Dupliquer</button>
            <button type="button" class="button button-ghost" ${config.deleteAttr}="${note.id}">Supprimer</button>
          </div>
        </div>
      </div>
    `;
  }

  function hydrateEditorFromActiveNote() {
    const note = context.notes.getActiveNote();
    if (!note) {
      context.state.editorTemplateSeed = null;
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

    const templateContent = context.data.buildTemplateContent(note.type, note.title || "Sans titre");
    context.state.editorTemplateSeed =
      note.content.trim() === templateContent.trim()
        ? {
            type: note.type,
            title: note.title || "Sans titre",
            content: templateContent,
          }
        : null;
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

    renderTypeSettingsList();
    const templates = context.data.getTemplates();
    const draft = context.state.templateDrafts[context.state.activeTemplateType];
    context.elements.templateEditor.value =
      typeof draft === "string" ? draft : templates[context.state.activeTemplateType] || "";
  }

  function renderTypeSettingsList() {
    if (!context.elements.typeSettingsList) {
      return;
    }

    const entries = context.data
      .getNoteTypeEntries()
      .sort((left, right) => left.label.localeCompare(right.label, "fr", { sensitivity: "base" }));

    context.elements.typeSettingsList.innerHTML = "";

    entries.forEach((entry) => {
      const canDelete = entry.isCustom && !context.notes.isTypeUsed(entry.id);
      const row = document.createElement("label");
      row.className = "settings-type-row";
      row.innerHTML = `
        <span class="field-label">${entry.isCustom ? "Type personnalise" : "Type de base"}</span>
        <div class="settings-type-meta">
          <input
            class="text-input"
            type="text"
            value="${escapeHtml(entry.label)}"
            data-type-label-input="${entry.id}"
          />
          <span class="pill pill-soft">${escapeHtml(entry.id)}</span>
          ${
            entry.isCustom
              ? `<button
                  type="button"
                  class="button button-ghost settings-delete-type"
                  data-delete-type="${entry.id}"
                  ${canDelete ? "" : "disabled"}
                >
                  Supprimer
                </button>`
              : ""
          }
        </div>
        ${
          entry.isCustom && !canDelete
            ? '<span class="helper-copy helper-copy-compact">Ce type est utilise par au moins une page.</span>'
            : ""
        }
      `;
      context.elements.typeSettingsList.appendChild(row);
    });
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
    typeTag.textContent = context.data.getNoteTypeLabels()[note.type] || "Concept";
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
    return formatFlexibleDate(value);
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
    if (context.elements.quizFolderWrapper) {
      context.elements.quizFolderWrapper.classList.toggle(
        "is-hidden",
        context.elements.quizScope.value !== "folder"
      );
    }
    if (context.elements.quizTagWrapper) {
      context.elements.quizTagWrapper.classList.toggle(
        "is-hidden",
        context.elements.quizScope.value !== "tag"
      );
    }

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
        <p>${escapeHtml(context.data.getNoteTypeLabels()[note.type] || "Concept")} | ${escapeHtml(
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
      rootAttr: "data-root-organization-note",
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
            editAttr: options.editAttr || "data-edit-organization-note",
            toggleAttr: options.toggleAttr || "data-toggle-organization-menu",
            rootAttr: options.rootAttr || "data-root-organization-note",
            duplicateAttr: options.duplicateAttr || "data-duplicate-organization-note",
            deleteAttr: options.deleteAttr || "data-delete-organization-note",
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

  function renderTimelineView() {
    if (!context.elements.timelineCanvas) {
      return;
    }

    const folders = context.state.notes
      .filter((note) => note.type === "folder")
      .sort((left, right) => left.title.localeCompare(right.title, "fr", { sensitivity: "base" }));
    const tags = context.notes.getAllTags();
    const activeNote = context.notes.getActiveNote();

    if (!context.state.timeline.folderId || !folders.some((note) => note.id === context.state.timeline.folderId)) {
      context.state.timeline.folderId =
        activeNote?.type === "folder" ? activeNote.id : folders[0]?.id || "";
    }

    if (!context.state.timeline.tag || !tags.includes(context.state.timeline.tag)) {
      context.state.timeline.tag = activeNote?.tags?.[0] || tags[0] || "";
    }

    if (context.state.timeline.scope === "folder" && !folders.length && tags.length) {
      context.state.timeline.scope = "tag";
    }

    if (context.elements.timelineScope) {
      context.elements.timelineScope.value = context.state.timeline.scope;
    }
    if (context.elements.timelineFolder) {
      context.elements.timelineFolder.value = context.state.timeline.folderId;
    }
    if (context.elements.timelineTag) {
      context.elements.timelineTag.value = context.state.timeline.tag;
    }

    context.elements.timelineFolderWrapper.classList.toggle(
      "is-hidden",
      context.state.timeline.scope !== "folder"
    );
    context.elements.timelineTagWrapper.classList.toggle(
      "is-hidden",
      context.state.timeline.scope !== "tag"
    );

    const dataset = buildTimelineDataset();
    context.elements.timelineProgress.textContent = `${dataset.items.length} repere${
      dataset.items.length > 1 ? "s" : ""
    }`;
    context.elements.timelineTitle.textContent = dataset.title;

    if (!dataset.items.length) {
      context.elements.timelineSummary.innerHTML = `
        <div class="timeline-summary-card">
          <strong>Rien a tracer pour l'instant</strong>
          <p>
            Choisissez un dossier ou un tag contenant des pages avec une date.
            Les personnes, evenements, concepts et autres pages datees apparaitront ici.
          </p>
        </div>
      `;
      context.elements.timelineCanvas.className = "timeline-canvas empty-state";
      context.elements.timelineCanvas.textContent =
        "Aucune page datee trouvee pour cette source.";
      context.elements.timelineFocus.innerHTML = "";
      context.state.timeline.selectedNoteId = null;
      return;
    }

    const counts = dataset.items.reduce(
      (summary, item) => {
        summary.total += 1;
        if (item.note.type === "person") {
          summary.people += 1;
        } else if (item.note.type === "event") {
          summary.events += 1;
        } else {
          summary.other += 1;
        }
        return summary;
      },
      { total: 0, people: 0, events: 0, other: 0 }
    );

    context.elements.timelineSummary.innerHTML = `
      <div class="timeline-summary-grid">
        <article class="timeline-summary-card">
          <strong>Amplitude</strong>
          <p>${escapeHtml(dataset.summaryRange)}</p>
        </article>
        <article class="timeline-summary-card">
          <strong>Composition</strong>
          <p>${counts.people} personne(s), ${counts.events} evenement(s), ${counts.other} autre(s) repere(s).</p>
        </article>
        <article class="timeline-summary-card">
          <strong>Lecture</strong>
          <p>${escapeHtml(dataset.didacticCopy)}</p>
        </article>
      </div>
    `;

    context.elements.timelineCanvas.className = "timeline-canvas";
    context.elements.timelineCanvas.innerHTML = dataset.stageHtml;
    renderTimelineFocus(dataset);
  }

  function buildTimelineDataset() {
    const sourceNotes = getTimelineScopeNotes();
    const items = sourceNotes
      .map((note) => buildTimelineItem(note))
      .filter(Boolean)
      .sort((left, right) => left.sortStart - right.sortStart || left.sortEnd - right.sortEnd);

    const sourceLabel =
      context.state.timeline.scope === "folder"
        ? getTimelineFolderLabel()
        : `#${context.state.timeline.tag || "tag"}`;

    if (!items.length) {
      return {
        title:
          context.state.timeline.scope === "folder"
            ? `Frise du dossier ${sourceLabel || "non defini"}`
            : `Frise du tag ${sourceLabel}`,
        items: [],
        stageHtml: "",
        summaryRange: "",
        didacticCopy: "",
      };
    }

    const minTime = Math.min(...items.map((item) => item.startMs));
    const maxTime = Math.max(...items.map((item) => item.endMs));
    const oneYear = 365 * 24 * 60 * 60 * 1000;
    const rawSpan = Math.max(maxTime - minTime, oneYear);
    const padding = Math.max(rawSpan * 0.08, oneYear * 0.75);
    const domainStart = minTime - padding;
    const domainEnd = maxTime + padding;
    const domainSpan = Math.max(domainEnd - domainStart, oneYear);
    const stageWidth = Math.max(920, items.length * 130, Math.min(1800, Math.ceil(domainSpan / oneYear) * 12));

    const projectedItems = items.map((item) => {
      const startX = projectToStage(item.startMs, domainStart, domainSpan, stageWidth);
      const endX = projectToStage(item.endMs, domainStart, domainSpan, stageWidth);
      return {
        ...item,
        startX,
        endX,
        anchorX: item.kind === "point" ? startX : (startX + endX) / 2,
      };
    });

    const lifeItems = projectedItems.filter((item) => item.kind === "life");
    const rangeItems = projectedItems.filter((item) => item.kind === "range");
    const pointItems = projectedItems.filter((item) => item.kind === "point");

    const topPointItems = [];
    const bottomPointItems = [];
    pointItems.forEach((item, index) => {
      (index % 2 === 0 ? topPointItems : bottomPointItems).push(item);
    });

    const topBarLayout = assignTimelineRows(lifeItems, 32, 34);
    const bottomBarLayout = assignTimelineRows(rangeItems, 32, 34);
    const topPointLayout = assignTimelineRows(topPointItems, 140, 72);
    const bottomPointLayout = assignTimelineRows(bottomPointItems, 140, 72);

    const topBarRows = Math.max(...topBarLayout.map((item) => item.row), -1) + 1;
    const bottomBarRows = Math.max(...bottomBarLayout.map((item) => item.row), -1) + 1;
    const topPointRows = Math.max(...topPointLayout.map((item) => item.row), -1) + 1;
    const bottomPointRows = Math.max(...bottomPointLayout.map((item) => item.row), -1) + 1;

    const axisY = 110 + topPointRows * 98 + topBarRows * 38;
    const stageHeight = Math.max(
      520,
      axisY + 120 + bottomBarRows * 38 + bottomPointRows * 98
    );

    const timelineEntries = [
      ...topBarLayout.map((item) => ({
        ...item,
        side: "top",
        top: axisY - 34 - item.row * 38,
      })),
      ...bottomBarLayout.map((item) => ({
        ...item,
        side: "bottom",
        top: axisY + 28 + item.row * 38,
      })),
      ...topPointLayout.map((item) => ({
        ...item,
        side: "top",
        top: axisY - 92 - topBarRows * 38 - item.row * 98,
      })),
      ...bottomPointLayout.map((item) => ({
        ...item,
        side: "bottom",
        top: axisY + 70 + bottomBarRows * 38 + item.row * 98,
      })),
    ].sort((left, right) => left.sortStart - right.sortStart || left.sortEnd - right.sortEnd);

    const selectedItem =
      timelineEntries.find((item) => item.note.id === context.state.timeline.selectedNoteId) ||
      timelineEntries[0];
    context.state.timeline.selectedNoteId = selectedItem?.note.id || null;

    const stageHtml = buildTimelineStageHtml({
      axisY,
      domainStart,
      domainEnd,
      height: stageHeight,
      items: timelineEntries,
      selectedNoteId: context.state.timeline.selectedNoteId,
      width: stageWidth,
    });

    const firstLabel = items[0].labelDate;
    const lastLabel = items[items.length - 1].labelDate;
    const spanYears = Math.max(
      0,
      new Date(maxTime).getUTCFullYear() - new Date(minTime).getUTCFullYear()
    );

    return {
      title:
        context.state.timeline.scope === "folder"
          ? `Frise du dossier ${sourceLabel || "non defini"}`
          : `Frise du tag ${sourceLabel}`,
      items: timelineEntries,
      stageHtml,
      summaryRange: `${firstLabel} -> ${lastLabel}`,
      didacticCopy:
        spanYears > 120
          ? "Vue large: les bandes montrent les longues periodes, tandis que les repères isolent les moments clefs."
          : spanYears > 25
            ? "Vue intermediaire: on lit les trajectoires humaines, les evenements et les jalons sur un meme axe."
            : "Vue resserree: la frise laisse voir les successions fines, presque scene par scene.",
    };
  }

  function getTimelineScopeNotes() {
    if (context.state.timeline.scope === "tag") {
      const targetTag = normalizeTag(context.state.timeline.tag);
      return context.state.notes.filter((note) => {
        return targetTag && note.tags.some((tag) => normalizeTag(tag) === targetTag);
      });
    }

    return context.notes.getFolderDescendantNotes(context.state.timeline.folderId);
  }

  function getTimelineFolderLabel() {
    return (
      context.state.notes.find((note) => note.id === context.state.timeline.folderId)?.title || ""
    );
  }

  function buildTimelineItem(note) {
    const metadata = note.metadata || {};
    if (!metadata.hasDate) {
      return null;
    }

    const dateLabelByMode = {
      reference: metadata.singleDate,
      life: [metadata.startDate, metadata.endDate].filter(Boolean).join(" -> "),
      range: [metadata.startDate, metadata.endDate].filter(Boolean).join(" -> "),
    };

    if (metadata.dateMode === "life" || metadata.dateMode === "range") {
      const fallback = metadata.startDate || metadata.endDate;
      const startRaw = metadata.startDate || fallback;
      const endRaw = metadata.endDate || fallback;
      const startMs = getFlexibleDateTimestamp(startRaw, "start");
      const endMs = getFlexibleDateTimestamp(endRaw, "end");
      if (startMs == null && endMs == null) {
        return null;
      }

      const safeStart = startMs ?? endMs;
      const safeEnd = endMs ?? startMs;
      return {
        note,
        kind: safeStart === safeEnd ? "point" : metadata.dateMode,
        labelDate:
          metadata.dateMode === "life"
            ? `${formatFlexibleDate(startRaw)} -> ${formatFlexibleDate(endRaw)}`
            : `${formatFlexibleDate(startRaw)} -> ${formatFlexibleDate(endRaw)}`,
        sortStart: Math.min(safeStart, safeEnd),
        sortEnd: Math.max(safeStart, safeEnd),
        startMs: Math.min(safeStart, safeEnd),
        endMs: Math.max(safeStart, safeEnd),
        summaryDate: dateLabelByMode[metadata.dateMode],
      };
    }

    const singleRaw = metadata.singleDate || metadata.startDate || metadata.endDate;
    const singleMs = getFlexibleDateTimestamp(singleRaw, "center");
    if (singleMs == null) {
      return null;
    }

    return {
      note,
      kind: "point",
      labelDate: formatFlexibleDate(singleRaw),
      sortStart: singleMs,
      sortEnd: singleMs,
      startMs: singleMs,
      endMs: singleMs,
      summaryDate: dateLabelByMode.reference,
    };
  }

  function projectToStage(value, domainStart, domainSpan, width) {
    return ((value - domainStart) / domainSpan) * (width - 96) + 48;
  }

  function assignTimelineRows(items, padding, pointWidth) {
    const lanes = [];
    return items
      .slice()
      .sort((left, right) => left.startX - right.startX)
      .map((item) => {
        const intervalStart = item.kind === "point" ? item.anchorX - pointWidth / 2 : item.startX;
        const intervalEnd = item.kind === "point" ? item.anchorX + pointWidth / 2 : item.endX;
        let row = 0;

        while (lanes[row] != null && intervalStart <= lanes[row] + padding) {
          row += 1;
        }

        lanes[row] = intervalEnd;
        return {
          ...item,
          row,
        };
      });
  }

  function buildTimelineStageHtml({ axisY, domainStart, domainEnd, height, items, selectedNoteId, width }) {
    const ticks = buildTimelineTicks(domainStart, domainEnd, width, axisY);
    const bands = buildTimelineBands(domainStart, domainEnd, width, height);
    const entries = items
      .map((item) => {
        if (item.kind === "point") {
          return buildPointTimelineEntry(item, axisY, selectedNoteId);
        }

        return buildRangeTimelineEntry(item, selectedNoteId);
      })
      .join("");

    return `
      <div class="timeline-stage-shell">
        <div class="timeline-stage" style="width:${Math.round(width)}px;height:${Math.round(height)}px;">
          ${bands}
          <div class="timeline-axis" style="top:${Math.round(axisY)}px;"></div>
          ${ticks}
          ${entries}
        </div>
      </div>
    `;
  }

  function buildTimelineBands(domainStart, domainEnd, width, height) {
    const startYear = new Date(domainStart).getUTCFullYear();
    const endYear = new Date(domainEnd).getUTCFullYear();
    const spanYears = Math.max(1, endYear - startYear);
    const step = spanYears > 300 ? 100 : spanYears > 120 ? 50 : spanYears > 40 ? 10 : 5;
    const bands = [];

    for (let year = Math.floor(startYear / step) * step; year <= endYear; year += step) {
      const bandStart = Date.UTC(year, 0, 1);
      const bandEnd = Date.UTC(year + step, 0, 1);
      const left = projectToStage(bandStart, domainStart, domainEnd - domainStart, width);
      const right = projectToStage(bandEnd, domainStart, domainEnd - domainStart, width);
      bands.push(`
        <div
          class="timeline-band${Math.floor(year / step) % 2 === 0 ? " is-alt" : ""}"
          style="left:${left}px;width:${Math.max(0, right - left)}px;height:${height}px;"
        ></div>
      `);
    }

    return bands.join("");
  }

  function buildTimelineTicks(domainStart, domainEnd, width, axisY) {
    const startYear = new Date(domainStart).getUTCFullYear();
    const endYear = new Date(domainEnd).getUTCFullYear();
    const spanYears = Math.max(1, endYear - startYear);
    const step = spanYears > 500 ? 100 : spanYears > 180 ? 50 : spanYears > 70 ? 20 : spanYears > 25 ? 10 : spanYears > 10 ? 5 : 1;
    const ticks = [];

    for (let year = Math.floor(startYear / step) * step; year <= endYear + step; year += step) {
      const x = projectToStage(Date.UTC(year, 0, 1), domainStart, domainEnd - domainStart, width);
      ticks.push(`
        <div class="timeline-tick" style="left:${x}px;top:${axisY - 18}px;"></div>
        <div class="timeline-tick-label" style="left:${x}px;top:${axisY + 16}px;">${year}</div>
      `);
    }

    return ticks.join("");
  }

  function buildPointTimelineEntry(item, axisY, selectedNoteId) {
    const typeLabel = context.data.getNoteTypeLabels()[item.note.type] || "Page";
    const selectedClass = item.note.id === selectedNoteId ? " is-selected" : "";
    const stemHeight = Math.max(28, Math.abs(axisY - (item.side === "top" ? item.top + 74 : item.top)) - 10);
    const stemTop = item.side === "top" ? item.top + 74 : axisY + 10;
    const dotTop = axisY - 7;

    return `
      <div class="timeline-entry timeline-entry-${item.side}${selectedClass}" style="left:${item.anchorX}px;top:${item.top}px;">
        <button type="button" class="timeline-card timeline-card-point timeline-card-${escapeHtml(
          item.note.type
        )}" data-select-timeline-note="${item.note.id}">
          <span class="timeline-card-date">${escapeHtml(item.labelDate)}</span>
          <strong>${escapeHtml(item.note.title)}</strong>
          <span class="timeline-card-type">${escapeHtml(typeLabel)}</span>
        </button>
        <span class="timeline-entry-stem" style="top:${stemTop - item.top}px;height:${stemHeight}px;"></span>
        <span class="timeline-entry-dot" style="top:${dotTop - item.top}px;"></span>
      </div>
    `;
  }

  function buildRangeTimelineEntry(item, selectedNoteId) {
    const typeLabel = context.data.getNoteTypeLabels()[item.note.type] || "Page";
    const selectedClass = item.note.id === selectedNoteId ? " is-selected" : "";
    const left = Math.min(item.startX, item.endX);
    const width = Math.max(24, Math.abs(item.endX - item.startX));

    return `
      <div class="timeline-range timeline-range-${item.kind} timeline-range-${item.side}${selectedClass}" style="left:${left}px;top:${item.top}px;width:${width}px;">
        <button type="button" class="timeline-range-bar timeline-card-${escapeHtml(
          item.note.type
        )}" data-select-timeline-note="${item.note.id}">
          <span class="timeline-range-title">${escapeHtml(item.note.title)}</span>
          <span class="timeline-range-date">${escapeHtml(item.labelDate)}</span>
          <span class="timeline-range-type">${escapeHtml(typeLabel)}</span>
        </button>
      </div>
    `;
  }

  function renderTimelineFocus(dataset) {
    const selectedItem =
      dataset.items.find((item) => item.note.id === context.state.timeline.selectedNoteId) ||
      dataset.items[0];

    if (!selectedItem) {
      context.elements.timelineFocus.innerHTML = "";
      return;
    }

    const selectedType = context.data.getNoteTypeLabels()[selectedItem.note.type] || "Page";
    const relatedItems = dataset.items
      .filter((item) => item.note.id !== selectedItem.note.id)
      .slice(0, 5);

    context.elements.timelineFocus.innerHTML = `
      <div class="timeline-focus-grid">
        <article class="timeline-focus-card">
          <p class="eyebrow">Repere selectionne</p>
          <h4>${escapeHtml(selectedItem.note.title)}</h4>
          <p class="timeline-focus-meta">${escapeHtml(selectedType)} · ${escapeHtml(
            selectedItem.labelDate
          )}</p>
          <p>${escapeHtml(
            AtlasApp.helpers.extractSummary(selectedItem.note.content)
          )}</p>
          <button type="button" class="button button-primary" data-open-timeline-note="${selectedItem.note.id}">
            Ouvrir la page
          </button>
        </article>

        <article class="timeline-focus-card">
          <p class="eyebrow">Autres repères</p>
          <div class="timeline-moment-list">
            ${relatedItems
              .map((item) => {
                return `
                  <button type="button" class="timeline-moment" data-select-timeline-note="${item.note.id}">
                    <strong>${escapeHtml(item.note.title)}</strong>
                    <span>${escapeHtml(item.labelDate)}</span>
                  </button>
                `;
              })
              .join("")}
          </div>
        </article>
      </div>
    `;
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
        : "Votre espace local contient vos brouillons, revisions et notes rapides.";

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

  function renderTagSuggestions(target) {
    const input =
      target === "quick" ? context.elements.quickTags : context.elements.tagsInput;
    const container =
      target === "quick"
        ? context.elements.quickTagSuggestions
        : context.elements.noteTagSuggestions;

    if (!input || !container) {
      return;
    }

    const draft = input.value.split(",").pop()?.trim() || "";
    const normalizedDraft = normalizeTag(draft);
    const suggestions = normalizedDraft
      ? context.notes
          .getAllTags()
          .filter((tag) => tag.startsWith(normalizedDraft) && tag !== normalizedDraft)
          .slice(0, 6)
      : [];

    container.innerHTML = "";
    container.classList.toggle("is-hidden", !suggestions.length);

    suggestions.forEach((tag) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "tag-suggestion";
      button.dataset.tagSuggestion = tag;
      button.dataset.tagSuggestionTarget = target;
      button.textContent = tag;
      container.appendChild(button);
    });
  }

  function renderQuickCapture() {
    document.body.classList.toggle("quick-capture-open", context.state.quickCaptureOpen);
    context.elements.quickCapturePanel.classList.toggle(
      "is-hidden",
      !context.state.quickCaptureOpen
    );
  }

  function syncDynamicControls() {
    populateSelect(
      context.elements.typeInput,
      context.data.getNoteTypeEntries().map((entry) => ({
        value: entry.id,
        label: entry.label,
      })),
      context.notes.getActiveNote()?.type || context.elements.typeInput.value
    );

    populateSelect(
      context.elements.quickType,
      context.data.getNoteTypeEntries().map((entry) => ({
        value: entry.id,
        label: entry.label,
      })),
      context.elements.quickType?.value || "concept"
    );

    populateSelect(
      context.elements.templateType,
      context.data.getNoteTypeEntries().map((entry) => ({
        value: entry.id,
        label: entry.label,
      })),
      context.state.activeTemplateType
    );

    populateSelect(
      context.elements.typeFilter,
      [
        { value: "all", label: "Tous les types" },
        ...context.data.getNoteTypeEntries().map((entry) => ({
          value: entry.id,
          label: entry.label,
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
      context.elements.quizFolder,
      [
        { value: "", label: "Choisir un dossier" },
        ...context.state.notes
          .filter((note) => note.type === "folder")
          .sort((left, right) => left.title.localeCompare(right.title, "fr", { sensitivity: "base" }))
          .map((note) => ({ value: note.id, label: note.title })),
      ],
      context.elements.quizFolder?.value || ""
    );
    populateSelect(
      context.elements.timelineFolder,
      [
        { value: "", label: "Choisir un dossier" },
        ...context.state.notes
          .filter((note) => note.type === "folder")
          .sort((left, right) => left.title.localeCompare(right.title, "fr", { sensitivity: "base" }))
          .map((note) => ({ value: note.id, label: note.title })),
      ],
      context.state.timeline.folderId
    );
    populateSelect(
      context.elements.timelineTag,
      [
        { value: "", label: "Choisir un tag" },
        ...context.notes.getAllTags().map((tag) => ({ value: tag, label: tag })),
      ],
      context.state.timeline.tag
    );
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
    if (context.elements.timelineScope) {
      context.elements.timelineScope.value = context.state.timeline.scope;
    }
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
    renderTagSuggestions,
    renderTabs,
    renderTemplateEditor,
    renderTimelineView,
    renderWorkspaceBanner,
    syncDynamicControls,
    syncEditorAvailability,
  };
  };
})(window);
