(function initializeGraphModule(global) {
  const AtlasApp = (global.AtlasApp = global.AtlasApp || {});

  AtlasApp.createGraphModule = function createGraphModule(context) {
    const { noteTypeLabels } = AtlasApp.config;
    const { escapeHtml, extractLinks, extractSummary, unique } = AtlasApp.helpers;
  function getGraphNotes() {
    const base =
      context.state.graphTagFilter === "all"
        ? context.state.notes
        : context.state.notes.filter((note) =>
            note.tags.some(
              (tag) => tag.toLowerCase() === context.state.graphTagFilter.toLowerCase()
            )
          );

    if (context.state.graphFocusMode !== "neighbors") {
      return base;
    }

    const active = context.notes.getActiveNote();
    if (!active) {
      return base;
    }

    const neighborTitles = new Set(unique(extractLinks(active.content)));
    context.notes
      .getBacklinks(active.title, active.id)
      .forEach((title) => neighborTitles.add(title));

    return base.filter((note) => note.id === active.id || neighborTitles.has(note.title));
  }

  function buildGraphModel() {
    const notes = getGraphNotes();
    const noteByTitle = new Map(notes.map((note) => [note.title, note]));
    const nodes = notes.map((note) => ({
      id: note.id,
      noteId: note.id,
      kind: "note",
      type: note.type,
      label: note.title,
    }));
    const edges = [];

    notes.forEach((note) => {
      unique(extractLinks(note.content)).forEach((title) => {
        const target = noteByTitle.get(title);
        if (target) {
          edges.push({ from: note.id, to: target.id, kind: "note", distance: 140 });
        }
      });
    });

    if (context.state.graphShowTags) {
      const tagSet = new Set();
      notes.forEach((note) => note.tags.forEach((tag) => tagSet.add(tag)));
      [...tagSet].forEach((tag) => {
        const tagId = `tag::${tag}`;
        nodes.push({
          id: tagId,
          kind: "tag",
          type: "tag",
          label: `#${tag}`,
        });
        notes
          .filter((note) => note.tags.includes(tag))
          .forEach((note) => {
            edges.push({ from: note.id, to: tagId, kind: "tag", distance: 110 });
          });
      });
    }

    return { nodes, edges };
  }

  function getNodeDegree(nodeId, edges) {
    return edges.filter((edge) => edge.from === nodeId || edge.to === nodeId).length;
  }

  function getTypeColor(type) {
    if (type === "folder") {
      return "#ead7be";
    }

    if (type === "hub") {
      return "#f2d8a7";
    }

    if (type === "procedure") {
      return "#d8ead9";
    }

    if (type === "question") {
      return "#f4d5cc";
    }

    return "#fffaf2";
  }

  function drawGraph() {
    const graph = buildGraphModel();
    const width = 960;
    const height = 620;
    const centerX = width / 2;
    const centerY = height / 2;

    graph.nodes.forEach((node, index) => {
      if (!context.state.graphPositions.has(node.id)) {
        const angle = (Math.PI * 2 * index) / Math.max(graph.nodes.length, 1);
        context.state.graphPositions.set(node.id, {
          x: centerX + Math.cos(angle) * 180,
          y: centerY + Math.sin(angle) * 180,
          locked: false,
        });
      }
    });

    for (let pass = 0; pass < 180; pass += 1) {
      const forces = new Map(graph.nodes.map((node) => [node.id, { x: 0, y: 0 }]));

      for (let i = 0; i < graph.nodes.length; i += 1) {
        for (let j = i + 1; j < graph.nodes.length; j += 1) {
          const first = graph.nodes[i];
          const second = graph.nodes[j];
          const a = context.state.graphPositions.get(first.id);
          const b = context.state.graphPositions.get(second.id);
          let dx = a.x - b.x;
          let dy = a.y - b.y;
          const distance = Math.max(Math.hypot(dx, dy), 1);
          const repulsion = 2800 / (distance * distance);
          dx /= distance;
          dy /= distance;

          forces.get(first.id).x += dx * repulsion;
          forces.get(first.id).y += dy * repulsion;
          forces.get(second.id).x -= dx * repulsion;
          forces.get(second.id).y -= dy * repulsion;
        }
      }

      graph.edges.forEach((edge) => {
        const from = context.state.graphPositions.get(edge.from);
        const to = context.state.graphPositions.get(edge.to);
        let dx = to.x - from.x;
        let dy = to.y - from.y;
        const distance = Math.max(Math.hypot(dx, dy), 1);
        const spring = (distance - edge.distance) * 0.008;
        dx /= distance;
        dy /= distance;

        forces.get(edge.from).x += dx * spring;
        forces.get(edge.from).y += dy * spring;
        forces.get(edge.to).x -= dx * spring;
        forces.get(edge.to).y -= dy * spring;
      });

      graph.nodes.forEach((node) => {
        const position = context.state.graphPositions.get(node.id);
        if (position.locked) {
          return;
        }

        const force = forces.get(node.id);
        position.x += force.x + (centerX - position.x) * 0.002;
        position.y += force.y + (centerY - position.y) * 0.002;
        position.x = context.helpers.clamp(position.x, 60, width - 60);
        position.y = context.helpers.clamp(position.y, 60, height - 60);
      });
    }

    context.elements.graphCanvas.innerHTML = "";

    if (!graph.nodes.length) {
      renderGraphFocus();
      return;
    }

    graph.edges.forEach((edge) => {
      const from = context.state.graphPositions.get(edge.from);
      const to = context.state.graphPositions.get(edge.to);
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", from.x);
      line.setAttribute("y1", from.y);
      line.setAttribute("x2", to.x);
      line.setAttribute("y2", to.y);
      line.setAttribute("class", `graph-edge${edge.kind === "tag" ? " is-tag-edge" : ""}`);
      context.elements.graphCanvas.appendChild(line);
    });

    graph.nodes.forEach((node) => {
      const position = context.state.graphPositions.get(node.id);
      const isCurrent = node.kind === "note" && node.noteId === context.state.activeNoteId;
      const isSelected =
        context.state.graphSelection &&
        context.state.graphSelection.kind === node.kind &&
        context.state.graphSelection.id === node.id;
      const degree = getNodeDegree(node.id, graph.edges);
      const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
      group.dataset.graphNodeId = node.id;
      group.dataset.graphNodeKind = node.kind;
      group.style.cursor = "pointer";

      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", position.x);
      circle.setAttribute("cy", position.y);
      circle.setAttribute(
        "r",
        String(
          node.kind === "tag"
            ? 10 + Math.min(degree, 2)
            : isCurrent
              ? 20 + Math.min(degree, 3)
              : 14 + Math.min(degree, 4)
        )
      );
      circle.setAttribute("class", `graph-node${isCurrent || isSelected ? " is-current" : ""}`);
      circle.setAttribute("fill", node.kind === "tag" ? "#dbe6d4" : getTypeColor(node.type));

      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("x", position.x + 24);
      label.setAttribute("y", position.y + 4);
      label.setAttribute("class", `graph-label${node.kind === "tag" ? " is-tag-label" : ""}`);
      label.textContent = node.label;

      group.appendChild(circle);
      group.appendChild(label);
      context.elements.graphCanvas.appendChild(group);
    });

    renderGraphFocus();
  }

  function handleGraphClick(event) {
    const group = event.target.closest("[data-graph-node-id]");
    if (!group) {
      return;
    }

    const nodeId = group.dataset.graphNodeId;
    const nodeKind = group.dataset.graphNodeKind;
    context.state.graphSelection = { kind: nodeKind, id: nodeId };

    if (nodeKind === "note") {
      context.state.activeNoteId = nodeId;
      context.renderers.renderEverything();
      return;
    }

    renderGraphFocus();
    drawGraph();
  }

  function renderGraphFocus() {
    const selection = context.state.graphSelection;

    if (selection?.kind === "tag") {
      const tag = selection.id.replace("tag::", "");
      const relatedNotes = context.state.notes
        .filter((note) =>
          note.tags.some((candidate) => candidate.toLowerCase() === tag.toLowerCase())
        )
        .map((note) => note.title);
      context.elements.graphFocus.innerHTML = `
        <p><strong>Tag : ${escapeHtml(tag)}</strong></p>
        <p>${relatedNotes.length} page(s) reliee(s)</p>
        <p>${escapeHtml(relatedNotes.join(", ") || "Aucune page")}</p>
      `;
      return;
    }

    const note = context.notes.getActiveNote();
    if (!note) {
      context.elements.graphFocus.innerHTML = "<p>Aucune page selectionnee.</p>";
      return;
    }

    const outgoing = unique(extractLinks(note.content));
    const backlinks = context.notes.getBacklinks(note.title, note.id);

    context.elements.graphFocus.innerHTML = `
      <p><strong>${escapeHtml(note.title)}</strong></p>
      <p>${escapeHtml(extractSummary(note.content))}</p>
      <p><strong>Type :</strong> ${escapeHtml(noteTypeLabels[note.type] || "Concept")}</p>
      <p><strong>Liens sortants :</strong> ${escapeHtml(outgoing.join(", ") || "Aucun")}</p>
      <p><strong>Backlinks :</strong> ${escapeHtml(backlinks.join(", ") || "Aucun")}</p>
      <button type="button" class="button" data-open-active-note>Ouvrir cette page</button>
    `;
  }

  function handleGraphFocusClick(event) {
    const button = event.target.closest("[data-open-active-note]");
    if (!button) {
      return;
    }

    context.state.activeTab = "knowledge";
    context.renderers.renderEverything();
  }

  function handleGraphMouseDown(event) {
    const group = event.target.closest("[data-graph-node-id]");
    if (!group) {
      return;
    }

    const point = getSvgPoint(event);
    const nodeId = group.dataset.graphNodeId;
    const position = context.state.graphPositions.get(nodeId);
    if (!position) {
      return;
    }

    context.state.graphDrag.nodeId = nodeId;
    context.state.graphDrag.offsetX = point.x - position.x;
    context.state.graphDrag.offsetY = point.y - position.y;
    position.locked = true;
  }

  function handleGraphMouseMove(event) {
    if (!context.state.graphDrag.nodeId) {
      return;
    }

    const point = getSvgPoint(event);
    const position = context.state.graphPositions.get(context.state.graphDrag.nodeId);
    if (!position) {
      return;
    }

    position.x = context.helpers.clamp(point.x - context.state.graphDrag.offsetX, 60, 900);
    position.y = context.helpers.clamp(point.y - context.state.graphDrag.offsetY, 60, 560);
    drawGraph();
  }

  function handleGraphMouseUp() {
    if (!context.state.graphDrag.nodeId) {
      return;
    }

    context.state.graphDrag.nodeId = null;
  }

  function getSvgPoint(event) {
    const rect = context.elements.graphCanvas.getBoundingClientRect();
    const scaleX = 960 / rect.width;
    const scaleY = 620 / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  }

  return {
    buildGraphModel,
    drawGraph,
    getGraphNotes,
    handleGraphClick,
    handleGraphFocusClick,
    handleGraphMouseDown,
    handleGraphMouseMove,
    handleGraphMouseUp,
    renderGraphFocus,
  };
  };
})(window);
