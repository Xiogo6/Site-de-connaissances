(function initializeGraphModule(global) {
  const AtlasApp = (global.AtlasApp = global.AtlasApp || {});

  AtlasApp.createGraphModule = function createGraphModule(context) {
    const { clamp, escapeHtml, extractLinks, extractSummary, unique } = AtlasApp.helpers;
    const CANVAS_WIDTH = 960;
    const CANVAS_HEIGHT = 620;

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

  function getTypePalette(type) {
    if (type === "person") {
      return {
        fill: "#edd8b9",
        stroke: "#8f5d2f",
        label: "#6e4824",
      };
    }

    if (type === "event") {
      return {
        fill: "#d9e7f7",
        stroke: "#496a8f",
        label: "#34506e",
      };
    }

    if (type === "definition") {
      return {
        fill: "#e5efe1",
        stroke: "#5e7855",
        label: "#44573d",
      };
    }

    if (type === "experience") {
      return {
        fill: "#dfeeea",
        stroke: "#4f7d73",
        label: "#3a5d56",
      };
    }

    if (type === "folder") {
      return {
        fill: "#ece3d2",
        stroke: "#8f7752",
        label: "#66553b",
      };
    }

    if (type === "hub") {
      return {
        fill: "#efe6c8",
        stroke: "#9b7b2f",
        label: "#725a22",
      };
    }

    if (type === "procedure") {
      return {
        fill: "#dcead9",
        stroke: "#5d7d57",
        label: "#42583d",
      };
    }

    if (type === "question") {
      return {
        fill: "#f3ddd3",
        stroke: "#9e6751",
        label: "#744a39",
      };
    }

    return {
      fill: "#e3ecdb",
      stroke: "#617356",
      label: "#49563f",
    };
  }

  function buildAdjacency(graph) {
    const adjacency = new Map(graph.nodes.map((node) => [node.id, new Set()]));
    graph.edges.forEach((edge) => {
      adjacency.get(edge.from)?.add(edge.to);
      adjacency.get(edge.to)?.add(edge.from);
    });
    return adjacency;
  }

  function computeLevels(rootId, adjacency, visited) {
    const queue = [rootId];
    const levels = new Map([[rootId, 0]]);
    visited.add(rootId);

    while (queue.length) {
      const current = queue.shift();
      const currentLevel = levels.get(current) || 0;
      (adjacency.get(current) || []).forEach((neighbor) => {
        if (visited.has(neighbor)) {
          return;
        }
        visited.add(neighbor);
        levels.set(neighbor, currentLevel + 1);
        queue.push(neighbor);
      });
    }

    return levels;
  }

  function segmentIntersects(a, b, c, d) {
    const cross = (p1, p2, p3) =>
      (p2.x - p1.x) * (p3.y - p1.y) - (p2.y - p1.y) * (p3.x - p1.x);

    const denominator =
      (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x);

    if (Math.abs(denominator) < 0.0001) {
      return false;
    }

    const t = ((c.x - a.x) * (d.y - c.y) - (c.y - a.y) * (d.x - c.x)) / denominator;
    const u = ((c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x)) / denominator;

    if (t <= 0 || t >= 1 || u <= 0 || u >= 1) {
      return false;
    }

    const acb = cross(a, c, b);
    const adb = cross(a, d, b);
    const cad = cross(c, a, d);
    const cbd = cross(c, b, d);
    return acb * adb < 0 && cad * cbd < 0;
  }

  function countEdgeCrossings(graph, positions) {
    let total = 0;
    for (let i = 0; i < graph.edges.length; i += 1) {
      for (let j = i + 1; j < graph.edges.length; j += 1) {
        const first = graph.edges[i];
        const second = graph.edges[j];
        if (
          first.from === second.from ||
          first.from === second.to ||
          first.to === second.from ||
          first.to === second.to
        ) {
          continue;
        }

        const a = positions.get(first.from);
        const b = positions.get(first.to);
        const c = positions.get(second.from);
        const d = positions.get(second.to);
        if (a && b && c && d && segmentIntersects(a, b, c, d)) {
          total += 1;
        }
      }
    }
    return total;
  }

  function initializeGraphPositions(graph, width, height) {
    const adjacency = buildAdjacency(graph);
    const degreeByNode = new Map(
      graph.nodes.map((node) => [node.id, (adjacency.get(node.id) || new Set()).size])
    );
    const activeId = context.notes.getActiveNote()?.id;
    const remaining = [...graph.nodes].sort((left, right) => {
      if (left.id === activeId) {
        return -1;
      }
      if (right.id === activeId) {
        return 1;
      }
      return (degreeByNode.get(right.id) || 0) - (degreeByNode.get(left.id) || 0);
    });
    const visited = new Set();
    const components = [];

    remaining.forEach((node) => {
      if (visited.has(node.id)) {
        return;
      }
      const levels = computeLevels(node.id, adjacency, visited);
      components.push({ rootId: node.id, levels });
    });

    const laneCount = Math.max(components.length, 1);
    const laneHeight = (height - 120) / laneCount;
    const positions = new Map();

    components.forEach((component, componentIndex) => {
      const levelsMap = new Map();
      component.levels.forEach((level, nodeId) => {
        if (!levelsMap.has(level)) {
          levelsMap.set(level, []);
        }
        levelsMap.get(level).push(nodeId);
      });

      const maxLevel = Math.max(...levelsMap.keys(), 0);
      const sortedLevels = [...levelsMap.keys()].sort((left, right) => left - right);
      const laneTop = 60 + componentIndex * laneHeight;
      const laneCenter = laneTop + laneHeight / 2;

      sortedLevels.forEach((level, index) => {
        const ids = levelsMap.get(level);
        const previousIds = levelsMap.get(level - 1) || [];
        if (previousIds.length) {
          ids.sort((leftId, rightId) => {
            const leftNeighbors = [...(adjacency.get(leftId) || [])].filter((neighbor) =>
              previousIds.includes(neighbor)
            );
            const rightNeighbors = [...(adjacency.get(rightId) || [])].filter((neighbor) =>
              previousIds.includes(neighbor)
            );
            const barycenter = (neighbors) =>
              neighbors.length
                ? neighbors.reduce((sum, neighbor) => sum + previousIds.indexOf(neighbor), 0) /
                  neighbors.length
                : Number.MAX_SAFE_INTEGER;
            return barycenter(leftNeighbors) - barycenter(rightNeighbors);
          });
        } else {
          ids.sort((leftId, rightId) =>
            (degreeByNode.get(rightId) || 0) - (degreeByNode.get(leftId) || 0)
          );
        }

        const x =
          maxLevel === 0
            ? width / 2
            : 90 + (index / Math.max(sortedLevels.length - 1, 1)) * (width - 180);
        const stepY = laneHeight / Math.max(ids.length + 1, 2);
        ids.forEach((nodeId, nodeIndex) => {
          positions.set(nodeId, {
            x,
            y: laneCenter - (laneHeight / 2) + stepY * (nodeIndex + 1),
            locked: false,
          });
        });
      });
    });

    const levelEntries = new Map();
    components.forEach((component) => {
      component.levels.forEach((level, nodeId) => {
        if (!levelEntries.has(level)) {
          levelEntries.set(level, []);
        }
        levelEntries.get(level).push(nodeId);
      });
    });

    [...levelEntries.values()].forEach((ids) => {
      for (let pass = 0; pass < 3; pass += 1) {
        for (let index = 0; index < ids.length - 1; index += 1) {
          const firstId = ids[index];
          const secondId = ids[index + 1];
          const firstPosition = positions.get(firstId);
          const secondPosition = positions.get(secondId);
          const currentCrossings = countEdgeCrossings(graph, positions);
          positions.set(firstId, { ...firstPosition, y: secondPosition.y });
          positions.set(secondId, { ...secondPosition, y: firstPosition.y });
          const swappedCrossings = countEdgeCrossings(graph, positions);
          if (swappedCrossings <= currentCrossings) {
            ids[index] = secondId;
            ids[index + 1] = firstId;
          } else {
            positions.set(firstId, firstPosition);
            positions.set(secondId, secondPosition);
          }
        }
      }
    });

    graph.nodes.forEach((node) => {
      const position = positions.get(node.id);
      if (!position) {
        positions.set(node.id, {
          x: width / 2,
          y: height / 2,
          locked: false,
        });
      }
    });

    return positions;
  }

  function recenterGraphLayout() {
    const graph = buildGraphModel();
    const width = CANVAS_WIDTH;
    const height = CANVAS_HEIGHT;
    context.state.graphPositions = initializeGraphPositions(graph, width, height);
    context.state.graphViewport.panX = 0;
    context.state.graphViewport.panY = 0;
    drawGraph();
  }

  function getGraphViewBox() {
    const zoom = clamp(context.state.graphZoom || 1, 1, 2.8);
    const width = CANVAS_WIDTH / zoom;
    const height = CANVAS_HEIGHT / zoom;
    const centeredX = (CANVAS_WIDTH - width) / 2;
    const centeredY = (CANVAS_HEIGHT - height) / 2;
    const maxX = CANVAS_WIDTH - width;
    const maxY = CANVAS_HEIGHT - height;
    return {
      x: clamp(centeredX + (context.state.graphViewport.panX || 0), 0, maxX),
      y: clamp(centeredY + (context.state.graphViewport.panY || 0), 0, maxY),
      width,
      height,
    };
  }

  function drawGraph() {
    const graph = buildGraphModel();
    const width = CANVAS_WIDTH;
    const height = CANVAS_HEIGHT;
    const centerX = width / 2;
    const centerY = height / 2;
    const viewBox = getGraphViewBox();

    context.elements.graphCanvas.setAttribute(
      "viewBox",
      `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`
    );

    const hasAllPositions = graph.nodes.every((node) => context.state.graphPositions.has(node.id));
    if (!hasAllPositions) {
      context.state.graphPositions = initializeGraphPositions(graph, width, height);
    }

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
      const palette =
        node.kind === "tag"
          ? { fill: "#dfeee1", stroke: "#5f7c63", label: "#47604a" }
          : getTypePalette(node.type);
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
      circle.style.fill = palette.fill;
      circle.style.stroke = palette.stroke;
      circle.style.strokeWidth = isCurrent || isSelected ? "3" : "2";

      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("x", position.x + 24);
      label.setAttribute("y", position.y + 4);
      label.setAttribute("class", `graph-label${node.kind === "tag" ? " is-tag-label" : ""}`);
      label.style.fill = palette.label;
      label.textContent = node.label;

      group.appendChild(circle);
      group.appendChild(label);
      context.elements.graphCanvas.appendChild(group);
    });

    renderGraphFocus();
  }

  function handleGraphClick(event) {
    if ((context.state.graphDrag.suppressClickUntil || 0) > Date.now()) {
      return;
    }

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
      <p><strong>Type :</strong> ${escapeHtml(context.data.getNoteTypeLabels()[note.type] || "Concept")}</p>
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
    context.state.noteViewMode = "read";
    context.renderers.renderEverything();
  }

  function handleGraphPointerDown(event) {
    updateActivePointer(event);
    if (event.pointerType === "touch" && getActivePointerCount() === 2) {
      startPinchGesture();
      event.preventDefault();
      return;
    }

    const group = event.target.closest("[data-graph-node-id]");
    context.state.graphDrag.pointerId = event.pointerId;
    context.state.graphDrag.moved = false;
    context.state.graphDrag.startClientX = event.clientX;
    context.state.graphDrag.startClientY = event.clientY;

    if (group) {
      const point = getSvgPoint(event);
      const nodeId = group.dataset.graphNodeId;
      const position = context.state.graphPositions.get(nodeId);
      if (!position) {
        return;
      }

      context.state.graphDrag.mode = "node";
      context.state.graphDrag.nodeId = nodeId;
      context.state.graphDrag.offsetX = point.x - position.x;
      context.state.graphDrag.offsetY = point.y - position.y;
      position.locked = true;
      event.preventDefault();
      return;
    }

    context.state.graphDrag.mode = "pan";
    context.state.graphDrag.nodeId = null;
    context.state.graphDrag.startPanX = context.state.graphViewport.panX || 0;
    context.state.graphDrag.startPanY = context.state.graphViewport.panY || 0;
    event.preventDefault();
  }

  function handleGraphPointerMove(event) {
    updateActivePointer(event);

    if (context.state.graphDrag.mode === "pinch") {
      handlePinchMove(event);
      return;
    }

    if (context.state.graphDrag.pointerId !== event.pointerId || !context.state.graphDrag.mode) {
      return;
    }

    if (context.state.graphDrag.mode === "pan") {
      const viewBox = getGraphViewBox();
      const rect = context.elements.graphCanvas.getBoundingClientRect();
      const scaleX = viewBox.width / rect.width;
      const scaleY = viewBox.height / rect.height;
      const deltaX = event.clientX - context.state.graphDrag.startClientX;
      const deltaY = event.clientY - context.state.graphDrag.startClientY;

      context.state.graphViewport.panX = context.state.graphDrag.startPanX - deltaX * scaleX;
      context.state.graphViewport.panY = context.state.graphDrag.startPanY - deltaY * scaleY;
      context.state.graphDrag.moved = true;
      drawGraph();
      event.preventDefault();
      return;
    }

    const point = getSvgPoint(event);
    const position = context.state.graphPositions.get(context.state.graphDrag.nodeId);
    if (!position) {
      return;
    }

    position.x = context.helpers.clamp(
      point.x - context.state.graphDrag.offsetX,
      60,
      CANVAS_WIDTH - 60
    );
    position.y = context.helpers.clamp(
      point.y - context.state.graphDrag.offsetY,
      60,
      CANVAS_HEIGHT - 60
    );
    context.state.graphDrag.moved = true;
    drawGraph();
    event.preventDefault();
  }

  function handleGraphPointerUp(event) {
    removeActivePointer(event.pointerId);

    if (context.state.graphDrag.mode === "pinch") {
      if (context.state.graphDrag.moved) {
        context.state.graphDrag.suppressClickUntil = Date.now() + 280;
      }
      clearPinchGesture();
      return;
    }

    if (context.state.graphDrag.pointerId !== event.pointerId) {
      return;
    }

    if (context.state.graphDrag.moved) {
      context.state.graphDrag.suppressClickUntil = Date.now() + 280;
    }
    context.state.graphDrag.mode = null;
    context.state.graphDrag.nodeId = null;
    context.state.graphDrag.pointerId = null;
    context.state.graphDrag.moved = false;
  }

  function getSvgPoint(event) {
    const rect = context.elements.graphCanvas.getBoundingClientRect();
    const viewBox = getGraphViewBox();
    const scaleX = viewBox.width / rect.width;
    const scaleY = viewBox.height / rect.height;
    return {
      x: viewBox.x + (event.clientX - rect.left) * scaleX,
      y: viewBox.y + (event.clientY - rect.top) * scaleY,
    };
  }

  function updateActivePointer(event) {
    context.state.graphDrag.activePointers[event.pointerId] = {
      clientX: event.clientX,
      clientY: event.clientY,
    };
  }

  function removeActivePointer(pointerId) {
    delete context.state.graphDrag.activePointers[pointerId];
  }

  function getActivePointerCount() {
    return Object.keys(context.state.graphDrag.activePointers).length;
  }

  function getActivePointerEntries() {
    return Object.values(context.state.graphDrag.activePointers);
  }

  function startPinchGesture() {
    const pointers = getActivePointerEntries();
    if (pointers.length < 2) {
      return;
    }

    if (context.state.graphDrag.nodeId) {
      const position = context.state.graphPositions.get(context.state.graphDrag.nodeId);
      if (position) {
        position.locked = true;
      }
    }

    const [first, second] = pointers;
    const centerX = (first.clientX + second.clientX) / 2;
    const centerY = (first.clientY + second.clientY) / 2;
    const distance = Math.max(
      Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY),
      1
    );
    const rect = context.elements.graphCanvas.getBoundingClientRect();
    const viewBox = getGraphViewBox();
    const ratioX = (centerX - rect.left) / rect.width;
    const ratioY = (centerY - rect.top) / rect.height;

    context.state.graphDrag.mode = "pinch";
    context.state.graphDrag.nodeId = null;
    context.state.graphDrag.pointerId = null;
    context.state.graphDrag.pinchStartDistance = distance;
    context.state.graphDrag.pinchStartZoom = context.state.graphZoom || 1;
    context.state.graphDrag.pinchFocalGraphX = viewBox.x + ratioX * viewBox.width;
    context.state.graphDrag.pinchFocalGraphY = viewBox.y + ratioY * viewBox.height;
    context.state.graphDrag.moved = false;
  }

  function clearPinchGesture() {
    context.state.graphDrag.mode = null;
    context.state.graphDrag.nodeId = null;
    context.state.graphDrag.pointerId = null;
    context.state.graphDrag.moved = false;
    context.state.graphDrag.pinchStartDistance = 0;
  }

  function handlePinchMove(event) {
    const pointers = getActivePointerEntries();
    if (pointers.length < 2) {
      return;
    }

    const [first, second] = pointers;
    const centerX = (first.clientX + second.clientX) / 2;
    const centerY = (first.clientY + second.clientY) / 2;
    const distance = Math.max(
      Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY),
      1
    );
    const nextZoom = clamp(
      (context.state.graphDrag.pinchStartZoom || 1) *
        (distance / Math.max(context.state.graphDrag.pinchStartDistance || 1, 1)),
      1,
      2.8
    );

    setZoomAtPoint(
      nextZoom,
      centerX,
      centerY,
      context.state.graphDrag.pinchFocalGraphX,
      context.state.graphDrag.pinchFocalGraphY
    );
    context.state.graphDrag.moved = true;
    event.preventDefault();
  }

  function setZoomAtPoint(nextZoom, clientX, clientY, focalGraphX = null, focalGraphY = null) {
    const rect = context.elements.graphCanvas.getBoundingClientRect();
    const currentViewBox = getGraphViewBox();
    const safeZoom = clamp(nextZoom, 1, 2.8);
    const nextWidth = CANVAS_WIDTH / safeZoom;
    const nextHeight = CANVAS_HEIGHT / safeZoom;
    const centeredX = (CANVAS_WIDTH - nextWidth) / 2;
    const centeredY = (CANVAS_HEIGHT - nextHeight) / 2;
    const ratioX = clamp((clientX - rect.left) / rect.width, 0, 1);
    const ratioY = clamp((clientY - rect.top) / rect.height, 0, 1);
    const focusX =
      focalGraphX == null ? currentViewBox.x + ratioX * currentViewBox.width : focalGraphX;
    const focusY =
      focalGraphY == null ? currentViewBox.y + ratioY * currentViewBox.height : focalGraphY;

    context.state.graphZoom = safeZoom;
    context.state.graphViewport.panX = focusX - ratioX * nextWidth - centeredX;
    context.state.graphViewport.panY = focusY - ratioY * nextHeight - centeredY;
    drawGraph();
  }

  function zoomIn() {
    const rect = context.elements.graphCanvas.getBoundingClientRect();
    setZoomAtPoint((context.state.graphZoom || 1) + 0.2, rect.left + rect.width / 2, rect.top + rect.height / 2);
  }

  function zoomOut() {
    const rect = context.elements.graphCanvas.getBoundingClientRect();
    setZoomAtPoint((context.state.graphZoom || 1) - 0.2, rect.left + rect.width / 2, rect.top + rect.height / 2);
  }

  return {
    buildGraphModel,
    drawGraph,
    getGraphNotes,
    handleGraphClick,
    handleGraphFocusClick,
    handleGraphPointerDown,
    handleGraphPointerMove,
    handleGraphPointerUp,
    recenterGraphLayout,
    renderGraphFocus,
    zoomIn,
    zoomOut,
  };
  };
})(window);
