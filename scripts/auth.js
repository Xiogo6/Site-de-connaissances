/*
  C-01 : acces authentifie a Supabase.

  Le depot est public, donc la cle publiable est lisible par tout le monde.
  Tant que les fonctions get_app_payload et sync_app_payload etaient accordees
  au role anon, cette cle suffisait a lire et a ecraser toute la base.

  Ce module ajoute une session Supabase Auth. Le principe important pour l'usage
  quotidien : on ne saisit son mot de passe qu'une fois par appareil. Supabase
  renvoie un jeton de rafraichissement, conserve sur l'appareil et renouvele
  automatiquement, donc l'application s'ouvre ensuite directement.
*/
(function initializeAuthModule(global) {
  const AtlasApp = (global.AtlasApp = global.AtlasApp || {});

  AtlasApp.createAuthModule = function createAuthModule(context) {
    const { appStorageKey, supabase } = AtlasApp.config;
    const sessionStorageKey = `${appStorageKey}-session`;
    const remoteUrl = String(supabase?.url || "").trim();
    const publishableKey = String(supabase?.publishableKey || "").trim();
    // On rafraichit un peu avant l'expiration reelle pour ne jamais partir
    // avec un jeton perime sur un reseau lent.
    const refreshMarginMs = 90 * 1000;

    let session = null;
    let refreshPromise = null;
    let statusMessage = "";

    function isConfigured() {
      return Boolean(remoteUrl && publishableKey);
    }

    function isSignedIn() {
      return Boolean(session?.accessToken && session?.refreshToken);
    }

    function getEmail() {
      return session?.email || "";
    }

    function getStatusMessage() {
      return statusMessage;
    }

    function normalizeStoredSession(raw) {
      const accessToken = typeof raw?.accessToken === "string" ? raw.accessToken : "";
      const refreshToken = typeof raw?.refreshToken === "string" ? raw.refreshToken : "";
      if (!accessToken || !refreshToken) {
        return null;
      }

      return {
        accessToken,
        refreshToken,
        expiresAt: Number(raw?.expiresAt) || 0,
        email: typeof raw?.email === "string" ? raw.email : "",
      };
    }

    function normalizeTokenResponse(raw) {
      const accessToken = typeof raw?.access_token === "string" ? raw.access_token : "";
      const refreshToken = typeof raw?.refresh_token === "string" ? raw.refresh_token : "";
      if (!accessToken || !refreshToken) {
        return null;
      }

      const expiresAt = Number(raw?.expires_at)
        ? Number(raw.expires_at) * 1000
        : Date.now() + (Number(raw?.expires_in) || 3600) * 1000;

      return {
        accessToken,
        refreshToken,
        expiresAt,
        email: typeof raw?.user?.email === "string" ? raw.user.email : session?.email || "",
      };
    }

    function persistSession(nextSession) {
      session = nextSession;

      try {
        if (nextSession) {
          window.localStorage.setItem(sessionStorageKey, JSON.stringify(nextSession));
        } else {
          window.localStorage.removeItem(sessionStorageKey);
        }
      } catch (error) {
        // Stockage plein ou indisponible : la session reste valable pour cet onglet.
      }
    }

    function readStoredSession() {
      try {
        const raw = window.localStorage.getItem(sessionStorageKey);
        return raw ? normalizeStoredSession(JSON.parse(raw)) : null;
      } catch (error) {
        return null;
      }
    }

    async function readAuthError(response) {
      let payload = null;
      try {
        payload = await response.json();
      } catch (error) {
        payload = null;
      }

      const code = payload?.error_code || payload?.error || "";
      const detail = payload?.error_description || payload?.msg || payload?.message || "";

      if (response.status === 400 && /invalid[_ ]grant|invalid login/i.test(`${code} ${detail}`)) {
        return "Adresse ou mot de passe incorrect.";
      }

      if (response.status === 422) {
        return "Adresse e-mail invalide.";
      }

      if (response.status === 429) {
        return "Trop de tentatives. Reessaie dans quelques minutes.";
      }

      return detail || `Connexion refusee (${response.status}).`;
    }

    async function requestToken(grantType, body) {
      const response = await fetch(
        `${remoteUrl}/auth/v1/token?grant_type=${encodeURIComponent(grantType)}`,
        {
          method: "POST",
          headers: {
            apikey: publishableKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        }
      );

      if (!response.ok) {
        const error = new Error(await readAuthError(response));
        error.status = response.status;
        throw error;
      }

      const nextSession = normalizeTokenResponse(await response.json());
      if (!nextSession) {
        throw new Error("Reponse d'authentification incomplete.");
      }

      persistSession(nextSession);
      return nextSession;
    }

    // Les jetons de rafraichissement tournent : chaque appel invalide le precedent.
    // Une seule requete a la fois, sinon deux appels concurrents s'annulent.
    function refreshSession() {
      if (refreshPromise) {
        return refreshPromise;
      }

      const refreshToken = session?.refreshToken;
      if (!refreshToken) {
        return Promise.resolve(null);
      }

      refreshPromise = requestToken("refresh_token", { refresh_token: refreshToken })
        .catch((error) => {
          // Un refus definitif signifie que la session n'est plus valable.
          // Une simple coupure reseau, elle, ne doit pas deconnecter.
          if (error.status >= 400 && error.status < 500) {
            persistSession(null);
            statusMessage = "Session expiree, reconnecte-toi.";
            renderGate();
          }
          return null;
        })
        .finally(() => {
          refreshPromise = null;
        });

      return refreshPromise;
    }

    async function getAccessToken() {
      if (!isSignedIn()) {
        return "";
      }

      if (session.expiresAt - Date.now() > refreshMarginMs) {
        return session.accessToken;
      }

      const refreshed = await refreshSession();
      return refreshed?.accessToken || "";
    }

    async function signIn(email, password) {
      if (!isConfigured()) {
        throw new Error("Supabase n'est pas configure.");
      }

      const nextSession = await requestToken("password", {
        email: String(email || "").trim(),
        password: String(password || ""),
      });
      statusMessage = "";
      return nextSession;
    }

    function signOut() {
      persistSession(null);
      statusMessage = "";
      renderGate();
    }

    // Au demarrage : on reprend la session stockee, en la rafraichissant si
    // elle est proche de l'expiration. Aucune saisie n'est demandee tant que
    // le jeton de rafraichissement reste accepte.
    async function restore() {
      if (!isConfigured()) {
        return false;
      }

      session = readStoredSession();
      if (!session) {
        return false;
      }

      if (session.expiresAt - Date.now() > refreshMarginMs) {
        return true;
      }

      const refreshed = await refreshSession();
      return Boolean(refreshed);
    }

    /* ---------- ecran de connexion ---------- */

    function renderGate() {
      const gate = context.elements.authGate;
      if (!gate) {
        return;
      }

      const shouldShow = isConfigured() && !isSignedIn() && !context.data?.isReadOnlyMode?.();
      gate.classList.toggle("is-hidden", !shouldShow);
      gate.setAttribute("aria-hidden", shouldShow ? "false" : "true");
      document.documentElement.classList.toggle("has-auth-gate", shouldShow);

      if (context.elements.authError) {
        context.elements.authError.textContent = statusMessage;
        context.elements.authError.hidden = !statusMessage;
      }

      if (context.elements.authSessionStatus) {
        context.elements.authSessionStatus.textContent = isSignedIn()
          ? getEmail() || "Session ouverte"
          : "Hors ligne";
      }

      if (shouldShow) {
        window.requestAnimationFrame(() => {
          context.elements.authEmail?.focus();
        });
      }
    }

    function setBusy(isBusy) {
      const button = context.elements.authSubmit;
      if (!button) {
        return;
      }

      button.disabled = isBusy;
      button.textContent = isBusy ? "Connexion..." : "Se connecter";
    }

    async function handleSubmit(event) {
      event.preventDefault();
      statusMessage = "";
      setBusy(true);

      try {
        await signIn(context.elements.authEmail?.value, context.elements.authPassword?.value);
        if (context.elements.authPassword) {
          context.elements.authPassword.value = "";
        }
        renderGate();
        await context.onSignedIn?.();
      } catch (error) {
        statusMessage = error.message || "Connexion impossible.";
        renderGate();
      } finally {
        setBusy(false);
      }
    }

    function bindEvents() {
      context.elements.authForm?.addEventListener("submit", handleSubmit);
      context.elements.authSignOut?.addEventListener("click", () => {
        signOut();
        window.location.reload();
      });
      renderGate();
    }

    return {
      bindEvents,
      getAccessToken,
      getEmail,
      getStatusMessage,
      isConfigured,
      isSignedIn,
      renderGate,
      restore,
      signIn,
      signOut,
    };
  };
})(window);
