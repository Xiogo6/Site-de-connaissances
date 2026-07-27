(function initializeTodosModule(global) {
  const AtlasApp = (global.AtlasApp = global.AtlasApp || {});

  AtlasApp.createTodosModule = function createTodosModule(context) {
    function getItems() {
      return Array.isArray(context.state.settings.todos) ? context.state.settings.todos : [];
    }

    function createId() {
      if (global.crypto?.randomUUID) {
        return global.crypto.randomUUID();
      }

      return `todo-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    }

    function save(items) {
      context.state.settings.todos = items;
      context.data.saveNotes();
      render();
    }

    function addItems(rawValue) {
      const labels = String(rawValue || "")
        .split(/\r?\n/)
        .map((label) => label.trim())
        .filter(Boolean);

      if (!labels.length) {
        return false;
      }

      const now = new Date().toISOString();
      const nextItems = [
        ...getItems(),
        ...labels.map((label, index) => ({
          id: createId(),
          label: label.slice(0, 500),
          completed: false,
          createdAt: now,
          updatedAt: now,
          order: getItems().length + index,
        })),
      ];

      save(nextItems);
      return true;
    }

    function updateItem(id, patch) {
      const now = new Date().toISOString();
      save(
        getItems().map((item) =>
          item.id === id
            ? {
                ...item,
                ...patch,
                updatedAt: now,
              }
            : item
        )
      );
    }

    function removeItem(id) {
      save(getItems().filter((item) => item.id !== id));
    }

    function clearCompleted() {
      save(getItems().filter((item) => !item.completed));
    }

    function createItemRow(item, readOnly) {
      const row = document.createElement("li");
      row.className = "todo-item";
      row.classList.toggle("is-completed", item.completed);
      row.dataset.todoId = item.id;

      const checkbox = document.createElement("input");
      checkbox.className = "todo-checkbox";
      checkbox.type = "checkbox";
      checkbox.checked = item.completed;
      checkbox.disabled = readOnly;
      checkbox.setAttribute("aria-label", `Terminer : ${item.label}`);

      const label = document.createElement("input");
      label.className = "todo-item-label";
      label.type = "text";
      label.value = item.label;
      label.maxLength = 500;
      label.disabled = readOnly;
      label.setAttribute("aria-label", "Modifier la tâche");

      const removeButton = document.createElement("button");
      removeButton.className = "todo-remove";
      removeButton.type = "button";
      removeButton.disabled = readOnly;
      removeButton.textContent = "×";
      removeButton.setAttribute("aria-label", `Supprimer : ${item.label}`);

      row.append(checkbox, label, removeButton);
      return row;
    }

    function renderList(list, items, readOnly, emptyMessage) {
      if (!list) {
        return;
      }

      list.replaceChildren();
      if (!items.length) {
        const emptyItem = document.createElement("li");
        emptyItem.className = "todo-empty";
        emptyItem.textContent = emptyMessage;
        list.appendChild(emptyItem);
        return;
      }

      items.forEach((item) => list.appendChild(createItemRow(item, readOnly)));
    }

    function render() {
      const items = getItems();
      const pendingItems = items.filter((item) => !item.completed);
      const completedItems = items.filter((item) => item.completed);
      const orderedItems = [...pendingItems, ...completedItems];
      const readOnly = context.data.isReadOnlyMode();
      const countLabel = pendingItems.length ? `${pendingItems.length} à faire` : "Tout est fait";

      if (context.elements.todoCount) {
        context.elements.todoCount.textContent = countLabel;
      }

      if (context.elements.todoPageCount) {
        context.elements.todoPageCount.textContent = countLabel;
      }

      if (context.elements.todoClearCompleted) {
        context.elements.todoClearCompleted.classList.toggle(
          "is-hidden",
          completedItems.length === 0
        );
        context.elements.todoClearCompleted.disabled = readOnly;
      }

      [
        context.elements.todoInput,
        context.elements.todoPageInput,
        context.elements.todoAddButton,
        context.elements.todoPageAddButton,
      ]
        .filter(Boolean)
        .forEach((control) => {
          control.disabled = readOnly;
        });

      renderList(
        context.elements.todoList,
        pendingItems.slice(0, 3),
        readOnly,
        "Aucune tâche en attente."
      );
      renderList(
        context.elements.todoPageList,
        orderedItems,
        readOnly,
        "Aucune tâche pour le moment."
      );
    }

    function handleSubmit(event) {
      event.preventDefault();
      const input = event.currentTarget.querySelector("textarea");
      if (!input || !addItems(input.value)) {
        input?.focus();
        return;
      }

      input.value = "";
      input.focus();
    }

    function handleInputKeydown(event) {
      if (
        event.key !== "Enter" ||
        event.shiftKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.isComposing
      ) {
        return;
      }

      event.preventDefault();
      event.target.closest("form")?.requestSubmit();
    }

    function handleListChange(event) {
      const row = event.target.closest(".todo-item");
      if (!row) {
        return;
      }

      if (event.target.matches(".todo-checkbox")) {
        updateItem(row.dataset.todoId, { completed: event.target.checked });
        return;
      }

      if (event.target.matches(".todo-item-label")) {
        const label = event.target.value.trim();
        if (!label) {
          removeItem(row.dataset.todoId);
          return;
        }

        updateItem(row.dataset.todoId, { label });
      }
    }

    function handleListClick(event) {
      const removeButton = event.target.closest(".todo-remove");
      const row = removeButton?.closest(".todo-item");
      if (row) {
        removeItem(row.dataset.todoId);
      }
    }

    function bindEvents() {
      [context.elements.todoForm, context.elements.todoPageForm]
        .filter(Boolean)
        .forEach((form) => form.addEventListener("submit", handleSubmit));
      [context.elements.todoInput, context.elements.todoPageInput]
        .filter(Boolean)
        .forEach((input) => input.addEventListener("keydown", handleInputKeydown));
      [context.elements.todoList, context.elements.todoPageList]
        .filter(Boolean)
        .forEach((list) => {
          list.addEventListener("change", handleListChange);
          list.addEventListener("click", handleListClick);
        });
      context.elements.todoClearCompleted?.addEventListener("click", clearCompleted);
    }

    return {
      bindEvents,
      render,
    };
  };
})(window);
