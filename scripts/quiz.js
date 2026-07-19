(function initializeQuizModule(global) {
  const AtlasApp = (global.AtlasApp = global.AtlasApp || {});

  AtlasApp.createQuizModule = function createQuizModule(context) {
    const { escapeHtml, shuffle } = AtlasApp.helpers;
    const EASY_POOL_MINIMUM_FOR_MIXED_ROTATION = 3;
    const EARLY_ROTATION_AVERAGE_ASKED_LIMIT = 2;
    const EARLY_ROTATION_SEEN_RATIO_LIMIT = 0.65;
    const ROTATION_REST_HOURS = {
      difficult: 6,
      intermediate: 24,
      easy: 96,
    };
    let quizTimerHandle = null;

    function getScopedNotes(scope, tagValue, folderId = "") {
      const active = context.notes.getActiveNote();

      if (scope === "current") {
        return active ? [active] : [];
      }

      if (scope === "tag") {
        const tag = tagValue.trim().toLowerCase();
        return context.state.notes.filter((note) =>
          note.tags.some((candidate) => candidate.toLowerCase() === tag)
        );
      }

      if (scope === "folder") {
        return context.notes.getFolderDescendantNotes(folderId);
      }

      if (scope === "due") {
        return context.notes.getDueNotes();
      }

      return context.state.notes;
    }

    function buildQuizSession() {
      stopQuizTimer();
      const availableNotes = getScopedNotes(
        context.elements.quizScope.value,
        context.elements.quizTag.value,
        context.elements.quizFolder.value
      ).filter((note) => Array.isArray(note.quizQuestions) && note.quizQuestions.length);

      const requestedAmount = context.helpers.clamp(Number(context.elements.quizAmount.value) || 10, 1, 50);
      const picked = pickQuizQuestionsForSession(availableNotes, requestedAmount);

      context.state.quiz = {
        questions: picked,
        score: 0,
        validatedCount: 0,
        startedAt: Date.now(),
        finishedAt: null,
        requestedAmount,
        revealPending: false,
      };
      context.state.quizView = "play";

      context.renderers.renderTabs();
      renderQuizViewMode();
      renderQuizDashboard();
      renderQuizCard({ force: true });
      context.mascot?.sync();
      startQuizTimer();
    }

    function resetQuizSession() {
      stopQuizTimer();
      context.state.quiz = {
        questions: [],
        score: 0,
        validatedCount: 0,
        startedAt: null,
        finishedAt: null,
        requestedAmount: Number(context.elements.quizAmount.value) || 10,
        revealPending: false,
      };

      renderQuizCard({ force: true });
      renderQuizDashboard();
      context.mascot?.sync();
    }

    function setQuizView(view) {
      context.state.quizView = view === "play" ? "play" : "stats";
      if (context.state.quizView === "stats") {
        context.state.quizStatsDrilldown = null;
      }
      renderQuizViewMode();
      renderQuizDashboard();
      renderQuizCard({ force: true });
      context.mascot?.sync();
    }

    function renderQuizViewMode() {
      const view = context.state.quizView === "play" ? "play" : "stats";
      context.elements.quizUniverse?.classList.toggle("quiz-view-stats", view === "stats");
      context.elements.quizUniverse?.classList.toggle("quiz-view-play", view === "play");
      context.elements.quizViewButtons?.forEach((button) => {
        button.classList.toggle("is-active", button.dataset.quizView === view);
      });
      context.mascot?.sync();
    }

    function renderAsterMascot(variant = "hero") {
      const speechByVariant = {
        drilldown: "On suit le fil !",
        hero: "Je suis la !",
        panel: "Encore un peu !",
        session: "On revise ensemble !",
        result: "Tu progresses !",
      };
      const speech = speechByVariant[variant] || "On y va !";
      const imageByVariant = {
        result: "happy",
        session: "thinking",
      };
      const expression = imageByVariant[variant] || "neutral";

      return `
        <div class="quiz-aster quiz-aster-${escapeHtml(variant)} quiz-aster-anchor" data-aster-anchor="${escapeHtml(
          variant
        )}" aria-hidden="true">
          <span class="quiz-aster-speech">${escapeHtml(speech)}</span>
          <div class="quiz-aster-drift">
            <span class="quiz-aster-glow"></span>
            <div class="quiz-aster-core">
              <img
                class="quiz-aster-image"
                src="./assets/mascot/aster-${escapeHtml(expression)}.png"
                alt=""
                loading="lazy"
              />
            </div>
          </div>
        </div>
      `;
    }

    function startQuizTimer() {
      stopQuizTimer();
      if (!context.state.quiz.startedAt || context.state.quiz.finishedAt || !context.state.quiz.questions.length) {
        return;
      }

      quizTimerHandle = window.setInterval(syncQuizTimerDisplay, 1000);
      syncQuizTimerDisplay();
    }

    function stopQuizTimer() {
      if (quizTimerHandle) {
        window.clearInterval(quizTimerHandle);
        quizTimerHandle = null;
      }
    }

    function syncQuizTimerDisplay() {
      const duration = getSessionDuration(context.state.quiz.startedAt, context.state.quiz.finishedAt);
      const durationElement = context.elements.quizCard?.querySelector("[data-quiz-duration]");
      if (durationElement) {
        durationElement.textContent = duration;
      }
    }

    function finalizeRevealSequence() {
      const firstQuestion = context.elements.quizCard?.querySelector(".quiz-session-item");
      if (firstQuestion) {
        firstQuestion.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }

      context.state.quiz.revealPending = false;
    }

    /*
      Politique de rotation des quiz

      Le but n'est pas de respecter aveuglement les categories, mais d'eviter
      les boucles de questions tout en gardant une vraie logique pedagogique.

      1. On ne prend qu'une question par page/note dans une session.
      2. Une question vue recemment peut etre mise au repos selon sa difficulte:
         les difficiles reviennent plus vite, les intermediaires a un rythme
         moyen, et les faciles beaucoup plus tard.
      3. En mode mixte/priorite, les questions faciles ne recoivent un quota
         que si leur bassin est assez large. Une unique question facile peut
         revenir comme appoint rare, mais elle n'est jamais forcee juste pour
         remplir le quota.
      4. Au debut, quand beaucoup de questions sont nouvelles ou peu vues, la
         repartition favorise l'exploration: nouvelles/difficiles d'abord,
         intermediaires ensuite, faciles au compte-gouttes.
      5. Les categories restent utiles pour lire le tableau de bord, mais la
         selection utilise un score de priorite: anciennete depuis la derniere
         apparition, nombre de passages, erreurs, difficulte, et une part de
         hasard pour eviter des sequences trop previsibles.
    */
    function pickQuizQuestionsForSession(notes, requestedAmount) {
      if (!notes.length || requestedAmount <= 0) {
        return [];
      }

      const noteCandidates = collectSessionQuestionCandidates(notes);

      if (!noteCandidates.length) {
        return [];
      }

      const focus = normalizeQuizFocus(context.elements.quizMode?.value);
      const focusedCandidates = noteCandidates.filter((candidate) => matchesQuizFocus(candidate, focus));
      const rotationCandidates = pickOneQuestionPerNote(focusedCandidates);

      if (!rotationCandidates.length) {
        return [];
      }

      const quotas = computeDifficultyQuotas(requestedAmount, rotationCandidates, focus);
      const pools = {
        difficult: [],
        intermediate: [],
        easy: [],
      };

      rotationCandidates.forEach((candidate) => {
        pools[candidate.difficulty].push(candidate);
      });

      const selected = [];
      const usedKeys = new Set();
      ["difficult", "intermediate", "easy"].forEach((difficulty) => {
        const quota = quotas[difficulty];
        if (!quota) {
          return;
        }

        pickFromPool(pools[difficulty], quota, usedKeys).forEach((item) => selected.push(item));
      });

      if (selected.length < requestedAmount) {
        const remainder = rotationCandidates.filter((item) => !usedKeys.has(item.sessionKey));
        pickFromPool(remainder, requestedAmount - selected.length, usedKeys).forEach((item) =>
          selected.push(item)
        );
      }

      return shuffle(selected).slice(0, requestedAmount);
    }

    function pickOneQuestionPerNote(candidates) {
      const byNote = new Map();

      candidates.forEach((candidate) => {
        const bucket = byNote.get(candidate.noteId);
        if (bucket) {
          bucket.push(candidate);
          return;
        }

        byNote.set(candidate.noteId, [candidate]);
      });

      return [...byNote.values()]
        .map((group) => {
          const eligibleGroup = group.filter((candidate) => isRotationEligible(candidate));
          if (!eligibleGroup.length) {
            return null;
          }

          return weightedPick(eligibleGroup, (candidate) => rotationWeight(candidate));
        })
        .filter(Boolean);
    }

    function collectSessionQuestionCandidates(notes) {
      return notes.flatMap((note) =>
        (note.quizQuestions || [])
          .map((question, index) => normalizeQuizQuestion(question, index))
          .filter(Boolean)
          .map((question) => buildSessionQuestion(note, question))
      );
    }

    function normalizeQuizQuestion(question, index = 0) {
      const questionText = String(question?.question || "").trim();
      const answers = normalizeQuizAnswers(question?.answers);
      if (!questionText || !answers.length) {
        return null;
      }

      const stats = normalizeQuestionStats(question?.stats);
      const id =
        typeof question?.id === "string" && question.id.trim()
          ? question.id.trim()
          : `question-${index + 1}`;

      return {
        id,
        question: questionText,
        answers,
        stats,
      };
    }

    function normalizeQuizAnswers(rawAnswers) {
      const source = Array.isArray(rawAnswers)
        ? rawAnswers.flatMap((value) => String(value || "").split(","))
        : String(rawAnswers || "").split(",");

      const seen = new Set();
      return source
        .map((answer) => answer.trim())
        .filter(Boolean)
        .filter((answer) => {
          const normalized = normalizeAnswerText(answer);
          if (seen.has(normalized)) {
            return false;
          }
          seen.add(normalized);
          return true;
        });
    }

    function normalizeQuestionStats(stats = {}) {
      return {
        asked: Number(stats?.asked) || 0,
        correct: Number(stats?.correct) || 0,
        lastAskedAt: typeof stats?.lastAskedAt === "string" ? stats.lastAskedAt : null,
        lastCorrectAt: typeof stats?.lastCorrectAt === "string" ? stats.lastCorrectAt : null,
        updatedAt: typeof stats?.updatedAt === "string" ? stats.updatedAt : null,
      };
    }

    function buildSessionQuestion(note, question) {
      const difficulty = getQuestionDifficulty(question.stats);
      const sessionKey = `${note.id}:${question.id}`;
      return {
        sessionKey,
        noteId: note.id,
        noteTitle: note.title,
        questionId: question.id,
        question: question.question,
        acceptedAnswers: question.answers,
        difficulty,
        difficultyLabel: getDifficultyLabel(difficulty),
        userAnswer: "",
        validated: false,
        isCorrect: null,
        matchedAnswer: "",
        statsBefore: { ...question.stats },
      };
    }

    function getQuestionDifficulty(stats = {}) {
      const asked = Number(stats?.asked) || 0;
      const correct = Number(stats?.correct) || 0;

      if (asked < 5) {
        return "difficult";
      }

      if (asked < 7) {
        if (correct === 5) {
          return "easy";
        }

        if (correct >= 3) {
          return "intermediate";
        }

        return "difficult";
      }

      const ratio = asked > 0 ? correct / asked : 0;
      if (ratio >= 0.7) {
        return "easy";
      }

      if (ratio >= 0.3) {
        return "intermediate";
      }

      return "difficult";
    }

    function getDifficultyLabel(difficulty) {
      return {
        difficult: "Difficile",
        intermediate: "Intermediaire",
        easy: "Facile",
      }[difficulty] || "Difficile";
    }

    function normalizeQuizFocus(value) {
      return ["priority", "new", "difficult", "intermediate", "easy"].includes(value)
        ? value
        : "mixed";
    }

    function getQuizFocusLabel(focus) {
      return {
        mixed: "Toutes",
        priority: "Priorite",
        new: "Jamais vues",
        difficult: "Difficiles",
        intermediate: "Intermediaires",
        easy: "Maitrisees",
      }[normalizeQuizFocus(focus)] || "Toutes";
    }

    function isPriorityQuestion(stats = {}) {
      const asked = Number(stats?.asked) || 0;
      const correct = Number(stats?.correct) || 0;
      const ratio = asked > 0 ? correct / asked : 0;
      return asked === 0 || getQuestionDifficulty(stats) === "difficult" || ratio < 0.5;
    }

    function matchesQuizFocus(candidate, focus) {
      const normalizedFocus = normalizeQuizFocus(focus);
      const stats = candidate.statsBefore || {};
      if (normalizedFocus === "mixed") {
        return true;
      }

      if (normalizedFocus === "priority") {
        return isPriorityQuestion(stats);
      }

      if (normalizedFocus === "new") {
        return (Number(stats.asked) || 0) === 0;
      }

      return candidate.difficulty === normalizedFocus;
    }

    function computeDifficultyQuotas(amount, candidates = [], focus = "mixed") {
      const normalizedFocus = normalizeQuizFocus(focus);
      if (["difficult", "intermediate", "easy"].includes(normalizedFocus)) {
        return {
          difficult: normalizedFocus === "difficult" ? amount : 0,
          intermediate: normalizedFocus === "intermediate" ? amount : 0,
          easy: normalizedFocus === "easy" ? amount : 0,
        };
      }

      const profile = getRotationProfile(candidates);
      const earlyRotation = profile.averageAsked < EARLY_ROTATION_AVERAGE_ASKED_LIMIT ||
        profile.seenRatio < EARLY_ROTATION_SEEN_RATIO_LIMIT;
      const easyPoolSize = candidates.filter((candidate) => candidate.difficulty === "easy").length;
      const easyRatio = earlyRotation ? 0.1 : 0.15;
      const intermediateRatio = earlyRotation ? 0.3 : 0.35;
      const easy = easyPoolSize >= EASY_POOL_MINIMUM_FOR_MIXED_ROTATION
        ? Math.min(Math.floor(amount * easyRatio), easyPoolSize)
        : 0;
      const intermediate = Math.round(amount * intermediateRatio);
      const difficult = Math.max(amount - easy - intermediate, 0);

      return {
        difficult,
        intermediate,
        easy,
      };
    }

    function getRotationProfile(candidates) {
      if (!candidates.length) {
        return {
          averageAsked: 0,
          seenRatio: 0,
        };
      }

      const totals = candidates.reduce(
        (summary, candidate) => {
          const asked = Number(candidate.statsBefore?.asked) || 0;
          return {
            asked: summary.asked + asked,
            seen: summary.seen + (asked > 0 ? 1 : 0),
          };
        },
        { asked: 0, seen: 0 }
      );

      return {
        averageAsked: totals.asked / candidates.length,
        seenRatio: totals.seen / candidates.length,
      };
    }

    function isRotationEligible(candidate) {
      return !isQuestionCoolingDown(candidate);
    }

    function isQuestionCoolingDown(candidate) {
      const restHours = ROTATION_REST_HOURS[candidate.difficulty] || 0;
      const asked = Number(candidate.statsBefore?.asked) || 0;
      if (!asked || restHours <= 0) {
        return false;
      }

      return getHoursSinceLastAsked(candidate.statsBefore?.lastAskedAt) < restHours;
    }

    function getHoursSinceLastAsked(lastAskedAt) {
      const timestamp = Date.parse(lastAskedAt || "");
      if (!Number.isFinite(timestamp)) {
        return Infinity;
      }

      return Math.max((Date.now() - timestamp) / 36e5, 0);
    }

    function weightedPick(items, weightGetter) {
      if (!items.length) {
        return null;
      }

      const totalWeight = items.reduce((sum, item) => sum + Math.max(weightGetter(item), 0), 0);
      if (totalWeight <= 0) {
        return items[Math.floor(Math.random() * items.length)];
      }

      let cursor = Math.random() * totalWeight;
      for (const item of items) {
        cursor -= Math.max(weightGetter(item), 0);
        if (cursor <= 0) {
          return item;
        }
      }

      return items[items.length - 1];
    }

    function pickFromPool(pool, count, usedKeys) {
      const available = pool.filter((item) => !usedKeys.has(item.sessionKey));
      const chosen = [];

      while (available.length && chosen.length < count) {
        const selected = weightedPick(available, (item) => rotationWeight(item));
        if (!selected) {
          break;
        }

        chosen.push(selected);
        usedKeys.add(selected.sessionKey);
        const index = available.findIndex((item) => item.sessionKey === selected.sessionKey);
        if (index >= 0) {
          available.splice(index, 1);
        }
      }

      return chosen;
    }

    function rotationWeight(candidate) {
      const stats = candidate.statsBefore || {};
      const asked = Number(stats.asked) || 0;
      const correct = Number(stats.correct) || 0;
      const wrong = Math.max(asked - correct, 0);
      const hoursSinceLastAsked = getHoursSinceLastAsked(stats.lastAskedAt);
      const difficultyWeight = {
        difficult: 10,
        intermediate: 4,
        easy: 0.75,
      }[candidate.difficulty] || 2;
      const discoveryBoost = asked === 0 ? 18 : 0;
      const spacingScale = {
        difficult: 3,
        intermediate: 4,
        easy: 8,
      }[candidate.difficulty] || 4;
      const spacingCap = {
        difficult: 12,
        intermediate: 10,
        easy: 8,
      }[candidate.difficulty] || 8;
      const spacingBoost = Number.isFinite(hoursSinceLastAsked)
        ? Math.min(hoursSinceLastAsked / spacingScale, spacingCap)
        : spacingCap;
      const practiceBalance = 6 / (asked + 1);
      const errorBoost = wrong * (candidate.difficulty === "easy" ? 1.2 : 1.8);
      const masteryPenalty = Math.min(correct * (candidate.difficulty === "easy" ? 0.55 : 0.35), 5);
      const rawWeight =
        discoveryBoost + difficultyWeight + spacingBoost + practiceBalance + errorBoost - masteryPenalty;

      return Math.max(candidate.difficulty === "easy" ? rawWeight * 0.3 : rawWeight, 0.1);
    }

    function setQuizAnswer(index, value) {
      const question = context.state.quiz.questions[index];
      if (!question || question.validated) {
        return;
      }

      question.userAnswer = value;
    }

    function validateQuizSession() {
      if (!context.state.quiz.questions.length || context.state.quiz.finishedAt) {
        return;
      }

      const now = new Date().toISOString();
      const activeEditorNoteId = context.state.editorQuizQuestionsNoteId;
      const updatedNotes = new Set();

      context.state.quiz.questions.forEach((question) => {
        const userAnswer = String(question.userAnswer || "").trim();
        const matchedAnswer = findMatchingAcceptedAnswer(userAnswer, question.acceptedAnswers);
        const isCorrect = Boolean(matchedAnswer);

        question.validated = true;
        question.isCorrect = isCorrect;
        question.matchedAnswer = matchedAnswer || question.acceptedAnswers[0] || "";
        question.validatedAt = now;

        const note = context.state.notes.find((candidate) => candidate.id === question.noteId);
        const storedQuestion = note?.quizQuestions?.find((item) => item.id === question.questionId);
        if (storedQuestion) {
          storedQuestion.stats = normalizeQuestionStats(storedQuestion.stats);
          storedQuestion.stats.asked += 1;
          if (isCorrect) {
            storedQuestion.stats.correct += 1;
            storedQuestion.stats.lastCorrectAt = now;
          }
          storedQuestion.stats.lastAskedAt = now;
          storedQuestion.stats.updatedAt = now;
          question.statsAfter = { ...storedQuestion.stats };
          updatedNotes.add(note);

          if (activeEditorNoteId === note.id) {
            context.state.editorQuizQuestions = (context.state.editorQuizQuestions || []).map(
              (draftQuestion) =>
                draftQuestion.id === question.questionId
                  ? {
                      ...draftQuestion,
                      stats: { ...storedQuestion.stats },
                    }
                  : draftQuestion
            );
          }
        } else {
          question.statsAfter = null;
        }
      });

      updatedNotes.forEach((note) => {
        note.updatedAt = now;
      });

      context.state.quiz.validatedCount = context.state.quiz.questions.length;
      syncQuizScore();
      context.state.quiz.finishedAt = Date.now();
      context.state.quiz.revealPending = true;
      stopQuizTimer();
      recordQuizSession();
      context.data.saveNotes();
      renderQuizDashboard();
      renderQuizCard({ force: true });

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(finalizeRevealSequence);
      });
    }

    function getCountedQuizQuestions() {
      return context.state.quiz.questions.filter((question) => !question.contested);
    }

    function getQuizScoreSnapshot() {
      const counted = getCountedQuizQuestions();
      return {
        total: counted.length,
        correct: counted.filter((item) => item.validated && item.isCorrect).length,
        wrong: counted.filter((item) => item.validated && !item.isCorrect).length,
        contested: context.state.quiz.questions.filter((item) => item.contested).length,
      };
    }

    function syncQuizScore() {
      const score = getQuizScoreSnapshot();
      context.state.quiz.score = score.correct;
      context.state.quiz.scoredTotal = score.total;
      context.state.quiz.contestedCount = score.contested;
      return score;
    }

    function contestQuizQuestion(index) {
      const question = context.state.quiz.questions[index];
      if (!question || !context.state.quiz.finishedAt || question.contested) {
        return;
      }

      const note = context.state.notes.find((candidate) => candidate.id === question.noteId);
      const storedQuestion = note?.quizQuestions?.find((item) => item.id === question.questionId);
      if (storedQuestion && question.statsBefore) {
        storedQuestion.stats = normalizeQuestionStats(question.statsBefore);
        storedQuestion.stats.updatedAt = new Date().toISOString();
        question.statsAfter = { ...storedQuestion.stats };
        note.updatedAt = new Date().toISOString();

        if (context.state.editorQuizQuestionsNoteId === note.id) {
          context.state.editorQuizQuestions = (context.state.editorQuizQuestions || []).map(
            (draftQuestion) =>
              draftQuestion.id === question.questionId
                ? {
                    ...draftQuestion,
                    stats: { ...storedQuestion.stats },
                  }
                : draftQuestion
          );
        }
      }

      question.contested = true;
      question.contestedAt = new Date().toISOString();
      syncQuizScore();
      updateRecordedQuizSession();
      context.data.saveNotes();
      renderQuizDashboard();
      renderQuizCard({ force: true });
    }

    function acceptContestedAnswer(index) {
      const question = context.state.quiz.questions[index];
      const answer = String(question?.userAnswer || "").trim();
      if (!question || !question.contested || !answer || question.contestedAnswerAccepted) {
        return;
      }

      const note = context.state.notes.find((candidate) => candidate.id === question.noteId);
      const storedQuestion = note?.quizQuestions?.find((item) => item.id === question.questionId);
      if (!storedQuestion) {
        return;
      }

      const existingAnswers = normalizeQuizAnswers(storedQuestion.answers);
      const normalizedAnswer = normalizeAnswerText(answer);
      const alreadyAccepted = existingAnswers.some(
        (candidate) => normalizeAnswerText(candidate) === normalizedAnswer
      );

      if (!alreadyAccepted) {
        storedQuestion.answers = [...existingAnswers, answer];
        question.acceptedAnswers = [...existingAnswers, answer];
      } else {
        question.acceptedAnswers = existingAnswers;
      }

      question.contestedAnswerAccepted = true;
      question.contestedAcceptedAnswer = answer;

      if (context.state.editorQuizQuestionsNoteId === note.id) {
        context.state.editorQuizQuestions = (context.state.editorQuizQuestions || []).map(
          (draftQuestion) =>
            draftQuestion.id === question.questionId
              ? {
                  ...draftQuestion,
                  answers: [...storedQuestion.answers],
                }
              : draftQuestion
        );
      }

      note.updatedAt = new Date().toISOString();
      context.data.saveNotes();
      renderQuizDashboard();
      renderQuizCard({ force: true });
    }

    function findMatchingAcceptedAnswer(userAnswer, acceptedAnswers) {
      if (!userAnswer) {
        return "";
      }

      const normalizedUser = normalizeAnswerText(userAnswer);
      return (
        acceptedAnswers.find((answer) => normalizeAnswerText(answer) === normalizedUser) || ""
      );
    }

    function normalizeAnswerText(value) {
      return String(value || "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    function getSessionDuration(startedAt, finishedAt = null) {
      const end = finishedAt || Date.now();
      if (!startedAt) {
        return "0s";
      }

      const elapsedSeconds = Math.max(0, Math.round((end - startedAt) / 1000));
      const minutes = Math.floor(elapsedSeconds / 60);
      const seconds = elapsedSeconds % 60;
      return minutes ? `${minutes}m ${seconds}s` : `${seconds}s`;
    }

    function getSessionDurationSeconds(startedAt, finishedAt) {
      if (!startedAt || !finishedAt) {
        return 0;
      }

      return Math.max(0, Math.round((finishedAt - startedAt) / 1000));
    }

    function getAverageAnswerSeconds(durationSeconds, answerCount) {
      const safeCount = Math.max(0, Math.round(Number(answerCount) || 0));
      if (!safeCount) {
        return 0;
      }

      return Math.max(0, Math.round((Number(durationSeconds) || 0) / safeCount));
    }

    function getQuizSessions() {
      context.state.settings.quizPlayerStats = context.state.settings.quizPlayerStats || {
        sessions: [],
      };
      context.state.settings.quizPlayerStats.sessions =
        context.state.settings.quizPlayerStats.sessions || [];
      return context.state.settings.quizPlayerStats.sessions;
    }

    function recordQuizSession() {
      const score = syncQuizScore();
      if (!score.total || !context.state.quiz.finishedAt) {
        return;
      }

      const sessions = getQuizSessions();
      const id = `quiz-${context.state.quiz.finishedAt}`;
      const durationSeconds = getSessionDurationSeconds(
        context.state.quiz.startedAt,
        context.state.quiz.finishedAt
      );
      context.state.quiz.sessionRecordId = id;
      sessions.unshift({
        id,
        startedAt: new Date(context.state.quiz.startedAt).toISOString(),
        finishedAt: new Date(context.state.quiz.finishedAt).toISOString(),
        updatedAt: new Date(context.state.quiz.finishedAt).toISOString(),
        durationSeconds,
        averageAnswerSeconds: getAverageAnswerSeconds(durationSeconds, score.total),
        total: score.total,
        correct: score.correct,
        scope: context.elements.quizScope?.value || "all",
        focus: normalizeQuizFocus(context.elements.quizMode?.value),
      });
      context.state.settings.quizPlayerStats.sessions = sessions.slice(0, 120);
    }

    function updateRecordedQuizSession() {
      const sessions = getQuizSessions();
      const sessionId = context.state.quiz.sessionRecordId;
      if (!sessionId) {
        return;
      }

      const score = syncQuizScore();
      const index = sessions.findIndex((session) => session.id === sessionId);
      if (index < 0) {
        return;
      }

      if (!score.total) {
        sessions.splice(index, 1);
        return;
      }

      sessions[index] = {
        ...sessions[index],
        updatedAt: new Date().toISOString(),
        total: score.total,
        correct: score.correct,
        averageAnswerSeconds: getAverageAnswerSeconds(sessions[index].durationSeconds, score.total),
      };
    }

    function getDashboardNotes() {
      return getScopedNotes(
        context.elements.quizScope?.value || "all",
        context.elements.quizTag?.value || "",
        context.elements.quizFolder?.value || ""
      ).filter((note) => Array.isArray(note.quizQuestions) && note.quizQuestions.length);
    }

    function collectQuestionInventory(notes) {
      return notes.flatMap((note) =>
        (note.quizQuestions || [])
          .map((question, index) => {
            const normalized = normalizeQuizQuestion(question, index);
            if (!normalized) {
              return null;
            }

            const asked = Number(normalized.stats.asked) || 0;
            const correct = Number(normalized.stats.correct) || 0;
            const difficulty = getQuestionDifficulty(normalized.stats);
            const successRate = asked > 0 ? Math.round((correct / asked) * 100) : 0;

            return {
              key: `${note.id}:${normalized.id}`,
              noteId: note.id,
              noteTitle: note.title,
              questionId: normalized.id,
              question: normalized.question,
              answerCount: normalized.answers.length,
              stats: normalized.stats,
              asked,
              correct,
              wrong: Math.max(asked - correct, 0),
              difficulty,
              difficultyLabel: getDifficultyLabel(difficulty),
              successRate,
              priority: isPriorityQuestion(normalized.stats),
              lastAskedAt: normalized.stats.lastAskedAt,
            };
          })
          .filter(Boolean)
      );
    }

    function getQuizScopeLabel(scope) {
      return {
        all: "Toutes les pages",
        current: "Page active",
        folder: "Dossier",
        tag: "Tag",
        due: "Pages a revoir",
      }[scope] || "Toutes les pages";
    }

    function getQuestionSortScore(item) {
      const freshnessPenalty = item.lastAskedAt ? 0 : 40;
      const difficultyBoost =
        item.difficulty === "difficult" ? 28 : item.difficulty === "intermediate" ? 12 : 0;
      return freshnessPenalty + difficultyBoost + item.wrong * 8 - item.correct * 2;
    }

    function formatPercent(value) {
      return `${Math.round(Number(value) || 0)}%`;
    }

    function formatSessionDuration(seconds) {
      const safeSeconds = Math.max(0, Math.round(Number(seconds) || 0));
      const minutes = Math.floor(safeSeconds / 60);
      const rest = safeSeconds % 60;
      return minutes ? `${minutes}m ${rest}s` : `${rest}s`;
    }

    function formatAnswerPace(seconds) {
      return `${formatSessionDuration(seconds)} / rep.`;
    }

    function getSessionAverageAnswerSeconds(session) {
      if (!session) {
        return 0;
      }

      return (
        Number(session.averageAnswerSeconds) ||
        getAverageAnswerSeconds(session.durationSeconds, session.total)
      );
    }

    function getLocalDateKey(value) {
      const date = value instanceof Date ? value : new Date(value || "");
      if (Number.isNaN(date.getTime())) {
        return "";
      }

      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    }

    function shiftDateKey(dateKey, offsetDays) {
      const [year, month, day] = dateKey.split("-").map((part) => Number(part));
      if (!year || !month || !day) {
        return "";
      }

      const date = new Date(year, month - 1, day);
      date.setDate(date.getDate() + offsetDays);
      return getLocalDateKey(date);
    }

    function getQuizDayStreakStats(sessions) {
      const dayKeys = [
        ...new Set(
          sessions
            .map((session) => getLocalDateKey(session.finishedAt))
            .filter(Boolean)
        ),
      ].sort((left, right) => right.localeCompare(left));

      if (!dayKeys.length) {
        return {
          current: 0,
          best: 0,
        };
      }

      let current = 1;
      let expectedPrevious = shiftDateKey(dayKeys[0], -1);
      for (let index = 1; index < dayKeys.length; index += 1) {
        if (dayKeys[index] !== expectedPrevious) {
          break;
        }
        current += 1;
        expectedPrevious = shiftDateKey(dayKeys[index], -1);
      }

      let best = 1;
      let running = 1;
      for (let index = 1; index < dayKeys.length; index += 1) {
        if (dayKeys[index] === shiftDateKey(dayKeys[index - 1], -1)) {
          running += 1;
        } else {
          running = 1;
        }
        best = Math.max(best, running);
      }

      return {
        current,
        best,
      };
    }

    function renderQuizDashboard() {
      if (!context.elements.quizDashboard) {
        return;
      }
      renderQuizViewMode();

      const allQuestions = collectQuestionInventory(context.state.notes);
      const scope = context.elements.quizScope?.value || "all";
      const focus = normalizeQuizFocus(context.elements.quizMode?.value);
      const scopedQuestions = collectQuestionInventory(getDashboardNotes()).filter((item) => {
        if (focus === "mixed") {
          return true;
        }
        if (focus === "priority") {
          return item.priority;
        }
        if (focus === "new") {
          return item.asked === 0;
        }
        return item.difficulty === focus;
      });

      const totalAsked = allQuestions.reduce((sum, item) => sum + item.asked, 0);
      const totalCorrect = allQuestions.reduce((sum, item) => sum + item.correct, 0);
      const globalSuccess = totalAsked ? Math.round((totalCorrect / totalAsked) * 100) : 0;
      const sessions = getQuizSessions();
      const sessionCount = sessions.length;
      const sessionAverage = sessionCount
        ? Math.round(
            sessions.reduce((sum, session) => sum + (session.correct / session.total) * 100, 0) /
              sessionCount
          )
        : globalSuccess;
      const bestSession = sessions.reduce(
        (best, session) => Math.max(best, Math.round((session.correct / session.total) * 100)),
        0
      );
      const totalSessionAnswers = sessions.reduce((sum, session) => sum + (Number(session.total) || 0), 0);
      const totalSessionDuration = sessions.reduce(
        (sum, session) => sum + (Number(session.durationSeconds) || 0),
        0
      );
      const averageAnswerSeconds = getAverageAnswerSeconds(totalSessionDuration, totalSessionAnswers);
      const streakStats = getQuizDayStreakStats(sessions);
      const streakMeterScore = Math.min(streakStats.current * 20, 100);
      const perfectSessions = sessions.filter((session) => session.correct === session.total).length;

      const distribution = {
        new: allQuestions.filter((item) => item.asked === 0).length,
        difficult: allQuestions.filter((item) => item.asked > 0 && item.difficulty === "difficult").length,
        intermediate: allQuestions.filter((item) => item.difficulty === "intermediate").length,
        easy: allQuestions.filter((item) => item.difficulty === "easy").length,
      };
      const priorityCount = allQuestions.filter((item) => item.priority).length;
      const notesWithQuestions = context.state.notes.filter(
        (note) => Array.isArray(note.quizQuestions) && note.quizQuestions.length
      ).length;
      const recentSession = sessions[0] || null;
      const weakQuestions = [...scopedQuestions]
        .sort((left, right) => getQuestionSortScore(right) - getQuestionSortScore(left))
        .slice(0, 5);
      const masteredQuestions = [...allQuestions]
        .filter((item) => item.asked >= 5 && item.successRate >= 70)
        .sort((left, right) => right.successRate - left.successRate || right.asked - left.asked)
        .slice(0, 4);
      const drilldown = getStatsDrilldown(allQuestions, context.state.quizStatsDrilldown);

      if (drilldown) {
        context.elements.quizDashboard.innerHTML = `
          <div class="quiz-drilldown-head">
            <div>
              <span class="quiz-game-kicker">Categorie</span>
              <h2>${escapeHtml(drilldown.title)}</h2>
              <p>${drilldown.items.length} question(s) dans cette categorie.</p>
            </div>
            ${renderAsterMascot("drilldown")}
          </div>
          <div class="quiz-drilldown-list">
            ${renderQuestionRankList(drilldown.items, "Aucune question dans cette categorie.")}
          </div>
        `;
        return;
      }

      context.elements.quizDashboard.innerHTML = `
        <div class="quiz-command-hero">
          <div>
            <p class="quiz-game-kicker">Revision active</p>
            <h2>Tableau de bord quiz</h2>
            <p>${escapeHtml(scopedQuestions.length)} question(s) dans la selection ${escapeHtml(
              getQuizScopeLabel(scope).toLowerCase()
            )} - ${escapeHtml(getQuizFocusLabel(focus).toLowerCase())}.</p>
          </div>
          <div class="quiz-hero-side">
            ${renderAsterMascot("hero")}
            <div class="quiz-hero-meter" style="--score:${globalSuccess}%;" aria-hidden="true">
              <span>${formatPercent(globalSuccess)}</span>
            </div>
          </div>
        </div>

        <div class="quiz-stat-grid">
          ${renderQuizStatCard("Quiz joues", sessionCount, "Historique joueur")}
          ${renderQuizStatCard("Reussite", formatPercent(globalSuccess), `${totalCorrect}/${totalAsked || 0} reponses`)}
          ${renderQuizStatCard("Temps / rep.", averageAnswerSeconds ? formatAnswerPace(averageAnswerSeconds) : "-", `${totalSessionAnswers} reponse(s) chronometree(s)`)}
          ${renderQuizStatCard("Serie", `${streakStats.current}j`, `Record ${streakStats.best}j`)}
          ${renderQuizStatCard("Questions", allQuestions.length, `${notesWithQuestions} page(s) source`)}
          ${renderQuizStatCard("Obligatoires", priorityCount, "A revoir en priorite")}
          ${renderQuizStatCard("Temps total", totalSessionDuration ? formatSessionDuration(totalSessionDuration) : "-", "Temps passe en quiz")}
          ${renderQuizStatCard("Sans faute", perfectSessions, "Quiz termines a 100%")}
        </div>

        <div class="quiz-mastery-board">
          <article class="quiz-mastery-panel">
            <div class="quiz-panel-title">
              <span class="quiz-game-kicker">Classement</span>
              <h3>Maitrise des questions</h3>
            </div>
            <div class="quiz-rank-bars">
              ${renderDifficultyBar("Jamais vues", distribution.new, allQuestions.length, "new")}
              ${renderDifficultyBar("Difficiles", distribution.difficult, allQuestions.length, "difficult")}
              ${renderDifficultyBar("Intermediaires", distribution.intermediate, allQuestions.length, "intermediate")}
              ${renderDifficultyBar("Maitrisees", distribution.easy, allQuestions.length, "easy")}
            </div>
          </article>

          <article class="quiz-player-panel">
            <div class="quiz-panel-title-row">
              <div class="quiz-panel-title">
                <span class="quiz-game-kicker">Joueur</span>
                <h3>Rythme</h3>
              </div>
              ${renderAsterMascot("panel")}
            </div>
            <div class="quiz-player-score" style="--score:${streakMeterScore}%;">
              <strong>${streakStats.current}j</strong>
              <span>Serie actuelle</span>
            </div>
            <div class="quiz-mini-stats">
              <span>Moy. sessions <strong>${formatPercent(sessionAverage)}</strong></span>
              <span>Record <strong>${formatPercent(bestSession)}</strong></span>
              <span>Dernier <strong>${
                recentSession ? `${recentSession.correct}/${recentSession.total}` : "-"
              }</strong></span>
              <span>Temps <strong>${
                recentSession ? formatSessionDuration(recentSession.durationSeconds) : "-"
              }</strong></span>
              <span>Temps / rep. <strong>${
                recentSession ? formatAnswerPace(getSessionAverageAnswerSeconds(recentSession)) : "-"
              }</strong></span>
              <span>Serie <strong>${streakStats.current}j</strong></span>
            </div>
          </article>
        </div>

        <div class="quiz-question-lanes">
          <article class="quiz-lane">
            <div class="quiz-panel-title">
              <span class="quiz-game-kicker">File active</span>
              <h3>Questions a attaquer</h3>
            </div>
            <div class="quiz-question-rank">
              ${renderQuestionRankList(weakQuestions, "Aucune question prioritaire dans cette selection.")}
            </div>
          </article>
          <article class="quiz-lane">
            <div class="quiz-panel-title">
              <span class="quiz-game-kicker">Victoires</span>
              <h3>Questions solides</h3>
            </div>
            <div class="quiz-question-rank">
              ${renderQuestionRankList(masteredQuestions, "Pas encore de question vraiment maitrisee.")}
            </div>
          </article>
        </div>
      `;

      context.mascot?.sync();
    }

    function getStatsDrilldown(questions, category) {
      const config = {
        new: {
          title: "Questions jamais vues",
          filter: (item) => item.asked === 0,
          tone: "new",
          label: "Jamais vue",
        },
        difficult: {
          title: "Questions difficiles",
          filter: (item) => item.asked > 0 && item.difficulty === "difficult",
          tone: "difficult",
          label: "Difficile",
        },
        intermediate: {
          title: "Questions intermediaires",
          filter: (item) => item.difficulty === "intermediate",
          tone: "intermediate",
          label: "Intermediaire",
        },
        easy: {
          title: "Questions maitrisees",
          filter: (item) => item.difficulty === "easy",
          tone: "easy",
          label: "Maitrisee",
        },
      }[category];

      if (!config) {
        return null;
      }

      return {
        title: config.title,
        items: questions
          .filter(config.filter)
          .sort((left, right) => getQuestionSortScore(right) - getQuestionSortScore(left))
          .map((item) => ({
            ...item,
            displayDifficulty: config.label,
            displayTone: config.tone,
          })),
      };
    }

    function renderQuizStatCard(label, value, hint) {
      return `
        <article class="quiz-stat-card">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(String(value))}</strong>
          <small>${escapeHtml(hint)}</small>
        </article>
      `;
    }

    function renderDifficultyBar(label, value, total, tone) {
      const percent = total ? Math.round((value / total) * 100) : 0;
      return `
        <button type="button" class="quiz-rank-bar quiz-rank-${tone}" data-quiz-stat-category="${tone}">
          <div>
            <span>${escapeHtml(label)}</span>
            <strong>${value}</strong>
          </div>
          <div class="quiz-rank-track"><span style="width:${percent}%"></span></div>
        </button>
      `;
    }

    function renderQuestionRankList(items, emptyMessage) {
      if (!items.length) {
        return `<p class="quiz-empty-copy">${escapeHtml(emptyMessage)}</p>`;
      }

      return items
        .map(
          (item) => `
            <button type="button" class="quiz-rank-item" data-open-quiz-note="${escapeHtml(item.noteId)}">
              <span class="quiz-rank-badge quiz-rank-badge-${escapeHtml(item.displayTone || item.difficulty)}">
                ${escapeHtml(item.displayDifficulty || item.difficultyLabel)}
              </span>
              <strong>${escapeHtml(item.question)}</strong>
              <small>${escapeHtml(item.noteTitle)} - ${item.correct}/${item.asked || 0} juste(s) - ${formatPercent(
                item.successRate
              )}</small>
            </button>
          `
        )
        .join("");
    }

    function renderQuizCard({ force = false } = {}) {
      const focusedAnswer = document.activeElement?.closest?.("[data-quiz-session-answer]");
      if (!force && focusedAnswer && context.elements.quizCard?.contains(focusedAnswer)) {
        return;
      }

      renderQuizViewMode();
      const total = context.state.quiz.questions.length;
      const hasSession = total > 0;

      context.elements.quizPanel?.classList.toggle("is-running", hasSession);
      context.elements.quizControls?.classList.toggle("is-hidden", hasSession);

      if (!hasSession) {
        context.elements.quizTitle.textContent = "Aucun quiz cree";
        context.elements.quizProgress.textContent = "0 / 0";
        context.elements.quizCard.className = "quiz-card quiz-session-card quiz-session-empty";
        context.elements.quizCard.innerHTML = `
          <div class="quiz-session-hero quiz-session-hero-empty">
            <div>
              <span class="quiz-game-kicker">Questions ecrites</span>
              <h4>Creer des questions sur une note.</h4>
            </div>
            ${renderAsterMascot("session")}
          </div>
        `;
        context.elements.quizSummary.textContent = "Le quiz pioche des questions deja enregistrees.";
        return;
      }

      const validatedCount = context.state.quiz.questions.filter((item) => item.validated).length;
      const score = syncQuizScore();
      const correctCount = score.correct;
      const wrongCount = score.wrong;
      const contestedCount = score.contested;
      const scoredTotal = score.total;
      const percent = scoredTotal ? Math.round((correctCount / scoredTotal) * 100) : 0;
      const completed = validatedCount >= total;
      const duration = getSessionDuration(context.state.quiz.startedAt, context.state.quiz.finishedAt);
      const durationSeconds = context.state.quiz.finishedAt
        ? getSessionDurationSeconds(context.state.quiz.startedAt, context.state.quiz.finishedAt)
        : 0;
      const answerPace = getAverageAnswerSeconds(durationSeconds, scoredTotal);

      context.elements.quizTitle.textContent = "Quiz";
      context.elements.quizProgress.textContent = `${validatedCount} / ${total}`;
      context.elements.quizCard.className = `quiz-card quiz-session-card${
        completed ? " quiz-session-complete" : ""
      }`;
      context.elements.quizCard.innerHTML = `
        <div class="quiz-session-header">
          <div class="quiz-session-headline">
            ${renderAsterMascot(completed ? "result" : "session")}
            <div>
              <span class="quiz-game-kicker">Quiz ecrit</span>
              <h4>${completed ? "Termine" : "Repondez puis validez"}</h4>
            </div>
          </div>
          <div class="quiz-session-score">
            <strong>${correctCount}/${scoredTotal}</strong>
            <span>${percent}% de reussite</span>
          </div>
        </div>
        ${
          completed
            ? `<button type="button" class="button button-primary quiz-floating-action" data-quiz-restart>
                Terminer
              </button>`
            : `<div class="quiz-session-actions">
                <button type="button" class="button button-primary quiz-floating-action" data-quiz-validate-all>
                  Valider le quiz
                </button>
                <button type="button" class="button button-ghost" data-quiz-cancel>
                  Annuler le quizz
                </button>
              </div>`
        }
        <div class="quiz-session-hud">
          <span class="quiz-score-pill">Validees <strong>${validatedCount}</strong></span>
          <span class="quiz-score-pill">Justes <strong>${correctCount}</strong></span>
          <span class="quiz-score-pill">Fausses <strong>${wrongCount}</strong></span>
          <span class="quiz-score-pill">Contestees <strong>${contestedCount}</strong></span>
          <span class="quiz-score-pill">Temps <strong data-quiz-duration>${duration}</strong></span>
          ${
            completed
              ? `<span class="quiz-score-pill">Temps / rep. <strong>${formatAnswerPace(answerPace)}</strong></span>`
              : ""
          }
        </div>
        <div class="quiz-session-shell">
          <div class="quiz-session-list">
            ${renderQuizSessionRows(context.state.quiz.questions)}
          </div>
        </div>
      `;

      context.elements.quizSummary.innerHTML = completed
        ? renderQuizCompletionSummary(correctCount, scoredTotal, context.state.quiz.questions)
        : renderQuizProgressSummary(context.state.quiz.questions);

      context.mascot?.sync();
    }

    function renderQuizSessionRows(questions) {
      const completed = Boolean(context.state.quiz.finishedAt);
      const shouldAnimateReveal = completed && Boolean(context.state.quiz.revealPending);

      return questions
        .map((question, index) => {
          const rowClass = question.contested
            ? "is-contested"
            : question.validated
            ? question.isCorrect
              ? "is-correct"
              : "is-wrong"
            : "";

          return `
            <article class="quiz-session-item ${rowClass}${shouldAnimateReveal ? " quiz-reveal-state" : ""}" style="--quiz-reveal-delay: ${360 + index * 440}ms;">
              <div class="quiz-question-cell">
                <span class="quiz-question-index">Question ${index + 1}</span>
                <strong>${escapeHtml(question.question)}</strong>
                ${
                  completed
                    ? `<button type="button" class="quiz-note-link${
                        shouldAnimateReveal ? " quiz-reveal-note" : ""
                      }" style="${
                        shouldAnimateReveal ? `--quiz-reveal-delay: ${500 + index * 440}ms;` : ""
                      }" data-open-quiz-note="${escapeHtml(
                        question.noteId
                      )}">${escapeHtml(question.noteTitle)}</button>`
                    : ""
                }
              </div>
              <div class="quiz-answer-cell">
                <input
                  class="text-input quiz-session-answer"
                  id="quiz-session-answer-${index}"
                  type="text"
                  data-quiz-session-answer="${index}"
                  value="${escapeHtml(question.userAnswer || "")}"
                  placeholder="Tapez votre reponse"
                  aria-label="Reponse a la question ${index + 1}"
                  inputmode="text"
                  autocomplete="off"
                  autocorrect="off"
                  autocapitalize="sentences"
                  enterkeyhint="done"
                  spellcheck="false"
                  ${completed ? "disabled" : ""}
                />
                ${
                  completed
                    ? `<div class="quiz-answer-feedback ${
                        question.contested ? "is-contested" : question.isCorrect ? "is-correct" : "is-wrong"
                      }${shouldAnimateReveal ? " quiz-reveal-feedback" : ""}" style="${
                        shouldAnimateReveal ? `--quiz-reveal-delay: ${560 + index * 440}ms;` : ""
                      }">
                          <span>${
                            question.contested
                              ? "Question contestee"
                              : question.isCorrect
                                ? "Bonne reponse"
                                : "Reponse attendue"
                          }</span>
                          <strong>${escapeHtml(
                            question.matchedAnswer || question.acceptedAnswers.join(", ")
                          )}</strong>
                          ${
                            question.contested
                              ? `<small>Cette question ne compte plus dans le score ni dans les stats.</small>
                                ${
                                  question.contestedAnswerAccepted
                                    ? `<small>Reponse ajoutee aux reponses acceptees.</small>`
                                    : String(question.userAnswer || "").trim()
                                      ? `<button type="button" class="quiz-contest-button" data-quiz-accept-contested="${index}">
                                          Accepter ma reponse
                                        </button>`
                                      : ""
                                }`
                              : `<button type="button" class="quiz-contest-button" data-quiz-contest="${index}">
                                  Contester
                                </button>`
                          }
                       </div>`
                    : ""
                }
              </div>
            </article>
          `;
        })
        .join("");
    }

    function renderQuizProgressSummary(questions) {
      const remaining = questions.filter((item) => !item.validated).length;

      return `
        <p class="quiz-summary-line">
          ${remaining} question(s) a renseigner. Cliquez sur <strong>Valider le quiz</strong> quand vous avez termine.
        </p>
      `;
    }

    function renderQuizCompletionSummary(correctCount, total, questions) {
      const countedQuestions = questions.filter((item) => !item.contested);
      const hard = countedQuestions.filter((item) => item.difficulty === "difficult").length;
      const intermediate = countedQuestions.filter((item) => item.difficulty === "intermediate").length;
      const easy = countedQuestions.filter((item) => item.difficulty === "easy").length;
      const contested = questions.filter((item) => item.contested).length;
      const durationSeconds = getSessionDurationSeconds(
        context.state.quiz.startedAt,
        context.state.quiz.finishedAt
      );
      const answerPace = getAverageAnswerSeconds(durationSeconds, total);
      const wrongRows = questions.filter((item) => item.validated && !item.isCorrect && !item.contested);

      return `
        <p class="quiz-summary-line">
          Score final : <strong>${correctCount}/${total}</strong>. Temps : <strong>${formatSessionDuration(
            durationSeconds
          )}</strong>. Moyenne : <strong>${formatAnswerPace(
            answerPace
          )}</strong>. Repartition : ${hard} difficiles, ${intermediate} intermediaires, ${easy} faciles${contested ? `, ${contested} contestee(s)` : ""}.
        </p>
        ${
          wrongRows.length
            ? `<div class="quiz-summary-corrections">
                ${wrongRows
                  .map(
                    (item) => `
                      <article class="quiz-correction-card">
                        <strong>${escapeHtml(item.question)}</strong>
                        <p>Votre reponse : ${escapeHtml(item.userAnswer || "Aucune")}</p>
                        <p>Reponse attendue : ${escapeHtml(item.matchedAnswer || item.acceptedAnswers.join(", "))}</p>
                      </article>
                    `
                  )
                  .join("")}
              </div>`
            : `<p class="quiz-summary-line">Toutes les reponses ont été validées.</p>`
        }
      `;
    }

    return {
      acceptContestedAnswer,
      buildQuizSession,
      contestQuizQuestion,
      resetQuizSession,
      renderQuizDashboard,
      renderQuizCard,
      renderQuizViewMode,
      setQuizView,
      setQuizAnswer,
      validateQuizSession,
      startQuizTimer,
      stopQuizTimer,
    };
  };
})(window);
