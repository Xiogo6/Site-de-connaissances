const CACHE_NAME = "atlas-connaissance-v129";
// Meme numero que les ?v= des pages (index, voice, write, todo) : version.sh les
// avance ensemble, un test verifie qu'ils concordent.
const VERSION = CACHE_NAME.split("-v").pop();
const ASSETS = [
  "./",
  "./index.html",
  "./voice.html",
  "./write.html",
  "./todo.html",
  "./app.js",
  "./scripts/config.js",
  "./scripts/dom.js",
  "./scripts/helpers.js",
  "./scripts/data.js",
  "./scripts/auth.js",
  "./scripts/ai.js",
  "./scripts/notes.js",
  "./scripts/todo-inbox.js",
  "./scripts/voice-inbox.js",
  "./scripts/graph.js",
  "./scripts/quiz.js",
  "./scripts/mascot.js",
  "./scripts/todos.js",
  "./scripts/sport.js",
  "./scripts/renderers.js",
  "./scripts/events.js",
  "./scripts/voice.js",
  "./scripts/voice-send.js",
  "./scripts/write.js",
  "./scripts/todo-quick.js",
  "./styles/tokens.css",
  "./styles/base.css",
  "./styles/layout.css",
  "./styles/components.css",
  "./styles/features.css",
  "./styles/themes.css",
  "./assets/atlas-logo.png",
  "./assets/mascot/aster-neutral.png",
  "./assets/mascot/aster-happy.png",
  "./assets/mascot/aster-thinking.png",
  "./manifest.webmanifest",
  "./voice.webmanifest",
  "./write.webmanifest",
  "./icon.svg",
  "./voice-icon.svg",
  "./voice-icon-180.png",
  "./voice-icon-512.png",
  "./write-icon.svg",
  "./write-icon-180.png",
  "./write-icon-512.png",
  "./todo.webmanifest",
  "./todo-icon.svg",
  "./todo-icon-180.png",
  "./todo-icon-512.png",
  "./knowledge-base.json",
];

// Les pages demandent leurs scripts et leurs feuilles avec ?v=. Le cache doit
// porter exactement ces adresses, sans quoi rien de ce qui est mis en cache a
// l'installation ne sert a l'ouverture suivante.
function cacheUrlFor(asset) {
  return /\.(js|css)$/.test(asset) ? `${asset}?v=${VERSION}` : asset;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // "reload" contourne le cache HTTP : sans cela, une page vieille de
      // quelques minutes pouvait entrer dans le nouveau cache.
      cache.addAll(ASSETS.map((asset) => new Request(cacheUrlFor(asset), { cache: "reload" })))
    )
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

/*
  Trois strategies, parce que trois sortes de fichiers.

  - Les pages (navigation) partent du cache tout de suite, et le reseau met le
    cache a jour en arriere-plan. Auparavant chaque ouverture attendait le
    reseau pour la page ET pour chacun des vingt scripts et feuilles : sur un
    reseau mobile, pres de deux secondes d'ecran vide alors que tout etait
    deja sur le telephone. Contrepartie : une nouvelle version publiee
    s'affiche a l'ouverture qui suit sa decouverte.
  - Les fichiers versionnes (?v=) ne changent jamais sous une meme adresse :
    le cache suffit, le reseau ne sert qu'en cas d'absence.
  - Le reste (manifestes, knowledge-base.json...) garde le reseau d'abord.

  Les autres origines (Supabase, Gemini) ne passent plus par ici : le
  navigateur les traite directement, sans detour ni mise en cache.
*/
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(serveNavigation(event));
    return;
  }

  if (requestUrl.searchParams.has("v")) {
    event.respondWith(serveVersioned(event.request));
    return;
  }

  event.respondWith(serveNetworkFirst(event.request));
});

async function serveNavigation(event) {
  const request = event.request;
  const url = new URL(request.url);
  // Une meme page repond a plusieurs adresses (./, ./index.html,
  // ./?source=published) : on la range sous son chemin, sans parametres.
  const cacheKey = `${url.origin}${url.pathname}`;
  const cached = await caches.match(request, { ignoreSearch: true });

  const refresh = fetch(request)
    .then(async (response) => {
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(cacheKey, response.clone());
      }
      return response;
    });

  if (cached) {
    // Le service worker doit rester en vie jusqu'a la fin de la mise a jour.
    event.waitUntil(refresh.catch(() => {}));
    return cached;
  }

  try {
    return await refresh;
  } catch (error) {
    // Seule une navigation peut recevoir index.html en repli.
    return (await caches.match("./index.html")) || offlineResponse();
  }
}

async function serveVersioned(request) {
  const cached = await caches.match(request);
  if (cached) {
    return cached;
  }

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    // Jamais de HTML a la place d'un script ou d'une feuille de style : un
    // fichier manquant devenait une page blanche (C-04).
    return offlineResponse();
  }
}

async function serveNetworkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    return (await caches.match(request)) || offlineResponse();
  }
}

function offlineResponse() {
  return new Response("", {
    status: 504,
    statusText: "Ressource indisponible hors ligne",
  });
}
