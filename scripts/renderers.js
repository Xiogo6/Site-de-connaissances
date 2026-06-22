(function initializeRenderersModule(global) {
  const AtlasApp = (global.AtlasApp = global.AtlasApp || {});

  AtlasApp.createRenderersModule = function createRenderersModule(context) {
    const {
      escapeHtml,
      extractLinks,
      formatFlexibleDate,
      getFlexibleDateTimestamp,
      normalizeTag,
      parseFlexibleDateParts,
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
    renderFeed();
    renderVisualizationMode();
    renderGraphFilters();
    renderWorkspaceBanner();
    renderKnowledgeMode();
    renderKnowledgeList();
    hydrateEditorFromActiveNote();
    renderStructuredFields();
    syncEditorAvailability();
    renderPreview();
    renderQuizQuestionBank();
    renderConnections();
    renderStats();
    renderDueReviewList();
    context.graph.drawGraph();
    context.quiz.renderQuizViewMode();
    context.quiz.renderQuizDashboard();
    context.quiz.renderQuizCard();
    renderTimelineView();
    renderSportTracker();
    renderTemplateEditor();
    renderAiSettings();
    renderPublishCenter();
    renderQuickCapture();
    renderSidebarRecap();
    renderOrganization();
    renderTagSettings();
    context.mascot?.sync(true);
  }

  function renderTabs() {
    document.body.classList.toggle("utility-drawer-open", context.state.utilityDrawerOpen);
    document.body.classList.toggle("feed-nav-compact", context.state.feedNavCompact);
    document.documentElement.classList.toggle("feed-view-active", context.state.activeTab === "feed");
    document.body.classList.toggle("feed-view-active", context.state.activeTab === "feed");
    const quizViewActive = context.state.activeTab === "quiz";
    const visualizationViewActive = context.state.activeTab === "visualization";
    document.documentElement.classList.toggle("quiz-view-active", quizViewActive);
    document.body.classList.toggle("quiz-view-active", quizViewActive);
    document.documentElement.classList.toggle("visualization-view-active", visualizationViewActive);
    document.body.classList.toggle("visualization-view-active", visualizationViewActive);
    const graphViewActive =
      context.state.activeTab === "graph" ||
      (context.state.activeTab === "visualization" && context.state.visualizationMode === "graph");
    document.documentElement.classList.toggle("graph-view-active", graphViewActive);
    document.body.classList.toggle("graph-view-active", graphViewActive);
    if (!graphViewActive) {
      context.state.graphFiltersOpen = false;
    }
    context.elements.tabs.forEach((tab) => {
      tab.classList.toggle("is-active", tab.dataset.tab === context.state.activeTab);
    });

    context.elements.utilityLinks.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.utilityTab === context.state.activeTab);
    });

    const utilityActive = ["settings", "publish", "sport"].includes(context.state.activeTab);
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
      const isVisualizationCompanion =
        context.state.activeTab === "visualization" &&
        key === context.state.visualizationMode;
      panel.classList.toggle(
        "is-active",
        key === context.state.activeTab || isVisualizationCompanion
      );
      panel.classList.toggle("is-revision-hidden", false);
      panel.classList.toggle(
        "is-visualization-hidden",
        (key === "graph" || key === "timeline") &&
          context.state.activeTab === "visualization" &&
          key !== context.state.visualizationMode
      );
    });

    renderGraphFilters();
    context.mascot?.sync();
  }

  function renderVisualizationMode() {
    context.elements.visualizationModeButtons?.forEach((button) => {
      button.classList.toggle(
        "is-active",
        button.dataset.visualizationMode === context.state.visualizationMode
      );
    });
  }

  function renderGraphFilters() {
    const hasActiveFilters =
      context.state.graphShowTags ||
      context.state.graphTagFilter !== "all" ||
      context.state.graphFocusMode !== "all";
    const isOpen = Boolean(context.state.graphFiltersOpen);
    const controls = context.elements.graphShowTags?.closest(".graph-controls");

    context.elements.graphFilterToggle?.classList.toggle("is-active", hasActiveFilters || isOpen);
    context.elements.graphFilterToggle?.setAttribute("aria-expanded", isOpen ? "true" : "false");
    controls?.classList.toggle("is-open", isOpen);
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
    const remote = context.state.remote || {};
    let message = "";
    let variant = "";

    if (remote.status === "syncing") {
      message = "Attention : synchronisation en cours. Ne fermez pas la page.";
      variant = "is-warning";
    } else if (remote.status === "error" && context.data.isRemoteConfigured()) {
      message = "Attention : synchronisation en echec. Vos changements restent sur ce Mac.";
      variant = "is-error";
    }

    if (!message) {
      context.elements.workspaceBanner.innerHTML = "";
      return;
    }

    context.elements.workspaceBanner.innerHTML = `
      <div
        class="workspace-banner-message ${variant}"
        role="status"
        aria-live="polite"
        ${remote.lastError ? `title="${escapeHtml(remote.lastError)}"` : ""}
      >
        ${escapeHtml(message)}
      </div>
    `;
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
      const themeTitle = context.elements.themeToggleButton.querySelector("strong");
      if (themeTitle) {
        themeTitle.textContent = isDark ? "Mode clair" : "Mode nuit";
      }
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
      daily:
        '<svg viewBox="0 0 24 24" role="presentation"><path d="M7 4v3M17 4v3M5 8h14"></path><rect x="5" y="6" width="14" height="14" rx="2"></rect><path d="M8 12h8M8 16h5"></path></svg>',
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
    const readOnly = context.data.isReadOnlyMode();
    const aiWrapper =
      context.elements.aiEditorStatus?.closest(".editor-secondary-actions") ||
      context.elements.aiAssistButton?.closest(".editor-secondary-actions");
    const aiConfig = context.ai?.getConfig?.() || context.state.aiConfig || {};
    const aiStatus = context.state.aiStatus || context.ai?.getDefaultStatus?.() || {};
    const hasRewriteBackup = context.ai?.hasRewriteBackup?.();
    context.elements.knowledgeWorkspace.classList.toggle("is-editing", isEditing);
    if (!isEditing) {
      document.body.classList.remove("editor-writing");
    }
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
    context.elements.deleteActiveNoteButton?.classList.toggle(
      "is-hidden",
      !isEditing || !context.state.activeNoteId
    );
    aiWrapper?.classList.toggle("is-hidden", !isEditing || readOnly);
    if (context.elements.aiAssistButton) {
      const isBusy = Boolean(aiStatus.busy);
      const label = isBusy ? "Gemini en cours..." : "Reformuler";
      setActionButtonLabel(context.elements.aiAssistButton, label);
      context.elements.aiAssistButton.disabled = readOnly || isBusy;
      context.elements.aiAssistButton.classList.toggle("button-primary", false);
      context.elements.aiAssistButton.classList.toggle("button-ghost", false);
      context.elements.aiAssistButton.classList.toggle("button-flat", true);
    }
    if (context.elements.aiQuestionsButton) {
      const isBusy = Boolean(aiStatus.busy);
      const label = isBusy ? "Gemini en cours..." : "Creer les questions";
      setActionButtonLabel(context.elements.aiQuestionsButton, label);
      context.elements.aiQuestionsButton.disabled = readOnly || isBusy;
      context.elements.aiQuestionsButton.classList.toggle("button-primary", false);
      context.elements.aiQuestionsButton.classList.toggle("button-ghost", false);
      context.elements.aiQuestionsButton.classList.toggle("button-flat", true);
    }
    if (context.elements.aiUndoButton) {
      context.elements.aiUndoButton.classList.toggle(
        "is-hidden",
        !isEditing || readOnly || !hasRewriteBackup
      );
      context.elements.aiUndoButton.disabled = readOnly || Boolean(aiStatus.busy) || !hasRewriteBackup;
    }
    if (context.elements.aiEditorStatus) {
      const hasConfig = Boolean(aiConfig.apiKey);
      const defaultMessage = hasConfig
        ? hasRewriteBackup
          ? "Reformulation disponible a annuler."
          : "Gemini est pret."
        : "IA locale";
      context.elements.aiEditorStatus.textContent =
        aiStatus.error || aiStatus.message || defaultMessage;
      context.elements.aiEditorStatus.classList.toggle("is-error", aiStatus.type === "error");
      context.elements.aiEditorStatus.classList.toggle("is-success", aiStatus.type === "success");
      context.elements.aiEditorStatus.classList.toggle("is-working", Boolean(aiStatus.busy));
    }
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

    const shouldReturnToQuiz =
      context.state.quizReturnActive && context.state.activeTab === "knowledge";
    const shouldReturnToStats =
      context.state.activeTab === "quiz" &&
      context.state.quizView === "stats" &&
      Boolean(context.state.quizStatsDrilldown);

    if (shouldReturnToQuiz || shouldReturnToStats) {
      context.elements.quickCaptureToggle.textContent = shouldReturnToQuiz
        ? "Retour au quiz"
        : "Retour aux stats";
      context.elements.quickCaptureToggle.classList.remove("is-hidden");
      context.elements.quickCaptureToggle.classList.remove("is-save-mode");
      context.elements.quickCaptureToggle.classList.add("is-quiz-return-mode");
      return;
    }

    const shouldHideQuickAction = context.state.activeTab === "quiz";
    context.elements.quickCaptureToggle.classList.toggle("is-hidden", shouldHideQuickAction);
    if (shouldHideQuickAction) {
      context.elements.quickCaptureToggle.classList.remove("is-save-mode", "is-quiz-return-mode");
      return;
    }

    const shouldSave =
      isEditing && context.state.activeTab === "knowledge" && !context.data.isReadOnlyMode();
    context.elements.quickCaptureToggle.textContent = shouldSave ? "Enregistrer" : "Note rapide";
    context.elements.quickCaptureToggle.classList.toggle("is-save-mode", shouldSave);
    context.elements.quickCaptureToggle.classList.remove("is-quiz-return-mode");
  }

  function syncEditorAvailability() {
    const readOnly = context.data.isReadOnlyMode();
    [
      context.elements.titleInput,
      context.elements.typeInput,
      context.elements.tagsInput,
      context.elements.directClassifyInput,
      context.elements.parentInput,
      context.elements.favoriteInput,
      context.elements.noteHasDate,
      context.elements.noteDateMode,
      context.elements.noteDateSingle,
      context.elements.noteDateStart,
      context.elements.noteDateEnd,
      ...context.elements.formatButtons,
      context.elements.contentInput,
      context.elements.deleteActiveNoteButton,
      context.elements.aiAssistButton,
      context.elements.aiQuestionsButton,
      context.elements.aiUndoButton,
      context.elements.templateType,
      context.elements.aiApiKeyInput,
      context.elements.aiModelInput,
      context.elements.aiSaveButton,
      context.elements.aiClearButton,
      context.elements.aiTestButton,
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
      context.elements.addQuizQuestionButton,
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
      allowDrag: !filterActive,
      forceExpanded: filterActive,
      emptyMessage: filterActive
        ? "Aucune page ne correspond aux filtres"
        : "Aucune page pour le moment",
    });
  }

  function renderFeed() {
    if (!context.elements.feedList) {
      return;
    }

    renderFeedControls();
    const filtered = getFeedFilteredNotes(context.notes.getFilteredNotes());
    const notes = getOrderedFeedNotes(filtered);
    context.elements.feedCount.textContent = `${notes.length} page${notes.length > 1 ? "s" : ""}`;
    context.elements.feedModeButtons.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.feedMode === context.state.feedMode);
    });

    if (!notes.length) {
      context.elements.feedList.innerHTML = `
        <article class="feed-empty">
          <h3>Aucune page dans ce feed</h3>
          <p>Modifiez les filtres dans la bibliotheque pour relancer le flux.</p>
        </article>
      `;
      return;
    }

    context.elements.feedList.innerHTML = notes.map((note, index) => renderFeedCard(note, index, notes.length)).join("");
  }

  function getFeedFilteredNotes(notes) {
    const excludedTags = new Set(context.state.feedExcludedTags || []);
    if (!excludedTags.size) {
      return notes;
    }

    return notes.filter((note) => {
      return !(note.tags || []).some((tag) => excludedTags.has(normalizeTag(tag)));
    });
  }

  function renderFeedControls() {
    if (context.elements.feedSearchInput && document.activeElement !== context.elements.feedSearchInput) {
      context.elements.feedSearchInput.value = context.state.filter || "";
    }

    if (context.elements.feedFavoritesFilter) {
      context.elements.feedFavoritesFilter.checked = context.state.favoritesOnly;
    }

    const excludedCount = (context.state.feedExcludedTags || []).length;
    if (context.elements.feedExcludedCount) {
      context.elements.feedExcludedCount.textContent = excludedCount ? String(excludedCount) : "";
    }
    if (context.elements.feedTagFilterButton) {
      context.elements.feedTagFilterButton.classList.toggle("has-active-filter", Boolean(excludedCount));
      context.elements.feedTagFilterButton.setAttribute(
        "aria-expanded",
        context.state.feedTagFilterOpen ? "true" : "false"
      );
    }
    if (context.elements.feedTagFilterPopover) {
      context.elements.feedTagFilterPopover.classList.toggle("is-hidden", !context.state.feedTagFilterOpen);
    }

    renderFeedExcludedTags();
  }

  function renderFeedExcludedTags() {
    if (!context.elements.feedExcludedTags) {
      return;
    }

    const excluded = new Set(context.state.feedExcludedTags || []);
    const tags = context.notes.getAllTags();
    context.elements.feedExcludedTags.innerHTML = tags.length
      ? tags
          .map((tag) => {
            const key = normalizeTag(tag);
            const isExcluded = excluded.has(key);
            return `<button class="feed-tag-filter${isExcluded ? " is-excluded" : ""}" type="button" data-feed-exclude-tag="${escapeHtml(
              key
            )}" aria-pressed="${isExcluded ? "true" : "false"}">${escapeHtml(tag)}</button>`;
          })
          .join("")
      : '<span class="feed-filter-empty">Aucun tag</span>';
  }

  function getOrderedFeedNotes(notes) {
    const feedNotes = [...notes];
    if (context.state.feedMode === "foryou") {
      return feedNotes.sort((left, right) => getForYouScore(right) - getForYouScore(left));
    }

    return feedNotes.sort((left, right) => {
      const leftRank = getRandomFeedRank(left.id);
      const rightRank = getRandomFeedRank(right.id);
      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }
      return left.title.localeCompare(right.title, "fr", { sensitivity: "base" });
    });
  }

  function getRandomFeedRank(noteId) {
    return hashString(`${context.state.feedSeed}:${noteId}`);
  }

  function getForYouScore(note) {
    const active = context.notes.getActiveNote();
    const activeTags = new Set((active?.tags || []).map((tag) => tag.toLowerCase()));
    const noteTags = (note.tags || []).map((tag) => tag.toLowerCase());
    const sharedTags = noteTags.filter((tag) => activeTags.has(tag)).length;
    const activeLinks = active ? extractLinks(active.content || "").map((title) => title.toLowerCase()) : [];
    const linkedToActive = activeLinks.includes(String(note.title || "").toLowerCase());
    const recentlyUpdated = new Date(note.updatedAt || note.createdAt || 0).getTime() || 0;
    const weeksOld = recentlyUpdated ? (Date.now() - recentlyUpdated) / 1000 / 60 / 60 / 24 / 7 : 12;
    const recencyScore = Math.max(0, 12 - Math.min(12, weeksOld));

    return (
      (note.favorite ? 40 : 0) +
      sharedTags * 18 +
      (linkedToActive ? 24 : 0) +
      context.notes.getConnectionCount(note) * 2 +
      recencyScore
    );
  }

  function renderFeedCard(note, index, total) {
    const typeLabel = context.data.getNoteTypeLabels()[note.type] || "Concept";
    const readableContent = getReadablePreviewContent(note) || "Cette page est prete a etre enrichie.";
    const updated = context.helpers.formatDate(note.updatedAt || note.createdAt);
    const pageDate = getFeedPageDateLabel(note);
    const tagMarkup = (note.tags || [])
      .slice(0, 6)
      .map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`)
      .join("");
    const favoriteMarkup = note.favorite ? '<span class="tag tag-favorite">Favori</span>' : "";
    const tagsBlock =
      favoriteMarkup || tagMarkup
        ? `<span class="feed-tags">${favoriteMarkup}${tagMarkup}</span>`
        : "";

    return `
      <article class="feed-card" data-feed-note-id="${note.id}" aria-label="${escapeHtml(note.title)}">
        <button class="feed-card-open" data-feed-open-note="${note.id}" type="button" aria-label="Ouvrir ${escapeHtml(
          note.title
        )}">
          <span class="feed-card-index">${index + 1} / ${total}</span>
          <span class="feed-heading-row">
            <span class="feed-title-row">
              ${getNoteTypeIconMarkup(note.type)}
              <span>${escapeHtml(note.title || "Sans titre")}</span>
            </span>
          </span>
          <span class="feed-meta-row">
            <span class="feed-meta-main">
              <span>${escapeHtml(typeLabel)}</span>
              ${pageDate ? `<span>${escapeHtml(pageDate)}</span>` : ""}
            </span>
            ${tagsBlock}
          </span>
        </button>
        <div class="feed-content">
          ${renderNoteHtml(readableContent)}
        </div>
        <footer class="feed-card-footer">
          <span class="feed-updated-date">MàJ: ${escapeHtml(updated)}</span>
          <div class="feed-actions" aria-label="Actions de page">
            <button type="button" class="feed-action" data-feed-share-note="${note.id}" aria-label="Partager">
              <svg viewBox="0 0 24 24" role="presentation">
                <path d="M7 12l10-6-4 12-2-5z" />
                <path d="M7 12l4 1" />
              </svg>
            </button>
            <button type="button" class="feed-action" data-feed-comment-note="${note.id}" aria-label="Commenter">
              <svg viewBox="0 0 24 24" role="presentation">
                <path d="M6 6h12v9H9l-3 3z" />
              </svg>
            </button>
            <button type="button" class="feed-action" data-feed-open-note="${note.id}" aria-label="Ouvrir">
              <svg viewBox="0 0 24 24" role="presentation">
                <path d="M7 17L17 7" />
                <path d="M9 7h8v8" />
              </svg>
            </button>
          </div>
        </footer>
      </article>
    `;
  }

  function getFeedPageDateLabel(note) {
    const metadata = note.metadata || {};
    if (!metadata.hasDate) {
      return "";
    }

    const labels = {
      reference: "Date",
      life: "Naissance / deces",
      range: "Periode",
    };
    const hasStartDate = hasKnownStructuredDate(metadata.startDate);
    const hasEndDate = hasKnownStructuredDate(metadata.endDate);
    const hasSingleDate = hasKnownStructuredDate(metadata.singleDate);

    if (metadata.dateMode === "range") {
      if (!hasStartDate && !hasEndDate) {
        return "";
      }
      return `${labels.range}: ${formatStructuredDate(metadata.startDate)} -> ${formatStructuredDate(
        metadata.endDate
      )}`;
    }

    if (metadata.dateMode === "life") {
      if (!hasStartDate && !hasEndDate) {
        return "";
      }
      return `${labels.life}: ${formatStructuredDate(metadata.startDate)} -> ${formatStructuredDate(
        metadata.endDate
      )}`;
    }

    if (!hasSingleDate) {
      return "";
    }
    return `${labels.reference}: ${formatStructuredDate(metadata.singleDate)}`;
  }

  function hashString(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
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
      context.state.editorQuizQuestions = [];
      context.state.editorQuizQuestionsNoteId = null;
      context.notes.syncNewPageClassificationControls();
      return;
    }

    const metadata = note.metadata || {};
    context.elements.titleInput.value = note.title;
    context.elements.typeInput.value = note.type;
    context.elements.tagsInput.value = note.tags.join(", ");
    context.elements.parentInput.value = note.parentId || "";
    context.elements.favoriteInput.checked = Boolean(note.favorite);
    context.elements.noteHasDate.value = metadata.hasDate ? "true" : "false";
    context.elements.noteDateMode.value =
      !metadata.hasDate
        ? "none"
        : ["reference", "life", "range"].includes(metadata.dateMode)
        ? metadata.dateMode
        : "reference";
    context.elements.noteDateSingle.value = metadata.singleDate ? formatFlexibleDate(metadata.singleDate) : "";
    context.elements.noteDateStart.value = metadata.startDate ? formatFlexibleDate(metadata.startDate) : "";
    context.elements.noteDateEnd.value = metadata.endDate ? formatFlexibleDate(metadata.endDate) : "";
    context.elements.contentInput.value = note.content;
    if (context.state.editorQuizQuestionsNoteId !== note.id) {
      context.state.editorQuizQuestions = structuredClone(note.quizQuestions || []);
      context.state.editorQuizQuestionsNoteId = note.id;
    }

    const templateContent = context.data.buildTemplateContent(note.type, note.title || "Sans titre");
    context.state.editorTemplateSeed =
      note.content.trim() === templateContent.trim()
        ? {
            type: note.type,
            title: note.title || "Sans titre",
            content: templateContent,
          }
        : null;
    context.notes.syncNewPageClassificationControls();
  }

  function renderStructuredFields() {
    const mode = context.elements.noteDateMode.value;
    const hasDate = mode !== "none";
    const isRange = mode === "range";
    const labels = {
      reference: "Date de reference",
      life: "Date de naissance",
      range: "Date",
    };

    context.elements.noteHasDate.value = hasDate ? "true" : "false";
    context.elements.genericDateFields.classList.toggle("is-hidden", !hasDate);
    context.elements.genericDateFields.classList.toggle("is-single-date", mode === "reference");
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

    const preservedScrollX = window.scrollX;
    const preservedScrollY = window.scrollY;

    const draftNote = {
      ...activeNote,
      title: context.elements.titleInput.value.trim() || "Sans titre",
      type: context.elements.typeInput.value,
      tags: parseTags(context.elements.tagsInput.value),
      parentId: context.notes.getEditorParentId(activeNote),
      favorite: context.elements.favoriteInput.checked,
      metadata: context.notes.collectMetadataFromInputs(),
      content: context.elements.contentInput.value,
      quizQuestions: context.state.editorQuizQuestions,
    };

    renderPreview(draftNote, true);
    renderConnections(draftNote);
    renderStats(draftNote);

    window.requestAnimationFrame(() => {
      if (window.scrollX !== preservedScrollX || window.scrollY !== preservedScrollY) {
        window.scrollTo({
          left: preservedScrollX,
          top: preservedScrollY,
          behavior: "auto",
        });
      }
    });
  }

  function renderTemplateEditor() {
    renderTypeSettingsList();
    if (!context.elements.templateEditor) {
      return;
    }

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
      const canDelete = !context.notes.isTypeUsed(entry.id);
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
          <button
            type="button"
            class="button button-ghost settings-delete-type"
            data-delete-type="${entry.id}"
            ${canDelete ? "" : "disabled"}
          >
            Supprimer
          </button>
        </div>
        ${
          !canDelete
            ? '<span class="helper-copy helper-copy-compact">Ce type est utilise par au moins une page.</span>'
            : ""
        }
      `;
      context.elements.typeSettingsList.appendChild(row);
    });
  }

  function renderTagSettings() {
    if (!context.elements.tagRenameSource) {
      return;
    }

    const tagOptions = [
      { value: "", label: "Choisir un tag" },
      ...context.notes.getAllTags().map((tag) => ({ value: tag, label: tag })),
    ];
    populateSelect(
      context.elements.tagRenameSource,
      tagOptions,
      context.elements.tagRenameSource.value || ""
    );
  }

  function renderPreview(note = context.notes.getActiveNote(), isDraft = false) {
    if (!note) {
      if (context.elements.previewQuizQuestionsBody) {
        context.elements.previewQuizQuestionsBody.innerHTML = "";
      }
      return;
    }

    const metadata = note.metadata || {};
    context.elements.previewTitle.innerHTML = `${getNoteTypeIconMarkup(note.type)}<span>${escapeHtml(
      note.title || "Sans titre"
    )}</span>`;
    context.elements.previewTags.innerHTML = "";
    context.elements.previewMetaTop.innerHTML = "";
    context.elements.previewMetaBottom.innerHTML = "";
    context.elements.previewContent.innerHTML = renderNoteHtml(getReadablePreviewContent(note));
    context.elements.previewCard?.style.removeProperty("--read-swipe-x");
    context.elements.noteStatus.textContent = "";
    context.elements.noteStatus.classList.add("is-hidden");
    context.elements.noteStatus.hidden = true;

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
    context.elements.previewMetaBottom.appendChild(updatedMeta);

    if (metadata.hasDate) {
      const labels = {
        reference: "Date de reference",
        life: "Naissance / deces",
        range: "Periode",
      };
      const hasStartDate = hasKnownStructuredDate(metadata.startDate);
      const hasEndDate = hasKnownStructuredDate(metadata.endDate);
      const hasSingleDate = hasKnownStructuredDate(metadata.singleDate);

      if (metadata.dateMode === "range" && !hasStartDate && !hasEndDate) {
        return;
      }

      if (metadata.dateMode === "life" && !hasStartDate && !hasEndDate) {
        return;
      }

      if (metadata.dateMode !== "range" && metadata.dateMode !== "life" && !hasSingleDate) {
        return;
      }

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
      context.elements.previewMetaTop.appendChild(dateMeta);
    }

    renderQuizQuestionPreview(note, isDraft);
  }

  function renderQuizQuestionBank() {
    const editable = context.state.noteViewMode === "edit" && !context.data.isReadOnlyMode();
    const activeNote = context.notes.getActiveNote();
    const questions =
      editable && context.state.editorQuizQuestionsNoteId === activeNote?.id
        ? context.state.editorQuizQuestions || []
        : activeNote?.quizQuestions || [];

    if (context.elements.addQuizQuestionButton) {
      context.elements.addQuizQuestionButton.disabled = context.data.isReadOnlyMode();
    }
    const bankHeader = context.elements.noteQuizQuestionsBody
      ?.closest("table")
      ?.querySelector("thead tr");
    if (bankHeader) {
      bankHeader.innerHTML = "<th></th><th>Question</th><th>Reponses</th>";
    }
    renderQuizQuestionTable(
      context.elements.noteQuizQuestionsBody,
      questions,
      {
        editable,
        emptyMessage: "Aucune question pour l instant. Ajoutez-en une pour alimenter le quiz.",
      }
    );
  }

  function renderQuizQuestionPreview(note, isDraft = false) {
    if (!context.elements.previewQuizQuestionsBody) {
      return;
    }

    const questions =
      (isDraft || context.state.noteViewMode === "edit") &&
      context.state.editorQuizQuestionsNoteId === note.id
        ? context.state.editorQuizQuestions || []
        : note.quizQuestions || [];

    renderQuizQuestionTable(context.elements.previewQuizQuestionsBody, questions, {
      editable: false,
      emptyMessage: "Aucune question enregistree sur cette note.",
      readOnlyPreview: true,
    });
  }

  function renderQuizQuestionTable(container, questions, options = {}) {
    if (!container) {
      return;
    }

    container.innerHTML = "";

    if (!questions.length) {
      const row = document.createElement("tr");
      row.className = "quiz-question-empty-row";
      const cell = document.createElement("td");
      cell.colSpan = options.readOnlyPreview ? 2 : 3;
      cell.textContent = options.emptyMessage || "Aucune question";
      row.appendChild(cell);
      container.appendChild(row);
      return;
    }

    questions.forEach((question, index) => {
      const row = document.createElement("tr");
      row.dataset.quizQuestionIndex = String(index);

      if (options.editable) {
        const actionCell = document.createElement("td");
        actionCell.className = "quiz-question-remove-cell";
        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.className = "button button-ghost quiz-question-remove";
        removeButton.dataset.removeQuizQuestion = String(index);
        removeButton.disabled = context.data.isReadOnlyMode();
        removeButton.setAttribute("aria-label", "Supprimer la question");
        removeButton.textContent = "×";
        actionCell.appendChild(removeButton);
        row.appendChild(actionCell);
      }

      const questionCell = document.createElement("td");
      if (options.editable) {
        const input = document.createElement("textarea");
        input.className = "text-input quiz-question-input";
        input.rows = 2;
        input.dataset.quizQuestionField = "question";
        input.dataset.quizQuestionIndex = String(index);
        input.placeholder = "Question";
        input.value = question.question || "";
        input.disabled = context.data.isReadOnlyMode();
        questionCell.appendChild(input);
      } else {
        questionCell.innerHTML = `<span class="quiz-question-text">${escapeHtml(
          question.question || ""
        )}</span>`;
      }

      const answersCell = document.createElement("td");
      if (options.editable) {
        const input = document.createElement("input");
        input.className = "text-input quiz-answer-input";
        input.type = "text";
        input.dataset.quizQuestionField = "answers";
        input.dataset.quizQuestionIndex = String(index);
        input.placeholder = "Reponse 1, Reponse 2";
        input.value = (question.answers || []).join(", ");
        input.disabled = context.data.isReadOnlyMode();
        answersCell.appendChild(input);
      } else {
        answersCell.innerHTML = `<span class="quiz-answer-text">${escapeHtml(
          (question.answers || []).join(", ")
        )}</span>`;
      }

      row.appendChild(questionCell);
      row.appendChild(answersCell);

      container.appendChild(row);
    });
  }

  function hasKnownStructuredDate(value) {
    return Boolean(value && formatStructuredDate(value) !== "inconnue");
  }

  function getReadablePreviewContent(note) {
    const lines = String(note.content || "").split("\n");
    const firstContentIndex = lines.findIndex((line) => line.trim());
    if (firstContentIndex === -1) {
      return "";
    }

    const firstLine = lines[firstContentIndex].trim();
    if (!firstLine.startsWith("# ")) {
      return note.content || "";
    }

    const headingTitle = normalizePreviewTitle(firstLine.slice(2));
    const noteTitle = normalizePreviewTitle(note.title || "");
    if (headingTitle !== noteTitle) {
      return note.content || "";
    }

    return lines
      .filter((_, index) => index !== firstContentIndex)
      .join("\n")
      .replace(/^\s+/, "");
  }

  function normalizePreviewTitle(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ");
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

    setOptionalText(context.elements.pageTotalCount, String(sourceNotes.length));
    setOptionalText(context.elements.linkCount, String(totalLinks));
    setOptionalText(context.elements.orphanCount, String(orphanNotes));
    const quizQuestions = sourceNotes.reduce((count, note) => {
      return count + (Array.isArray(note.quizQuestions) ? note.quizQuestions.length : 0);
    }, 0);
    setOptionalText(context.elements.quizCount, String(quizQuestions));
  }

  function setOptionalText(element, value) {
    if (element) {
      element.textContent = value;
    }
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
    if (!context.elements.sidebarOverview || !context.elements.sidebarHierarchy) {
      return;
    }

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
        <p class="timeline-summary-line">
          Choisissez un dossier ou un tag contenant des pages avec une date.
          Les personnes, evenements, concepts, sous-dossiers dates et pages filles apparaitront ici.
        </p>
      `;
      context.elements.timelineCanvas.className = "timeline-canvas empty-state";
      context.elements.timelineCanvas.textContent =
        "Aucune page datee trouvee pour cette source.";
      context.elements.timelineFocus.innerHTML =
        '<p class="timeline-summary-line">Touchez un repere pour lire la page associee.</p>';
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
      <p class="timeline-summary-line">
        <strong>${escapeHtml(dataset.scopeLabel)}</strong> · ${escapeHtml(dataset.summaryRange)} ·
        ${counts.people} personne(s), ${counts.events} evenement(s), ${counts.other} autre(s) repere(s).
      </p>
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
        scopeLabel: sourceLabel || "Source vide",
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

    const topSideItems = [];
    const bottomSideItems = [];
    projectedItems.forEach((item, index) => {
      (index % 2 === 0 ? topSideItems : bottomSideItems).push(item);
    });

    const topLayout = assignTimelineRows(topSideItems, 32, 170);
    const bottomLayout = assignTimelineRows(bottomSideItems, 32, 170);
    const topRows = Math.max(...topLayout.map((item) => item.row), -1) + 1;
    const bottomRows = Math.max(...bottomLayout.map((item) => item.row), -1) + 1;
    const lanePitch = 112;
    const axisY = 86 + topRows * lanePitch;
    const stageHeight = Math.max(520, axisY + 86 + bottomRows * lanePitch);

    const timelineEntries = [
      ...topLayout.map((item) => {
        const laneTop = axisY - (item.row + 1) * lanePitch;
        return {
          ...item,
          side: "top",
          top: item.kind === "point" ? laneTop + 8 : laneTop + 54,
        };
      }),
      ...bottomLayout.map((item) => {
        const laneTop = axisY + item.row * lanePitch + 20;
        return {
          ...item,
          side: "bottom",
          top: item.kind === "point" ? laneTop + 34 : laneTop + 8,
        };
      }),
    ].sort((left, right) => left.sortStart - right.sortStart || left.sortEnd - right.sortEnd);

    if (
      context.state.timeline.selectedNoteId &&
      !timelineEntries.some((item) => item.note.id === context.state.timeline.selectedNoteId)
    ) {
      context.state.timeline.selectedNoteId = null;
    }

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

    return {
      title:
        context.state.timeline.scope === "folder"
          ? `Frise du dossier ${sourceLabel || "non defini"}`
          : `Frise du tag ${sourceLabel}`,
      items: timelineEntries,
      stageHtml,
      summaryRange: `${firstLabel} -> ${lastLabel}`,
      scopeLabel: sourceLabel || "Source vide",
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
        startLabel: formatFlexibleDate(startRaw),
        endLabel: formatFlexibleDate(endRaw),
        compactStartLabel: String(new Date(Math.min(safeStart, safeEnd)).getUTCFullYear()),
        compactEndLabel: String(new Date(Math.max(safeStart, safeEnd)).getUTCFullYear()),
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
      startLabel: formatFlexibleDate(singleRaw),
      endLabel: formatFlexibleDate(singleRaw),
      compactStartLabel:
        parseFlexibleDateParts(singleRaw)?.year != null
          ? String(parseFlexibleDateParts(singleRaw).year)
          : formatFlexibleDate(singleRaw),
      compactEndLabel:
        parseFlexibleDateParts(singleRaw)?.year != null
          ? String(parseFlexibleDateParts(singleRaw).year)
          : formatFlexibleDate(singleRaw),
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
        const visualWidth =
          item.kind === "point" ? pointWidth : Math.max(96, Math.abs(item.endX - item.startX));
        const intervalStart = item.anchorX - visualWidth / 2;
        const intervalEnd = item.anchorX + visualWidth / 2;
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
    const stemHeight = Math.max(
      28,
      Math.abs(axisY - (item.side === "top" ? item.top + 82 : item.top)) - 10
    );
    const stemTop = item.side === "top" ? item.top + 82 : axisY + 10;
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
    const width = Math.max(96, Math.abs(item.endX - item.startX));
    const left = item.anchorX - width / 2;

    return `
      <div class="timeline-range timeline-range-${item.kind} timeline-range-${item.side}${selectedClass}" style="left:${left}px;top:${item.top}px;width:${width}px;">
        <button type="button" class="timeline-range-bar timeline-card-${escapeHtml(
          item.note.type
        )}" data-select-timeline-note="${item.note.id}">
          <span class="timeline-range-bound timeline-range-bound-start">${escapeHtml(
            item.compactStartLabel || item.startLabel
          )}</span>
          <span class="timeline-range-bound timeline-range-bound-end">${escapeHtml(
            item.compactEndLabel || item.endLabel
          )}</span>
          <span class="timeline-range-title">${escapeHtml(item.note.title)}</span>
          <span class="timeline-range-type">${escapeHtml(typeLabel)}</span>
        </button>
      </div>
    `;
  }

  function renderTimelineFocus(dataset) {
    const selectedItem = dataset.items.find(
      (item) => item.note.id === context.state.timeline.selectedNoteId
    );

    if (!selectedItem) {
      context.elements.timelineFocus.innerHTML =
        '<p class="timeline-summary-line">Touchez un repere, une personne ou une periode pour afficher son resume puis lire la page.</p>';
      return;
    }

    const selectedType = context.data.getNoteTypeLabels()[selectedItem.note.type] || "Page";

    context.elements.timelineFocus.innerHTML = `
      <article class="timeline-focus-card">
        <p class="eyebrow">Lecture rapide</p>
        <h4>${escapeHtml(selectedItem.note.title)}</h4>
        <p class="timeline-focus-meta">${escapeHtml(selectedType)} · ${escapeHtml(
          selectedItem.labelDate
        )}</p>
        <p>${escapeHtml(AtlasApp.helpers.extractSummary(selectedItem.note.content))}</p>
        <div class="inline-actions">
          <button type="button" class="button button-primary" data-open-timeline-note="${selectedItem.note.id}">
            Lire la page
          </button>
        </div>
      </article>
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
      context.state.snapshots.slice(0, 5).forEach((snapshot) => {
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

  function getSportSettings() {
    context.state.settings.sport = context.state.settings.sport || {
      massEntries: [],
      performanceEntries: [],
    };
    context.state.settings.sport.massEntries = context.state.settings.sport.massEntries || [];
    context.state.settings.sport.performanceEntries =
      context.state.settings.sport.performanceEntries || [];
    return context.state.settings.sport;
  }

  function renderSportTracker() {
    if (!context.elements.sportMassBody || !context.elements.sportPerformanceBody) {
      return;
    }

    const sport = getSportSettings();
    const massEntries = sport.massEntries.length ? sport.massEntries : [createEmptySportMassEntry()];
    const performanceEntries = sport.performanceEntries.length
      ? sport.performanceEntries
      : [createEmptySportPerformanceEntry()];

    context.elements.sportModeButtons.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.sportMode === context.state.sportMode);
    });
    context.elements.sportMassPanel.classList.toggle("is-hidden", context.state.sportMode !== "mass");
    context.elements.sportPerformancePanel.classList.toggle(
      "is-hidden",
      context.state.sportMode !== "performance"
    );

    context.elements.sportMassBody.innerHTML = massEntries
      .map((entry, index) => buildSportMassRow(entry, index, index < sport.massEntries.length))
      .join("");
    context.elements.sportPerformanceBody.innerHTML = performanceEntries
      .map((entry, index) =>
        buildSportPerformanceRow(entry, index, performanceEntries, index < sport.performanceEntries.length)
      )
      .join("");
  }

  function createEmptySportMassEntry() {
    return { date: "", mass: "", fasted: false };
  }

  function createEmptySportPerformanceEntry() {
    return { date: "", exercise: "", sets: "", reps: "", weight: "", rest: "" };
  }

  function buildSportMassRow(entry, index, canDelete) {
    return `
      <tr>
        <td>
          <input class="sport-input" type="date" value="${escapeHtml(entry.date || "")}" data-sport-table="mass" data-sport-index="${index}" data-sport-field="date" />
        </td>
        <td>
          <input class="sport-input" type="number" inputmode="decimal" step="0.1" value="${escapeHtml(entry.mass || "")}" data-sport-table="mass" data-sport-index="${index}" data-sport-field="mass" />
        </td>
        <td class="sport-check-cell">
          <input type="checkbox" ${entry.fasted ? "checked" : ""} data-sport-table="mass" data-sport-index="${index}" data-sport-field="fasted" />
        </td>
        <td class="sport-action-cell">
          <button
            class="button button-ghost sport-delete-button"
            type="button"
            data-delete-sport-row="mass"
            data-sport-index="${index}"
            aria-label="Supprimer la ligne de masse"
            ${canDelete ? "" : "disabled"}
          >
            Supprimer
          </button>
        </td>
      </tr>
    `;
  }

  function buildSportPerformanceRow(entry, index, entries, canDelete) {
    const datalistId = `sport-exercises-${index}`;
    const suggestions = unique(
      entries
        .slice(0, index)
        .map((item) => String(item.exercise || "").trim())
        .filter(Boolean)
    );

    return `
      <tr>
        <td>
          <input class="sport-input" type="date" value="${escapeHtml(entry.date || "")}" data-sport-table="performance" data-sport-index="${index}" data-sport-field="date" />
        </td>
        <td>
          <input class="sport-input sport-exercise-input" type="text" value="${escapeHtml(entry.exercise || "")}" list="${datalistId}" data-sport-table="performance" data-sport-index="${index}" data-sport-field="exercise" />
          <datalist id="${datalistId}">
            ${suggestions.map((exercise) => `<option value="${escapeHtml(exercise)}"></option>`).join("")}
          </datalist>
        </td>
        <td>
          <input class="sport-input" type="text" inputmode="numeric" pattern="[0-9]*" value="${escapeHtml(entry.sets || "")}" data-sport-table="performance" data-sport-index="${index}" data-sport-field="sets" />
        </td>
        <td>
          <input class="sport-input" type="text" inputmode="numeric" pattern="[0-9]*" value="${escapeHtml(entry.reps || "")}" data-sport-table="performance" data-sport-index="${index}" data-sport-field="reps" />
        </td>
        <td>
          <input class="sport-input" type="text" inputmode="decimal" value="${escapeHtml(entry.weight || "")}" data-sport-table="performance" data-sport-index="${index}" data-sport-field="weight" />
        </td>
        <td>
          <input class="sport-input" type="text" inputmode="numeric" pattern="[0-9]*" value="${escapeHtml(entry.rest || "")}" data-sport-table="performance" data-sport-index="${index}" data-sport-field="rest" />
        </td>
        <td class="sport-action-cell">
          <button
            class="button button-ghost sport-delete-button"
            type="button"
            data-delete-sport-row="performance"
            data-sport-index="${index}"
            aria-label="Supprimer la ligne de performance"
            ${canDelete ? "" : "disabled"}
          >
            Supprimer
          </button>
        </td>
      </tr>
    `;
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

  function renderAiSettings() {
    const config = context.ai?.getConfig?.() || context.state.aiConfig || {};
    const status = context.state.aiStatus || context.ai?.getDefaultStatus?.() || {};

    if (context.elements.aiApiKeyInput && document.activeElement !== context.elements.aiApiKeyInput) {
      context.elements.aiApiKeyInput.value = config.apiKey || "";
    }

    if (context.elements.aiModelInput && document.activeElement !== context.elements.aiModelInput) {
      context.elements.aiModelInput.value = config.model || AtlasApp.config.geminiDefaultModel;
    }

    if (context.elements.aiSettingsStatus) {
      const hasKey = Boolean(config.apiKey);
      const defaultMessage = hasKey
        ? "Gemini est pret."
        : "Ajoute ta cle Gemini pour utiliser l'assistant.";
      context.elements.aiSettingsStatus.textContent = status.error || status.message || defaultMessage;
      context.elements.aiSettingsStatus.classList.toggle("is-error", status.type === "error");
      context.elements.aiSettingsStatus.classList.toggle("is-success", status.type === "success");
      context.elements.aiSettingsStatus.classList.toggle("is-working", Boolean(status.busy));
    }
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

    if (context.elements.templateType) {
      populateSelect(
        context.elements.templateType,
        context.data.getNoteTypeEntries().map((entry) => ({
          value: entry.id,
          label: entry.label,
        })),
        context.state.activeTemplateType
      );
    }

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

    if (context.elements.feedTypeFilter) {
      populateSelect(
        context.elements.feedTypeFilter,
        [
          { value: "all", label: "Tous les types" },
          ...context.data.getNoteTypeEntries().map((entry) => ({
            value: entry.id,
            label: entry.label,
          })),
        ],
        context.state.typeFilter
      );
    }

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
      (() => {
        const childCounts = new Map();
        context.state.notes.forEach((candidate) => {
          if (!candidate.parentId) {
            return;
          }

          childCounts.set(candidate.parentId, (childCounts.get(candidate.parentId) || 0) + 1);
        });

        const parentCandidates = context.state.notes
          .filter((note) => note.id !== context.state.activeNoteId)
          .map((note) => ({
            note,
            childCount: childCounts.get(note.id) || 0,
          }))
          .filter(({ childCount }) => childCount > 0)
          .sort((left, right) =>
            left.note.title.localeCompare(right.note.title, "fr", { sensitivity: "base" })
          );

        return parentCandidates.length
          ? [
              { value: "", label: "Aucune" },
              ...parentCandidates.map(({ note, childCount }) => ({
                value: note.id,
                label: `${note.title} (${childCount} sous-page${childCount > 1 ? "s" : ""})`,
              })),
            ]
          : [{ value: "", label: "Aucune page avec sous-pages" }];
      })(),
      context.notes.getActiveNote()?.parentId || ""
    );
    context.elements.favoritesFilter.checked = context.state.favoritesOnly;
    if (context.elements.feedFavoritesFilter) {
      context.elements.feedFavoritesFilter.checked = context.state.favoritesOnly;
    }
    context.elements.graphFocusMode.value = context.state.graphFocusMode;
    context.elements.graphShowTags.checked = context.state.graphShowTags;
    if (context.elements.templateType) {
      context.elements.templateType.value = context.state.activeTemplateType;
    }
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
    renderFeed,
    renderFiltersPanel,
    renderGraphFilters,
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
    renderAiSettings,
    renderQuizQuestionBank,
    renderVisualizationMode,
    renderSidebarDrawer,
    renderSidebarRecap,
    renderSidebarTabs,
    renderStats,
    renderSportTracker,
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
