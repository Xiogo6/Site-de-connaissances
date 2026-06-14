(function initializeMascotModule(global) {
  const AtlasApp = (global.AtlasApp = global.AtlasApp || {});

  AtlasApp.createMascotModule = function createMascotModule(context) {
    function route(...frames) {
      return frames;
    }

    const sceneRoutes = {
      quizStats: [
        route(
          { x: 110, y: 14, scale: 0.9, rotate: 8, image: "neutral", speech: "Je viens inspecter les stats !", size: 134 },
          { x: 78, y: 18, scale: 1.04, rotate: -4, image: "happy", speech: "Tout n'est pas perdu, regardons ca !", size: 146 },
          { x: 42, y: 70, scale: 0.94, rotate: 10, image: "thinking", speech: "Je repasse plus bas pour verifier !", size: 128 },
          { x: -14, y: 34, scale: 0.88, rotate: -12, image: "neutral", speech: "Je disparais a droite, enfin a gauche !", size: 122 },
          { x: 14, y: 58, scale: 0.92, rotate: 8, image: "happy", speech: "Me revoila, on continue !", size: 124 }
        ),
        route(
          { x: -14, y: 70, scale: 0.86, rotate: -10, image: "thinking", speech: "Je reviens par la gauche !", size: 120 },
          { x: 22, y: 20, scale: 0.94, rotate: 6, image: "neutral", speech: "Je regarde les progressions !", size: 126 },
          { x: 86, y: 8, scale: 1.02, rotate: -6, image: "happy", speech: "Bravo, les chiffres respirent mieux !", size: 138 },
          { x: 104, y: 50, scale: 0.88, rotate: 12, image: "neutral", speech: "Je file par la droite !", size: 118 },
          { x: 66, y: 82, scale: 0.9, rotate: -8, image: "thinking", speech: "Et je redescends calmement !", size: 122 }
        ),
        route(
          { x: 106, y: 54, scale: 0.9, rotate: 10, image: "neutral", speech: "Je fais un petit tour de controle !", size: 126 },
          { x: 74, y: 12, scale: 1.02, rotate: -4, image: "happy", speech: "On a de belles courbes ici !", size: 140 },
          { x: 30, y: 48, scale: 0.92, rotate: 8, image: "thinking", speech: "Je prends un peu de hauteur !", size: 124 },
          { x: -12, y: 20, scale: 0.88, rotate: -10, image: "neutral", speech: "Je retourne me cacher a gauche !", size: 120 },
          { x: 18, y: 74, scale: 0.9, rotate: 8, image: "happy", speech: "Je reviens vite, promis !", size: 122 }
        ),
      ],
      quizPlay: [
        route(
          { x: 86, y: 10, scale: 0.96, rotate: 4, image: "thinking", speech: "On reste ensemble !", size: 118 },
          { x: 98, y: 6, scale: 0.86, rotate: -6, image: "thinking", speech: "Je ne couvre pas les questions !", size: 108 },
          { x: 12, y: 74, scale: 0.88, rotate: 10, image: "happy", speech: "Je descends sans deranger !", size: 112 },
          { x: -12, y: 30, scale: 0.84, rotate: -12, image: "neutral", speech: "Je fais un saut a gauche !", size: 108 },
          { x: 22, y: 18, scale: 0.9, rotate: 8, image: "happy", speech: "Je reviens pour encourager !", size: 114 }
        ),
        route(
          { x: 4, y: 66, scale: 0.84, rotate: -10, image: "neutral", speech: "Je pars par la droite, hop !", size: 108 },
          { x: 86, y: 16, scale: 0.96, rotate: 4, image: "thinking", speech: "Je surveille sans m'imposer !", size: 118 },
          { x: 108, y: 62, scale: 0.88, rotate: 12, image: "happy", speech: "Je fais une pirouette !", size: 112 },
          { x: 38, y: 74, scale: 0.92, rotate: -8, image: "neutral", speech: "Je redescends doucement !", size: 110 },
          { x: -14, y: 46, scale: 0.86, rotate: 10, image: "thinking", speech: "Je reviens par la gauche, evidemment !", size: 108 }
        ),
        route(
          { x: 96, y: 82, scale: 0.82, rotate: 12, image: "happy", speech: "Petit voyage discret !", size: 106 },
          { x: 68, y: 12, scale: 1, rotate: -4, image: "thinking", speech: "Je garde le rythme !", size: 116 },
          { x: 18, y: 40, scale: 0.9, rotate: 8, image: "neutral", speech: "Je ne bouge pas trop la tete !", size: 112 },
          { x: 110, y: 28, scale: 0.86, rotate: -10, image: "happy", speech: "Je repars par la droite !", size: 108 },
          { x: -12, y: 14, scale: 0.84, rotate: 10, image: "thinking", speech: "Et je reviens en douceur !", size: 108 }
        ),
      ],
      quizDrilldown: [
        route(
          { x: 84, y: 20, scale: 0.98, rotate: -2, image: "neutral", speech: "Je suis le detail !", size: 126 },
          { x: 108, y: 32, scale: 0.9, rotate: 10, image: "thinking", speech: "Je tourne autour !", size: 118 },
          { x: 34, y: 70, scale: 0.92, rotate: -8, image: "happy", speech: "Je redescends pour regarder mieux !", size: 120 },
          { x: -12, y: 44, scale: 0.86, rotate: 12, image: "neutral", speech: "Je file discretement a gauche !", size: 114 },
          { x: 18, y: 18, scale: 0.9, rotate: -6, image: "thinking", speech: "Je reviens et je commente !", size: 118 }
        ),
        route(
          { x: -14, y: 58, scale: 0.86, rotate: -10, image: "happy", speech: "Je rentre par la gauche !", size: 114 },
          { x: 24, y: 22, scale: 0.92, rotate: 8, image: "neutral", speech: "Je prends un peu de recul !", size: 118 },
          { x: 92, y: 12, scale: 0.98, rotate: -4, image: "thinking", speech: "Je remonte comme une bulle !", size: 124 },
          { x: 106, y: 74, scale: 0.88, rotate: 10, image: "happy", speech: "Je repars par la droite !", size: 116 },
          { x: 72, y: 48, scale: 0.9, rotate: -8, image: "neutral", speech: "Je reviens vous aider !", size: 118 }
        ),
      ],
      quizResult: [
        route(
          { x: 108, y: 16, scale: 1.02, rotate: 6, image: "happy", speech: "Bravo, belle session !", size: 138 },
          { x: 76, y: 12, scale: 1.08, rotate: -3, image: "happy", speech: "Tu tiens une bonne trajectoire !", size: 144 },
          { x: 30, y: 72, scale: 0.92, rotate: 10, image: "neutral", speech: "Je vais feter ca un peu !", size: 126 },
          { x: -14, y: 34, scale: 0.9, rotate: -10, image: "happy", speech: "Je reviens pour applaudir !", size: 122 },
          { x: 18, y: 18, scale: 0.94, rotate: 6, image: "happy", speech: "Et hop, encore une victoire !", size: 128 }
        ),
        route(
          { x: -14, y: 18, scale: 0.88, rotate: -8, image: "happy", speech: "Je suis passe en coup de vent !", size: 120 },
          { x: 22, y: 20, scale: 0.92, rotate: 8, image: "neutral", speech: "On a bien avance !", size: 124 },
          { x: 90, y: 76, scale: 1, rotate: -6, image: "happy", speech: "Je vais saluer la ligne de score !", size: 132 },
          { x: 110, y: 38, scale: 0.9, rotate: 12, image: "thinking", speech: "Et je repars !", size: 120 },
          { x: 68, y: 8, scale: 1.02, rotate: -4, image: "happy", speech: "Encore un beau passage !", size: 134 }
        ),
        route(
          { x: 96, y: 60, scale: 0.9, rotate: 10, image: "happy", speech: "Ca merite un sourire !", size: 126 },
          { x: 54, y: 14, scale: 1.04, rotate: -4, image: "neutral", speech: "Je repasse une derniere fois !", size: 136 },
          { x: 10, y: 74, scale: 0.88, rotate: 8, image: "happy", speech: "Je m'en vais par la gauche !", size: 118 },
          { x: 110, y: 24, scale: 0.88, rotate: -12, image: "thinking", speech: "Et je reviens encore !", size: 120 },
          { x: 78, y: 18, scale: 1, rotate: 6, image: "happy", speech: "On continue de progresser !", size: 132 }
        ),
      ],
      quizEmpty: [
        route(
          { x: 108, y: 16, scale: 0.9, rotate: 8, image: "thinking", speech: "On prepare la premiere session !", size: 116 },
          { x: 78, y: 18, scale: 0.96, rotate: -4, image: "happy", speech: "Le terrain est pret !", size: 124 },
          { x: 20, y: 76, scale: 0.88, rotate: 10, image: "neutral", speech: "Je laisse un peu d'air ici !", size: 112 },
          { x: -12, y: 34, scale: 0.86, rotate: -12, image: "thinking", speech: "Je rentre par la gauche !", size: 110 },
          { x: 16, y: 18, scale: 0.9, rotate: 6, image: "happy", speech: "On peut lancer le quiz !", size: 116 }
        ),
        route(
          { x: -12, y: 18, scale: 0.84, rotate: -10, image: "neutral", speech: "Je guette le depart !", size: 110 },
          { x: 26, y: 22, scale: 0.92, rotate: 8, image: "thinking", speech: "Je fais un petit aller-retour !", size: 118 },
          { x: 92, y: 74, scale: 0.9, rotate: -8, image: "happy", speech: "C'est bon, on y va !", size: 118 },
          { x: 110, y: 30, scale: 0.86, rotate: 12, image: "neutral", speech: "Je file a droite !", size: 110 },
          { x: 66, y: 12, scale: 0.96, rotate: -4, image: "happy", speech: "Et je reviens pour t'encourager !", size: 122 }
        ),
        route(
          { x: 100, y: 82, scale: 0.88, rotate: 10, image: "happy", speech: "J'attends ton feu vert !", size: 114 },
          { x: 68, y: 14, scale: 1, rotate: -6, image: "thinking", speech: "Je patiente mais je bouge quand meme !", size: 124 },
          { x: 18, y: 46, scale: 0.9, rotate: 8, image: "neutral", speech: "Je fais un petit detour !", size: 114 },
          { x: -14, y: 68, scale: 0.86, rotate: -10, image: "happy", speech: "Hop, sortie gauche !", size: 110 },
          { x: 14, y: 18, scale: 0.9, rotate: 8, image: "happy", speech: "Me revoila pour le top depart !", size: 116 }
        ),
      ],
    };

    let currentScene = "";
    let currentRouteIndex = -1;
    let currentRoute = [];
    let currentStep = 0;
    let roamTimer = null;
    let syncHandle = 0;
    let currentImage = "";

    function getRoot() {
      return context.elements.asterRoamer;
    }

    function getImage() {
      return context.elements.asterRoamerImage;
    }

    function getSpeech() {
      return context.elements.asterRoamerSpeech;
    }

    function getScene() {
      if (context.state.activeTab !== "quiz") {
        return null;
      }

      if (!context.state.quiz.questions.length) {
        return "quizEmpty";
      }

      if (context.state.quiz.finishedAt) {
        return "quizResult";
      }

      if (context.state.quizView === "stats") {
        return context.state.quizStatsDrilldown ? "quizDrilldown" : "quizStats";
      }

      return "quizPlay";
    }

    function clamp(value, min, max) {
      return Math.min(max, Math.max(min, value));
    }

    function anchorFrame(name, fallback = {}) {
      const anchor = document.querySelector(`[data-aster-anchor="${name}"]`);
      if (!anchor) {
        return fallback;
      }

      const rect = anchor.getBoundingClientRect();
      if (!rect.width && !rect.height) {
        return fallback;
      }

      const x = ((rect.right + 18) / window.innerWidth) * 100;
      const y = ((rect.top + rect.height * 0.25) / window.innerHeight) * 100;

      return {
        ...fallback,
        x: clamp(x, -18, 118),
        y: clamp(y, -18, 118),
      };
    }

    function getRoutes(scene) {
      return scene ? sceneRoutes[scene] || [] : [];
    }

    function pickRoute(scene, avoidIndex = -1) {
      const routes = getRoutes(scene);
      if (!routes.length) {
        return { route: [], index: -1 };
      }

      if (routes.length === 1) {
        return { route: routes[0], index: 0 };
      }

      const candidates = routes
        .map((selectedRoute, index) => ({ route: selectedRoute, index }))
        .filter(({ index }) => index !== avoidIndex);

      return candidates[Math.floor(Math.random() * candidates.length)] || { route: routes[0], index: 0 };
    }

    function applyFrame(frame, options = {}) {
      const root = getRoot();
      if (!root || !frame) {
        return;
      }

      const resolved = frame.anchor ? anchorFrame(frame.anchor, frame) : frame;
      const x = typeof resolved.x === "number" ? resolved.x : 0;
      const y = typeof resolved.y === "number" ? resolved.y : 0;
      const scale = typeof resolved.scale === "number" ? resolved.scale : 1;
      const rotate = typeof resolved.rotate === "number" ? resolved.rotate : 0;
      const size = typeof resolved.size === "number" ? resolved.size : 128;
      const opacity = typeof resolved.opacity === "number" ? resolved.opacity : 1;

      root.style.setProperty("--aster-x", `${x.toFixed(2)}vw`);
      root.style.setProperty("--aster-y", `${y.toFixed(2)}vh`);
      root.style.setProperty("--aster-scale", String(scale));
      root.style.setProperty("--aster-rotate", `${rotate}deg`);
      root.style.setProperty("--aster-size", `${size}px`);
      root.style.setProperty("--aster-opacity", String(opacity));
      root.dataset.scene = currentScene;

      if (resolved.image && resolved.image !== currentImage) {
        const image = getImage();
        if (image) {
          image.src = `./assets/mascot/aster-${resolved.image}.png`;
          currentImage = resolved.image;
        }
      }

      const speech = getSpeech();
      if (speech && resolved.speech) {
        speech.textContent = resolved.speech;
      }

      root.classList.toggle("is-offscreen", x < -2 || x > 102 || y < -2 || y > 102);

      if (options.immediate) {
        root.classList.add("is-immediate");
        window.requestAnimationFrame(() => root.classList.remove("is-immediate"));
      }
    }

    function syncScene(immediate = false) {
      const root = getRoot();
      if (!root) {
        return;
      }

      const nextScene = getScene();
      root.classList.toggle("is-hidden", !nextScene);
      if (!nextScene) {
        return;
      }

      const sceneChanged = nextScene !== currentScene;
      if (sceneChanged || !currentRoute.length) {
        currentScene = nextScene;
        const selection = pickRoute(currentScene);
        currentRouteIndex = selection.index;
        currentRoute = selection.route;
        currentStep = 0;
      }

      if (!currentRoute.length) {
        return;
      }

      applyFrame(currentRoute[currentStep], { immediate });
    }

    function advanceRoam() {
      const root = getRoot();
      if (!root) {
        return;
      }

      const nextScene = getScene();
      if (!nextScene) {
        root.classList.add("is-hidden");
        return;
      }

      if (nextScene !== currentScene || !currentRoute.length) {
        syncScene(true);
        return;
      }

      if (currentStep < currentRoute.length - 1) {
        currentStep += 1;
        applyFrame(currentRoute[currentStep]);
        return;
      }

      const selection = pickRoute(currentScene, currentRouteIndex);
      currentRouteIndex = selection.index;
      currentRoute = selection.route;
      currentStep = 0;
      applyFrame(currentRoute[currentStep]);
    }

    function queueSync() {
      if (syncHandle) {
        return;
      }

      syncHandle = window.requestAnimationFrame(() => {
        syncHandle = 0;
        syncScene(true);
      });
    }

    function start() {
      if (roamTimer) {
        return;
      }

      syncScene(true);
      roamTimer = window.setInterval(advanceRoam, 7600);
      window.addEventListener("resize", queueSync, { passive: true });
    }

    function stop() {
      if (roamTimer) {
        window.clearInterval(roamTimer);
        roamTimer = null;
      }

      if (syncHandle) {
        window.cancelAnimationFrame(syncHandle);
        syncHandle = 0;
      }
    }

    return {
      start,
      stop,
      sync: syncScene,
      queueSync,
    };
  };
})(window);
