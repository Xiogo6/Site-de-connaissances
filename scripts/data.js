(function initializeDataModule(global) {
  const AtlasApp = (global.AtlasApp = global.AtlasApp || {});

  AtlasApp.createDataModule = function createDataModule(context) {
    const {
      appStorageKey,
      dataVersion,
      defaultKnowledge,
      noteTemplates,
      noteTypeLabels,
      reviewIntervalsInHours,
      snapshotStorageKey,
      storageKey,
      supabase,
    } = AtlasApp.config;

    const remoteConfig = {
      url: String(supabase?.url || "").trim(),
      publishableKey: String(supabase?.publishableKey || "").trim(),
      syncEnabled: Boolean(supabase?.syncEnabled),
    };

    let remoteSyncQueue = Promise.resolve();

    function getDefaultRemoteState() {
      return {
        enabled: isRemoteConfigured(),
        status: isRemoteConfigured() ? "idle" : "local",
        lastSyncedAt: null,
        lastError: "",
      };
    }

    function setRemoteState(patch = {}) {
      context.state.remote = {
        ...getDefaultRemoteState(),
        ...context.state.remote,
        ...patch,
      };
    }

    function isRemoteConfigured() {
      return (
        remoteConfig.syncEnabled &&
        Boolean(remoteConfig.url) &&
        Boolean(remoteConfig.publishableKey)
      );
    }

    function getRemoteHeaders() {
      return {
        apikey: remoteConfig.publishableKey,
        Authorization: `Bearer ${remoteConfig.publishableKey}`,
        "Content-Type": "application/json",
      };
    }

    async function callRemoteRpc(functionName, payload = {}) {
      const response = await fetch(`${remoteConfig.url}/rest/v1/rpc/${functionName}`, {
        method: "POST",
        headers: getRemoteHeaders(),
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Remote call failed: ${response.status}`);
      }

      const text = await response.text();
      return text ? JSON.parse(text) : null;
    }

    function getRemoteStatusLabel() {
      if (context.data.isReadOnlyMode()) {
        return "Snapshot publie";
      }

      if (!isRemoteConfigured()) {
        return "Espace local";
      }

      switch (context.state.remote.status) {
        case "loading":
          return "Connexion Supabase...";
        case "syncing":
          return "Synchronisation Supabase...";
        case "synced":
          return "Synchronise avec Supabase";
        case "error":
          return "Supabase indisponible";
        default:
          return "Espace relie a Supabase";
      }
    }

    function getSaveStatusLabel(isDraft = false) {
      if (isDraft) {
        return "Brouillon";
      }

      if (context.data.isReadOnlyMode()) {
        return "Lecture seule";
      }

      if (!isRemoteConfigured()) {
        return "Enregistre localement";
      }

      if (context.state.remote.status === "error") {
        return "Sauvegarde locale";
      }

      if (context.state.remote.status === "syncing") {
        return "Synchronisation...";
      }

      return "Synchronise";
    }

    function generateId(input, notes = context.state.notes) {
      const base =
        input
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "") || "page";

      let candidate = base;
      let index = 2;

      while (notes.some((note) => note.id === candidate)) {
        candidate = `${base}-${index}`;
        index += 1;
      }

      return candidate;
    }

    function createReviewState(review = {}) {
      return {
        streak: Number(review?.streak) || 0,
        lastReviewedAt: typeof review?.lastReviewedAt === "string" ? review.lastReviewedAt : null,
        nextReviewAt:
          typeof review?.nextReviewAt === "string"
            ? review.nextReviewAt
            : new Date().toISOString(),
      };
    }

    function normalizeImportedNote(note, existingNotes = context.state.notes) {
      const title =
        typeof note.title === "string" && note.title.trim() ? note.title.trim() : "Sans titre";

      return {
        id:
          typeof note.id === "string" && note.id.trim()
            ? note.id
            : generateId(title, existingNotes),
        title,
        type: typeof note.type === "string" && noteTypeLabels[note.type] ? note.type : "concept",
        parentId: typeof note.parentId === "string" && note.parentId.trim() ? note.parentId : null,
        favorite: Boolean(note.favorite),
        tags: Array.isArray(note.tags)
          ? note.tags.map(String).map((tag) => tag.trim()).filter(Boolean)
          : [],
        content: typeof note.content === "string" ? note.content : "",
        createdAt: typeof note.createdAt === "string" ? note.createdAt : new Date().toISOString(),
        updatedAt: typeof note.updatedAt === "string" ? note.updatedAt : new Date().toISOString(),
        review: createReviewState(note.review),
      };
    }

    function normalizeNoteCollection(rawNotes) {
      const normalized = [];
      rawNotes.forEach((note) => {
        normalized.push(normalizeImportedNote(note, normalized));
      });
      return normalized;
    }

    function normalizeSnapshot(rawSnapshot) {
      return {
        id:
          typeof rawSnapshot?.id === "string" && rawSnapshot.id.trim()
            ? rawSnapshot.id
            : `${Date.now()}`,
        label:
          typeof rawSnapshot?.label === "string" && rawSnapshot.label.trim()
            ? rawSnapshot.label.trim()
            : "Snapshot",
        createdAt:
          typeof rawSnapshot?.createdAt === "string"
            ? rawSnapshot.createdAt
            : new Date().toISOString(),
        noteCount: Number(rawSnapshot?.noteCount) || 0,
        notes: Array.isArray(rawSnapshot?.notes) ? normalizeNoteCollection(rawSnapshot.notes) : [],
      };
    }

    function normalizeSnapshotCollection(rawSnapshots) {
      return Array.isArray(rawSnapshots) ? rawSnapshots.map(normalizeSnapshot) : [];
    }

    function loadNotes() {
      try {
        const raw =
          window.localStorage.getItem(appStorageKey) || window.localStorage.getItem(storageKey);
        if (!raw) {
          return structuredClone(defaultKnowledge);
        }

        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed?.notes)) {
          return normalizeNoteCollection(parsed.notes);
        }

        return Array.isArray(parsed)
          ? normalizeNoteCollection(parsed)
          : structuredClone(defaultKnowledge);
      } catch (error) {
        return structuredClone(defaultKnowledge);
      }
    }

    function getDefaultSettings() {
      return {
        publishedUrl: "",
        lastPublishAt: null,
        templates: { ...noteTemplates },
        collapsedFolders: [],
      };
    }

    function normalizeTemplates(rawTemplates) {
      const templates = { ...noteTemplates };

      Object.keys(noteTemplates).forEach((type) => {
        if (typeof rawTemplates?.[type] === "string") {
          templates[type] = rawTemplates[type];
        }
      });

      return templates;
    }

    function normalizeSettings(rawSettings = {}) {
      return {
        ...getDefaultSettings(),
        publishedUrl:
          typeof rawSettings?.publishedUrl === "string" ? rawSettings.publishedUrl : "",
        lastPublishAt:
          typeof rawSettings?.lastPublishAt === "string" ? rawSettings.lastPublishAt : null,
        templates: normalizeTemplates(rawSettings?.templates),
        collapsedFolders: Array.isArray(rawSettings?.collapsedFolders)
          ? rawSettings.collapsedFolders.filter((value) => typeof value === "string")
          : [],
      };
    }

    function loadSettings() {
      try {
        const raw = window.localStorage.getItem(appStorageKey);
        if (!raw) {
          return getDefaultSettings();
        }

        const parsed = JSON.parse(raw);
        return normalizeSettings(parsed?.settings);
      } catch (error) {
        return getDefaultSettings();
      }
    }

    function loadSnapshots() {
      try {
        const raw = window.localStorage.getItem(snapshotStorageKey);
        if (!raw) {
          return [];
        }

        const parsed = JSON.parse(raw);
        return normalizeSnapshotCollection(parsed);
      } catch (error) {
        return [];
      }
    }

    function createRemotePayload({ includeSnapshots = false } = {}) {
      const payload = {
        settings: {
          siteName: document.title || "Atlas de Connaissance",
          publishedUrl: context.state.settings.publishedUrl,
          lastPublishAt: context.state.settings.lastPublishAt,
          templates: context.state.settings.templates || {},
          collapsedFolders: context.state.settings.collapsedFolders || [],
        },
        notes: context.state.notes.map((note) => ({
          id: note.id,
          title: note.title,
          type: note.type,
          parentId: note.parentId,
          favorite: Boolean(note.favorite),
          tags: [...note.tags],
          content: note.content,
          createdAt: note.createdAt,
          updatedAt: note.updatedAt,
          review: {
            streak: Number(note.review?.streak) || 0,
            lastReviewedAt: note.review?.lastReviewedAt || null,
            nextReviewAt: note.review?.nextReviewAt || null,
          },
        })),
      };

      if (includeSnapshots) {
        payload.snapshots = context.state.snapshots.map((snapshot) => ({
          id: snapshot.id,
          label: snapshot.label,
          createdAt: snapshot.createdAt,
          noteCount: snapshot.noteCount,
          notes: snapshot.notes,
        }));
      }

      return payload;
    }

    function saveNotes(options = {}) {
      const { skipRemote = false } = options;
      const payload = {
        version: dataVersion,
        updatedAt: new Date().toISOString(),
        settings: context.state.settings,
        notes: context.state.notes,
      };
      window.localStorage.setItem(appStorageKey, JSON.stringify(payload));
      window.localStorage.setItem(storageKey, JSON.stringify(context.state.notes));

      if (!skipRemote) {
        queueRemoteSync({ includeSnapshots: false });
      }
    }

    function saveSnapshots(options = {}) {
      const { skipRemote = false } = options;
      window.localStorage.setItem(snapshotStorageKey, JSON.stringify(context.state.snapshots));

      if (!skipRemote) {
        queueRemoteSync({ includeSnapshots: true });
      }
    }

    function getTemplates() {
      return context.state.settings.templates || noteTemplates;
    }

    function buildTemplateContent(type, title) {
      const template = getTemplates()[type] || noteTemplates[type] || noteTemplates.concept;
      return template.replaceAll("{{title}}", title || "Sans titre");
    }

    function getSourceMode() {
      const params = new URLSearchParams(window.location.search);
      return params.get("source") === "published" ? "published" : "workspace";
    }

    function isReadOnlyMode() {
      return context.state.sourceMode === "published";
    }

    function buildPublishedUrl() {
      if (context.state.settings.publishedUrl) {
        return context.state.settings.publishedUrl;
      }

      const url = new URL(window.location.href);
      url.searchParams.set("source", "published");
      return url.toString();
    }

    function downloadJsonFile(filename, payload) {
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
    }

    async function loadPublishedNotesIfNeeded() {
      const params = new URLSearchParams(window.location.search);
      const forcePublished = params.get("source") === "published";
      const hasLocalData = Boolean(window.localStorage.getItem(storageKey));

      if (hasLocalData && !forcePublished) {
        return;
      }

      try {
        const response = await fetch("./knowledge-base.json", { cache: "no-store" });
        if (!response.ok) {
          return;
        }

        const parsed = await response.json();
        if (!Array.isArray(parsed) || !parsed.length) {
          return;
        }

        context.state.notes = normalizeNoteCollection(parsed);
        if (!forcePublished) {
          saveNotes({ skipRemote: true });
        }
      } catch (error) {
        // Ignore if no published dataset is available.
      }
    }

    async function loadWorkspaceFromRemote() {
      if (isReadOnlyMode() || !isRemoteConfigured()) {
        return false;
      }

      setRemoteState({ status: "loading", lastError: "" });

      try {
        const payload = await callRemoteRpc("get_app_payload");
        const remoteNotes = normalizeNoteCollection(payload?.notes || []);
        const remoteSnapshots = normalizeSnapshotCollection(payload?.snapshots || []);
        const remoteSettings = normalizeSettings(payload?.settings || {});
        const hasRemoteData =
          remoteNotes.length > 0 ||
          remoteSnapshots.length > 0 ||
          Boolean(remoteSettings.publishedUrl) ||
          Boolean(remoteSettings.lastPublishAt);

        if (hasRemoteData) {
          context.state.notes = remoteNotes;
          context.state.settings = remoteSettings;
          context.state.snapshots = remoteSnapshots;
          saveNotes({ skipRemote: true });
          saveSnapshots({ skipRemote: true });
          setRemoteState({
            status: "synced",
            lastSyncedAt: new Date().toISOString(),
            lastError: "",
          });
          return true;
        }

        setRemoteState({
          status: "idle",
          lastError: "",
        });
        return false;
      } catch (error) {
        setRemoteState({
          status: "error",
          lastError: error.message || "Connexion impossible",
        });
        return false;
      }
    }

    function queueRemoteSync({ includeSnapshots = false } = {}) {
      if (isReadOnlyMode() || !isRemoteConfigured()) {
        return remoteSyncQueue;
      }

      const payload = createRemotePayload({ includeSnapshots });
      setRemoteState({ status: "syncing", lastError: "" });

      remoteSyncQueue = remoteSyncQueue
        .catch(() => {})
        .then(async () => {
          try {
            await callRemoteRpc("sync_app_payload", { payload });
            setRemoteState({
              status: "synced",
              lastSyncedAt: new Date().toISOString(),
              lastError: "",
            });
          } catch (error) {
            setRemoteState({
              status: "error",
              lastError: error.message || "Synchronisation impossible",
            });
          } finally {
            context.renderers?.renderWorkspaceBanner();
            context.renderers?.renderPublishCenter();
            context.renderers?.renderPreview();
          }
        });

      return remoteSyncQueue;
    }

    async function bootstrapWorkspace() {
      if (isReadOnlyMode()) {
        await loadPublishedNotesIfNeeded();
        setRemoteState({ status: "published" });
        return;
      }

      if (!isRemoteConfigured()) {
        setRemoteState({ status: "local" });
        return;
      }

      const loaded = await loadWorkspaceFromRemote();
      if (!loaded && context.state.notes.length) {
        queueRemoteSync({ includeSnapshots: true });
      }
    }

    function downloadPublishedSnapshot() {
      const payload = normalizeNoteCollection(context.state.notes);
      context.state.settings.lastPublishAt = new Date().toISOString();
      context.state.settings.publishedUrl = buildPublishedUrl();
      saveNotes();
      downloadJsonFile("knowledge-base.json", payload);
      context.renderers?.renderPublishCenter();
    }

    function downloadFullBackup() {
      const payload = {
        version: dataVersion,
        exportedAt: new Date().toISOString(),
        settings: context.state.settings,
        notes: context.state.notes,
        snapshots: context.state.snapshots,
      };
      downloadJsonFile("atlas-connaissance-backup.json", payload);
    }

    async function copyPublishedLink() {
      const url = buildPublishedUrl();
      context.state.settings.publishedUrl = url;
      saveNotes();

      try {
        await navigator.clipboard.writeText(url);
        context.elements.publishStatusCopy.textContent =
          "Lien publie copie dans le presse-papiers.";
      } catch (error) {
        context.elements.publishStatusCopy.textContent = `Lien publie: ${url}`;
      }
    }

    function saveManualSnapshot() {
      if (isReadOnlyMode()) {
        return;
      }

      saveAutomaticSnapshot("Snapshot manuel");
      context.renderers?.renderPublishCenter();
    }

    function saveAutomaticSnapshot(label) {
      const now = new Date().toISOString();
      const snapshot = {
        id: `${Date.now()}`,
        label,
        createdAt: now,
        noteCount: context.state.notes.length,
        notes: normalizeNoteCollection(context.state.notes),
      };
      context.state.snapshots.unshift(snapshot);
      context.state.snapshots = context.state.snapshots.slice(0, 12);
      saveSnapshots();
    }

    function restoreLatestSnapshot() {
      if (!context.state.snapshots.length || isReadOnlyMode()) {
        return;
      }

      restoreSnapshotById(context.state.snapshots[0].id);
    }

    function restoreSnapshotById(snapshotId) {
      if (isReadOnlyMode()) {
        return;
      }

      const snapshot = context.state.snapshots.find((item) => item.id === snapshotId);
      if (!snapshot) {
        return;
      }

      context.state.notes = normalizeNoteCollection(snapshot.notes);
      context.state.activeNoteId = context.state.notes[0]?.id ?? null;
      saveNotes();
      context.renderers?.renderEverything();
    }

    function updateReviewState(noteId, isCorrect) {
      const note = context.state.notes.find((candidate) => candidate.id === noteId);
      if (!note) {
        return;
      }

      const review = createReviewState(note.review);
      const now = new Date();

      if (isCorrect) {
        review.streak = Math.min(review.streak + 1, reviewIntervalsInHours.length - 1);
      } else {
        review.streak = 0;
      }

      review.lastReviewedAt = now.toISOString();
      review.nextReviewAt = new Date(
        now.getTime() + reviewIntervalsInHours[review.streak] * 60 * 60 * 1000
      ).toISOString();
      note.review = review;
      note.updatedAt = now.toISOString();
    }

    function registerServiceWorker() {
      if (!("serviceWorker" in navigator)) {
        return;
      }

      const protocol = window.location.protocol;
      if (
        protocol !== "https:" &&
        protocol !== "http:" &&
        !window.location.hostname.includes("localhost")
      ) {
        return;
      }

      window.addEventListener("load", () => {
        navigator.serviceWorker.register("./service-worker.js").catch(() => {});
      });
    }

    return {
      bootstrapWorkspace,
      buildPublishedUrl,
      buildTemplateContent,
      copyPublishedLink,
      createReviewState,
      dataVersion,
      downloadFullBackup,
      downloadJsonFile,
      downloadPublishedSnapshot,
      generateId,
      getDefaultRemoteState,
      getDefaultSettings,
      getRemoteStatusLabel,
      getSaveStatusLabel,
      getSourceMode,
      getTemplates,
      isReadOnlyMode,
      isRemoteConfigured,
      loadNotes,
      loadPublishedNotesIfNeeded,
      loadSettings,
      loadSnapshots,
      normalizeImportedNote,
      normalizeNoteCollection,
      normalizeSettings,
      normalizeSnapshot,
      normalizeSnapshotCollection,
      normalizeTemplates,
      queueRemoteSync,
      registerServiceWorker,
      restoreLatestSnapshot,
      restoreSnapshotById,
      saveAutomaticSnapshot,
      saveManualSnapshot,
      saveNotes,
      saveSnapshots,
      setRemoteState,
      updateReviewState,
    };
  };
})(window);
