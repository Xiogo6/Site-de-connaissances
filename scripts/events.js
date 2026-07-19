(function initializeEventsModule(global) {
  const AtlasApp = (global.AtlasApp = global.AtlasApp || {});

  AtlasApp.createEventsModule = function createEventsModule(context) {
  let readingPointer = null;
  let lastScrollY = window.scrollY || 0;
  let navScrollTicking = false;
  let feedPull = {
    active: false,
    startX: 0,
    startY: 0,
    distance: 0,
    ready: false,
  };
  let feedShuffleLocked = false;
  let sidebarSwipe = {
    active: false,
    horizontal: false,
    startX: 0,
    startY: 0,
    startedAt: 0,
    wasOpen: false,
  };

  function handleBeforeUnload(event) {
    if (context.state.remote?.status !== "syncing") {
      return;
    }

    event.preventDefault();
    event.returnValue = "";
    return "";
  }

  function handleAiRewriteClick() {
    if (context.data.isReadOnlyMode()) {
      return;
    }

    if (!context.ai?.hasApiKey?.()) {
      context.ai?.focusSettings?.();
      return;
    }

    if (context.state.noteViewMode !== "edit") {
      context.state.noteViewMode = "edit";
      context.renderers.renderKnowledgeMode();
    }

    context.ai?.rewriteActiveNote?.().catch(() => {});
  }

  function handleAiQuestionsClick() {
    if (context.data.isReadOnlyMode()) {
      return;
    }

    if (!context.ai?.hasApiKey?.()) {
      context.ai?.focusSettings?.();
      return;
    }

    if (context.state.noteViewMode !== "edit") {
      context.state.noteViewMode = "edit";
      context.renderers.renderKnowledgeMode();
    }

    context.ai?.generateQuestionsForActiveNote?.().catch(() => {});
  }

  function handleAiUndoRewriteClick() {
    if (context.data.isReadOnlyMode()) {
      return;
    }

    try {
      context.ai?.restoreLastRewrite?.();
    } catch (error) {
      context.ai?.setStatus?.({
        busy: false,
        type: "error",
        message: "Impossible d'annuler la reecriture.",
        error: error?.message || "Echec de l'annulation.",
      });
    }
  }

  function handleTagRenameClick() {
    if (context.data.isReadOnlyMode()) {
      return;
    }

    const source = context.elements.tagRenameSource?.value?.trim() || "";
    const target = context.elements.tagRenameTarget?.value?.trim() || "";
    if (!source || !target) {
      return;
    }

    const didRename = context.notes.renameTag(source, target);
    if (didRename) {
      context.elements.tagRenameTarget.value = "";
      return;
    }

    context.elements.tagRenameTarget.focus();
  }

  function bindEvents() {
    window.addEventListener("beforeunload", handleBeforeUnload);

    context.elements.sidebarTabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        context.state.sidebarTab = tab.dataset.sidebarTab;
        context.renderers.renderSidebarTabs();
      });
    });

    context.elements.sidebarDrawerOpen.addEventListener("click", () => {
      context.state.sidebarDrawerOpen = true;
      context.renderers.renderSidebarDrawer();
    });
    context.elements.sidebarDrawerClose.addEventListener("click", closeSidebarDrawer);
    context.elements.sidebarDrawerBackdrop.addEventListener("click", closeSidebarDrawer);
    context.elements.themeToggleButton?.addEventListener("click", () => {
      context.state.activeTab = "settings";
      context.state.utilityDrawerOpen = false;
      context.renderers.renderEverything();
      scrollToTop();
      window.requestAnimationFrame(() => {
        context.elements.themeSettingsPanel?.scrollIntoView({ block: "start" });
      });
    });

    context.elements.themePresetButtons?.forEach((button) => {
      button.addEventListener("click", () => {
        const presetId = button.dataset.themePreset;
        const preset = AtlasApp.config.themePresets?.[presetId];
        if (!preset) {
          return;
        }

        context.data.saveThemePreference(presetId);
        context.data.saveNotes({ skipRemote: true });
        context.renderers.renderEverything();
      });
    });

    context.elements.searchInput.addEventListener("input", (event) => {
      context.state.filter = event.target.value.trim().toLowerCase();
      context.renderers.renderEverything();
    });

    context.elements.filtersToggleButton.addEventListener("click", () => {
      context.state.sidebarFiltersOpen = !context.state.sidebarFiltersOpen;
      context.renderers.renderFiltersPanel();
    });

    context.elements.knowledgeList.addEventListener("click", handleKnowledgeListClick);
    context.elements.organizationTree.addEventListener("click", handleOrganizationListClick);
    context.elements.feedList?.addEventListener("click", handleFeedClick);
    context.elements.feedModeButtons?.forEach((button) => {
      button.addEventListener("click", () => {
        context.state.feedMode = button.dataset.feedMode || "random";
        context.renderers.renderFeed();
      });
    });
    context.elements.feedSearchInput?.addEventListener("input", (event) => {
      context.state.filter = event.target.value.trim().toLowerCase();
      if (context.elements.searchInput) {
        context.elements.searchInput.value = context.state.filter;
      }
      context.renderers.renderEverything();
    });
    context.elements.feedTypeFilter?.addEventListener("change", (event) => {
      context.state.typeFilter = event.target.value;
      if (context.elements.typeFilter) {
        context.elements.typeFilter.value = context.state.typeFilter;
      }
      context.renderers.renderEverything();
    });
    context.elements.feedFavoritesFilter?.addEventListener("change", (event) => {
      context.state.favoritesOnly = event.target.checked;
      if (context.elements.favoritesFilter) {
        context.elements.favoritesFilter.checked = context.state.favoritesOnly;
      }
      context.renderers.renderEverything();
    });
    context.elements.feedTagFilterButton?.addEventListener("click", (event) => {
      event.stopPropagation();
      context.state.feedTagFilterOpen = !context.state.feedTagFilterOpen;
      context.renderers.renderFeed();
    });
    context.elements.feedTagFilterPopover?.addEventListener("click", (event) => {
      event.stopPropagation();
    });
    context.elements.feedTagFilterPopover?.addEventListener("pointerdown", stopFeedFilterEvent);
    context.elements.feedTagFilterPopover?.addEventListener("mousedown", stopFeedFilterEvent);
    context.elements.feedTagFilterPopover?.addEventListener("touchstart", stopFeedFilterEvent, { passive: true });
    context.elements.feedTagFilterPopover?.addEventListener("touchmove", stopFeedFilterEvent, { passive: true });
    context.elements.feedExcludedTags?.addEventListener("click", handleFeedExcludedTagClick);
    context.elements.feedClearFilters?.addEventListener("click", clearFeedFilters);
    window.addEventListener("touchstart", handleSidebarSwipeStart, { passive: true });
    window.addEventListener("touchmove", handleSidebarSwipeMove, { passive: false });
    window.addEventListener("touchend", handleSidebarSwipeEnd, { passive: true });
    window.addEventListener("touchcancel", resetSidebarSwipe, { passive: true });
    window.addEventListener("touchstart", handleFeedTouchStart, { passive: true });
    window.addEventListener("touchmove", handleFeedTouchMove, { passive: false });
    window.addEventListener("touchend", handleFeedTouchEnd, { passive: true });
    window.addEventListener("touchcancel", handleFeedTouchCancel, { passive: true });

    context.elements.typeFilter.addEventListener("change", (event) => {
      context.state.typeFilter = event.target.value;
      context.renderers.renderEverything();
    });

    context.elements.tagFilter.addEventListener("change", (event) => {
      context.state.tagFilter = event.target.value;
      context.renderers.renderEverything();
    });

    context.elements.favoritesFilter.addEventListener("change", (event) => {
      context.state.favoritesOnly = event.target.checked;
      context.renderers.renderEverything();
    });

    context.elements.clearFiltersButton.addEventListener("click", () => {
      context.state.filter = "";
      context.state.typeFilter = "all";
      context.state.tagFilter = "all";
      context.state.favoritesOnly = false;
      context.state.feedExcludedTags = [];
      context.state.feedTagFilterOpen = false;
      context.elements.searchInput.value = "";
      context.elements.typeFilter.value = "all";
      context.elements.tagFilter.value = "all";
      context.elements.favoritesFilter.checked = false;
      context.renderers.renderEverything();
    });

    context.elements.saveButton.addEventListener("click", context.notes.saveCurrentNote);
    context.elements.deleteActiveNoteButton?.addEventListener("click", () => {
      if (!context.state.activeNoteId) {
        return;
      }

      context.notes.deleteNoteById(context.state.activeNoteId);
    });
    context.elements.noteModeToggle.addEventListener("click", () => {
      if (context.state.noteViewMode === "edit") {
        context.notes.cancelEditingNote();
        return;
      }

      context.state.noteViewMode = "edit";
      context.renderers.renderKnowledgeMode();
      if (context.state.noteViewMode === "edit") {
        context.elements.contentInput.focus();
      }
    });
    context.elements.cancelNoteButton.addEventListener("click", () => {
      context.notes.cancelEditingNote();
    });
    context.elements.newFullPageButton.addEventListener("click", () => {
      if (context.state.activeTab === "knowledge" && context.state.noteViewMode === "edit") {
        context.notes.saveCurrentNote();
        return;
      }

      if (context.state.pendingNewNoteId) {
        context.notes.discardPendingNewNote();
      }
      if (context.elements.directClassifyInput) {
        context.elements.directClassifyInput.checked = false;
      }
      const note = context.notes.createEmptyNote();
      context.state.previousActiveNoteId = context.state.activeNoteId;
      context.state.pendingNewNoteId = note.id;
      context.state.notes.unshift(note);
      context.state.activeNoteId = note.id;
      context.state.activeTab = "knowledge";
      context.state.noteViewMode = "edit";
      context.state.utilityDrawerOpen = false;
      closeSidebarDrawer();
      context.data.saveNotes({ skipRemote: true });
      context.renderers.renderEverything();
      context.elements.titleInput.focus();
      context.elements.titleInput.select();
    });
    context.elements.templateType?.addEventListener("change", (event) => {
      context.state.activeTemplateType = event.target.value;
      context.renderers.renderTemplateEditor();
    });

    context.elements.visualizationModeButtons?.forEach((button) => {
      button.addEventListener("click", () => {
        context.state.visualizationMode = button.dataset.visualizationMode || "graph";
        context.state.activeTab = "visualization";
        context.renderers.renderTabs();
        context.renderers.renderVisualizationMode();
        renderActiveTabContent();
        scrollToTop();
      });
    });
    context.elements.templateEditor?.addEventListener("input", (event) => {
      context.state.templateDrafts[context.state.activeTemplateType] = event.target.value;
    });
    context.elements.aiAssistButton?.addEventListener("click", handleAiRewriteClick);
    context.elements.aiQuestionsButton?.addEventListener("click", handleAiQuestionsClick);
    context.elements.aiUndoButton?.addEventListener("click", handleAiUndoRewriteClick);
    context.elements.aiApiKeyInput?.addEventListener("input", () => {
      context.state.aiConfig = {
        ...(context.state.aiConfig || {}),
        apiKey: context.elements.aiApiKeyInput.value.trim(),
      };
      context.ai?.saveConfig?.(context.state.aiConfig);
      context.renderers.renderAiSettings();
      context.renderers.renderKnowledgeMode();
    });
    context.elements.aiModelInput?.addEventListener("input", () => {
      context.state.aiConfig = {
        ...(context.state.aiConfig || {}),
        model: context.elements.aiModelInput.value.trim(),
      };
      context.ai?.saveConfig?.(context.state.aiConfig);
      context.renderers.renderAiSettings();
    });
    context.elements.aiSaveButton?.addEventListener("click", () => {
      context.ai?.saveConfig?.(context.state.aiConfig);
      context.ai?.setStatus?.({
        busy: false,
        type: "success",
        message: "Configuration Gemini enregistree.",
        error: "",
        lastRunAt: new Date().toISOString(),
      });
    });
    context.elements.aiClearButton?.addEventListener("click", () => {
      context.state.aiConfig = {
        apiKey: "",
        model: AtlasApp.config.geminiDefaultModel,
      };
      context.ai?.saveConfig?.(context.state.aiConfig);
      context.ai?.setStatus?.({
        busy: false,
        type: "idle",
        message: "Cle Gemini effacee.",
        error: "",
        lastRunAt: null,
      });
      context.renderers.renderEverything();
    });
    context.elements.aiTestButton?.addEventListener("click", () => {
      context.ai?.testConnection?.().catch((error) => {
        context.ai?.setStatus?.({
          busy: false,
          type: "error",
          message: "Echec du test Gemini.",
          error: error?.message || "Connexion impossible.",
        });
      });
    });
    context.elements.saveTemplateButton?.addEventListener("click", context.notes.saveTemplate);
    context.elements.resetTemplateButton?.addEventListener("click", context.notes.resetTemplate);
    context.elements.addTypeButton?.addEventListener("click", context.notes.addCustomType);
    context.elements.tagRenameSource?.addEventListener("change", () => {
      if (!context.elements.tagRenameTarget || context.elements.tagRenameTarget.value.trim()) {
        return;
      }

      context.elements.tagRenameTarget.value = context.elements.tagRenameSource.value;
    });
    context.elements.tagRenameTarget?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        handleTagRenameClick();
      }
    });
    context.elements.renameTagButton?.addEventListener("click", handleTagRenameClick);
    context.elements.newTypeLabelInput?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        context.notes.addCustomType();
      }
    });
    context.elements.typeSettingsList?.addEventListener("change", (event) => {
      const input = event.target.closest("[data-type-label-input]");
      if (!input) {
        return;
      }

      context.notes.updateTypeLabel(input.dataset.typeLabelInput, input.value);
      context.renderers.renderEverything();
    });
    context.elements.typeSettingsList?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-delete-type]");
      if (!button) {
        return;
      }

      context.notes.deleteCustomType(button.dataset.deleteType);
    });
    context.elements.titleInput.addEventListener("input", context.notes.handleEditorTitleChange);
    context.elements.typeInput.addEventListener("change", context.notes.handleEditorTypeChange);
    context.elements.tagsInput.addEventListener("input", () => {
      context.renderers.renderTagSuggestions("note");
      context.renderers.renderLivePreview();
    });
    context.elements.tagsInput.addEventListener("blur", () => {
      window.setTimeout(() => context.renderers.renderTagSuggestions("note"), 80);
    });
    context.elements.directClassifyInput?.addEventListener(
      "change",
      context.notes.handleEditorClassificationModeChange
    );
    context.elements.parentInput.addEventListener("change", context.renderers.renderLivePreview);
    context.elements.favoriteInput.addEventListener("change", context.renderers.renderLivePreview);
    context.elements.noteDateMode.addEventListener("change", () => {
      context.renderers.renderStructuredFields();
      context.renderers.renderLivePreview();
    });
    context.elements.noteDateSingle.addEventListener("input", context.renderers.renderLivePreview);
    context.elements.noteDateStart.addEventListener("input", context.renderers.renderLivePreview);
    context.elements.noteDateEnd.addEventListener("input", context.renderers.renderLivePreview);
    [
      context.elements.noteDateSingle,
      context.elements.noteDateStart,
      context.elements.noteDateEnd,
    ].forEach((input) => {
      input.addEventListener("blur", () => normalizeDateInputField(input));
    });
    bindEnterFocusFlow([
      context.elements.titleInput,
      context.elements.typeInput,
      context.elements.tagsInput,
      context.elements.noteDateMode,
      context.elements.noteDateSingle,
      context.elements.noteDateStart,
      context.elements.noteDateEnd,
      context.elements.contentInput,
    ]);
    context.elements.contentInput.addEventListener("input", () => {
      context.notes.handleEditorContentChange();
      context.renderers.renderLivePreview();
      scheduleEditorViewportFollow();
    });
    context.elements.contentInput.addEventListener("focus", () => {
      setEditorWritingMode(true);
      scheduleEditorViewportFollow();
    });
    context.elements.contentInput.addEventListener("blur", () => {
      window.setTimeout(() => setEditorWritingMode(false), 120);
    });
    context.elements.contentInput.addEventListener("click", scheduleEditorViewportFollow);
    context.elements.contentInput.addEventListener("keyup", scheduleEditorViewportFollow);
    context.elements.formatButtons.forEach((button) => {
      button.addEventListener("click", () => {
        applyEditorFormat(button.dataset.formatAction);
      });
    });

    context.elements.downloadPublishButton.addEventListener(
      "click",
      context.data.downloadPublishedSnapshot
    );
    context.elements.downloadBackupButton.addEventListener(
      "click",
      context.data.downloadFullBackup
    );
    context.elements.downloadCsvButton?.addEventListener("click", context.data.downloadDatabaseCsv);
    context.elements.copyPublishedLinkButton.addEventListener("click", context.data.copyPublishedLink);
    context.elements.saveSnapshotButton.addEventListener("click", context.data.saveManualSnapshot);
    context.elements.restoreLatestSnapshotButton.addEventListener(
      "click",
      context.data.restoreLatestSnapshot
    );
    context.elements.newFolderButton.addEventListener(
      "click",
      context.notes.createFolderFromOrganization
    );
    context.elements.knowledgeList.addEventListener("dragstart", handleOrganizationDragStart);
    context.elements.knowledgeList.addEventListener("dragend", handleOrganizationDragEnd);
    context.elements.knowledgeList.addEventListener("dragover", handleKnowledgeListDragOver);
    context.elements.knowledgeList.addEventListener("dragleave", handleKnowledgeListDragLeave);
    context.elements.knowledgeList.addEventListener("drop", handleKnowledgeListDrop);
    context.elements.organizationTree.addEventListener("dragstart", handleOrganizationDragStart);
    context.elements.organizationTree.addEventListener("dragend", handleOrganizationDragEnd);
    context.elements.organizationTree.addEventListener("dragover", handleOrganizationDragOver);
    context.elements.organizationTree.addEventListener("dragleave", handleOrganizationDragLeave);
    context.elements.organizationTree.addEventListener("drop", handleOrganizationDrop);
    context.elements.organizationRootDrop.addEventListener("dragover", handleRootDragOver);
    context.elements.organizationRootDrop.addEventListener("dragleave", handleRootDragLeave);
    context.elements.organizationRootDrop.addEventListener("drop", handleRootDrop);

    context.elements.utilityDrawerOpen.addEventListener("click", () => {
      closeSidebarDrawer();
      context.state.utilityDrawerOpen = true;
      context.renderers.renderTabs();
    });
    context.elements.utilityDrawerClose.addEventListener("click", closeUtilityDrawer);
    context.elements.utilityDrawerBackdrop.addEventListener("click", closeUtilityDrawer);
    context.elements.utilityLinks.forEach((button) => {
      button.addEventListener("click", () => {
        context.state.activeTab = button.dataset.utilityTab;
        context.state.utilityDrawerOpen = false;
        context.renderers.renderTabs();
        renderActiveTabContent();
        scrollToTop();
      });
    });

    context.elements.tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        context.state.activeTab = tab.dataset.tab;
        if (context.state.activeTab === "quiz") {
          context.state.quizView = "play";
          context.state.quizStatsDrilldown = null;
        }
        closeSidebarDrawer();
        context.state.utilityDrawerOpen = false;
        context.renderers.renderTabs();
        renderActiveTabContent();
        scrollToTop();
      });
    });

    context.elements.mobileSearchButton.addEventListener("click", () => {
      context.state.sidebarTab = "library";
      context.renderers.renderSidebarTabs();
      context.state.sidebarDrawerOpen = true;
      context.renderers.renderSidebarDrawer();
      scrollToTop(false);
      focusSearchInput();
    });

    context.elements.resetGraphButton.addEventListener("click", () => {
      context.graph.recenterGraphLayout();
    });
    context.elements.graphFilterToggle?.addEventListener("click", () => {
      context.state.graphFiltersOpen = !context.state.graphFiltersOpen;
      context.renderers.renderGraphFilters();
    });
    context.elements.graphZoomInButton.addEventListener("click", context.graph.zoomIn);
    context.elements.graphZoomOutButton.addEventListener("click", context.graph.zoomOut);

    context.elements.graphCanvas.addEventListener("click", context.graph.handleGraphClick);
    context.elements.graphCanvas.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      if (!event.target.closest("[data-graph-node-id]")) {
        return;
      }
      event.preventDefault();
      context.graph.handleGraphClick(event);
    });
    context.elements.graphCanvas.addEventListener("pointerdown", context.graph.handleGraphPointerDown);
    context.elements.graphCanvas.addEventListener("wheel", context.graph.handleGraphWheel, {
      passive: false,
    });
    let graphResizeTimer = null;
    window.addEventListener("resize", () => {
      if (
        context.state.activeTab !== "graph" &&
        !(context.state.activeTab === "visualization" && context.state.visualizationMode === "graph")
      ) {
        return;
      }
      window.clearTimeout(graphResizeTimer);
      graphResizeTimer = window.setTimeout(() => context.graph.drawGraph(), 120);
    });
    window.addEventListener("pointermove", context.graph.handleGraphPointerMove);
    window.addEventListener("pointerup", context.graph.handleGraphPointerUp);
    window.addEventListener("pointercancel", context.graph.handleGraphPointerUp);
    context.elements.graphShowTags.addEventListener("change", (event) => {
      context.state.graphShowTags = event.target.checked;
      context.renderers.renderGraphFilters();
      context.graph.drawGraph();
    });
    context.elements.graphTagFilter.addEventListener("change", (event) => {
      context.state.graphTagFilter = event.target.value;
      context.renderers.renderGraphFilters();
      context.graph.drawGraph();
    });
    context.elements.graphFocusMode.addEventListener("change", (event) => {
      context.state.graphFocusMode = event.target.value;
      context.renderers.renderGraphFilters();
      context.graph.drawGraph();
    });

    context.elements.quizScope.addEventListener("change", () => {
      context.elements.quizFolderWrapper.classList.toggle(
        "is-hidden",
        context.elements.quizScope.value !== "folder"
      );
      context.elements.quizTagWrapper.classList.toggle(
        "is-hidden",
        context.elements.quizScope.value !== "tag"
      );
      context.renderers.renderStats();
      context.quiz.renderQuizDashboard();
    });

    context.elements.quizFolder.addEventListener("change", () => {
      context.renderers.renderStats();
      context.quiz.renderQuizDashboard();
    });
    context.elements.quizTag.addEventListener("input", () => {
      context.renderers.renderStats();
      context.quiz.renderQuizDashboard();
    });
    context.elements.quizMode.addEventListener("change", () => {
      context.renderers.renderStats();
      context.quiz.renderQuizDashboard();
    });
    context.elements.quizViewButtons?.forEach((button) => {
      button.addEventListener("click", () => {
        context.quiz.setQuizView(button.dataset.quizView);
        context.renderers.renderKnowledgeMode();
        scrollToTop();
      });
    });
    context.elements.generateQuizButton.addEventListener("click", context.quiz.buildQuizSession);
    context.elements.quizDashboard?.addEventListener("click", handleQuizDashboardClick);
    context.elements.addQuizQuestionButton?.addEventListener("click", addQuizQuestionRow);
    context.elements.noteQuizQuestionsBody?.addEventListener("input", handleQuizQuestionDraftInput);
    context.elements.noteQuizQuestionsBody?.addEventListener("click", handleQuizQuestionDraftClick);
    context.elements.quizCard?.addEventListener("pointerdown", handleQuizSessionAnswerPointerDown);
    context.elements.quizCard?.addEventListener("focusin", handleQuizSessionAnswerFocusIn);
    context.elements.quizCard?.addEventListener("focusout", handleQuizSessionAnswerFocusOut);
    context.elements.quizCard?.addEventListener("input", handleQuizSessionAnswerInput);
    context.elements.quizCard?.addEventListener("click", handleQuizSessionClick);
    context.elements.quizCard?.addEventListener("keydown", handleQuizSessionKeydown);
    context.elements.timelineScope?.addEventListener("change", (event) => {
      context.state.timeline.scope = event.target.value;
      context.state.timeline.selectedNoteId = null;
      context.renderers.renderTimelineView();
    });
    context.elements.timelineFolder?.addEventListener("change", (event) => {
      context.state.timeline.folderId = event.target.value;
      context.state.timeline.selectedNoteId = null;
      context.renderers.renderTimelineView();
    });
    context.elements.timelineTag?.addEventListener("change", (event) => {
      context.state.timeline.tag = event.target.value;
      context.state.timeline.selectedNoteId = null;
      context.renderers.renderTimelineView();
    });
    context.elements.timelineCanvas?.addEventListener("click", handleTimelineClick);
    context.elements.timelineFocus?.addEventListener("click", handleTimelineClick);
    context.elements.sportModeButtons?.forEach((button) => {
      button.addEventListener("click", () => {
        context.state.sportMode = button.dataset.sportMode || "mass";
        context.renderers.renderSportTracker();
      });
    });
    context.elements.sportMassEntryForm?.addEventListener("submit", handleSportMassSubmit);
    context.elements.addSportPerformanceRowButton?.addEventListener("click", () =>
      addSportRow("performance")
    );
    context.elements.sportMassBody?.addEventListener("click", handleSportDelete);
    context.elements.sportPerformanceBody?.addEventListener("click", handleSportDelete);
    context.elements.sportMassBody?.addEventListener("input", handleSportInput);
    context.elements.sportMassBody?.addEventListener("change", handleSportInput);
    context.elements.sportPerformanceBody?.addEventListener("input", handleSportInput);
    context.elements.sportPerformanceBody?.addEventListener("change", handleSportInput);

    context.elements.previewContent.addEventListener("click", handleRenderedLinkClick);
    context.elements.previewContent.addEventListener("change", handleChecklistToggle);
    context.elements.previewCard?.addEventListener("pointerdown", handleReadingPointerDown);
    context.elements.previewCard?.addEventListener("pointermove", handleReadingPointerMove);
    context.elements.previewCard?.addEventListener("pointerup", handleReadingPointerUp);
    context.elements.previewCard?.addEventListener("pointercancel", resetReadingPointer);
    context.elements.outgoingLinks.addEventListener("click", handleChipClick);
    context.elements.backlinks.addEventListener("click", handleChipClick);
    context.elements.suggestedLinks.addEventListener("click", handleSuggestedLinkClick);
    context.elements.graphFocus.addEventListener("click", context.graph.handleGraphFocusClick);
    context.elements.quickCaptureToggle.addEventListener("click", () => {
      if (handleQuickQuizReturnAction()) {
        return;
      }

      if (context.state.activeTab === "knowledge" && context.state.noteViewMode === "edit") {
        context.notes.saveCurrentNote();
        return;
      }

      context.notes.openQuickCapture();
    });
    context.elements.quickCaptureClose.addEventListener("click", context.notes.closeQuickCapture);
    context.elements.quickCaptureCancel?.addEventListener("click", context.notes.closeQuickCapture);
    context.elements.quickSaveButton.addEventListener("click", context.notes.saveQuickCapture);
    context.elements.quickTags.addEventListener("input", () => {
      context.renderers.renderTagSuggestions("quick");
    });
    context.elements.quickTags.addEventListener("blur", () => {
      window.setTimeout(() => context.renderers.renderTagSuggestions("quick"), 80);
    });
    bindEnterFocusFlow([
      context.elements.quickTitle,
      context.elements.quickTags,
      context.elements.quickType,
      context.elements.quickContent,
    ]);
    context.elements.noteTagSuggestions?.addEventListener("click", handleTagSuggestionClick);
    context.elements.quickTagSuggestions?.addEventListener("click", handleTagSuggestionClick);

    window.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        context.notes.saveCurrentNote();
      }

      if (event.key === "Escape" && context.state.quickCaptureOpen) {
        context.notes.closeQuickCapture();
      }

      if (event.key === "Escape" && context.state.sidebarDrawerOpen) {
        closeSidebarDrawer();
      }

      if (event.key === "Escape" && context.state.utilityDrawerOpen) {
        closeUtilityDrawer();
      }
    });

    document.addEventListener("click", (event) => {
      if (
        context.state.explorerMenuNoteId &&
        !context.elements.knowledgeList.contains(event.target)
      ) {
        context.state.explorerMenuNoteId = null;
        context.renderers.renderKnowledgeList();
      }

      if (
        context.state.organizationMenuNoteId &&
        !context.elements.organizationTree.contains(event.target)
      ) {
        context.state.organizationMenuNoteId = null;
        context.renderers.renderOrganization();
      }

      if (
        context.elements.noteTagSuggestions &&
        !context.elements.noteTagSuggestions.contains(event.target) &&
        event.target !== context.elements.tagsInput
      ) {
        context.elements.noteTagSuggestions.classList.add("is-hidden");
      }

      if (
        context.elements.quickTagSuggestions &&
        !context.elements.quickTagSuggestions.contains(event.target) &&
        event.target !== context.elements.quickTags
      ) {
        context.elements.quickTagSuggestions.classList.add("is-hidden");
      }
    });

    window.addEventListener("scroll", handleBottomNavScroll, { passive: true });
    window.addEventListener("wheel", handleFeedWheelRefresh, { passive: false });
  }

  function handleFeedTouchStart(event) {
    if (!canPullRefreshFeed() || isFeedRefreshIgnoredTarget(event.target) || event.touches.length !== 1) {
      resetFeedPull();
      return;
    }

    feedPull = {
      active: true,
      startX: event.touches[0].clientX,
      startY: event.touches[0].clientY,
      distance: 0,
      ready: false,
    };
    updateFeedPullVisual(0);
  }

  function handleFeedTouchMove(event) {
    if (!feedPull.active || event.touches.length !== 1) {
      return;
    }

    const touch = event.touches[0];
    const deltaX = touch.clientX - feedPull.startX;
    const distance = touch.clientY - feedPull.startY;
    if (Math.abs(deltaX) > 10 && Math.abs(deltaX) > Math.abs(distance) * 1.15) {
      resetFeedPull();
      return;
    }

    if (distance <= 0) {
      updateFeedPullVisual(0);
      return;
    }

    feedPull.distance = Math.min(110, distance * 0.55);
    feedPull.ready = feedPull.distance >= 72;
    updateFeedPullVisual(feedPull.distance);

    if (event.cancelable) {
      event.preventDefault();
    }
  }

  function handleFeedTouchEnd() {
    if (!feedPull.active) {
      return;
    }

    if (feedPull.ready) {
      shuffleFeedFromGesture();
      return;
    }

    resetFeedPull();
  }

  function handleFeedTouchCancel() {
    resetFeedPull();
  }

  function handleFeedWheelRefresh(event) {
    if (
      !canPullRefreshFeed() ||
      isFeedRefreshIgnoredTarget(event.target) ||
      feedShuffleLocked ||
      Math.abs(event.deltaY) < 70 ||
      event.deltaY >= 0
    ) {
      return;
    }

    if (event.cancelable) {
      event.preventDefault();
    }
    shuffleFeedFromGesture();
  }

  function handleSidebarSwipeStart(event) {
    if (
      event.touches.length !== 1 ||
      !window.matchMedia("(max-width: 780px)").matches ||
      context.state.activeTab === "quiz" ||
      context.state.utilityDrawerOpen ||
      context.state.quickCaptureOpen ||
      event.target.closest?.("input, textarea, select, button, a, [contenteditable='true']")
    ) {
      resetSidebarSwipe();
      return;
    }

    const touch = event.touches[0];
    const wasOpen = Boolean(context.state.sidebarDrawerOpen);
    const edgeWidth = Math.min(88, window.innerWidth * 0.24);
    const startsAtEdge = touch.clientX <= edgeWidth;
    const startsInDrawer = Boolean(event.target.closest?.("#mobile-sidebar"));
    if ((!wasOpen && !startsAtEdge) || (wasOpen && !startsInDrawer)) {
      resetSidebarSwipe();
      return;
    }

    sidebarSwipe = {
      active: true,
      horizontal: false,
      startX: touch.clientX,
      startY: touch.clientY,
      startedAt: Date.now(),
      wasOpen,
    };
  }

  function handleSidebarSwipeMove(event) {
    if (!sidebarSwipe.active || event.touches.length !== 1) {
      return;
    }

    const touch = event.touches[0];
    const deltaX = touch.clientX - sidebarSwipe.startX;
    const deltaY = touch.clientY - sidebarSwipe.startY;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    if (!sidebarSwipe.horizontal) {
      if (absX < 8 && absY < 8) {
        return;
      }
      if (absY >= absX * 1.1) {
        resetSidebarSwipe();
        return;
      }
      if ((!sidebarSwipe.wasOpen && deltaX <= 0) || (sidebarSwipe.wasOpen && deltaX >= 0)) {
        resetSidebarSwipe();
        return;
      }

      sidebarSwipe.horizontal = true;
      resetFeedPull();
      context.elements.sidebarDrawer.classList.add("is-swiping");
      context.elements.sidebarDrawerBackdrop.classList.remove("is-hidden");
    }

    const drawerWidth = context.elements.sidebarDrawer.getBoundingClientRect().width || 320;
    const travel = Math.min(drawerWidth + 16, Math.max(0, Math.abs(deltaX)));
    const progress = Math.min(1, travel / drawerWidth);
    const translateX = sidebarSwipe.wasOpen ? -travel : `calc(-100% - 16px + ${travel}px)`;
    context.elements.sidebarDrawer.style.transform =
      typeof translateX === "number" ? `translateX(${translateX}px)` : `translateX(${translateX})`;
    context.elements.sidebarDrawerBackdrop.style.opacity = String(
      sidebarSwipe.wasOpen ? 1 - progress : progress
    );

    if (event.cancelable) {
      event.preventDefault();
    }
  }

  function handleSidebarSwipeEnd(event) {
    if (!sidebarSwipe.active) {
      return;
    }

    const touch = event.changedTouches?.[0];
    const deltaX = touch ? touch.clientX - sidebarSwipe.startX : 0;
    const elapsed = Math.max(1, Date.now() - sidebarSwipe.startedAt);
    const fastSwipe = Math.abs(deltaX) >= 30 && elapsed <= 260;
    const crossedThreshold = Math.abs(deltaX) >= 64;
    const shouldToggle = sidebarSwipe.horizontal && (crossedThreshold || fastSwipe);
    const nextOpen = shouldToggle ? !sidebarSwipe.wasOpen : sidebarSwipe.wasOpen;

    context.elements.sidebarDrawer.classList.remove("is-swiping");
    if (sidebarSwipe.wasOpen && !nextOpen) {
      context.notes.collapseSidebarFolders();
    }
    context.state.sidebarDrawerOpen = nextOpen;
    context.renderers.renderSidebarDrawer();
    context.elements.sidebarDrawer.style.removeProperty("transform");
    context.elements.sidebarDrawerBackdrop.style.removeProperty("opacity");
    resetSidebarSwipeState();
  }

  function resetSidebarSwipe() {
    if (sidebarSwipe.horizontal) {
      context.elements.sidebarDrawer.classList.remove("is-swiping");
      context.elements.sidebarDrawer.style.removeProperty("transform");
      context.elements.sidebarDrawerBackdrop.style.removeProperty("opacity");
      context.renderers.renderSidebarDrawer();
    }
    resetSidebarSwipeState();
  }

  function resetSidebarSwipeState() {
    sidebarSwipe = {
      active: false,
      horizontal: false,
      startX: 0,
      startY: 0,
      startedAt: 0,
      wasOpen: false,
    };
  }

  function handleFeedExcludedTagClick(event) {
    event.preventDefault();
    event.stopPropagation();
    const button = event.target.closest("[data-feed-exclude-tag]");
    if (!button) {
      return;
    }

    const tag = button.dataset.feedExcludeTag;
    const excluded = new Set(context.state.feedExcludedTags || []);
    if (excluded.has(tag)) {
      excluded.delete(tag);
    } else {
      excluded.add(tag);
    }

    context.state.feedExcludedTags = [...excluded];
    context.renderers.renderFeed();
  }

  function stopFeedFilterEvent(event) {
    event.stopPropagation();
  }

  function clearFeedFilters() {
    context.state.filter = "";
    context.state.typeFilter = "all";
    context.state.tagFilter = "all";
    context.state.favoritesOnly = false;
    context.state.feedExcludedTags = [];
    context.state.feedTagFilterOpen = false;

    if (context.elements.searchInput) {
      context.elements.searchInput.value = "";
    }
    if (context.elements.feedSearchInput) {
      context.elements.feedSearchInput.value = "";
    }
    if (context.elements.typeFilter) {
      context.elements.typeFilter.value = "all";
    }
    if (context.elements.feedTypeFilter) {
      context.elements.feedTypeFilter.value = "all";
    }
    if (context.elements.tagFilter) {
      context.elements.tagFilter.value = "all";
    }
    if (context.elements.favoritesFilter) {
      context.elements.favoritesFilter.checked = false;
    }
    if (context.elements.feedFavoritesFilter) {
      context.elements.feedFavoritesFilter.checked = false;
    }

    context.renderers.renderEverything();
  }

  function canPullRefreshFeed() {
    return context.state.activeTab === "feed" && window.scrollY <= 6;
  }

  function isFeedRefreshIgnoredTarget(target) {
    return Boolean(
      target?.closest?.(
        ".feed-filter-bar, .feed-toolbar-actions, .feed-action, .mobile-tab-bar, .mobile-action-bar, [data-tab], input, select, textarea, a"
      )
    );
  }

  function shuffleFeedFromGesture() {
    if (feedShuffleLocked) {
      resetFeedPull();
      return;
    }

    feedShuffleLocked = true;
    context.state.feedMode = "random";
    context.state.feedSeed = Date.now();
    context.renderers.renderFeed();
    context.renderers.renderTabs();
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    showFeedRefreshComplete();
    window.setTimeout(() => {
      feedShuffleLocked = false;
    }, 700);
  }

  function updateFeedPullVisual(distance) {
    document.body.style.setProperty("--feed-pull-offset", `${Math.round(distance)}px`);
    document.body.classList.toggle("feed-pulling", distance > 4);
    document.body.classList.toggle("feed-refresh-ready", distance >= 72);
  }

  function showFeedRefreshComplete() {
    document.body.style.setProperty("--feed-pull-offset", "56px");
    document.body.classList.add("feed-pulling", "feed-refresh-complete");
    document.body.classList.remove("feed-refresh-ready");
    window.setTimeout(resetFeedPull, 520);
  }

  function resetFeedPull() {
    feedPull = {
      active: false,
      startX: 0,
      startY: 0,
      distance: 0,
      ready: false,
    };
    document.body.style.removeProperty("--feed-pull-offset");
    document.body.classList.remove("feed-pulling", "feed-refresh-ready", "feed-refresh-complete");
  }

  function handleFeedClick(event) {
    const shareButton = event.target.closest("[data-feed-share-note]");
    if (shareButton) {
      event.stopPropagation();
      announceNoteAction(shareButton.dataset.feedShareNote, "Partage pret a configurer.");
      return;
    }

    const commentButton = event.target.closest("[data-feed-comment-note]");
    if (commentButton) {
      event.stopPropagation();
      announceNoteAction(commentButton.dataset.feedCommentNote, "Commentaires bientot disponibles.");
      return;
    }

    const openButton = event.target.closest("[data-feed-open-note]");
    const card = event.target.closest("[data-feed-note-id]");
    const noteId = openButton?.dataset.feedOpenNote || card?.dataset.feedNoteId;
    if (!noteId) {
      return;
    }

    context.state.activeNoteId = noteId;
    context.state.activeTab = "knowledge";
    context.state.noteViewMode = "read";
    closeSidebarDrawer();
    context.state.utilityDrawerOpen = false;
    context.renderers.renderEverything();
    scrollToTop();
  }

  function announceNoteAction(noteId, message) {
    const note = context.state.notes.find((candidate) => candidate.id === noteId);
    let toast = document.querySelector("#feed-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "feed-toast";
      toast.className = "feed-toast";
      toast.setAttribute("role", "status");
      document.body.appendChild(toast);
    }

    toast.textContent = note ? `${message} ${note.title}` : message;
    toast.classList.add("is-visible");
    window.setTimeout(() => {
      toast.classList.remove("is-visible");
    }, 1800);
  }

  function handleBottomNavScroll() {
    if (isQuizSessionAnswer(document.activeElement)) {
      lastScrollY = window.scrollY || 0;
      return;
    }

    if (navScrollTicking) {
      return;
    }

    navScrollTicking = true;
    window.requestAnimationFrame(() => {
      const currentY = window.scrollY || 0;
      const delta = currentY - lastScrollY;
      const shouldCompact = currentY > 80 && delta > 5;
      const shouldExpand = delta < -5 || currentY < 40;

      if (shouldCompact !== context.state.feedNavCompact && shouldCompact) {
        context.state.feedNavCompact = true;
        document.body.classList.add("feed-nav-compact");
      } else if (shouldExpand && context.state.feedNavCompact) {
        context.state.feedNavCompact = false;
        document.body.classList.remove("feed-nav-compact");
      }

      lastScrollY = currentY;
      navScrollTicking = false;
    });
  }

  function closeUtilityDrawer() {
    context.state.utilityDrawerOpen = false;
    context.renderers.renderTabs();
  }

  function closeSidebarDrawer() {
    if (context.state.sidebarDrawerOpen) {
      context.notes.collapseSidebarFolders();
    }
    context.state.sidebarDrawerOpen = false;
    context.renderers.renderSidebarDrawer();
  }

  function bindEnterFocusFlow(fields) {
    const controls = fields.filter(Boolean);
    controls.forEach((control) => {
      control.addEventListener("keydown", (event) => {
        if (
          event.key !== "Enter" ||
          event.shiftKey ||
          event.ctrlKey ||
          event.metaKey ||
          event.altKey ||
          event.isComposing ||
          event.target.tagName === "TEXTAREA"
        ) {
          return;
        }

        const currentIndex = controls.indexOf(control);
        const nextControl = controls
          .slice(currentIndex + 1)
          .find((candidate) => isFocusableFormControl(candidate));

        if (!nextControl) {
          return;
        }

        event.preventDefault();
        nextControl.focus();
        if (typeof nextControl.select === "function" && nextControl.tagName !== "SELECT") {
          nextControl.select();
        }
      });
    });
  }

  function isFocusableFormControl(control) {
    return (
      control &&
      !control.disabled &&
      !control.closest(".is-hidden") &&
      control.offsetParent !== null
    );
  }

  function setEditorWritingMode(isWriting) {
    const shouldHideBars =
      isWriting &&
      context.state.activeTab === "knowledge" &&
      context.state.noteViewMode === "edit" &&
      document.activeElement === context.elements.contentInput;
    document.body.classList.toggle("editor-writing", shouldHideBars);
  }

  function scheduleEditorViewportFollow() {
    window.requestAnimationFrame(() => {
      resizeEditorToContent();
      keepEditorCaretReadable();
    });
  }

  function resizeEditorToContent() {
    const textarea = context.elements.contentInput;
    if (!textarea || document.activeElement !== textarea) {
      return;
    }

    textarea.style.height = "auto";
    textarea.style.height = `${Math.max(textarea.scrollHeight, textarea.clientHeight)}px`;
  }

  function keepEditorCaretReadable() {
    const textarea = context.elements.contentInput;
    if (!textarea || document.activeElement !== textarea) {
      return;
    }

    const computed = window.getComputedStyle(textarea);
    const lineHeight = Number.parseFloat(computed.lineHeight) || 22;
    const textBeforeCaret = textarea.value.slice(0, textarea.selectionStart);
    const caretLine = textBeforeCaret.split("\n").length - 1;
    const caretY = textarea.getBoundingClientRect().top + caretLine * lineHeight - textarea.scrollTop;
    const comfortBottom = window.innerHeight - 150;
    const comfortTop = 120;

    if (caretY > comfortBottom) {
      window.scrollBy({ top: caretY - comfortBottom, behavior: "smooth" });
    } else if (caretY < comfortTop) {
      window.scrollBy({ top: caretY - comfortTop, behavior: "smooth" });
    }
  }

  function renderActiveTabContent() {
    context.renderers.renderKnowledgeMode();

    if (context.state.activeTab === "feed") {
      context.renderers.renderFeed();
      return;
    }

    if (context.state.activeTab === "organisation") {
      context.renderers.renderOrganization();
      return;
    }

    if (
      context.state.activeTab === "graph" ||
      (context.state.activeTab === "visualization" && context.state.visualizationMode === "graph")
    ) {
      context.graph.drawGraph();
      return;
    }

    if (context.state.activeTab === "quiz") {
      context.state.quizReturnActive = false;
      context.renderers.renderWorkspaceBanner();
      context.quiz.renderQuizViewMode();
      context.quiz.renderQuizDashboard();
      context.quiz.renderQuizCard();
      return;
    }

    if (
      context.state.activeTab === "timeline" ||
      (context.state.activeTab === "visualization" && context.state.visualizationMode === "timeline")
    ) {
      context.renderers.renderTimelineView();
      return;
    }

    if (context.state.activeTab === "settings") {
      context.renderers.renderTemplateEditor();
      context.renderers.renderPublishCenter();
      return;
    }

    if (context.state.activeTab === "sport") {
      context.renderers.renderSportTracker();
    }
  }

  function addQuizQuestionRow() {
    if (context.data.isReadOnlyMode()) {
      return;
    }

    if (context.state.noteViewMode !== "edit") {
      context.state.noteViewMode = "edit";
      context.renderers.renderKnowledgeMode();
    }

    context.state.editorQuizQuestions.push({
      id: `question-${Date.now()}`,
      question: "",
      answers: [""],
      stats: {
        asked: 0,
        correct: 0,
        lastAskedAt: null,
        lastCorrectAt: null,
        updatedAt: null,
      },
    });
    persistQuizQuestionDrafts();
    context.renderers.renderQuizQuestionBank();
    context.renderers.renderPreview(context.notes.getActiveNote(), true);
    context.quiz.renderQuizDashboard();
    window.requestAnimationFrame(() => {
      const lastInput = context.elements.noteQuizQuestionsBody?.querySelector(
        "tr:last-child [data-quiz-question-field=\"question\"]"
      );
      if (lastInput && typeof lastInput.focus === "function") {
        lastInput.focus();
      }
    });
  }

  function handleQuizQuestionDraftInput(event) {
    const input = event.target.closest("[data-quiz-question-field]");
    if (!input) {
      return;
    }

    const index = Number(input.dataset.quizQuestionIndex);
    const field = input.dataset.quizQuestionField;
    const draft = context.state.editorQuizQuestions[index];
    if (!draft) {
      return;
    }

    if (field === "question") {
      draft.question = input.value;
    }

    if (field === "answers") {
      draft.answers = input.value
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
    }

    persistQuizQuestionDrafts();
    context.renderers.renderPreview(context.notes.getActiveNote(), true);
    context.quiz.renderQuizDashboard();
  }

  function handleQuizQuestionDraftClick(event) {
    const button = event.target.closest("[data-remove-quiz-question]");
    if (!button || context.data.isReadOnlyMode()) {
      return;
    }

    const index = Number(button.dataset.removeQuizQuestion);
    context.state.editorQuizQuestions.splice(index, 1);
    persistQuizQuestionDrafts();
    context.renderers.renderQuizQuestionBank();
    context.renderers.renderPreview(context.notes.getActiveNote(), true);
    context.quiz.renderQuizDashboard();
  }

  function persistQuizQuestionDrafts() {
    const active = context.notes.getActiveNote();
    if (!active) {
      return;
    }

    active.quizQuestions = context.data.mergeQuizQuestionCollectionStats(
      context.state.editorQuizQuestions,
      active.quizQuestions,
      active.id
    );
    active.updatedAt = new Date().toISOString();
    context.data.saveNotes();
  }

  function handleQuizSessionAnswerInput(event) {
    const input = event.target.closest("[data-quiz-session-answer]");
    if (!input) {
      return;
    }

    beginQuizAnswerWriting();
    const index = Number(input.dataset.quizSessionAnswer);
    context.quiz.setQuizAnswer(index, input.value);
  }

  function isQuizSessionAnswer(element) {
    return Boolean(element?.matches?.("[data-quiz-session-answer]"));
  }

  function beginQuizAnswerWriting() {
    context.state.feedNavCompact = false;
    document.body.classList.remove("feed-nav-compact");
    document.body.classList.add("quiz-answer-writing");
  }

  function handleQuizSessionAnswerPointerDown(event) {
    if (isQuizSessionAnswer(event.target)) {
      beginQuizAnswerWriting();
    }
  }

  function handleQuizSessionAnswerFocusIn(event) {
    if (!isQuizSessionAnswer(event.target)) {
      return;
    }

    beginQuizAnswerWriting();
  }

  function handleQuizSessionAnswerFocusOut() {
    window.setTimeout(() => {
      if (!isQuizSessionAnswer(document.activeElement)) {
        document.body.classList.remove("quiz-answer-writing");
      }
    }, 0);
  }

  function handleQuizSessionClick(event) {
    const noteButton = event.target.closest("[data-open-quiz-note]");
    if (noteButton) {
      openQuizLinkedNote(noteButton.dataset.openQuizNote);
      return;
    }

    const restartButton = event.target.closest("[data-quiz-restart]");
    if (restartButton) {
      context.quiz.resetQuizSession();
      return;
    }

    const validateButton = event.target.closest("[data-quiz-validate-all]");
    if (validateButton) {
      context.quiz.validateQuizSession();
      return;
    }

    const contestButton = event.target.closest("[data-quiz-contest]");
    if (contestButton) {
      context.quiz.contestQuizQuestion(Number(contestButton.dataset.quizContest));
      return;
    }

    const acceptContestedButton = event.target.closest("[data-quiz-accept-contested]");
    if (acceptContestedButton) {
      context.quiz.acceptContestedAnswer(Number(acceptContestedButton.dataset.quizAcceptContested));
      return;
    }

    const cancelButton = event.target.closest("[data-quiz-cancel]");
    if (cancelButton) {
      context.quiz.resetQuizSession();
      return;
    }
  }

  function handleQuizSessionKeydown(event) {
    const input = event.target.closest("[data-quiz-session-answer]");
    if (!input || event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    context.quiz.validateQuizSession();
  }

  function handleQuizDashboardClick(event) {
    const categoryButton = event.target.closest("[data-quiz-stat-category]");
    if (categoryButton) {
      context.state.quizStatsDrilldown = categoryButton.dataset.quizStatCategory;
      context.quiz.renderQuizDashboard();
      context.renderers.renderKnowledgeMode();
      scrollToTop();
      return;
    }

    const noteButton = event.target.closest("[data-open-quiz-note]");
    if (!noteButton) {
      return;
    }

    openQuizLinkedNote(noteButton.dataset.openQuizNote);
  }

  function openQuizLinkedNote(noteId) {
    context.state.activeNoteId = noteId;
    context.state.activeTab = "knowledge";
    context.state.noteViewMode = "read";
    context.state.quizReturnActive = true;
    context.renderers.renderEverything();
    scrollToTop();
  }

  function handleQuickQuizReturnAction() {
    if (
      context.state.activeTab === "quiz" &&
      context.state.quizView === "stats" &&
      context.state.quizStatsDrilldown
    ) {
      context.state.quizStatsDrilldown = null;
      context.quiz.renderQuizDashboard();
      context.renderers.renderKnowledgeMode();
      scrollToTop();
      return true;
    }

    if (!context.state.quizReturnActive || context.state.activeTab !== "knowledge") {
      return false;
    }

    context.state.activeTab = "quiz";
    context.state.quizView = context.state.quiz.questions.length ? "play" : "stats";
    context.state.quizReturnActive = false;
    context.renderers.renderEverything();
    scrollToTop();
    return true;
  }

  function scrollToTop(smooth = true) {
    window.scrollTo({
      top: 0,
      behavior: smooth ? "smooth" : "auto",
    });
  }

  function focusSearchInput() {
    const applyFocus = () => {
      context.elements.searchInput.scrollIntoView({ block: "nearest", behavior: "auto" });
      context.elements.searchInput.focus({ preventScroll: true });
      context.elements.searchInput.click();
      if (typeof context.elements.searchInput.setSelectionRange === "function") {
        context.elements.searchInput.setSelectionRange(
          context.elements.searchInput.value.length,
          context.elements.searchInput.value.length
        );
      }
    };

    applyFocus();
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(applyFocus);
    });
    window.setTimeout(applyFocus, 120);
    window.setTimeout(applyFocus, 260);
  }

  function handleKnowledgeListClick(event) {
    const toggleFolderButton = event.target.closest("[data-toggle-folder]");
    if (toggleFolderButton) {
      event.stopPropagation();
      animateFolderToggle(toggleFolderButton, () =>
        context.notes.toggleFolderCollapse(toggleFolderButton.dataset.toggleFolder)
      );
      return;
    }

    handleCompactListClick(
      event,
      "explorerMenuNoteId",
      {
        open: "openNote",
        edit: "editNote",
        toggle: "toggleNoteMenu",
        root: "rootNote",
        duplicate: "duplicateNote",
        remove: "deleteNote",
      },
      context.renderers.renderKnowledgeList
    );
  }

  function handleOrganizationListClick(event) {
    const toggleFolderButton = event.target.closest("[data-toggle-folder]");
    if (toggleFolderButton) {
      event.stopPropagation();
      animateFolderToggle(toggleFolderButton, () =>
        context.notes.toggleFolderCollapse(toggleFolderButton.dataset.toggleFolder)
      );
      return;
    }

    handleCompactListClick(
      event,
      "organizationMenuNoteId",
      {
        open: "openOrganizationNote",
        edit: "editOrganizationNote",
        toggle: "toggleOrganizationMenu",
        root: "rootOrganizationNote",
        duplicate: "duplicateOrganizationNote",
        remove: "deleteOrganizationNote",
      },
      () => context.renderers.renderOrganization()
    );
  }

  function handleCompactListClick(event, menuStateKey, datasetKeys, rerender) {
    const openButton = event.target.closest(`[data-${context.helpers.toKebab(datasetKeys.open)}]`);
    if (openButton) {
      event.stopPropagation();
      context.state.activeNoteId = openButton.dataset[datasetKeys.open];
      context.state.activeTab = "knowledge";
      context.state.noteViewMode = "read";
      context.state[menuStateKey] = null;
      context.renderers.renderEverything();
      return;
    }

    const editButton = event.target.closest(`[data-${context.helpers.toKebab(datasetKeys.edit)}]`);
    if (editButton) {
      event.stopPropagation();
      context.state.activeNoteId = editButton.dataset[datasetKeys.edit];
      context.state.activeTab = "knowledge";
      context.state.noteViewMode = "edit";
      context.state[menuStateKey] = null;
      context.renderers.renderEverything();
      window.requestAnimationFrame(() => {
        context.elements.contentInput.focus();
      });
      return;
    }

    const toggleButton = event.target.closest(
      `[data-${context.helpers.toKebab(datasetKeys.toggle)}]`
    );
    if (toggleButton) {
      event.stopPropagation();
      const noteId = toggleButton.dataset[datasetKeys.toggle];
      context.state[menuStateKey] = context.state[menuStateKey] === noteId ? null : noteId;
      rerender();
      return;
    }

    const rootButton = event.target.closest(
      `[data-${context.helpers.toKebab(datasetKeys.root)}]`
    );
    if (rootButton) {
      event.stopPropagation();
      context.state[menuStateKey] = null;
      context.notes.moveNoteToRoot(rootButton.dataset[datasetKeys.root]);
      return;
    }

    const duplicateButton = event.target.closest(
      `[data-${context.helpers.toKebab(datasetKeys.duplicate)}]`
    );
    if (duplicateButton) {
      event.stopPropagation();
      context.state[menuStateKey] = null;
      context.notes.duplicateNoteById(duplicateButton.dataset[datasetKeys.duplicate]);
      return;
    }

    const deleteButton = event.target.closest(
      `[data-${context.helpers.toKebab(datasetKeys.remove)}]`
    );
    if (deleteButton) {
      event.stopPropagation();
      context.state[menuStateKey] = null;
      context.notes.deleteNoteById(deleteButton.dataset[datasetKeys.remove]);
      return;
    }
  }

  function animateFolderToggle(toggleButton, applyToggle) {
    const entry = toggleButton.closest(".tree-entry-flat, .hierarchy-node");
    const container = entry?.parentElement;

    if (!entry || !container) {
      applyToggle();
      return;
    }

    const isOpening = context.notes.isFolderCollapsed(toggleButton.dataset.toggleFolder);
    const beforeRects = getHierarchyMotionRects(container);
    applyToggle();

    animateHierarchySurface(container, isOpening);
    animateHierarchyLayout(container, beforeRects);
  }

  function getHierarchyMotionRects(container) {
    return [...container.children].reduce((rects, child) => {
      if (!child.dataset?.noteId) {
        return rects;
      }

      const rect = child.getBoundingClientRect();
      rects.set(child.dataset.noteId, {
        left: rect.left,
        top: rect.top,
      });
      return rects;
    }, new Map());
  }

  function animateHierarchyLayout(container, beforeRects) {
    const entries = [...container.children].filter((child) => child.dataset?.noteId);
    entries.forEach((entry, index) => {
      const beforeRect = beforeRects.get(entry.dataset.noteId);
      const afterRect = entry.getBoundingClientRect();

      if (!beforeRect) {
        animateHierarchyEntry(entry, {
          delay: Math.min(index * 7, 42),
          duration: 210,
          opacity: 0,
          transform: "translateY(-5px)",
        });
        return;
      }

      const deltaX = beforeRect.left - afterRect.left;
      const deltaY = beforeRect.top - afterRect.top;
      if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) {
        return;
      }

      animateHierarchyEntry(entry, {
        duration: 220,
        transform: `translate(${deltaX}px, ${deltaY}px)`,
      });
    });
  }

  function animateHierarchySurface(container, isOpening) {
    const fromY = isOpening ? -3 : 3;
    container.style.transition = "none";
    container.style.transform = `translateY(${fromY}px)`;
    container.style.opacity = "0.985";
    container.getBoundingClientRect();

    container.style.transition = "transform 210ms cubic-bezier(0.22, 0.72, 0.22, 1), opacity 210ms ease";
    window.requestAnimationFrame(() => {
      container.style.transform = "translateY(0)";
      container.style.opacity = "1";
    });
    window.setTimeout(() => {
      container.style.transition = "";
      container.style.transform = "";
      container.style.opacity = "";
    }, 270);
  }

  function animateHierarchyEntry(entry, { delay = 0, duration = 220, opacity = 1, transform }) {
    entry.style.transition = "none";
    entry.style.transitionDelay = "";
    entry.style.transform = transform;
    entry.style.opacity = String(opacity);
    entry.getBoundingClientRect();

    entry.style.transition = `transform ${duration}ms cubic-bezier(0.22, 0.72, 0.22, 1), opacity ${duration}ms ease`;
    entry.style.transitionDelay = delay ? `${delay}ms` : "";
    window.requestAnimationFrame(() => {
      entry.style.transform = "translate(0, 0)";
      entry.style.opacity = "1";
    });
    window.setTimeout(() => {
      entry.style.transition = "";
      entry.style.transitionDelay = "";
      entry.style.transform = "";
      entry.style.opacity = "";
    }, duration + delay + 60);
  }

  function handleTagSuggestionClick(event) {
    const button = event.target.closest("[data-tag-suggestion]");
    if (!button) {
      return;
    }

    const target = button.dataset.tagSuggestionTarget;
    const input =
      target === "quick" ? context.elements.quickTags : context.elements.tagsInput;
    const rawParts = input.value.split(",");
    rawParts[rawParts.length - 1] = ` ${button.dataset.tagSuggestion}`;
    input.value = rawParts
      .map((part, index) => (index === 0 ? part.trim() : part.trim()))
      .filter((part, index, list) => part || index < list.length - 1)
      .join(", ");

    if (target === "quick") {
      context.renderers.renderTagSuggestions("quick");
      context.elements.quickTags.focus();
    } else {
      context.renderers.renderTagSuggestions("note");
      context.renderers.renderLivePreview();
      context.elements.tagsInput.focus();
    }
  }

  function handleRenderedLinkClick(event) {
    if (event.target.closest("[data-checklist-line]")) {
      return;
    }

    const link = event.target.closest("[data-link-title]");
    if (!link) {
      return;
    }

    context.notes.openOrCreateNote(link.dataset.linkTitle);
  }

  function handleChecklistToggle(event) {
    const checkbox = event.target.closest("[data-checklist-line]");
    if (!checkbox || context.data.isReadOnlyMode()) {
      return;
    }

    const note = context.notes.getActiveNote();
    if (!note) {
      return;
    }

    const lineIndex = Number(checkbox.dataset.checklistLine);
    const lines = note.content.split("\n");
    if (!Number.isInteger(lineIndex) || !lines[lineIndex]) {
      return;
    }

    lines[lineIndex] = lines[lineIndex].replace(
      /^(\s*-\s+\[)( |x|X)(\]\s+)/,
      `$1${checkbox.checked ? "x" : " "}$3`
    );
    note.content = lines.join("\n");
    note.updatedAt = new Date().toISOString();
    context.state.settings.lastEditedNoteId = note.id;
    context.elements.contentInput.value = note.content;
    context.data.saveNotes();
    context.renderers.renderEverything();
  }

  function handleChipClick(event) {
    const chip = event.target.closest("[data-link-title]");
    if (!chip) {
      return;
    }

    context.notes.openOrCreateNote(chip.dataset.linkTitle);
  }

  function applyEditorFormat(action) {
    const textarea = context.elements.contentInput;
    if (!textarea) {
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const value = textarea.value;
    const selection = value.slice(start, end);
    let replacement = selection;
    let nextStart = start;
    let nextEnd = end;

    if (action === "bold") {
      replacement = `**${selection || "texte important"}**`;
      nextStart = start + 2;
      nextEnd = nextStart + (selection || "texte important").length;
    } else if (action === "italic") {
      replacement = `*${selection || "texte"}*`;
      nextStart = start + 1;
      nextEnd = nextStart + (selection || "texte").length;
    } else if (action === "bullet") {
      const lines = (selection || "Point cle").split("\n");
      replacement = lines.map((line) => `- ${line.replace(/^- /, "")}`).join("\n");
      nextStart = start;
      nextEnd = start + replacement.length;
    } else if (action === "checklist") {
      const lines = (selection || "Action").split("\n");
      replacement = lines
        .map((line) => `- [ ] ${line.replace(/^-\s+\[[ xX]\]\s+/, "").replace(/^- /, "")}`)
        .join("\n");
      nextStart = start;
      nextEnd = start + replacement.length;
    } else if (action === "today") {
      const today = new Intl.DateTimeFormat("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(new Date());
      const prefix = start > 0 && value[start - 1] !== "\n" ? "\n" : "";
      const suffix = end < value.length && value[end] !== "\n" ? "\n" : "";
      replacement = `${prefix}${today}${suffix}`;
      nextStart = start + prefix.length;
      nextEnd = nextStart + today.length;
    } else if (action === "heading-1") {
      replacement = `# ${selection || "Titre"}`;
      nextStart = start + 2;
      nextEnd = nextStart + (selection || "Titre").length;
    } else if (action === "heading-2") {
      replacement = `## ${selection || "Sous-titre"}`;
      nextStart = start + 3;
      nextEnd = nextStart + (selection || "Sous-titre").length;
    } else if (action === "link") {
      replacement = `[[${selection || "Nom de page"}]]`;
      nextStart = start + 2;
      nextEnd = nextStart + (selection || "Nom de page").length;
    }

    textarea.setRangeText(replacement, start, end, "end");
    textarea.focus();
    textarea.setSelectionRange(nextStart, nextEnd);
    context.renderers.renderLivePreview();
  }

  function handleSuggestedLinkClick(event) {
    const chip = event.target.closest("[data-link-title]");
    if (!chip) {
      return;
    }

    context.notes.appendSuggestedLinkToActiveNote(chip.dataset.linkTitle);
  }

  function handleTimelineClick(event) {
    const openButton = event.target.closest("[data-open-timeline-note]");
    if (openButton) {
      context.state.activeNoteId = openButton.dataset.openTimelineNote;
      context.state.activeTab = "knowledge";
      context.state.noteViewMode = "read";
      context.renderers.renderEverything();
      return;
    }

    const selectButton = event.target.closest("[data-select-timeline-note]");
    if (!selectButton) {
      return;
    }

    const stageShell = context.elements.timelineCanvas?.querySelector(".timeline-stage-shell");
    const previousScrollLeft = stageShell?.scrollLeft || 0;
    const previousScrollTop = stageShell?.scrollTop || 0;
    context.state.timeline.selectedNoteId = selectButton.dataset.selectTimelineNote;
    context.renderers.renderTimelineView();
    const nextStageShell = context.elements.timelineCanvas?.querySelector(".timeline-stage-shell");
    if (nextStageShell) {
      nextStageShell.scrollLeft = previousScrollLeft;
      nextStageShell.scrollTop = previousScrollTop;
    }
  }

  function normalizeDateInputField(input) {
    const normalized = context.helpers.normalizeFlexibleDateInput(input.value);
    input.value = normalized ? context.helpers.formatFlexibleDate(normalized) : "";
    context.renderers.renderLivePreview();
  }

  function handleReadingPointerDown(event) {
    if (
      context.state.activeTab !== "knowledge" ||
      context.state.noteViewMode !== "read" ||
      context.state.quickCaptureOpen ||
      event.target.closest(".preview-quiz-panel") ||
      event.target.closest("a, button, input, textarea, select")
    ) {
      return;
    }

    readingPointer = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      moved: false,
    };
    context.elements.previewCard?.setPointerCapture?.(event.pointerId);
  }

  function handleReadingPointerMove(event) {
    if (!readingPointer || readingPointer.id !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - readingPointer.x;
    const deltaY = event.clientY - readingPointer.y;
    if (Math.abs(deltaX) < 8 && Math.abs(deltaY) < 8) {
      return;
    }

    readingPointer.moved = true;
    const clamped = context.helpers.clamp(deltaX, -42, 42);
    context.elements.previewCard?.style.setProperty("--read-swipe-x", `${clamped}px`);
  }

  function handleReadingPointerUp(event) {
    if (!readingPointer || readingPointer.id !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - readingPointer.x;
    const deltaY = Math.abs(event.clientY - readingPointer.y);
    const isSwipe = Math.abs(deltaX) > 86 && Math.abs(deltaX) > deltaY * 1.5;

    resetReadingPointer();

    if (!isSwipe) {
      return;
    }

    navigateReadingSibling(deltaX < 0 ? 1 : -1);
  }

  function resetReadingPointer() {
    readingPointer = null;
    context.elements.previewCard?.style.removeProperty("--read-swipe-x");
  }

  function getSportSettings() {
    context.state.settings.sport = context.state.settings.sport || {
      massEntries: [],
      performanceEntries: [],
      lastSavedAt: null,
    };
    context.state.settings.sport.massEntries = context.state.settings.sport.massEntries || [];
    context.state.settings.sport.performanceEntries =
      context.state.settings.sport.performanceEntries || [];
    return context.state.settings.sport;
  }

  function addSportRow(table) {
    const sport = getSportSettings();
    if (table === "performance") {
      sport.performanceEntries.push({
        date: getPreviousPerformanceDate() || getTodayInputDate(),
        exercise: "",
        sets: "",
        reps: "",
        weight: "",
        rest: "",
      });
      context.state.sportMode = "performance";
    }

    saveSportChanges();
    context.renderers.renderSportTracker();
  }

  function handleSportMassSubmit(event) {
    event.preventDefault();
    const massInput = context.elements.sportMassValue;
    const mass = massInput?.valueAsNumber;
    if (!massInput || !Number.isFinite(mass)) {
      massInput?.setCustomValidity("Indiquez une masse valide.");
      massInput?.reportValidity();
      return;
    }

    massInput.setCustomValidity("");
    const sport = getSportSettings();
    sport.massEntries.push({
      date: context.elements.sportMassDate?.value || getTodayInputDate(),
      mass: String(Math.round(mass * 10) / 10),
      fasted: Boolean(context.elements.sportMassFasted?.checked),
    });
    context.state.sportMode = "mass";
    saveSportChanges();
    context.renderers.renderSportTracker();

    massInput.value = "";
    if (context.elements.sportMassFasted) {
      context.elements.sportMassFasted.checked = false;
    }
    massInput.focus();
  }

  function handleSportInput(event) {
    const input = event.target.closest("[data-sport-table][data-sport-index][data-sport-field]");
    if (!input) {
      return;
    }

    const sport = getSportSettings();
    const table = input.dataset.sportTable;
    const index = Number(input.dataset.sportIndex);
    const field = input.dataset.sportField;
    const entries =
      table === "performance" ? sport.performanceEntries : sport.massEntries;
    ensureSportEntry(entries, table, index);
    const entry = entries[index];
    entry[field] = input.type === "checkbox" ? input.checked : input.value;

    if (table === "performance" && field === "exercise" && input.value.trim() && !entry.date) {
      entry.date = getPreviousPerformanceDate(index) || getTodayInputDate();
      const row = input.closest("tr");
      const dateInput = row?.querySelector('[data-sport-field="date"]');
      if (dateInput) {
        dateInput.value = entry.date;
      }
    }

    saveSportChanges();
    if (table === "mass" && event.type === "change") {
      context.renderers.renderSportTracker();
    }
  }

  function handleSportDelete(event) {
    const button = event.target.closest("[data-delete-sport-row][data-sport-index]");
    if (!button || button.disabled) {
      return;
    }

    const sport = getSportSettings();
    const table = button.dataset.deleteSportRow;
    const index = Number(button.dataset.sportIndex);
    const entries = table === "performance" ? sport.performanceEntries : sport.massEntries;
    if (!Number.isInteger(index) || index < 0 || index >= entries.length) {
      return;
    }

    entries.splice(index, 1);
    saveSportChanges();
    context.renderers.renderSportTracker();
  }

  function saveSportChanges() {
    const sport = getSportSettings();
    sport.lastSavedAt = new Date().toISOString();
    context.data.saveNotes();
    context.renderers.renderSportSaveStatus();
  }

  function ensureSportEntry(entries, table, index) {
    while (entries.length <= index) {
      entries.push(
        table === "performance"
          ? { date: "", exercise: "", sets: "", reps: "", weight: "", rest: "" }
          : { date: "", mass: "", fasted: false }
      );
    }
  }

  function getPreviousPerformanceDate(beforeIndex = null) {
    const entries = getSportSettings().performanceEntries;
    const endIndex = beforeIndex == null ? entries.length : beforeIndex;
    for (let index = endIndex - 1; index >= 0; index -= 1) {
      if (entries[index]?.date) {
        return entries[index].date;
      }
    }
    return "";
  }

  function getTodayInputDate() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function navigateReadingSibling(direction) {
    const active = context.notes.getActiveNote();
    if (!active) {
      return;
    }

    const siblings = context.state.notes
      .filter((note) => (note.parentId || "") === (active.parentId || ""))
      .sort((left, right) => {
        return left.title.localeCompare(right.title, "fr", { sensitivity: "base" });
      });
    const currentIndex = siblings.findIndex((note) => note.id === active.id);
    if (siblings.length < 2 || currentIndex < 0) {
      return;
    }

    const nextIndex = (currentIndex + direction + siblings.length) % siblings.length;
    context.state.activeNoteId = siblings[nextIndex].id;
    context.state.noteViewMode = "read";
    context.renderers.renderEverything();
  }

  function handleOrganizationDragStart(event) {
    if (context.data.isReadOnlyMode()) {
      return;
    }

    const node = event.target.closest("[data-note-id]");
    if (!node) {
      return;
    }

    context.state.dragState.noteId = node.dataset.noteId;
    context.state.dragState.dropTargetId = null;
    context.state.dragState.dropToRoot = false;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", node.dataset.noteId);
    node.classList.add("is-dragging");
  }

  function handleOrganizationDragEnd() {
    context.notes.resetDragState();
    context.notes.clearOrganizationDropHighlights();
    context.renderers.renderKnowledgeList();
    context.renderers.renderOrganization();
  }

  function handleOrganizationDragOver(event) {
    const node = event.target.closest("[data-note-id]");
    if (!node || !context.state.dragState.noteId) {
      return;
    }

    event.preventDefault();
    const targetId = node.dataset.noteId;
    if (!context.notes.canMoveNote(context.state.dragState.noteId, targetId)) {
      event.dataTransfer.dropEffect = "none";
      return;
    }

    event.dataTransfer.dropEffect = "move";
    context.state.dragState.dropTargetId = targetId;
    context.state.dragState.dropToRoot = false;
    context.notes.highlightOrganizationTarget(targetId);
  }

  function handleKnowledgeListDragOver(event) {
    if (!context.state.dragState.noteId || context.data.isReadOnlyMode()) {
      return;
    }

    const node = event.target.closest("[data-note-id]");
    if (node) {
      handleOrganizationDragOver(event);
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    context.state.dragState.dropTargetId = null;
    context.state.dragState.dropToRoot = true;
    context.notes.clearOrganizationDropHighlights();
    context.elements.knowledgeList.classList.add("is-root-drop-target");
  }

  function handleOrganizationDragLeave(event) {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      context.state.dragState.dropTargetId = null;
      context.notes.clearOrganizationDropHighlights();
    }
  }

  function handleKnowledgeListDragLeave(event) {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      context.state.dragState.dropTargetId = null;
      context.state.dragState.dropToRoot = false;
      context.notes.clearOrganizationDropHighlights();
      context.elements.knowledgeList.classList.remove("is-root-drop-target");
    }
  }

  function handleOrganizationDrop(event) {
    const node = event.target.closest("[data-note-id]");
    if (!node || !context.state.dragState.noteId) {
      return;
    }

    event.preventDefault();
    context.notes.moveNoteToParent(context.state.dragState.noteId, node.dataset.noteId);
  }

  function handleKnowledgeListDrop(event) {
    if (!context.state.dragState.noteId || context.data.isReadOnlyMode()) {
      return;
    }

    const node = event.target.closest("[data-note-id]");
    context.elements.knowledgeList.classList.remove("is-root-drop-target");
    if (node) {
      handleOrganizationDrop(event);
      return;
    }

    event.preventDefault();
    context.notes.moveNoteToParent(context.state.dragState.noteId, null);
  }

  function handleRootDragOver(event) {
    if (!context.state.dragState.noteId || context.data.isReadOnlyMode()) {
      return;
    }

    event.preventDefault();
    context.state.dragState.dropTargetId = null;
    context.state.dragState.dropToRoot = true;
    context.notes.clearOrganizationDropHighlights();
    context.elements.organizationRootDrop.classList.add("is-over");
  }

  function handleRootDragLeave(event) {
    if (event.relatedTarget && context.elements.organizationRootDrop.contains(event.relatedTarget)) {
      return;
    }

    context.state.dragState.dropToRoot = false;
    context.elements.organizationRootDrop.classList.remove("is-over");
  }

  function handleRootDrop(event) {
    if (!context.state.dragState.noteId || context.data.isReadOnlyMode()) {
      return;
    }

    event.preventDefault();
    context.notes.moveNoteToParent(context.state.dragState.noteId, null);
  }

  return {
    bindEvents,
  };
  };
})(window);
