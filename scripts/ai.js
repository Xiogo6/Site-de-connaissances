(function initializeAiModule(global) {
  const AtlasApp = (global.AtlasApp = global.AtlasApp || {});

  AtlasApp.createAiModule = function createAiModule(context) {
    const storageKey = AtlasApp.config.aiStorageKey;
    const defaultModel = AtlasApp.config.geminiDefaultModel;
    const apiBaseUrl = AtlasApp.config.geminiOpenAiBaseUrl;

    function normalizeConfig(raw = {}) {
      const model = sanitizeModel(raw.model);
      return {
        apiKey: typeof raw.apiKey === "string" ? raw.apiKey.trim() : "",
        model,
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
        throw new Error("Ajoute d'abord ta cle Gemini.");
      }

      setStatus({
        busy: true,
        type: "working",
        message: "Test de connexion Gemini...",
        error: "",
      });

      try {
        const content = await callGemini(
          [
            {
              role: "system",
              content: "Return only valid JSON.",
            },
            {
              role: "user",
              content: 'Answer with only this JSON object: {"ok":true,"message":"pong"}.',
            },
          ],
          config,
          {
            temperature: 0,
          }
        );

        const payload = parseJsonPayload(content);
        if (!payload || payload.ok !== true) {
          throw new Error("La reponse de test est invalide.");
        }

        setStatus({
          busy: false,
          type: "success",
          message: "Connexion Gemini OK.",
          error: "",
          lastRunAt: new Date().toISOString(),
        });
      } catch (error) {
        setStatus({
          busy: false,
          type: "error",
          message: "Echec du test Gemini.",
          error: error.message || "Connexion impossible.",
        });
        throw error;
      }
    }

    async function improveActiveNote() {
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
        message: "Gemini relit la note et ses questions...",
        error: "",
      });

      try {
        const content = await callGemini(
          [
            {
              role: "system",
              content:
                "You rewrite personal notes and produce concise study questions. Return only valid JSON.",
            },
            {
              role: "user",
              content: buildNotePrompt({
                title: draftTitle,
                type: draftType,
                metadata: draftMetadata,
                content: draftContent,
                existingQuestions,
              }),
            },
          ],
          config,
          {
            temperature: 0.2,
          }
        );

        const payload = normalizeResult(parseJsonPayload(content), note, draftTitle);
        applyAssistantResult(note, payload, draftTitle);

        setStatus({
          busy: false,
          type: "success",
          message: "Note et questions mises a jour.",
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

    async function callGemini(messages, config, options = {}) {
      const response = await fetch(`${apiBaseUrl}chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: config.model,
          messages,
          temperature:
            typeof options.temperature === "number" ? options.temperature : 0.2,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Gemini a repondu avec le statut ${response.status}.`);
      }

      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== "string" || !content.trim()) {
        throw new Error("Gemini a renvoye une reponse vide.");
      }

      return content;
    }

    function buildNotePrompt({ title, type, metadata, content, existingQuestions }) {
      const existingQuestionLines = existingQuestions.length
        ? existingQuestions
            .map(
              (question) =>
                `- ${question.question} => ${question.answers.join(" | ")}`
            )
            .join("\n")
        : "- Aucune";

      return [
        "Tu ameliores une note personnelle.",
        "",
        "Objectif :",
        "- clarifier la note",
        "- garder toute l'information utile",
        "- n'inventer aucun fait",
        "- generer des questions de rappel actif",
        "- conserver le titre fourni sans le changer",
        "",
        "Contraintes de sortie :",
        '- retourne uniquement un JSON valide, sans markdown ni commentaire',
        '- le JSON doit contenir les cles "content" et "quizQuestions"',
        '- quizQuestions doit etre un tableau d objets avec les cles "question" et "answers"',
        "- answers doit etre un tableau de chaines",
        "- content doit commencer par la ligne # avec le titre fourni",
        "- les questions doivent rester courtes et directement exploitables pour un quiz",
        "- pour une personne, privilegie naissance, deces, role et realisations",
        "- pour un evenement, privilegie debut, fin, cause et consequence",
        "- pour une date, fais ressortir la date exacte ou la periode",
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

    function normalizeResult(payload, note, fallbackTitle) {
      const content = ensureLeadingHeading(
        typeof payload?.content === "string" ? payload.content : "",
        fallbackTitle || note.title || "Sans titre"
      );
      const quizQuestions = Array.isArray(payload?.quizQuestions)
        ? payload.quizQuestions
        : [];

      return {
        content,
        quizQuestions: context.data.normalizeQuizQuestionCollection(quizQuestions, note.id),
      };
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

    function applyAssistantResult(note, result, fallbackTitle) {
      const nextContent = ensureLeadingHeading(result.content, fallbackTitle || note.title);
      const currentTitle = context.elements.titleInput?.value.trim() || fallbackTitle || note.title;

      context.elements.contentInput.value = nextContent;
      context.notes.handleEditorContentChange();
      if (context.elements.titleInput.value.trim() !== currentTitle) {
        context.elements.titleInput.value = currentTitle;
      }

      const mergedQuestions = mergeQuizQuestions(
        context.state.editorQuizQuestions || [],
        result.quizQuestions,
        note.id
      );

      context.state.editorQuizQuestions = mergedQuestions;
      context.state.editorQuizQuestionsNoteId = note.id;
      context.notes.saveCurrentNote({ stayInEdit: true });
    }

    return {
      applyActiveNoteAssistant: improveActiveNote,
      focusSettings,
      getConfig,
      getDefaultStatus,
      hasApiKey,
      loadConfig,
      saveConfig,
      setStatus,
      testConnection,
    };
  };
})(window);
