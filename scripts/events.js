(function initializeEventsModule(global) {
  const AtlasApp = (global.AtlasApp = global.AtlasApp || {});

  AtlasApp.createEventsModule = function createEventsModule(context) {
  function bindEvents() {
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
    context.elements.templateType.addEventListener("change", (event) => {
      context.state.activeTemplateType = event.target.value;
      context.renderers.renderTemplateEditor();
    });
    context.elements.templateEditor.addEventListener("input", (event) => {
      context.state.templateDrafts[context.state.activeTemplateType] = event.target.value;
    });
    context.elements.saveTemplateButton.addEventListener("click", context.notes.saveTemplate);
    context.elements.resetTemplateButton.addEventListener("click", context.notes.resetTemplate);
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
    context.elements.parentInput.addEventListener("change", context.renderers.renderLivePreview);
    context.elements.favoriteInput.addEventListener("change", context.renderers.renderLivePreview);
    context.elements.noteHasDate.addEventListener("change", () => {
      context.renderers.renderStructuredFields();
      context.renderers.renderLivePreview();
    });
    context.elements.noteDateMode.addEventListener("change", () => {
      context.renderers.renderStructuredFields();
      context.renderers.renderLivePreview();
    });
    context.elements.noteDateSingle.addEventListener("input", context.renderers.renderLivePreview);
    context.elements.noteDateStart.addEventListener("input", context.renderers.renderLivePreview);
    context.elements.noteDateEnd.addEventListener("input", context.renderers.renderLivePreview);
    context.elements.contentInput.addEventListener("input", () => {
      context.notes.handleEditorContentChange();
      context.renderers.renderLivePreview();
    });
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
    context.elements.graphZoomInButton.addEventListener("click", context.graph.zoomIn);
    context.elements.graphZoomOutButton.addEventListener("click", context.graph.zoomOut);

    context.elements.graphCanvas.addEventListener("click", context.graph.handleGraphClick);
    context.elements.graphCanvas.addEventListener("pointerdown", context.graph.handleGraphPointerDown);
    window.addEventListener("pointermove", context.graph.handleGraphPointerMove);
    window.addEventListener("pointerup", context.graph.handleGraphPointerUp);
    window.addEventListener("pointercancel", context.graph.handleGraphPointerUp);
    context.elements.graphShowTags.addEventListener("change", (event) => {
      context.state.graphShowTags = event.target.checked;
      context.graph.drawGraph();
    });
    context.elements.graphTagFilter.addEventListener("change", (event) => {
      context.state.graphTagFilter = event.target.value;
      context.graph.drawGraph();
    });
    context.elements.graphFocusMode.addEventListener("change", (event) => {
      context.state.graphFocusMode = event.target.value;
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
    });

    context.elements.quizFolder.addEventListener("change", context.renderers.renderStats);
    context.elements.quizTag.addEventListener("input", context.renderers.renderStats);
    context.elements.quizMode.addEventListener("change", context.renderers.renderStats);
    context.elements.generateQuizButton.addEventListener("click", context.quiz.buildQuizSession);
    context.elements.showAnswerButton.addEventListener("click", context.quiz.showQuizAnswer);
    context.elements.markCorrectButton.addEventListener("click", () => context.quiz.scoreQuiz(true));
    context.elements.markWrongButton.addEventListener("click", () => context.quiz.scoreQuiz(false));
    context.elements.flashcardScope.addEventListener("change", () => {
      context.elements.flashcardTagWrapper.classList.toggle(
        "is-hidden",
        context.elements.flashcardScope.value !== "tag"
      );
    });
    context.elements.generateFlashcardsButton.addEventListener(
      "click",
      context.quiz.buildFlashcardsSession
    );
    context.elements.flashcardFlipButton.addEventListener(
      "click",
      context.quiz.showFlashcardAnswer
    );
    context.elements.flashcardPrevButton.addEventListener("click", context.quiz.previousFlashcard);
    context.elements.flashcardNextButton.addEventListener("click", context.quiz.nextFlashcard);
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

    context.elements.previewContent.addEventListener("click", handleRenderedLinkClick);
    context.elements.outgoingLinks.addEventListener("click", handleChipClick);
    context.elements.backlinks.addEventListener("click", handleChipClick);
    context.elements.suggestedLinks.addEventListener("click", handleSuggestedLinkClick);
    context.elements.graphFocus.addEventListener("click", context.graph.handleGraphFocusClick);
    context.elements.quickCaptureToggle.addEventListener("click", () => {
      if (context.state.activeTab === "knowledge" && context.state.noteViewMode === "edit") {
        context.notes.saveCurrentNote();
        return;
      }

      context.notes.openQuickCapture();
    });
    context.elements.quickCaptureClose.addEventListener("click", context.notes.closeQuickCapture);
    context.elements.quickSaveButton.addEventListener("click", context.notes.saveQuickCapture);
    context.elements.quickTags.addEventListener("input", () => {
      context.renderers.renderTagSuggestions("quick");
    });
    context.elements.quickTags.addEventListener("blur", () => {
      window.setTimeout(() => context.renderers.renderTagSuggestions("quick"), 80);
    });
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

  function renderActiveTabContent() {
    if (context.state.activeTab === "organisation") {
      context.renderers.renderOrganization();
      return;
    }

    if (context.state.activeTab === "graph") {
      context.graph.drawGraph();
      return;
    }

    if (context.state.activeTab === "quiz") {
      context.quiz.renderQuizCard();
      return;
    }

    if (context.state.activeTab === "flashcards") {
      context.quiz.renderFlashcards();
      return;
    }

    if (context.state.activeTab === "timeline") {
      context.renderers.renderTimelineView();
      return;
    }

    if (context.state.activeTab === "settings") {
      context.renderers.renderTemplateEditor();
    }
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
          target.closest("input, textarea, select, button, .graph-canvas, .quick-capture-panel")
        ) {
          swipe = null;
          return;
        }

        swipe = {
          x: touch.clientX,
          y: touch.clientY,
          edge: touch.clientX <= 26,
        };
      },
      { passive: true }
    );

    window.addEventListener(
      "touchmove",
      (event) => {
        if (!swipe?.edge || context.state.sidebarDrawerOpen || context.state.quickCaptureOpen) {
          return;
        }

        const touch = event.changedTouches?.[0];
        if (!touch) {
          return;
        }

        const deltaX = touch.clientX - swipe.x;
        const deltaY = Math.abs(touch.clientY - swipe.y);

        if (deltaX > 72 && deltaY < 40) {
          context.state.sidebarDrawerOpen = true;
          context.renderers.renderSidebarDrawer();
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
    const link = event.target.closest("[data-link-title]");
    if (!link) {
      return;
    }

    context.notes.openOrCreateNote(link.dataset.linkTitle);
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

  function handleOrganizationDragLeave(event) {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      context.state.dragState.dropTargetId = null;
      context.notes.clearOrganizationDropHighlights();
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
