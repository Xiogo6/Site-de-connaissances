(function initializeQuizModule(global) {
  const AtlasApp = (global.AtlasApp = global.AtlasApp || {});

  AtlasApp.createQuizModule = function createQuizModule(context) {
    const { escapeHtml, shuffle } = AtlasApp.helpers;

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
      const availableNotes = getScopedNotes(
        context.elements.quizScope.value,
        context.elements.quizTag.value,
        context.elements.quizFolder.value
      ).filter((note) => Array.isArray(note.quizQuestions) && note.quizQuestions.length);

      const requestedAmount = context.helpers.clamp(Number(context.elements.quizAmount.value) || 6, 1, 50);
      const picked = pickQuizQuestionsForSession(availableNotes, requestedAmount);

      context.state.quiz = {
        questions: picked,
        score: 0,
        validatedCount: 0,
        startedAt: Date.now(),
        finishedAt: null,
        requestedAmount,
      };

      context.renderers.renderTabs();
      renderQuizCard();
    }

    function resetQuizSession() {
      context.state.quiz = {
        questions: [],
        score: 0,
        validatedCount: 0,
        startedAt: null,
        finishedAt: null,
        requestedAmount: Number(context.elements.quizAmount.value) || 6,
      };

      renderQuizCard();
    }

    function pickQuizQuestionsForSession(notes, requestedAmount) {
      if (!notes.length || requestedAmount <= 0) {
        return [];
      }

      const noteCandidates = notes
        .map((note) => {
          const question = pickQuestionForNote(note.quizQuestions || []);
          if (!question) {
            return null;
          }

          return buildSessionQuestion(note, question);
        })
        .filter(Boolean);

      if (!noteCandidates.length) {
        return [];
      }

      const quotas = computeDifficultyQuotas(requestedAmount);
      const pools = {
        difficult: [],
        intermediate: [],
        easy: [],
      };

      noteCandidates.forEach((candidate) => {
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
        const remainder = noteCandidates.filter((item) => !usedKeys.has(item.sessionKey));
        pickFromPool(remainder, requestedAmount - selected.length, usedKeys).forEach((item) =>
          selected.push(item)
        );
      }

      return shuffle(selected).slice(0, requestedAmount);
    }

    function pickQuestionForNote(questions) {
      const pool = (questions || [])
        .map((question, index) => normalizeQuizQuestion(question, index))
        .filter(Boolean);

      if (!pool.length) {
        return null;
      }

      return weightedPick(pool, (item) => questionWeight(item));
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

    function computeDifficultyQuotas(amount) {
      const easy = Math.round(amount * 0.2);
      const intermediate = Math.round(amount * 0.4);
      const difficult = Math.max(amount - easy - intermediate, 0);

      return {
        difficult,
        intermediate,
        easy,
      };
    }

    function questionWeight(question) {
      const asked = Number(question.stats?.asked) || 0;
      const baseWeight = 1 / (asked + 1);
      const freshness = question.stats?.lastAskedAt ? 0.15 : 0.35;
      return baseWeight + freshness;
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
        const selected = weightedPick(available, (item) => 1 / ((item.statsBefore?.asked || 0) + 1));
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

    function setQuizAnswer(index, value) {
      const question = context.state.quiz.questions[index];
      if (!question || question.validated) {
        return;
      }

      question.userAnswer = value;
    }

    function validateQuizQuestion(index) {
      const question = context.state.quiz.questions[index];
      if (!question || question.validated) {
        return;
      }

      const userAnswer = String(question.userAnswer || "").trim();
      const matchedAnswer = findMatchingAcceptedAnswer(userAnswer, question.acceptedAnswers);
      const isCorrect = Boolean(matchedAnswer);
      const now = new Date().toISOString();

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
        context.state.editorQuizQuestionsNoteId = note.id;
      }

      question.statsAfter = storedQuestion ? { ...storedQuestion.stats } : null;
      context.state.quiz.validatedCount = context.state.quiz.questions.filter(
        (item) => item.validated
      ).length;
      context.state.quiz.score = context.state.quiz.questions.filter(
        (item) => item.validated && item.isCorrect
      ).length;
      if (context.state.quiz.validatedCount >= context.state.quiz.questions.length) {
        context.state.quiz.finishedAt = Date.now();
      }

      if (context.state.editorQuizQuestionsNoteId === note?.id) {
        context.state.editorQuizQuestions = (context.state.editorQuizQuestions || []).map(
          (draftQuestion) =>
            draftQuestion.id === question.questionId
              ? {
                  ...draftQuestion,
                  stats: storedQuestion ? { ...storedQuestion.stats } : draftQuestion.stats,
                }
              : draftQuestion
        );
      }

      context.data.saveNotes();
      renderQuizCard();
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

    function renderQuizCard() {
      const total = context.state.quiz.questions.length;
      const hasSession = total > 0;

      context.elements.quizPanel?.classList.toggle("is-running", hasSession);
      context.elements.quizControls?.classList.toggle("is-hidden", hasSession);

      if (!hasSession) {
        context.elements.quizTitle.textContent = "Aucun quiz cree";
        context.elements.quizProgress.textContent = "0 / 0";
        context.elements.quizCard.className = "quiz-card quiz-session-card quiz-session-empty";
        context.elements.quizCard.innerHTML = `
          <div class="quiz-session-hero">
            <span class="quiz-game-kicker">Questions ecrites</span>
            <h4>Creer des questions sur une note.</h4>
          </div>
        `;
        context.elements.quizSummary.textContent = "Le quiz pioche des questions deja enregistrees.";
        return;
      }

      const validatedCount = context.state.quiz.questions.filter((item) => item.validated).length;
      const correctCount = context.state.quiz.questions.filter(
        (item) => item.validated && item.isCorrect
      ).length;
      const wrongCount = validatedCount - correctCount;
      const percent = Math.round((correctCount / total) * 100);
      const completed = validatedCount >= total;
      const duration = getSessionDuration(context.state.quiz.startedAt, context.state.quiz.finishedAt);

      context.elements.quizTitle.textContent = "Quiz";
      context.elements.quizProgress.textContent = `${validatedCount} / ${total}`;
      context.elements.quizCard.className = `quiz-card quiz-session-card${
        completed ? " quiz-session-complete" : ""
      }`;
      context.elements.quizCard.innerHTML = `
        <div class="quiz-session-header">
          <div>
            <span class="quiz-game-kicker">Quiz ecrit</span>
            <h4>${completed ? "Termine" : "Repondez ligne par ligne"}</h4>
          </div>
          <div class="quiz-session-score">
            <strong>${correctCount}/${total}</strong>
            <span>${percent}% de reussite</span>
          </div>
        </div>
        ${
          completed
            ? `<div class="quiz-session-actions">
                <button type="button" class="button button-primary" data-quiz-restart>
                  Nouveau quiz
                </button>
              </div>`
            : ""
        }
        <div class="quiz-session-hud">
          <span class="quiz-score-pill">Validees <strong>${validatedCount}</strong></span>
          <span class="quiz-score-pill">Justes <strong>${correctCount}</strong></span>
          <span class="quiz-score-pill">Fausses <strong>${wrongCount}</strong></span>
          <span class="quiz-score-pill">Temps <strong>${duration}</strong></span>
        </div>
        <div class="table-shell quiz-session-shell">
          <table class="data-table quiz-session-table">
            <colgroup>
              <col style="width: 56%" />
              <col style="width: 44%" />
            </colgroup>
            <thead>
              <tr>
                <th>Question</th>
                <th>Reponse</th>
              </tr>
            </thead>
            <tbody>
              ${renderQuizSessionRows(context.state.quiz.questions)}
            </tbody>
          </table>
        </div>
      `;

      context.elements.quizSummary.innerHTML = completed
        ? renderQuizCompletionSummary(correctCount, total, context.state.quiz.questions)
        : renderQuizProgressSummary(context.state.quiz.questions);
    }

    function renderQuizSessionRows(questions) {
      return questions
        .map((question, index) => {
          const rowClass = question.validated
            ? question.isCorrect
              ? "is-correct"
              : "is-wrong"
            : "";

          return `
            <tr class="${rowClass}">
              <td>
                <div class="quiz-question-cell">
                  <strong>${escapeHtml(question.question)}</strong>
                  <span>${escapeHtml(question.noteTitle)}</span>
                </div>
              </td>
              <td>
                <div class="quiz-answer-cell">
                  <div class="quiz-answer-row">
                    <input
                      class="text-input quiz-session-answer"
                      type="text"
                      data-quiz-session-answer="${index}"
                      value="${escapeHtml(question.userAnswer || "")}" 
                      placeholder="Tapez votre reponse"
                      ${question.validated ? "disabled" : ""}
                    />
                    <button
                      type="button"
                      class="quiz-session-validate-inline"
                      data-quiz-session-validate="${index}"
                      aria-label="Valider la reponse"
                      ${question.validated ? "disabled" : ""}
                    >
                      ✓
                    </button>
                  </div>
                </div>
              </td>
            </tr>
          `;
        })
        .join("");
    }
    function renderQuizProgressSummary(questions) {
      const remaining = questions.filter((item) => !item.validated).length;

      return `
        <p class="quiz-summary-line">
          ${remaining} question(s) restantes.
        </p>
      `;
    }

    function renderQuizCompletionSummary(correctCount, total, questions) {
      const hard = questions.filter((item) => item.difficulty === "difficult").length;
      const intermediate = questions.filter((item) => item.difficulty === "intermediate").length;
      const easy = questions.filter((item) => item.difficulty === "easy").length;
      const wrongRows = questions.filter((item) => item.validated && !item.isCorrect);

      return `
        <p class="quiz-summary-line">
          Score final : <strong>${correctCount}/${total}</strong>. Repartition : ${hard} difficiles, ${intermediate} intermédiaires, ${easy} faciles.
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
      buildQuizSession,
      resetQuizSession,
      renderQuizCard,
      setQuizAnswer,
      validateQuizQuestion,
    };
  };
})(window);
