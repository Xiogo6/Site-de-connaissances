/*
  Ingestion des dictees vocales, cote Atlas.

  La page de dictee depose du texte dans la table voice_inbox. Ce module la lit
  au demarrage, fabrique les pages, puis supprime les lignes traitees. Les deux
  pages ne se parlent jamais autrement.

  Rien ici ne fabrique de page a sa facon : tout passe par
  `context.notes.createNoteFromCapture()`, le meme chemin que la note rapide.

  IDEMPOTENCE. L'identifiant de la page est derive du client_key de la dictee.
  C'est volontaire et c'est le coeur du mecanisme : `normalizeImportedNote` ne
  garde que des champs connus, donc un marqueur pose sur la page serait efface
  au premier rechargement depuis Supabase. L'identifiant, lui, survit a tout.

  Il repond alors exactement a la question "cette dictee est-elle deja une
  page ?", et deux appareils qui ingereraient la meme ligne en meme temps
  produiraient deux fois le meme identifiant, donc une seule page apres
  synchronisation, au lieu d'un doublon.

  ORDRE. On cree, on enregistre, PUIS on supprime la ligne distante. Dans
  l'autre sens, une coupure entre les deux perdrait la dictee : son audio a
  deja ete efface du telephone. Une suppression ratee ne coute rien, la ligne
  sera reconnue et ignoree au prochain demarrage.
*/
(function initializeVoiceInboxModule(global) {
  const AtlasApp = (global.AtlasApp = global.AtlasApp || {});

  AtlasApp.createVoiceInboxModule = function createVoiceInboxModule(context) {
    const remote = AtlasApp.config.supabase;
    // Une ingestion de demarrage ne doit pas s'eterniser si la file a gonfle.
    // Le reste suivra au demarrage suivant.
    const maxParDemarrage = 50;

    /*
      La condition sur `remote.status` n'est pas decorative.

      Creer une page appelle `saveNotes()`, qui renvoie a Supabase l'etat
      COMPLET, reglages compris. Tant que l'espace distant n'a pas ete charge,
      cet etat est celui du stockage local, qui peut etre vide ou en retard :
      une ingestion automatique au demarrage ecraserait alors les reglages
      distants sans que personne n'ait rien demande.

      Deux etats seulement autorisent l'ingestion :

      - "synced" : le contenu distant a ete charge et applique
      - "idle"   : la base a repondu, mais elle est vide. Il n'y a alors rien
                   a ecraser, et refuser d'ingerer condamnerait un Atlas encore
                   vierge a ne jamais recevoir ses dictees.

      Tout le reste est bloque, "error" et "loading" en tete : ce sont
      precisement les cas ou l'etat local n'est pas celui de reference.
    */
    const etatsSurs = ["synced", "idle"];

    function isAvailable() {
      return Boolean(
        remote?.syncEnabled &&
          remote?.url &&
          context.auth?.isSignedIn() &&
          !context.data?.isReadOnlyMode?.() &&
          etatsSurs.includes(context.state?.remote?.status)
      );
    }

    function noteIdForClientKey(clientKey) {
      const empreinte = String(clientKey || "")
        .replace(/[^a-z0-9]/gi, "")
        .slice(0, 12)
        .toLowerCase();
      return `voice-${empreinte || "inconnue"}`;
    }

    async function buildHeaders() {
      const accessToken = await context.auth.getAccessToken();
      if (!accessToken) {
        throw new Error("Session Supabase expiree.");
      }

      return {
        apikey: remote.publishableKey,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      };
    }

    async function fetchRows() {
      const response = await fetch(
        `${remote.url}/rest/v1/voice_inbox` +
          `?select=client_key,created_at,payload&order=created_at.asc&limit=${maxParDemarrage}`,
        { headers: await buildHeaders() }
      );

      if (!response.ok) {
        throw new Error((await response.text()) || `Lecture refusee (${response.status}).`);
      }

      const rows = await response.json();
      return Array.isArray(rows) ? rows : [];
    }

    async function deleteRow(clientKey) {
      const response = await fetch(
        `${remote.url}/rest/v1/voice_inbox?client_key=eq.${encodeURIComponent(clientKey)}`,
        { method: "DELETE", headers: await buildHeaders() }
      );

      if (!response.ok) {
        throw new Error((await response.text()) || `Suppression refusee (${response.status}).`);
      }
    }

    // Une dictee sans titre exploitable garde au moins sa date : une page
    // "Sans titre" de plus serait introuvable trois jours apres.
    function fallbackTitle(row) {
      const date = new Date(row?.payload?.capturedAt || row?.created_at || Date.now());
      if (Number.isNaN(date.getTime())) {
        return "Dictee";
      }
      return `Dictee du ${date.toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long",
      })}`;
    }

    function readRow(row) {
      const structured = row?.payload?.structured || {};
      const title = String(structured.title || "").trim() || fallbackTitle(row);
      const contenu = String(structured.content || "").trim();
      const transcription = String(row?.payload?.transcript || "").trim();

      return {
        clientKey: row?.client_key || "",
        title,
        type: String(structured.type || "").trim() || "concept",
        tags: Array.isArray(structured.tags) ? structured.tags : [],
        // Si la mise en forme manque, la transcription brute vaut mieux que
        // rien : c'est ce que l'utilisateur a dit.
        content: contenu || (transcription ? `# ${title}\n\n${transcription}` : ""),
      };
    }

    async function ingest() {
      if (!isAvailable()) {
        return { created: 0, skipped: 0, lastNoteId: null };
      }

      const rows = await fetchRows();
      if (!rows.length) {
        return { created: 0, skipped: 0, lastNoteId: null };
      }

      const traitees = [];
      let created = 0;
      let skipped = 0;
      let lastNoteId = null;

      rows.forEach((row) => {
        const donnees = readRow(row);
        if (!donnees.clientKey || !donnees.content) {
          // Ligne inexploitable : on la retire plutot que de la relire a chaque
          // demarrage.
          traitees.push(row.client_key);
          skipped += 1;
          return;
        }

        const noteId = noteIdForClientKey(donnees.clientKey);
        const dejaLa = context.state.notes.some((note) => note.id === noteId);

        if (dejaLa) {
          // La page existe : la ligne n'avait pas pu etre supprimee la
          // derniere fois. On ne recree rien, on retente la suppression.
          traitees.push(row.client_key);
          skipped += 1;
          return;
        }

        const note = context.notes.createNoteFromCapture({
          id: noteId,
          title: donnees.title,
          type: donnees.type,
          tags: donnees.tags,
          content: donnees.content,
          // Toutes les dictees au meme endroit, a trier ensuite a la main.
          parentId: context.notes.ensureVoiceFolder().id,
        });

        traitees.push(row.client_key);
        lastNoteId = note.id;
        created += 1;
      });

      // Enregistrement AVANT toute suppression distante.
      if (created) {
        context.data.saveNotes();
      }

      for (const clientKey of traitees) {
        try {
          await deleteRow(clientKey);
        } catch (error) {
          // Sans consequence : la page porte deja l'identifiant de la dictee,
          // la ligne sera reconnue et ignoree au prochain demarrage.
        }
      }

      return { created, skipped, lastNoteId };
    }

    return { ingest, isAvailable, noteIdForClientKey };
  };
})(window);
