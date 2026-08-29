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
        "createMascotModule", "createTodosModule", "createSportModule",
        "createRenderersModule",
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
      contexte.sport = global.AtlasApp.createSportModule(contexte);

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
        sport: ["bindEvents", "render", "renderTableZoom", "parseDateInput"],
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
    test.surServeur("chaque script de index.html est dans le cache du service worker", async () => {
      const html = await (await fetch("../index.html", { cache: "no-store" })).text();
      const sw = await (await fetch("../service-worker.js", { cache: "no-store" })).text();
      const scripts = [...html.matchAll(/<script src="\.\/([^"?]+)/g)].map((m) => m[1]);
      attendre(scripts.length > 10).vrai();

      const manquants = scripts.filter((chemin) => !sw.includes(`"./${chemin}"`));
      attendre(manquants.join(", ")).vaut("");
    });

    test.surServeur("chaque feuille de style de index.html est dans le cache", async () => {
      const html = await (await fetch("../index.html", { cache: "no-store" })).text();
      const sw = await (await fetch("../service-worker.js", { cache: "no-store" })).text();
      const feuilles = [...html.matchAll(/<link rel="stylesheet" href="\.\/([^"?]+)/g)].map((m) => m[1]);
      attendre(feuilles.length > 0).vrai();

      const manquants = feuilles.filter((chemin) => !sw.includes(`"./${chemin}"`));
      attendre(manquants.join(", ")).vaut("");
    });

    // Vingt references dans index.html plus CACHE_NAME doivent porter le meme
    // numero. Les tenir a la main derape : au 21 aout les fichiers etaient a
    // v86 et le cache a v87. Le navigateur sert alors un melange d'anciennes
    // et de nouvelles versions, symptome difficile a relier a sa cause.
    // Pour tout avancer d'un cran : zsh ./scripts/version.sh
    test.surServeur("les numeros de version sont tous identiques", async () => {
      const html = await (await fetch("../index.html", { cache: "no-store" })).text();
      const sw = await (await fetch("../service-worker.js", { cache: "no-store" })).text();

      const versions = [...new Set([...html.matchAll(/\?v=(\d+)/g)].map((m) => m[1]))];
      attendre(versions.length > 0).vrai();
      attendre(versions.sort().join(", ")).vaut(versions[0]);

      const cache = sw.match(/atlas-connaissance-v(\d+)/)?.[1] || "(absent)";
      attendre(`fichiers ${versions[0]} / cache ${cache}`).vaut(
        `fichiers ${versions[0]} / cache ${versions[0]}`
      );
    });

    // Le lanceur de tests charge sa propre liste de scripts. Elle doit suivre
    // celle de index.html, sinon les tests s'executent sur une application
    // amputee : c'est arrive a l'ajout de sport.js.
    test.surServeur("le lanceur de tests charge les memes scripts que l'application", async () => {
      const html = await (await fetch("../index.html", { cache: "no-store" })).text();
      const lanceur = await (await fetch("./index.html", { cache: "no-store" })).text();

      const attendus = [...html.matchAll(/<script src="\.\/scripts\/([^"?]+)/g)].map((m) => m[1]);
      const charges = [...lanceur.matchAll(/"\.\.\/scripts\/([^"?]+)"/g)].map((m) => m[1]);
      attendre(attendus.length > 10).vrai();

      const oublies = attendus.filter((f) => !charges.includes(f));
      attendre(oublies.join(", ")).vaut("");
    });

    test.surServeur("aucun selecteur de dom.js ne pointe vers un element absent", async () => {
      const html = await (await fetch("../index.html", { cache: "no-store" })).text();
      const dom = await (await fetch("../scripts/dom.js", { cache: "no-store" })).text();
      const ids = [...dom.matchAll(/querySelector\("#([a-zA-Z0-9_-]+)"\)/g)].map((m) => m[1]);
      attendre(ids.length > 50).vrai();

      const morts = [...new Set(ids)].filter((id) => !html.includes(`id="${id}"`));
      attendre(morts.join(", ")).vaut("");
    });

    // Le miroir du test precedent. Un selecteur que plus personne ne lit est
    // le signe d'un branchement perdu : c'est exactement ce qui etait arrive
    // au bouton "+ Ligne" du sport, reste en place mais debranche en sortant
    // sport.js de events.js. Rien ne l'avait signale.
    test.surServeur("aucun selecteur de dom.js n'est laisse sans lecteur", async () => {
      const lire = async (chemin) =>
        (await fetch(chemin, { cache: "no-store" })).text();
      const dom = await lire("../scripts/dom.js");
      const fichiers = [
        "../app.js", "../scripts/auth.js", "../scripts/data.js", "../scripts/ai.js",
        "../scripts/notes.js", "../scripts/graph.js", "../scripts/quiz.js",
        "../scripts/mascot.js", "../scripts/todos.js", "../scripts/sport.js",
        "../scripts/renderers.js", "../scripts/events.js",
      ];
      const sources = (await Promise.all(fichiers.map(lire))).join("\n");
      const noms = [...dom.matchAll(/^\s{6}(\w+): document\.querySelector/gm)].map((m) => m[1]);
      attendre(noms.length > 50).vrai();

      const orphelins = [...new Set(noms)].filter((nom) => !sources.includes(nom));
      attendre(orphelins.join(", ")).vaut("");
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

    // Au telephone, le pave numerique d'iOS ne propose ni barre oblique ni
    // tiret : sans saisie en chiffres seuls, le mois etait inatteignable et
    // la date ne pouvait pas etre remplie du tout.
    test("les trois precisions sont atteignables en chiffres seuls", () => {
      attendre(helpers.normalizeFlexibleDateInput("14071789")).vaut("1789-07-14");
      attendre(helpers.normalizeFlexibleDateInput("071789")).vaut("1789-07");
      attendre(helpers.normalizeFlexibleDateInput("1789")).vaut("1789");
    });

    test("la virgule du clavier decimal vaut separateur", () => {
      attendre(helpers.normalizeFlexibleDateInput("14,07,1789")).vaut("1789-07-14");
      attendre(helpers.normalizeFlexibleDateInput("07,1789")).vaut("1789-07");
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
  suite("Dates du tableau de sport", () => {
    const sport = global.AtlasApp.createSportModule({
      state: {}, elements: {},
      auth: { isConfigured: () => false, isSignedIn: () => false },
    });

    // Meme cause qu'au-dessus : le clavier numerique du telephone n'offre
    // aucun separateur, la case date devenait impossible a remplir.
    test("la saisie en chiffres seuls couvre jour, mois et annee", () => {
      const anneeCourante = new Date().getFullYear();
      attendre(sport.parseDateInput("1408")).vaut(`${anneeCourante}-08-14`);
      attendre(sport.parseDateInput("140825")).vaut("2025-08-14");
      attendre(sport.parseDateInput("14082025")).vaut("2025-08-14");
    });

    test("les separateurs restent acceptes", () => {
      attendre(sport.parseDateInput("14/08/2025")).vaut("2025-08-14");
      attendre(sport.parseDateInput("14-08-25")).vaut("2025-08-14");
      attendre(sport.parseDateInput("14,08,2025")).vaut("2025-08-14");
      attendre(sport.parseDateInput("2025-08-14")).vaut("2025-08-14");
    });

    test("l'annee de la ligne precedente sert de repli", () => {
      attendre(sport.parseDateInput("1408", "2019-01-01")).vaut("2019-08-14");
    });

    test("une date impossible est refusee plutot que corrigee", () => {
      attendre(sport.parseDateInput("3202")).vaut("");
      attendre(sport.parseDateInput("2026")).vaut("");
      attendre(sport.parseDateInput("bonjour")).vaut("");
    });
  });

  /* ------------------------------------------------------------------ */
  suite("Seances du journal de sport", () => {
    function journal(entries = [], templates = []) {
      const contexte = {
        state: {
          sportMode: "performance",
          settings: {
            sport: {
              massEntries: [],
              performanceEntries: entries,
              sessionTemplates: templates,
            },
          },
        },
        elements: {},
        data: { saveNotes() {} },
      };
      contexte.sport = global.AtlasApp.createSportModule(contexte);
      return contexte;
    }

    const ligne = (date, exercise, sets = "", reps = "", weight = "") => ({
      date, exercise, sets, reps, weight, rest: "", comment: "",
    });

    test("le journal se lit de la seance la plus recente a la plus ancienne", () => {
      const contexte = journal([
        ligne("2026-08-22", "Traction"),
        ligne("2026-08-29", "Dips"),
        ligne("2026-08-26", "Squat"),
      ]);
      contexte.sport.sortEntries();
      attendre(
        contexte.state.settings.sport.performanceEntries.map((e) => e.date).join(" ")
      ).vaut("2026-08-29 2026-08-26 2026-08-22");
    });

    // Une ligne tout juste creee n'a pas encore de date exploitable : la
    // renvoyer en bas du journal la ferait disparaitre de l'ecran au moment
    // meme ou on la remplit.
    test("une ligne sans date reste en tete", () => {
      const contexte = journal([ligne("2026-08-29", "Dips"), ligne("", "")]);
      contexte.sport.sortEntries();
      attendre(contexte.state.settings.sport.performanceEntries[0].date).vaut("");
    });

    test("les lignes d'une meme date forment une seance", () => {
      const contexte = journal([
        ligne("2026-08-29", "Dips"),
        ligne("2026-08-29", "Developpe"),
        ligne("2026-08-26", "Squat"),
      ]);
      const seances = contexte.sport.groupBySession(
        contexte.state.settings.sport.performanceEntries
      );
      attendre(seances.length).vaut(2);
      attendre(seances[0].rows.length).vaut(2);
      attendre(seances[1].rows.length).vaut(1);
      // Le rang d'origine voyage avec la ligne : tout le tableau designe une
      // ligne par ce rang, du menu contextuel a la navigation clavier.
      attendre(seances[1].rows[0].index).vaut(2);
    });

    test("le tonnage additionne series par repetitions par charge", () => {
      const rows = [
        { entry: ligne("2026-08-29", "Squat", "5", "5", "100") },
        { entry: ligne("2026-08-29", "Presse", "3", "10", "140") },
      ];
      // Le separateur de milliers francais est une espace insecable etroite,
      // pas une espace ordinaire : comparer les deux echoue sans rien dire.
      const resume = journal().sport.summarizeSession(rows).replace(/\s/gu, " ");
      attendre(resume).contient("6 700");
      attendre(resume).contient("2 exercices");
    });

    test("une charge ecrite a la virgule compte quand meme", () => {
      const rows = [{ entry: ligne("2026-08-29", "Curl", "1", "10", "12,5") }];
      attendre(journal().sport.summarizeSession(rows)).contient("125");
    });

    test("un modele depose ses exercices dans la seance du jour", () => {
      const contexte = journal(
        [ligne("2026-08-22", "Traction")],
        [{
          id: "m1",
          name: "Push",
          exercises: [
            { exercise: "Developpe", sets: "4", reps: "8", weight: "60", rest: "90", comment: "" },
            { exercise: "Dips", sets: "3", reps: "12", weight: "0", rest: "60", comment: "" },
          ],
        }]
      );
      contexte.sport.applyTemplate("m1");
      const entries = contexte.state.settings.sport.performanceEntries;
      attendre(entries.length).vaut(3);
      // Deposes a la date du jour, donc en tete apres le tri.
      attendre(entries[0].exercise).vaut("Developpe");
      attendre(entries[1].exercise).vaut("Dips");
      attendre(entries[0].date).vaut(entries[1].date);
      attendre(entries[2].exercise).vaut("Traction");
      attendre(entries[0].weight).vaut("60");
    });

    test("un modele inconnu ne touche a rien", () => {
      const contexte = journal([ligne("2026-08-22", "Traction")]);
      contexte.sport.applyTemplate("inexistant");
      attendre(contexte.state.settings.sport.performanceEntries.length).vaut(1);
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
