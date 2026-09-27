/*
  Effet d'une ligne de la file voice_inbox sur la liste de taches.

  Deux pages appliquent ces lignes, et doivent le faire a l'identique :

  - Atlas, au demarrage (voice-inbox.js, puis todos.js), pour de bon ;
  - le raccourci todo.html, pour afficher la liste telle qu'elle sera une fois
    Atlas passe : les lignes encore dans la file, plus celles qui n'ont pas
    quitte le telephone.

  D'ou ce fichier sans DOM ni etat : il recoit une liste, rend une liste.

  Deux sortes de lignes :

    { source: "todo",        todos:   [{ label, categoryLabel? }] }
    { source: "todo-action", actions: [{ todoId, op: "update", patch: { completed?, label? }, at }
                                       { todoId, op: "delete", at }] }

  Un geste n'est applique que s'il est plus recent que la derniere
  modification de la tache (`at` contre `updatedAt`) : une tache modifiee dans
  Atlas apres le geste fait au telephone garde la modification d'Atlas.
*/
(function initializeTodoInbox(global) {
  const AtlasApp = (global.AtlasApp = global.AtlasApp || {});

  // Deriver l'identifiant de la tache du client_key rend l'ajout idempotent,
  // et permet au raccourci de connaitre cet identifiant avant qu'Atlas ne
  // l'ait cree : on peut donc cocher une tache a peine ajoutee.
  function idPrefix(clientKey) {
    const empreinte = String(clientKey || "")
      .replace(/[^a-z0-9]/gi, "")
      .slice(0, 12)
      .toLowerCase();
    return `todo-inbox-${empreinte || "inconnue"}`;
  }

  function toTime(value) {
    const time = Date.parse(value || "");
    return Number.isNaN(time) ? 0 : time;
  }

  function isTodoPayload(payload) {
    return payload?.source === "todo" || payload?.source === "todo-action";
  }

  function applyAdd(lists, payload, clientKey, createdAtFallback, makeCategoryId) {
    const prefixe = `${idPrefix(clientKey)}-`;
    if (lists.todos.some((item) => String(item.id).startsWith(prefixe))) {
      return { ...lists, changed: 0 };
    }

    const valides = (Array.isArray(payload.todos) ? payload.todos : [])
      .map((entry) => ({
        label: String(entry?.label || "").trim().slice(0, 500),
        categoryLabel: String(entry?.categoryLabel || "").trim().slice(0, 80),
      }))
      .filter((entry) => entry.label);

    if (!valides.length) {
      return { ...lists, changed: 0 };
    }

    // Une categorie est retrouvee par son nom, sans tenir compte de la casse.
    // Inconnue, elle est creee : le nom tape est la seule intention connue.
    const categories = [...lists.categories];
    function categoryIdFor(label) {
      if (!label) {
        return null;
      }
      const trouvee = categories.find(
        (category) => String(category.label).toLowerCase() === label.toLowerCase()
      );
      if (trouvee) {
        return trouvee.id;
      }
      const nouvelle = { id: makeCategoryId(), label, order: categories.length };
      categories.push(nouvelle);
      return nouvelle.id;
    }

    const capturedAt = toTime(payload.capturedAt) || toTime(createdAtFallback) || Date.now();
    const createdAt = new Date(capturedAt).toISOString();

    return {
      todos: [
        ...lists.todos,
        ...valides.map((entry, index) => ({
          id: `${prefixe}${index}`,
          label: entry.label,
          categoryId: categoryIdFor(entry.categoryLabel),
          completed: false,
          createdAt,
          updatedAt: createdAt,
          order: lists.todos.length + index,
        })),
      ],
      categories,
      changed: valides.length,
    };
  }

  function applyActions(lists, payload) {
    let todos = lists.todos;
    let changed = 0;

    (Array.isArray(payload.actions) ? payload.actions : []).forEach((action) => {
      const index = todos.findIndex((item) => item.id === action?.todoId);
      if (index < 0) {
        // Tache deja supprimee ailleurs : rien a faire.
        return;
      }

      const item = todos[index];
      const at = toTime(action.at);
      if (!at || at < toTime(item.updatedAt)) {
        return;
      }

      if (action.op === "delete") {
        todos = todos.filter((_, position) => position !== index);
        changed += 1;
        return;
      }

      if (action.op === "update") {
        const patch = {};
        if (typeof action.patch?.completed === "boolean") {
          patch.completed = action.patch.completed;
        }
        const label = String(action.patch?.label ?? "").trim().slice(0, 500);
        if (label) {
          patch.label = label;
        }
        if (!Object.keys(patch).length) {
          return;
        }
        todos = todos.map((current, position) =>
          position === index
            ? { ...current, ...patch, updatedAt: new Date(at).toISOString() }
            : current
        );
        changed += 1;
      }
    });

    return { todos, categories: lists.categories, changed };
  }

  /*
    lists : { todos, categories }. Ne modifie rien, rend une nouvelle liste
    et le nombre de taches touchees.
  */
  function applyPayload(lists, payload, { clientKey, createdAt, makeCategoryId }) {
    const depart = {
      todos: Array.isArray(lists?.todos) ? lists.todos : [],
      categories: Array.isArray(lists?.categories) ? lists.categories : [],
    };

    if (payload?.source === "todo") {
      return applyAdd(depart, payload, clientKey, createdAt, makeCategoryId);
    }
    if (payload?.source === "todo-action") {
      return applyActions(depart, payload);
    }
    return { ...depart, changed: 0 };
  }

  AtlasApp.todoInbox = { applyPayload, idPrefix, isTodoPayload };
})(window);
