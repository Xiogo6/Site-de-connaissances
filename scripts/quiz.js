(function initializeQuizModule(global) {
  const AtlasApp = (global.AtlasApp = global.AtlasApp || {});

  AtlasApp.createQuizModule = function createQuizModule(context) {
    const { escapeHtml, extractLinks, formatFlexibleDate, shuffle } = AtlasApp.helpers;
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
    const available = generateQuizQuestions(getQuizNotes(), context.elements.quizMode.value);
    const amount = context.helpers.clamp(Number(context.elements.quizAmount.value) || 6, 3, 20);
    const picked = shuffle(available).slice(0, amount);
    context.state.revisionMode = "quiz";
    context.state.quiz = {
      questions: picked,
      index: 0,
      score: 0,
      answerVisible: false,
      streak: 0,
      bestStreak: 0,
      lastResult: null,
      availableCount: available.length,
      requestedAmount: amount,
      startedAt: Date.now(),
    };
    context.renderers.renderRevisionMode();
    context.renderers.renderTabs();
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
      swipeOffset: 0,
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

    const nextStreak = isCorrect ? (context.state.quiz.streak || 0) + 1 : 0;
    context.state.quiz.streak = nextStreak;
    context.state.quiz.bestStreak = Math.max(context.state.quiz.bestStreak || 0, nextStreak);
    context.state.quiz.lastResult = {
      answer: current.answer,
      isCorrect,
      question: current.question,
    };

    if (current?.noteId) {
      context.data.updateReviewState(current.noteId, isCorrect);
    }

    context.state.quiz.index += 1;
    context.state.quiz.answerVisible = false;
    context.data.saveNotes();
    renderQuizCard();
    context.renderers.renderStats();
    context.renderers.renderDueReviewList();
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
    const currentIndex = context.state.quiz.index;

    if (!total) {
      context.elements.quizTitle.textContent = "Pret a jouer ?";
      context.elements.quizProgress.textContent = "0 / 0";
      context.elements.quizCard.className = "quiz-card quiz-game-card quiz-game-empty";
      context.elements.quizCard.innerHTML = `
        <div class="quiz-game-hero">
          <span class="quiz-game-kicker">Session de revision</span>
          <h4>Construisez une partie a partir de vos connaissances.</h4>
          <p>Choisissez une source, un mode, puis lancez le quiz. Chaque bonne reponse nourrit aussi les revisions futures.</p>
        </div>
        <div class="quiz-game-rules">
          <span>1. Lisez la question</span>
          <span>2. Repondez sans regarder</span>
          <span>3. Revelez puis validez</span>
        </div>
      `;
      context.elements.quizSummary.textContent =
        "Astuce : les lignes de type \"Concept : definition\", les dates et les liens produisent les meilleures questions.";
      context.elements.showAnswerButton.textContent = "Reveler";
      context.elements.markCorrectButton.textContent = "Bonne reponse";
      context.elements.markWrongButton.textContent = "A revoir";
      context.elements.showAnswerButton.disabled = true;
      context.elements.markCorrectButton.disabled = true;
      context.elements.markWrongButton.disabled = true;
      return;
    }

    if (currentIndex >= total) {
      const percent = Math.round((context.state.quiz.score / total) * 100);
      const rank = getQuizRank(percent);
      const duration = formatQuizDuration(context.state.quiz.startedAt);
      const lastResult = context.state.quiz.lastResult;

      context.elements.quizTitle.textContent = "Partie terminee";
      context.elements.quizProgress.textContent = `${total} / ${total}`;
      context.elements.quizCard.className = "quiz-card quiz-game-card quiz-game-complete";
      context.elements.quizCard.innerHTML = `
        <div class="quiz-complete-medal" aria-hidden="true">${rank.icon}</div>
        <span class="quiz-game-kicker">Resultat final</span>
        <h4>${escapeHtml(rank.label)}</h4>
        <div class="quiz-final-score">
          <strong>${context.state.quiz.score} / ${total}</strong>
          <span>${percent}% de maitrise</span>
        </div>
        <div class="quiz-game-hud">
          <span class="quiz-score-pill">Meilleure serie <strong>${context.state.quiz.bestStreak || 0}</strong></span>
          <span class="quiz-score-pill">Temps <strong>${duration}</strong></span>
          <span class="quiz-score-pill">Mode <strong>${escapeHtml(getQuizModeLabel())}</strong></span>
        </div>
        ${
          lastResult
            ? `<p class="quiz-last-result">Derniere reponse : ${escapeHtml(lastResult.answer)}</p>`
            : ""
        }
      `;
      context.elements.quizSummary.textContent =
        "Relancez une partie avec le meme dossier ou changez de mode pour renforcer les zones faibles.";
      context.elements.showAnswerButton.textContent = "Partie terminee";
      context.elements.markCorrectButton.textContent = "Bonne reponse";
      context.elements.markWrongButton.textContent = "A revoir";
      context.elements.showAnswerButton.disabled = true;
      context.elements.markCorrectButton.disabled = true;
      context.elements.markWrongButton.disabled = true;
      return;
    }

    const current = context.state.quiz.questions[currentIndex];
    const questionNumber = currentIndex + 1;
    const progress = Math.round((currentIndex / total) * 100);
    const nextProgress = Math.round((questionNumber / total) * 100);
    const isAnswerVisible = context.state.quiz.answerVisible;

    context.elements.quizTitle.textContent = "Mission de revision";
    context.elements.quizProgress.textContent = `${questionNumber} / ${total}`;
    context.elements.quizCard.className = `quiz-card quiz-game-card${
      isAnswerVisible ? " is-answer-visible" : ""
    }`;
    context.elements.quizCard.innerHTML = `
      <div class="quiz-progress-track" aria-hidden="true">
        <span style="width: ${isAnswerVisible ? nextProgress : progress}%"></span>
      </div>
      <div class="quiz-game-hud">
        <span class="quiz-score-pill">Score <strong>${context.state.quiz.score}</strong></span>
        <span class="quiz-score-pill quiz-combo">Serie <strong>${context.state.quiz.streak || 0}</strong></span>
        <span class="quiz-score-pill">Question <strong>${questionNumber}/${total}</strong></span>
      </div>
      <div class="quiz-question-stage">
        <span class="quiz-game-kicker">Question ${questionNumber}</span>
        <h4>${escapeHtml(current.question)}</h4>
        <div class="quiz-question-meta">
          <span>${escapeHtml(current.modeLabel)}</span>
          <span>${escapeHtml(current.source)}</span>
          <span>${escapeHtml(getQuizScopeLabel())}</span>
        </div>
      </div>
      ${
        isAnswerVisible
          ? `<div class="quiz-answer-reveal">
              <span class="quiz-game-kicker">Reponse</span>
              <p>${escapeHtml(current.answer)}</p>
              <small>Validez selon votre vrai rappel, pas selon une intuition apres coup.</small>
            </div>`
          : `<div class="quiz-recall-zone">
              <span>Zone de rappel</span>
              <p>Formulez la reponse dans votre tete, puis revelez-la.</p>
            </div>`
      }
    `;
    context.elements.quizSummary.textContent = isAnswerVisible
      ? "Choisissez le resultat pour passer automatiquement a la question suivante."
      : getQuizSessionHint(total);
    context.elements.showAnswerButton.textContent = isAnswerVisible ? "Reponse affichee" : "Reveler";
    context.elements.markCorrectButton.textContent = "Bonne reponse";
    context.elements.markWrongButton.textContent = "A revoir";
    context.elements.showAnswerButton.disabled = isAnswerVisible;
    context.elements.markCorrectButton.disabled = !isAnswerVisible;
    context.elements.markWrongButton.disabled = !isAnswerVisible;
  }

  function getQuizRank(percent) {
    if (percent >= 85) {
      return { icon: "A", label: "Maitrise solide" };
    }

    if (percent >= 60) {
      return { icon: "B", label: "Base en consolidation" };
    }

    return { icon: "C", label: "A revoir tranquillement" };
  }

  function formatQuizDuration(startedAt) {
    if (!startedAt) {
      return "0 min";
    }

    const elapsedSeconds = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
    const minutes = Math.floor(elapsedSeconds / 60);
    const seconds = elapsedSeconds % 60;
    return minutes ? `${minutes}m ${seconds}s` : `${seconds}s`;
  }

  function getQuizModeLabel() {
    const selected = context.elements.quizMode.selectedOptions?.[0];
    return selected?.textContent?.trim() || "Mixte";
  }

  function getQuizScopeLabel() {
    const selected = context.elements.quizScope.selectedOptions?.[0];
    return selected?.textContent?.trim() || "Toutes les pages";
  }

  function getQuizSessionHint(total) {
    if (total === 1) {
      return "Une seule question a ete trouvee dans cette source. Apres validation, la partie se terminera directement.";
    }

    const available = context.state.quiz.availableCount || total;
    const requested = context.state.quiz.requestedAmount || total;
    if (available < requested) {
      return `${available} question(s) trouvee(s) pour cette source. Ajoutez des definitions, dates, liens ou puces pour enrichir le quiz.`;
    }

    return "Le bon rythme : lire, rappeler, reveler, valider. Simple et brutalement efficace.";
  }

  function getQuizNotes() {
    return getScopedNotes(
      context.elements.quizScope.value,
      context.elements.quizTag.value,
      context.elements.quizFolder.value
    );
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
            mode: "link",
            modeLabel: "Lien",
          });
        });
      }

      if (note.metadata?.hasDate && (mode === "mixed" || mode === "date")) {
        questions.push(...generateDateQuestions(note));
      }
    });

    return deduplicateQuestions(questions);
  }

  function generateDateQuestions(note) {
    const metadata = note.metadata || {};
    const questions = [];

    if (metadata.dateMode === "reference" && metadata.singleDate) {
      const answer = formatDateAnswer(metadata.singleDate);
      questions.push({
        noteId: note.id,
        source: note.title,
        question: `Quelle est la date de reference de "${note.title}" ?`,
        answer,
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
          mode: "date",
          modeLabel: "Date",
        });
      }
    }

    return questions;
  }

  function formatDateAnswer(value) {
    return formatFlexibleDate(value);
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
    const progress = Math.round(((context.state.flashcards.index + 1) / total) * 100);
    context.elements.flashcardTitle.textContent = "Pile de revision";
    context.elements.flashcardProgress.textContent = `${context.state.flashcards.index + 1} / ${total}`;
    context.elements.flashcardCard.className = `quiz-card flashcard-deck-card${
      showAnswer ? " is-answer-visible" : ""
    }`;
    context.elements.flashcardCard.innerHTML = `
      <div class="quiz-progress-track flashcard-progress-track" aria-hidden="true">
        <span style="width: ${progress}%"></span>
      </div>
      <div class="flashcard-surface">
        <div class="flashcard-topline">
          <span class="quiz-game-kicker">${showAnswer ? "Verso" : "Recto"}</span>
          <span class="flashcard-count">${context.state.flashcards.index + 1}/${total}</span>
        </div>
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
      <div class="flashcard-swipe-cue" aria-hidden="true">
        <span>Precedente</span>
        <span>Swipe</span>
        <span>Suivante</span>
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
