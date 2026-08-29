/*
  Journal d'entrainement.

  Ce bloc vivait a cheval sur events.js et renderers.js, ou il representait
  30 fonctions sur 124 et pesait 900 lignes. Mesure faite avant de le sortir :
  il n'appelait le reste du code qu'a travers `context`, ce qui en faisait le
  premier ensemble reellement detachable de ces deux fichiers. Il en reste :
  dans events.js, le tirer-pour-rafraichir et la redaction des questions de
  quiz ne partagent ni appel ni variable de module avec le reste. renderers.js
  n'offre pas la meme prise, 65 de ses 69 fonctions formant un bloc connexe.

  getSportSettings et getTodayInputDate existaient en double, une copie dans
  chaque fichier. Il n'en reste qu'une.
*/
(function initializeSportModule(global) {
  const AtlasApp = (global.AtlasApp = global.AtlasApp || {});

  AtlasApp.createSportModule = function createSportModule(context) {
    // Venait de renderers.js, ou il est destructure en tete du module.
    const { escapeHtml } = AtlasApp.helpers;

    let sportRowPress = null;
    let sportMenuIndex = null;
    let sportActiveExerciseInput = null;
    // Le repli des seances vit en memoire, pas dans les reglages : c'est un
    // confort de lecture propre a l'ecran du moment, pas une donnee a
    // synchroniser. `null` signifie "jamais touche", et la regle par defaut
    // s'applique alors : seule la seance la plus recente reste ouverte.
    let sportCollapsedSessions = null;
    let sportTemplateDraft = null;
    // Poignee, exercice, series, repetitions, kg, repos, note. La date a
    // quitte les lignes : elle appartient desormais a l'en-tete de seance.
    const SPORT_PERFORMANCE_COLUMNS = 7;

    function getSportSettings() {
      context.state.settings.sport = context.state.settings.sport || {
        massEntries: [],
        performanceEntries: [],
        sessionTemplates: [],
        lastSavedAt: null,
      };
      context.state.settings.sport.massEntries = context.state.settings.sport.massEntries || [];
      context.state.settings.sport.performanceEntries =
        context.state.settings.sport.performanceEntries || [];
      // Les journaux enregistres avant les modeles n'ont pas ce tableau.
      context.state.settings.sport.sessionTemplates =
        context.state.settings.sport.sessionTemplates || [];
      return context.state.settings.sport;
    }

    function addSportRow(table, options = {}) {
      const sport = getSportSettings();
      if (table !== "performance") {
        saveSportChanges();
        renderSportTracker();
        return;
      }

      // Sans date precisee, la ligne rejoint la seance du jour : le tableau
      // etant trie du plus recent au plus ancien, elle apparait donc en haut.
      const entry = createSportPerformanceEntry(options.date || getTodayInputDate());
      sport.performanceEntries.push(entry);
      context.state.sportMode = "performance";
      // Sans cela, une ligne ajoutee a une seance repliee resterait invisible.
      expandSportSession(entry.date);
      saveSportChanges();
      renderSportTracker();
      if (options.focusField) {
        // Le tri a pu deplacer la ligne : on la retrouve par identite, son
        // rang d'insertion ne veut plus rien dire.
        focusSportCell(sport.performanceEntries.indexOf(entry), options.focusField);
      }
    }

    function handleSportMassSubmit(event) {
      event.preventDefault();
      const massInput = context.elements.sportMassValue;
      const mass = massInput?.valueAsNumber;
      if (!massInput || !Number.isFinite(mass)) {
        massInput?.setCustomValidity("Indiquez une masse valide.");
        massInput?.reportValidity();
        return;
      }

      massInput.setCustomValidity("");
      const sport = getSportSettings();
      sport.massEntries.push({
        date: context.elements.sportMassDate?.value || getTodayInputDate(),
        mass: String(Math.round(mass * 10) / 10),
        fasted: Boolean(context.elements.sportMassFasted?.checked),
      });
      context.state.sportMode = "mass";
      saveSportChanges();
      renderSportTracker();

      massInput.value = "";
      if (context.elements.sportMassFasted) {
        context.elements.sportMassFasted.checked = false;
      }
      massInput.focus();
    }

    function handleSportInput(event) {
      const input = event.target.closest("[data-sport-table][data-sport-index][data-sport-field]");
      if (!input) {
        return;
      }

      const sport = getSportSettings();
      const table = input.dataset.sportTable;
      const index = Number(input.dataset.sportIndex);
      const field = input.dataset.sportField;
      const entries =
        table === "performance" ? sport.performanceEntries : sport.massEntries;
      ensureSportEntry(entries, table, index);
      const entry = entries[index];
      // La date ne se saisit plus ligne par ligne : elle appartient a
      // l'en-tete de seance, traite par handleSportSessionDate.
      entry[field] = input.type === "checkbox" ? input.checked : input.value;

      saveSportChanges();
      if (table === "performance") {
        updateSportExerciseAssist(input);
      }
      if (table === "mass" && event.type === "change") {
        renderSportTracker();
      }
    }

    function handleSportFocusIn(event) {
      const input = event.target.closest('[data-sport-table="performance"][data-sport-index]');
      if (!input) {
        return;
      }

      const row = input.closest("tr");
      sportActiveExerciseInput = row?.querySelector('[data-sport-field="exercise"]') || null;
      updateSportExerciseAssist(input);
    }

    function handleSportKeydown(event) {
      const input = event.target.closest('[data-sport-table="performance"][data-sport-index]');
      if (!input || (event.key !== "Enter" && event.key !== "Tab")) {
        return;
      }

      const fields =
        context.elements.sportPerformanceTable?.dataset.sportCompact === "true"
          ? ["exercise", "sets", "reps", "weight", "rest"]
          : ["exercise", "sets", "reps", "weight", "rest", "comment"];
      const field = input.dataset.sportField;
      const fieldIndex = fields.indexOf(field);
      const rowIndex = Number(input.dataset.sportIndex);
      const sport = getSportSettings();
      const entries = sport.performanceEntries;
      const isLastField = fieldIndex === fields.length - 1;
      // La derniere ligne de la seance, pas du tableau : sous elle commence
      // une seance plus ancienne, ou rien.
      const currentDate = entries[rowIndex]?.date || "";
      const isLastRow =
        rowIndex >= entries.length - 1 || (entries[rowIndex + 1]?.date || "") !== currentDate;

      if (event.key === "Tab" && (!isLastField || !isLastRow || event.shiftKey)) {
        return;
      }

      event.preventDefault();
      if (!isLastField) {
        focusSportCell(rowIndex, fields[fieldIndex + 1]);
        return;
      }

      if (!isLastRow) {
        focusSportCell(rowIndex + 1, "exercise");
        return;
      }

      addSportRow("performance", {
        date: currentDate || getTodayInputDate(),
        focusField: "exercise",
      });
    }

    function focusSportCell(index, field) {
      window.requestAnimationFrame(() => {
        const input = context.elements.sportPerformanceBody?.querySelector(
          `[data-sport-index="${index}"][data-sport-field="${field}"]`
        );
        input?.focus({ preventScroll: true });
        input?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
        if (typeof input?.select === "function" && field !== "date") {
          input.select();
        }
      });
    }

    function adjustSportTableZoom(direction) {
      const zoomSteps = [0.56, 0.72, 0.86, 1];
      const current = Number.isFinite(context.state.sportTableZoom)
        ? context.state.sportTableZoom
        : window.matchMedia("(max-width: 680px)").matches
          ? 0.56
          : 1;
      const closestIndex = zoomSteps.reduce(
        (bestIndex, value, index) =>
          Math.abs(value - current) < Math.abs(zoomSteps[bestIndex] - current) ? index : bestIndex,
        0
      );
      const nextIndex = Math.min(
        zoomSteps.length - 1,
        Math.max(0, closestIndex + Math.sign(direction))
      );
      context.state.sportTableZoom = zoomSteps[nextIndex];
      renderSportTableZoom();
    }

    function parseSportDateInput(value, fallbackDate = "") {
      const trimmed = String(value || "").trim();
      const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (isoMatch) {
        return isValidSportDate(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]))
          ? trimmed
          : "";
      }

      // Saisie sans separateur, indispensable au telephone : le pave
      // numerique d'iOS ne propose ni barre oblique ni tiret. 4 chiffres
      // donnent le jour et le mois, 6 y ajoutent l'annee courte, 8 l'annee
      // complete. La virgule est acceptee comme separateur car c'est la
      // seule touche que le clavier decimal francais propose.
      const digitsOnly = trimmed.match(/^(\d{2})(\d{2})((?:\d{2})|(?:\d{4}))?$/);
      const shortMatch =
        digitsOnly || trimmed.match(/^(\d{1,2})[./,-](\d{1,2})(?:[./,-](\d{2}|\d{4}))?$/);
      if (!shortMatch) {
        return "";
      }

      const fallbackYear = Number(String(fallbackDate).slice(0, 4));
      const yearPart = shortMatch[3];
      const year = yearPart
        ? yearPart.length === 2
          ? 2000 + Number(yearPart)
          : Number(yearPart)
        : Number.isInteger(fallbackYear) && fallbackYear > 1900
          ? fallbackYear
          : new Date().getFullYear();
      const month = Number(shortMatch[2]);
      const day = Number(shortMatch[1]);
      if (!isValidSportDate(year, month, day)) {
        return "";
      }

      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }

    function isValidSportDate(year, month, day) {
      const date = new Date(year, month - 1, day);
      return (
        date.getFullYear() === year &&
        date.getMonth() === month - 1 &&
        date.getDate() === day
      );
    }

    function formatSportDateForCell(value) {
      const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!match) {
        return value || "";
      }
      const [, year, month, day] = match;
      return Number(year) === new Date().getFullYear()
        ? `${day}/${month}`
        : `${day}/${month}/${year.slice(-2)}`;
    }

    function normalizeExerciseName(value) {
      return String(value || "")
        .trim()
        .toLocaleLowerCase("fr")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
    }

    function getKnownExercises(entries, currentIndex) {
      const seen = new Set();
      const exercises = [];
      for (let index = entries.length - 1; index >= 0; index -= 1) {
        if (index === currentIndex) {
          continue;
        }
        const label = String(entries[index]?.exercise || "").trim();
        const normalized = normalizeExerciseName(label);
        if (!normalized || seen.has(normalized)) {
          continue;
        }
        seen.add(normalized);
        exercises.push(label);
      }
      return exercises;
    }

    function updateSportExerciseAssist(sourceInput = sportActiveExerciseInput) {
      const panel = context.elements.sportExerciseAssist;
      const suggestionsContainer = context.elements.sportExerciseSuggestions;
      const lastContainer = context.elements.sportLastPerformance;
      if (!panel || !suggestionsContainer || !lastContainer) {
        return;
      }

      const row = sourceInput?.closest("tr");
      const exerciseInput =
        row?.querySelector('[data-sport-field="exercise"]') || sportActiveExerciseInput;
      if (!exerciseInput?.isConnected) {
        panel.hidden = true;
        return;
      }

      sportActiveExerciseInput = exerciseInput;
      const entries = getSportSettings().performanceEntries;
      const rowIndex = Number(exerciseInput.dataset.sportIndex);
      const draft = String(exerciseInput.value || "").trim();
      const normalizedDraft = normalizeExerciseName(draft);
      const knownExercises = getKnownExercises(entries, rowIndex);
      const suggestions = knownExercises
        .filter((exercise) => {
          const normalized = normalizeExerciseName(exercise);
          return !normalizedDraft || normalized.includes(normalizedDraft);
        })
        .slice(0, 5);

      suggestionsContainer.replaceChildren();
      suggestions.forEach((exercise) => {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.sportExerciseSuggestion = exercise;
        button.dataset.sportTargetIndex = String(rowIndex);
        button.textContent = exercise;
        suggestionsContainer.appendChild(button);
      });
      if (context.elements.sportAssistLabel) {
        context.elements.sportAssistLabel.textContent = draft ? "Suggestions" : "Exercices recents";
      }

      const exactExercise = knownExercises.find(
        (exercise) => normalizeExerciseName(exercise) === normalizedDraft
      );
      const previousMatch = exactExercise
        ? [...entries]
            .map((entry, index) => ({ entry, index }))
            .reverse()
            .find(
              ({ entry, index }) =>
                index !== rowIndex &&
                normalizeExerciseName(entry.exercise) === normalizeExerciseName(exactExercise)
            )
        : null;
      const previous = previousMatch?.entry || null;

      lastContainer.replaceChildren();
      if (previous) {
        const copy = document.createElement("div");
        const label = document.createElement("span");
        const stats = document.createElement("strong");
        label.textContent = `Derniere fois${previous.date ? ` · ${formatSportEntryDate(previous.date)}` : ""}`;
        stats.textContent = [
          previous.sets ? `${previous.sets} ser.` : "",
          previous.reps ? `${previous.reps} rep.` : "",
          previous.weight ? `${previous.weight} kg` : "",
          previous.rest ? `${previous.rest} s` : "",
        ]
          .filter(Boolean)
          .join(" · ") || "Aucune statistique renseignee";
        copy.append(label, stats);

        const reuseButton = document.createElement("button");
        reuseButton.type = "button";
        reuseButton.dataset.sportReusePrevious = "true";
        reuseButton.dataset.sportTargetIndex = String(rowIndex);
        reuseButton.dataset.sportPreviousIndex = String(previousMatch.index);
        reuseButton.textContent = "Reprendre";
        lastContainer.append(copy, reuseButton);
        lastContainer.hidden = false;
      } else {
        lastContainer.hidden = true;
      }

      panel.hidden = suggestions.length === 0 && !previous;
    }

    function formatSportEntryDate(value) {
      const date = new Date(`${value}T12:00:00`);
      return Number.isNaN(date.getTime())
        ? value
        : new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(date);
    }

    function handleSportAssistClick(event) {
      const suggestion = event.target.closest("[data-sport-exercise-suggestion]");
      if (suggestion) {
        const targetIndex = Number(suggestion.dataset.sportTargetIndex);
        const targetInput = context.elements.sportPerformanceBody?.querySelector(
          `[data-sport-index="${targetIndex}"][data-sport-field="exercise"]`
        );
        if (!targetInput) {
          return;
        }
        sportActiveExerciseInput = targetInput;
        targetInput.value = suggestion.dataset.sportExerciseSuggestion || "";
        targetInput.dispatchEvent(new Event("input", { bubbles: true }));
        targetInput.focus();
        return;
      }

      const reuseButton = event.target.closest("[data-sport-reuse-previous]");
      if (!reuseButton) {
        return;
      }

      const rowIndex = Number(reuseButton.dataset.sportTargetIndex);
      const previousIndex = Number(reuseButton.dataset.sportPreviousIndex);
      const entries = getSportSettings().performanceEntries;
      const previous = entries[previousIndex];
      const targetInput = context.elements.sportPerformanceBody?.querySelector(
        `[data-sport-index="${rowIndex}"][data-sport-field="exercise"]`
      );
      if (!previous || !targetInput) {
        return;
      }

      sportActiveExerciseInput = targetInput;
      const row = targetInput.closest("tr");
      ["sets", "reps", "weight", "rest"].forEach((field) => {
        const input = row?.querySelector(`[data-sport-field="${field}"]`);
        if (input) {
          input.value = previous[field] || "";
          entries[rowIndex][field] = input.value;
        }
      });
      saveSportChanges();
      updateSportExerciseAssist(sportActiveExerciseInput);
      focusSportCell(rowIndex, "sets");
    }

    function handleSportRowPointerDown(event) {
      const handle = event.target.closest("[data-sport-row-handle][data-sport-index]");
      if (!handle || event.button > 0) {
        return;
      }

      cancelSportRowPress();
      sportRowPress = {
        button: handle,
        index: Number(handle.dataset.sportIndex),
        startX: event.clientX,
        startY: event.clientY,
        long: false,
        timer: window.setTimeout(() => {
          if (!sportRowPress) {
            return;
          }
          sportRowPress.long = true;
          openSportRowMenu(sportRowPress.index, sportRowPress.button);
          navigator.vibrate?.(20);
        }, 520),
      };
      handle.classList.add("is-pressing");
    }

    function handleSportRowPointerMove(event) {
      if (
        !sportRowPress ||
        Math.hypot(event.clientX - sportRowPress.startX, event.clientY - sportRowPress.startY) <= 9
      ) {
        return;
      }
      cancelSportRowPress();
    }

    function handleSportRowPointerUp() {
      if (!sportRowPress) {
        return;
      }
      window.clearTimeout(sportRowPress.timer);
      sportRowPress.button?.classList.remove("is-pressing");
    }

    function handleSportCellPointerUp(event) {
      const input =
        event.target.closest('[data-sport-table="performance"][data-sport-field]') ||
        event.target
          .closest("td")
          ?.querySelector('[data-sport-table="performance"][data-sport-field]');
      if (!input || event.target.closest("[data-sport-row-handle]")) {
        return;
      }

      input.focus({ preventScroll: true });
    }

    function cancelSportRowPress() {
      if (!sportRowPress) {
        return;
      }
      window.clearTimeout(sportRowPress.timer);
      sportRowPress.button?.classList.remove("is-pressing");
      sportRowPress = null;
    }

    function handleSportPerformanceClick(event) {
      // Les en-tetes de seance ont leur propre delegue, plus haut dans la
      // chaine : sans cette garde, un clic sur l'en-tete cherchait une
      // cellule a mettre au clavier et volait le focus aux boutons.
      if (event.target.closest(".sport-session-row")) {
        return;
      }

      const handle = event.target.closest("[data-sport-row-handle][data-sport-index]");
      if (!handle) {
        const cell = event.target.closest("td");
        const input = cell?.querySelector('[data-sport-table="performance"][data-sport-field]');
        if (input) {
          input.focus({ preventScroll: true });
        }
        return;
      }

      event.preventDefault();
      if (sportRowPress?.long) {
        sportRowPress = null;
        return;
      }
      openSportRowMenu(Number(handle.dataset.sportIndex), handle);
      sportRowPress = null;
    }

    function openSportRowMenu(index, handle) {
      const menu = context.elements.sportRowMenu;
      if (!menu || !Number.isInteger(index)) {
        return;
      }

      context.elements.sportPerformanceBody
        ?.querySelectorAll(".sport-row-handle.is-active")
        .forEach((button) => button.classList.remove("is-active"));
      handle?.classList.add("is-active");
      sportMenuIndex = index;
      if (context.elements.sportRowMenuLabel) {
        context.elements.sportRowMenuLabel.textContent = `Ligne ${index + 1}`;
      }
      menu.hidden = false;
    }

    function closeSportRowMenu() {
      context.elements.sportRowMenu?.setAttribute("hidden", "");
      context.elements.sportPerformanceBody
        ?.querySelectorAll(".sport-row-handle.is-active")
        .forEach((button) => button.classList.remove("is-active"));
      sportMenuIndex = null;
    }

    function handleSportOutsideClick(event) {
      if (
        context.elements.sportRowMenu?.hidden ||
        event.target.closest("#sport-row-menu") ||
        event.target.closest("[data-sport-row-handle]")
      ) {
        return;
      }
      closeSportRowMenu();
    }

    function handleSportRowMenuAction(event) {
      const button = event.target.closest("[data-sport-row-action]");
      if (!button || !Number.isInteger(sportMenuIndex)) {
        return;
      }

      const sport = getSportSettings();
      const entries = sport.performanceEntries;
      const index = sportMenuIndex;
      const existing = entries[index] || null;
      const inheritedDate =
        existing?.date || getMostRecentPerformanceDate() || getTodayInputDate();
      let focusIndex = index;

      if (button.dataset.sportRowAction === "insert-before") {
        entries.splice(index, 0, createSportPerformanceEntry(inheritedDate));
      } else if (button.dataset.sportRowAction === "insert-after") {
        focusIndex = index + 1;
        entries.splice(focusIndex, 0, createSportPerformanceEntry(inheritedDate));
      } else if (button.dataset.sportRowAction === "duplicate" && existing) {
        focusIndex = index + 1;
        entries.splice(focusIndex, 0, { ...existing });
      } else if (button.dataset.sportRowAction === "delete" && existing) {
        entries.splice(index, 1);
        focusIndex = Math.min(index, entries.length - 1);
      } else {
        closeSportRowMenu();
        return;
      }

      closeSportRowMenu();
      sportActiveExerciseInput = null;
      saveSportChanges();
      renderSportTracker();
      if (focusIndex >= 0) {
        focusSportCell(focusIndex, "exercise");
      }
    }

    // La date par defaut est celle du jour. Une ligne sans date formerait un
    // groupe "Sans date" flottant en tete du journal, ce qui n'a de sens que
    // pour les lignes ecrites avant le regroupement par seance.
    function createSportPerformanceEntry(date = getTodayInputDate()) {
      return {
        date,
        exercise: "",
        sets: "",
        reps: "",
        weight: "",
        rest: "",
        comment: "",
      };
    }

    function handleSportDelete(event) {
      const button = event.target.closest("[data-delete-sport-row][data-sport-index]");
      if (!button || button.disabled) {
        return;
      }

      const sport = getSportSettings();
      const table = button.dataset.deleteSportRow;
      const index = Number(button.dataset.sportIndex);
      const entries = table === "performance" ? sport.performanceEntries : sport.massEntries;
      if (!Number.isInteger(index) || index < 0 || index >= entries.length) {
        return;
      }

      entries.splice(index, 1);
      saveSportChanges();
      renderSportTracker();
    }

    function saveSportChanges() {
      const sport = getSportSettings();
      sport.lastSavedAt = new Date().toISOString();
      context.data.saveNotes();
      renderSportSaveStatus();
    }

    function ensureSportEntry(entries, table, index) {
      while (entries.length <= index) {
        entries.push(
          table === "performance"
            ? createSportPerformanceEntry()
            : { date: "", mass: "", fasted: false }
        );
      }
    }

    // Le tableau va du plus recent au plus ancien : la seance en cours est
    // en tete, plus en queue comme avant le tri.
    function getMostRecentPerformanceDate() {
      const entries = getSportSettings().performanceEntries;
      for (const entry of entries) {
        if (entry?.date) {
          return entry.date;
        }
      }
      return "";
    }

    function getTodayInputDate() {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const day = String(now.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    }


    /* ---------------------------------------------------------------- *
     *  Seances : tri, regroupement, repli                                *
     * ---------------------------------------------------------------- */

    // Le journal se lit de la seance la plus recente a la plus ancienne. Le
    // tableau est trie pour de vrai, pas seulement a l'affichage : partout
    // ailleurs une ligne est designee par son rang dans le tableau, et deux
    // ordres differents auraient fait porter le menu contextuel, la
    // suppression et la navigation clavier sur la mauvaise ligne.
    function sortSportPerformanceEntries() {
      // Une ligne encore sans date vient d'etre creee : elle reste en tete,
      // sinon elle disparaitrait tout en bas au moment ou on la remplit.
      const rang = (entry) => entry.date || "9999-99-99";
      getSportSettings().performanceEntries.sort(
        (left, right) => (rang(left) < rang(right) ? 1 : rang(left) > rang(right) ? -1 : 0)
      );
    }

    // Le tableau etant trie, les lignes d'une meme date se suivent deja.
    function groupSportEntriesBySession(entries) {
      const sessions = [];
      entries.forEach((entry, index) => {
        const date = entry.date || "";
        const last = sessions[sessions.length - 1];
        if (last && last.date === date) {
          last.rows.push({ entry, index });
          return;
        }
        sessions.push({ date, rows: [{ entry, index }] });
      });
      return sessions;
    }

    function isSportSessionCollapsed(date, sessions) {
      if (sportCollapsedSessions === null) {
        return sessions.length > 1 && date !== sessions[0].date;
      }
      return sportCollapsedSessions.includes(date);
    }

    function toggleSportSession(date, sessions) {
      if (sportCollapsedSessions === null) {
        sportCollapsedSessions = sessions.slice(1).map((session) => session.date);
      }
      const position = sportCollapsedSessions.indexOf(date);
      if (position >= 0) {
        sportCollapsedSessions.splice(position, 1);
      } else {
        sportCollapsedSessions.push(date);
      }
    }

    // La virgule est acceptee : c'est ce que produit le clavier decimal.
    function readSportNumber(value) {
      const parsed = Number(String(value ?? "").replace(",", ".").trim());
      return Number.isFinite(parsed) ? parsed : 0;
    }

    function summarizeSportSession(rows) {
      const exercises = rows.filter(({ entry }) => (entry.exercise || "").trim()).length;
      const volume = rows.reduce(
        (total, { entry }) =>
          total +
          readSportNumber(entry.sets) * readSportNumber(entry.reps) * readSportNumber(entry.weight),
        0
      );
      const parts = [];
      parts.push(exercises > 1 ? `${exercises} exercices` : `${exercises} exercice`);
      if (volume > 0) {
        parts.push(`${Math.round(volume).toLocaleString("fr-FR")} kg souleves`);
      }
      return parts.join(" \u00b7 ");
    }

    function formatSportSessionDate(value) {
      if (!value) {
        return "Sans date";
      }
      const date = new Date(`${value}T12:00:00`);
      if (Number.isNaN(date.getTime())) {
        return value;
      }
      const aujourdhui = getTodayInputDate();
      if (value === aujourdhui) {
        return "Aujourd'hui";
      }
      const options =
        date.getFullYear() === new Date().getFullYear()
          ? { weekday: "long", day: "numeric", month: "long" }
          : { weekday: "long", day: "numeric", month: "long", year: "numeric" };
      const libelle = new Intl.DateTimeFormat("fr-FR", options).format(date);
      return libelle.charAt(0).toUpperCase() + libelle.slice(1);
    }

    function buildSportSessionHeaderRow(session, collapsed, columnCount) {
      const date = session.date;
      return `
        <tr class="sport-session-row${collapsed ? " is-collapsed" : ""}" data-sport-session="${escapeHtml(date)}">
          <td class="sport-session-cell" colspan="${columnCount}">
            <div class="sport-session-bar">
            <button
              class="sport-session-toggle"
              type="button"
              data-sport-session-toggle="${escapeHtml(date)}"
              aria-expanded="${collapsed ? "false" : "true"}"
            >
              <span class="sport-session-chevron" aria-hidden="true"></span>
              <span class="sport-session-title">${escapeHtml(formatSportSessionDate(date))}</span>
              <span class="sport-session-meta">${escapeHtml(summarizeSportSession(session.rows))}</span>
            </button>
            <span class="sport-session-tools">
              <input
                class="sport-input sport-session-date-input"
                type="text"
                inputmode="decimal"
                maxlength="10"
                value="${escapeHtml(formatSportDateForCell(date))}"
                placeholder="jjmm"
                aria-label="Date de la seance"
                data-sport-session-date="${escapeHtml(date)}"
              />
              <button
                class="sport-session-action"
                type="button"
                data-sport-session-add="${escapeHtml(date)}"
                aria-label="Ajouter un exercice a cette seance"
                title="Ajouter un exercice"
              >+</button>
              <button
                class="sport-session-action"
                type="button"
                data-sport-session-save-template="${escapeHtml(date)}"
                aria-label="Enregistrer cette seance comme modele"
                title="Enregistrer comme modele"
              >\u2606</button>
            </span>
            </div>
          </td>
        </tr>
      `;
    }

    function renderSportTracker() {
      if (!context.elements.sportMassBody || !context.elements.sportPerformanceBody) {
        return;
      }

      const sport = getSportSettings();
      const massEntries = sport.massEntries
        .map((entry, index) => ({ entry, index }))
        .sort((left, right) => getMassEntryTimestamp(right) - getMassEntryTimestamp(left));
      sortSportPerformanceEntries();
      const performanceEntries = sport.performanceEntries.length
        ? sport.performanceEntries
        : [createEmptySportPerformanceEntry()];

      context.elements.sportModeButtons.forEach((button) => {
        button.classList.toggle("is-active", button.dataset.sportMode === context.state.sportMode);
      });
      context.elements.sportMassPanel.classList.toggle("is-hidden", context.state.sportMode !== "mass");
      context.elements.sportPerformancePanel.classList.toggle(
        "is-hidden",
        context.state.sportMode !== "performance"
      );
      renderSportTableZoom();

      if (context.elements.sportMassDate && !context.elements.sportMassDate.value) {
        context.elements.sportMassDate.value = getTodayInputDate();
      }

      renderSportMassSummary(massEntries);
      renderSportSaveStatus();
      context.elements.sportMassBody.innerHTML = massEntries.length
        ? massEntries.map(({ entry, index }) => buildSportMassRow(entry, index)).join("")
        : buildEmptySportMassRow();
      const sessions = groupSportEntriesBySession(performanceEntries);
      context.elements.sportPerformanceBody.innerHTML = sessions
        .map((session) => {
          const collapsed = isSportSessionCollapsed(session.date, sessions);
          const header = buildSportSessionHeaderRow(session, collapsed, SPORT_PERFORMANCE_COLUMNS);
          if (collapsed) {
            return header;
          }
          return (
            header +
            session.rows.map(({ entry, index }) => buildSportPerformanceRow(entry, index)).join("")
          );
        })
        .join("");
      renderSportTemplates();
    }

    function createEmptySportMassEntry() {
      return { date: "", mass: "", fasted: false };
    }

    function createEmptySportPerformanceEntry() {
      return createSportPerformanceEntry();
    }

    function getMassEntryTimestamp({ entry, index }) {
      const timestamp = Date.parse(`${entry.date || ""}T12:00:00`);
      return Number.isNaN(timestamp) ? index : timestamp + index / 1000;
    }

    function renderSportMassSummary(entries) {
      if (!context.elements.sportMassSummary) {
        return;
      }

      const measuredEntries = entries
        .map(({ entry }) => ({
          ...entry,
          numericMass: Number(entry.mass),
        }))
        .filter((entry) => Number.isFinite(entry.numericMass) && entry.numericMass > 0);
      const latest = measuredEntries[0] || null;
      const previous = measuredEntries[1] || null;
      const recent = measuredEntries.slice(0, 7);
      const average = recent.length
        ? recent.reduce((total, entry) => total + entry.numericMass, 0) / recent.length
        : null;
      const difference = latest && previous ? latest.numericMass - previous.numericMass : null;

      context.elements.sportMassSummary.innerHTML = `
        <article class="sport-mass-metric sport-mass-metric-primary">
          <span>Derniere mesure</span>
          <strong>${latest ? `${formatSportMass(latest.numericMass)} kg` : "--"}</strong>
          <small>${latest?.date ? formatSportMassDate(latest.date) : "Ajoutez votre premiere mesure"}</small>
        </article>
        <article class="sport-mass-metric">
          <span>Evolution</span>
          <strong>${difference == null ? "--" : `${difference > 0 ? "+" : ""}${formatSportMass(difference)} kg`}</strong>
          <small>${difference == null ? "Deux mesures necessaires" : "Par rapport a la mesure precedente"}</small>
        </article>
        <article class="sport-mass-metric">
          <span>Moyenne recente</span>
          <strong>${average == null ? "--" : `${formatSportMass(average)} kg`}</strong>
          <small>${recent.length ? `${recent.length} derniere${recent.length > 1 ? "s" : ""} mesure${recent.length > 1 ? "s" : ""}` : "Aucune mesure"}</small>
        </article>
      `;
    }

    function renderSportSaveStatus() {
      if (!context.elements.sportMassSaveStatus) {
        return;
      }

      const savedAt = getSportSettings().lastSavedAt;
      const timestamp = Date.parse(savedAt || "");
      context.elements.sportMassSaveStatus.dataset.state = Number.isNaN(timestamp)
        ? "ready"
        : "saved";
      context.elements.sportMassSaveStatus.textContent = Number.isNaN(timestamp)
        ? "Enregistrement automatique"
        : `Enregistre a ${new Intl.DateTimeFormat("fr-FR", {
            hour: "2-digit",
            minute: "2-digit",
          }).format(new Date(timestamp))}`;
    }

    function formatSportMass(value) {
      return new Intl.NumberFormat("fr-FR", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }).format(value);
    }

    function formatSportMassDate(value) {
      const date = new Date(`${value}T12:00:00`);
      return Number.isNaN(date.getTime())
        ? value
        : new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" }).format(date);
    }

    function renderSportTableZoom() {
      const table = context.elements.sportPerformanceTable;
      if (!table) {
        return;
      }

      if (!Number.isFinite(context.state.sportTableZoom)) {
        context.state.sportTableZoom = window.matchMedia("(max-width: 680px)").matches ? 0.56 : 1;
      }

      const zoom = Math.min(1, Math.max(0.56, context.state.sportTableZoom));
      context.state.sportTableZoom = zoom;
      table.style.removeProperty("zoom");
      table.dataset.sportZoom = String(Math.round(zoom * 100));
      table.dataset.sportCompact = zoom <= 0.56 ? "true" : "false";
      if (context.elements.sportZoomLabel) {
        context.elements.sportZoomLabel.textContent = `${Math.round(zoom * 100)}%`;
      }
      if (context.elements.sportZoomOut) {
        context.elements.sportZoomOut.disabled = zoom <= 0.56;
      }
      if (context.elements.sportZoomIn) {
        context.elements.sportZoomIn.disabled = zoom >= 1;
      }
    }

    function buildEmptySportMassRow() {
      return `
        <tr>
          <td class="sport-table-empty" colspan="4">
            Votre historique est vide. Utilisez le formulaire ci-dessus pour ajouter une premiere mesure.
          </td>
        </tr>
      `;
    }

    function buildSportMassRow(entry, index) {
      return `
        <tr>
          <td data-label="Jour">
            <input class="sport-input" aria-label="Date de la mesure" type="date" value="${escapeHtml(entry.date || "")}" data-sport-table="mass" data-sport-index="${index}" data-sport-field="date" />
          </td>
          <td data-label="Masse">
            <span class="sport-history-mass-control">
              <input class="sport-input" aria-label="Masse en kilogrammes" type="number" inputmode="decimal" min="20" max="500" step="0.1" value="${escapeHtml(entry.mass || "")}" data-sport-table="mass" data-sport-index="${index}" data-sport-field="mass" />
              <span>kg</span>
            </span>
          </td>
          <td class="sport-check-cell" data-label="A jeun">
            <input type="checkbox" aria-label="Mesure a jeun" ${entry.fasted ? "checked" : ""} data-sport-table="mass" data-sport-index="${index}" data-sport-field="fasted" />
          </td>
          <td class="sport-action-cell" data-label="Action">
            <button
              class="sport-delete-button"
              type="button"
              data-delete-sport-row="mass"
              data-sport-index="${index}"
              aria-label="Supprimer la ligne de masse"
              title="Supprimer"
            >
              <span aria-hidden="true">&times;</span>
            </button>
          </td>
        </tr>
      `;
    }

    function buildSportPerformanceRow(entry, index) {
      return `
        <tr data-sport-row-index="${index}">
          <td class="sport-handle-cell">
            <button
              class="sport-row-handle"
              type="button"
              data-sport-row-handle
              data-sport-index="${index}"
              aria-label="Actions de la ligne ${index + 1}"
              title="Appui long pour gerer la ligne"
            >
              <span aria-hidden="true"></span>
              <span aria-hidden="true"></span>
              <span aria-hidden="true"></span>
            </button>
          </td>
          <td>
            <input class="sport-input sport-exercise-input" aria-label="Exercice, ligne ${index + 1}" type="text" value="${escapeHtml(entry.exercise || "")}" placeholder="Nom de l'exercice" autocapitalize="sentences" autocomplete="off" enterkeyhint="next" data-sport-table="performance" data-sport-index="${index}" data-sport-field="exercise" />
          </td>
          <td>
            <input class="sport-input sport-number-input" aria-label="Series, ligne ${index + 1}" type="text" inputmode="numeric" pattern="[0-9]*" value="${escapeHtml(entry.sets || "")}" placeholder="-" enterkeyhint="next" data-sport-table="performance" data-sport-index="${index}" data-sport-field="sets" />
          </td>
          <td>
            <input class="sport-input sport-number-input" aria-label="Repetitions, ligne ${index + 1}" type="text" inputmode="numeric" pattern="[0-9]*" value="${escapeHtml(entry.reps || "")}" placeholder="-" enterkeyhint="next" data-sport-table="performance" data-sport-index="${index}" data-sport-field="reps" />
          </td>
          <td>
            <input class="sport-input sport-number-input" aria-label="Masse en kilogrammes, ligne ${index + 1}" type="text" inputmode="decimal" value="${escapeHtml(entry.weight || "")}" placeholder="-" enterkeyhint="next" data-sport-table="performance" data-sport-index="${index}" data-sport-field="weight" />
          </td>
          <td>
            <input class="sport-input sport-number-input" aria-label="Repos en secondes, ligne ${index + 1}" type="text" inputmode="numeric" pattern="[0-9]*" value="${escapeHtml(entry.rest || "")}" placeholder="-" enterkeyhint="next" data-sport-table="performance" data-sport-index="${index}" data-sport-field="rest" />
          </td>
          <td>
            <input class="sport-input sport-comment-input" aria-label="Note, ligne ${index + 1}" type="text" value="${escapeHtml(entry.comment || "")}" placeholder="Facultatif" autocomplete="off" enterkeyhint="next" data-sport-table="performance" data-sport-index="${index}" data-sport-field="comment" />
          </td>
        </tr>
      `;
    }

    /* ---------------------------------------------------------------- *
     *  En-tetes de seance : repli, date, ajout, mise en modele          *
     * ---------------------------------------------------------------- */

    function expandSportSession(date) {
      sortSportPerformanceEntries();
      if (sportCollapsedSessions === null) {
        const sessions = groupSportEntriesBySession(getSportSettings().performanceEntries);
        sportCollapsedSessions = sessions.slice(1).map((session) => session.date);
      }
      const position = sportCollapsedSessions.indexOf(date);
      if (position >= 0) {
        sportCollapsedSessions.splice(position, 1);
      }
    }

    function handleSportSessionClick(event) {
      const toggle = event.target.closest("[data-sport-session-toggle]");
      if (toggle) {
        const sessions = groupSportEntriesBySession(getSportSettings().performanceEntries);
        toggleSportSession(toggle.dataset.sportSessionToggle, sessions);
        renderSportTracker();
        return;
      }

      const add = event.target.closest("[data-sport-session-add]");
      if (add) {
        addSportRow("performance", {
          date: add.dataset.sportSessionAdd,
          focusField: "exercise",
        });
        return;
      }

      const save = event.target.closest("[data-sport-session-save-template]");
      if (save) {
        startTemplateFromSession(save.dataset.sportSessionSaveTemplate);
      }
    }

    // Branche sur `change` seulement : corriger la date a chaque frappe
    // ferait sauter la seance d'un groupe a l'autre en pleine saisie.
    function handleSportSessionDate(event) {
      const input = event.target.closest("[data-sport-session-date]");
      if (!input) {
        return;
      }

      const previous = input.dataset.sportSessionDate;
      const normalized = parseSportDateInput(input.value, previous);
      if (!normalized) {
        input.setCustomValidity("Tapez les chiffres a la suite : 1408, 140825 ou 14082025.");
        input.reportValidity();
        return;
      }

      input.setCustomValidity("");
      if (normalized === previous) {
        return;
      }

      // Toute la seance suit sa date : c'est la seule facon de la deplacer
      // maintenant que les lignes n'ont plus de cellule de date.
      getSportSettings().performanceEntries.forEach((entry) => {
        if ((entry.date || "") === previous) {
          entry.date = normalized;
        }
      });
      if (Array.isArray(sportCollapsedSessions)) {
        sportCollapsedSessions = sportCollapsedSessions.map((date) =>
          date === previous ? normalized : date
        );
      }
      saveSportChanges();
      renderSportTracker();
    }

    /* ---------------------------------------------------------------- *
     *  Modeles de seance                                                *
     * ---------------------------------------------------------------- */

    function createSportTemplateId() {
      if (global.crypto?.randomUUID) {
        return global.crypto.randomUUID();
      }
      return `seance-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    }

    function createSportTemplateExercise(source = {}) {
      return {
        exercise: source.exercise || "",
        sets: source.sets || "",
        reps: source.reps || "",
        weight: source.weight || "",
        rest: source.rest || "",
        comment: source.comment || "",
      };
    }

    function openSportTemplatesPanel(open = true) {
      context.elements.sportTemplatesPanel?.classList.toggle("is-hidden", !open);
      context.elements.sportTemplatesToggle?.classList.toggle("is-active", open);
      context.elements.sportTemplatesToggle?.setAttribute("aria-expanded", String(open));
    }

    function isSportTemplatesPanelOpen() {
      return context.elements.sportTemplatesPanel
        ? !context.elements.sportTemplatesPanel.classList.contains("is-hidden")
        : false;
    }

    function renderSportTemplates() {
      const list = context.elements.sportTemplatesList;
      if (!list) {
        return;
      }

      const templates = getSportSettings().sessionTemplates;
      list.innerHTML = templates.length
        ? templates.map(buildSportTemplateCard).join("")
        : `<p class="sport-templates-empty">
             Aucun modele pour l'instant. Creez-en un, ou enregistrez une seance
             deja saisie avec l'etoile de son en-tete.
           </p>`;
      renderSportTemplateEditor();
    }

    function buildSportTemplateCard(template) {
      const count = template.exercises.length;
      const preview = template.exercises
        .map((exercise) => exercise.exercise)
        .filter(Boolean)
        .slice(0, 4)
        .join(", ");
      return `
        <article class="sport-template-card">
          <div class="sport-template-copy">
            <strong>${escapeHtml(template.name || "Sans nom")}</strong>
            <span>${count > 1 ? `${count} exercices` : `${count} exercice`}${
              preview ? ` · ${escapeHtml(preview)}` : ""
            }</span>
          </div>
          <div class="sport-template-actions">
            <button class="button button-inline button-primary" type="button" data-sport-template-apply="${escapeHtml(template.id)}">
              Ajouter au journal
            </button>
            <button class="button button-inline" type="button" data-sport-template-edit="${escapeHtml(template.id)}">
              Modifier
            </button>
            <button class="button button-inline is-danger" type="button" data-sport-template-delete="${escapeHtml(template.id)}">
              Supprimer
            </button>
          </div>
        </article>
      `;
    }

    function renderSportTemplateEditor() {
      const editor = context.elements.sportTemplateEditor;
      if (!editor) {
        return;
      }

      if (!sportTemplateDraft) {
        editor.classList.add("is-hidden");
        editor.innerHTML = "";
        return;
      }

      editor.classList.remove("is-hidden");
      editor.innerHTML = `
        <label class="field-label" for="sport-template-name">Nom du modele</label>
        <input
          id="sport-template-name"
          class="text-input"
          type="text"
          maxlength="60"
          autocomplete="off"
          placeholder="Ex. Push, Pull, Jambes"
          value="${escapeHtml(sportTemplateDraft.name || "")}"
          data-sport-template-field="name"
        />
        <div class="sport-template-rows">
          ${sportTemplateDraft.exercises.map(buildSportTemplateEditorRow).join("")}
        </div>
        <div class="sport-template-editor-actions">
          <button class="button button-inline" type="button" data-sport-template-add-exercise>
            + Exercice
          </button>
          <span class="sport-template-spacer"></span>
          <button class="button button-inline" type="button" data-sport-template-cancel>Annuler</button>
          <button class="button button-inline button-primary" type="button" data-sport-template-save>
            Enregistrer le modele
          </button>
        </div>
      `;
    }

    function buildSportTemplateEditorRow(exercise, index) {
      const cell = (field, placeholder, label, extra = "") => `
        <input
          class="sport-input${field === "exercise" ? "" : " sport-number-input"}"
          type="text"
          value="${escapeHtml(exercise[field] || "")}"
          placeholder="${escapeHtml(placeholder)}"
          aria-label="${escapeHtml(label)} ${index + 1}"
          autocomplete="off"
          ${extra}
          data-sport-template-exercise="${index}"
          data-sport-template-field="${field}"
        />`;
      return `
        <div class="sport-template-row">
          ${cell("exercise", "Nom de l'exercice", "Exercice", 'autocapitalize="sentences"')}
          ${cell("sets", "Ser.", "Series", 'inputmode="numeric" pattern="[0-9]*"')}
          ${cell("reps", "Rep.", "Repetitions", 'inputmode="numeric" pattern="[0-9]*"')}
          ${cell("weight", "kg", "Masse", 'inputmode="decimal"')}
          ${cell("rest", "Repos", "Repos", 'inputmode="numeric" pattern="[0-9]*"')}
          <button
            class="sport-template-remove"
            type="button"
            data-sport-template-remove-exercise="${index}"
            aria-label="Retirer l'exercice ${index + 1}"
          >×</button>
        </div>
      `;
    }

    function startSportTemplateDraft(template = null) {
      sportTemplateDraft = template
        ? {
            id: template.id,
            name: template.name || "",
            exercises: template.exercises.map(createSportTemplateExercise),
          }
        : { id: createSportTemplateId(), name: "", exercises: [createSportTemplateExercise()] };
      if (!sportTemplateDraft.exercises.length) {
        sportTemplateDraft.exercises.push(createSportTemplateExercise());
      }
      openSportTemplatesPanel(true);
      renderSportTemplates();
      window.requestAnimationFrame(() => {
        context.elements.sportTemplateEditor?.querySelector("#sport-template-name")?.focus();
      });
    }

    // Une seance deja saisie est le moyen le plus court d'obtenir un modele :
    // les exercices, series et charges sont deja la, il ne manque qu'un nom.
    function startTemplateFromSession(date) {
      const exercises = getSportSettings()
        .performanceEntries.filter((entry) => (entry.date || "") === date)
        .filter((entry) => (entry.exercise || "").trim())
        .map(createSportTemplateExercise);
      startSportTemplateDraft({
        id: createSportTemplateId(),
        name: "",
        exercises,
      });
    }

    function commitSportTemplateDraft() {
      if (!sportTemplateDraft) {
        return;
      }

      const exercises = sportTemplateDraft.exercises.filter((exercise) =>
        (exercise.exercise || "").trim()
      );
      if (!exercises.length) {
        const nameInput = context.elements.sportTemplateEditor?.querySelector(
          '[data-sport-template-field="exercise"]'
        );
        nameInput?.setCustomValidity("Nommez au moins un exercice.");
        nameInput?.reportValidity();
        return;
      }

      const sport = getSportSettings();
      const template = {
        id: sportTemplateDraft.id,
        name: sportTemplateDraft.name.trim() || "Seance sans nom",
        exercises,
      };
      const position = sport.sessionTemplates.findIndex((item) => item.id === template.id);
      if (position >= 0) {
        sport.sessionTemplates[position] = template;
      } else {
        sport.sessionTemplates.push(template);
      }

      sportTemplateDraft = null;
      saveSportChanges();
      renderSportTemplates();
    }

    function applySportTemplate(id) {
      const sport = getSportSettings();
      const template = sport.sessionTemplates.find((item) => item.id === id);
      if (!template?.exercises.length) {
        return;
      }

      const date = getTodayInputDate();
      const added = template.exercises.map((exercise) => ({
        ...createSportTemplateExercise(exercise),
        date,
      }));
      sport.performanceEntries.push(...added);
      context.state.sportMode = "performance";
      expandSportSession(date);
      saveSportChanges();
      renderSportTracker();
      focusSportCell(sport.performanceEntries.indexOf(added[0]), "exercise");
    }

    function handleSportTemplatesClick(event) {
      if (event.target.closest("[data-sport-template-new]")) {
        startSportTemplateDraft();
        return;
      }

      const apply = event.target.closest("[data-sport-template-apply]");
      if (apply) {
        applySportTemplate(apply.dataset.sportTemplateApply);
        return;
      }

      const edit = event.target.closest("[data-sport-template-edit]");
      if (edit) {
        const template = getSportSettings().sessionTemplates.find(
          (item) => item.id === edit.dataset.sportTemplateEdit
        );
        if (template) {
          startSportTemplateDraft(template);
        }
        return;
      }

      const remove = event.target.closest("[data-sport-template-delete]");
      if (remove) {
        const sport = getSportSettings();
        const template = sport.sessionTemplates.find(
          (item) => item.id === remove.dataset.sportTemplateDelete
        );
        if (!template || !window.confirm(`Supprimer le modele "${template.name}" ?`)) {
          return;
        }
        sport.sessionTemplates = sport.sessionTemplates.filter((item) => item !== template);
        if (sportTemplateDraft?.id === template.id) {
          sportTemplateDraft = null;
        }
        saveSportChanges();
        renderSportTemplates();
        return;
      }

      if (event.target.closest("[data-sport-template-add-exercise]")) {
        sportTemplateDraft?.exercises.push(createSportTemplateExercise());
        renderSportTemplateEditor();
        const rows = context.elements.sportTemplateEditor?.querySelectorAll(
          '[data-sport-template-field="exercise"]'
        );
        rows?.[rows.length - 1]?.focus();
        return;
      }

      const removeExercise = event.target.closest("[data-sport-template-remove-exercise]");
      if (removeExercise && sportTemplateDraft) {
        const index = Number(removeExercise.dataset.sportTemplateRemoveExercise);
        sportTemplateDraft.exercises.splice(index, 1);
        if (!sportTemplateDraft.exercises.length) {
          sportTemplateDraft.exercises.push(createSportTemplateExercise());
        }
        renderSportTemplateEditor();
        return;
      }

      if (event.target.closest("[data-sport-template-cancel]")) {
        sportTemplateDraft = null;
        renderSportTemplates();
        return;
      }

      if (event.target.closest("[data-sport-template-save]")) {
        commitSportTemplateDraft();
      }
    }

    // Le brouillon se met a jour sans redessiner : redessiner a chaque frappe
    // arracherait le curseur du champ en cours.
    function handleSportTemplateInput(event) {
      const input = event.target.closest("[data-sport-template-field]");
      if (!input || !sportTemplateDraft) {
        return;
      }

      input.setCustomValidity("");
      const field = input.dataset.sportTemplateField;
      if (field === "name") {
        sportTemplateDraft.name = input.value;
        return;
      }

      const index = Number(input.dataset.sportTemplateExercise);
      if (sportTemplateDraft.exercises[index]) {
        sportTemplateDraft.exercises[index][field] = input.value;
      }
    }

    // Les liaisons d'evenements du sport, deplacees telles quelles depuis
    // events.js ou elles occupaient une quarantaine de lignes parmi 201 autres.
    function bindEvents() {
      context.elements.sportModeButtons?.forEach((button) => {
        button.addEventListener("click", () => {
          context.state.sportMode = button.dataset.sportMode || "mass";
          renderSportTracker();
        });
      });
      context.elements.sportMassEntryForm?.addEventListener("submit", handleSportMassSubmit);
      // Sans date precisee, addSportRow vise la seance du jour, donc le haut
      // du tableau. Ce branchement avait ete perdu en sortant sport.js de
      // events.js : le bouton existait encore, il ne faisait plus rien.
      context.elements.addSportPerformanceRowButton?.addEventListener("click", () =>
        addSportRow("performance", { focusField: "exercise" })
      );
      context.elements.sportZoomOut?.addEventListener("click", () => adjustSportTableZoom(-1));
      context.elements.sportZoomIn?.addEventListener("click", () => adjustSportTableZoom(1));
      context.elements.sportMassBody?.addEventListener("click", handleSportDelete);
      context.elements.sportMassBody?.addEventListener("input", handleSportInput);
      context.elements.sportMassBody?.addEventListener("change", handleSportInput);
      context.elements.sportPerformanceBody?.addEventListener("input", handleSportInput);
      context.elements.sportPerformanceBody?.addEventListener("change", handleSportInput);
      context.elements.sportPerformanceBody?.addEventListener("focusin", handleSportFocusIn);
      context.elements.sportPerformanceBody?.addEventListener("keydown", handleSportKeydown);
      context.elements.sportPerformanceBody?.addEventListener("pointerdown", handleSportRowPointerDown);
      context.elements.sportPerformanceBody?.addEventListener("pointermove", handleSportRowPointerMove);
      context.elements.sportPerformanceBody?.addEventListener("pointerup", handleSportRowPointerUp);
      context.elements.sportPerformanceBody?.addEventListener("pointerup", handleSportCellPointerUp);
      context.elements.sportPerformanceBody?.addEventListener("pointercancel", cancelSportRowPress);
      // Avant handleSportPerformanceClick : l'en-tete de seance est servi
      // en premier, la ligne ordinaire ensuite.
      context.elements.sportPerformanceBody?.addEventListener("click", handleSportSessionClick);
      context.elements.sportPerformanceBody?.addEventListener("change", handleSportSessionDate);
      context.elements.sportPerformanceBody?.addEventListener("click", handleSportPerformanceClick);
      context.elements.sportTemplatesToggle?.addEventListener("click", () => {
        openSportTemplatesPanel(!isSportTemplatesPanelOpen());
      });
      context.elements.sportTemplatesPanel?.addEventListener("click", handleSportTemplatesClick);
      context.elements.sportTemplatesPanel?.addEventListener("input", handleSportTemplateInput);
      context.elements.sportExerciseSuggestions?.addEventListener("click", handleSportAssistClick);
      context.elements.sportLastPerformance?.addEventListener("click", handleSportAssistClick);
      context.elements.sportRowMenu?.addEventListener("click", handleSportRowMenuAction);
      document.addEventListener("click", handleSportOutsideClick);
    }

    return {
      bindEvents,
      render: renderSportTracker,
      renderTableZoom: renderSportTableZoom,
      // Exposes pour les tests. Ces quatre fonctions decident de l'ordre du
      // journal, du decoupage en seances et de ce qu'un modele y depose :
      // les faire passer par le DOM pour les verifier rendrait le test plus
      // fragile que le code qu'il protege.
      parseDateInput: parseSportDateInput,
      sortEntries: sortSportPerformanceEntries,
      groupBySession: groupSportEntriesBySession,
      summarizeSession: summarizeSportSession,
      applyTemplate: applySportTemplate,
    };
  };
})(window);
