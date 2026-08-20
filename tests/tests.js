/*
  Chaque test correspond a quelque chose qui a reellement casse, ou qui
  protege une donnee. On epingle le comportement observe, pas un ideal.
*/
(function definirTests(global) {
  const { suite, test, attendre } = global.Harnais;
  const { config, helpers } = global.AtlasApp;

  /* ------------------------------------------------------------------ */
  suite("Contrat des modules", () => {
    test("chaque fabrique de module est presente", () => {
      for (const nom of [
        "createAuthModule", "createDataModule", "createAiModule",
        "createNotesModule", "createGraphModule", "createQuizModule",
        "createMascotModule", "createTodosModule", "createRenderersModule",
        "createEventsModule", "createElements",
      ]) {
        attendre(global.AtlasApp[nom]).estUneFonction();
      }
    });

    test("helpers expose toutes les fonctions attendues", () => {
      for (const nom of [
        "clamp", "decodeHtmlEntities", "escapeHtml", "extractLinks",
        "extractSummary", "formatFlexibleDate", "formatDate",
        "getFlexibleDateTimestamp", "normalizeTag", "normalizeTagList",
        "normalizeFlexibleDateInput", "parseTags", "parseFlexibleDateParts",
        "normalizeLinkTitle", "renderInline", "renderNoteHtml", "shuffle",
        "toKebab", "unique",
      ]) {
        attendre(helpers[nom]).estUneFonction();
      }
    });

    // Verifier que la fabrique existe ne suffit pas : c'est un export manquant
    // dans l'objet retourne qui avait casse, et seul le navigateur l'avait vu.
    // On instancie donc chaque module et on controle ce qu'il expose.
    test("chaque module expose les fonctions que les autres lui appellent", () => {
      const contexte = {
        state: { notes: [], settings: {}, snapshots: [], remote: {} },
        elements: {},
        auth: { isConfigured: () => false, isSignedIn: () => false, getAccessToken: async () => "" },
      };
      contexte.data = global.AtlasApp.createDataModule(contexte);
      contexte.notes = global.AtlasApp.createNotesModule(contexte);
      contexte.renderers = global.AtlasApp.createRenderersModule(contexte);
      contexte.quiz = global.AtlasApp.createQuizModule(contexte);

      const attendus = {
        data: ["loadNotes", "saveNotes", "saveSnapshots", "restoreSnapshotById",
               "updateReviewState", "createReviewState", "normalizeNoteCollection",
               "normalizeSnapshot", "bootstrapWorkspace", "isReadOnlyMode"],
        notes: ["getActiveNote", "getDueNotes", "isNoteDue", "saveCurrentNote",
                "cancelEditingNote", "deleteNoteById", "buildHierarchyForest",
                "getFolderDescendantNotes", "isOrphanNote"],
        renderers: ["renderEverything", "renderTabs", "renderFeed", "renderKnowledgeList",
                    "renderDueReviewList", "renderTypeSettingsList", "renderPreview",
                    "renderWorkspaceBanner", "syncDynamicControls"],
        quiz: ["buildQuizSession", "validateQuizSession", "renderQuizCard",
               "renderQuizDashboard", "renderQuizViewMode"],
      };

      const manquants = [];
      for (const [module, fonctions] of Object.entries(attendus)) {
        for (const fonction of fonctions) {
          if (typeof contexte[module][fonction] !== "function") {
            manquants.push(`${module}.${fonction}`);
          }
        }
      }
      attendre(manquants.join(", ")).vaut("");
    });

    test("config porte les cles dont depend la persistance", () => {
      attendre(typeof config.storageKey).vaut("string");
      attendre(typeof config.appStorageKey).vaut("string");
      attendre(typeof config.snapshotStorageKey).vaut("string");
      attendre(Array.isArray(config.reviewIntervalsInHours)).vrai();
      attendre(config.reviewIntervalsInHours[0]).vaut(0);
    });
  });

  /* ------------------------------------------------------------------ */
  suite("Coherence du deploiement", () => {
    // Ce test aurait attrape C-04 : ai.js absent du service worker, qui
    // empechait purement et simplement l'application de demarrer hors ligne.
    test("chaque script de index.html est dans le cache du service worker", async () => {
      const html = await (await fetch("../index.html", { cache: "no-store" })).text();
      const sw = await (await fetch("../service-worker.js", { cache: "no-store" })).text();
      const scripts = [...html.matchAll(/<script src="\.\/([^"?]+)/g)].map((m) => m[1]);
      attendre(scripts.length > 10).vrai();

      const manquants = scripts.filter((chemin) => !sw.includes(`"./${chemin}"`));
      attendre(manquants.join(", ")).vaut("");
    });

    test("chaque feuille de style de index.html est dans le cache", async () => {
      const html = await (await fetch("../index.html", { cache: "no-store" })).text();
      const sw = await (await fetch("../service-worker.js", { cache: "no-store" })).text();
      const feuilles = [...html.matchAll(/<link rel="stylesheet" href="\.\/([^"?]+)/g)].map((m) => m[1]);
      attendre(feuilles.length > 0).vrai();

      const manquants = feuilles.filter((chemin) => !sw.includes(`"./${chemin}"`));
      attendre(manquants.join(", ")).vaut("");
    });

    test("aucun selecteur de dom.js ne pointe vers un element absent", async () => {
      const html = await (await fetch("../index.html", { cache: "no-store" })).text();
      const dom = await (await fetch("../scripts/dom.js", { cache: "no-store" })).text();
      const ids = [...dom.matchAll(/querySelector\("#([a-zA-Z0-9_-]+)"\)/g)].map((m) => m[1]);
      attendre(ids.length > 50).vrai();

      const morts = [...new Set(ids)].filter((id) => !html.includes(`id="${id}"`));
      attendre(morts.join(", ")).vaut("");
    });
  });

  /* ------------------------------------------------------------------ */
  suite("Dates a precision variable", () => {
    test("accepte les formats courants", () => {
      attendre(helpers.normalizeFlexibleDateInput("14/07/1789")).vaut("1789-07-14");
      attendre(helpers.normalizeFlexibleDateInput("1789-07-14")).vaut("1789-07-14");
      attendre(helpers.normalizeFlexibleDateInput("14071789")).vaut("1789-07-14");
      attendre(helpers.normalizeFlexibleDateInput("1453-05")).vaut("1453-05");
      attendre(helpers.normalizeFlexibleDateInput("900")).vaut("900");
      attendre(helpers.normalizeFlexibleDateInput("")).vaut("");
    });

    test("conserve la precision reelle", () => {
      attendre(helpers.parseFlexibleDateParts("900").precision).vaut("year");
      attendre(helpers.parseFlexibleDateParts("1453-05").precision).vaut("month");
      attendre(helpers.parseFlexibleDateParts("1789-07-14").precision).vaut("day");
      attendre(helpers.parseFlexibleDateParts("nimporte")).vaut(null);
    });

    test("un aller-retour ne perd pas d'information", () => {
      for (const valeur of ["900", "1453-05", "1789-07-14"]) {
        const affiche = helpers.formatFlexibleDate(valeur);
        attendre(helpers.normalizeFlexibleDateInput(affiche)).vaut(valeur);
      }
    });

    test("l'ordre chronologique est respecte", () => {
      const a = helpers.getFlexibleDateTimestamp("900");
      const b = helpers.getFlexibleDateTimestamp("1453-05");
      const c = helpers.getFlexibleDateTimestamp("1789-07-14");
      attendre(a < b && b < c).vrai();
    });
  });

  /* ------------------------------------------------------------------ */
  suite("Tags", () => {
    test("normalise casse, accents et pluriels simples", () => {
      attendre(helpers.normalizeTag("Sport")).vaut("sport");
      attendre(helpers.normalizeTag("sports")).vaut("sport");
      attendre(helpers.normalizeTag("Histoire")).vaut("histoire");
      attendre(helpers.normalizeTag("drapeaux")).vaut("drapeau");
    });

    // Comportement connu et FAUX (F-14), epingle volontairement : le corriger
    // separerait les tags deja enregistres de ceux a venir. Ce test doit etre
    // mis a jour le jour ou une migration accompagnera le correctif.
    test("BOGUE CONNU : les pluriels en -aux donnent un mot inexistant", () => {
      attendre(helpers.normalizeTag("chevaux")).vaut("chevau");
      attendre(helpers.normalizeTag("journaux")).vaut("journau");
      attendre(helpers.normalizeTag("temps")).vaut("temp");
    });

    test("la liste dedoublonne apres normalisation", () => {
      attendre(helpers.normalizeTagList(["Sport", "sports", "SPORT"])).equivaut(["sport"]);
      attendre(helpers.normalizeTagList(["", "  ", "art"])).equivaut(["art"]);
    });
  });

  /* ------------------------------------------------------------------ */
  suite("Rendu du contenu", () => {
    test("le contenu d'une page ne peut pas injecter de HTML", () => {
      const rendu = helpers.renderNoteHtml("# Titre\n\n<script>alert(1)</script>");
      attendre(rendu).neContientPas("<script>");
      attendre(rendu).contient("&lt;script&gt;");
    });

    test("une entite deja echappee ne se retrouve pas active", () => {
      const rendu = helpers.renderNoteHtml("&lt;img src=x onerror=alert(1)&gt;");
      attendre(rendu).neContientPas("<img");
    });

    test("le gras, l'italique et les liens wiki sont rendus", () => {
      attendre(helpers.renderInline("**gras**")).contient("<strong>gras</strong>");
      attendre(helpers.renderInline("*doux*")).contient("<em>doux</em>");
      attendre(helpers.renderInline("[[Une page]]")).contient('data-link-title="Une page"');
    });

    test("puces et cases a cocher", () => {
      attendre(helpers.renderNoteHtml("- un\n- deux")).contient("<li>un</li>");
      attendre(helpers.renderNoteHtml("- [x] fait")).contient("checked");
    });

    test("extractLinks retrouve les liens wiki", () => {
      attendre(helpers.extractLinks("voir [[A]] et [[B]]")).equivaut(["A", "B"]);
      attendre(helpers.extractLinks("aucun lien")).equivaut([]);
    });
  });

  /* ------------------------------------------------------------------ */
  suite("Normalisation des titres de lien", () => {
    // decodeHtmlEntities a ete optimise : raccourci quand il n'y a pas de "&",
    // element DOM reutilise, et normalizeLinkTitle memoise. Ces tests verifient
    // que l'optimisation n'a rien change au resultat.
    test("casse, accents et espaces sont neutralises", () => {
      attendre(helpers.normalizeLinkTitle("  Mémoire   Active ")).vaut("memoire active");
      attendre(helpers.normalizeLinkTitle("MÉMOIRE ACTIVE")).vaut("memoire active");
    });

    test("les apostrophes typographiques sont ramenees a une seule forme", () => {
      attendre(helpers.normalizeLinkTitle("L’effet")).vaut(helpers.normalizeLinkTitle("L'effet"));
    });

    test("les entites HTML sont decodees, avec ou sans raccourci", () => {
      attendre(helpers.decodeHtmlEntities("sans esperluette")).vaut("sans esperluette");
      attendre(helpers.decodeHtmlEntities("a &amp; b")).vaut("a & b");
      attendre(helpers.decodeHtmlEntities("&lt;tag&gt;")).vaut("<tag>");
      attendre(helpers.decodeHtmlEntities("")).vaut("");
    });

    test("la memoisation renvoie toujours le meme resultat", () => {
      const premier = helpers.normalizeLinkTitle("Côte d'Ivoire");
      for (let i = 0; i < 200; i += 1) {
        attendre(helpers.normalizeLinkTitle("Côte d'Ivoire")).vaut(premier);
      }
      attendre(premier).vaut("cote d'ivoire");
    });
  });

  /* ------------------------------------------------------------------ */
  suite("Persistance defensive", () => {
    function contexteFactice() {
      return {
        state: {
          notes: [], settings: {}, snapshots: [],
          remote: { enabled: false, status: "local", lastSyncedAt: null, lastError: "" },
        },
        auth: { isConfigured: () => false, isSignedIn: () => false, getAccessToken: async () => "" },
      };
    }

    test("une collection qui n'est pas un tableau ne casse rien", () => {
      const data = global.AtlasApp.createDataModule(contexteFactice());
      attendre(data.normalizeNoteCollection(null)).equivaut([]);
      attendre(data.normalizeNoteCollection("texte")).equivaut([]);
      attendre(data.normalizeNoteCollection(undefined)).equivaut([]);
    });

    test("des donnees corrompues degradent au lieu de casser", () => {
      const data = global.AtlasApp.createDataModule(contexteFactice());
      const abime = [null, "texte", 42, undefined, {}, { id: "ok", title: "Bon" }];
      const propre = data.normalizeNoteCollection(abime);
      attendre(Array.isArray(propre)).vrai();
      // les entrees qui n'ont jamais pu etre une page sont ecartees,
      // pas transformees en pages fantomes
      attendre(propre.length).vaut(2);
      attendre(propre[1].title).vaut("Bon");
      for (const note of propre) {
        attendre(typeof note.id).vaut("string");
        attendre(typeof note.title).vaut("string");
        attendre(Array.isArray(note.tags)).vrai();
        attendre(Array.isArray(note.quizQuestions)).vrai();
      }
    });

    // I-05 : un snapshot arrive desormais sans ses notes. notesLoaded distingue
    // "vide" de "pas encore telecharge", et empeche de renvoyer un tableau vide
    // qui ecraserait le contenu conserve en base.
    test("notesLoaded distingue un snapshot vide d'un snapshot non charge", () => {
      const data = global.AtlasApp.createDataModule(contexteFactice());
      const nonCharge = data.normalizeSnapshot({ id: "s1", noteCount: 78, notes: [] });
      attendre(nonCharge.notesLoaded).faux();

      const charge = data.normalizeSnapshot({ id: "s2", noteCount: 1, notes: [{ id: "a", title: "A" }] });
      attendre(charge.notesLoaded).vrai();

      const vide = data.normalizeSnapshot({ id: "s3", noteCount: 0, notes: [] });
      attendre(vide.notesLoaded).vrai();
    });

    // C-03 : cette fonction existait mais n'etait jamais appelee, ce qui rendait
    // toutes les pages "a revoir" en permanence.
    test("une bonne reponse repousse la revision, une mauvaise la ramene", () => {
      const contexte = contexteFactice();
      const data = global.AtlasApp.createDataModule(contexte);
      contexte.state.notes = [{
        id: "n1", title: "N", type: "concept", tags: [], content: "", quizQuestions: [],
        review: data.createReviewState(),
      }];

      data.updateReviewState("n1", true);
      const apresJuste = contexte.state.notes[0].review;
      attendre(apresJuste.streak).vaut(1);
      attendre(Date.parse(apresJuste.nextReviewAt) > Date.now() + 60000).vrai();
      attendre(typeof apresJuste.lastReviewedAt).vaut("string");

      data.updateReviewState("n1", false);
      const apresFausse = contexte.state.notes[0].review;
      attendre(apresFausse.streak).vaut(0);
      attendre(Date.parse(apresFausse.nextReviewAt) <= Date.now() + 1000).vrai();
    });

    test("la serie ne depasse pas le dernier palier defini", () => {
      const contexte = contexteFactice();
      const data = global.AtlasApp.createDataModule(contexte);
      contexte.state.notes = [{
        id: "n2", title: "N", type: "concept", tags: [], content: "", quizQuestions: [],
        review: data.createReviewState(),
      }];
      for (let i = 0; i < 20; i += 1) data.updateReviewState("n2", true);
      attendre(contexte.state.notes[0].review.streak).vaut(config.reviewIntervalsInHours.length - 1);
    });
  });
})(window);
