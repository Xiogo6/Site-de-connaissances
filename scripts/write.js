/*
  Page d'ecriture rapide (write.html).

  Meme logique que la dictee, sans l'audio : le texte tape part dans la table
  voice_inbox, et Atlas en fait une page a son prochain demarrage, dans le
  dossier "Notes rapides". Aucune table neuve : la file accepte deja un
  payload jsonb libre, et `source: "texte"` suffit a Atlas pour distinguer un
  ecrit d'une dictee.

  Comme voice.html, la page ne charge que config.js et auth.js : le champ de
  saisie est utilisable des le premier affichage, sans attendre Atlas.

  FILE LOCALE. Chaque envoi passe d'abord par localStorage, puis part vers
  Supabase. Sans reseau, ou sans session, le texte attend ici et repart a la
  prochaine ouverture ou au retour du reseau. Le client_key, unique cote base,
  rend la reprise sans doublon : un 409 vaut confirmation.
*/
(function initializeWritePage(global) {
  const AtlasApp = (global.AtlasApp = global.AtlasApp || {});

  const draftKey = "atlas-write-draft";
  const outboxKey = "atlas-write-outbox";
  // Une premiere ligne plus longue est une phrase, pas un titre.
  const maxTitleFromFirstLine = 80;

  const elements = {
    title: document.querySelector("#write-title"),
    body: document.querySelector("#write-body"),
    send: document.querySelector("#write-send"),
    status: document.querySelector("#write-status"),
    session: document.querySelector("#write-session"),
    file: document.querySelector("#write-file"),
    list: document.querySelector("#write-list"),
    config: document.querySelector("#write-config"),
    authEmail: document.querySelector("#write-auth-email"),
    authPassword: document.querySelector("#write-auth-password"),
    authSubmit: document.querySelector("#write-auth-submit"),
    authStatus: document.querySelector("#write-auth-status"),
  };

  const state = {
    auth: null,
    flushing: false,
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

  function loadOutbox() {
    const items = readJson(outboxKey, []);
    return Array.isArray(items) ? items.filter((item) => item?.clientKey) : [];
  }

  function saveOutbox(items) {
    return writeJson(outboxKey, items);
  }

  function saveDraft() {
    writeJson(draftKey, { title: elements.title.value, body: elements.body.value });
  }

  function restoreDraft() {
    const draft = readJson(draftKey, null);
    if (draft) {
      elements.title.value = String(draft.title || "");
      elements.body.value = String(draft.body || "");
    }
  }

  function clearDraft() {
    try {
      global.localStorage.removeItem(draftKey);
    } catch (error) {
      // Rien de grave : le brouillon sera ecrase a la prochaine frappe.
    }
  }

  function makeClientKey() {
    if (global.crypto?.randomUUID) {
      return global.crypto.randomUUID();
    }
    return [
      Date.now().toString(36),
      Math.random().toString(36).slice(2, 10),
      Math.random().toString(36).slice(2, 10),
    ].join("-");
  }

  /* ---------- mise en forme ---------- */

  /*
    Titre explicite s'il y en a un. Sinon, une premiere ligne courte sert de
    titre, comme dans Notes : on tape "Idee pour X", retour, puis le reste.
    Faute de mieux, le titre reste vide et Atlas mettra la date.
  */
  function splitEntry(rawTitle, rawBody) {
    let title = String(rawTitle || "").trim();
    let body = String(rawBody || "").replace(/\s+$/, "");

    if (!title) {
      const lignes = body.replace(/^\s+/, "").split("\n");
      const premiere = lignes[0].replace(/^#+\s*/, "").trim();
      if (premiere && premiere.length <= maxTitleFromFirstLine) {
        title = premiere;
        body = lignes.slice(1).join("\n");
      }
    }

    return { title, body: body.trim() };
  }

  function buildPayload(entry) {
    const content = entry.title
      ? `# ${entry.title}${entry.body ? `\n\n${entry.body}` : ""}`
      : "";

    return {
      clientKey: entry.clientKey,
      capturedAt: entry.capturedAt,
      source: "texte",
      transcript: entry.body,
      structured: {
        title: entry.title,
        type: "concept",
        tags: [],
        content,
      },
    };
  }

  /* ---------- depot dans la file Supabase ---------- */

  function looksLikeDuplicate(status, detail) {
    return status === 409 || /23505|duplicate key|already exists/i.test(String(detail || ""));
  }

  async function deliver(entry) {
    const remote = AtlasApp.config.supabase;
    const accessToken = await state.auth.getAccessToken();
    if (!accessToken) {
      throw new Error("Session absente : connecte-toi ci-dessous.");
    }

    let response;
    try {
      response = await fetch(`${remote.url}/rest/v1/voice_inbox`, {
        method: "POST",
        headers: {
          apikey: remote.publishableKey,
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ client_key: entry.clientKey, payload: buildPayload(entry) }),
      });
    } catch (error) {
      throw new Error("Pas de reseau.");
    }

    if (response.ok) {
      return;
    }

    const detail = await response.text();
    if (looksLikeDuplicate(response.status, detail)) {
      return;
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error("Refuse par Supabase : reconnecte-toi ci-dessous.");
    }
    throw new Error(detail || `Supabase a repondu ${response.status}.`);
  }

  async function flush() {
    if (state.flushing || !state.auth?.isSignedIn()) {
      return { sent: 0, error: null };
    }

    state.flushing = true;
    let sent = 0;
    let error = null;

    try {
      for (const entry of loadOutbox()) {
        try {
          await deliver(entry);
        } catch (deliveryError) {
          error = deliveryError;
          break;
        }
        // On relit la file a chaque retrait : un envoi fait pendant la boucle
        // ne doit pas etre efface par une copie perimee.
        saveOutbox(loadOutbox().filter((item) => item.clientKey !== entry.clientKey));
        sent += 1;
      }
    } finally {
      state.flushing = false;
      renderOutbox();
    }

    return { sent, error };
  }

  /* ---------- rendu ---------- */

  function setStatus(message, isError) {
    elements.status.textContent = message || "";
    elements.status.classList.toggle("est-erreur", Boolean(isError));
  }

  function renderSendButton() {
    elements.send.disabled = !elements.title.value.trim() && !elements.body.value.trim();
  }

  function formatMoment(iso) {
    const date = new Date(iso);
    return Number.isNaN(date.getTime())
      ? ""
      : date.toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  }

  function renderOutbox() {
    const items = loadOutbox();
    elements.file.hidden = !items.length;
    elements.list.replaceChildren(
      ...items.map((item) => {
        const li = document.createElement("li");
        const titre = document.createElement("span");
        titre.textContent = item.title || item.body.slice(0, 60) || "Sans titre";
        const moment = document.createElement("span");
        moment.textContent = formatMoment(item.capturedAt);
        li.append(titre, moment);
        return li;
      })
    );
  }

  function renderSession() {
    const auth = state.auth;
    if (!auth?.isConfigured()) {
      elements.session.textContent = "Supabase non configure";
      return;
    }
    const signedIn = auth.isSignedIn();
    elements.session.textContent = signedIn ? auth.getEmail() || "Session ouverte" : "Non connecte";
    elements.config.hidden = signedIn;
  }

  /* ---------- actions ---------- */

  async function send() {
    const { title, body } = splitEntry(elements.title.value, elements.body.value);
    if (!title && !body) {
      return;
    }

    const entry = { clientKey: makeClientKey(), capturedAt: new Date().toISOString(), title, body };
    // La file locale d'abord : si elle refuse l'ecriture, on garde le texte
    // a l'ecran plutot que de risquer de le perdre.
    if (!saveOutbox([...loadOutbox(), entry])) {
      setStatus("Stockage local plein : texte conserve a l'ecran.", true);
      return;
    }

    elements.title.value = "";
    elements.body.value = "";
    clearDraft();
    renderSendButton();
    renderOutbox();
    elements.body.focus();

    if (!state.auth?.isSignedIn()) {
      setStatus("Garde ici. Connecte-toi pour l'envoyer.");
      return;
    }

    setStatus("Envoi...");
    const { error } = await flush();
    if (error) {
      setStatus(`${error.message || "Envoi impossible."} Garde ici, reessai automatique.`, true);
    } else {
      setStatus("Envoye. La page apparaitra a la prochaine ouverture d'Atlas.");
    }
  }

  async function signIn() {
    elements.authSubmit.disabled = true;
    elements.authStatus.textContent = "Connexion...";
    try {
      await state.auth.signIn(elements.authEmail.value, elements.authPassword.value);
      elements.authPassword.value = "";
      elements.authStatus.textContent = "";
      renderSession();
      const { sent, error } = await flush();
      if (error) {
        setStatus(error.message, true);
      } else if (sent) {
        setStatus(sent > 1 ? `${sent} pages envoyees.` : "Page envoyee.");
      }
    } catch (error) {
      elements.authStatus.textContent = error.message || "Connexion impossible.";
    } finally {
      elements.authSubmit.disabled = false;
    }
  }

  function bindEvents() {
    const onInput = () => {
      saveDraft();
      renderSendButton();
    };
    elements.title.addEventListener("input", onInput);
    elements.body.addEventListener("input", onInput);
    elements.title.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        elements.body.focus();
      }
    });
    elements.body.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        send();
      }
    });
    elements.send.addEventListener("click", send);
    elements.authSubmit.addEventListener("click", signIn);
    global.addEventListener("online", () => flush());
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) {
      return;
    }
    const protocol = global.location.protocol;
    if (protocol !== "https:" && protocol !== "http:") {
      return;
    }
    navigator.serviceWorker.register("./service-worker.js", { updateViaCache: "none" }).catch(() => {
      // La page reste utilisable sans cache hors ligne.
    });
  }

  async function initDeferred() {
    state.auth = AtlasApp.createAuthModule?.({ elements: {} }) || null;
    try {
      await state.auth?.restore();
    } catch (error) {
      // Session illisible : la page reste utilisable, l'envoi attendra.
    }
    renderSession();

    const { sent, error } = await flush();
    if (sent) {
      setStatus(sent > 1 ? `${sent} pages en attente envoyees.` : "Page en attente envoyee.");
    } else if (error) {
      setStatus(`En attente : ${error.message || "envoi impossible"}`, true);
    }

    registerServiceWorker();
  }

  function boot() {
    if (!elements.body) {
      return;
    }

    // La saisie d'abord : c'est l'instant ou la page devient utile.
    restoreDraft();
    bindEvents();
    renderSendButton();
    renderOutbox();
    elements.body.focus();

    initDeferred();
  }

  AtlasApp.writePage = { splitEntry, buildPayload };

  boot();
})(window);
