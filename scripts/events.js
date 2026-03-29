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

    context.elements.searchInput.addEventListener("input", (event) => {
      context.state.filter = event.target.value.trim().toLowerCase();
      context.renderers.renderEverything();
    });

    context.elements.knowledgeList.addEventListener("click", handleKnowledgeListClick);
    context.elements.knowledgeList.addEventListener("change", handleKnowledgeListChange);
    context.elements.organizationTree.addEventListener("click", handleOrganizationListClick);
    context.elements.organizationTree.addEventListener("change", handleOrganizationListChange);

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

    context.elements.newNoteButton.addEventListener("click", () => {
      if (context.data.isReadOnlyMode()) {
        return;
      }

      const note = context.notes.createEmptyNote();
      context.state.notes.unshift(note);
      context.state.activeNoteId = note.id;
      context.data.saveNotes();
      context.renderers.renderEverything();
      context.elements.titleInput.focus();
    });

    context.elements.duplicateNoteButton.addEventListener("click", () => {
      if (context.data.isReadOnlyMode()) {
        return;
      }

      const current = context.notes.getActiveNote();
      if (!current) {
        return;
      }

      context.notes.duplicateNoteById(current.id);
    });

    context.elements.saveButton.addEventListener("click", context.notes.saveCurrentNote);
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
    context.elements.typeInput.addEventListener("change", context.renderers.renderLivePreview);
    context.elements.tagsInput.addEventListener("input", context.renderers.renderLivePreview);
    context.elements.parentInput.addEventListener("change", context.renderers.renderLivePreview);
    context.elements.favoriteInput.addEventListener("change", context.renderers.renderLivePreview);
    context.elements.contentInput.addEventListener("input", context.renderers.renderLivePreview);

    context.elements.exportButton.addEventListener("click", context.notes.exportNotes);
    context.elements.importInput.addEventListener("change", context.notes.importNotes);
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

    context.elements.tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        context.state.activeTab = tab.dataset.tab;
        context.renderers.renderTabs();
        if (context.state.activeTab === "graph") {
          context.graph.drawGraph();
        }
      });
    });

    context.elements.resetGraphButton.addEventListener("click", () => {
      context.state.graphPositions.clear();
      context.graph.drawGraph();
    });

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

  function handleKnowledgeListClick(event) {
    handleCompactListClick(
      event,
      "explorerMenuNoteId",
      {
        open: "openNote",
        toggle: "toggleNoteMenu",
        duplicate: "duplicateNote",
        remove: "deleteNote",
        root: "moveRoot",
      },
      context.renderers.renderKnowledgeList
    );
  }

  function handleKnowledgeListChange(event) {
    handleCompactListChange(event, "explorerMenuNoteId");
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
        toggle: "toggleOrganizationMenu",
        duplicate: "duplicateOrganizationNote",
        remove: "deleteOrganizationNote",
        root: "moveOrganizationRoot",
      },
      () => context.renderers.renderOrganization()
    );
  }

  function handleOrganizationListChange(event) {
    handleCompactListChange(event, "organizationMenuNoteId");
  }

  function handleCompactListClick(event, menuStateKey, datasetKeys, rerender) {
    const openButton = event.target.closest(`[data-${context.helpers.toKebab(datasetKeys.open)}]`);
    if (openButton) {
      event.stopPropagation();
      context.state.activeNoteId = openButton.dataset[datasetKeys.open];
      context.state[menuStateKey] = null;
      context.renderers.renderEverything();
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

    const rootButton = event.target.closest(`[data-${context.helpers.toKebab(datasetKeys.root)}]`);
    if (rootButton) {
      event.stopPropagation();
      context.state[menuStateKey] = null;
      context.notes.moveNoteToParent(rootButton.dataset[datasetKeys.root], null);
    }
  }

  function handleCompactListChange(event, menuStateKey) {
    const select = event.target.closest(
      "[data-note-folder-select], [data-organization-folder-select]"
    );
    if (!select || !select.value) {
      return;
    }

    event.stopPropagation();
    const noteId = select.dataset.noteFolderSelect || select.dataset.organizationFolderSelect;
    context.state[menuStateKey] = null;
    context.notes.moveNoteToParent(noteId, select.value);
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
