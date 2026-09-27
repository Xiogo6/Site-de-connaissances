/*
  Raccourci "Taches" : ajouter, cocher, renommer et supprimer des taches
  d'Atlas sans ouvrir Atlas.

  LECTURE. La liste vient de get_app_payload, le meme appel qu'Atlas a son
  ouverture. La page n'en garde que les taches et les categories, et les
  conserve sur l'appareil pour s'afficher tout de suite a la visite suivante.

  ECRITURE. La page n'ecrit JAMAIS l'etat d'Atlas. sync_app_payload remplace
  l'espace de travail entier : un envoi depuis une page qui ne connait que les
  taches ecraserait les pages et les reglages. Tout passe donc par la file
  voice_inbox, comme la dictee, et Atlas l'applique a son demarrage suivant :

    { source: "todo",        todos:   [{ label, categoryLabel? }], transcript }
    { source: "todo-action", actions: [{ todoId, op, patch?, at }] }

  La regle d'application vit dans todo-inbox.js, partagee avec Atlas. La page
  s'en sert pour afficher la liste telle qu'elle sera une fois Atlas passe :

    liste lue dans Atlas
      + lignes encore dans la file (deja envoyees, pas encore appliquees)
      + gestes restes sur le telephone (pas encore envoyes)

  Rien ne se devine : ce qui est encore dans la file se lit dans la file.

  `transcript`, sur les ajouts seulement, sert un Atlas reste en ancienne
  version dans un cache : il prendrait la ligne pour une dictee et, sans
  texte, la supprimerait. Avec ce texte, il en fait une page : la tache n'est
  pas a sa place, mais elle n'est pas perdue.

  Sans reseau, tout attend dans localStorage et part au retour du reseau.
  Comme pour la dictee, un 409 sur client_key vaut confirmation d'arrivee.

  Le stockage etant cloisonne par icone sur iOS, cette page a sa propre
  session Supabase, saisie une fois.
*/
(function initializeTodoQuickPage(global) {
  const AtlasApp = (global.AtlasApp = global.AtlasApp || {});
  const inbox = AtlasApp.todoInbox;

  const outboxKey = "atlas-todo-outbox";
  const cacheKey = "atlas-todo-quick-cache";
  const categoriesKey = "atlas-todo-quick-categories";
  const lastCategoryKey = "atlas-todo-quick-last-category";
  const maxRememberedCategories = 12;
  const sansCategorie = "Sans categorie";

  const elements = {
    form: document.querySelector("#todo-quick-form"),
    input: document.querySelector("#todo-quick-input"),
    category: document.querySelector("#todo-quick-category"),
    categoryList: document.querySelector("#todo-quick-categories"),
    submit: document.querySelector("#todo-quick-submit"),
    status: document.querySelector("#todo-quick-status"),
    session: document.querySelector("#todo-quick-session"),
    list: document.querySelector("#todo-quick-list"),
    empty: document.querySelector("#todo-quick-empty"),
    done: document.querySelector("#todo-quick-done"),
    doneSummary: document.querySelector("#todo-quick-done-summary"),
    doneList: document.querySelector("#todo-quick-done-list"),
    freshness: document.querySelector("#todo-quick-freshness"),
    config: document.querySelector("#todo-quick-config"),
    authEmail: document.querySelector("#todo-quick-auth-email"),
    authPassword: document.querySelector("#todo-quick-auth-password"),
    authSubmit: document.querySelector("#todo-quick-auth-submit"),
    authStatus: document.querySelector("#todo-quick-auth-status"),
  };

  const state = {
    auth: null,
    flushing: null,
    refreshing: null,
    // { todos, categories, fetchedAt } : dernier etat lu dans Atlas.
    remote: null,
    // Lignes de taches encore dans la file distante : { client_key, created_at, payload }.
    queued: [],
  };

  /* ---------- stockage local ---------- */

  function readJson(key, fallback) {
    try {
      const raw = global.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      global.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      return false;
    }
  }

  // Les entrees de la premiere version ne portaient que `todos` : elles
  // restent lisibles, comme des ajouts.
  function normalizeEntry(entry) {
    if (!entry?.clientKey) {
      return null;
    }
    if (entry.payload?.source) {
      return entry;
    }
    if (Array.isArray(entry.todos)) {
      return {
        clientKey: entry.clientKey,
        capturedAt: entry.capturedAt,
        payload: { source: "todo", capturedAt: entry.capturedAt, todos: entry.todos },
      };
    }
    return null;
  }

  function readOutbox() {
    const entries = readJson(outboxKey, []);
    return Array.isArray(entries) ? entries.map(normalizeEntry).filter(Boolean) : [];
  }

  function pushOutbox(payload) {
    const capturedAt = new Date().toISOString();
    const entry = {
      clientKey: makeClientKey(),
      capturedAt,
      payload: { ...payload, capturedAt },
    };
    return writeJson(outboxKey, [...readOutbox(), entry]) ? entry : null;
  }

  function makeClientKey() {
    if (global.crypto?.randomUUID) {
      return global.crypto.randomUUID();
    }
    return `todo-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  }

  function rememberCategory(label) {
    writeJson(lastCategoryKey, label);
    if (!label) {
      return;
    }
    const known = readJson(categoriesKey, []);
    const next = [
      label,
      ...(Array.isArray(known) ? known : []).filter(
        (item) => String(item).toLowerCase() !== label.toLowerCase()
      ),
    ].slice(0, maxRememberedCategories);
    writeJson(categoriesKey, next);
  }

  /* ---------- reseau ---------- */

  async function buildHeaders(extra = {}) {
    const remote = AtlasApp.config.supabase;
    const accessToken = await state.auth.getAccessToken();
    if (!accessToken) {
      throw new Error("Session Supabase absente ou expiree.");
    }
    return {
      apikey: remote.publishableKey,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...extra,
    };
  }

  function looksLikeDuplicate(status, detail) {
    return status === 409 || /23505|duplicate key|already exists/i.test(String(detail || ""));
  }

  function buildRowPayload(entry) {
    const payload = { ...entry.payload, clientKey: entry.clientKey };
    if (payload.source === "todo") {
      payload.transcript = (payload.todos || []).map((todo) => `- ${todo.label}`).join("\n");
    }
    return payload;
  }

  async function sendEntry(entry) {
    const remote = AtlasApp.config.supabase;
    const response = await fetch(`${remote.url}/rest/v1/voice_inbox`, {
      method: "POST",
      headers: await buildHeaders({ Prefer: "return=minimal" }),
      body: JSON.stringify({ client_key: entry.clientKey, payload: buildRowPayload(entry) }),
    });

    if (response.ok) {
      return;
    }

    const detail = await response.text();
    if (looksLikeDuplicate(response.status, detail)) {
      return;
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error("Refuse par Supabase : reconnecte-toi sur cette page.");
    }
    throw new Error(detail || `Supabase a repondu ${response.status}.`);
  }

  async function fetchQueuedRows() {
    const remote = AtlasApp.config.supabase;
    const response = await fetch(
      `${remote.url}/rest/v1/voice_inbox` +
        "?select=client_key,created_at,payload" +
        `&payload->>source=in.${encodeURIComponent('("todo","todo-action")')}` +
        "&order=created_at.asc",
      { headers: await buildHeaders() }
    );
    if (!response.ok) {
      throw new Error((await response.text()) || `Lecture refusee (${response.status}).`);
    }
    const rows = await response.json();
    return Array.isArray(rows) ? rows : [];
  }

  async function fetchAtlasTodos() {
    const remote = AtlasApp.config.supabase;
    const response = await fetch(`${remote.url}/rest/v1/rpc/get_app_payload`, {
      method: "POST",
      headers: await buildHeaders(),
      body: "{}",
    });
    if (!response.ok) {
      throw new Error((await response.text()) || `Lecture refusee (${response.status}).`);
    }
    const payload = await response.json();
    return {
      todos: Array.isArray(payload?.settings?.todos) ? payload.settings.todos : [],
      categories: Array.isArray(payload?.settings?.todoCategories)
        ? payload.settings.todoCategories
        : [],
      fetchedAt: new Date().toISOString(),
    };
  }

  /*
    La file est lue AVANT la liste. Si Atlas applique une ligne entre les
    deux lectures, elle est vue deux fois, dans la file et dans la liste :
    sans consequence, car appliquer deux fois la meme ligne ne change rien.
    Dans l'autre ordre, elle pourrait n'etre vue nulle part.
  */
  function refresh() {
    if (state.refreshing || !state.auth?.isSignedIn()) {
      return state.refreshing;
    }

    state.refreshing = (async () => {
      try {
        const queued = await fetchQueuedRows();
        const remote = await fetchAtlasTodos();
        state.queued = queued;
        state.remote = remote;
        writeJson(cacheKey, { remote, queued });
      } catch (error) {
        setStatus(
          global.navigator.onLine === false
            ? "Hors ligne : liste de la derniere visite."
            : "Liste d'Atlas illisible pour l'instant.",
          true
        );
      }
    })().finally(() => {
      state.refreshing = null;
      render();
    });

    return state.refreshing;
  }

  // Une seule vidange a la fois : deux envois concurrents de la meme entree
  // ne feraient pas de doublon (client_key), mais doubleraient les requetes.
  function flush() {
    if (state.flushing) {
      return state.flushing;
    }

    state.flushing = (async () => {
      if (!state.auth?.isSignedIn()) {
        if (readOutbox().length) {
          setStatus("En attente : connecte-toi ci-dessous pour envoyer.");
        }
        return;
      }

      for (const entry of readOutbox()) {
        try {
          await sendEntry(entry);
        } catch (error) {
          setStatus(
            global.navigator.onLine === false
              ? "Hors ligne : les changements partiront au retour du reseau."
              : error.message || "Envoi impossible pour l'instant.",
            true
          );
          return;
        }
        // Retrait APRES confirmation seulement. La ligne rejoint la file
        // connue, pour que l'affichage ne bouge pas en attendant la relecture.
        writeJson(
          outboxKey,
          readOutbox().filter((item) => item.clientKey !== entry.clientKey)
        );
        state.queued = [
          ...state.queued.filter((row) => row.client_key !== entry.clientKey),
          { client_key: entry.clientKey, created_at: entry.capturedAt, payload: entry.payload },
        ];
        writeJson(cacheKey, { remote: state.remote, queued: state.queued });
        setStatus("Envoye. Atlas l'appliquera a sa prochaine ouverture.");
      }
    })().finally(() => {
      state.flushing = null;
      render();
    });

    return state.flushing;
  }

  /* ---------- etat affiche ---------- */

  function computeView() {
    let lists = {
      todos: state.remote?.todos || [],
      categories: state.remote?.categories || [],
    };
    const steps = [
      ...state.queued.map((row) => ({
        clientKey: row.client_key,
        createdAt: row.created_at,
        payload: row.payload,
      })),
      ...readOutbox().map((entry) => ({
        clientKey: entry.clientKey,
        createdAt: entry.capturedAt,
        payload: entry.payload,
      })),
    ];

    steps.forEach((step, index) => {
      lists = inbox.applyPayload(lists, step.payload, {
        clientKey: step.clientKey,
        createdAt: step.createdAt,
        // Identifiant provisoire : Atlas creera la sienne. Seul le nom compte
        // pour ranger la tache ici.
        makeCategoryId: () => `apercu-${index}-${Math.random().toString(36).slice(2, 8)}`,
      });
    });

    return lists;
  }

  /* ---------- gestes ---------- */

  function queueAction(action) {
    const saved = pushOutbox({
      source: "todo-action",
      actions: [{ ...action, at: new Date().toISOString() }],
    });
    if (!saved) {
      setStatus("Stockage plein : changement non enregistre.", true);
      return;
    }
    render();
    flush();
  }

  function handleSubmit(event) {
    event.preventDefault();
    const categoryLabel = elements.category.value.trim().slice(0, 80);
    // Un collage de plusieurs lignes donne plusieurs taches, comme dans Atlas.
    const todos = elements.input.value
      .split(/\r?\n/)
      .map((label) => label.trim().slice(0, 500))
      .filter(Boolean)
      .map((label) => (categoryLabel ? { label, categoryLabel } : { label }));

    if (!todos.length) {
      elements.input.focus();
      return;
    }

    if (!pushOutbox({ source: "todo", todos })) {
      setStatus("Stockage plein : tache non enregistree.", true);
      return;
    }

    rememberCategory(categoryLabel);
    elements.input.value = "";
    // Le clavier reste ouvert : on enchaine les taches sans retoucher l'ecran.
    elements.input.focus();
    render();
    flush();
  }

  function handleListChange(event) {
    const row = event.target.closest(".taches-item");
    const todoId = row?.dataset.todoId;
    if (!todoId) {
      return;
    }

    if (event.target.matches(".taches-coche")) {
      queueAction({ todoId, op: "update", patch: { completed: event.target.checked } });
      return;
    }

    if (event.target.matches(".taches-libelle")) {
      const label = event.target.value.trim();
      const actuel = computeView().todos.find((item) => item.id === todoId);
      if (!label) {
        // Vider le libelle ne supprime rien par accident : on le remet.
        event.target.value = actuel?.label || "";
        return;
      }
      if (label !== actuel?.label) {
        queueAction({ todoId, op: "update", patch: { label } });
      }
    }
  }

  function handleListClick(event) {
    const button = event.target.closest(".taches-supprimer");
    const todoId = button?.closest(".taches-item")?.dataset.todoId;
    if (todoId) {
      queueAction({ todoId, op: "delete" });
    }
  }

  function handleListKeydown(event) {
    if (event.key === "Enter" && event.target.matches(".taches-libelle")) {
      event.preventDefault();
      event.target.blur();
    }
  }

  /* ---------- interface ---------- */

  function setStatus(message, isError = false) {
    elements.status.textContent = message || "";
    elements.status.classList.toggle("is-error", Boolean(isError));
  }

  function createItem(item) {
    const row = document.createElement("li");
    row.className = "taches-item";
    row.classList.toggle("est-faite", Boolean(item.completed));
    row.dataset.todoId = item.id;

    const coche = document.createElement("input");
    coche.type = "checkbox";
    coche.className = "taches-coche";
    coche.checked = Boolean(item.completed);
    coche.setAttribute("aria-label", `Terminer : ${item.label}`);

    const libelle = document.createElement("input");
    libelle.type = "text";
    libelle.className = "taches-libelle";
    libelle.value = item.label;
    libelle.maxLength = 500;
    libelle.enterKeyHint = "done";
    libelle.setAttribute("aria-label", "Modifier la tache");

    const supprimer = document.createElement("button");
    supprimer.type = "button";
    supprimer.className = "taches-supprimer";
    supprimer.textContent = "×";
    supprimer.setAttribute("aria-label", `Supprimer : ${item.label}`);

    row.append(coche, libelle, supprimer);
    return row;
  }

  function sortItems(items) {
    return [...items].sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
  }

  function renderCategories(categories) {
    const known = readJson(categoriesKey, []);
    const labels = [
      ...categories.map((category) => category.label),
      ...(Array.isArray(known) ? known : []),
    ].filter(
      (label, index, all) =>
        label &&
        all.findIndex((other) => String(other).toLowerCase() === String(label).toLowerCase()) ===
          index
    );
    elements.categoryList.replaceChildren(
      ...labels.map((label) => {
        const option = document.createElement("option");
        option.value = label;
        return option;
      })
    );
  }

  function render() {
    // Ne pas redessiner sous le doigt : un libelle en cours de saisie serait
    // remplace par l'ancien texte.
    const focused = global.document.activeElement;
    if (focused?.matches?.(".taches-libelle")) {
      return;
    }

    const { todos, categories } = computeView();
    const ordered = sortItems(categories);
    const knownIds = new Set(ordered.map((category) => category.id));
    const open = todos.filter((item) => !item.completed);
    const done = todos.filter((item) => item.completed);

    const groups = [
      ...ordered.map((category) => ({
        label: category.label,
        items: open.filter((item) => item.categoryId === category.id),
      })),
      {
        label: sansCategorie,
        items: open.filter((item) => !item.categoryId || !knownIds.has(item.categoryId)),
      },
    ].filter((group) => group.items.length);

    elements.list.replaceChildren(
      ...groups.map((group) => {
        const section = document.createElement("li");
        section.className = "taches-groupe";
        const titre = document.createElement("h2");
        titre.textContent = group.label;
        const liste = document.createElement("ul");
        liste.className = "taches-liste";
        liste.append(...sortItems(group.items).map(createItem));
        section.append(titre, liste);
        return section;
      })
    );

    elements.doneList.replaceChildren(...sortItems(done).map(createItem));
    elements.doneSummary.textContent = `Faites (${done.length})`;
    elements.done.hidden = done.length === 0;

    const connue = Boolean(state.remote);
    elements.empty.hidden = open.length > 0;
    elements.empty.textContent = connue
      ? "Rien a faire. Bravo."
      : "La liste s'affichera une fois connecte.";

    const enAttente = readOutbox().length;
    elements.freshness.textContent = [
      state.remote?.fetchedAt
        ? `Liste lue a ${new Date(state.remote.fetchedAt).toLocaleTimeString("fr-FR", {
            hour: "2-digit",
            minute: "2-digit",
          })}`
        : "",
      state.queued.length || enAttente
        ? `${state.queued.length + enAttente} changement(s) en attente d'Atlas`
        : "",
    ]
      .filter(Boolean)
      .join(" · ");

    renderCategories(ordered);
  }

  function renderSession() {
    const signedIn = Boolean(state.auth?.isSignedIn());
    elements.session.textContent = signedIn
      ? `Session : ${state.auth.getEmail() || "ouverte"}`
      : "Aucune session ici : les changements attendront la connexion.";
    elements.config.hidden = signedIn;
  }

  async function handleSignIn() {
    elements.authSubmit.disabled = true;
    elements.authStatus.textContent = "Connexion...";
    try {
      await state.auth.signIn(elements.authEmail.value, elements.authPassword.value);
      elements.authPassword.value = "";
      elements.authStatus.textContent = "";
      renderSession();
      await flush();
      refresh();
    } catch (error) {
      elements.authStatus.textContent = error.message || "Connexion impossible.";
    } finally {
      elements.authSubmit.disabled = false;
    }
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in global.navigator)) {
      return;
    }
    const protocol = global.location.protocol;
    if (protocol !== "https:" && protocol !== "http:") {
      return;
    }
    global.navigator.serviceWorker
      .register("./service-worker.js", { updateViaCache: "none" })
      .catch(() => {
        // La page reste utilisable sans cache hors ligne.
      });
  }

  async function boot() {
    if (!elements.form) {
      return;
    }

    // La saisie passe avant tout le reste : c'est l'instant ou la page sert.
    elements.form.addEventListener("submit", handleSubmit);
    elements.authSubmit.addEventListener("click", handleSignIn);
    [elements.list, elements.doneList].forEach((list) => {
      list.addEventListener("change", handleListChange);
      list.addEventListener("click", handleListClick);
      list.addEventListener("keydown", handleListKeydown);
      // Le rendu saute pendant l'edition d'un libelle : on le rattrape a la
      // sortie du champ, une fois le focus vraiment parti.
      list.addEventListener("focusout", () => global.setTimeout(render, 0));
    });
    elements.category.value = readJson(lastCategoryKey, "") || "";
    elements.submit.disabled = false;

    // La liste de la visite precedente s'affiche aussitot, la fraiche suit.
    const cache = readJson(cacheKey, null);
    if (cache?.remote) {
      state.remote = cache.remote;
      state.queued = Array.isArray(cache.queued) ? cache.queued : [];
    }
    render();

    global.addEventListener("online", () => flush().then(refresh));
    global.document.addEventListener("visibilitychange", () => {
      if (global.document.visibilityState === "visible") {
        flush().then(refresh);
      }
    });

    try {
      state.auth = AtlasApp.createAuthModule({ elements: {} });
      if (!state.auth.isConfigured()) {
        elements.session.textContent = "Session : Supabase non configure.";
        return;
      }
      await state.auth.restore();
    } catch (error) {
      elements.session.textContent = "Session : etat inconnu.";
    }

    renderSession();
    await flush();
    await refresh();
    registerServiceWorker();
  }

  AtlasApp.todoQuick = { buildRowPayload, computeView, normalizeEntry };

  boot();
})(window);
