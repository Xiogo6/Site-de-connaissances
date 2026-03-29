(function initializeQuizModule(global) {
  const AtlasApp = (global.AtlasApp = global.AtlasApp || {});

  AtlasApp.createQuizModule = function createQuizModule(context) {
    const { escapeHtml, extractLinks, shuffle } = AtlasApp.helpers;
  function buildQuizSession() {
    const available = generateQuizQuestions(getQuizNotes(), context.elements.quizMode.value);
    const amount = context.helpers.clamp(Number(context.elements.quizAmount.value) || 6, 3, 20);
    const picked = shuffle(available).slice(0, amount);
    context.state.quiz = {
      questions: picked,
      index: 0,
      score: 0,
      answerVisible: false,
    };
    renderQuizCard();
  }

  function showQuizAnswer() {
    if (!context.state.quiz.questions.length || context.state.quiz.index >= context.state.quiz.questions.length) {
      return;
    }

    context.state.quiz.answerVisible = true;
    renderQuizCard();
  }

  function scoreQuiz(isCorrect) {
    if (!context.state.quiz.questions.length || context.state.quiz.index >= context.state.quiz.questions.length) {
      return;
    }

    const current = context.state.quiz.questions[context.state.quiz.index];
    if (isCorrect) {
      context.state.quiz.score += 1;
    }

    if (current?.noteId) {
      context.data.updateReviewState(current.noteId, isCorrect);
    }

    context.state.quiz.index += 1;
    context.state.quiz.answerVisible = false;
    context.data.saveNotes();
    context.renderers.renderStats();
    context.renderers.renderDueReviewList();
    renderQuizCard();
  }

  function renderQuizCard() {
    const total = context.state.quiz.questions.length;

    if (!total) {
      context.elements.quizTitle.textContent = "Aucun quiz lance";
      context.elements.quizProgress.textContent = "0 / 0";
      context.elements.quizCard.className = "quiz-card empty-state";
      context.elements.quizCard.textContent =
        "Le quiz apparaitra ici a partir de vos connaissances.";
      context.elements.quizSummary.textContent =
        'Ajoutez des definitions, des relations ou des listes pour produire plus de questions.';
      return;
    }

    if (context.state.quiz.index >= total) {
      context.elements.quizTitle.textContent = "Session terminee";
      context.elements.quizProgress.textContent = `${total} / ${total}`;
      context.elements.quizCard.className = "quiz-card";
      context.elements.quizCard.innerHTML = `
        <h4>Score final : ${context.state.quiz.score} / ${total}</h4>
        <p>Relancez un quiz pour continuer la revision active.</p>
      `;
      context.elements.quizSummary.textContent =
        'Conseil : les paires "Concept : definition" donnent les meilleures questions.';
      return;
    }

    const current = context.state.quiz.questions[context.state.quiz.index];
    context.elements.quizTitle.textContent = "Quiz de revision";
    context.elements.quizProgress.textContent = `${context.state.quiz.index + 1} / ${total}`;
    context.elements.quizCard.className = "quiz-card";
    context.elements.quizCard.innerHTML = `
      <h4>${escapeHtml(current.question)}</h4>
      <p><strong>Source :</strong> ${escapeHtml(current.source)}</p>
      <p><strong>Mode :</strong> ${escapeHtml(current.modeLabel)}</p>
      ${
        current.choices.length
          ? `<div class="chip-list">${current.choices
              .map((choice) => `<span class="pill pill-soft">${escapeHtml(choice)}</span>`)
              .join("")}</div>`
          : "<p>Essayez de repondre sans regarder la reponse.</p>"
      }
      ${
        context.state.quiz.answerVisible
          ? `<p><strong>Reponse :</strong> ${escapeHtml(current.answer)}</p>`
          : '<p>Utilisez "Voir la reponse" apres avoir tente un rappel actif.</p>'
      }
    `;
    context.elements.quizSummary.textContent = context.state.quiz.answerVisible
      ? "Indiquez ensuite si vous connaissiez la reponse."
      : "Repondez mentalement avant de reveler la reponse.";
  }

  function getQuizNotes() {
    const scope = context.elements.quizScope.value;
    const active = context.notes.getActiveNote();

    if (scope === "current") {
      return active ? [active] : [];
    }

    if (scope === "tag") {
      const tag = context.elements.quizTag.value.trim().toLowerCase();
      return context.state.notes.filter((note) =>
        note.tags.some((candidate) => candidate.toLowerCase() === tag)
      );
    }

    if (scope === "due") {
      return context.notes.getDueNotes();
    }

    return context.state.notes;
  }

  function generateQuizQuestions(notes, mode = "mixed") {
    const questions = [];
    const titlePool = notes.map((note) => note.title);
    const answerPool = buildAnswerPool(notes);

    notes.forEach((note) => {
      const lines = note.content
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

      lines.forEach((line) => {
        if (line.startsWith("#")) {
          return;
        }

        if (line.includes(" : ")) {
          const [concept, ...rest] = line.split(" : ");
          const answer = rest.join(" : ").trim();
          if (concept && answer && (mode === "mixed" || mode === "definition")) {
            questions.push({
              noteId: note.id,
              source: note.title,
              question: `Que signifie "${concept.trim()}" ?`,
              answer,
              choices: buildChoices(answer, answerPool),
              mode: "definition",
              modeLabel: "Definition",
            });
          }
        }

        if (line.startsWith("- ")) {
          const statement = line.slice(2).trim();
          const words = statement.split(" ");
          if (words.length > 3 && (mode === "mixed" || mode === "bullet")) {
            const hidden = words[0];
            questions.push({
              noteId: note.id,
              source: note.title,
              question: `Completez : ${statement.replace(hidden, "...")}`,
              answer: statement,
              choices: buildChoices(statement, answerPool),
              mode: "bullet",
              modeLabel: "Phrase a completer",
            });
          }
        }

        const relation = line.match(/^(.+?) est (.+)$/i);
        if (relation && (mode === "mixed" || mode === "definition")) {
          questions.push({
            noteId: note.id,
            source: note.title,
            question: `Qu'est-ce que "${relation[1].trim()}" ?`,
            answer: relation[2].trim(),
            choices: buildChoices(relation[2].trim(), answerPool),
            mode: "definition",
            modeLabel: "Definition",
          });
        }
      });

      if (mode === "mixed" || mode === "link") {
        [...new Set(extractLinks(note.content))].forEach((linkedTitle) => {
          questions.push({
            noteId: note.id,
            source: note.title,
            question: `Quelle page est liee depuis "${note.title}" ?`,
            answer: linkedTitle,
            choices: buildChoices(linkedTitle, titlePool),
            mode: "link",
            modeLabel: "Lien",
          });
        });
      }
    });

    return deduplicateQuestions(questions);
  }

  function buildChoices(answer, titlePool) {
    const others = shuffle(
      titlePool.filter((title) => title.toLowerCase() !== answer.toLowerCase())
    ).slice(0, 3);
    return shuffle([answer, ...others]);
  }

  function buildAnswerPool(notes) {
    const values = [];

    notes.forEach((note) => {
      values.push(note.title);
      note.content
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .forEach((line) => {
          if (line.includes(" : ")) {
            const [, ...rest] = line.split(" : ");
            const answer = rest.join(" : ").trim();
            if (answer) {
              values.push(answer);
            }
          }

          if (line.startsWith("- ")) {
            values.push(line.slice(2).trim());
          }

          const relation = line.match(/^(.+?) est (.+)$/i);
          if (relation) {
            values.push(relation[2].trim());
          }
        });
    });

    return [...new Set(values.filter(Boolean))];
  }

  function deduplicateQuestions(questions) {
    const seen = new Set();
    return questions.filter((item) => {
      const key = `${item.source}|${item.question}|${item.answer}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  return {
    buildQuizSession,
    generateQuizQuestions,
    renderQuizCard,
    scoreQuiz,
    showQuizAnswer,
  };
  };
})(window);
