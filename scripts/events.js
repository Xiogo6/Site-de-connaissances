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
      context.state.noteViewMode = context.state.noteViewMode === "edit" ? "read" : "edit";
      context.renderers.renderKnowledgeMode();
      if (context.state.noteViewMode === "edit") {
        context.elements.contentInput.focus();
      }
    });
    context.elements.cancelNoteButton.addEventListener("click", () => {
      context.notes.discardPendingNewNote();
    });
    context.elements.newFullPageButton.addEventListener("click", () => {
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
    context.elements.applyTemplateButton.addEventListener(
      "click",
      context.notes.applyTemplateToActiveNote
    );
    context.elements.templateType.addEventListener("change", (event) => {
      context.state.activeTemplateType = event.target.value;
      context.renderers.renderTemplateEditor();
    });
    context.elements.templateEditor.addEventListener("input", (event) => {
      context.state.templateDrafts[context.state.activeTemplateType] = event.target.value;
    });
    context.elements.saveTemplateButton.addEventListener("click", context.notes.saveTemplate);
    context.elements.resetTemplateButton.addEventListener("click", context.notes.resetTemplate);
    context.elements.titleInput.addEventListener("input", context.renderers.renderLivePreview);
    context.elements.typeInput.addEventListener("change", () => {
      context.renderers.renderStructuredFields();
      context.renderers.renderLivePreview();
    });
    context.elements.tagsInput.addEventListener("input", context.renderers.renderLivePreview);
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
    context.elements.contentInput.addEventListener("input", context.renderers.renderLivePreview);
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
    context.elements.moveRootButton.addEventListener("click", context.notes.moveActiveNoteToRoot);
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
      scrollToTop();
      focusSearchInput();
    });

    context.elements.resetGraphButton.addEventListener("click", () => {
      context.graph.recenterGraphLayout();
    });
    context.elements.graphZoomInButton.addEventListener("click", context.graph.zoomIn);
    context.elements.graphZoomOutButton.addEventListener("click", context.graph.zoomOut);

    context.elements.graphCanvas.addEventListener("click", context.graph.handleGraphClick);
    context.elements.graphCanvas.addEventListener("mousedown", context.graph.handleGraphMouseDown);
    window.addEventListener("mousemove", context.graph.handleGraphMouseMove);
    window.addEventListener("mouseup", context.graph.handleGraphMouseUp);
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
      context.elements.quizTagWrapper.classList.toggle(
        "is-hidden",
        context.elements.quizScope.value !== "tag"
      );
      context.renderers.renderStats();
    });

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

    context.elements.previewContent.addEventListener("click", handleRenderedLinkClick);
    context.elements.outgoingLinks.addEventListener("click", handleChipClick);
    context.elements.backlinks.addEventListener("click", handleChipClick);
    context.elements.suggestedLinks.addEventListener("click", handleSuggestedLinkClick);
    context.elements.graphFocus.addEventListener("click", context.graph.handleGraphFocusClick);
    context.elements.quickCaptureToggle.addEventListener("click", context.notes.openQuickCapture);
    context.elements.quickCaptureClose.addEventListener("click", context.notes.closeQuickCapture);
    context.elements.quickSaveButton.addEventListener("click", context.notes.saveQuickCapture);

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
    });
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
    }
  }

  function scrollToTop() {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  function focusSearchInput() {
    const applyFocus = () => {
      context.elements.searchInput.scrollIntoView({ block: "center", behavior: "smooth" });
      context.elements.searchInput.focus({ preventScroll: true });
      context.elements.searchInput.click();
      context.elements.searchInput.select();
    };

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(applyFocus);
    });
    window.setTimeout(applyFocus, 220);
    window.setTimeout(applyFocus, 420);
    window.setTimeout(applyFocus, 650);
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
