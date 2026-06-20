(function initializeEventsModule(global) {
  const AtlasApp = (global.AtlasApp = global.AtlasApp || {});

  AtlasApp.createEventsModule = function createEventsModule(context) {
  let readingPointer = null;

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
    context.elements.themeToggleButton.addEventListener("click", () => {
      context.state.settings.theme =
        context.state.settings.theme === "dark" ? "light" : "dark";
      context.data.saveNotes({ skipRemote: true });
      context.renderers.renderEverything();
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
      context.state.sidebarDrawerOpen = false;
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
      context.state.sidebarDrawerOpen = false;
      context.state.utilityDrawerOpen = true;
      context.renderers.renderSidebarDrawer();
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
        context.state.sidebarDrawerOpen = false;
        context.state.utilityDrawerOpen = false;
        context.renderers.renderSidebarDrawer();
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
    context.elements.graphCanvas.addEventListener("pointerdown", context.graph.handleGraphPointerDown);
    context.elements.graphCanvas.addEventListener("wheel", context.graph.handleGraphWheel, {
      passive: false,
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
    context.elements.addSportMassRowButton?.addEventListener("click", () => addSportRow("mass"));
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

    bindSidebarSwipe();
  }

  function closeUtilityDrawer() {
    context.state.utilityDrawerOpen = false;
    context.renderers.renderTabs();
  }

  function closeSidebarDrawer() {
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

    active.quizQuestions = context.data.normalizeQuizQuestionCollection(
      context.state.editorQuizQuestions,
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

    const index = Number(input.dataset.quizSessionAnswer);
    context.quiz.setQuizAnswer(index, input.value);
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

  function bindSidebarSwipe() {
    let swipe = null;

    window.addEventListener(
      "touchstart",
      (event) => {
        const touch = event.changedTouches?.[0];
        if (!touch || window.innerWidth > 780) {
          swipe = null;
          return;
        }

        const target = event.target;
        if (
          target instanceof HTMLElement &&
          target.closest(
            "input, textarea, select, button, .graph-canvas, .quick-capture-panel, .rendered-note, .timeline-canvas, .timeline-stage-shell"
          )
        ) {
          swipe = null;
          return;
        }

        swipe = {
          startedAt: Date.now(),
          x: touch.clientX,
          y: touch.clientY,
          side: touch.clientX < window.innerWidth / 2 ? "left" : "right",
        };
      },
      { passive: true }
    );

    window.addEventListener(
      "touchmove",
      (event) => {
        if (!swipe || context.state.quickCaptureOpen) {
          return;
        }

        const touch = event.changedTouches?.[0];
        if (!touch) {
          return;
        }

        const deltaX = touch.clientX - swipe.x;
        const deltaY = Math.abs(touch.clientY - swipe.y);
        const absX = Math.abs(deltaX);
        const isDeliberateSwipe =
          Date.now() - swipe.startedAt > 90 && absX > 126 && absX > deltaY * 1.7 && deltaY < 56;

        if (context.state.sidebarDrawerOpen && deltaX < 0 && isDeliberateSwipe) {
          context.state.sidebarDrawerOpen = false;
          context.renderers.renderSidebarDrawer();
          swipe = null;
          return;
        }

        if (context.state.utilityDrawerOpen && deltaX > 0 && isDeliberateSwipe) {
          context.state.utilityDrawerOpen = false;
          context.renderers.renderTabs();
          swipe = null;
          return;
        }

        if (context.state.sidebarDrawerOpen || context.state.utilityDrawerOpen) {
          return;
        }

        if (swipe.side === "left" && deltaX > 0 && isDeliberateSwipe) {
          context.state.sidebarDrawerOpen = true;
          context.state.utilityDrawerOpen = false;
          context.renderers.renderSidebarDrawer();
          context.renderers.renderTabs();
          swipe = null;
          return;
        }

        if (swipe.side === "right" && deltaX < 0 && isDeliberateSwipe) {
          context.state.utilityDrawerOpen = true;
          context.state.sidebarDrawerOpen = false;
          context.renderers.renderSidebarDrawer();
          context.renderers.renderTabs();
          swipe = null;
        }
      },
      { passive: true }
    );

    window.addEventListener(
      "touchend",
      () => {
        swipe = null;
      },
      { passive: true }
    );
  }

  function handleKnowledgeListClick(event) {
    const toggleFolderButton = event.target.closest("[data-toggle-folder]");
    if (toggleFolderButton) {
      event.stopPropagation();
      context.notes.toggleFolderCollapse(toggleFolderButton.dataset.toggleFolder);
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
      context.notes.toggleFolderCollapse(toggleFolderButton.dataset.toggleFolder);
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
    } else {
      sport.massEntries.push({ date: getTodayInputDate(), mass: "", fasted: false });
      context.state.sportMode = "mass";
    }

    context.data.saveNotes();
    context.renderers.renderSportTracker();
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

    context.data.saveNotes();
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
    context.data.saveNotes();
    context.renderers.renderSportTracker();
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
