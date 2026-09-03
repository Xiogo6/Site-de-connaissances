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
            temperature: 0,
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

    // Le rangement est un appel a part, jamais melange a la reecriture.
    // Une consigne permissive (propose un dossier) noyee dans un prompt
    // restrictif (n ajoute rien) rouvre la derive decrite dans
    // PROMPT_REDACTION_NOTES.md : le modele qui range se remet a enrichir.
    // Le prompt effectif est double dans PROMPT_RANGEMENT_NOTES.md : toute
    // modification ici doit y etre reportee.
    function buildFolderCatalogue() {
      const parPage = new Map(context.state.notes.map((note) => [note.id, note]));
      const cheminDe = (note) => {
        const morceaux = [];
        let courant = note;
        const vus = new Set();
        while (courant && !vus.has(courant.id)) {
          vus.add(courant.id);
          morceaux.unshift(courant.title);
          courant = courant.parentId ? parPage.get(courant.parentId) : null;
        }
        return morceaux.join(" / ");
      };

      return context.state.notes
        .filter((note) => note.type === "folder")
        .map((note) => ({ id: note.id, title: note.title, path: cheminDe(note) }))
        .sort((gauche, droite) => gauche.path.localeCompare(droite.path, "fr", { sensitivity: "base" }));
    }

    function buildPlacementPrompt({ title, type, content, folders }) {
      const catalogue = folders.length
        ? folders.map((folder) => `- ${folder.path}`).join("\n")
        : "- Aucun dossier n existe encore";

      return [
        "Tu ranges une note dans une arborescence de dossiers deja en place.",
        "Tu ne reecris pas la note et tu ne la commentes pas.",
        "",
        "Regle principale :",
        "- choisis en priorite un dossier de la liste, tel qu il est ecrit",
        "- ne propose un nouveau dossier que si aucun dossier existant ne convient vraiment",
        "- en cas d hesitation entre deux dossiers existants, prends le plus precis",
        "- un dossier existant approximatif vaut mieux qu un nouveau dossier de plus",
        "",
        "Objectif :",
        "- respecter la nomenclature existante : sa langue, sa casse, son niveau de detail",
        "- si tu proposes un nouveau dossier, le nommer dans le meme style que les autres",
        "- rester au niveau de generalite des dossiers deja presents",
        "",
        "Interdictions :",
        "- ne pas inventer un chemin de dossier qui n est pas dans la liste",
        "- ne pas proposer un nouveau dossier pour une seule note quand un dossier general existe",
        "- ne pas repondre les deux a la fois : un dossier existant ou un nouveau, pas les deux",
        "",
        "Contraintes de sortie :",
        "- retourne uniquement un JSON valide, sans markdown ni commentaire",
        '- le JSON contient exactement les cles "folder", "newFolder" et "reason"',
        '- "folder" : le chemin exact d un dossier de la liste, sinon null',
        '- "newFolder" : le nom d un dossier a creer, sinon null',
        '- une seule des deux est non nulle, l autre vaut null',
        '- "reason" : une phrase courte, quinze mots au plus',
        "",
        "Dossiers existants :",
        catalogue,
        "",
        `Titre: ${title}`,
        `Type: ${type}`,
        "",
        "Contenu brut :",
        content || "",
      ].join("\n");
    }

    function normalizePlacementPayload(payload, folders) {
      const cheminPropose = typeof payload?.folder === "string" ? payload.folder.trim() : "";
      const nouveauDossier = typeof payload?.newFolder === "string" ? payload.newFolder.trim() : "";
      const raison = typeof payload?.reason === "string" ? payload.reason.trim() : "";

      // Le modele rend un chemin, pas un identifiant : on le rapproche d un
      // dossier reel. Un chemin qu on ne retrouve pas est traite comme une
      // invention, et bascule en proposition de nouveau dossier.
      const cible = cheminPropose
        ? folders.find(
            (folder) =>
              folder.path.toLowerCase() === cheminPropose.toLowerCase() ||
              folder.title.toLowerCase() === cheminPropose.toLowerCase()
          )
        : null;

      if (cible) {
        return { folderId: cible.id, folderPath: cible.path, newFolder: "", reason: raison };
      }

      return {
        folderId: "",
        folderPath: "",
        newFolder: nouveauDossier || cheminPropose,
        reason: raison,
      };
    }

    async function suggestPlacementForActiveNote() {
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
      // Une page ne se range pas dans elle-meme ni sous une de ses descendances.
      const folders = buildFolderCatalogue().filter(
        (folder) => folder.id !== note.id && context.notes.canMoveNote(note.id, folder.id)
      );

      setStatus({
        busy: true,
        type: "working",
        message: "Gemini cherche un emplacement...",
        error: "",
      });

      try {
        const content = await callGemini(
          buildPlacementPrompt({
            title: draftTitle,
            type: draftType,
            content: draftContent,
            folders,
          }),
          config,
          { temperature: 0 }
        );

        const suggestion = normalizePlacementPayload(parseJsonPayload(content), folders);
        context.state.aiPlacementSuggestion = { ...suggestion, noteId: note.id };
        context.renderers.renderEditorPlacementSuggestion();

        setStatus({
          busy: false,
          type: "success",
          message: suggestion.folderId
            ? "Emplacement propose."
            : "Aucun dossier existant ne convient.",
          error: "",
          lastRunAt: new Date().toISOString(),
        });
      } catch (error) {
        context.state.aiPlacementSuggestion = null;
        context.renderers.renderEditorPlacementSuggestion();
        setStatus({
          busy: false,
          type: "error",
          message: "Gemini a rencontre un probleme.",
          error: error.message || "Echec de l'assistant.",
        });
        throw error;
      }
    }

    function clearPlacementSuggestion() {
      context.state.aiPlacementSuggestion = null;
      context.renderers?.renderEditorPlacementSuggestion?.();
    }

    function captureRewriteBackup(note) {
      context.state.aiRewriteBackup = {
        noteId: note.id,
        noteSnapshot: cloneValue(note),
        editorSnapshot: {
          title: context.elements.titleInput?.value.trim() || note.title || "Sans titre",
          content: context.notes.getEditorComposedContent
            ? context.notes.getEditorComposedContent()
            : context.elements.contentInput?.value || note.content || "",
          type: context.elements.typeInput?.value || note.type || "concept",
          tags: context.helpers.parseTags
            ? context.helpers.parseTags(context.elements.tagsInput?.value || "")
            : cloneValue(note.tags || []),
          parentId: context.elements.parentInput?.value || note.parentId || "",
          favorite:
            typeof context.elements.favoriteInput?.checked === "boolean"
              ? context.elements.favoriteInput.checked
              : Boolean(note.favorite),
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

      const snapshot = backup.editorSnapshot || {};
      const metadata = snapshot.metadata || backup.noteSnapshot?.metadata || note.metadata || {};
      const restoredTitle =
        typeof snapshot.title === "string"
          ? snapshot.title
          : backup.noteSnapshot?.title || note.title || "Sans titre";
      const restoredType =
        typeof snapshot.type === "string" && snapshot.type.trim()
          ? snapshot.type
          : note.type || "concept";
      const restoredContent =
        typeof snapshot.content === "string"
          ? snapshot.content
          : backup.noteSnapshot?.content || note.content || "";
      context.state.noteViewMode = "edit";
      context.elements.titleInput.value = restoredTitle;
      context.elements.typeInput.value = restoredType;
      context.elements.tagsInput.value = Array.isArray(snapshot.tags)
        ? snapshot.tags.join(", ")
        : (note.tags || []).join(", ");
      context.elements.parentInput.value = snapshot.parentId || "";
      context.elements.favoriteInput.checked =
        typeof snapshot.favorite === "boolean" ? snapshot.favorite : Boolean(note.favorite);
      context.elements.noteHasDate.value = metadata.hasDate ? "true" : "false";
      context.elements.noteDateMode.value =
        !metadata.hasDate
          ? "none"
          : ["reference", "life", "range"].includes(metadata.dateMode)
          ? metadata.dateMode
          : "reference";
      context.elements.noteDateSingle.value = metadata.singleDate
        ? context.helpers.formatFlexibleDate(metadata.singleDate)
        : "";
      context.elements.noteDateStart.value = metadata.startDate
        ? context.helpers.formatFlexibleDate(metadata.startDate)
        : "";
      context.elements.noteDateEnd.value = metadata.endDate
        ? context.helpers.formatFlexibleDate(metadata.endDate)
        : "";
      context.notes.syncNewPageClassificationControls?.();
      context.renderers.renderStructuredFields?.();
      if (context.notes.setEditorComposedContent) {
        context.notes.setEditorComposedContent(restoredContent);
      } else {
        context.elements.contentInput.value = restoredContent;
      }
      context.state.editorQuizQuestions = cloneValue(
        snapshot.quizQuestions || backup.noteSnapshot?.quizQuestions || note.quizQuestions || []
      );
      context.state.editorQuizQuestionsNoteId = note.id;
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
        "Tu es un correcteur qui relit une note personnelle. Tu ne l'enrichis pas.",
        "",
        "Regle principale :",
        "- la note reecrite doit rester au maximum aussi longue que la note d'origine",
        "- en cas d'hesitation, choisis toujours la version la plus courte",
        "- tu n'ajoutes aucune information qui n'est pas deja dans la note",
        "",
        "Objectif :",
        "- corriger l'orthographe, la grammaire et la ponctuation",
        "- reformuler au plus court et au plus simple",
        "- clarifier sans changer le sens",
        "- garder toutes les informations deja presentes",
        "- conserver le titre fourni sans le changer",
        "",
        "Interdictions :",
        "- ne pas ajouter de definition, de date, de contexte ou d exemple absent de la note",
        "- ne pas completer une information partielle avec tes connaissances",
        "- ne pas developper un point que la note se contente d evoquer",
        "- ne pas creer de section ou de rubrique qui n existe pas deja",
        "- ne pas generer de questions",
        "",
        "Mise en forme Markdown :",
        "- conserver la structure d origine : des paragraphes restent des paragraphes, des puces restent des puces",
        "- garder le titre principal en # Titre",
        "- n utiliser un sous-titre ## que si la note en contient deja un",
        "- pour chaque puce Markdown, utiliser uniquement le marqueur - suivi d un espace : - element",
        "- ne jamais utiliser * suivi d un espace comme marqueur de puce",
        "- mettre en gras **...** au maximum 3 termes vraiment cles",
        "- garder les liens wiki [[Nom de page]] deja presents, ne jamais en creer de nouveaux",
        "- garder les sources ou references deja presentes en bas",
        "",
        "Contraintes de sortie :",
        '- retourne uniquement un JSON valide, sans markdown ni commentaire',
        '- le JSON doit contenir uniquement la cle "content"',
        "- content doit commencer par la ligne # avec le titre fourni",
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
        "- chaque question doit se suffire a elle-meme et rester comprehensible sans voir la note, son titre ou les autres questions",
        "- n utilise jamais une reference sans contexte comme ce sport, cette personne, cet evenement, ce pays, il ou elle",
        "- quand la reponse n est pas le titre, nomme clairement dans la question le sujet concerne : ecris par exemple Qui a cree le judo ? et non Qui a cree ce sport ?",
        "- le titre de la note peut lui-meme etre la reponse attendue",
        "- quand le titre est la reponse, fais deviner ce concept sans le nommer, a partir d une definition, de son role, de ses caracteristiques ou d indices suffisamment precis",
        "- evite de demander Quel est le titre de la note ? et evite toute formulation qui suppose que le lecteur connait deja le contexte",
        "- tu peux proposer des variantes de bonne reponse",
        "- chaque reponse doit tenir en 3 mots maximum",
        "- utilise plusieurs orthographes ou formulations proches dans le tableau answers",
        "- si une info est absente ou trop incertaine, n invente rien",
        "- si un autre sujet partage la meme reponse, une double reference est autorisee",
        "- avant de rendre le JSON, verifie que chaque question contient tout le contexte necessaire pour identifier sans ambiguite ce dont elle parle",
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

      if (context.notes.setEditorComposedContent) {
        context.notes.setEditorComposedContent(nextContent);
      } else {
        context.elements.contentInput.value = nextContent;
      }
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
      clearPlacementSuggestion,
      saveConfig,
      setStatus,
      suggestPlacementForActiveNote,
      testConnection,
    };
  };
})(window);
