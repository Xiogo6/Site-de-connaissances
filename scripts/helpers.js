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

  function normalizeTagList(values) {
    const seen = new Set();
    return values
      .map((value) => normalizeTag(value))
      .filter(Boolean)
      .filter((value) => {
        if (seen.has(value)) {
          return false;
        }
        seen.add(value);
        return true;
      });
  }

  function parseTags(value) {
    return normalizeTagList(value.split(","));
  }

  function extractLinks(content) {
    return [...content.matchAll(/\[\[([^[\]]+)\]\]/g)].map((match) => match[1].trim());
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

  function renderInline(text) {
    const escaped = escapeHtml(text);
    return escaped
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[\s(])\*([^*]+)\*(?=[\s).,!?:;]|$)/g, "$1<em>$2</em>")
      .replace(/\[\[([^[\]]+)\]\]/g, (_, title) => {
        const safeTitle = escapeHtml(title.trim());
        return `<a class="note-link" data-link-title="${safeTitle}">${safeTitle}</a>`;
      });
  }

  function renderNoteHtml(content) {
    const blocks = [];
    const lines = content.split("\n");
    let listBuffer = [];

    const flushList = () => {
      if (!listBuffer.length) {
        return;
      }

      blocks.push(`<ul>${listBuffer.map((item) => `<li>${item}</li>`).join("")}</ul>`);
      listBuffer = [];
    };

    lines.forEach((line) => {
      const trimmed = line.trim();

      if (!trimmed) {
        flushList();
        return;
      }

      if (trimmed.startsWith("- ")) {
        listBuffer.push(renderInline(trimmed.slice(2)));
        return;
      }

      flushList();

      if (trimmed.startsWith("## ")) {
        blocks.push(`<h2>${renderInline(trimmed.slice(3))}</h2>`);
        return;
      }

      if (trimmed.startsWith("# ")) {
        blocks.push(`<h1>${renderInline(trimmed.slice(2))}</h1>`);
        return;
      }

      blocks.push(`<p>${renderInline(trimmed)}</p>`);
    });

    flushList();
    return blocks.join("");
  }

  AtlasApp.helpers = {
    clamp,
    escapeHtml,
    extractLinks,
    extractSummary,
    formatDate,
    normalizeTag,
    normalizeTagList,
    parseTags,
    renderInline,
    renderNoteHtml,
    shuffle,
    toKebab,
    unique,
  };
})(window);
