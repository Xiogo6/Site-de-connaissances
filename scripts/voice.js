/*
  Dictee vocale : capture audio et file d'attente locale.

  Cette page est un second point d'entree. Elle ne charge ni dom.js, ni data.js,
  ni renderers.js, et ne construit aucune interface d'Atlas. Ce qui compte n'est
  pas le poids en octets, tout etant en cache : c'est le temps entre le toucher
  de l'icone et le moment ou le bouton accepte un appui. Tout ce qui n'est pas
  indispensable a cet instant est donc repousse apres.

  A ce stade rien ne part sur le reseau. Ni Gemini, ni Supabase. On verifie
  seulement que la capture est fiable.

  Une chose mesuree sur iPhone et qui gouverne le reste : deux applications
  installees depuis la meme origine recoivent chacune leur conteneur de
  stockage. La file ecrite depuis l'icone Dicter est donc invisible depuis
  Atlas, et reciproquement. La page l'affiche au lieu de le taire.

  Sept sections :
    1. Reglages
    2. Stockage         (IndexedDB, ne touche ni au DOM ni au micro)
    3. Micro            (flux, MediaRecorder)
    4. Chrono et niveau
    5. Interface
    6. Evenements
    7. Demarrage
*/
(function initializeVoicePage(global) {
  const AtlasApp = (global.AtlasApp = global.AtlasApp || {});

  /* ================================================================
     1. Reglages
     ================================================================ */

  const settings = {
    // Frequence d'ecriture dans IndexedDB pendant l'enregistrement. Plus court
    // perd moins si la page est tuee, mais multiplie les ecritures.
    timesliceMs: 3000,
    // Garde-fou : un appui reste coince dans une poche ne remplit pas le
    // telephone.
    maxDurationMs: 10 * 60 * 1000,
    // En dessous, c'est un appui accidentel, pas une dictee.
    minDurationMs: 500,
    // Le micro reste chaud apres un arret pour que l'appui suivant demarre
    // sans delai. Relache passe ce delai, et tout de suite si la page part en
    // arriere-plan.
    streamIdleMs: 60 * 1000,
    modeStorageKey: "atlas-voice-mode",
  };

  // Safari ne produit pas de webm : sur iPhone ce sera du mp4. On demande le
  // premier format accepte et on enregistre celui reellement obtenu, dont la
  // transcription aura besoin plus tard.
  const mimeCandidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4;codecs=mp4a.40.2",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];

  const elements = {
    record: document.querySelector("#voice-record"),
    recordLabel: document.querySelector("#voice-record-label"),
    chrono: document.querySelector("#voice-chrono"),
    level: document.querySelector("#voice-niveau"),
    status: document.querySelector("#voice-statut"),
    session: document.querySelector("#voice-session"),
    context: document.querySelector("#voice-contexte"),
    list: document.querySelector("#voice-liste"),
    empty: document.querySelector("#voice-vide"),
    summary: document.querySelector("#voice-file-resume"),
    modes: Array.from(document.querySelectorAll("[data-voice-mode]")),
  };

  const state = {
    // idle -> arming -> recording -> stopping -> idle
    status: "idle",
    mode: "hold",
    stream: null,
    recorder: null,
    recordingPromise: null,
    chunkIndex: 0,
    writes: [],
    writeError: null,
    startedAt: 0,
    durationMs: 0,
    endedReason: "user",
    releaseRequested: false,
    releaseTimer: 0,
    chronoTimer: 0,
    meterFrame: 0,
    meterLevel: 0,
    audioContext: null,
    analyser: null,
    meterSource: null,
    playbackId: "",
    playbackUrl: "",
    audio: null,
    recordings: [],
  };

  /* ================================================================
     2. Stockage

     Ce bloc ne connait ni le DOM ni le micro. Le jour ou autre chose doit
     lire la file, il se sort tel quel dans son propre fichier.
     ================================================================ */

  const databaseName = "atlas-voice";
  const databaseVersion = 1;
  const recordingsStore = "recordings";
  const chunksStore = "chunks";
  let databasePromise = null;

  // IndexedDB parle en evenements, le reste du fichier en promesses.
  function promisifyRequest(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Requete refusee."));
    });
  }

  function promisifyTransaction(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("Transaction refusee."));
      transaction.onabort = () => reject(transaction.error || new Error("Transaction annulee."));
    });
  }

  function openDatabase() {
    if (!global.indexedDB) {
      return Promise.reject(new Error("IndexedDB n'est pas disponible ici."));
    }

    if (databasePromise) {
      return databasePromise;
    }

    databasePromise = new Promise((resolve, reject) => {
      const request = global.indexedDB.open(databaseName, databaseVersion);

      request.onupgradeneeded = () => {
        const database = request.result;

        if (!database.objectStoreNames.contains(recordingsStore)) {
          const recordings = database.createObjectStore(recordingsStore, { keyPath: "id" });
          recordings.createIndex("createdAt", "createdAt");
        }

        if (!database.objectStoreNames.contains(chunksStore)) {
          // Cle auto-incrementee plutot qu'une cle composee [recordingId, index] :
          // les cles composees ont une histoire de bugs sur Safari, et l'ordre
          // reel est porte par le champ index de toute facon.
          const chunks = database.createObjectStore(chunksStore, {
            keyPath: "key",
            autoIncrement: true,
          });
          chunks.createIndex("recordingId", "recordingId");
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        databasePromise = null;
        reject(request.error || new Error("Ouverture de la base refusee."));
      };
    });

    return databasePromise;
  }

  function generateId() {
    return `rec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  async function createRecording(mimeType) {
    const database = await openDatabase();
    const recording = {
      id: generateId(),
      createdAt: new Date().toISOString(),
      // "recording" pendant la capture, "ready" a l'arret propre. Un
      // "recording" retrouve au chargement suivant signale donc toujours une
      // page tuee en cours de route.
      status: "recording",
      mimeType: String(mimeType || ""),
      durationMs: 0,
      sizeBytes: 0,
      chunkCount: 0,
      endedReason: "",
      // Reserves a la suite : transcription et page creee a partir d'elle.
      // Rien ne les ecrit aujourd'hui.
      transcript: null,
      noteId: null,
    };

    const transaction = database.transaction(recordingsStore, "readwrite");
    transaction.objectStore(recordingsStore).put(recording);
    await promisifyTransaction(transaction);
    return recording;
  }

  async function writeChunk(recordingId, index, data, sizeBytes) {
    const database = await openDatabase();
    const transaction = database.transaction([chunksStore, recordingsStore], "readwrite");
    const chunks = transaction.objectStore(chunksStore);
    const recordings = transaction.objectStore(recordingsStore);

    chunks.put({ recordingId, index, data, receivedAt: new Date().toISOString() });

    // Les totaux sont tenus a jour ici plutot que recalcules a l'affichage :
    // la liste doit se dessiner sans relire tout l'audio. Meme transaction que
    // le morceau, donc les deux passent ou aucun ne passe.
    const request = recordings.get(recordingId);
    request.onsuccess = () => {
      const recording = request.result;
      if (!recording) {
        return;
      }
      recording.sizeBytes = (recording.sizeBytes || 0) + sizeBytes;
      recording.chunkCount = (recording.chunkCount || 0) + 1;
      recordings.put(recording);
    };

    await promisifyTransaction(transaction);
  }

  async function appendChunk(recordingId, index, blob) {
    if (!blob || !blob.size) {
      return;
    }

    try {
      await writeChunk(recordingId, index, blob, blob.size);
    } catch (error) {
      // Quelques navigateurs refusent un Blob dans IndexedDB. On retente une
      // fois en octets bruts : le constructeur Blob accepte les deux au
      // remontage, la lecture n'a donc pas a savoir lequel a ete stocke.
      const buffer = await blob.arrayBuffer();
      await writeChunk(recordingId, index, buffer, buffer.byteLength);
    }
  }

  async function updateRecording(id, patch) {
    const database = await openDatabase();
    const transaction = database.transaction(recordingsStore, "readwrite");
    const recordings = transaction.objectStore(recordingsStore);
    const request = recordings.get(id);

    request.onsuccess = () => {
      const recording = request.result;
      if (recording) {
        recordings.put({ ...recording, ...patch });
      }
    };

    await promisifyTransaction(transaction);
  }

  async function listRecordings() {
    const database = await openDatabase();
    const transaction = database.transaction(recordingsStore, "readonly");
    const recordings = await promisifyRequest(
      transaction.objectStore(recordingsStore).getAll()
    );
    return recordings.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  async function readChunks(id) {
    const database = await openDatabase();
    const transaction = database.transaction(chunksStore, "readonly");
    const index = transaction.objectStore(chunksStore).index("recordingId");
    const chunks = await promisifyRequest(index.getAll(IDBKeyRange.only(id)));
    return chunks.sort((a, b) => (a.index || 0) - (b.index || 0));
  }

  // Seul le dernier morceau sert a dater une interruption. Un curseur en
  // marche arriere evite de charger tout l'audio en memoire pour ca.
  async function readLastChunk(id) {
    const database = await openDatabase();
    const transaction = database.transaction(chunksStore, "readonly");
    const index = transaction.objectStore(chunksStore).index("recordingId");
    const cursor = await promisifyRequest(index.openCursor(IDBKeyRange.only(id), "prev"));
    return cursor ? cursor.value : null;
  }

  async function buildRecordingBlob(recording) {
    const chunks = await readChunks(recording.id);
    if (!chunks.length) {
      return null;
    }

    // L'ordre compte : le premier morceau porte l'en-tete du fichier, et seule
    // la concatenation complete forme un fichier lisible.
    return new Blob(
      chunks.map((chunk) => chunk.data),
      { type: recording.mimeType || "application/octet-stream" }
    );
  }

  async function deleteRecording(id) {
    const database = await openDatabase();
    const transaction = database.transaction([chunksStore, recordingsStore], "readwrite");
    const index = transaction.objectStore(chunksStore).index("recordingId");
    const request = index.openCursor(IDBKeyRange.only(id));

    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        return;
      }
      cursor.delete();
      cursor.continue();
    };

    transaction.objectStore(recordingsStore).delete(id);
    await promisifyTransaction(transaction);
  }

  /*
    Au chargement : une dictee encore en "recording" n'a pas ete arretee
    proprement. L'audio deja ecrit reste valable, seule la derniere tranche
    manque. Une dictee sans aucun morceau n'a rien a offrir, on la retire
    plutot que de laisser une ligne vide dans la liste.
  */
  async function repairInterrupted() {
    const pending = (await listRecordings()).filter((item) => item.status === "recording");
    let repaired = 0;

    for (const recording of pending) {
      const lastChunk = await readLastChunk(recording.id);

      if (!lastChunk) {
        await deleteRecording(recording.id);
        continue;
      }

      // La duree n'a jamais ete ecrite : on la deduit de l'horodatage du
      // dernier morceau recu.
      const durationMs =
        recording.durationMs ||
        Math.max(0, Date.parse(lastChunk.receivedAt) - Date.parse(recording.createdAt));

      await updateRecording(recording.id, {
        status: "interrupted",
        endedReason: recording.endedReason || "interruption",
        durationMs,
      });
      repaired += 1;
    }

    return repaired;
  }

  // Sans cela le navigateur peut vider la file pour recuperer de la place :
  // de l'audio en attente disparaitrait sans prevenir.
  async function requestPersistence() {
    try {
      if (await navigator.storage?.persisted?.()) {
        return;
      }
      await navigator.storage?.persist?.();
    } catch (error) {
      // Sans persistance la file reste utilisable, elle est juste eviction.
    }
  }

  /* ================================================================
     3. Micro
     ================================================================ */

  function pickMimeType() {
    if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) {
      return "";
    }
    return mimeCandidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) || "";
  }

  function hasLiveStream() {
    return Boolean(state.stream?.getAudioTracks().some((track) => track.readyState === "live"));
  }

  async function acquireStream() {
    if (hasLiveStream()) {
      global.clearTimeout(state.releaseTimer);
      return state.stream;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Ce navigateur ne donne pas acces au micro.");
    }

    state.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    return state.stream;
  }

  function releaseStream() {
    stopMeter();
    state.stream?.getTracks().forEach((track) => track.stop());
    state.stream = null;
  }

  function scheduleStreamRelease() {
    global.clearTimeout(state.releaseTimer);
    state.releaseTimer = global.setTimeout(() => {
      if (state.status === "idle") {
        releaseStream();
      }
    }, settings.streamIdleMs);
  }

  // Pre-chauffage : seulement si l'API Permissions confirme une autorisation
  // deja accordee. Safari ne l'implemente pas pour le micro, donc sur iPhone
  // le premier appui d'une session paiera l'acquisition, et les suivants non.
  // Tenter getUserMedia au chargement sans cette confirmation declencherait
  // une demande hors geste utilisateur, qui peut etre refusee d'office.
  async function prewarmStream() {
    try {
      const permission = await navigator.permissions?.query?.({ name: "microphone" });
      if (permission?.state === "granted") {
        await acquireStream();
        scheduleStreamRelease();
      }
    } catch (error) {
      // Permissions indisponible : on acquerra au premier appui.
    }
  }

  function describeMicrophoneError(error) {
    const name = error?.name || "";
    if (name === "NotAllowedError" || name === "SecurityError") {
      return "Micro refuse. Autorise-le dans les reglages du navigateur.";
    }
    if (name === "NotFoundError") {
      return "Aucun micro detecte sur cet appareil.";
    }
    if (name === "NotReadableError") {
      return "Le micro est deja pris par une autre application.";
    }
    return error?.message || "Micro indisponible.";
  }

  async function startRecording() {
    if (state.status !== "idle") {
      return;
    }

    state.status = "arming";
    state.releaseRequested = false;
    state.writes = [];
    state.writeError = null;
    state.chunkIndex = 0;
    setStatus("Micro...");
    renderButton();

    let stream;
    try {
      stream = await acquireStream();
    } catch (error) {
      state.status = "idle";
      setStatus(describeMicrophoneError(error), true);
      renderButton();
      return;
    }

    // L'appui a pu etre relache pendant l'acquisition, autorisation comprise.
    if (state.releaseRequested) {
      state.status = "idle";
      setStatus("");
      renderButton();
      scheduleStreamRelease();
      return;
    }

    const mimeType = pickMimeType();
    let recorder;
    try {
      recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
    } catch (error) {
      state.status = "idle";
      setStatus("Enregistrement impossible sur ce navigateur.", true);
      renderButton();
      return;
    }

    state.recorder = recorder;
    recorder.ondataavailable = handleData;
    recorder.onstop = handleStop;
    recorder.onerror = () => {
      setStatus("Le micro s'est interrompu.", true);
      stopRecording("error");
    };

    // La ligne est creee en parallele du demarrage : la capture ne doit pas
    // attendre une ecriture disque. Le premier morceau n'arrive qu'au bout de
    // timesliceMs, et handleData attend cette promesse de toute facon.
    state.recordingPromise = createRecording(recorder.mimeType || mimeType);

    recorder.start(settings.timesliceMs);
    state.status = "recording";
    state.startedAt = Date.now();
    state.endedReason = "user";
    setStatus("");
    renderButton();
    startChrono();
    startMeter(stream);
  }

  function handleData(event) {
    const blob = event.data;
    if (!blob || !blob.size) {
      return;
    }

    const index = state.chunkIndex;
    state.chunkIndex += 1;

    const write = (async () => {
      const recording = await state.recordingPromise;
      await appendChunk(recording.id, index, blob);
    })().catch((error) => {
      state.writeError = error;
    });

    state.writes.push(write);
  }

  function stopRecording(reason) {
    if (state.status === "arming") {
      // L'acquisition est encore en cours : on note l'intention, elle sera lue
      // des que le flux arrive.
      state.releaseRequested = true;
      return;
    }

    if (state.status !== "recording") {
      return;
    }

    state.status = "stopping";
    state.endedReason = reason || "user";
    state.durationMs = Date.now() - state.startedAt;
    stopChrono();
    stopMeter();
    renderButton();

    try {
      state.recorder.stop();
    } catch (error) {
      handleStop();
    }
  }

  /*
    Arret. Les morceaux deja ecrits sont a l'abri : si la page est suspendue
    avant la fin de cette fonction, seule la mise a jour finale manque, et
    repairInterrupted() la reconstruira au prochain chargement.
  */
  async function handleStop() {
    const recorder = state.recorder;
    state.recorder = null;
    const durationMs = state.durationMs;
    const reason = state.endedReason;

    try {
      await Promise.all(state.writes);
      const recording = await state.recordingPromise;

      if (durationMs < settings.minDurationMs) {
        await deleteRecording(recording.id);
        setStatus("Trop court, rien conserve.");
      } else {
        await updateRecording(recording.id, {
          status: "ready",
          durationMs,
          endedReason: reason,
          mimeType: recorder?.mimeType || recording.mimeType,
        });
        setStatus(messageForReason(reason, durationMs));
      }
    } catch (error) {
      setStatus("Enregistrement incomplet, il est dans la liste.", true);
    }

    if (state.writeError) {
      setStatus("Une partie de l'audio n'a pas pu etre ecrite.", true);
    }

    state.status = "idle";
    state.writes = [];
    state.recordingPromise = null;
    resetChrono();
    renderButton();
    await renderList();
    scheduleStreamRelease();
  }

  function messageForReason(reason, durationMs) {
    if (reason === "hidden") {
      return `Page quittee : ${formatDuration(durationMs)} sauvegardees.`;
    }
    if (reason === "limit") {
      return "Duree maximale atteinte, enregistrement sauvegarde.";
    }
    return `Enregistre : ${formatDuration(durationMs)}.`;
  }

  /* ================================================================
     4. Chrono et niveau sonore
     ================================================================ */

  function formatDuration(ms) {
    const total = Math.max(0, Math.round(ms / 1000));
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  function startChrono() {
    stopChrono();
    // On lit l'horloge a chaque battement plutot que de compter les battements :
    // un compteur derive des que le navigateur ralentit les minuteries.
    state.chronoTimer = global.setInterval(() => {
      const elapsed = Date.now() - state.startedAt;
      elements.chrono.textContent = formatDuration(elapsed);
      if (elapsed >= settings.maxDurationMs) {
        stopRecording("limit");
      }
    }, 200);
  }

  function stopChrono() {
    global.clearInterval(state.chronoTimer);
    state.chronoTimer = 0;
  }

  function resetChrono() {
    elements.chrono.textContent = "00:00";
    setLevel(0);
  }

  function setLevel(percent) {
    elements.level.style.width = `${Math.max(0, Math.min(100, percent))}%`;
  }

  function startMeter(stream) {
    try {
      const AudioContextClass = global.AudioContext || global.webkitAudioContext;
      if (!AudioContextClass) {
        return;
      }

      if (!state.audioContext) {
        state.audioContext = new AudioContextClass();
      }
      // Un contexte audio cree hors geste utilisateur demarre suspendu.
      state.audioContext.resume?.();

      state.meterSource = state.audioContext.createMediaStreamSource(stream);
      state.analyser = state.audioContext.createAnalyser();
      state.analyser.fftSize = 1024;
      state.meterSource.connect(state.analyser);
      state.meterData = new Uint8Array(state.analyser.fftSize);
      tickMeter();
    } catch (error) {
      // Le niveau sonore est un confort : son absence n'empeche pas d'enregistrer.
    }
  }

  function tickMeter() {
    if (!state.analyser) {
      return;
    }

    state.analyser.getByteTimeDomainData(state.meterData);

    // Valeur efficace du signal : les octets sont centres sur 128.
    let sum = 0;
    for (let i = 0; i < state.meterData.length; i += 1) {
      const value = (state.meterData[i] - 128) / 128;
      sum += value * value;
    }

    const level = Math.sqrt(sum / state.meterData.length) * 240;
    // Montee immediate, descente amortie : une barre qui retombe a zero entre
    // deux syllabes est illisible.
    state.meterLevel = Math.max(level, state.meterLevel * 0.86);
    setLevel(state.meterLevel);

    state.meterFrame = global.requestAnimationFrame(tickMeter);
  }

  function stopMeter() {
    global.cancelAnimationFrame(state.meterFrame);
    state.meterFrame = 0;
    state.meterLevel = 0;
    setLevel(0);

    try {
      state.meterSource?.disconnect();
    } catch (error) {
      // Deja deconnecte.
    }
    state.meterSource = null;
    state.analyser = null;
  }

  /* ================================================================
     5. Interface
     ================================================================ */

  function setStatus(message, isError) {
    elements.status.textContent = message || "";
    elements.status.classList.toggle("is-error", Boolean(isError));
  }

  function renderButton() {
    const button = elements.record;
    button.classList.toggle("is-recording", state.status === "recording");
    button.classList.toggle("is-arming", state.status === "arming");

    if (state.status === "arming") {
      elements.recordLabel.textContent = "Micro...";
      return;
    }

    if (state.status === "recording") {
      elements.recordLabel.textContent =
        state.mode === "hold" ? "J'ecoute\nrelache pour finir" : "J'ecoute\nappuie pour finir";
      return;
    }

    if (state.status === "stopping") {
      elements.recordLabel.textContent = "Sauvegarde...";
      return;
    }

    elements.recordLabel.textContent =
      state.mode === "hold" ? "Maintenir\npour dicter" : "Appuyer\npour dicter";
  }

  function renderMode() {
    elements.modes.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.voiceMode === state.mode);
    });
    renderButton();
  }

  function formatSize(bytes) {
    if (bytes < 1024) {
      return `${bytes} o`;
    }
    if (bytes < 1024 * 1024) {
      return `${Math.round(bytes / 1024)} Ko`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  }

  function formatMoment(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
      return "Date inconnue";
    }
    const jour = date.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
    const heure = date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    return `${jour} a ${heure}`;
  }

  function shortFormat(mimeType) {
    const match = String(mimeType).match(/audio\/([a-z0-9]+)/i);
    return match ? match[1] : "audio";
  }

  function buildItem(recording) {
    const item = document.createElement("li");
    item.className = "dictee-item";
    item.dataset.id = recording.id;

    const titre = document.createElement("div");
    titre.className = "dictee-item-titre";
    titre.textContent = formatMoment(recording.createdAt);

    const meta = document.createElement("div");
    meta.className = "dictee-item-meta";
    meta.textContent = `${formatDuration(recording.durationMs)} · ${formatSize(
      recording.sizeBytes
    )} · ${shortFormat(recording.mimeType)}`;

    if (recording.status === "interrupted") {
      const marque = document.createElement("span");
      marque.className = "is-interrupted";
      marque.textContent = " · interrompu, recupere";
      meta.appendChild(marque);
    }

    const actions = document.createElement("div");
    actions.className = "dictee-item-actions";

    const ecouter = document.createElement("button");
    ecouter.type = "button";
    ecouter.dataset.action = "play";
    ecouter.textContent = state.playbackId === recording.id ? "Relire" : "Ecouter";

    const supprimer = document.createElement("button");
    supprimer.type = "button";
    supprimer.dataset.action = "delete";
    supprimer.textContent = "Supprimer";

    actions.append(ecouter, supprimer);
    item.append(titre, meta, actions);

    // Le lecteur est un element unique deplace d'une ligne a l'autre : le
    // recreer a chaque rendu relancerait la lecture depuis le debut.
    if (state.playbackId === recording.id && state.audio) {
      item.appendChild(state.audio);
    }

    return item;
  }

  async function renderList() {
    try {
      state.recordings = await listRecordings();
    } catch (error) {
      elements.empty.textContent = "File illisible sur ce navigateur.";
      elements.empty.hidden = false;
      return;
    }

    elements.list.textContent = "";
    state.recordings.forEach((recording) => {
      elements.list.appendChild(buildItem(recording));
    });

    elements.empty.hidden = state.recordings.length > 0;

    const total = state.recordings.reduce((sum, item) => sum + (item.sizeBytes || 0), 0);
    elements.summary.textContent = state.recordings.length
      ? `${state.recordings.length} en attente · ${formatSize(total)}`
      : "";
  }

  function revokePlayback() {
    if (state.playbackUrl) {
      URL.revokeObjectURL(state.playbackUrl);
      state.playbackUrl = "";
    }
  }

  async function playRecording(id) {
    const recording = state.recordings.find((item) => item.id === id);
    if (!recording) {
      return;
    }

    const blob = await buildRecordingBlob(recording);
    if (!blob) {
      setStatus("Cet enregistrement ne contient aucun audio.", true);
      return;
    }

    revokePlayback();
    state.playbackUrl = URL.createObjectURL(blob);
    state.playbackId = id;

    if (!state.audio) {
      state.audio = document.createElement("audio");
      state.audio.controls = true;
      state.audio.preload = "metadata";
    }

    state.audio.src = state.playbackUrl;
    await renderList();
    state.audio.play().catch(() => {
      // Lecture refusee : les commandes restent disponibles a la main.
    });
  }

  async function removeRecording(id) {
    if (!global.confirm("Supprimer cet enregistrement ?")) {
      return;
    }

    if (state.playbackId === id) {
      state.audio?.pause();
      revokePlayback();
      state.playbackId = "";
    }

    await deleteRecording(id);
    await renderList();
  }

  /* ================================================================
     6. Evenements
     ================================================================ */

  function toggleFromPress() {
    if (state.status === "recording") {
      stopRecording("user");
      return;
    }
    startRecording();
  }

  function handlePointerDown(event) {
    // pointerdown et non click : sur mobile, click n'arrive qu'apres le
    // relachement et la validation du tap, ce qui coute la premiere syllabe.
    event.preventDefault();

    try {
      // Garde le relachement sur le bouton meme si le doigt glisse a cote.
      // Sous try : la capture echoue si le pointeur a deja disparu, sur un
      // tap tres bref, et cet echec ne doit pas empecher l'enregistrement.
      elements.record.setPointerCapture?.(event.pointerId);
    } catch (error) {
      // Sans capture, pointerup suffit tant que le doigt reste sur le bouton.
    }

    if (state.mode === "toggle") {
      toggleFromPress();
      return;
    }

    startRecording();
  }

  function handlePointerUp() {
    if (state.mode !== "hold") {
      return;
    }

    if (state.status === "arming") {
      state.releaseRequested = true;
      return;
    }

    stopRecording("user");
  }

  function handleKeyDown(event) {
    if (event.key !== " " && event.key !== "Enter") {
      return;
    }
    // Une touche maintenue se repete : sans ce garde-fou on redemarrerait
    // l'enregistrement a chaque repetition.
    if (event.repeat) {
      return;
    }
    event.preventDefault();

    if (state.mode === "toggle") {
      toggleFromPress();
      return;
    }
    startRecording();
  }

  function handleKeyUp(event) {
    if (event.key !== " " && event.key !== "Enter") {
      return;
    }
    if (state.mode === "hold") {
      stopRecording("user");
    }
  }

  function handleListClick(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) {
      return;
    }

    const id = button.closest("[data-id]")?.dataset.id;
    if (!id) {
      return;
    }

    if (button.dataset.action === "play") {
      playRecording(id);
    } else if (button.dataset.action === "delete") {
      removeRecording(id);
    }
  }

  /*
    iOS suspend la page sur appel entrant ou changement d'application. On
    arrete et on sauvegarde plutot que de perdre le flux. pagehide compte
    autant que visibilitychange : iOS le declenche dans des cas ou le second
    n'arrive pas. On ne peut rien attendre dans ces gestionnaires, mais les
    morceaux deja ecrits sont a l'abri.
  */
  function handleHidden() {
    if (state.status === "recording" || state.status === "arming") {
      stopRecording("hidden");
    }
    releaseStream();
  }

  function setMode(mode) {
    state.mode = mode === "toggle" ? "toggle" : "hold";
    try {
      global.localStorage.setItem(settings.modeStorageKey, state.mode);
    } catch (error) {
      // Stockage indisponible : le mode vaut pour cette visite seulement.
    }
    renderMode();
  }

  function bindEvents() {
    elements.record.addEventListener("pointerdown", handlePointerDown);
    elements.record.addEventListener("pointerup", handlePointerUp);
    elements.record.addEventListener("pointercancel", handlePointerUp);
    elements.record.addEventListener("keydown", handleKeyDown);
    elements.record.addEventListener("keyup", handleKeyUp);
    // Sans cela, un appui long sur mobile ouvre le menu contextuel du systeme.
    elements.record.addEventListener("contextmenu", (event) => event.preventDefault());

    elements.modes.forEach((button) => {
      button.addEventListener("click", () => setMode(button.dataset.voiceMode));
    });

    elements.list.addEventListener("click", handleListClick);

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        handleHidden();
      }
    });
    global.addEventListener("pagehide", handleHidden);
  }

  /* ================================================================
     7. Demarrage
     ================================================================ */

  function describeContext() {
    const standalone =
      global.matchMedia?.("(display-mode: standalone)")?.matches ||
      global.navigator.standalone === true;

    // Mesure faite sur iPhone : deux applications installees depuis la meme
    // origine recoivent chacune leur conteneur de stockage. La file affichee
    // ici est donc celle de ce contexte, et d'aucun autre.
    return standalone
      ? "Icone Dicter : cette file lui est propre, Atlas ne la voit pas."
      : "Ouvert dans le navigateur : cette file est celle de ce contexte.";
  }

  function checkSupport() {
    if (!global.isSecureContext) {
      return "Le micro exige HTTPS ou localhost.";
    }
    if (typeof MediaRecorder === "undefined") {
      return "Ce navigateur ne sait pas enregistrer (MediaRecorder absent).";
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      return "Ce navigateur ne donne pas acces au micro.";
    }
    if (!global.indexedDB) {
      return "IndexedDB est indisponible : rien ne pourrait etre sauvegarde.";
    }
    return "";
  }

  function loadMode() {
    try {
      return global.localStorage.getItem(settings.modeStorageKey) || "hold";
    } catch (error) {
      return "hold";
    }
  }

  // Le service worker est enregistre ici parce que voice.html ne charge pas
  // data.js, ou vit l'enregistrement de l'application. Sans ces lignes, une
  // premiere ouverture par l'icone dediee n'installerait jamais le cache :
  // pas de hors-ligne, et aucun signe visible tant qu'il y a du reseau.
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

  async function showSession() {
    try {
      const auth = AtlasApp.createAuthModule?.({ elements: {} });
      if (!auth?.isConfigured()) {
        elements.session.textContent = "Session : Supabase non configure.";
        return;
      }

      await auth.restore();
      elements.session.textContent = auth.isSignedIn()
        ? `Session : ${auth.getEmail() || "ouverte"}`
        : "Aucune session ici. La dictee fonctionne, l'envoi viendra plus tard.";
    } catch (error) {
      elements.session.textContent = "Session : etat inconnu.";
    }
  }

  async function initDeferred() {
    elements.context.textContent = describeContext();

    try {
      const repaired = await repairInterrupted();
      if (repaired) {
        setStatus(
          repaired > 1
            ? `${repaired} enregistrements interrompus ont ete recuperes.`
            : "Un enregistrement interrompu a ete recupere."
        );
      }
      await renderList();
    } catch (error) {
      elements.empty.textContent = "File illisible sur ce navigateur.";
    }

    requestPersistence();
    showSession();
    prewarmStream();

    // En dernier : cache.addAll telecharge tout Atlas, et ce n'est pas ce qui
    // doit concurrencer le premier appui.
    registerServiceWorker();
  }

  function boot() {
    if (!elements.record) {
      return;
    }

    state.mode = loadMode();
    renderMode();

    const support = checkSupport();
    if (support) {
      elements.recordLabel.textContent = "Indisponible";
      setStatus(support, true);
      elements.context.textContent = describeContext();
      return;
    }

    // Le branchement de l'appui passe avant tout le reste : c'est l'instant
    // ou la page devient utile.
    bindEvents();
    elements.record.disabled = false;
    renderButton();

    initDeferred();
  }

  boot();
})(window);
