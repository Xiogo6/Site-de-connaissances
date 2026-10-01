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

      Un troisieme etat est accepte, "syncing", mais seulement si l'espace
      distant a bien ete charge juste avant (`loadedFromRemote`). C'est le cas
      courant au demarrage : le snapshot quotidien, ou un dossier systeme
      recree, part vers Supabase aussitot apres le chargement. L'etat local
      est alors celui de reference plus une ecriture en cours ; le refuser
      laissait les pages des raccourcis bloquees dans la file a chaque
      premiere ouverture de la journee, sans rien signaler.

      Tout le reste est bloque, "error" et "loading" en tete : ce sont
      precisement les cas ou l'etat local n'est pas celui de reference.
    */
    const etatsSurs = ["synced", "idle"];

    function isAvailable() {
      const etat = context.state?.remote;
      const sur =
        etatsSurs.includes(etat?.status) ||
        (etat?.status === "syncing" && etat?.loadedFromRemote === true);
      return Boolean(
        remote?.syncEnabled &&
          remote?.url &&
          context.auth?.isSignedIn() &&
          !context.data?.isReadOnlyMode?.() &&
          sur
      );
    }

    /*
      La file porte aussi les pages tapees dans write.html, marquees
      `source: "texte"`. Tout le reste du chemin est le meme : seuls le
      prefixe d'identifiant, le titre par defaut et le dossier changent.
    */
    function isWritten(row) {
      return row?.payload?.source === "texte";
    }

    /*
      Complement d'une dictee deja deposee, envoye depuis voice.html. Il ne
      cree pas de page : il vise celle de la dictee d'origine, dont
      l'identifiant se deduit de son client_key.
    */
    function isAppend(row) {
      return row?.payload?.source === "voice-append";
    }

    function noteIdForClientKey(clientKey, prefix = "voice") {
      const empreinte = String(clientKey || "")
        .replace(/[^a-z0-9]/gi, "")
        .slice(0, 12)
        .toLowerCase();
      return `${prefix}-${empreinte || "inconnue"}`;
    }

    function todoIdPrefixForClientKey(clientKey) {
      return AtlasApp.todoInbox.idPrefix(clientKey);
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
      const nom = isWritten(row) ? "Note" : "Dictee";
      if (Number.isNaN(date.getTime())) {
        return nom;
      }
      return `${nom} du ${date.toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long",
      })}`;
    }

    /*
      Une page tapee dans write.html porte `payload.note` : les champs de
      l'editeur "Nouvelle page", deja composes comme saveCurrentNote() l'aurait
      fait. Seul l'emplacement se decide ici, parce que lui seul depend de
      l'etat d'Atlas au moment de l'ingestion :

      - sans "Classer directement" : le rangement par defaut du type, comme
        une nouvelle page d'Atlas (a trier, Daily, racine pour un dossier)
      - avec : le dossier choisi s'il existe toujours, la racine si c'est ce
        qui avait ete choisi, et le rangement par defaut si le dossier a
        disparu entre-temps.
    */
    function resolveWrittenParent(note) {
      if (!note.directClassify) {
        return "";
      }
      if (!note.parentId) {
        return null;
      }
      const dossier = context.state.notes.find(
        (candidate) => candidate.id === note.parentId && candidate.type === "folder"
      );
      return dossier ? dossier.id : "";
    }

    function readWrittenNote(row) {
      const note = row?.payload?.note;
      if (!note || typeof note !== "object") {
        return null;
      }
      const title = String(note.title || "").trim() || "Sans titre";
      return {
        clientKey: row?.client_key || "",
        written: true,
        title,
        type: String(note.type || "").trim() || "concept",
        tags: Array.isArray(note.tags) ? note.tags : [],
        favorite: Boolean(note.favorite),
        metadata: note.metadata && typeof note.metadata === "object" ? note.metadata : null,
        content: String(note.content || "").trim() || `# ${title}`,
        parentId: resolveWrittenParent(note),
      };
    }

    function readRow(row) {
      const ecrit = isWritten(row) ? readWrittenNote(row) : null;
      if (ecrit) {
        return ecrit;
      }

      const structured = row?.payload?.structured || {};
      const title = String(structured.title || "").trim() || fallbackTitle(row);
      const contenu = String(structured.content || "").trim();
      const transcription = String(row?.payload?.transcript || "").trim();

      return {
        clientKey: row?.client_key || "",
        written: isWritten(row),
        title,
        type: String(structured.type || "").trim() || "concept",
        tags: Array.isArray(structured.tags) ? structured.tags : [],
        // Si la mise en forme manque, la transcription brute vaut mieux que
        // rien : c'est ce que l'utilisateur a dit.
        content: contenu || (transcription ? `# ${title}\n\n${transcription}` : ""),
      };
    }

    /*
      Lecture anticipee. La lecture de la file ne modifie rien : elle peut donc
      partir en meme temps que le chargement de l'espace distant, au lieu
      d'attendre qu'il soit fini. Seule la creation des pages reste soumise a
      isAvailable(), dans ingest(). Les lignes lues ici servent une seule fois.
    */
    let lectureAnticipee = null;

    function prefetch() {
      const peutLire = Boolean(
        remote?.syncEnabled &&
          remote?.url &&
          context.auth?.isSignedIn() &&
          !context.data?.isReadOnlyMode?.()
      );
      lectureAnticipee = peutLire ? fetchRows().catch(() => null) : null;
    }

    async function ingest() {
      const anticipee = lectureAnticipee;
      lectureAnticipee = null;

      if (!isAvailable()) {
        return { created: 0, skipped: 0, lastNoteId: null, todosCreated: 0, appended: 0 };
      }

      // Une lecture anticipee ratee se rattrape ici par une lecture normale.
      const rows = (anticipee && (await anticipee)) || (await fetchRows());
      if (!rows.length) {
        return { created: 0, skipped: 0, lastNoteId: null, todosCreated: 0, appended: 0 };
      }

      const traitees = [];
      let created = 0;
      let skipped = 0;
      let lastNoteId = null;

      let todosCreated = 0;
      let appended = 0;

      rows.forEach((row) => {
        // Lignes du raccourci todo.html (ajouts et gestes sur la liste) :
        // meme file, autre destination. Elles touchent la liste de taches,
        // pas l'arbre des pages.
        if (AtlasApp.todoInbox?.isTodoPayload(row?.payload) && context.todos?.applyInboxPayload) {
          if (row.client_key) {
            todosCreated += context.todos.applyInboxPayload({
              payload: row.payload,
              clientKey: row.client_key,
              createdAt: row.created_at,
            });
          }
          traitees.push(row.client_key);
          return;
        }

        if (isAppend(row)) {
          const resultat = appendToNote(row);
          traitees.push(row.client_key);
          if (resultat.noteId) {
            lastNoteId = resultat.noteId;
          }
          if (resultat.appended) {
            appended += 1;
          } else if (resultat.created) {
            created += 1;
          } else {
            skipped += 1;
          }
          return;
        }

        const donnees = readRow(row);
        if (!donnees.clientKey || !donnees.content) {
          // Ligne inexploitable : on la retire plutot que de la relire a chaque
          // demarrage.
          traitees.push(row.client_key);
          skipped += 1;
          return;
        }

        const noteId = noteIdForClientKey(donnees.clientKey, donnees.written ? "ecrit" : "voice");
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
          favorite: donnees.favorite,
          metadata: donnees.metadata,
          // Toutes les dictees au meme endroit, a trier ensuite a la main.
          // Une page tapee suit les regles de l'editeur ; celles d'une
          // ancienne version de write.html gardent leur dossier.
          parentId:
            donnees.parentId !== undefined
              ? donnees.parentId
              : donnees.written
              ? context.notes.ensureWrittenFolder().id
              : context.notes.ensureVoiceFolder().id,
        });

        traitees.push(row.client_key);
        lastNoteId = note.id;
        created += 1;
      });

      // Enregistrement AVANT toute suppression distante.
      if (created || todosCreated || appended) {
        context.data.saveNotes();
      }

      /*
        La ligne ne quitte la file qu'une fois la page arrivee dans Supabase.
        Avant, elle etait retiree des l'enregistrement local : si l'envoi
        echouait ensuite, la page n'existait plus que sur cet appareil. Si
        l'envoi echoue, la ligne reste, et le prochain demarrage reconnait la
        page deja creee (meme identifiant) et retente seulement la suppression.
        Rien de tout cela ne retarde l'affichage.
      */
      const suppressions = context.data.whenRemoteSaved
        ? context.data
            .whenRemoteSaved()
            .then((envoye) => (envoye ? supprimerLignes(traitees) : []))
        : supprimerLignes(traitees);

      return { created, skipped, lastNoteId, todosCreated, appended, suppressions };
    }

    /*
      Ajoute le complement a la fin de la page de la dictee d'origine.

      Idempotence : si le texte figure deja dans la page, rien n'est ajoute.
      C'est le cas d'une ligne dont la suppression avait echoue la derniere
      fois, et c'est le seul marqueur qui survive a un rechargement depuis
      Supabase (un champ pose sur la page serait efface).

      La page d'origine a disparu (supprimee dans Atlas) : le texte devient
      une page a part dans le dossier des dictees plutot que d'etre perdu.
      Les lignes etant lues dans l'ordre d'arrivee, une dictee et son
      complement deposes avant la meme ouverture d'Atlas arrivent dans le bon
      ordre : la page existe deja quand le complement la cherche.
    */
    function appendToNote(row) {
      const payload = row?.payload || {};
      const texte = String(payload.text || "").trim();
      if (!texte || !row.client_key) {
        return {};
      }

      const cibleId = noteIdForClientKey(payload.targetClientKey, "voice");
      const cible = payload.targetClientKey
        ? context.state.notes.find((note) => note.id === cibleId)
        : null;

      if (cible) {
        const contenu = String(cible.content || "");
        if (contenu.includes(texte)) {
          return { noteId: cible.id };
        }
        cible.content = `${contenu.trimEnd()}\n\n${texte}`;
        cible.updatedAt = new Date().toISOString();
        return { appended: true, noteId: cible.id };
      }

      const noteId = noteIdForClientKey(row.client_key, "voice");
      if (context.state.notes.some((note) => note.id === noteId)) {
        return { noteId };
      }
      const titre = `Complement : ${String(payload.targetTitle || "").trim() || fallbackTitle(row)}`;
      const note = context.notes.createNoteFromCapture({
        id: noteId,
        title: titre,
        content: `# ${titre}\n\n${texte}`,
        parentId: context.notes.ensureVoiceFolder().id,
      });
      return { created: true, noteId: note.id };
    }

    function supprimerLignes(traitees) {
      return Promise.all(
        traitees.map((clientKey) =>
          deleteRow(clientKey).catch(() => {
            // Sans consequence : la page porte deja l'identifiant de la dictee,
            // la ligne sera reconnue et ignoree au prochain demarrage.
          })
        )
      );
    }

    return { ingest, prefetch, isAvailable, noteIdForClientKey, todoIdPrefixForClientKey };
  };
})(window);
