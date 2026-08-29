const CACHE_NAME = "atlas-connaissance-v91";
const ASSETS = [
  "./",
  "./index.html",
  "./app.js",
  "./scripts/config.js",
  "./scripts/dom.js",
  "./scripts/helpers.js",
  "./scripts/data.js",
  "./scripts/auth.js",
  "./scripts/ai.js",
  "./scripts/notes.js",
  "./scripts/graph.js",
  "./scripts/quiz.js",
  "./scripts/mascot.js",
  "./scripts/todos.js",
  "./scripts/sport.js",
  "./scripts/renderers.js",
  "./scripts/events.js",
  "./styles/tokens.css",
  "./styles/base.css",
  "./styles/layout.css",
  "./styles/components.css",
  "./styles/features.css",
  "./styles/themes.css",
  "./assets/mascot/aster-neutral.png",
  "./assets/mascot/aster-happy.png",
  "./assets/mascot/aster-thinking.png",
  "./manifest.webmanifest",
  "./icon.svg",
  "./knowledge-base.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(event.request.url);
  const isSameOrigin = requestUrl.origin === self.location.origin;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (isSameOrigin && response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() =>
        caches.match(event.request).then((cached) => {
          if (cached) {
            return cached;
          }

          // Seule une navigation peut recevoir index.html en repli.
          // Servir du HTML a la place d'un script ou d'une feuille de style
          // transformait un fichier manquant en page blanche (C-04).
          if (event.request.mode === "navigate") {
            return caches.match("./index.html");
          }

          return new Response("", {
            status: 504,
            statusText: "Ressource indisponible hors ligne",
          });
        })
      )
  );
});
