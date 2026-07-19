(function initializeMascotModule(global) {
  const AtlasApp = (global.AtlasApp = global.AtlasApp || {});

  AtlasApp.createMascotModule = function createMascotModule(context) {
    const SETUP_DELAY_MIN = 8500;
    const SETUP_DELAY_MAX = 13500;
    const SPEECH_DURATION_MIN = 3000;
    const SPEECH_DURATION_MAX = 6200;
    const SPEECH_COOLDOWN = 12500;
    const SPEECH_CHANCE = 0.72;
    const RECENT_SPEECH_LIMIT = 14;

    const setupFrames = [
      {
        dx: -6,
        dy: 0,
        mood: "neutral",
        pose: "listening",
        rotate: -3,
        scale: 1,
        size: 138,
        speechGroup: "watch",
      },
      {
        dx: -18,
        dy: 10,
        mood: "thinking",
        pose: "thinking",
        rotate: 5,
        scale: 0.96,
        size: 134,
        speechGroup: "think",
      },
      {
        dx: -4,
        dy: -4,
        mood: "happy",
        pose: "encouraging",
        rotate: -6,
        scale: 1.03,
        size: 142,
        speechGroup: "start",
      },
      {
        dx: -28,
        dy: 18,
        mood: "curious",
        pose: "peeking",
        rotate: 7,
        scale: 0.95,
        size: 132,
        speechGroup: "check",
      },
      {
        dx: -10,
        dy: 6,
        mood: "happy",
        pose: "listening",
        rotate: -2,
        scale: 0.99,
        size: 136,
        speechGroup: "wait",
      },
    ];

    const speechGroups = {
      watch: [
        "Je garde le portail du quiz !",
        "Je fais le guet, version etoile",
        "Je surveille le bouton sans le presser",
        "Je reste la, petit phare discret",
        "Si une question s'echappe, je la rattrape !",
        "Je veille sur le depart",
        "Je clignote mentalement",
        "Je suis pret, mais sans pression",
        "Le tableau de bord respire bien",
        "Je garde une orbite de courtoisie",
        "Je fais juste un petit passage",
        "Je tiens la lumiere pendant que tu choisis",
      ],
      think: [
        "Je trie les idees dans ma petite galaxie",
        "Deux secondes, je consulte mon caillou imaginaire",
        "Je fais tourner les neurones stellaires",
        "Je pense en orbite basse",
        "Je cherche la bonne etoile de depart",
        "Je range les questions par constellation",
        "Mon point du front calcule tres fort",
        "Je fais semblant d'etre sage",
        "Je remue une idee, elle brille un peu",
        "Le cerveau d'etoile chauffe doucement",
        "Je prends un air profond, ca aide parfois",
        "Je laisse les options se poser",
      ],
      start: [
        "Top depart quand tu veux !",
        "On peut lancer la fusee !",
        "Je crois en ce bouton bleu !",
        "Petit courage, grand quiz !",
        "Je mets une mini fanfare silencieuse !",
        "Allez, on transforme ca en victoire !",
        "Je suis minuscule, mais motive !",
        "Ce quiz n'a aucune idee de ce qui l'attend !",
        "Tu choisis, je scintille !",
        "On y va doucement, mais surement !",
        "Je prepare mon meilleur sourire !",
        "Une question apres l'autre, et hop !",
      ],
      check: [
        "Je verifie les reglages, facon astronaute",
        "Je regarde si tout tient en orbite",
        "Les options ont l'air bien alignees",
        "Je fais mon tour de controle",
        "Je renifle les parametres, tres scientifique",
        "Je compte les questions sur mes branches",
        "J'inspecte le menu sans le juger",
        "Je mets un peu d'ordre dans les etoiles",
        "Tout semble pret, capitaine !",
        "Je passe derriere le decor une seconde",
        "Je verifie que rien ne mord",
        "Les reglages ont une bonne tete",
      ],
      wait: [
        "Je t'attends ici, tranquille",
        "Pas de precipitation, je flotte",
        "Je peux patienter longtemps, je suis une etoile",
        "Je garde le rythme doux",
        "Je ne bouge presque pas, promis",
        "Je laisse de la place aux idees",
        "Je fais une pause lumineuse",
        "Quand tu es pret, je le suis aussi",
        "Je reste dans le coin, bien sage",
        "Je garde le silence, enfin presque",
        "Je peux attendre, j'ai le temps cosmique",
        "On respire, puis on demarre",
      ],
      rare: [
        "Un mouton a traverse mon orbite",
        "Si tu vois une planete, dis-lui bonjour",
        "Je connais un asteroide qui revise tres bien",
        "Le Petit Prince aurait clique doucement",
        "Je dessine une constellation avec trois pixels",
        "J'ai range ma cape, elle faisait trop de vent",
        "Je viens en paix et en paillettes",
        "Promis, je ne mange pas les questions",
        "Un jour, j'aurai une chaise minuscule",
        "Je fais semblant d'etre fixe, mais non",
        "Mes branches font equipe avec toi",
        "J'ai vu passer une idee, elle etait rapide",
        "Ce formulaire a une bonne energie",
        "Je suis la mascotte, pas le surveillant",
        "Je brille localement, sans abonnement",
        "Je garde les etoiles en ordre approximatif",
      ],
    };

    const poseClasses = [
      "is-listening",
      "is-thinking",
      "is-encouraging",
      "is-peeking",
    ];
    const moodClasses = [
      "mood-neutral",
      "mood-thinking",
      "mood-happy",
      "mood-curious",
    ];

    let currentFrameIndex = -1;
    let lastSpeechAt = 0;
    let recentSpeeches = [];
    let roamTimer = null;
    let speechTimer = null;
    let syncHandle = 0;
    let started = false;

    function getRoot() {
      return context.elements.asterRoamer;
    }

    function getSpeech() {
      return context.elements.asterRoamerSpeech;
    }

    function isSetupSceneActive() {
      return (
        context.state.activeTab === "quiz" &&
        context.state.quizView === "play" &&
        !context.state.quiz.questions.length
      );
    }

    function clamp(value, min, max) {
      return Math.min(max, Math.max(min, value));
    }

    function getSetupTarget() {
      return (
        context.elements.quizControls?.querySelector(".quiz-controls-head") ||
        context.elements.quizControls ||
        context.elements.quizUniverse
      );
    }

    function getFramePosition(frame) {
      const target = getSetupTarget();
      const isCompact = window.innerWidth < 680;

      if (!target) {
        return {
          x: isCompact ? 78 : 84,
          y: isCompact ? 20 : 24,
        };
      }

      const rect = target.getBoundingClientRect();
      const baseX = rect.right + (isCompact ? -34 : -42) + frame.dx;
      const baseY = rect.top + (isCompact ? 38 : 44) + frame.dy;
      const x = (baseX / Math.max(window.innerWidth, 1)) * 100;
      const y = (baseY / Math.max(window.innerHeight, 1)) * 100;

      return {
        x: clamp(x, isCompact ? 68 : 54, 94),
        y: clamp(y, 12, isCompact ? 46 : 60),
      };
    }

    function getDelay() {
      return Math.round(SETUP_DELAY_MIN + Math.random() * (SETUP_DELAY_MAX - SETUP_DELAY_MIN));
    }

    function getSpeechDuration(text) {
      return clamp(2600 + String(text || "").length * 58, SPEECH_DURATION_MIN, SPEECH_DURATION_MAX);
    }

    function getSpeechCandidates(frame) {
      const group = speechGroups[frame.speechGroup] || speechGroups.watch;
      if (Math.random() < 0.18) {
        return [...group, ...speechGroups.rare];
      }
      return group;
    }

    function pickSpeech(frame) {
      const candidates = getSpeechCandidates(frame);
      const freshCandidates = candidates.filter((line) => !recentSpeeches.includes(line));
      const pool = freshCandidates.length ? freshCandidates : candidates;
      let selected = pool[Math.floor(Math.random() * pool.length)];

      if (selected === recentSpeeches[recentSpeeches.length - 1] && pool.length > 1) {
        selected = pool[(pool.indexOf(selected) + 1) % pool.length];
      }

      recentSpeeches = [...recentSpeeches, selected].slice(-RECENT_SPEECH_LIMIT);
      return selected;
    }

    function scheduleNextMove(delay = getDelay()) {
      if (roamTimer) {
        window.clearTimeout(roamTimer);
      }
      roamTimer = window.setTimeout(advancePose, delay);
    }

    function hideSpeech(root) {
      if (speechTimer) {
        window.clearTimeout(speechTimer);
        speechTimer = null;
      }
      root?.classList.remove("has-speech");
    }

    function maybeSpeak(root, frame) {
      const speech = getSpeech();
      if (!root || !speech || !frame) {
        hideSpeech(root);
        return;
      }

      const now = Date.now();
      const canSpeak = now - lastSpeechAt > SPEECH_COOLDOWN;
      if (!canSpeak || Math.random() > SPEECH_CHANCE) {
        return;
      }

      const line = pickSpeech(frame);
      speech.textContent = line;
      root.classList.add("has-speech");
      lastSpeechAt = now;
      speechTimer = window.setTimeout(() => {
        root.classList.remove("has-speech");
        speechTimer = null;
      }, getSpeechDuration(line));
    }

    function applyPose(frame, options = {}) {
      const root = getRoot();
      if (!root || !frame) {
        return;
      }

      const { x, y } = getFramePosition(frame);
      root.classList.remove("is-hidden", "is-offscreen", ...poseClasses, ...moodClasses);
      root.classList.add(`is-${frame.pose || "listening"}`);
      root.classList.add(`mood-${frame.mood || "neutral"}`);
      root.style.setProperty("--aster-x", `${x.toFixed(2)}vw`);
      root.style.setProperty("--aster-y", `${y.toFixed(2)}vh`);
      root.style.setProperty("--aster-scale", String(frame.scale || 1));
      root.style.setProperty("--aster-rotate", `${frame.rotate || 0}deg`);
      root.style.setProperty("--aster-size", `${frame.size || 136}px`);
      root.style.setProperty("--aster-opacity", "1");

      if (options.immediate) {
        root.classList.add("is-immediate");
        window.requestAnimationFrame(() => root.classList.remove("is-immediate"));
      }

      if (options.allowSpeech) {
        maybeSpeak(root, frame);
      }
    }

    function hideMascot() {
      const root = getRoot();
      if (!root) {
        return;
      }

      root.classList.add("is-hidden");
      root.classList.remove(...poseClasses, ...moodClasses);
      hideSpeech(root);
    }

    function sync(immediate = false) {
      if (!isSetupSceneActive()) {
        hideMascot();
        return;
      }

      if (currentFrameIndex < 0) {
        currentFrameIndex = 0;
      }

      applyPose(setupFrames[currentFrameIndex], { immediate, allowSpeech: false });
    }

    function advancePose() {
      if (!isSetupSceneActive()) {
        hideMascot();
        scheduleNextMove();
        return;
      }

      const jump = Math.random() < 0.22 ? 2 : 1;
      currentFrameIndex = (Math.max(currentFrameIndex, 0) + jump) % setupFrames.length;
      applyPose(setupFrames[currentFrameIndex], { allowSpeech: true });
      scheduleNextMove();
    }

    function queueSync() {
      if (document.activeElement?.matches?.("[data-quiz-session-answer]")) {
        return;
      }

      if (syncHandle) {
        return;
      }

      syncHandle = window.requestAnimationFrame(() => {
        syncHandle = 0;
        sync();
      });
    }

    function start() {
      if (started) {
        return;
      }

      started = true;
      sync(true);
      scheduleNextMove(5200);
      window.addEventListener("resize", queueSync, { passive: true });
      window.addEventListener("scroll", queueSync, { passive: true });
    }

    function stop() {
      started = false;
      if (roamTimer) {
        window.clearTimeout(roamTimer);
        roamTimer = null;
      }
      if (syncHandle) {
        window.cancelAnimationFrame(syncHandle);
        syncHandle = 0;
      }
      window.removeEventListener("resize", queueSync);
      window.removeEventListener("scroll", queueSync);
      hideMascot();
    }

    return {
      start,
      stop,
      sync,
      queueSync,
    };
  };
})(window);
