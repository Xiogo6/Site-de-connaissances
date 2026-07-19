(function initializeDataModule(global) {
  const AtlasApp = (global.AtlasApp = global.AtlasApp || {});

  AtlasApp.createDataModule = function createDataModule(context) {
    const { decodeHtmlEntities, normalizeFlexibleDateInput, normalizeTagList } = AtlasApp.helpers;
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
      themePresetStorageKey,
      themePresets,
      themeStorageKey,
    } = AtlasApp.config;

    const remoteConfig = {
      url: String(supabase?.url || "").trim(),
      publishableKey: String(supabase?.publishableKey || "").trim(),
      syncEnabled: Boolean(supabase?.syncEnabled),
    };

    let remoteSyncQueue = Promise.resolve();
    let syncBannerTimer = null;
    let dailySnapshotTimer = null;
    const dailySnapshotHour = 3;
    const dailySnapshotRetentionCount = 30;
    const dayInMs = 24 * 60 * 60 * 1000;

    function getDefaultRemoteState() {
      return {
        enabled: isRemoteConfigured(),
        status: isRemoteConfigured() ? "idle" : "local",
        lastSyncedAt: null,
        lastError: "",
        showSyncWarning: false,
      };
    }

    function clearSyncBannerTimer() {
      if (syncBannerTimer) {
        window.clearTimeout(syncBannerTimer);
        syncBannerTimer = null;
      }
    }

    function scheduleSyncBannerTimer() {
      clearSyncBannerTimer();
      syncBannerTimer = window.setTimeout(() => {
        syncBannerTimer = null;
        if (context.state.remote?.status !== "syncing") {
          return;
        }

        context.state.remote = {
          ...context.state.remote,
          showSyncWarning: true,
        };
        context.renderers?.renderWorkspaceBanner();
      }, 3000);
    }

    function setRemoteState(patch = {}) {
      context.state.remote = {
        ...getDefaultRemoteState(),
        ...context.state.remote,
        ...patch,
      };

      if (context.state.remote.status === "syncing") {
        if (patch.status === "syncing") {
          context.state.remote.showSyncWarning = false;
          scheduleSyncBannerTimer();
        }
      } else {
        context.state.remote.showSyncWarning = false;
        clearSyncBannerTimer();
      }
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
      const deletedIds = new Set(
        (context.state.settings?.deletedNotes || []).map((deletion) => deletion.id)
      );

      while (notes.some((note) => note.id === candidate) || deletedIds.has(candidate)) {
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

    function createQuizQuestionStats(stats = {}) {
      return {
        asked: Number(stats?.asked) || 0,
        correct: Number(stats?.correct) || 0,
        lastAskedAt: typeof stats?.lastAskedAt === "string" ? stats.lastAskedAt : null,
        lastCorrectAt: typeof stats?.lastCorrectAt === "string" ? stats.lastCorrectAt : null,
        updatedAt: typeof stats?.updatedAt === "string" ? stats.updatedAt : null,
      };
    }

    function getLatestIsoTimestamp(firstValue, secondValue) {
      const firstTimestamp = Date.parse(firstValue || "");
      const secondTimestamp = Date.parse(secondValue || "");

      if (Number.isNaN(firstTimestamp)) {
        return Number.isNaN(secondTimestamp) ? null : secondValue;
      }

      return Number.isNaN(secondTimestamp) || firstTimestamp >= secondTimestamp
        ? firstValue
        : secondValue;
    }

    function mergeQuizQuestionStats(primaryStats = {}, fallbackStats = {}) {
      const primary = createQuizQuestionStats(primaryStats);
      const fallback = createQuizQuestionStats(fallbackStats);
      const primaryTimestamp = Date.parse(primary.updatedAt || primary.lastAskedAt || "");
      const fallbackTimestamp = Date.parse(fallback.updatedAt || fallback.lastAskedAt || "");

      if (!Number.isNaN(primaryTimestamp) && primaryTimestamp !== fallbackTimestamp) {
        return primaryTimestamp > fallbackTimestamp ? primary : fallback;
      }

      if (!Number.isNaN(fallbackTimestamp) && Number.isNaN(primaryTimestamp)) {
        return fallback;
      }

      const asked = Math.max(primary.asked, fallback.asked);

      return {
        asked,
        correct: Math.min(asked, Math.max(primary.correct, fallback.correct)),
        lastAskedAt: getLatestIsoTimestamp(primary.lastAskedAt, fallback.lastAskedAt),
        lastCorrectAt: getLatestIsoTimestamp(primary.lastCorrectAt, fallback.lastCorrectAt),
        updatedAt: getLatestIsoTimestamp(primary.updatedAt, fallback.updatedAt),
      };
    }

    function getQuizQuestionMatchKey(question) {
      return String(question?.question || "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ");
    }

    function normalizeQuizQuestionAnswers(value) {
      const raw = Array.isArray(value)
        ? value.flatMap((item) => String(item || "").split(","))
        : String(value || "").split(",");

      const seen = new Set();
      return raw
        .map((answer) => answer.trim())
        .filter(Boolean)
        .filter((answer) => {
          const normalized = answer.toLowerCase();
          if (seen.has(normalized)) {
            return false;
          }
          seen.add(normalized);
          return true;
        });
    }

    function normalizeQuizQuestionCollection(rawQuestions, noteId = "note") {
      const seen = new Set();
      return Array.isArray(rawQuestions)
        ? rawQuestions
            .map((item, index) => {
              const question = typeof item?.question === "string" ? item.question.trim() : "";
              const answers = normalizeQuizQuestionAnswers(
                item?.answers ?? item?.answer ?? item?.responses ?? item?.response
              );
              if (!question || !answers.length) {
                return null;
              }

              let id =
                typeof item?.id === "string" && item.id.trim()
                  ? item.id.trim()
                  : `${noteId}-question-${index + 1}`;
              let suffix = 2;
              while (seen.has(id)) {
                id = `${noteId}-question-${index + 1}-${suffix}`;
                suffix += 1;
              }
              seen.add(id);

              return {
                id,
                question,
                answers,
                stats: createQuizQuestionStats(item?.stats),
              };
            })
            .filter(Boolean)
        : [];
    }

    function mergeQuizQuestionCollectionStats(primaryQuestions, fallbackQuestions, noteId = "note") {
      const primary = normalizeQuizQuestionCollection(primaryQuestions, noteId);
      const fallback = normalizeQuizQuestionCollection(fallbackQuestions, noteId);
      const fallbackById = new Map(fallback.map((question) => [question.id, question]));
      const fallbackByText = new Map(
        fallback.map((question) => [getQuizQuestionMatchKey(question), question])
      );

      return primary.map((question) => {
        const fallbackQuestion =
          fallbackById.get(question.id) || fallbackByText.get(getQuizQuestionMatchKey(question));

        return fallbackQuestion
          ? {
              ...question,
              stats: mergeQuizQuestionStats(question.stats, fallbackQuestion.stats),
            }
          : question;
      });
    }

    function getDefaultMetadata() {
      return {
        hasDate: false,
        dateMode: "reference",
        singleDate: "",
        startDate: "",
        endDate: "",
      };
    }

    function normalizeMetadata(metadata = {}) {
      const legacyConceptDate =
        typeof metadata?.conceptDate === "string" ? metadata.conceptDate : "";
      const legacyEventMode = metadata?.eventDateMode === "range" ? "range" : "reference";
      const legacyEventDate = typeof metadata?.eventDate === "string" ? metadata.eventDate : "";
      const legacyEventStartDate =
        typeof metadata?.eventStartDate === "string" ? metadata.eventStartDate : "";
      const legacyEventEndDate =
        typeof metadata?.eventEndDate === "string" ? metadata.eventEndDate : "";
      const legacyBirthDate =
        typeof metadata?.personBirthDate === "string" ? metadata.personBirthDate : "";
      const legacyDeathDate =
        typeof metadata?.personDeathDate === "string" ? metadata.personDeathDate : "";

      const hasLegacyRange = Boolean(legacyEventStartDate || legacyEventEndDate);
      const hasLegacySingle = Boolean(legacyConceptDate || legacyEventDate || legacyBirthDate || legacyDeathDate);
      const legacySingleDate = legacyConceptDate || legacyEventDate || legacyBirthDate || legacyDeathDate;
      const legacyMode = hasLegacyRange
        ? "range"
        : legacyBirthDate || legacyDeathDate
          ? "life"
          : legacyEventDate
              ? legacyEventMode
              : legacyConceptDate
                ? "reference"
                : "reference";

      return {
        ...getDefaultMetadata(),
        hasDate:
          typeof metadata?.hasDate === "boolean"
            ? metadata.hasDate
            : hasLegacyRange || hasLegacySingle,
        dateMode:
          typeof metadata?.dateMode === "string" &&
          ["reference", "life", "range"].includes(metadata.dateMode)
            ? metadata.dateMode
            : legacyMode,
        singleDate:
          typeof metadata?.singleDate === "string"
            ? normalizeFlexibleDateInput(metadata.singleDate)
            : normalizeFlexibleDateInput(legacySingleDate),
        startDate:
          typeof metadata?.startDate === "string"
            ? normalizeFlexibleDateInput(metadata.startDate)
            : normalizeFlexibleDateInput(legacyEventStartDate),
        endDate:
          typeof metadata?.endDate === "string"
            ? normalizeFlexibleDateInput(metadata.endDate)
            : normalizeFlexibleDateInput(legacyEventEndDate),
      };
    }

    function normalizeImportedNote(note, existingNotes = context.state.notes) {
      const title =
        typeof note.title === "string" && note.title.trim()
          ? decodeHtmlEntities(note.title.trim())
          : "Sans titre";
      const content =
        typeof note.content === "string" ? decodeHtmlEntities(note.content) : "";

      return {
        id:
          typeof note.id === "string" && note.id.trim()
            ? note.id
            : generateId(title, existingNotes),
        title,
        type: typeof note.type === "string" && note.type.trim() ? note.type.trim() : "concept",
        parentId: typeof note.parentId === "string" && note.parentId.trim() ? note.parentId : null,
        favorite: Boolean(note.favorite),
        tags: Array.isArray(note.tags) ? normalizeTagList(note.tags.map(String)) : [],
        content,
        quizQuestions: normalizeQuizQuestionCollection(note.quizQuestions, note.id),
        createdAt: typeof note.createdAt === "string" ? note.createdAt : new Date().toISOString(),
        updatedAt: typeof note.updatedAt === "string" ? note.updatedAt : new Date().toISOString(),
        metadata: normalizeMetadata(note.metadata),
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

    function mergeNoteCollectionQuizStats(primaryNotes, fallbackNotes) {
      const fallbackById = new Map(fallbackNotes.map((note) => [note.id, note]));
      const primaryIds = new Set(primaryNotes.map((note) => note.id));

      const mergedNotes = primaryNotes.map((note) => {
        const fallbackNote = fallbackById.get(note.id);
        if (!fallbackNote) {
          return note;
        }

        const primaryTimestamp = Date.parse(note.updatedAt || note.createdAt || "") || 0;
        const fallbackTimestamp =
          Date.parse(fallbackNote.updatedAt || fallbackNote.createdAt || "") || 0;
        const newestNote = fallbackTimestamp > primaryTimestamp ? fallbackNote : note;
        const olderNote = newestNote === note ? fallbackNote : note;

        return {
          ...newestNote,
          quizQuestions: mergeQuizQuestionCollectionStats(
            newestNote.quizQuestions,
            olderNote.quizQuestions,
            newestNote.id
          ),
        };
      });

      fallbackNotes.forEach((note) => {
        if (!primaryIds.has(note.id)) {
          mergedNotes.push(note);
        }
      });

      return mergedNotes;
    }

    function mergeSnapshotCollections(primarySnapshots, fallbackSnapshots) {
      const snapshotsById = new Map();
      [...fallbackSnapshots, ...primarySnapshots].forEach((snapshot) => {
        const existing = snapshotsById.get(snapshot.id);
        const existingTimestamp = Date.parse(existing?.createdAt || "") || 0;
        const snapshotTimestamp = Date.parse(snapshot.createdAt || "") || 0;
        if (!existing || snapshotTimestamp >= existingTimestamp) {
          snapshotsById.set(snapshot.id, snapshot);
        }
      });
      return normalizeSnapshotCollection([...snapshotsById.values()]);
    }

    function normalizeDeletedNotes(rawDeletedNotes = []) {
      const deletionsById = new Map();
      (Array.isArray(rawDeletedNotes) ? rawDeletedNotes : []).forEach((deletion) => {
        const id = typeof deletion === "string" ? deletion.trim() : deletion?.id?.trim();
        if (!id) {
          return;
        }
        const deletedAt =
          typeof deletion?.deletedAt === "string"
            ? deletion.deletedAt
            : new Date().toISOString();
        const existing = deletionsById.get(id);
        if (
          !existing ||
          (Date.parse(deletedAt) || 0) > (Date.parse(existing.deletedAt) || 0)
        ) {
          deletionsById.set(id, { id, deletedAt });
        }
      });
      return [...deletionsById.values()];
    }

    function mergeDeletedNotes(primaryDeletedNotes, fallbackDeletedNotes) {
      return normalizeDeletedNotes([
        ...normalizeDeletedNotes(fallbackDeletedNotes),
        ...normalizeDeletedNotes(primaryDeletedNotes),
      ]);
    }

    function filterDeletedNotes(notes, deletedNotes) {
      const deletionsById = new Map(
        normalizeDeletedNotes(deletedNotes).map((deletion) => [deletion.id, deletion])
      );
      return notes.filter((note) => {
        const deletion = deletionsById.get(note.id);
        if (!deletion) {
          return true;
        }
        const noteTimestamp = Date.parse(note.updatedAt || note.createdAt || "") || 0;
        const deletionTimestamp = Date.parse(deletion.deletedAt || "") || 0;
        return noteTimestamp > deletionTimestamp;
      });
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
      return Array.isArray(rawSnapshots)
        ? rawSnapshots
            .map(normalizeSnapshot)
            .sort((first, second) => Date.parse(second.createdAt) - Date.parse(first.createdAt))
        : [];
    }

    function getDailySnapshotSlotStart(date = new Date()) {
      const slotStart = new Date(date);
      slotStart.setHours(dailySnapshotHour, 0, 0, 0);

      if (date < slotStart) {
        slotStart.setDate(slotStart.getDate() - 1);
      }

      return slotStart;
    }

    function getNextDailySnapshotAt(date = new Date()) {
      const nextSnapshotAt = new Date(date);
      nextSnapshotAt.setHours(dailySnapshotHour, 0, 0, 0);

      if (date >= nextSnapshotAt) {
        nextSnapshotAt.setDate(nextSnapshotAt.getDate() + 1);
      }

      return nextSnapshotAt;
    }

    function pruneExpiredSnapshots() {
      const previousLength = context.state.snapshots.length;
      context.state.snapshots = normalizeSnapshotCollection(context.state.snapshots).slice(
        0,
        dailySnapshotRetentionCount
      );
      return context.state.snapshots.length !== previousLength;
    }

    function hasSnapshotForCurrentSlot(date = new Date()) {
      const slotStart = getDailySnapshotSlotStart(date).getTime();
      const slotEnd = slotStart + dayInMs;

      return context.state.snapshots.some((snapshot) => {
        const createdAt = Date.parse(snapshot.createdAt);
        return !Number.isNaN(createdAt) && createdAt >= slotStart && createdAt < slotEnd;
      });
    }

    function getLatestNoteTimestamp(notes = []) {
      return notes.reduce((latest, note) => {
        const updatedAt = Date.parse(note.updatedAt || note.createdAt || "");
        return Number.isNaN(updatedAt) ? latest : Math.max(latest, updatedAt);
      }, 0);
    }

    function hasStoredWorkspaceData() {
      return Boolean(
        window.localStorage.getItem(appStorageKey) || window.localStorage.getItem(storageKey)
      );
    }

    function loadNotes() {
      try {
        const raw =
          window.localStorage.getItem(appStorageKey) || window.localStorage.getItem(storageKey);
        if (!raw) {
          return [];
        }

        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed?.notes)) {
          return normalizeNoteCollection(parsed.notes);
        }

        return Array.isArray(parsed) ? normalizeNoteCollection(parsed) : [];
      } catch (error) {
        return [];
      }
    }

    function shouldSeedDefaultKnowledge() {
      return !isReadOnlyMode() && !isRemoteConfigured() && !hasStoredWorkspaceData();
    }

    function getDefaultSettings() {
      return {
        publishedUrl: "",
        lastPublishAt: null,
        theme: "dark",
        themePreset: "classic-dark",
        typeLabels: {},
        customNoteTypes: [],
        deletedNoteTypes: [],
        deletedNotes: [],
        templates: {},
        collapsedFolders: [],
        lastEditedNoteId: null,
        quizPlayerStats: {
          sessions: [],
        },
        sport: {
          massEntries: [],
          performanceEntries: [],
          lastSavedAt: null,
        },
      };
    }

    function normalizeThemePreset(rawPreset, rawTheme) {
      if (typeof rawPreset === "string" && themePresets?.[rawPreset]) {
        return rawPreset;
      }

      return rawTheme === "light" ? "classic-light" : "classic-dark";
    }

    function getStoredThemePreference(fallbackSettings = {}) {
      let storedPreset = "";
      let storedTheme = "";

      try {
        storedPreset = window.localStorage.getItem(themePresetStorageKey) || "";
        storedTheme = window.localStorage.getItem(themeStorageKey) || "";
      } catch (error) {
        // Fall back to the workspace settings when storage is unavailable.
      }

      const fallbackPreset = normalizeThemePreset(
        fallbackSettings?.themePreset,
        fallbackSettings?.theme
      );
      const themePreset = themePresets?.[storedPreset]
        ? storedPreset
        : storedTheme === "light" || storedTheme === "dark"
          ? normalizeThemePreset("", storedTheme)
          : fallbackPreset;

      return {
        themePreset,
        theme: themePresets?.[themePreset]?.mode === "light" ? "light" : "dark",
      };
    }

    function applyStoredThemePreference(settings = {}) {
      return {
        ...settings,
        ...getStoredThemePreference(settings),
      };
    }

    function saveThemePreference(presetId) {
      const themePreset = normalizeThemePreset(presetId, context.state.settings?.theme);
      const theme = themePresets?.[themePreset]?.mode === "light" ? "light" : "dark";

      context.state.settings.themePreset = themePreset;
      context.state.settings.theme = theme;
      window.localStorage.setItem(themePresetStorageKey, themePreset);
      window.localStorage.setItem(themeStorageKey, theme);
    }

    function normalizeSportEntry(entry = {}, fields = []) {
      return fields.reduce((result, field) => {
        const value = entry?.[field];
        result[field] = typeof value === "boolean" ? value : typeof value === "string" ? value : "";
        return result;
      }, {});
    }

    function normalizeSportSettings(rawSport = {}) {
      return {
        massEntries: Array.isArray(rawSport?.massEntries)
          ? rawSport.massEntries.map((entry) =>
              normalizeSportEntry(entry, ["date", "mass", "fasted"])
            )
          : [],
        performanceEntries: Array.isArray(rawSport?.performanceEntries)
          ? rawSport.performanceEntries.map((entry) =>
              normalizeSportEntry(entry, [
                "date",
                "exercise",
                "sets",
                "reps",
                "weight",
                "rest",
              ])
            )
          : [],
        lastSavedAt: typeof rawSport?.lastSavedAt === "string" ? rawSport.lastSavedAt : null,
      };
    }

    function normalizeQuizPlayerStats(rawStats = {}) {
      const sessions = Array.isArray(rawStats?.sessions)
        ? rawStats.sessions
            .map((session) => ({
              id:
                typeof session?.id === "string" && session.id.trim()
                  ? session.id.trim()
                  : `quiz-${Date.now()}`,
              startedAt: typeof session?.startedAt === "string" ? session.startedAt : null,
              finishedAt: typeof session?.finishedAt === "string" ? session.finishedAt : null,
              durationSeconds: Math.max(0, Math.round(Number(session?.durationSeconds) || 0)),
              total: Math.max(0, Math.round(Number(session?.total) || 0)),
              correct: Math.max(0, Math.round(Number(session?.correct) || 0)),
              averageAnswerSeconds: Math.max(
                0,
                Number(session?.averageAnswerSeconds) || 0
              ),
              updatedAt:
                typeof session?.updatedAt === "string"
                  ? session.updatedAt
                  : typeof session?.finishedAt === "string"
                    ? session.finishedAt
                    : null,
              scope: typeof session?.scope === "string" ? session.scope : "all",
              focus: typeof session?.focus === "string" ? session.focus : "mixed",
            }))
            .filter((session) => session.total > 0)
        : [];

      return {
        sessions: sessions
          .sort(
            (left, right) =>
              (Date.parse(right.finishedAt || "") || 0) -
              (Date.parse(left.finishedAt || "") || 0)
          )
          .slice(0, 120),
      };
    }

    function mergeSettingsQuizHistory(primarySettings, fallbackSettings) {
      const sessionsById = new Map();
      const fallbackSessions = fallbackSettings?.quizPlayerStats?.sessions || [];
      const primarySessions = primarySettings?.quizPlayerStats?.sessions || [];

      [...fallbackSessions, ...primarySessions].forEach((session) => {
        if (typeof session?.id === "string" && session.id.trim()) {
          const existing = sessionsById.get(session.id);
          const existingTimestamp = Date.parse(
            existing?.updatedAt || existing?.finishedAt || ""
          );
          const sessionTimestamp = Date.parse(session.updatedAt || session.finishedAt || "");

          if (
            !existing ||
            Number.isNaN(existingTimestamp) ||
            (!Number.isNaN(sessionTimestamp) && sessionTimestamp >= existingTimestamp)
          ) {
            sessionsById.set(session.id, session);
          }
        }
      });

      return applyStoredThemePreference({
        ...primarySettings,
        deletedNotes: mergeDeletedNotes(
          primarySettings?.deletedNotes,
          fallbackSettings?.deletedNotes
        ),
        quizPlayerStats: normalizeQuizPlayerStats({
          sessions: [...sessionsById.values()],
        }),
      });
    }

    function normalizeTemplates(rawTemplates) {
      const templates = { ...noteTemplates };

      Object.entries(rawTemplates || {}).forEach(([type, value]) => {
        if (typeof value === "string") {
          templates[type] = value;
        }
      });

      return templates;
    }

    function normalizeTypeLabels(rawTypeLabels = {}) {
      return Object.entries(rawTypeLabels).reduce((result, [type, label]) => {
        if (typeof label === "string" && label.trim()) {
          result[type] = label.trim();
        }
        return result;
      }, {});
    }

    function normalizeCustomNoteTypes(rawCustomNoteTypes = []) {
      const reserved = new Set(Object.keys(noteTypeLabels));
      const seen = new Set();

      return Array.isArray(rawCustomNoteTypes)
        ? rawCustomNoteTypes
            .map((item) => {
              const rawId = typeof item?.id === "string" ? item.id.trim() : "";
              const label = typeof item?.label === "string" ? item.label.trim() : "";
              const id =
                rawId
                  .toLowerCase()
                  .normalize("NFD")
                  .replace(/[\u0300-\u036f]/g, "")
                  .replace(/[^a-z0-9]+/g, "-")
                  .replace(/(^-|-$)/g, "") || "";

              if (!label || !id || reserved.has(id) || seen.has(id)) {
                return null;
              }

              seen.add(id);
              return { id, label };
            })
            .filter(Boolean)
        : [];
    }

    function normalizeSettings(rawSettings = {}) {
      const themePreset = normalizeThemePreset(rawSettings?.themePreset, rawSettings?.theme);
      const theme = themePresets?.[themePreset]?.mode === "light" ? "light" : "dark";

      return {
        ...getDefaultSettings(),
        publishedUrl:
          typeof rawSettings?.publishedUrl === "string" ? rawSettings.publishedUrl : "",
        lastPublishAt:
          typeof rawSettings?.lastPublishAt === "string" ? rawSettings.lastPublishAt : null,
        theme,
        themePreset,
        typeLabels: normalizeTypeLabels(rawSettings?.typeLabels),
        customNoteTypes: normalizeCustomNoteTypes(rawSettings?.customNoteTypes),
        deletedNoteTypes: Array.isArray(rawSettings?.deletedNoteTypes)
          ? rawSettings.deletedNoteTypes.filter((value) => typeof value === "string")
          : [],
        deletedNotes: normalizeDeletedNotes(rawSettings?.deletedNotes),
        templates: normalizeTemplates(rawSettings?.templates),
        collapsedFolders: Array.isArray(rawSettings?.collapsedFolders)
          ? rawSettings.collapsedFolders.filter((value) => typeof value === "string")
          : [],
        lastEditedNoteId:
          typeof rawSettings?.lastEditedNoteId === "string" ? rawSettings.lastEditedNoteId : null,
        quizPlayerStats: normalizeQuizPlayerStats(rawSettings?.quizPlayerStats),
        sport: normalizeSportSettings(rawSettings?.sport),
      };
    }

    function loadSettings() {
      try {
        const raw = window.localStorage.getItem(appStorageKey);
        if (!raw) {
          return applyStoredThemePreference(getDefaultSettings());
        }

        const parsed = JSON.parse(raw);
        return applyStoredThemePreference(normalizeSettings(parsed?.settings));
      } catch (error) {
        return applyStoredThemePreference(getDefaultSettings());
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
          theme: context.state.settings.theme || "light",
          themePreset: context.state.settings.themePreset || "classic-dark",
          typeLabels: context.state.settings.typeLabels || {},
          customNoteTypes: context.state.settings.customNoteTypes || [],
          deletedNoteTypes: context.state.settings.deletedNoteTypes || [],
          deletedNotes: normalizeDeletedNotes(context.state.settings.deletedNotes),
          templates: context.state.settings.templates || {},
          collapsedFolders: context.state.settings.collapsedFolders || [],
          lastEditedNoteId: context.state.settings.lastEditedNoteId || null,
          quizPlayerStats: normalizeQuizPlayerStats(context.state.settings.quizPlayerStats),
          sport: context.state.settings.sport || { massEntries: [], performanceEntries: [] },
        },
        notes: context.state.notes.map((note) => ({
          id: note.id,
          title: note.title,
          type: note.type,
          parentId: note.parentId,
          favorite: Boolean(note.favorite),
          tags: [...note.tags],
          content: note.content,
          quizQuestions: normalizeQuizQuestionCollection(note.quizQuestions, note.id),
          metadata: normalizeMetadata(note.metadata),
          createdAt: note.createdAt,
          updatedAt: note.updatedAt,
          review: {
            streak: Number(note.review?.streak) || 0,
            lastReviewedAt: note.review?.lastReviewedAt || null,
            nextReviewAt: note.review?.nextReviewAt || null,
          },
        })),
        deletedNotes: normalizeDeletedNotes(context.state.settings.deletedNotes),
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
      const didPrune = pruneExpiredSnapshots();
      window.localStorage.setItem(snapshotStorageKey, JSON.stringify(context.state.snapshots));

      if (!skipRemote) {
        queueRemoteSync({ includeSnapshots: true });
      }

      return didPrune;
    }

    function getTemplates() {
      return context.state.settings.templates || noteTemplates;
    }

    function getNoteTypeLabels() {
      const deletedTypes = new Set(context.state.settings.deletedNoteTypes || []);
      const builtins = Object.fromEntries(
        Object.entries(noteTypeLabels)
          .filter(([type]) => !deletedTypes.has(type))
          .map(([type, label]) => [
            type,
            context.state.settings.typeLabels?.[type] || label,
          ])
      );

      const custom = Object.fromEntries(
        (context.state.settings.customNoteTypes || [])
          .filter((item) => !deletedTypes.has(item.id))
          .map((item) => [item.id, item.label])
      );

      return {
        ...builtins,
        ...custom,
      };
    }

    function getNoteTypeEntries() {
      const labels = getNoteTypeLabels();
      const customIds = new Set((context.state.settings.customNoteTypes || []).map((item) => item.id));
      return Object.keys(labels).map((type) => ({
        id: type,
        label: labels[type],
        isCustom: customIds.has(type),
      }));
    }

    function getDefaultTemplateForType(type) {
      if (noteTemplates[type]) {
        return noteTemplates[type];
      }

      const label = getNoteTypeLabels()[type] || "Page";
      return `# {{title}}

## ${label}

- Idee principale :
- Contenu :
- Liens utiles :
`;
    }

    function buildTemplateContent(type, title) {
      const template = getTemplates()[type] || getDefaultTemplateForType(type) || noteTemplates.concept;
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

    function formatCsvCell(value) {
      if (value === null || typeof value === "undefined") {
        return "";
      }

      const normalized =
        typeof value === "string" ? value : JSON.stringify(value);
      return `"${String(normalized).replace(/"/g, '""')}"`;
    }

    function downloadCsvFile(filename, headers, rows) {
      const separator = ";";
      const csv = [
        headers.map(formatCsvCell).join(separator),
        ...rows.map((row) => headers.map((header) => formatCsvCell(row[header])).join(separator)),
      ].join("\r\n");
      const blob = new Blob([`\ufeff${csv}`], {
        type: "text/csv;charset=utf-8",
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
        let remoteDeletedNotes = [];
        try {
          remoteDeletedNotes = normalizeDeletedNotes(await callRemoteRpc("get_note_deletions"));
        } catch (error) {
          // The deletion log is unavailable until the safety migration is deployed.
        }
        remoteSettings.deletedNotes = remoteDeletedNotes;
        const hasRemoteData =
          remoteNotes.length > 0 ||
          remoteSnapshots.length > 0 ||
          remoteDeletedNotes.length > 0 ||
          Boolean(remoteSettings.publishedUrl) ||
          Boolean(remoteSettings.lastPublishAt);

        if (hasRemoteData) {
          const localNotes = context.state.notes;
          const localSettings = context.state.settings;
          context.state.settings = mergeSettingsQuizHistory(remoteSettings, localSettings);
          context.state.notes = filterDeletedNotes(
            mergeNoteCollectionQuizStats(remoteNotes, localNotes),
            context.state.settings.deletedNotes
          );
          context.state.snapshots = mergeSnapshotCollections(
            remoteSnapshots,
            context.state.snapshots
          );

          const remoteNotesById = new Map(remoteNotes.map((note) => [note.id, note]));
          const hasLocalNotesToUpload = context.state.notes.some((note) => {
            const remoteNote = remoteNotesById.get(note.id);
            return !remoteNote || JSON.stringify(note) !== JSON.stringify(remoteNote);
          });
          const remoteSnapshotIds = new Set(remoteSnapshots.map((snapshot) => snapshot.id));
          const hasLocalSnapshotsToUpload = context.state.snapshots.some(
            (snapshot) => !remoteSnapshotIds.has(snapshot.id)
          );
          const hasLocalDeletionsToUpload = normalizeDeletedNotes(
            localSettings.deletedNotes
          ).some(
            (deletion) =>
              !remoteDeletedNotes.some(
                (remoteDeletion) =>
                  remoteDeletion.id === deletion.id &&
                  (Date.parse(remoteDeletion.deletedAt) || 0) >=
                    (Date.parse(deletion.deletedAt) || 0)
              )
          );

          saveNotes({ skipRemote: true });
          const prunedSnapshots = saveSnapshots({ skipRemote: true });
          setRemoteState({
            status: "synced",
            lastSyncedAt: new Date().toISOString(),
            lastError: "",
          });
          if (
            hasLocalNotesToUpload ||
            hasLocalSnapshotsToUpload ||
            hasLocalDeletionsToUpload ||
            prunedSnapshots
          ) {
            queueRemoteSync({ includeSnapshots: true });
          }
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
      if (!Array.isArray(payload.notes) || payload.notes.length === 0) {
        setRemoteState({
          status: "error",
          lastError: "Synchronisation bloquee: aucune page a envoyer",
          showSyncWarning: false,
        });
        context.renderers?.renderWorkspaceBanner();
        return remoteSyncQueue;
      }

      setRemoteState({ status: "syncing", lastError: "", showSyncWarning: false });
      context.renderers?.renderWorkspaceBanner();

      remoteSyncQueue = remoteSyncQueue
        .catch(() => {})
        .then(async () => {
          try {
            if (payload.deletedNotes.length > 0) {
              await callRemoteRpc("register_note_deletions", {
                deletions: payload.deletedNotes,
              });
            }
            await callRemoteRpc("sync_app_payload", { payload });
            setRemoteState({
              status: "synced",
              lastSyncedAt: new Date().toISOString(),
              lastError: "",
              showSyncWarning: false,
            });
          } catch (error) {
            setRemoteState({
              status: "error",
              lastError: error.message || "Synchronisation impossible",
              showSyncWarning: false,
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
        ensureDailySnapshot("Snapshot quotidien");
        scheduleDailySnapshot();
        return;
      }

      const loaded = await loadWorkspaceFromRemote();
      if (loaded || context.state.notes.length) {
        ensureDailySnapshot("Snapshot quotidien");
        scheduleDailySnapshot();
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

    function downloadDatabaseCsv() {
      const notes = normalizeNoteCollection(context.state.notes);
      const noteById = new Map(notes.map((note) => [note.id, note]));
      const headers = [
        "id",
        "titre",
        "type",
        "parent_id",
        "parent_titre",
        "favori",
        "tags",
        "contenu",
        "questions_count",
        "questions_texte",
        "questions_json",
        "metadata_json",
        "created_at",
        "updated_at",
        "review_streak",
        "last_reviewed_at",
        "next_review_at",
      ];
      const rows = notes.map((note) => {
        const parent = note.parentId ? noteById.get(note.parentId) : null;
        const quizQuestions = normalizeQuizQuestionCollection(note.quizQuestions, note.id);
        return {
          id: note.id,
          titre: note.title,
          type: note.type,
          parent_id: note.parentId || "",
          parent_titre: parent?.title || "",
          favori: note.favorite ? "oui" : "non",
          tags: note.tags.join(", "),
          contenu: note.content,
          questions_count: quizQuestions.length,
          questions_texte: quizQuestions
            .map((question) => {
              const answers = Array.isArray(question.answers)
                ? question.answers.join(" | ")
                : "";
              return `${question.question || ""} => ${answers}`;
            })
            .join("\n"),
          questions_json: quizQuestions,
          metadata_json: normalizeMetadata(note.metadata),
          created_at: note.createdAt,
          updated_at: note.updatedAt,
          review_streak: Number(note.review?.streak) || 0,
          last_reviewed_at: note.review?.lastReviewedAt || "",
          next_review_at: note.review?.nextReviewAt || "",
        };
      });

      downloadCsvFile("atlas-connaissance-base.csv", headers, rows);
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

      createSnapshot("Snapshot manuel");
      context.renderers?.renderPublishCenter();
    }

    function saveAutomaticSnapshot(label) {
      if (!isReadOnlyMode()) {
        createSnapshot(label || "Snapshot automatique");
      }
    }

    function createSnapshot(label, date = new Date()) {
      const snapshot = {
        id: `${Date.now()}`,
        label,
        createdAt: date.toISOString(),
        noteCount: context.state.notes.length,
        notes: normalizeNoteCollection(context.state.notes),
      };
      context.state.snapshots.unshift(snapshot);
      saveSnapshots();
    }

    function ensureDailySnapshot(label, date = new Date()) {
      if (isReadOnlyMode()) {
        return false;
      }

      const pruned = pruneExpiredSnapshots(date);
      if (hasSnapshotForCurrentSlot(date)) {
        if (pruned) {
          saveSnapshots();
        }
        return false;
      }

      createSnapshot(label || "Snapshot quotidien", date);
      return true;
    }

    function scheduleDailySnapshot() {
      if (dailySnapshotTimer) {
        window.clearTimeout(dailySnapshotTimer);
      }

      if (isReadOnlyMode()) {
        return;
      }

      const now = new Date();
      const nextSnapshotAt = getNextDailySnapshotAt(now);
      dailySnapshotTimer = window.setTimeout(() => {
        ensureDailySnapshot("Snapshot quotidien", new Date());
        context.renderers?.renderPublishCenter();
        scheduleDailySnapshot();
      }, nextSnapshotAt.getTime() - now.getTime());
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

      const installWorker = async () => {
        try {
          const registration = await navigator.serviceWorker.register("./service-worker.js", {
            updateViaCache: "none",
          });
          await registration.update();
        } catch (error) {
          // The application remains usable without offline caching.
        }
      };

      if (document.readyState === "complete") {
        installWorker();
      } else {
        window.addEventListener("load", installWorker, { once: true });
      }
    }

    return {
      bootstrapWorkspace,
      buildPublishedUrl,
      buildTemplateContent,
      copyPublishedLink,
      createReviewState,
      dataVersion,
      downloadFullBackup,
      downloadDatabaseCsv,
      downloadJsonFile,
      downloadPublishedSnapshot,
      generateId,
      getDefaultRemoteState,
      getDefaultSettings,
      getDefaultTemplateForType,
      getNoteTypeEntries,
      getNoteTypeLabels,
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
      mergeQuizQuestionCollectionStats,
      shouldSeedDefaultKnowledge,
      normalizeImportedNote,
      normalizeNoteCollection,
      normalizeQuizQuestionCollection,
      normalizeSettings,
      normalizeSnapshot,
      normalizeSnapshotCollection,
      createQuizQuestionStats,
      normalizeTemplates,
      queueRemoteSync,
      registerServiceWorker,
      restoreLatestSnapshot,
      restoreSnapshotById,
      saveAutomaticSnapshot,
      saveManualSnapshot,
      saveNotes,
      saveSnapshots,
      saveThemePreference,
      setRemoteState,
      updateReviewState,
    };
  };
})(window);
