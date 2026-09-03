(function initializeHelpers(global) {
  const AtlasApp = (global.AtlasApp = global.AtlasApp || {});

  function unique(values) {
    return values.filter((value, index, list) => list.indexOf(value) === index);
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  let entityDecoder = null;

  function decodeHtmlEntities(value) {
    const text = String(value || "");

    // Sans "&" il n'y a aucune entite a decoder. Ce raccourci couvre la quasi
    // totalite des appels et evite d'aller jusqu'au DOM, qui coutait tres cher :
    // normalizeLinkTitle est appele des dizaines de milliers de fois par rendu.
    if (!text.includes("&")) {
      return text;
    }

    if (typeof document === "undefined") {
      return text
        .replaceAll("&amp;", "&")
        .replaceAll("&lt;", "<")
        .replaceAll("&gt;", ">")
        .replaceAll("&quot;", '"')
        .replaceAll("&#39;", "'");
    }

    // Un seul element reutilise, au lieu d'un nouveau a chaque appel.
    entityDecoder = entityDecoder || document.createElement("textarea");
    entityDecoder.innerHTML = text;
    return entityDecoder.value;
  }

  const linkTitleCache = new Map();

  function normalizeLinkTitle(value) {
    const key = String(value ?? "");
    const cached = linkTitleCache.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const normalized = decodeHtmlEntities(key)
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[\u2018\u2019\u201B\u02BC\u00B4\u0060]/g, "'")
      .replace(/\s+/g, " ");

    // La fonction est pure : un titre donne produit toujours le meme resultat,
    // le cache ne peut donc pas devenir faux. On le borne pour la memoire.
    if (linkTitleCache.size > 5000) {
      linkTitleCache.clear();
    }
    linkTitleCache.set(key, normalized);

    return normalized;
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function shuffle(items) {
    const clone = [...items];
    for (let index = clone.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [clone[index], clone[swapIndex]] = [clone[swapIndex], clone[index]];
    }
    return clone;
  }

  function toKebab(value) {
    return value.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
  }

  function normalizeTag(value) {
    const normalized = String(value)
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    if (!normalized) {
      return "";
    }

    if (normalized.endsWith("aux") && normalized.length > 4) {
      return `${normalized.slice(0, -1)}`;
    }

    if (normalized.endsWith("s") && normalized.length > 3) {
      return normalized.slice(0, -1);
    }

    return normalized;
  }

  // Un tag garde le libelle ecrit par l'utilisateur ; normalizeTag ne sert
  // qu'a fabriquer la cle de comparaison. Deux libelles qui donnent la meme
  // cle sont le meme tag, et seul le premier est conserve. Cette fonction
  // renvoyait auparavant la cle elle-meme : les tags etaient donc reecrits a
  // chaque chargement, et corriger l'orthographe d'un tag etait impossible.
  function normalizeTagList(values) {
    const seen = new Set();
    return values
      .map((value) => String(value).trim())
      .filter(Boolean)
      .filter((label) => {
        const key = normalizeTag(label);
        if (!key || seen.has(key)) {
          return false;
        }

        seen.add(key);
        return true;
      });
  }

  function parseTags(value) {
    return normalizeTagList(value.split(","));
  }

  function extractLinks(content) {
    return [...content.matchAll(/\[\[([^[\]]+)\]\]/g)].map((match) => match[1].trim());
  }

  // Les lignes `Dans : [[X]]` et `Contient : [[Y]]` etaient une copie de
  // parentId ecrite dans le texte au moment du deplacement. La copie derivait :
  // une reecriture pouvait l'effacer, un deplacement n'en mettait qu'une des
  // deux a jour. parentId fait desormais foi et ces lignes sont recalculees a
  // l'affichage. Celles deja ecrites dans les pages restent en place mais ne
  // sont plus lues nulle part.
  const hierarchyLinePattern = /^\s*(?:Dans|Contient)\s*:\s*\[\[[^[\]]+\]\]\s*$/i;

  function isHierarchyLine(line) {
    return hierarchyLinePattern.test(String(line || ""));
  }

  function stripHierarchyLines(content) {
    const source = String(content || "");
    if (!source.includes("[[")) {
      return source;
    }

    return source
      .split("\n")
      .filter((line) => !isHierarchyLine(line))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/\s+$/, "");
  }

  function extractSummary(content) {
    return (
      content
        .replace(/[#*\-[\]]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 110) || "Aucun contenu"
    );
  }

  function formatDate(value) {
    if (!value) {
      return "jamais";
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "inconnue";
    }

    return new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }

  function normalizeFlexibleDateInput(value) {
    // La virgule compte comme separateur : sur iPhone en francais, le pave
    // decimal propose une virgule et non un point.
    const cleaned = String(value || "")
      .trim()
      .replace(/[/.,]/g, "-")
      .replace(/\s+/g, "");

    if (!cleaned) {
      return "";
    }

    // Saisie sans separateur, indispensable au telephone : le clavier
    // numerique d'iOS ne propose ni barre oblique ni tiret. Les trois
    // precisions doivent donc etre atteignables en chiffres seuls, dans
    // l'ordre francais : 8 chiffres pour un jour, 6 pour un mois, 4 pour
    // une annee.
    if (/^\d{8}$/.test(cleaned)) {
      const day = cleaned.slice(0, 2);
      const month = cleaned.slice(2, 4);
      const year = cleaned.slice(4, 8);
      return `${year}-${month}-${day}`;
    }

    if (/^\d{6}$/.test(cleaned)) {
      const month = cleaned.slice(0, 2);
      const year = cleaned.slice(2, 6);
      return `${year}-${month}`;
    }

    const parts = cleaned.split("-").filter(Boolean);
    if (!parts.length) {
      return "";
    }

    if (parts.length === 1) {
      return /^\d{1,4}$/.test(parts[0]) ? parts[0] : cleaned;
    }

    if (parts.length === 2) {
      const [first, second] = parts;
      if (/^\d{4}$/.test(first) && /^\d{1,2}$/.test(second)) {
        return `${first}-${second.padStart(2, "0")}`;
      }
      if (/^\d{1,2}$/.test(first) && /^\d{4}$/.test(second)) {
        return `${second}-${first.padStart(2, "0")}`;
      }
      return cleaned;
    }

    const [first, second, third] = parts;
    if (/^\d{4}$/.test(first) && /^\d{1,2}$/.test(second) && /^\d{1,2}$/.test(third)) {
      return `${first}-${second.padStart(2, "0")}-${third.padStart(2, "0")}`;
    }
    if (/^\d{1,2}$/.test(first) && /^\d{1,2}$/.test(second) && /^\d{4}$/.test(third)) {
      return `${third}-${second.padStart(2, "0")}-${first.padStart(2, "0")}`;
    }

    return cleaned;
  }

  function parseFlexibleDateParts(value) {
    const normalized = normalizeFlexibleDateInput(value);
    if (!normalized) {
      return null;
    }

    if (/^\d{1,4}$/.test(normalized)) {
      return {
        normalized,
        precision: "year",
        year: Number(normalized),
        month: null,
        day: null,
      };
    }

    const monthMatch = normalized.match(/^(\d{1,4})-(\d{2})$/);
    if (monthMatch) {
      return {
        normalized,
        precision: "month",
        year: Number(monthMatch[1]),
        month: Number(monthMatch[2]),
        day: null,
      };
    }

    const dayMatch = normalized.match(/^(\d{1,4})-(\d{2})-(\d{2})$/);
    if (dayMatch) {
      return {
        normalized,
        precision: "day",
        year: Number(dayMatch[1]),
        month: Number(dayMatch[2]),
        day: Number(dayMatch[3]),
      };
    }

    return null;
  }

  function getFlexibleDateTimestamp(value, boundary = "center") {
    const parts = parseFlexibleDateParts(value);
    if (!parts) {
      return null;
    }

    if (parts.precision === "year") {
      if (boundary === "start") {
        return Date.UTC(parts.year, 0, 1);
      }

      if (boundary === "end") {
        return Date.UTC(parts.year, 11, 31, 23, 59, 59, 999);
      }

      return Date.UTC(parts.year, 6, 1);
    }

    if (parts.precision === "month") {
      const lastDay = new Date(Date.UTC(parts.year, parts.month, 0)).getUTCDate();
      if (boundary === "start") {
        return Date.UTC(parts.year, parts.month - 1, 1);
      }

      if (boundary === "end") {
        return Date.UTC(parts.year, parts.month - 1, lastDay, 23, 59, 59, 999);
      }

      return Date.UTC(parts.year, parts.month - 1, Math.min(15, lastDay));
    }

    return Date.UTC(parts.year, parts.month - 1, parts.day);
  }

  function formatFlexibleDate(value) {
    const normalized = normalizeFlexibleDateInput(value);
    if (!normalized) {
      return "inconnue";
    }

    if (/^\d{1,4}$/.test(normalized)) {
      return normalized;
    }

    const monthMatch = normalized.match(/^(\d{1,4})-(\d{2})$/);
    if (monthMatch) {
      return `${monthMatch[2]}/${monthMatch[1]}`;
    }

    const dayMatch = normalized.match(/^(\d{1,4})-(\d{2})-(\d{2})$/);
    if (dayMatch) {
      return `${dayMatch[3]}/${dayMatch[2]}/${dayMatch[1]}`;
    }

    return normalized;
  }

  function renderInline(text) {
    const escaped = escapeHtml(decodeHtmlEntities(text));
    return escaped
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[\s(])\*([^*]+)\*(?=[\s).,!?:;]|$)/g, "$1<em>$2</em>")
      .replace(/\+\+([^+]+)\+\+/g, "<u>$1</u>")
      .replace(/\[\[([^[\]]+)\]\]/g, (_, title) => {
        // Le titre est capture dans un texte deja echappe : le re-echapper tel
        // quel donnait &amp;#39; a la place de l'apostrophe, affiche en clair
        // dans le lien. On le ramene a sa forme brute avant de l'echapper une
        // seule fois.
        const safeTitle = escapeHtml(decodeHtmlEntities(title.trim()));
        return `<a class="note-link" data-link-title="${safeTitle}">${safeTitle}</a>`;
      });
  }

  function renderNoteHtml(content) {
    const blocks = [];
    const lines = content.split("\n");
    let listBuffer = [];
    let paragraphBuffer = [];
    let blankLineCount = 0;

    const flushList = () => {
      if (!listBuffer.length) {
        return;
      }

      blocks.push(`<ul>${listBuffer.join("")}</ul>`);
      listBuffer = [];
    };

    const flushParagraph = () => {
      if (!paragraphBuffer.length) {
        return;
      }

      blocks.push(
        `<p>${paragraphBuffer
          .map((line) => `<span class="note-line">${renderInline(line)}</span>`)
          .join("")}</p>`
      );
      paragraphBuffer = [];
    };

    // Une ligne vide dans le texte vaut une ligne vide a l'affichage. Le
    // marqueur ne valait avant que pour deux lignes vides et plus : une seule
    // ne produisait rien, et deux puces separees par un blanc se retrouvaient
    // collees, la mise en forme des blocs etant a zero en CSS.
    // Il n'a de sens qu'entre deux blocs : en tete de note il n'ajouterait
    // qu'un vide avant le premier mot.
    const flushBlankSpacing = () => {
      if (blankLineCount > 0 && blocks.length) {
        blocks.push(
          `<div class="note-blank-space" style="--note-blank-lines: ${blankLineCount}" aria-hidden="true"></div>`
        );
      }
      blankLineCount = 0;
    };

    lines.forEach((line, lineIndex) => {
      const trimmed = line.trim();

      if (!trimmed) {
        flushParagraph();
        flushList();
        blankLineCount += 1;
        return;
      }

      flushBlankSpacing();

      const checklistMatch = trimmed.match(/^-\s+\[( |x|X)\]\s+(.*)$/);
      if (checklistMatch) {
        flushParagraph();
        const checked = checklistMatch[1].toLowerCase() === "x";
        const text = renderInline(checklistMatch[2]);
        listBuffer.push(
          `<li class="checklist-item"><label><input type="checkbox" data-checklist-line="${lineIndex}" ${
            checked ? "checked" : ""
          } /> <span>${text}</span></label></li>`
        );
        return;
      }

      if (trimmed.startsWith("- ")) {
        flushParagraph();
        listBuffer.push(`<li>${renderInline(trimmed.slice(2))}</li>`);
        return;
      }

      flushList();

      if (trimmed.startsWith("## ")) {
        flushParagraph();
        blocks.push(`<h2>${renderInline(trimmed.slice(3))}</h2>`);
        return;
      }

      if (trimmed.startsWith("# ")) {
        flushParagraph();
        blocks.push(`<h1>${renderInline(trimmed.slice(2))}</h1>`);
        return;
      }

      paragraphBuffer.push(trimmed);
    });

    flushParagraph();
    flushList();
    // Pas de flushBlankSpacing final : a ce stade il ne peut plus produire
    // qu'un vide en fin de note, sous le dernier bloc.
    return blocks.join("");
  }

  AtlasApp.helpers = {
    clamp,
    decodeHtmlEntities,
    escapeHtml,
    extractLinks,
    extractSummary,
    isHierarchyLine,
    formatFlexibleDate,
    formatDate,
    getFlexibleDateTimestamp,
    normalizeTag,
    normalizeTagList,
    normalizeFlexibleDateInput,
    parseTags,
    parseFlexibleDateParts,
    normalizeLinkTitle,
    renderInline,
    renderNoteHtml,
    shuffle,
    stripHierarchyLines,
    toKebab,
    unique,
  };
})(window);
