/*
  Journal d'entrainement.

  Ce bloc vivait a cheval sur events.js et renderers.js, ou il representait
  30 fonctions sur 124 et pesait 900 lignes. Mesure faite avant de le sortir :
  il n'appelait le reste du code qu'a travers `context`, ce qui en faisait le
  seul ensemble reellement detachable de ces deux fichiers. Le decoupage
  complet, lui, n'est pas possible sans passer aux modules ES : 296 appels
  croisent les fonctions d'une meme fermeture.

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

    function getSportSettings() {
      context.state.settings.sport = context.state.settings.sport || {
        massEntries: [],
        performanceEntries: [],
        lastSavedAt: null,
      };
      context.state.settings.sport.massEntries = context.state.settings.sport.massEntries || [];
      context.state.settings.sport.performanceEntries =
        context.state.settings.sport.performanceEntries || [];
      return context.state.settings.sport;
    }

    function addSportRow(table, options = {}) {
      const sport = getSportSettings();
      if (table === "performance") {
        sport.performanceEntries.push({
          date: options.date || getPreviousPerformanceDate() || getTodayInputDate(),
          exercise: "",
          sets: "",
          reps: "",
          weight: "",
          rest: "",
          comment: "",
        });
        context.state.sportMode = "performance";
      }

      saveSportChanges();
      renderSportTracker();
      if (table === "performance" && options.focusField) {
        focusSportCell(sport.performanceEntries.length - 1, options.focusField);
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
      if (table === "performance" && field === "date") {
        const normalizedDate = parseSportDateInput(input.value, entry.date);
        if (!input.value.trim()) {
          entry.date = "";
          input.dataset.sportDateValue = "";
          input.setCustomValidity("");
        } else if (normalizedDate) {
          entry.date = normalizedDate;
          input.dataset.sportDateValue = normalizedDate;
          input.setCustomValidity("");
        } else {
          input.setCustomValidity("Utilisez le format jj/mm ou jj/mm/aa.");
          if (event.type === "change") {
            input.reportValidity();
          }
          return;
        }
      } else {
        entry[field] = input.type === "checkbox" ? input.checked : input.value;
      }

      if (table === "performance" && field === "exercise" && input.value.trim() && !entry.date) {
        entry.date = getPreviousPerformanceDate(index) || getTodayInputDate();
        const row = input.closest("tr");
        const dateInput = row?.querySelector('[data-sport-field="date"]');
        if (dateInput) {
          dateInput.value = formatSportDateForCell(entry.date);
          dateInput.dataset.sportDateValue = entry.date;
        }
      }

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
          ? ["date", "exercise", "sets", "reps", "weight", "rest"]
          : ["date", "exercise", "sets", "reps", "weight", "rest", "comment"];
      const field = input.dataset.sportField;
      const fieldIndex = fields.indexOf(field);
      const rowIndex = Number(input.dataset.sportIndex);
      const sport = getSportSettings();
      const isLastField = fieldIndex === fields.length - 1;
      const isLastRow = rowIndex >= sport.performanceEntries.length - 1;

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

      const currentDate = sport.performanceEntries[rowIndex]?.date || getTodayInputDate();
      addSportRow("performance", { date: currentDate, focusField: "exercise" });
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

      const shortMatch = trimmed.match(/^(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2}|\d{4}))?$/);
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
        existing?.date || getPreviousPerformanceDate(index + 1) || getTodayInputDate();
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

    function createSportPerformanceEntry(date = "") {
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

    function getPreviousPerformanceDate(beforeIndex = null) {
      const entries = getSportSettings().performanceEntries;
      const endIndex = beforeIndex == null ? entries.length : beforeIndex;
      for (let index = endIndex - 1; index >= 0; index -= 1) {
        if (entries[index]?.date) {
          return entries[index].date;
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


    function renderSportTracker() {
      if (!context.elements.sportMassBody || !context.elements.sportPerformanceBody) {
        return;
      }

      const sport = getSportSettings();
      const massEntries = sport.massEntries
        .map((entry, index) => ({ entry, index }))
        .sort((left, right) => getMassEntryTimestamp(right) - getMassEntryTimestamp(left));
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
      context.elements.sportPerformanceBody.innerHTML = performanceEntries
        .map((entry, index) => buildSportPerformanceRow(entry, index))
        .join("");
    }

    function createEmptySportMassEntry() {
      return { date: "", mass: "", fasted: false };
    }

    function createEmptySportPerformanceEntry() {
      return { date: "", exercise: "", sets: "", reps: "", weight: "", rest: "", comment: "" };
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

    function formatSportPerformanceDate(value) {
      const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!match) {
        return value || "";
      }

      const [, year, month, day] = match;
      return Number(year) === new Date().getFullYear()
        ? `${day}/${month}`
        : `${day}/${month}/${year.slice(-2)}`;
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
          <td class="sport-date-cell">
            <input class="sport-input sport-date-input" aria-label="Date, ligne ${index + 1}" type="text" inputmode="numeric" maxlength="8" value="${escapeHtml(formatSportPerformanceDate(entry.date))}" placeholder="jj/mm" enterkeyhint="next" data-sport-date-value="${escapeHtml(entry.date || "")}" data-sport-table="performance" data-sport-index="${index}" data-sport-field="date" />
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
      context.elements.sportPerformanceBody?.addEventListener("click", handleSportPerformanceClick);
      context.elements.sportExerciseSuggestions?.addEventListener("click", handleSportAssistClick);
      context.elements.sportLastPerformance?.addEventListener("click", handleSportAssistClick);
      context.elements.sportRowMenu?.addEventListener("click", handleSportRowMenuAction);
      document.addEventListener("click", handleSportOutsideClick);
    }

    return {
      bindEvents,
      render: renderSportTracker,
      renderTableZoom: renderSportTableZoom,
    };
  };
})(window);
