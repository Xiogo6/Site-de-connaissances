const CACHE_NAME = "atlas-connaissance-v62";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./scripts/config.js",
  "./scripts/dom.js",
  "./scripts/helpers.js",
  "./scripts/data.js",
  "./scripts/notes.js",
  "./scripts/graph.js",
  "./scripts/quiz.js",
  "./scripts/mascot.js",
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

          if (event.request.mode === "navigate") {
            return caches.match("./index.html");
          }

          return Promise.reject(new Error("Asset unavailable offline"));
        })
      )
      .catch(() => caches.match("./index.html"))
  );
});
