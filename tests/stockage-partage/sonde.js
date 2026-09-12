/*
  Sonde de cloisonnement du stockage.

  Question posee : deux pages de MEME ORIGINE, installees comme deux icones
  distinctes sur l'ecran d'accueil iOS, partagent-elles IndexedDB et
  localStorage ? Dans un navigateur classique, oui, sans discussion. Sur iOS,
  une application installee peut recevoir son propre conteneur de stockage, et
  la reponse ne se lit nulle part de facon fiable : elle se mesure.

  Les deux stockages sont testes, pas seulement IndexedDB :

  - IndexedDB porterait la file des dictees
  - localStorage porte la session Supabase (atlas-connaissance-app-session),
    donc la capacite de la page de dictee a parler a Supabase toute seule

  Le second compte autant que le premier : si la session n'est pas partagee, il
  faudra se connecter une seconde fois depuis l'icone de dictee.
*/
(function initializeSonde(global) {
  const nomBase = "atlas-test-partage";
  const nomMagasin = "sondes";
  const cleLocale = "atlas-test-partage";

  function ouvrirBase() {
    return new Promise((resoudre, rejeter) => {
      const requete = global.indexedDB.open(nomBase, 1);
      requete.onupgradeneeded = () => {
        const base = requete.result;
        if (!base.objectStoreNames.contains(nomMagasin)) {
          base.createObjectStore(nomMagasin, { keyPath: "id" });
        }
      };
      requete.onsuccess = () => resoudre(requete.result);
      requete.onerror = () => rejeter(requete.error || new Error("ouverture refusee"));
    });
  }

  function contexte() {
    const autonome =
      global.matchMedia?.("(display-mode: standalone)")?.matches ||
      global.navigator.standalone === true;

    return {
      autonome,
      etiquette: autonome ? "icone installee (standalone)" : "onglet de navigateur",
      origine: global.location.origin,
      chemin: global.location.pathname,
    };
  }

  async function ecrire(source) {
    const enregistrement = {
      id: "sonde",
      source,
      ecritLe: new Date().toISOString(),
      contexte: contexte().etiquette,
    };

    const base = await ouvrirBase();
    await new Promise((resoudre, rejeter) => {
      const transaction = base.transaction(nomMagasin, "readwrite");
      transaction.objectStore(nomMagasin).put(enregistrement);
      transaction.oncomplete = () => resoudre();
      transaction.onerror = () => rejeter(transaction.error);
      transaction.onabort = () => rejeter(transaction.error);
    });

    try {
      global.localStorage.setItem(cleLocale, JSON.stringify(enregistrement));
    } catch (erreur) {
      enregistrement.erreurLocalStorage = erreur.message;
    }

    return enregistrement;
  }

  async function lire() {
    let indexedDb = null;
    let erreurIndexedDb = "";

    try {
      const base = await ouvrirBase();
      indexedDb = await new Promise((resoudre, rejeter) => {
        const transaction = base.transaction(nomMagasin, "readonly");
        const requete = transaction.objectStore(nomMagasin).get("sonde");
        requete.onsuccess = () => resoudre(requete.result || null);
        requete.onerror = () => rejeter(requete.error);
      });
    } catch (erreur) {
      erreurIndexedDb = erreur.message || String(erreur);
    }

    let local = null;
    try {
      const brut = global.localStorage.getItem(cleLocale);
      local = brut ? JSON.parse(brut) : null;
    } catch (erreur) {
      local = null;
    }

    // La vraie cle de session d'Atlas : si elle est visible ici, la page de
    // dictee heritera de la connexion sans nouvelle saisie.
    let sessionAtlas = false;
    try {
      sessionAtlas = Boolean(global.localStorage.getItem("atlas-connaissance-app-session"));
    } catch (erreur) {
      sessionAtlas = false;
    }

    return { indexedDb, erreurIndexedDb, local, sessionAtlas, contexte: contexte() };
  }

  global.Sonde = { contexte, ecrire, lire };
})(window);
