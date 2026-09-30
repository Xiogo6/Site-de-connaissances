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
                "getFolderDescendantNotes", "isOrphanNote", "createFolderForPlacement"],
        renderers: ["renderEverything", "renderTabs", "renderFeed", "renderKnowledgeList",
                    "renderTypeSettingsList", "renderPreview",
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

    // voice.html est un second point d'entree : ses scripts, ses feuilles et
    // elle-meme sont invisibles des deux tests precedents, qui ne lisent que
    // index.html. Oubliee dans ASSETS, la page de dictee casse hors ligne
    // exactement comme l'application l'avait fait avec ai.js (C-04). Pire :
    // cache.addAll echoue en bloc si un seul chemin est faux, donc une faute
    // de frappe ici emporte tout le hors-ligne, sans erreur visible.
    // write.html (ecriture rapide) et todo.html (raccourci "Taches") sont dans le meme cas.
    for (const page of ["voice.html", "write.html", "todo.html"]) {
      test.surServeur(`chaque fichier de ${page} est dans le cache du service worker`, async () => {
        const html = await (await fetch(`../${page}`, { cache: "no-store" })).text();
        const sw = await (await fetch("../service-worker.js", { cache: "no-store" })).text();

        const fichiers = [
          ...[...html.matchAll(/<script src="\.\/([^"?]+)/g)].map((m) => m[1]),
          ...[...html.matchAll(/<link rel="stylesheet" href="\.\/([^"?]+)/g)].map((m) => m[1]),
          ...[...html.matchAll(/<link rel="manifest" href="\.\/([^"?]+)/g)].map((m) => m[1]),
          ...[...html.matchAll(/<link rel="apple-touch-icon" href="\.\/([^"?]+)/g)].map((m) => m[1]),
          page,
        ];
        attendre(fichiers.length > 4).vrai();

        const manquants = fichiers.filter((chemin) => !sw.includes(`"./${chemin}"`));
        attendre(manquants.join(", ")).vaut("");
      });
    }

    // cache.addAll echoue en bloc : un seul chemin faux dans ASSETS et le
    // service worker ne s'installe pas du tout. Pas de hors-ligne, et rien ne
    // le signale tant qu'il y a du reseau. Les tests precedents verifient que
    // les fichiers charges sont bien listes ; celui-ci verifie l'inverse, que
    // ce qui est liste existe.
    test.surServeur("chaque fichier liste dans ASSETS existe vraiment", async () => {
      const sw = await (await fetch("../service-worker.js", { cache: "no-store" })).text();
      const bloc = sw.match(/const ASSETS = \[([\s\S]*?)\];/)?.[1] || "";
      const chemins = [...bloc.matchAll(/"\.\/([^"]*)"/g)].map((m) => m[1]).filter(Boolean);
      attendre(chemins.length > 20).vrai();

      const manquants = [];
      for (const chemin of chemins) {
        const reponse = await fetch(`../${chemin}`, { cache: "no-store", method: "HEAD" });
        if (!reponse.ok) {
          manquants.push(chemin);
        }
      }
      attendre(manquants.join(", ")).vaut("");
    });

    // Vingt references dans index.html plus CACHE_NAME doivent porter le meme
    // numero. Les tenir a la main derape : au 21 aout les fichiers etaient a
    // v86 et le cache a v87. Le navigateur sert alors un melange d'anciennes
    // et de nouvelles versions, symptome difficile a relier a sa cause.
    // Pour tout avancer d'un cran : zsh ./scripts/version.sh
    test.surServeur("les numeros de version sont tous identiques", async () => {
      const html = await (await fetch("../index.html", { cache: "no-store" })).text();
      const voice = await (await fetch("../voice.html", { cache: "no-store" })).text();
      const write = await (await fetch("../write.html", { cache: "no-store" })).text();
      const todo = await (await fetch("../todo.html", { cache: "no-store" })).text();
      const sw = await (await fetch("../service-worker.js", { cache: "no-store" })).text();

      // voice.html porte ses propres ?v= : version.sh les avance avec ceux de
      // index.html, et ce test verifie qu'aucune des deux pages n'est restee
      // en arriere.
      const versions = [
        ...new Set([...`${html}\n${voice}\n${write}\n${todo}`.matchAll(/\?v=(\d+)/g)].map((m) => m[1])),
      ];
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

    // Le libelle ecrit par l'utilisateur est conserve ; normalizeTag ne sert
    // qu'a reconnaitre que deux libelles designent le meme tag. La liste
    // renvoyait auparavant la cle normalisee, ce qui reecrivait les tags a
    // chaque chargement et rendait toute correction d'orthographe impossible.
    test("la liste garde le libelle et dedoublonne par cle", () => {
      attendre(helpers.normalizeTagList(["Sport", "sports", "SPORT"])).equivaut(["Sport"]);
      attendre(helpers.normalizeTagList(["", "  ", "art"])).equivaut(["art"]);
      attendre(helpers.normalizeTagList(["Mathematiques"])).equivaut(["Mathematiques"]);
    });

    // F-16 : renommer un tag ecrivait la forme normalisee, que le chargement
    // suivant reecrivait a son tour. Corriger "animau" en "animaux" etait donc
    // impossible : le bouton semblait fonctionner puis le tag revenait.
    test("renommer un tag corrige son orthographe et tient au rechargement", () => {
      const contexte = {
        state: {
          notes: [{ id: "n1", title: "Page", tags: ["animau"], content: "", type: "concept" }],
          settings: {}, snapshots: [], tagFilter: "animau", graphTagFilter: "",
          remote: { enabled: false, status: "local", lastSyncedAt: null, lastError: "" },
        },
        elements: {},
        auth: { isConfigured: () => false, isSignedIn: () => false, getAccessToken: async () => "" },
        renderers: { renderEverything() {} },
      };
      contexte.data = global.AtlasApp.createDataModule(contexte);
      contexte.data.saveNotes = () => {};
      contexte.data.isReadOnlyMode = () => false;
      contexte.notes = global.AtlasApp.createNotesModule(contexte);

      attendre(contexte.notes.renameTag("animau", "animaux")).vrai();
      attendre(contexte.state.notes[0].tags).equivaut(["animaux"]);
      // le filtre suit, sinon le renommage casserait la navigation
      attendre(contexte.state.tagFilter).vaut("animaux");

      // un rechargement ne doit plus reecrire le libelle
      const recharge = contexte.data.normalizeNoteCollection(
        JSON.parse(JSON.stringify(contexte.state.notes))
      );
      attendre(recharge[0].tags).equivaut(["animaux"]);
    });

    test("fusionner deux tags ne laisse qu'une entree dans les listes", () => {
      const contexte = {
        state: {
          notes: [
            { id: "n1", title: "A", tags: ["chat"], content: "", type: "concept" },
            { id: "n2", title: "B", tags: ["cuisine"], content: "", type: "concept" },
          ],
          settings: {}, snapshots: [], tagFilter: "", graphTagFilter: "",
          remote: { enabled: false, status: "local", lastSyncedAt: null, lastError: "" },
        },
        elements: {},
        auth: { isConfigured: () => false, isSignedIn: () => false, getAccessToken: async () => "" },
        renderers: { renderEverything() {} },
      };
      contexte.data = global.AtlasApp.createDataModule(contexte);
      contexte.data.saveNotes = () => {};
      contexte.data.isReadOnlyMode = () => false;
      contexte.notes = global.AtlasApp.createNotesModule(contexte);

      contexte.notes.renameTag("chat", "Cuisine");
      attendre(contexte.notes.getAllTags().length).vaut(1);
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

    // Sept pages ecrites avant que le prompt n'impose `-` utilisent `*`. Elles
    // s'affichaient en paragraphes, l'etoile visible a l'ecran.
    test("l'etoile vaut aussi marqueur de puce", () => {
      attendre(helpers.renderNoteHtml("*   un\n*   deux")).contient("<li>un</li>");
      attendre(helpers.renderNoteHtml("* [x] fait")).contient("checked");
    });

    // Le garde-fou de la regle precedente : sans espace apres l'etoile, c'est
    // un italique, et le confondre avec une puce mangerait la mise en forme.
    test("l'italique en debut de ligne n'est pas pris pour une puce", () => {
      attendre(helpers.renderNoteHtml("*Important* : ceci")).contient("<em>Important</em>");
      attendre(helpers.renderNoteHtml("*Important* : ceci")).neContientPas("<li>");
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

  // Raccourci "Taches" (todo.html) : ses lignes passent par la meme file que
  // les dictees, et doivent finir dans la liste de taches, sans doublon.
  // Une page restee sur cet appareil apres un envoi rate ne doit pas etre
  // effacee par le chargement suivant, qui remplace l'etat local par Supabase.
  suite("Synchronisation en echec", () => {
    test.surServeur("une page absente de Supabase est gardee et renvoyee", async () => {
      const config = global.AtlasApp.config;
      const cles = [
        config.appStorageKey,
        config.storageKey,
        config.snapshotStorageKey,
        `${config.appStorageKey}-pending-remote-sync`,
        `${config.appStorageKey}-remote-integrity`,
      ];
      const sauvegarde = cles.map((cle) => global.localStorage.getItem(cle));
      const origine = {
        fetch: global.fetch,
        syncEnabled: config.supabase.syncEnabled,
        url: config.supabase.url,
        key: config.supabase.publishableKey,
      };
      const envois = [];
      const page = (id) => ({
        id, title: id, type: "concept", tags: [], content: `# ${id}`,
        parentId: null, updatedAt: "2026-09-30T08:00:00.000Z",
      });
      try {
        global.localStorage.removeItem(`${config.appStorageKey}-pending-remote-sync`);
        global.localStorage.setItem(
          `${config.appStorageKey}-remote-integrity`,
          JSON.stringify({ noteIds: ["distante"] })
        );
        config.supabase.syncEnabled = true;
        config.supabase.url = "https://exemple.invalid";
        config.supabase.publishableKey = config.supabase.publishableKey || "cle";
        global.fetch = async (url, options = {}) => {
          const nom = String(url).split("/rpc/")[1] || "";
          const corps = options.body ? JSON.parse(options.body) : {};
          if (nom === "get_app_payload") {
            return new Response(JSON.stringify({
              notes: [page("distante")], snapshots: [],
              settings: { settingsAuthorityVersion: 1 },
            }), { status: 200 });
          }
          if (nom === "get_note_deletions") {
            return new Response("[]", { status: 200 });
          }
          if (nom === "sync_app_payload") {
            envois.push(corps.payload);
          }
          return new Response("{}", { status: 200 });
        };
        const contexte = {
          state: {
            notes: [page("distante"), page("seulement-ici")],
            settings: {}, snapshots: [],
            remote: { status: "idle", lastError: "" },
          },
          auth: { isSignedIn: () => true, getAccessToken: async () => "jeton" },
        };
        const data = global.AtlasApp.createDataModule(contexte);
        await data.bootstrapWorkspace();
        attendre(contexte.state.notes.map((n) => n.id).sort()).equivaut(["distante", "seulement-ici"]);
        await data.whenRemoteSaved();
        const envoi = envois.find((p) => (p.changedNoteIds || []).includes("seulement-ici"));
        attendre(Boolean(envoi)).vrai();
      } finally {
        global.fetch = origine.fetch;
        config.supabase.syncEnabled = origine.syncEnabled;
        config.supabase.url = origine.url;
        config.supabase.publishableKey = origine.key;
        cles.forEach((cle, index) => {
          if (sauvegarde[index] === null) global.localStorage.removeItem(cle);
          else global.localStorage.setItem(cle, sauvegarde[index]);
        });
      }
    });
  });

  suite("Raccourci taches", () => {
    function contexteTaches(lignes) {
      const supprimees = [];
      const contexte = {
        state: {
          notes: [],
          settings: { todos: [], todoCategories: [{ id: "cat-maison", label: "Maison", order: 0 }] },
          remote: { status: "synced" },
        },
        elements: {},
        auth: { isSignedIn: () => true, getAccessToken: async () => "jeton" },
        data: { isReadOnlyMode: () => false, saveNotes: () => { contexte.sauvegardes += 1; } },
        notes: {},
        sauvegardes: 0,
        supprimees,
      };
      contexte.todos = global.AtlasApp.createTodosModule(contexte);
      contexte.voiceInbox = global.AtlasApp.createVoiceInboxModule(contexte);
      contexte.fetch = async (url, options = {}) => {
        if (options.method === "DELETE") {
          supprimees.push(decodeURIComponent(String(url).split("client_key=eq.")[1] || ""));
          return new Response("", { status: 204 });
        }
        return new Response(JSON.stringify(lignes), { status: 200 });
      };
      return contexte;
    }

    async function ingerer(contexte) {
      const config = global.AtlasApp.config.supabase;
      const origine = { fetch: global.fetch, syncEnabled: config.syncEnabled, url: config.url };
      global.fetch = contexte.fetch;
      config.syncEnabled = true;
      config.url = config.url || "https://exemple.invalid";
      try {
        return await contexte.voiceInbox.ingest();
      } finally {
        global.fetch = origine.fetch;
        config.syncEnabled = origine.syncEnabled;
        config.url = origine.url;
      }
    }

    const ligne = {
      client_key: "11111111-2222-3333-4444-555555555555",
      created_at: "2026-09-27T08:00:00.000Z",
      payload: {
        source: "todo",
        capturedAt: "2026-09-27T08:00:00.000Z",
        todos: [
          { label: "Appeler le garage", categoryLabel: "maison" },
          { label: "Racheter du cafe", categoryLabel: "Courses" },
          { label: "   " },
        ],
        transcript: "- Appeler le garage\n- Racheter du cafe",
      },
    };

    test("une ligne de taches rejoint la liste, pas l'arbre des pages", async () => {
      const contexte = contexteTaches([ligne]);
      const resultat = await ingerer(contexte);
      const taches = contexte.state.settings.todos;

      attendre(resultat.todosCreated).vaut(2);
      attendre(resultat.created).vaut(0);
      attendre(contexte.state.notes.length).vaut(0);
      attendre(taches.map((t) => t.label)).equivaut(["Appeler le garage", "Racheter du cafe"]);
      // categorie existante retrouvee sans tenir compte de la casse
      attendre(taches[0].categoryId).vaut("cat-maison");
      // categorie inconnue creee
      const courses = contexte.state.settings.todoCategories.find((c) => c.label === "Courses");
      attendre(Boolean(courses)).vrai();
      attendre(taches[1].categoryId).vaut(courses.id);
      attendre(contexte.sauvegardes).vaut(1);
      attendre(contexte.supprimees).equivaut([ligne.client_key]);
    });

    test("la ligne reste dans la file tant que l'envoi a Supabase echoue", async () => {
      const contexte = contexteTaches([ligne]);
      contexte.data.whenRemoteSaved = async () => false;
      const resultat = await ingerer(contexte);
      await resultat.suppressions;
      attendre(resultat.todosCreated).vaut(2);
      attendre(contexte.supprimees).equivaut([]);
    });

    test("la ligne quitte la file une fois l'envoi a Supabase reussi", async () => {
      const contexte = contexteTaches([ligne]);
      contexte.data.whenRemoteSaved = async () => true;
      const config = global.AtlasApp.config.supabase;
      const origine = { fetch: global.fetch, syncEnabled: config.syncEnabled, url: config.url };
      global.fetch = contexte.fetch;
      config.syncEnabled = true;
      config.url = config.url || "https://exemple.invalid";
      try {
        const resultat = await contexte.voiceInbox.ingest();
        await resultat.suppressions;
      } finally {
        global.fetch = origine.fetch;
        config.syncEnabled = origine.syncEnabled;
        config.url = origine.url;
      }
      attendre(contexte.supprimees).equivaut([ligne.client_key]);
    });

    test("une ligne deja ingeree n'ajoute rien une seconde fois", async () => {
      const contexte = contexteTaches([ligne]);
      await ingerer(contexte);
      const resultat = await ingerer(contexte);
      attendre(resultat.todosCreated).vaut(0);
      attendre(contexte.state.settings.todos.length).vaut(2);
    });

    test("un geste du raccourci coche, renomme ou supprime la tache", async () => {
      const contexte = contexteTaches([]);
      contexte.state.settings.todos = [
        { id: "a", label: "Garage", completed: false, updatedAt: "2026-09-27T08:00:00.000Z", order: 0 },
        { id: "b", label: "Cafe", completed: false, updatedAt: "2026-09-27T08:00:00.000Z", order: 1 },
        { id: "c", label: "Pain", completed: false, updatedAt: "2026-09-27T08:00:00.000Z", order: 2 },
      ];
      const apres = "2026-09-27T09:00:00.000Z";
      const lignes = [{
        client_key: "22222222-3333-4444-5555-666666666666",
        created_at: apres,
        payload: {
          source: "todo-action",
          actions: [
            { todoId: "a", op: "update", patch: { completed: true }, at: apres },
            { todoId: "b", op: "update", patch: { label: "Cafe moulu" }, at: apres },
            { todoId: "c", op: "delete", at: apres },
            { todoId: "inconnue", op: "delete", at: apres },
          ],
        },
      }];
      contexte.fetch = contexteTaches(lignes).fetch;
      const resultat = await ingerer(contexte);
      const taches = contexte.state.settings.todos;

      attendre(resultat.todosCreated).vaut(3);
      attendre(taches.map((t) => t.id)).equivaut(["a", "b"]);
      attendre(taches[0].completed).vrai();
      attendre(taches[1].label).vaut("Cafe moulu");
      attendre(contexte.state.notes.length).vaut(0);
      attendre(contexte.sauvegardes).vaut(1);
    });

    test("une modification faite dans Atlas apres le geste l'emporte", () => {
      const listes = {
        todos: [{ id: "a", label: "Renomme dans Atlas", completed: false, updatedAt: "2026-09-27T10:00:00.000Z" }],
        categories: [],
      };
      const resultat = global.AtlasApp.todoInbox.applyPayload(
        listes,
        {
          source: "todo-action",
          actions: [
            { todoId: "a", op: "update", patch: { label: "Ancien geste" }, at: "2026-09-27T09:00:00.000Z" },
            { todoId: "a", op: "delete", at: "2026-09-27T09:30:00.000Z" },
          ],
        },
        { clientKey: "33333333", createdAt: "2026-09-27T09:00:00.000Z", makeCategoryId: () => "x" }
      );
      attendre(resultat.changed).vaut(0);
      attendre(resultat.todos[0].label).vaut("Renomme dans Atlas");
    });

    test("une tache a peine ajoutee peut deja etre cochee", () => {
      const inbox = global.AtlasApp.todoInbox;
      const cle = "44444444-5555-6666-7777-888888888888";
      let listes = inbox.applyPayload(
        { todos: [], categories: [] },
        { source: "todo", capturedAt: "2026-09-27T09:00:00.000Z", todos: [{ label: "Garage" }] },
        { clientKey: cle, createdAt: "2026-09-27T09:00:00.000Z", makeCategoryId: () => "x" }
      );
      listes = inbox.applyPayload(
        listes,
        {
          source: "todo-action",
          actions: [{ todoId: `${inbox.idPrefix(cle)}-0`, op: "update", patch: { completed: true }, at: "2026-09-27T09:00:05.000Z" }],
        },
        { clientKey: "55555555", createdAt: "2026-09-27T09:00:05.000Z", makeCategoryId: () => "x" }
      );
      attendre(listes.todos.length).vaut(1);
      attendre(listes.todos[0].completed).vrai();
    });

    test("une categorie de la page Taches se replie et le reste au rechargement", () => {
      const cle = "atlas-todo-collapsed-categories";
      const avant = global.localStorage.getItem(cle);
      global.localStorage.removeItem(cle);
      try {
        const conteneur = document.createElement("div");
        const contexte = {
          state: {
            settings: {
              todoCategories: [{ id: "cat-maison", label: "Maison", order: 0 }],
              todos: [{ id: "a", label: "Garage", categoryId: "cat-maison", completed: false, order: 0 }],
            },
          },
          elements: { todoPageGroups: conteneur },
          data: { isReadOnlyMode: () => false, saveNotes: () => {} },
        };
        const todos = global.AtlasApp.createTodosModule(contexte);
        todos.bindEvents();
        todos.render();

        const groupe = () => conteneur.querySelector('[data-todo-category="cat-maison"]');
        attendre(groupe().classList.contains("is-collapsed")).faux();
        conteneur.querySelector(".todo-group-toggle").click();
        attendre(groupe().classList.contains("is-collapsed")).vrai();
        attendre(groupe().querySelector(".todo-group-list").hidden).vrai();

        // Un module neuf, comme au rechargement de la page.
        global.AtlasApp.createTodosModule(contexte).render();
        attendre(groupe().classList.contains("is-collapsed")).vrai();
      } finally {
        if (avant === null) {
          global.localStorage.removeItem(cle);
        } else {
          global.localStorage.setItem(cle, avant);
        }
      }
    });

    test("rien n'est ingere tant que l'espace distant n'est pas charge", async () => {
      const contexte = contexteTaches([ligne]);
      contexte.state.remote.status = "error";
      const resultat = await ingerer(contexte);
      attendre(resultat.todosCreated).vaut(0);
      attendre(contexte.state.settings.todos.length).vaut(0);
      attendre(contexte.supprimees.length).vaut(0);
    });

    test("l'envoi qui suit le chargement n'empeche pas l'ingestion", async () => {
      const contexte = contexteTaches([ligne]);
      contexte.state.remote = { status: "syncing", loadedFromRemote: true };
      const resultat = await ingerer(contexte);
      attendre(resultat.todosCreated).vaut(2);
      attendre(contexte.supprimees).equivaut([ligne.client_key]);
    });

    test("pas d'ingestion pendant un chargement pas encore termine", async () => {
      const contexte = contexteTaches([ligne]);
      contexte.state.remote = { status: "syncing" };
      const resultat = await ingerer(contexte);
      attendre(resultat.todosCreated).vaut(0);
      attendre(contexte.supprimees.length).vaut(0);
    });
  });
})(window);
