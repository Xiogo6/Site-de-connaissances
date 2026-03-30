(function initializeQuizModule(global) {
  const AtlasApp = (global.AtlasApp = global.AtlasApp || {});

  AtlasApp.createQuizModule = function createQuizModule(context) {
    const { escapeHtml, extractLinks, shuffle } = AtlasApp.helpers;
  function getScopedNotes(scope, tagValue) {
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

    if (scope === "due") {
      return context.notes.getDueNotes();
    }

    return context.state.notes;
  }

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

  function buildFlashcardsSession() {
    const available = generateFlashcardCards(getFlashcardNotes(), {
      includeReversed: context.elements.flashcardReversed.checked,
    });
    const amount =
      context.helpers.clamp(Number(context.elements.flashcardAmount.value) || 8, 4, 30);
    const picked = shuffle(available).slice(0, amount);
    context.state.flashcards = {
      cards: picked,
      index: 0,
      answerVisible: false,
      noteCount: new Set(picked.map((card) => card.noteId)).size,
      tableCount: new Set(picked.map((card) => card.tableKey)).size,
    };
    renderFlashcards();
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

  function showFlashcardAnswer() {
    if (!context.state.flashcards.cards.length) {
      return;
    }

    context.state.flashcards.answerVisible = true;
    renderFlashcards();
  }

  function previousFlashcard() {
    if (!context.state.flashcards.cards.length) {
      return;
    }

    context.state.flashcards.index = Math.max(context.state.flashcards.index - 1, 0);
    context.state.flashcards.answerVisible = false;
    renderFlashcards();
  }

  function nextFlashcard() {
    if (!context.state.flashcards.cards.length) {
      return;
    }

    context.state.flashcards.index = Math.min(
      context.state.flashcards.index + 1,
      context.state.flashcards.cards.length - 1
    );
    context.state.flashcards.answerVisible = false;
    renderFlashcards();
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
    return getScopedNotes(context.elements.quizScope.value, context.elements.quizTag.value);
  }

  function getFlashcardNotes() {
    return getScopedNotes(
      context.elements.flashcardScope.value,
      context.elements.flashcardTag.value
    );
  }

  function generateFlashcardCards(notes, options = {}) {
    const cards = [];

    notes.forEach((note) => {
      cards.push(...extractFlashcardsFromTables(note, options));
    });

    return cards;
  }

  function extractFlashcardsFromTables(note, options = {}) {
    const lines = note.content.split("\n");
    const cards = [];

    for (let index = 0; index < lines.length - 1; index += 1) {
      if (!isMarkdownTableRow(lines[index]) || !isMarkdownTableDivider(lines[index + 1])) {
        continue;
      }

      const headerCells = splitMarkdownTableRow(lines[index]);
      const headerMap = buildFlashcardHeaderMap(headerCells);
      let rowIndex = 0;
      index += 2;

      while (index < lines.length && isMarkdownTableRow(lines[index])) {
        const cells = splitMarkdownTableRow(lines[index]);
        if (cells.some((cell) => cell)) {
          const row = mapFlashcardRow(headerMap, cells);
          const front = row.front || "";
          const back = row.back || "";
          const hint = row.hint || "";
          const example = row.example || "";
          const tags = parseFlashcardTags(row.tags || "");
          const reverseRequested =
            options.includeReversed || isTruthyFlashcardCell(row.reverse || "");

          if (front && back) {
            const tableKey = `${note.id}::${index - rowIndex}`;
            cards.push({
              noteId: note.id,
              source: note.title,
              front,
              back,
              hint,
              example,
              tags,
              direction: "direct",
              tableKey,
            });

            if (reverseRequested) {
              cards.push({
                noteId: note.id,
                source: note.title,
                front: back,
                back: front,
                hint: example,
                example: hint,
                tags,
                direction: "reverse",
                tableKey,
              });
            }
          }
        }

        rowIndex += 1;
        index += 1;
      }

      index -= 1;
    }

    return cards;
  }

  function isMarkdownTableRow(line) {
    const trimmed = line.trim();
    return trimmed.startsWith("|") && trimmed.endsWith("|") && trimmed.includes("|");
  }

  function isMarkdownTableDivider(line) {
    const trimmed = line.trim();
    return /^[\s|:-]+$/.test(trimmed) && trimmed.includes("-");
  }

  function splitMarkdownTableRow(line) {
    return line
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.trim());
  }

  function normalizeFlashcardHeader(value) {
    return String(value)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "");
  }

  function buildFlashcardHeaderMap(headers) {
    const aliases = {
      front: ["recto", "front", "question", "terme", "mot", "concept", "prompt"],
      back: ["verso", "back", "reponse", "answer", "definition", "explication"],
      hint: ["indice", "hint", "aide"],
      example: ["exemple", "example", "cas"],
      tags: ["tags", "tag"],
      reverse: ["inverse", "inversee", "reverse"],
    };

    return headers.map((header) => {
      const normalized = normalizeFlashcardHeader(header);
      const match = Object.entries(aliases).find(([, values]) => values.includes(normalized));
      return match?.[0] || "";
    });
  }

  function mapFlashcardRow(headerMap, cells) {
    return headerMap.reduce((result, key, index) => {
      if (key) {
        result[key] = cells[index] || "";
      }
      return result;
    }, {});
  }

  function parseFlashcardTags(value) {
    return value
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  function isTruthyFlashcardCell(value) {
    return ["oui", "yes", "true", "1", "x"].includes(String(value).trim().toLowerCase());
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

      if (note.metadata?.hasDate && (mode === "mixed" || mode === "date")) {
        questions.push(...generateDateQuestions(note, answerPool));
      }
    });

    return deduplicateQuestions(questions);
  }

  function generateDateQuestions(note, answerPool) {
    const metadata = note.metadata || {};
    const questions = [];

    if (metadata.dateMode === "reference" && metadata.singleDate) {
      const answer = formatDateAnswer(metadata.singleDate);
      questions.push({
        noteId: note.id,
        source: note.title,
        question: `Quelle est la date de reference de "${note.title}" ?`,
        answer,
        choices: buildChoices(answer, answerPool),
        mode: "date",
        modeLabel: "Date",
      });
    }

    if (metadata.dateMode === "life") {
      if (metadata.startDate) {
        const answer = formatDateAnswer(metadata.startDate);
        questions.push({
          noteId: note.id,
          source: note.title,
          question: `Quelle est la date de naissance de "${note.title}" ?`,
          answer,
          choices: buildChoices(answer, answerPool),
          mode: "date",
          modeLabel: "Date",
        });
      }

      if (metadata.endDate) {
        const answer = formatDateAnswer(metadata.endDate);
        questions.push({
          noteId: note.id,
          source: note.title,
          question: `Quelle est la date de deces de "${note.title}" ?`,
          answer,
          choices: buildChoices(answer, answerPool),
          mode: "date",
          modeLabel: "Date",
        });
      }
    }

    if (metadata.dateMode === "range") {
      if (metadata.startDate) {
        const answer = formatDateAnswer(metadata.startDate);
        questions.push({
          noteId: note.id,
          source: note.title,
          question: `Quand commence "${note.title}" ?`,
          answer,
          choices: buildChoices(answer, answerPool),
          mode: "date",
          modeLabel: "Date",
        });
      }

      if (metadata.endDate) {
        const answer = formatDateAnswer(metadata.endDate);
        questions.push({
          noteId: note.id,
          source: note.title,
          question: `Quand se termine "${note.title}" ?`,
          answer,
          choices: buildChoices(answer, answerPool),
          mode: "date",
          modeLabel: "Date",
        });
      }
    }

    return questions;
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

      if (note.metadata?.hasDate) {
        values.push(...extractDateAnswerPool(note.metadata));
      }
    });

    return [...new Set(values.filter(Boolean))];
  }

  function extractDateAnswerPool(metadata = {}) {
    const values = [];

    if (metadata.dateMode === "reference" && metadata.singleDate) {
      values.push(formatDateAnswer(metadata.singleDate));
    }

    if (metadata.dateMode === "life") {
      if (metadata.startDate) {
        values.push(formatDateAnswer(metadata.startDate));
      }
      if (metadata.endDate) {
        values.push(formatDateAnswer(metadata.endDate));
      }
    }

    if (metadata.dateMode === "range") {
      if (metadata.startDate) {
        values.push(formatDateAnswer(metadata.startDate));
      }
      if (metadata.endDate) {
        values.push(formatDateAnswer(metadata.endDate));
      }
    }

    return values;
  }

  function formatDateAnswer(value) {
    if (!value) {
      return "inconnue";
    }

    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(date);
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

  function renderFlashcards() {
    const total = context.state.flashcards.cards.length;

    if (!total) {
      context.elements.flashcardTitle.textContent = "Aucune pile lancee";
      context.elements.flashcardProgress.textContent = "0 / 0";
      context.elements.flashcardCard.className = "quiz-card empty-state";
      context.elements.flashcardCard.textContent =
        "Les cartes apparaitront ici a partir des tableaux markdown presents dans vos pages.";
      context.elements.flashcardSummary.textContent =
        "Creez un tableau Recto / Verso, puis relancez la generation.";
      context.elements.flashcardFlipButton.textContent = "Retourner";
      context.elements.flashcardFlipButton.disabled = true;
      context.elements.flashcardPrevButton.disabled = true;
      context.elements.flashcardNextButton.disabled = true;
      return;
    }

    const current = context.state.flashcards.cards[context.state.flashcards.index];
    const showAnswer = context.state.flashcards.answerVisible;
    context.elements.flashcardTitle.textContent = "Pile de revision";
    context.elements.flashcardProgress.textContent = `${context.state.flashcards.index + 1} / ${total}`;
    context.elements.flashcardCard.className = "quiz-card";
    context.elements.flashcardCard.innerHTML = `
      <div class="flashcard-surface${showAnswer ? " is-answer-visible" : ""}">
        <span class="pill pill-soft">${showAnswer ? "Verso" : "Recto"}</span>
        <h4 class="flashcard-face">${escapeHtml(showAnswer ? current.back : current.front)}</h4>
        ${
          !showAnswer && current.hint
            ? `<p class="flashcard-helper"><strong>Indice :</strong> ${escapeHtml(current.hint)}</p>`
            : ""
        }
        ${
          showAnswer && current.example
            ? `<p class="flashcard-helper"><strong>Exemple :</strong> ${escapeHtml(current.example)}</p>`
            : ""
        }
      </div>
      <div class="flashcard-meta">
        <span><strong>Source :</strong> ${escapeHtml(current.source)}</span>
        ${
          current.direction === "reverse"
            ? "<span><strong>Sens :</strong> Carte inversee</span>"
            : "<span><strong>Sens :</strong> Carte directe</span>"
        }
        ${
          current.tags.length
            ? `<span><strong>Tags :</strong> ${escapeHtml(current.tags.join(", "))}</span>`
            : ""
        }
      </div>
    `;
    const deckCopy = `${context.state.flashcards.tableCount} tableau(x) transforme(s) en ${total} carte(s).`;
    context.elements.flashcardSummary.textContent = showAnswer
      ? `${deckCopy} Passez a la suivante quand la reponse est stable.`
      : `${deckCopy} Essayez de rappeler le verso avant de retourner la carte.`;
    context.elements.flashcardFlipButton.disabled = false;
    context.elements.flashcardFlipButton.textContent = showAnswer ? "Voir le recto" : "Retourner";
    context.elements.flashcardPrevButton.disabled = context.state.flashcards.index === 0;
    context.elements.flashcardNextButton.disabled =
      context.state.flashcards.index >= total - 1;
  }

  return {
    buildFlashcardsSession,
    buildQuizSession,
    generateQuizQuestions,
    nextFlashcard,
    previousFlashcard,
    renderFlashcards,
    renderQuizCard,
    scoreQuiz,
    showFlashcardAnswer,
    showQuizAnswer,
  };
  };
})(window);
