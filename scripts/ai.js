(function initializeAiModule(global) {
  const AtlasApp = (global.AtlasApp = global.AtlasApp || {});

  AtlasApp.createAiModule = function createAiModule(context) {
    const storageKey = AtlasApp.config.aiStorageKey;
    const defaultModel = AtlasApp.config.geminiDefaultModel;
    const apiBaseUrl = AtlasApp.config.geminiBaseUrl;

    function normalizeConfig(raw = {}) {
      return {
        apiKey: typeof raw.apiKey === "string" ? raw.apiKey.trim() : "",
        model: sanitizeModel(raw.model),
      };
    }

    function sanitizeModel(value) {
      const model = String(value || "").trim();
      return model || defaultModel;
    }

    function getDefaultStatus() {
      return {
        busy: false,
        type: "idle",
        message: "",
        error: "",
        lastRunAt: null,
      };
    }

    function loadConfig() {
      try {
        const raw = window.localStorage.getItem(storageKey);
        if (!raw) {
          return normalizeConfig();
        }

        return normalizeConfig(JSON.parse(raw));
      } catch (error) {
        return normalizeConfig();
      }
    }

    function saveConfig(config = context.state.aiConfig) {
      const nextConfig = normalizeConfig(config);
      context.state.aiConfig = nextConfig;
      window.localStorage.setItem(storageKey, JSON.stringify(nextConfig));
      return nextConfig;
    }

    function getConfig() {
      return normalizeConfig(context.state.aiConfig);
    }

    function hasApiKey() {
      return Boolean(getConfig().apiKey);
    }

    function setStatus(patch = {}) {
      context.state.aiStatus = {
        ...getDefaultStatus(),
        ...context.state.aiStatus,
        ...patch,
      };
      context.renderers?.renderAiSettings();
      context.renderers?.renderKnowledgeMode();
    }

    function readConfigFromInputs() {
      return normalizeConfig({
        apiKey: context.elements.aiApiKeyInput?.value,
        model: context.elements.aiModelInput?.value,
      });
    }

    function syncInputsToState() {
      const nextConfig = readConfigFromInputs();
      context.state.aiConfig = nextConfig;
      return nextConfig;
    }

    function focusSettings() {
      context.state.activeTab = "settings";
      context.state.utilityDrawerOpen = false;
      context.renderers.renderEverything();
      window.requestAnimationFrame(() => {
        context.elements.aiApiKeyInput?.focus();
        context.elements.aiApiKeyInput?.select?.();
      });
    }

    async function testConnection() {
      const config = saveConfig(syncInputsToState());
      if (!config.apiKey) {
        setStatus({
          busy: false,
          type: "error",
          message: "Ajoute d'abord ta cle Gemini.",
          error: "Aucune cle API n'a ete fournie.",
        });
        return false;
      }

      setStatus({
        busy: true,
        type: "working",
        message: "Test de connexion Gemini...",
        error: "",
      });

      try {
        const content = await callGemini("Reponds uniquement par pong.", config, {
          temperature: 0,
        });

        if (String(content || "").trim().toLowerCase() !== "pong") {
          throw new Error("La reponse de test est invalide.");
        }

        setStatus({
          busy: false,
          type: "success",
          message: "Connexion Gemini OK.",
          error: "",
          lastRunAt: new Date().toISOString(),
        });
        return true;
      } catch (error) {
        setStatus({
          busy: false,
          type: "error",
          message: "Echec du test Gemini.",
          error: error.message || "Connexion impossible.",
        });
        return false;
      }
    }

    async function rewriteActiveNote() {
      const note = context.notes.getActiveNote();
      if (!note) {
        throw new Error("Aucune note active.");
      }

      const config = saveConfig(syncInputsToState());
      if (!config.apiKey) {
        throw new Error("Ajoute d'abord ta cle Gemini.");
      }

      const draftTitle = context.elements.titleInput?.value.trim() || note.title || "Sans titre";
      const draftContent = context.elements.contentInput?.value || note.content || "";
      const draftType = context.elements.typeInput?.value || note.type || "concept";
      const draftMetadata = context.notes.collectMetadataFromInputs
        ? context.notes.collectMetadataFromInputs()
        : note.metadata || {};

      captureRewriteBackup(note);

      setStatus({
        busy: true,
        type: "working",
        message: "Gemini re-ecrit la note...",
        error: "",
      });

      try {
        const content = await callGemini(
          buildRewritePrompt({
            title: draftTitle,
            type: draftType,
            metadata: draftMetadata,
            content: draftContent,
          }),
          config,
          {
            temperature: 0.2,
          }
        );

        const payload = parseJsonPayload(content);
        const rewrittenContent = normalizeRewritePayload(payload, draftTitle, note);
        applyRewriteResult(note, rewrittenContent, draftTitle);

        setStatus({
          busy: false,
          type: "success",
          message: "Reecriture appliquee. Tu peux l'annuler si besoin.",
          error: "",
          lastRunAt: new Date().toISOString(),
        });
      } catch (error) {
        clearRewriteBackup(note.id);
        setStatus({
          busy: false,
          type: "error",
          message: "Gemini a rencontre un probleme.",
          error: error.message || "Echec de l'assistant.",
        });
        throw error;
      }
    }

    async function generateQuestionsForActiveNote() {
      const note = context.notes.getActiveNote();
      if (!note) {
        throw new Error("Aucune note active.");
      }

      const config = saveConfig(syncInputsToState());
      if (!config.apiKey) {
        throw new Error("Ajoute d'abord ta cle Gemini.");
      }

      const draftTitle = context.elements.titleInput?.value.trim() || note.title || "Sans titre";
      const draftContent = context.elements.contentInput?.value || note.content || "";
      const draftType = context.elements.typeInput?.value || note.type || "concept";
      const draftMetadata = context.notes.collectMetadataFromInputs
        ? context.notes.collectMetadataFromInputs()
        : note.metadata || {};
      const existingQuestions = context.data.normalizeQuizQuestionCollection(
        context.state.editorQuizQuestions || note.quizQuestions || [],
        note.id
      );

      setStatus({
        busy: true,
        type: "working",
        message: "Gemini genere les questions...",
        error: "",
      });

      try {
        const content = await callGemini(
          buildQuestionPrompt({
            title: draftTitle,
            type: draftType,
            metadata: draftMetadata,
            content: draftContent,
            existingQuestions,
          }),
          config,
          {
            temperature: 0.35,
          }
        );

        const payload = parseJsonPayload(content);
        const quizQuestions = normalizeQuestionPayload(payload, note);
        applyQuestionsResult(note, quizQuestions);

        setStatus({
          busy: false,
          type: "success",
          message: "Questions mises a jour.",
          error: "",
          lastRunAt: new Date().toISOString(),
        });
      } catch (error) {
        setStatus({
          busy: false,
          type: "error",
          message: "Gemini a rencontre un probleme.",
          error: error.message || "Echec de l'assistant.",
        });
        throw error;
      }
    }

    function captureRewriteBackup(note) {
      context.state.aiRewriteBackup = {
        noteId: note.id,
        noteSnapshot: cloneValue(note),
        editorSnapshot: {
          title: context.elements.titleInput?.value.trim() || note.title || "Sans titre",
          content: context.elements.contentInput?.value || note.content || "",
          type: context.elements.typeInput?.value || note.type || "concept",
          metadata: context.notes.collectMetadataFromInputs
            ? context.notes.collectMetadataFromInputs()
            : cloneValue(note.metadata || {}),
          quizQuestions: cloneValue(context.state.editorQuizQuestions || note.quizQuestions || []),
        },
        capturedAt: new Date().toISOString(),
      };
      context.renderers?.renderKnowledgeMode();
    }

    function clearRewriteBackup(noteId = null) {
      if (noteId && context.state.aiRewriteBackup?.noteId !== noteId) {
        return;
      }

      context.state.aiRewriteBackup = null;
      context.renderers?.renderKnowledgeMode();
    }

    function hasRewriteBackup(noteId = context.state.activeNoteId) {
      return Boolean(context.state.aiRewriteBackup && context.state.aiRewriteBackup.noteId === noteId);
    }

    function restoreLastRewrite() {
      const backup = context.state.aiRewriteBackup;
      if (!backup) {
        setStatus({
          busy: false,
          type: "error",
          message: "Aucune reecriture a annuler.",
          error: "",
        });
        return false;
      }

      const note = context.notes.getActiveNote();
      if (!note || note.id !== backup.noteId) {
        clearRewriteBackup();
        setStatus({
          busy: false,
          type: "error",
          message: "Impossible de retrouver la note d'origine.",
          error: "",
        });
        return false;
      }

      context.state.noteViewMode = "edit";
      context.elements.titleInput.value = backup.noteSnapshot.title || note.title || "Sans titre";
      context.elements.contentInput.value = backup.noteSnapshot.content || note.content || "";
      context.notes.handleEditorContentChange();
      clearRewriteBackup();
      context.notes.saveCurrentNote({ stayInEdit: true });
      setStatus({
        busy: false,
        type: "success",
        message: "Reecriture annulee.",
        error: "",
        lastRunAt: new Date().toISOString(),
      });
      return true;
    }

    async function callGemini(prompt, config, options = {}) {
      const response = await fetch(
        `${apiBaseUrl}${encodeURIComponent(config.model)}:generateContent`,
        {
          method: "POST",
          headers: {
            "x-goog-api-key": config.apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [{ text: String(prompt || "") }],
              },
            ],
            generationConfig: {
              temperature: typeof options.temperature === "number" ? options.temperature : 0.2,
            },
          }),
        }
      );

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Gemini a repondu avec le statut ${response.status}.`);
      }

      const data = await response.json();
      const content = extractTextFromResponse(data);
      if (typeof content !== "string" || !content.trim()) {
        throw new Error("Gemini a renvoye une reponse vide.");
      }

      return content;
    }

    function extractTextFromResponse(data) {
      if (typeof data?.text === "string" && data.text.trim()) {
        return data.text;
      }

      const parts = data?.candidates?.[0]?.content?.parts;
      if (!Array.isArray(parts)) {
        return "";
      }

      return parts
        .map((part) => (typeof part?.text === "string" ? part.text : ""))
        .join("")
        .trim();
    }

    function buildRewritePrompt({ title, type, metadata, content }) {
      return [
        "Tu es un redacteur qui relit une note personnelle.",
        "",
        "Objectif :",
        "- corriger l'orthographe, la grammaire et la ponctuation",
        "- clarifier le texte sans changer le sens",
        "- reformuler legerement si cela rend la lecture plus simple",
        "- garder toutes les informations utiles presentes dans la note",
        "- ne pas fabriquer de nouveaux faits",
        "- conserver le titre fourni sans le changer",
        "- ne pas generer de questions ici",
        "- rendre la note plus lisible meme si le sujet est technique",
        "",
        "Mise en forme Markdown :",
        "- garder le titre principal en # Titre",
        "- utiliser des sous-titres en ## si cela aide",
        "- utiliser des puces - pour les listes et les idees courtes",
        "- mettre en gras les termes importants avec **...**",
        "- utiliser l'italique *...* seulement pour nuancer",
        "- utiliser des liens wiki [[Nom de page]] quand une autre page pertinente existe",
        "- garder les sources ou references utiles en bas si elles sont deja presentes",
        "",
        "Contraintes de sortie :",
        '- retourne uniquement un JSON valide, sans markdown ni commentaire',
        '- le JSON doit contenir uniquement la cle "content"',
        "- content doit commencer par la ligne # avec le titre fourni",
        "- une idee par ligne ou par puce quand c est pertinent",
        "- si une phrase est ambigue, reste sobre sans changer le sens",
        "- si la note contient une personne, fais ressortir naissance, deces, role et realisations",
        "- si la note contient un evenement, fais ressortir debut, fin, cause et consequence",
        "- si la note contient une date, fais ressortir la date exacte ou la periode",
        "",
        `Titre: ${title}`,
        `Type: ${type}`,
        `Metadata: ${JSON.stringify(metadata || {})}`,
        "",
        "Contenu brut :",
        content || "",
      ].join("\n");
    }

    function buildQuestionPrompt({ title, type, metadata, content, existingQuestions }) {
      const existingQuestionLines = existingQuestions.length
        ? existingQuestions
            .map((question) => `- ${question.question} => ${question.answers.join(" | ")}`)
            .join("\n")
        : "- Aucune";

      return [
        "Tu es un redacteur de questions de revision.",
        "",
        "Objectif :",
        "- fabriquer des questions basees sur la note fournie",
        "- viser un niveau intermediaire a complexe",
        "- garder les questions pertinentes et directement liees au texte",
        "- eviter les questions culturelles hors sujet",
        "- proposer des formulations claires et naturelles",
        "- garder les reponses tres courtes",
        "- ne pas forcer une question si la note est trop pauvre ou trop floue",
        "",
        "Regles de questions :",
        "- une question par point cle quand c est pertinent",
        "- tu peux proposer des variantes de bonne reponse",
        "- chaque reponse doit tenir en 3 mots maximum",
        "- utilise plusieurs orthographes ou formulations proches dans le tableau answers",
        "- si une info est absente ou trop incertaine, n invente rien",
        "- si un autre sujet partage la meme reponse, une double reference est autorisee",
        "",
        "Contraintes de sortie :",
        '- retourne uniquement un JSON valide, sans markdown ni commentaire',
        '- le JSON doit contenir la cle "quizQuestions"',
        '- quizQuestions doit etre un tableau d objets avec les cles "question" et "answers"',
        "- answers doit etre un tableau de chaines courtes",
        "- si aucune question pertinente n est possible, renvoie un tableau vide",
        "",
        `Titre: ${title}`,
        `Type: ${type}`,
        `Metadata: ${JSON.stringify(metadata || {})}`,
        "",
        "Contenu brut :",
        content || "",
        "",
        "Questions deja presentes :",
        existingQuestionLines,
      ].join("\n");
    }

    function parseJsonPayload(text) {
      let source = String(text || "").trim();
      if (!source) {
        throw new Error("La reponse ne contient rien de lisible.");
      }

      if (source.startsWith("```")) {
        source = source.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
      }

      const firstBrace = source.indexOf("{");
      const lastBrace = source.lastIndexOf("}");
      if (firstBrace >= 0 && lastBrace > firstBrace) {
        source = source.slice(firstBrace, lastBrace + 1);
      }

      try {
        return JSON.parse(source);
      } catch (error) {
        throw new Error("Impossible de lire le JSON renvoye par Gemini.");
      }
    }

    function normalizeRewritePayload(payload, fallbackTitle, note) {
      const content = ensureLeadingHeading(
        typeof payload?.content === "string" ? payload.content : "",
        fallbackTitle || note.title || "Sans titre"
      );

      if (!content) {
        throw new Error("La reponse ne contient pas de contenu exploitable.");
      }

      return content;
    }

    function normalizeQuestionPayload(payload, note) {
      const quizQuestions = Array.isArray(payload?.quizQuestions)
        ? payload.quizQuestions
        : [];

      return context.data.normalizeQuizQuestionCollection(quizQuestions, note.id);
    }

    function ensureLeadingHeading(content, title) {
      const fallback = `# ${title || "Sans titre"}`;
      const value = String(content || "").trim();
      if (!value) {
        return fallback;
      }

      const lines = value.split("\n");
      const headingIndex = lines.findIndex((line) => line.trim().length > 0);
      if (headingIndex === -1) {
        return fallback;
      }

      if (lines[headingIndex].startsWith("# ")) {
        lines[headingIndex] = `# ${title || "Sans titre"}`;
        return lines.join("\n").trim();
      }

      return `${fallback}\n\n${lines.join("\n").trim()}`.trim();
    }

    function normalizeQuestionKey(question) {
      const normalizedQuestion = String(question?.question || "")
        .trim()
        .toLowerCase();
      const normalizedAnswers = Array.isArray(question?.answers)
        ? [...question.answers]
            .map((answer) => String(answer || "").trim().toLowerCase())
            .filter(Boolean)
            .join("||")
        : "";

      return `${normalizedQuestion}::${normalizedAnswers}`;
    }

    function mergeQuizQuestions(existingQuestions, incomingQuestions, noteId) {
      const merged = [];
      const seen = new Set();

      [...existingQuestions, ...incomingQuestions].forEach((question) => {
        const normalized = context.data.normalizeQuizQuestionCollection([question], noteId)[0];
        if (!normalized) {
          return;
        }

        const key = normalizeQuestionKey(normalized);
        if (seen.has(key)) {
          return;
        }

        seen.add(key);
        merged.push(normalized);
      });

      return merged;
    }

    function applyRewriteResult(note, rewrittenContent, fallbackTitle) {
      const nextContent = ensureLeadingHeading(rewrittenContent, fallbackTitle || note.title);

      context.elements.contentInput.value = nextContent;
      context.notes.handleEditorContentChange();
      context.notes.saveCurrentNote({ stayInEdit: true });
    }

    function applyQuestionsResult(note, quizQuestions) {
      const mergedQuestions = mergeQuizQuestions(
        context.state.editorQuizQuestions || [],
        quizQuestions,
        note.id
      );

      context.state.editorQuizQuestions = mergedQuestions;
      context.state.editorQuizQuestionsNoteId = note.id;
      context.notes.saveCurrentNote({ stayInEdit: true });
    }

    function cloneValue(value) {
      if (typeof structuredClone === "function") {
        return structuredClone(value);
      }

      return JSON.parse(JSON.stringify(value));
    }

    return {
      applyActiveNoteAssistant: rewriteActiveNote,
      clearRewriteBackup,
      focusSettings,
      generateQuestionsForActiveNote,
      getConfig,
      getDefaultStatus,
      hasApiKey,
      hasRewriteBackup,
      loadConfig,
      restoreLastRewrite,
      rewriteActiveNote,
      saveConfig,
      setStatus,
      testConnection,
    };
  };
})(window);
