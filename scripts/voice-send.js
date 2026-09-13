/*
  Tout ce qui quitte l'appareil depuis la page de dictee.

  Aujourd'hui : l'audio part vers Gemini, qui renvoie du texte structure.
  L'audio ne va nulle part ailleurs, et ne partira jamais vers Supabase :
  seule sa transcription y sera deposee. C'est ce qui evite les buckets de
  stockage et leurs politiques d'acces.

  Ce fichier ne touche ni au DOM ni a IndexedDB. Il recoit un Blob, il rend du
  texte. voice.js s'occupe du reste.
*/
(function initializeVoiceSend(global) {
  const AtlasApp = (global.AtlasApp = global.AtlasApp || {});

  // Limite de la requete Gemini en envoi direct. La documentation parle d'une
  // vingtaine de megaoctets pour la requete entiere ; on s'arrete franchement
  // en dessous, pour refuser proprement au lieu d'echouer sur un 400 illisible.
  const maxRequestBytes = 15 * 1024 * 1024;

  /*
    Gemini n'accepte pas n'importe quelle etiquette de format. Safari annonce
    "audio/mp4", Chrome "audio/webm;codecs=opus", et la liste documentee cote
    Gemini ne les reprend pas telles quelles.

    Deux mesures, dans cet ordre :
    1. on retire le parametre codecs, qui n'est jamais attendu ;
    2. si l'envoi est refuse pour cause de format, on retente une fois avec
       l'etiquette voisine ci-dessous.

    On n'invente jamais le format a la place de MediaRecorder : on se contente
    de traduire son etiquette.
  */
  const mimeFallbacks = {
    "audio/mp4": "audio/aac",
    "audio/webm": "audio/ogg",
    "audio/x-m4a": "audio/aac",
  };

  function baseMimeType(mimeType) {
    return String(mimeType || "").split(";")[0].trim().toLowerCase();
  }

  function estimateRequestBytes(sizeBytes) {
    // base64 encode trois octets sur quatre caracteres, plus le prompt.
    return Math.ceil((Number(sizeBytes) || 0) / 3) * 4 + 4096;
  }

  function formatMegabytes(bytes) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  }

  function checkSize(sizeBytes) {
    const estimated = estimateRequestBytes(sizeBytes);
    if (estimated <= maxRequestBytes) {
      return "";
    }

    return (
      `Trop volumineux pour un envoi direct : ${formatMegabytes(estimated)} une fois encode, ` +
      `pour une limite de ${formatMegabytes(maxRequestBytes)}. ` +
      `Enregistre plus court, ou baisse le debit audio.`
    );
  }

  // FileReader plutot que btoa sur un ArrayBuffer : btoa sur plusieurs
  // megaoctets d'un coup depasse la pile d'appels sur certains navigateurs.
  // readAsDataURL fait le meme travail, nativement.
  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || "");
        const comma = result.indexOf(",");
        // On retire l'en-tete "data:audio/mp4;base64," pour ne garder que
        // les donnees.
        resolve(comma >= 0 ? result.slice(comma + 1) : "");
      };
      reader.onerror = () => reject(reader.error || new Error("Lecture de l'audio impossible."));
      reader.readAsDataURL(blob);
    });
  }

  function buildPrompt() {
    const types = Object.keys(AtlasApp.config.noteTypeLabels || {}).join(", ");

    return [
      "Tu recois une note dictee a voix haute, en francais.",
      "Tu la transcris, puis tu la mets en forme pour un carnet de connaissances.",
      "",
      "Regles :",
      "- transcris fidelement : tu ne rajoutes aucune idee, tu n'en retires aucune",
      "- tu corriges seulement les hesitations, repetitions et faux departs propres a l'oral",
      "- le contenu est du markdown simple, et commence par une ligne '# Titre'",
      "- tu n'inventes JAMAIS de lien [[...]] : tu ne connais pas les pages existantes",
      "- le titre tient en quelques mots, sans point final",
      `- le type est l'un de ceux-ci exactement : ${types}`,
      "- les tags sont en minuscules, sans accent, trois au maximum",
      "- si la dictee est inaudible ou vide, renvoie un titre vide et un contenu vide",
      "",
      "Tu reponds uniquement par un objet JSON de cette forme :",
      '{ "transcript": "la transcription brute", "title": "...", "type": "...",',
      '  "tags": ["...", "..."], "content": "# Titre\\n\\n..." }',
    ].join("\n");
  }

  function extractText(data) {
    const parts = data?.candidates?.[0]?.content?.parts;
    if (!Array.isArray(parts)) {
      return "";
    }
    return parts
      .map((part) => (typeof part?.text === "string" ? part.text : ""))
      .join("")
      .trim();
  }

  // Meme si on demande du JSON, un modele peut encadrer sa reponse. On enleve
  // la cloture markdown avant de lire, plutot que d'echouer pour trois
  // caracteres.
  function parseJsonPayload(text) {
    const cleaned = String(text || "")
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "");

    try {
      return JSON.parse(cleaned);
    } catch (error) {
      throw new Error("Gemini n'a pas renvoye un JSON lisible.");
    }
  }

  function normalizeResult(payload, fallbackModel) {
    const types = AtlasApp.config.noteTypeLabels || {};
    const type = String(payload?.type || "").trim();
    const tags = Array.isArray(payload?.tags)
      ? payload.tags
          .map((tag) => String(tag || "").trim().toLowerCase())
          .filter(Boolean)
          .slice(0, 3)
      : [];

    return {
      transcript: String(payload?.transcript || "").trim(),
      structured: {
        title: String(payload?.title || "").trim(),
        // Un type invente ne doit pas se retrouver dans la base.
        type: types[type] ? type : "concept",
        tags,
        content: String(payload?.content || "").trim(),
      },
      model: fallbackModel,
    };
  }

  async function requestGemini({ apiKey, model, prompt, mimeType, base64 }) {
    const response = await fetch(
      `${AtlasApp.config.geminiBaseUrl}${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "x-goog-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { text: prompt },
                // Le texte d'abord, l'audio ensuite : la consigne est lue avant
                // ce sur quoi elle porte.
                { inline_data: { mime_type: mimeType, data: base64 } },
              ],
            },
          ],
          generationConfig: {
            temperature: 0,
            // Evite d'avoir a deviner si la reponse est encadree de ```json.
            responseMimeType: "application/json",
          },
        }),
      }
    );

    if (!response.ok) {
      const detail = await response.text();
      const error = new Error(detail || `Gemini a repondu ${response.status}.`);
      error.status = response.status;
      error.detail = detail;
      throw error;
    }

    return response.json();
  }

  function looksLikeMimeRefusal(error) {
    if (error?.status !== 400) {
      return false;
    }
    return /mime|unsupported|not supported|invalid argument/i.test(String(error.detail || ""));
  }

  /*
    Transcrit un enregistrement. Rend { transcript, structured, model }.
    Ne touche a rien d'autre : c'est l'appelant qui decide quoi en faire.
  */
  async function transcribe({ blob, mimeType, apiKey, model }) {
    if (!apiKey) {
      throw new Error("Aucune cle Gemini enregistree sur cet appareil.");
    }
    if (!blob || !blob.size) {
      throw new Error("Cet enregistrement ne contient aucun audio.");
    }

    const tooBig = checkSize(blob.size);
    if (tooBig) {
      throw new Error(tooBig);
    }

    const base64 = await blobToBase64(blob);
    if (!base64) {
      throw new Error("Encodage de l'audio impossible.");
    }

    const prompt = buildPrompt();
    const primary = baseMimeType(mimeType) || "audio/mp4";
    let data;

    try {
      data = await requestGemini({ apiKey, model, prompt, mimeType: primary, base64 });
    } catch (error) {
      const fallback = mimeFallbacks[primary];
      if (!fallback || !looksLikeMimeRefusal(error)) {
        throw error;
      }

      // Une seule seconde tentative, avec l'etiquette voisine.
      try {
        data = await requestGemini({ apiKey, model, prompt, mimeType: fallback, base64 });
      } catch (secondError) {
        throw new Error(
          `Format refuse par Gemini, en ${primary} comme en ${fallback}. ` +
            (secondError.message || "")
        );
      }
    }

    const text = extractText(data);
    if (!text) {
      throw new Error("Gemini a renvoye une reponse vide.");
    }

    return normalizeResult(parseJsonPayload(text), model);
  }

  /* ---------- depot dans la file Supabase ---------- */

  /*
    Une ligne de voice_inbox ne contient que du texte. L'audio reste sur
    l'appareil et n'ira nulle part : c'est ce qui evite Supabase Storage.

    La table n'accepte qu'une fois chaque client_key. Un doublon revient donc
    en 409, et ce refus est une CONFIRMATION, pas un echec : il signifie que
    la ligne est deja arrivee lors d'une tentative precedente dont la
    suppression locale avait echoue. Le traiter comme une erreur creerait
    exactement le doublon que la contrainte empeche.
  */
  function looksLikeDuplicate(status, detail) {
    if (status === 409) {
      return true;
    }
    return /23505|duplicate key|already exists/i.test(String(detail || ""));
  }

  function buildPayload(recording) {
    return {
      clientKey: recording.clientKey,
      capturedAt: recording.createdAt,
      durationMs: recording.durationMs || 0,
      mimeType: recording.mimeType || "",
      model: recording.transcribedWith || "",
      transcript: recording.transcript || "",
      structured: recording.structured || null,
    };
  }

  async function sendToInbox({ recording, accessToken }) {
    const remote = AtlasApp.config.supabase;
    if (!accessToken) {
      throw new Error("Session Supabase absente ou expiree.");
    }
    if (!recording?.clientKey) {
      throw new Error("Enregistrement sans identifiant de capture.");
    }

    const response = await fetch(`${remote.url}/rest/v1/voice_inbox`, {
      method: "POST",
      headers: {
        apikey: remote.publishableKey,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        // Rien a relire : on economise l'aller-retour.
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        client_key: recording.clientKey,
        payload: buildPayload(recording),
      }),
    });

    if (response.ok) {
      return { delivered: true, duplicate: false };
    }

    const detail = await response.text();
    if (looksLikeDuplicate(response.status, detail)) {
      return { delivered: true, duplicate: true };
    }

    if (response.status === 401 || response.status === 403) {
      throw new Error("Refuse par Supabase : reconnecte-toi sur cette page.");
    }

    throw new Error(detail || `Supabase a repondu ${response.status}.`);
  }

  /* ---------- configuration Gemini, cote page de dictee ---------- */

  // Meme cle de stockage et meme forme que l'application, via le normaliseur
  // partage de config.js. Le stockage etant cloisonne sur iOS, la valeur est
  // propre a ce contexte : une cle saisie ici ne remonte pas dans Atlas.
  function loadConfig() {
    try {
      const raw = global.localStorage.getItem(AtlasApp.config.aiStorageKey);
      return AtlasApp.normalizeAiConfig(raw ? JSON.parse(raw) : {});
    } catch (error) {
      return AtlasApp.normalizeAiConfig({});
    }
  }

  function saveConfig(raw) {
    const config = AtlasApp.normalizeAiConfig(raw);
    try {
      global.localStorage.setItem(AtlasApp.config.aiStorageKey, JSON.stringify(config));
    } catch (error) {
      // Stockage plein : la cle vaut pour cette visite seulement.
    }
    return config;
  }

  AtlasApp.voiceSend = {
    baseMimeType,
    checkSize,
    estimateRequestBytes,
    loadConfig,
    maxRequestBytes,
    saveConfig,
    sendToInbox,
    transcribe,
  };
})(window);
