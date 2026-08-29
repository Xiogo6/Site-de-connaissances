(function initializeTodosModule(global) {
  const AtlasApp = (global.AtlasApp = global.AtlasApp || {});

  AtlasApp.createTodosModule = function createTodosModule(context) {
    const SANS_CATEGORIE = "Sans catégorie";

    function getItems() {
      return Array.isArray(context.state.settings.todos) ? context.state.settings.todos : [];
    }

    function getCategories() {
      return Array.isArray(context.state.settings.todoCategories)
        ? context.state.settings.todoCategories
        : [];
    }

    function createId(prefixe) {
      if (global.crypto?.randomUUID) {
        return `${prefixe}-${global.crypto.randomUUID()}`;
      }

      return `${prefixe}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    }

    function save(items) {
      context.state.settings.todos = items;
      context.data.saveNotes();
      render();
    }

    function saveCategories(categories) {
      context.state.settings.todoCategories = categories;
      context.data.saveNotes();
      render();
    }

    // Une categorie disparue ne doit pas emporter ses taches dans l'oubli :
    // l'identifiant devenu introuvable est traite comme "sans categorie",
    // et la tache reste visible dans le dernier groupe de la page.
    function getCategoryId(item) {
      const id = item.categoryId || null;
      return id && getCategories().some((category) => category.id === id) ? id : null;
    }

    function addItems(rawValue, categoryId) {
      const labels = String(rawValue || "")
        .split(/\r?\n/)
        .map((label) => label.trim())
        .filter(Boolean);

      if (!labels.length) {
        return false;
      }

      const now = new Date().toISOString();
      const existants = getItems();
      const nextItems = [
        ...existants,
        ...labels.map((label, index) => ({
          id: createId("todo"),
          label: label.slice(0, 500),
          categoryId: categoryId || null,
          completed: false,
          createdAt: now,
          updatedAt: now,
          order: existants.length + index,
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

    function addCategory(rawLabel) {
      const label = String(rawLabel || "").trim().slice(0, 80);
      if (!label) {
        return false;
      }

      const categories = getCategories();
      if (categories.some((category) => category.label.toLowerCase() === label.toLowerCase())) {
        return false;
      }

      saveCategories([
        ...categories,
        { id: createId("todo-cat"), label, order: categories.length },
      ]);
      return true;
    }

    function renameCategory(id, rawLabel) {
      const label = String(rawLabel || "").trim().slice(0, 80);
      if (!label) {
        render();
        return;
      }

      saveCategories(
        getCategories().map((category) =>
          category.id === id ? { ...category, label } : category
        )
      );
    }

    // Supprimer une categorie ne supprime pas les taches qu'elle contient :
    // elles retombent dans "Sans categorie". Perdre des taches par un clic
    // sur une croix serait une punition disproportionnee.
    function removeCategory(id) {
      context.state.settings.todos = getItems().map((item) =>
        item.categoryId === id ? { ...item, categoryId: null } : item
      );
      saveCategories(getCategories().filter((category) => category.id !== id));
    }

    function fillCategorySelect(select, categories, readOnly) {
      if (!select) {
        return;
      }

      const precedent = select.value;
      select.replaceChildren();
      const options = [{ id: "", label: SANS_CATEGORIE }, ...categories];
      options.forEach((option) => {
        const node = document.createElement("option");
        node.value = option.id;
        node.textContent = option.label;
        select.appendChild(node);
      });

      select.value = options.some((option) => option.id === precedent) ? precedent : "";
      select.disabled = readOnly;
    }

    function createItemRow(item, categories, readOnly) {
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

      const category = document.createElement("select");
      category.className = "select-input todo-item-category";
      category.setAttribute("aria-label", `Ranger : ${item.label}`);
      fillCategorySelect(category, categories, readOnly);
      category.value = getCategoryId(item) || "";

      const removeButton = document.createElement("button");
      removeButton.className = "todo-remove";
      removeButton.type = "button";
      removeButton.disabled = readOnly;
      removeButton.textContent = "×";
      removeButton.setAttribute("aria-label", `Supprimer : ${item.label}`);

      row.append(checkbox, label, category, removeButton);
      return row;
    }

    function createGroup(groupe, items, categories, readOnly) {
      const section = document.createElement("section");
      section.className = "todo-group";
      section.dataset.todoCategory = groupe.id || "";

      const header = document.createElement("div");
      header.className = "todo-group-header";

      if (groupe.id) {
        const titre = document.createElement("input");
        titre.className = "todo-group-label";
        titre.type = "text";
        titre.value = groupe.label;
        titre.maxLength = 80;
        titre.disabled = readOnly;
        titre.setAttribute("aria-label", `Renommer la catégorie ${groupe.label}`);
        header.appendChild(titre);
      } else {
        const titre = document.createElement("strong");
        titre.className = "todo-group-label todo-group-label-fixed";
        titre.textContent = SANS_CATEGORIE;
        header.appendChild(titre);
      }

      const restantes = items.filter((item) => !item.completed).length;
      const compteur = document.createElement("span");
      compteur.className = "pill pill-soft todo-group-count";
      compteur.textContent = restantes ? `${restantes} à faire` : "Rien en attente";
      header.appendChild(compteur);

      if (groupe.id) {
        const supprimer = document.createElement("button");
        supprimer.className = "button button-ghost todo-group-remove";
        supprimer.type = "button";
        supprimer.disabled = readOnly;
        supprimer.textContent = "Supprimer";
        supprimer.setAttribute(
          "aria-label",
          `Supprimer la catégorie ${groupe.label}, ses tâches repassent sans catégorie`
        );
        header.appendChild(supprimer);
      }

      const list = document.createElement("ul");
      list.className = "todo-list todo-group-list";
      list.setAttribute("aria-live", "polite");

      if (!items.length) {
        const vide = document.createElement("li");
        vide.className = "todo-empty";
        vide.textContent = "Aucune tâche ici.";
        list.appendChild(vide);
      } else {
        const enAttente = items.filter((item) => !item.completed);
        const terminees = items.filter((item) => item.completed);
        [...enAttente, ...terminees].forEach((item) =>
          list.appendChild(createItemRow(item, categories, readOnly))
        );
      }

      section.append(header, list);
      return section;
    }

    function renderGroups(categories, items, readOnly) {
      const container = context.elements.todoPageGroups;
      if (!container) {
        return;
      }

      container.replaceChildren();

      const groupes = [
        ...categories.map((category) => ({ id: category.id, label: category.label })),
        { id: null, label: SANS_CATEGORIE },
      ];

      groupes.forEach((groupe) => {
        const dedans = items.filter((item) => getCategoryId(item) === groupe.id);
        // Le groupe "Sans categorie" ne s'affiche que s'il sert a quelque
        // chose ; les categories choisies restent visibles meme vides, sinon
        // on ne saurait plus ou ranger.
        if (!groupe.id && !dedans.length) {
          return;
        }

        container.appendChild(createGroup(groupe, dedans, categories, readOnly));
      });

      if (!container.children.length) {
        const vide = document.createElement("p");
        vide.className = "helper-copy";
        vide.textContent = "Aucune tâche pour le moment.";
        container.appendChild(vide);
      }
    }

    function render() {
      const items = getItems();
      const categories = getCategories();
      const pendingItems = items.filter((item) => !item.completed);
      const completedItems = items.filter((item) => item.completed);
      const readOnly = context.data.isReadOnlyMode();
      const countLabel = pendingItems.length ? `${pendingItems.length} à faire` : "Tout est fait";

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
        context.elements.todoCategoryInput,
        context.elements.todoCategoryAddButton,
      ]
        .filter(Boolean)
        .forEach((control) => {
          control.disabled = readOnly;
        });

      fillCategorySelect(context.elements.todoCategory, categories, readOnly);
      fillCategorySelect(context.elements.todoPageCategory, categories, readOnly);
      renderGroups(categories, items, readOnly);
    }

    function handleSubmit(event) {
      event.preventDefault();
      const form = event.currentTarget;
      const input = form.querySelector("textarea");
      const category = form.querySelector("select");
      if (!input || !addItems(input.value, category?.value || null)) {
        input?.focus();
        return;
      }

      input.value = "";
      input.focus();
    }

    function handleCategorySubmit(event) {
      event.preventDefault();
      const input = context.elements.todoCategoryInput;
      if (!input || !addCategory(input.value)) {
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

    function handleGroupsChange(event) {
      if (event.target.matches(".todo-group-label")) {
        const groupe = event.target.closest(".todo-group");
        renameCategory(groupe?.dataset.todoCategory, event.target.value);
        return;
      }

      const row = event.target.closest(".todo-item");
      if (!row) {
        return;
      }

      if (event.target.matches(".todo-checkbox")) {
        updateItem(row.dataset.todoId, { completed: event.target.checked });
        return;
      }

      if (event.target.matches(".todo-item-category")) {
        updateItem(row.dataset.todoId, { categoryId: event.target.value || null });
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

    function handleGroupsClick(event) {
      const removeCategoryButton = event.target.closest(".todo-group-remove");
      if (removeCategoryButton) {
        const groupe = removeCategoryButton.closest(".todo-group");
        if (groupe?.dataset.todoCategory) {
          removeCategory(groupe.dataset.todoCategory);
        }
        return;
      }

      const row = event.target.closest(".todo-remove")?.closest(".todo-item");
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
      context.elements.todoCategoryForm?.addEventListener("submit", handleCategorySubmit);
      context.elements.todoPageGroups?.addEventListener("change", handleGroupsChange);
      context.elements.todoPageGroups?.addEventListener("click", handleGroupsClick);
      context.elements.todoClearCompleted?.addEventListener("click", clearCompleted);
    }

    return {
      bindEvents,
      render,
    };
  };
})(window);
