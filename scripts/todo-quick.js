/*
  Raccourci "Taches" : ajouter une tache a Atlas sans ouvrir Atlas.

  Meme principe que la dictee (voice.html), en plus court : la page depose la
  tache dans la file Supabase voice_inbox, et Atlas la range dans sa liste au
  demarrage suivant (voice-inbox.js, puis todos.addFromInbox). Pas de nouvelle
  table : la ligne porte `payload.source = "todo"`, c'est ce qui la distingue
  d'une dictee.

  Forme deposee, contrat avec voice-inbox.js :

    {
      "source":     "todo",
      "clientKey":  "uuid, le meme que la colonne client_key",
      "capturedAt": "2026-09-27T08:14:22.000Z",
      "todos":      [{ "label": "Appeler le garage", "categoryLabel": "Maison" }],
      "transcript": "- Appeler le garage"
    }

  `transcript` n'est lu par personne de nouveau : il est la pour un Atlas reste
  en ancienne version dans un cache. Celui-la ne connait pas `source`, prendrait
  la ligne pour une dictee et, sans texte, la supprimerait comme
  inexploitable. Avec ce texte, il en fait une page : la tache n'est pas a sa
  place, mais elle n'est pas perdue.

  Rien ne part sans reseau : les taches attendent dans localStorage, et
  repartent a la prochaine ouverture ou au retour du reseau. Comme pour la
  dictee, un 409 sur client_key vaut confirmation d'arrivee, pas echec.

  Le stockage etant cloisonne par icone sur iOS, cette page a sa propre
  session Supabase, saisie une fois.
*/
(function initializeTodoQuickPage(global) {
  const AtlasApp = (global.AtlasApp = global.AtlasApp || {});

  const outboxKey = "atlas-todo-outbox";
  const categoriesKey = "atlas-todo-quick-categories";
  const lastCategoryKey = "atlas-todo-quick-last-category";
  const maxRememberedCategories = 12;

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
    config: document.querySelector("#todo-quick-config"),
    authEmail: document.querySelector("#todo-quick-auth-email"),
    authPassword: document.querySelector("#todo-quick-auth-password"),
    authSubmit: document.querySelector("#todo-quick-auth-submit"),
    authStatus: document.querySelector("#todo-quick-auth-status"),
  };

  const state = {
    auth: null,
    flushing: null,
    // Ce qui a ete confirme pendant cette visite, pour que l'on voie l'ajout
    // arriver. Rien n'est garde au dela : Atlas fait foi.
    sent: [],
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

  function readOutbox() {
    const entries = readJson(outboxKey, []);
    return Array.isArray(entries) ? entries.filter((entry) => entry?.clientKey) : [];
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

  /* ---------- envoi ---------- */

  function buildPayload(entry) {
    return {
      source: "todo",
      clientKey: entry.clientKey,
      capturedAt: entry.capturedAt,
      todos: entry.todos,
      transcript: entry.todos.map((todo) => `- ${todo.label}`).join("\n"),
    };
  }

  function looksLikeDuplicate(status, detail) {
    return status === 409 || /23505|duplicate key|already exists/i.test(String(detail || ""));
  }

  async function sendEntry(entry) {
    const remote = AtlasApp.config.supabase;
    const accessToken = await state.auth.getAccessToken();
    if (!accessToken) {
      throw new Error("Session Supabase absente ou expiree.");
    }

    const response = await fetch(`${remote.url}/rest/v1/voice_inbox`, {
      method: "POST",
      headers: {
        apikey: remote.publishableKey,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ client_key: entry.clientKey, payload: buildPayload(entry) }),
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
              ? "Hors ligne : la tache partira au retour du reseau."
              : error.message || "Envoi impossible pour l'instant.",
            true
          );
          return;
        }
        // Retrait APRES confirmation seulement.
        writeJson(
          outboxKey,
          readOutbox().filter((item) => item.clientKey !== entry.clientKey)
        );
        state.sent.unshift(...entry.todos.map((todo) => ({ ...todo, done: true })));
        setStatus("Envoye. La tache apparaitra a l'ouverture d'Atlas.");
        renderList();
      }
    })().finally(() => {
      state.flushing = null;
      renderList();
    });

    return state.flushing;
  }

  /* ---------- interface ---------- */

  function setStatus(message, isError = false) {
    elements.status.textContent = message || "";
    elements.status.classList.toggle("is-error", Boolean(isError));
  }

  function renderCategories() {
    const known = readJson(categoriesKey, []);
    elements.categoryList.replaceChildren(
      ...(Array.isArray(known) ? known : []).map((label) => {
        const option = document.createElement("option");
        option.value = label;
        return option;
      })
    );
  }

  function renderList() {
    const pending = readOutbox().flatMap((entry) =>
      entry.todos.map((todo) => ({ ...todo, done: false }))
    );
    const rows = [...pending, ...state.sent];

    elements.list.replaceChildren(
      ...rows.map((todo) => {
        const item = document.createElement("li");
        item.className = "taches-item";
        const label = document.createElement("span");
        label.textContent = todo.label;
        const meta = document.createElement("span");
        meta.className = `taches-etat ${todo.done ? "est-fait" : "est-attente"}`;
        meta.textContent = [todo.categoryLabel, todo.done ? "envoyee" : "en attente"]
          .filter(Boolean)
          .join(" · ");
        item.append(label, meta);
        return item;
      })
    );
    elements.empty.hidden = rows.length > 0;
  }

  function renderSession() {
    const signedIn = Boolean(state.auth?.isSignedIn());
    elements.session.textContent = signedIn
      ? `Session : ${state.auth.getEmail() || "ouverte"}`
      : "Aucune session ici : les taches attendront la connexion.";
    elements.config.hidden = signedIn;
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

    const saved = writeJson(outboxKey, [
      ...readOutbox(),
      { clientKey: makeClientKey(), capturedAt: new Date().toISOString(), todos },
    ]);
    if (!saved) {
      setStatus("Stockage plein : tache non enregistree.", true);
      return;
    }

    rememberCategory(categoryLabel);
    renderCategories();
    elements.input.value = "";
    // Le clavier reste ouvert : on enchaine les taches sans retoucher l'ecran.
    elements.input.focus();
    renderList();
    flush();
  }

  async function handleSignIn() {
    elements.authSubmit.disabled = true;
    elements.authStatus.textContent = "Connexion...";
    try {
      await state.auth.signIn(elements.authEmail.value, elements.authPassword.value);
      elements.authPassword.value = "";
      elements.authStatus.textContent = "";
      renderSession();
      flush();
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
    elements.category.value = readJson(lastCategoryKey, "") || "";
    elements.submit.disabled = false;
    renderCategories();
    renderList();
    elements.input.focus();

    global.addEventListener("online", () => flush());
    global.document.addEventListener("visibilitychange", () => {
      if (global.document.visibilityState === "visible") {
        flush();
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
    registerServiceWorker();
  }

  AtlasApp.todoQuick = { buildPayload };

  boot();
})(window);
