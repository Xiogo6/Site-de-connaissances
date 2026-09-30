/*
  Page d'ecriture rapide (write.html).

  Elle reprend l'editeur "Nouvelle page" d'Atlas : memes champs, memes classes,
  memes regles. Seule difference, la page ne charge pas l'espace de travail :
  elle ne cree rien elle-meme. Le texte part dans la table voice_inbox, et
  Atlas en fait une page a sa prochaine ouverture (scripts/voice-inbox.js),
  avec les memes regles que s'il avait ete saisi chez lui.

  Les regles reprises d'Atlas (scripts/notes.js, events.js, renderers.js) :

  - titre vide : "Sans titre" ; contenu compose "# Titre" puis le corps
  - type par defaut : le premier type de la liste, labels personnalises compris
  - sans "Classer directement", la page va dans "a trier" (Daily pour le type
    daily, la racine pour un dossier) ; avec, dans l'emplacement choisi
  - type Daily : la date du jour est posee si aucune date n'est saisie
  - dates au format souple, normalisees par helpers.js comme dans Atlas
  - tags separes par des virgules, avec suggestions parmi les tags existants
  - barre de mise en forme identique
  - Reformuler : meme appel Gemini qu'Atlas (scripts/ai.js, requestRewrite),
    meme prompt et memes reglages, avec son "Annuler reformulation" et ses
    points a verifier

  Les types, dossiers, tags et le theme viennent de Supabase (get_app_payload,
  lecture seule), et sont gardes dans localStorage : a l'ouverture suivante,
  la page est complete avant meme que le reseau reponde.

  FILE LOCALE. Chaque envoi passe d'abord par localStorage, puis part vers
  Supabase. Sans reseau, le texte attend ici et repart a la prochaine ouverture
  ou au retour du reseau. Le client_key, unique cote base, rend la reprise sans
  doublon : un 409 vaut confirmation.
*/
(function initializeWritePage(global) {
  const AtlasApp = (global.AtlasApp = global.AtlasApp || {});
  const { normalizeTag, parseTags, normalizeFlexibleDateInput, formatFlexibleDate } =
    AtlasApp.helpers;

  const draftKey = "atlas-write-draft";
  const outboxKey = "atlas-write-outbox";
  const catalogKey = "atlas-write-catalog";

  const $ = (selector) => document.querySelector(selector);
  const elements = {
    panel: $("#write-editor"),
    titleField: $("#editor-title-field"),
    title: $("#note-title"),
    favorite: $("#note-favorite"),
    type: $("#note-type"),
    tags: $("#note-tags"),
    tagSuggestions: $("#note-tag-suggestions"),
    directClassify: $("#note-direct-classify"),
    parentField: $("#editor-parent-field"),
    parent: $("#note-parent"),
    dateMode: $("#note-date-mode"),
    dateFields: $("#generic-date-fields"),
    dateSingleLabel: $("#note-date-single-label"),
    dateSingleCopy: $("#note-date-single-copy"),
    dateSingle: $("#note-date-single"),
    dateStartLabel: $("#note-date-start-label"),
    dateStart: $("#note-date-start"),
    dateEndLabel: $("#note-date-end-label"),
    dateEnd: $("#note-date-end"),
    content: $("#note-content"),
    toolbar: document.querySelector(".editor-toolbar"),
    save: $("#save-button"),
    cancel: $("#cancel-note-button"),
    status: $("#write-status"),
    session: $("#write-session"),
    pending: $("#write-pending"),
    aiAssist: $("#ai-assist-button"),
    aiUndo: $("#ai-undo-button"),
    factCheck: $("#ai-fact-check"),
    geminiPanel: $("#write-gemini"),
    geminiKey: $("#ai-api-key"),
    geminiSave: $("#ai-save-button"),
  };

  // Les identifiants que scripts/auth.js sait piloter : l'ecran de connexion
  // est celui d'Atlas, avec son comportement.
  const authElements = {
    authGate: $("#auth-gate"),
    authForm: $("#auth-form"),
    authEmail: $("#auth-email"),
    authPassword: $("#auth-password"),
    authSubmit: $("#auth-submit"),
    authError: $("#auth-error"),
  };

  const state = {
    auth: null,
    catalog: null,
    flushing: false,
    // Reformulation : appel en cours, texte d'avant pour "Annuler", et points
    // a verifier renvoyes par Gemini.
    aiBusy: false,
    rewriteBackup: null,
    factCheck: [],
  };

  // Seules les fonctions sans etat du module d'Atlas servent ici : l'appel,
  // le prompt et la lecture de la reponse.
  const ai = AtlasApp.createAiModule?.({ state: {}, elements: {} }) || null;

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

  function readForm() {
    return {
      title: elements.title.value,
      favorite: elements.favorite.checked,
      type: elements.type.value,
      tags: elements.tags.value,
      directClassify: elements.directClassify.checked,
      parentId: elements.parent.value,
      dateMode: elements.dateMode.value,
      dateSingle: elements.dateSingle.value,
      dateStart: elements.dateStart.value,
      dateEnd: elements.dateEnd.value,
      content: elements.content.value,
    };
  }

  function saveDraft() {
    writeJson(draftKey, readForm());
  }

  function clearDraft() {
    try {
      global.localStorage.removeItem(draftKey);
    } catch (error) {
      // Sans consequence : le brouillon sera ecrase a la prochaine frappe.
    }
  }

  function applyDraft(draft) {
    elements.title.value = String(draft?.title || "");
    elements.favorite.checked = Boolean(draft?.favorite);
    if (draft?.type && [...elements.type.options].some((option) => option.value === draft.type)) {
      elements.type.value = draft.type;
    }
    elements.tags.value = String(draft?.tags || "");
    elements.directClassify.checked = Boolean(draft?.directClassify);
    elements.parent.value = String(draft?.parentId || "");
    elements.dateMode.value = ["none", "reference", "life", "range"].includes(draft?.dateMode)
      ? draft.dateMode
      : "none";
    elements.dateSingle.value = String(draft?.dateSingle || "");
    elements.dateStart.value = String(draft?.dateStart || "");
    elements.dateEnd.value = String(draft?.dateEnd || "");
    elements.content.value = String(draft?.content || "");
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

  /* ---------- catalogue : types, dossiers, tags, theme ---------- */

  // Meme calcul que getNoteTypeLabels() dans data.js.
  function buildTypeEntries(settings = {}) {
    const deleted = new Set(settings.deletedNoteTypes || []);
    const builtins = Object.entries(AtlasApp.config.noteTypeLabels || {})
      .filter(([id]) => !deleted.has(id))
      .map(([id, label]) => ({ id, label: settings.typeLabels?.[id] || label }));
    const custom = (settings.customNoteTypes || [])
      .filter((item) => item?.id && !deleted.has(item.id))
      .map((item) => ({ id: item.id, label: item.label || item.id }));
    const seen = new Set();
    return [...builtins, ...custom].filter((entry) => {
      if (seen.has(entry.id)) {
        return false;
      }
      seen.add(entry.id);
      return true;
    });
  }

  // Meme tri et meme dedoublonnage que getAllTags() dans notes.js.
  function collectTags(notes) {
    const seen = new Set();
    return notes
      .flatMap((note) => (Array.isArray(note.tags) ? note.tags : []))
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right, "fr", { sensitivity: "base" }))
      .filter((tag) => {
        const key = normalizeTag(tag);
        if (!key || seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      });
  }

  function buildCatalog(payload) {
    const notes = Array.isArray(payload?.notes) ? payload.notes : [];
    const settings = payload?.settings || {};
    return {
      types: buildTypeEntries(settings),
      folders: notes
        .filter((note) => note?.type === "folder" && note.id)
        .map((note) => ({
          id: note.id,
          title: String(note.title || note.id),
          parentId: note.parentId || null,
        }))
        .sort((left, right) => left.title.localeCompare(right.title, "fr", { sensitivity: "base" })),
      tags: collectTags(notes),
      themePreset: settings.themePreset || "",
      theme: settings.theme || "",
      fetchedAt: new Date().toISOString(),
    };
  }

  async function authHeaders() {
    const accessToken = await state.auth?.getAccessToken();
    if (!accessToken) {
      throw new Error("Session absente.");
    }
    return {
      apikey: AtlasApp.config.supabase.publishableKey,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    };
  }

  // Lecture seule : cette page n'appelle jamais sync_app_payload.
  async function refreshCatalog() {
    if (!state.auth?.isSignedIn()) {
      return;
    }
    try {
      const response = await fetch(
        `${AtlasApp.config.supabase.url}/rest/v1/rpc/get_app_payload`,
        { method: "POST", headers: await authHeaders(), body: "{}" }
      );
      if (!response.ok) {
        return;
      }
      const catalog = buildCatalog(await response.json());
      writeJson(catalogKey, catalog);
      state.catalog = catalog;
      renderCatalog();
      syncClassificationControls();
      applyTheme();
    } catch (error) {
      // Hors ligne : le catalogue garde sa derniere version connue.
    }
  }

  function populateSelect(select, options, value) {
    select.replaceChildren(
      ...options.map((option) => {
        const node = document.createElement("option");
        node.value = option.value;
        node.textContent = option.label;
        return node;
      })
    );
    if (options.some((option) => option.value === value)) {
      select.value = value;
    }
  }

  function renderCatalog() {
    const catalog = state.catalog || {};
    const types = catalog.types?.length ? catalog.types : buildTypeEntries({});
    const currentType = elements.type.value;
    populateSelect(
      elements.type,
      types.map((entry) => ({ value: entry.id, label: entry.label })),
      currentType
    );
    if (!elements.type.value && types[0]) {
      elements.type.value = types[0].id;
    }

    const folders = catalog.folders || [];
    const currentParent = elements.parent.value;
    populateSelect(
      elements.parent,
      folders.length
        ? [
            { value: "", label: "Aucun dossier (racine)" },
            ...folders.map((folder) => ({ value: folder.id, label: folder.title })),
          ]
        : [{ value: "", label: "Aucun dossier disponible" }],
      currentParent
    );
  }

  // Meme logique que renderTheme() dans renderers.js, sans le stockage.
  function applyTheme() {
    const presets = AtlasApp.config.themePresets || {};
    const catalog = state.catalog || {};
    const fallback = catalog.theme === "light" ? "classic-light" : "classic-dark";
    const presetId = presets[catalog.themePreset] ? catalog.themePreset : fallback;
    const preset = presets[presetId] || { mode: "dark", themeColor: "#181b1f" };
    const isDark = preset.mode === "dark";

    for (const node of [document.documentElement, document.body]) {
      node.dataset.theme = preset.mode;
      node.dataset.themePreset = presetId;
      node.classList.toggle("theme-dark", isDark);
    }
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", preset.pageColor || preset.themeColor || "#181b1f");
  }

  /* ---------- regles de l'editeur ---------- */

  /*
    Le dossier ou irait la page sans "Classer directement", tel que
    getDefaultParentIdForType() le choisit dans notes.js. Ici on ne peut que
    le retrouver par son nom : c'est Atlas qui le cree s'il manque.
  */
  function defaultParentIdForType(type) {
    const folders = state.catalog?.folders || [];
    const find = (title, parentId) =>
      folders.find(
        (folder) =>
          folder.title.toLowerCase() === title.toLowerCase() &&
          (parentId === undefined || folder.parentId === parentId)
      );
    if (type === "folder") {
      return "";
    }
    if (type === "daily") {
      const racine = find("Kevin Barbet", null);
      return (racine && find("Daily", racine.id)?.id) || "";
    }
    return find("à trier", null)?.id || "";
  }

  // Meme logique que syncNewPageClassificationControls() dans notes.js : tant
  // que la case n'est pas cochee, l'emplacement suit le rangement par defaut,
  // et c'est lui qui apparait preselectionne quand on la coche.
  function syncClassificationControls() {
    const direct = elements.directClassify.checked;
    elements.parentField.classList.toggle("is-hidden", !direct);
    if (!direct) {
      elements.parent.value = defaultParentIdForType(elements.type.value);
    }
  }

  // Meme logique que renderStructuredFields() dans renderers.js.
  function renderStructuredFields() {
    const mode = elements.dateMode.value;
    const hasDate = mode !== "none";
    const isRange = mode === "range";
    const labels = { reference: "Date de reference", life: "Date de naissance", range: "Date" };

    elements.dateFields.classList.toggle("is-hidden", !hasDate);
    elements.dateFields.classList.toggle("is-single-date", mode === "reference");
    elements.dateSingleLabel.classList.toggle("is-hidden", !hasDate || isRange || mode === "life");
    elements.dateStartLabel.classList.toggle("is-hidden", !hasDate || (mode !== "range" && mode !== "life"));
    elements.dateEndLabel.classList.toggle("is-hidden", !hasDate || (mode !== "range" && mode !== "life"));
    elements.dateStartLabel.querySelector(".field-label").textContent =
      mode === "life" ? "Date de naissance" : "Date de debut";
    elements.dateEndLabel.querySelector(".field-label").textContent =
      mode === "life" ? "Date de deces" : "Date de fin";
    elements.dateSingleCopy.textContent = labels[mode] || "Date";
  }

  function todayFlexibleDate() {
    const now = new Date();
    return [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
    ].join("-");
  }

  // Meme regle que applyDailyDateToEditorIfEmpty() dans notes.js.
  function applyDailyDateIfEmpty() {
    const hasDate =
      elements.dateSingle.value.trim() || elements.dateStart.value.trim() || elements.dateEnd.value.trim();
    if (elements.type.value !== "daily" || hasDate) {
      return;
    }
    elements.dateMode.value = "reference";
    elements.dateSingle.value = formatFlexibleDate(todayFlexibleDate());
    elements.dateStart.value = "";
    elements.dateEnd.value = "";
    renderStructuredFields();
  }

  // Meme logique que collectMetadataFromInputs() dans notes.js.
  function collectMetadata() {
    const metadata = { hasDate: false, dateMode: "reference", singleDate: "", startDate: "", endDate: "" };
    const mode = elements.dateMode.value;
    if (mode === "none") {
      return metadata;
    }
    metadata.hasDate = true;
    metadata.dateMode = mode;
    if (mode === "range" || mode === "life") {
      metadata.startDate = normalizeFlexibleDateInput(elements.dateStart.value);
      metadata.endDate = normalizeFlexibleDateInput(elements.dateEnd.value);
    } else {
      metadata.singleDate = normalizeFlexibleDateInput(elements.dateSingle.value);
    }
    return metadata;
  }

  // Meme logique que renderTagSuggestions() dans renderers.js.
  function renderTagSuggestions() {
    const draft = elements.tags.value.split(",").pop()?.trim() || "";
    const normalizedDraft = normalizeTag(draft);
    const suggestions = normalizedDraft
      ? (state.catalog?.tags || [])
          .filter((tag) => tag.startsWith(normalizedDraft) && tag !== normalizedDraft)
          .slice(0, 6)
      : [];

    elements.tagSuggestions.replaceChildren(
      ...suggestions.map((tag) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "tag-suggestion";
        button.dataset.tagSuggestion = tag;
        button.textContent = tag;
        return button;
      })
    );
    elements.tagSuggestions.classList.toggle("is-hidden", !suggestions.length);
  }

  function handleTagSuggestionClick(event) {
    const button = event.target.closest("[data-tag-suggestion]");
    if (!button) {
      return;
    }
    // pointerdown : le champ ne perd pas le focus avant le clic.
    event.preventDefault();
    const parts = elements.tags.value.split(",");
    parts[parts.length - 1] = ` ${button.dataset.tagSuggestion}`;
    elements.tags.value = parts
      .map((part) => part.trim())
      .filter((part, index, list) => part || index < list.length - 1)
      .join(", ");
    renderTagSuggestions();
    saveDraft();
    elements.tags.focus();
  }

  // Meme logique que applyEditorFormat() dans events.js.
  function applyFormat(action) {
    const textarea = elements.content;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const value = textarea.value;
    const selection = value.slice(start, end);
    const hasSelection = start !== end;
    const lineBreakBefore = start > 0 && value[start - 1] !== "\n" ? "\n" : "";
    let replacement = selection;
    let nextCaret = end;

    if (action === "bold") {
      replacement = hasSelection ? `**${selection}**` : "****";
      nextCaret = hasSelection ? start + replacement.length : start + 2;
    } else if (action === "italic") {
      replacement = hasSelection ? `*${selection}*` : "**";
      nextCaret = hasSelection ? start + replacement.length : start + 1;
    } else if (action === "underline") {
      replacement = hasSelection ? `++${selection}++` : "++++";
      nextCaret = hasSelection ? start + replacement.length : start + 2;
    } else if (action === "bullet") {
      replacement = hasSelection
        ? selection.split("\n").map((line) => `- ${line.replace(/^- /, "")}`).join("\n")
        : `${lineBreakBefore}- `;
      nextCaret = start + replacement.length;
    } else if (action === "checklist") {
      replacement = hasSelection
        ? selection
            .split("\n")
            .map((line) => `- [ ] ${line.replace(/^-\s+\[[ xX]\]\s+/, "").replace(/^- /, "")}`)
            .join("\n")
        : `${lineBreakBefore}- [ ] `;
      nextCaret = start + replacement.length;
    } else if (action === "today") {
      const today = new Intl.DateTimeFormat("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(new Date());
      const suffix = end < value.length && value[end] !== "\n" ? "\n" : "";
      replacement = `${lineBreakBefore}${today}${suffix}`;
      nextCaret = start + replacement.length;
    } else if (action === "heading-1") {
      replacement = hasSelection ? `# ${selection}` : `${lineBreakBefore}# `;
      nextCaret = start + replacement.length;
    } else if (action === "heading-2") {
      replacement = hasSelection ? `## ${selection}` : `${lineBreakBefore}## `;
      nextCaret = start + replacement.length;
    } else if (action === "link") {
      replacement = hasSelection ? `[[${selection}]]` : "[[]]";
      nextCaret = hasSelection ? start + replacement.length : start + 2;
    } else {
      return;
    }

    textarea.setRangeText(replacement, start, end, "end");
    textarea.focus({ preventScroll: true });
    textarea.setSelectionRange(nextCaret, nextCaret);
    saveDraft();
    renderSaveButton();
  }

  /* ---------- clavier iOS : meme mecanique qu'Atlas ---------- */

  function syncViewport() {
    if (!document.body.classList.contains("editor-writing")) {
      document.documentElement.style.removeProperty("--editor-viewport-top");
      document.documentElement.style.removeProperty("--editor-viewport-height");
      return;
    }
    const viewport = global.visualViewport;
    document.documentElement.style.setProperty(
      "--editor-viewport-top",
      `${Math.round(Math.max(0, viewport?.offsetTop || 0))}px`
    );
    document.documentElement.style.setProperty(
      "--editor-viewport-height",
      `${Math.round(Math.max(280, viewport?.height || global.innerHeight))}px`
    );
  }

  function setWritingMode() {
    const active = document.activeElement;
    const writing = Boolean(
      elements.panel.contains(active) && active?.matches("input, textarea, select")
    );
    document.body.classList.toggle("editor-writing", writing);
    global.requestAnimationFrame(syncViewport);
  }

  // Le panneau des metadonnees est au-dessus du titre, comme dans Atlas : on
  // ouvre la page deja defilee jusqu'au titre, le panneau se tire vers le bas.
  function scrollToTitle() {
    if (!global.matchMedia?.("(max-width: 780px)").matches) {
      return;
    }
    const header = elements.panel.querySelector(".panel-header");
    elements.panel.scrollTop = Math.max(
      0,
      elements.titleField.offsetTop - (header?.offsetHeight || 0) - 8
    );
  }

  /* ---------- composition et envoi ---------- */

  // La page telle qu'Atlas l'aurait enregistree (saveCurrentNote, notes.js).
  function buildEntry() {
    const title = elements.title.value.trim() || "Sans titre";
    const body = elements.content.value.replace(/^\n+/, "").trimEnd();
    return {
      clientKey: makeClientKey(),
      capturedAt: new Date().toISOString(),
      note: {
        title,
        type: elements.type.value || "concept",
        tags: parseTags(elements.tags.value),
        favorite: elements.favorite.checked,
        directClassify: elements.directClassify.checked,
        parentId: elements.directClassify.checked ? elements.parent.value || null : null,
        metadata: collectMetadata(),
        content: body ? `# ${title}\n\n${body}` : `# ${title}`,
      },
      body,
    };
  }

  /*
    `structured` et `transcript` restent la pour un Atlas encore en ancienne
    version dans un cache : il en fera une page ordinaire au lieu de rejeter
    la ligne. `note` porte tout le reste, que la version courante applique.
  */
  function buildPayload(entry) {
    return {
      clientKey: entry.clientKey,
      capturedAt: entry.capturedAt,
      source: "texte",
      transcript: entry.body,
      structured: {
        title: entry.note.title,
        type: entry.note.type,
        tags: entry.note.tags,
        content: entry.note.content,
      },
      note: entry.note,
    };
  }

  function looksLikeDuplicate(status, detail) {
    return status === 409 || /23505|duplicate key|already exists/i.test(String(detail || ""));
  }

  async function deliver(entry) {
    let headers;
    try {
      headers = await authHeaders();
    } catch (error) {
      throw new Error("Session absente : reconnecte-toi.");
    }

    let response;
    try {
      response = await fetch(`${AtlasApp.config.supabase.url}/rest/v1/voice_inbox`, {
        method: "POST",
        headers: { ...headers, Prefer: "return=minimal" },
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
      throw new Error("Refuse par Supabase : reconnecte-toi.");
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
        // Relue a chaque retrait : un envoi fait pendant la boucle ne doit
        // pas etre efface par une copie perimee.
        saveOutbox(loadOutbox().filter((item) => item.clientKey !== entry.clientKey));
        sent += 1;
      }
    } finally {
      state.flushing = false;
      renderPending();
    }
    return { sent, error };
  }

  /* ---------- rendu ---------- */

  function setStatus(message) {
    elements.status.textContent = message || "";
  }

  function renderSaveButton() {
    // Pendant une reformulation, envoyer partirait avec le texte d'avant et
    // la reponse arriverait sur une page vide.
    elements.save.disabled =
      state.aiBusy || (!elements.title.value.trim() && !elements.content.value.trim());
  }

  function renderPending() {
    const count = loadOutbox().length;
    elements.pending.textContent = count
      ? count > 1
        ? `${count} pages en attente d'envoi.`
        : "Une page en attente d'envoi."
      : "";
  }

  function renderSession() {
    const auth = state.auth;
    elements.session.textContent = auth?.isSignedIn()
      ? `Session : ${auth.getEmail() || "ouverte"} · la page arrive dans Atlas a sa prochaine ouverture.`
      : "";
  }

  function resetForm() {
    clearRewrite();
    applyDraft({ type: elements.type.options[0]?.value });
    elements.type.value = elements.type.options[0]?.value || "";
    clearDraft();
    syncClassificationControls();
    renderStructuredFields();
    renderTagSuggestions();
    renderSaveButton();
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // Meme rendu que renderFactCheck() dans renderers.js.
  function renderFactCheck() {
    const entries = state.factCheck;
    elements.factCheck.classList.toggle("is-hidden", !entries.length);
    if (!entries.length) {
      elements.factCheck.innerHTML = "";
      return;
    }
    const lignes = entries
      .map(
        (entree) => `
          <li class="fact-check-entry">
            <p class="fact-check-claim">${escapeHtml(entree.claim)}</p>
            <p class="fact-check-issue">${escapeHtml(entree.issue)}</p>
          </li>
        `
      )
      .join("");
    elements.factCheck.innerHTML = `
      <div class="fact-check-head">
        <strong>${entries.length} point${entries.length > 1 ? "s" : ""} a verifier</strong>
        <button type="button" class="button button-ghost button-inline" data-dismiss-fact-check>
          Ignorer
        </button>
      </div>
      <ul class="fact-check-list">${lignes}</ul>
    `;
  }

  function renderAiButtons() {
    const label = elements.aiAssist.querySelector(".button-label");
    if (label) {
      label.textContent = state.aiBusy ? "Gemini en cours..." : "Reformuler";
    }
    elements.aiAssist.disabled = state.aiBusy;
    elements.aiUndo.classList.toggle("is-hidden", !state.rewriteBackup);
    elements.aiUndo.disabled = state.aiBusy || !state.rewriteBackup;
  }

  function clearRewrite() {
    state.rewriteBackup = null;
    state.factCheck = [];
    renderFactCheck();
    renderAiButtons();
  }

  /* ---------- actions ---------- */

  async function send() {
    if (!elements.title.value.trim() && !elements.content.value.trim()) {
      return;
    }

    const entry = buildEntry();
    // La file locale d'abord : si elle refuse l'ecriture, le texte reste a
    // l'ecran plutot que de risquer de le perdre.
    if (!saveOutbox([...loadOutbox(), entry])) {
      setStatus("Stockage local plein : page gardee a l'ecran.");
      return;
    }

    resetForm();
    renderPending();
    scrollToTitle();
    elements.title.focus({ preventScroll: true });

    setStatus("Envoi...");
    const { error } = await flush();
    setStatus(
      error
        ? `${error.message} Page gardee ici, reessai automatique.`
        : `« ${entry.note.title} » envoyee a Atlas.`
    );
  }

  /* ---------- reformulation ---------- */

  function loadAiConfig() {
    return AtlasApp.normalizeAiConfig(readJson(AtlasApp.config.aiStorageKey, {}));
  }

  // Le corps sans la ligne "# Titre", comme extractEditorBody() dans notes.js.
  function extractBody(content) {
    const lines = String(content || "").replace(/\r\n/g, "\n").split("\n");
    const headingIndex = lines.findIndex((line) => line.trim().length > 0);
    if (headingIndex >= 0 && lines[headingIndex].trimStart().startsWith("# ")) {
      lines.splice(headingIndex, 1);
      if (lines[headingIndex]?.trim() === "") {
        lines.splice(headingIndex, 1);
      }
    }
    return lines.join("\n").replace(/^\n+/, "");
  }

  async function rewrite() {
    if (state.aiBusy || !ai?.requestRewrite) {
      return;
    }
    if (!elements.title.value.trim() && !elements.content.value.trim()) {
      setStatus("Ecris d'abord quelque chose a reformuler.");
      return;
    }
    const config = loadAiConfig();
    if (!config.apiKey) {
      elements.geminiPanel.classList.remove("is-hidden");
      elements.geminiPanel.scrollIntoView({ block: "nearest" });
      elements.geminiKey.focus();
      setStatus("Cle Gemini manquante pour cette icone.");
      return;
    }

    const title = elements.title.value.trim() || "Sans titre";
    const backup = elements.content.value;
    state.aiBusy = true;
    renderAiButtons();
    renderSaveButton();
    setStatus("Gemini re-ecrit la note...");

    try {
      const { content, factCheck } = await ai.requestRewrite(
        {
          title,
          type: elements.type.value || "concept",
          metadata: collectMetadata(),
          content: backup,
        },
        config,
        (seconds) => setStatus(`Gemini re-ecrit la note... ${seconds} s`)
      );
      elements.content.value = extractBody(content);
      state.rewriteBackup = backup;
      state.factCheck = factCheck;
      saveDraft();
      setStatus(
        factCheck.length
          ? `Reecriture appliquee. ${factCheck.length} point${
              factCheck.length > 1 ? "s" : ""
            } a verifier.`
          : "Reecriture appliquee. Tu peux l'annuler si besoin."
      );
    } catch (error) {
      setStatus(error.message || "Gemini a rencontre un probleme.");
    } finally {
      state.aiBusy = false;
      renderFactCheck();
      renderAiButtons();
      renderSaveButton();
    }
  }

  function undoRewrite() {
    if (state.aiBusy || state.rewriteBackup === null) {
      return;
    }
    elements.content.value = state.rewriteBackup;
    // Les signalements portaient sur le texte reecrit : annuler celui-ci les
    // rend caducs.
    clearRewrite();
    saveDraft();
    renderSaveButton();
    setStatus("Reecriture annulee.");
  }

  function saveGeminiKey() {
    const apiKey = elements.geminiKey.value.trim();
    if (!apiKey) {
      elements.geminiKey.focus();
      return;
    }
    const config = AtlasApp.normalizeAiConfig({ ...loadAiConfig(), apiKey });
    if (!writeJson(AtlasApp.config.aiStorageKey, config)) {
      setStatus("Impossible d'enregistrer la cle sur cet appareil.");
      return;
    }
    elements.geminiKey.value = "";
    elements.geminiPanel.classList.add("is-hidden");
    rewrite();
  }

  function cancel() {
    const hasContent = elements.title.value.trim() || elements.content.value.trim();
    if (hasContent && !global.confirm("Effacer cette page ?")) {
      return;
    }
    resetForm();
    setStatus("");
    elements.title.focus({ preventScroll: true });
  }

  function bindEvents() {
    const onEdit = () => {
      saveDraft();
      renderSaveButton();
    };

    elements.title.addEventListener("input", onEdit);
    elements.content.addEventListener("input", onEdit);
    elements.favorite.addEventListener("change", onEdit);
    elements.parent.addEventListener("change", onEdit);
    elements.title.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        elements.content.focus();
      }
    });
    elements.content.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        send();
      }
    });

    elements.type.addEventListener("change", () => {
      syncClassificationControls();
      applyDailyDateIfEmpty();
      renderStructuredFields();
      saveDraft();
    });
    elements.directClassify.addEventListener("change", () => {
      syncClassificationControls();
      saveDraft();
    });
    elements.dateMode.addEventListener("change", () => {
      renderStructuredFields();
      saveDraft();
    });
    [elements.dateSingle, elements.dateStart, elements.dateEnd].forEach((input) => {
      input.addEventListener("input", saveDraft);
      // Meme regle que normalizeDateInputField() dans events.js.
      input.addEventListener("blur", () => {
        const normalized = normalizeFlexibleDateInput(input.value);
        input.value = normalized ? formatFlexibleDate(normalized) : "";
        saveDraft();
      });
    });

    elements.tags.addEventListener("input", () => {
      renderTagSuggestions();
      saveDraft();
    });
    elements.tags.addEventListener("blur", () => {
      global.setTimeout(renderTagSuggestions, 80);
    });
    elements.tagSuggestions.addEventListener("pointerdown", handleTagSuggestionClick);
    elements.tagSuggestions.addEventListener("click", handleTagSuggestionClick);

    elements.toolbar.addEventListener("pointerdown", (event) => {
      // Garde le clavier ouvert et la selection du texte intacte.
      if (event.target.closest("[data-format-action]")) {
        event.preventDefault();
      }
    });
    elements.toolbar.addEventListener("click", (event) => {
      const button = event.target.closest("[data-format-action]");
      if (button) {
        applyFormat(button.dataset.formatAction);
      }
    });

    elements.aiAssist.addEventListener("click", rewrite);
    elements.aiUndo.addEventListener("click", undoRewrite);
    elements.geminiSave.addEventListener("click", saveGeminiKey);
    elements.geminiKey.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        saveGeminiKey();
      }
    });
    elements.factCheck.addEventListener("click", (event) => {
      if (event.target.closest("[data-dismiss-fact-check]")) {
        state.factCheck = [];
        renderFactCheck();
      }
    });

    elements.save.addEventListener("click", send);
    elements.cancel.addEventListener("click", cancel);

    document.addEventListener("focusin", setWritingMode);
    document.addEventListener("focusout", () => global.setTimeout(setWritingMode, 0));
    global.visualViewport?.addEventListener("resize", syncViewport);
    global.visualViewport?.addEventListener("scroll", syncViewport);
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

  async function afterSignIn() {
    renderSession();
    const { sent, error } = await flush();
    if (sent) {
      setStatus(sent > 1 ? `${sent} pages en attente envoyees.` : "Page en attente envoyee.");
    } else if (error) {
      setStatus(`En attente : ${error.message}`);
    }
    refreshCatalog();
  }

  async function initDeferred() {
    state.auth =
      AtlasApp.createAuthModule?.({ elements: authElements, onSignedIn: afterSignIn }) || null;
    try {
      await state.auth?.restore();
    } catch (error) {
      // Session illisible : l'ecran de connexion prendra le relais.
    }
    state.auth?.bindEvents();
    if (state.auth?.isSignedIn()) {
      await afterSignIn();
    }
    registerServiceWorker();
  }

  function boot() {
    if (!elements.panel) {
      return;
    }

    // Tout ce qui est local d'abord : la page est complete et utilisable
    // avant la moindre requete.
    state.catalog = readJson(catalogKey, null);
    applyTheme();
    renderCatalog();
    applyDraft({ type: elements.type.value, ...readJson(draftKey, {}) });
    syncClassificationControls();
    renderStructuredFields();
    renderSaveButton();
    renderPending();
    bindEvents();
    scrollToTitle();
    elements.title.focus({ preventScroll: true });

    initDeferred();
  }

  AtlasApp.writePage = { buildTypeEntries, collectTags, buildCatalog, buildPayload };

  boot();
})(window);
