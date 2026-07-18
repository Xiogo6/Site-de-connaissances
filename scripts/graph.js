(function initializeGraphModule(global) {
  const AtlasApp = (global.AtlasApp = global.AtlasApp || {});

  AtlasApp.createGraphModule = function createGraphModule(context) {
    const { clamp, escapeHtml, extractLinks, extractSummary, unique } = AtlasApp.helpers;
    const CANVAS_WIDTH = 960;
    const CANVAS_HEIGHT = 620;
    const MIN_GRAPH_ZOOM = 0.08;
    const MAX_GRAPH_ZOOM = 4.4;
    const GRAPH_LABEL_BREAKPOINT = "(max-width: 780px)";
    let zoomAnimationFrame = null;
    let lastLayoutHeight = CANVAS_HEIGHT;
    let graphLayoutNeedsSettling = false;

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

  function isCompactGraphViewport() {
    return global.matchMedia?.(GRAPH_LABEL_BREAKPOINT)?.matches ?? false;
  }

  function getGraphDimensions() {
    const rect = context.elements.graphCanvas?.getBoundingClientRect();
    if (!isCompactGraphViewport() || !rect?.width || !rect?.height) {
      return { width: CANVAS_WIDTH, height: CANVAS_HEIGHT };
    }

    return {
      width: CANVAS_WIDTH,
      height: clamp(CANVAS_WIDTH * (rect.height / rect.width), 960, 2100),
    };
  }

  function initializeOrganicPositions(graph, width, height, degreeByNode) {
    const activeId = context.notes.getActiveNote()?.id;
    const nodes = [...graph.nodes].sort((left, right) => {
      if (left.id === activeId) return -1;
      if (right.id === activeId) return 1;
      return (degreeByNode.get(right.id) || 0) - (degreeByNode.get(left.id) || 0);
    });
    const positions = new Map();
    const centerX = width / 2;
    const centerY = height / 2;
    const radiusX = width * 0.41;
    const radiusY = Math.max(240, (height - 300) * 0.43);
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));

    nodes.forEach((node, index) => {
      const progress = nodes.length <= 1 ? 0 : Math.sqrt(index / (nodes.length - 1));
      let hash = 0;
      for (let characterIndex = 0; characterIndex < node.id.length; characterIndex += 1) {
        hash = (hash * 31 + node.id.charCodeAt(characterIndex)) >>> 0;
      }
      const angle = index * goldenAngle + ((hash % 37) / 37) * 0.48;
      positions.set(node.id, {
        x: centerX + Math.cos(angle) * radiusX * progress,
        y: centerY + Math.sin(angle) * radiusY * progress,
        locked: false,
      });
    });

    return positions;
  }

  function getGraphLabelMode(node, degree, zoom, isCurrent, isSelected) {
    if (isCurrent || isSelected) {
      return "key";
    }

    const compactViewport = isCompactGraphViewport();

    if (node.kind === "tag") {
      if (!compactViewport || zoom >= 1.2 || degree >= 4) {
        return zoom >= 2.35 ? "full" : "compact";
      }
      return null;
    }

    if (!compactViewport) {
      if (zoom >= 2 || degree >= 7) {
        return "full";
      }
      if (zoom >= 1.35 || degree >= 4) {
        return "compact";
      }
      return null;
    }

    if (zoom >= 3 || degree >= 7) {
      return "full";
    }
    if (zoom >= 2 || degree >= 4) {
      return "compact";
    }
    if (zoom >= 1.45 && degree >= 6) {
      return "compact";
    }
    return null;
  }

  function releaseLockedNode(nodeId = context.state.graphDrag.nodeId) {
    if (!nodeId) {
      return;
    }

    const position = context.state.graphPositions.get(nodeId);
    if (position) {
      position.locked = false;
    }
  }

  function stopZoomAnimation() {
    if (!zoomAnimationFrame) {
      return;
    }
    global.cancelAnimationFrame(zoomAnimationFrame);
    zoomAnimationFrame = null;
  }

  function getTypePalette(type) {
    if (type === "person") {
      return {
        fill: "#c98b46",
        stroke: "#f1d7b8",
        label: "#ffffff",
      };
    }

    if (type === "event") {
      return {
        fill: "#5f8fb8",
        stroke: "#d8e7f4",
        label: "#ffffff",
      };
    }

    if (type === "definition") {
      return {
        fill: "#5f9a6d",
        stroke: "#d7eadc",
        label: "#ffffff",
      };
    }

    if (type === "experience") {
      return {
        fill: "#549c91",
        stroke: "#d3ece8",
        label: "#ffffff",
      };
    }

    if (type === "daily") {
      return {
        fill: "#8b6bb4",
        stroke: "#e6dcf4",
        label: "#ffffff",
      };
    }

    if (type === "folder") {
      return {
        fill: "#b89a4f",
        stroke: "#efe5c4",
        label: "#ffffff",
      };
    }

    if (type === "hub") {
      return {
        fill: "#c47b45",
        stroke: "#efd4be",
        label: "#ffffff",
      };
    }

    if (type === "procedure") {
      return {
        fill: "#7fa45a",
        stroke: "#dfeccc",
        label: "#ffffff",
      };
    }

    if (type === "question") {
      return {
        fill: "#ba6862",
        stroke: "#efd2cf",
        label: "#ffffff",
      };
    }

    return {
      fill: "#747aa8",
      stroke: "#dfe1f2",
      label: "#ffffff",
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

    if (isCompactGraphViewport()) {
      return initializeOrganicPositions(graph, width, height, degreeByNode);
    }

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
    const laneHeight = (height - 48) / laneCount;
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
      const laneTop = 24 + componentIndex * laneHeight;
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
    const { width, height } = getGraphDimensions();
    context.state.graphPositions = initializeGraphPositions(graph, width, height);
    context.state.graphZoom = 1;
    context.state.graphViewport.panX = 0;
    context.state.graphViewport.panY = 0;
    lastLayoutHeight = height;
    graphLayoutNeedsSettling = true;
    drawGraph();
  }

  function getGraphViewBox(dimensions = getGraphDimensions()) {
    const { width: canvasWidth, height: canvasHeight } = dimensions;
    const zoom = clamp(context.state.graphZoom || 1, MIN_GRAPH_ZOOM, MAX_GRAPH_ZOOM);
    const width = canvasWidth / zoom;
    const height = canvasHeight / zoom;
    const centeredX = (canvasWidth - width) / 2;
    const centeredY = (canvasHeight - height) / 2;
    const minX = Math.min(0, canvasWidth - width);
    const maxX = Math.max(0, canvasWidth - width);
    const minY = Math.min(0, canvasHeight - height);
    const maxY = Math.max(0, canvasHeight - height);
    return {
      x: clamp(centeredX + (context.state.graphViewport.panX || 0), minX, maxX),
      y: clamp(centeredY + (context.state.graphViewport.panY || 0), minY, maxY),
      width,
      height,
    };
  }

  function drawGraph() {
    const graph = buildGraphModel();
    const dimensions = getGraphDimensions();
    const { width, height } = dimensions;
    const centerX = width / 2;
    const centerY = height / 2;
    const zoom = clamp(context.state.graphZoom || 1, MIN_GRAPH_ZOOM, MAX_GRAPH_ZOOM);
    const viewBox = getGraphViewBox(dimensions);
    const focusNodeId = context.state.graphSelection?.id || null;
    const adjacency = buildAdjacency(graph);
    const focusNeighbors = focusNodeId ? adjacency.get(focusNodeId) || new Set() : new Set();

    if (Math.abs(lastLayoutHeight - height) > 80) {
      context.state.graphPositions = new Map();
      context.state.graphViewport.panX = 0;
      context.state.graphViewport.panY = 0;
      lastLayoutHeight = height;
    }

    context.elements.graphCanvas.setAttribute(
      "viewBox",
      `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`
    );

    const hasAllPositions = graph.nodes.every((node) => context.state.graphPositions.has(node.id));
    if (!hasAllPositions) {
      context.state.graphPositions = initializeGraphPositions(graph, width, height);
    }

    const simulationPasses =
      !hasAllPositions || graphLayoutNeedsSettling
        ? 180
        : context.state.graphDrag.mode
          ? 2
          : 10;
    graphLayoutNeedsSettling = false;

    for (let pass = 0; pass < simulationPasses; pass += 1) {
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
        position.x = context.helpers.clamp(position.x, 38, width - 38);
        const verticalInset = height > 900 ? 118 : -90;
        position.y = context.helpers.clamp(position.y, verticalInset, height - verticalInset);
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
      const isFocusEdge =
        Boolean(focusNodeId) && (edge.from === focusNodeId || edge.to === focusNodeId);
      const isMutedEdge = Boolean(focusNodeId) && !isFocusEdge;
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", from.x);
      line.setAttribute("y1", from.y);
      line.setAttribute("x2", to.x);
      line.setAttribute("y2", to.y);
      line.setAttribute(
        "class",
        `graph-edge${edge.kind === "tag" ? " is-tag-edge" : ""}${
          isFocusEdge ? " is-focus-edge" : ""
        }${isMutedEdge ? " is-muted" : ""}`
      );
      context.elements.graphCanvas.appendChild(line);
    });

    graph.nodes.forEach((node) => {
      const position = context.state.graphPositions.get(node.id);
      const isCurrent = node.kind === "note" && node.noteId === context.state.activeNoteId;
      const isSelected =
        context.state.graphSelection &&
        context.state.graphSelection.kind === node.kind &&
        context.state.graphSelection.id === node.id;
      const isRelatedToFocus =
        !focusNodeId || node.id === focusNodeId || focusNeighbors.has(node.id) || isSelected;
      const degree = getNodeDegree(node.id, graph.edges);
      const labelMode = getGraphLabelMode(node, degree, zoom, isCurrent, isSelected);
      const shouldShowLabel = Boolean(labelMode);
      const palette =
        node.kind === "tag"
          ? { fill: "#69a77a", stroke: "#dcf0e1", label: "#ffffff" }
          : getTypePalette(node.type);
      const nodeFill = palette.fill;
      const nodeStroke = isCurrent || isSelected ? "#ffffff" : palette.stroke;
      const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
      group.dataset.graphNodeId = node.id;
      group.dataset.graphNodeKind = node.kind;
      group.setAttribute("role", "button");
      group.setAttribute("tabindex", "0");
      group.setAttribute("aria-label", node.kind === "tag" ? `Tag ${node.label}` : node.label);
      group.style.cursor = "pointer";

      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", position.x);
      circle.setAttribute("cy", position.y);
      const nodeRadius =
        node.kind === "tag"
          ? 8 + Math.min(degree * 1.35, 9)
          : isCurrent
            ? 18 + Math.min(degree * 1.35, 11)
            : 9 + Math.min(degree * 1.6, 15);

      const hitArea = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      hitArea.setAttribute("cx", position.x);
      hitArea.setAttribute("cy", position.y);
      hitArea.setAttribute("r", String(Math.max(24, nodeRadius + 11)));
      hitArea.setAttribute("class", "graph-node-hitbox");
      group.appendChild(hitArea);

      circle.setAttribute("r", String(nodeRadius));
      circle.setAttribute(
        "class",
        `graph-node${isCurrent ? " is-current" : ""}${isSelected ? " is-selected" : ""}${
          focusNeighbors.has(node.id) ? " is-neighbor" : ""
        }${!isRelatedToFocus ? " is-muted" : ""}`
      );
      circle.style.fill = isSelected ? "#8b6cf6" : nodeFill;
      circle.style.stroke = isSelected ? "#c4b5fd" : nodeStroke;
      circle.style.strokeWidth = isCurrent || isSelected ? "3" : "2";

      group.appendChild(circle);
      if (shouldShowLabel) {
        const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
        label.setAttribute(
          "x",
          isSelected ? position.x : position.x + nodeRadius + (labelMode === "compact" ? 5 : 7)
        );
        label.setAttribute("y", isSelected ? position.y + nodeRadius + 16 : position.y + 3);
        if (isSelected) {
          label.setAttribute("text-anchor", "middle");
        }
        label.setAttribute(
          "class",
          [
            "graph-label",
            node.kind === "tag" ? "is-tag-label" : "",
            labelMode === "compact" ? "is-compact" : "",
            isCurrent || isSelected ? "is-key" : "",
            !isRelatedToFocus ? "is-muted" : "",
          ]
            .filter(Boolean)
            .join(" ")
        );
        label.style.fill = palette.label;
        label.textContent = node.label;
        group.appendChild(label);
      }
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
      if (context.state.graphSelection) {
        context.state.graphSelection = null;
        drawGraph();
      }
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
    if (!context.state.graphDrag.mode) {
      context.state.graphDrag.activePointers = {};
    }
    updateActivePointer(event);
    stopZoomAnimation();

    if (event.pointerType === "touch" && getTouchPointerCount() > 1) {
      releaseLockedNode();
      startPinchGesture();
      event.preventDefault();
      return;
    }

    const group = event.target.closest("[data-graph-node-id]");
    context.state.graphDrag.pointerId = event.pointerId;
    context.state.graphDrag.moved = false;
    context.state.graphDrag.startClientX = event.clientX;
    context.state.graphDrag.startClientY = event.clientY;

    if (group && event.pointerType !== "touch") {
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

    if (getTouchPointerCount() > 1) {
      if (context.state.graphDrag.mode !== "pinch") {
        releaseLockedNode();
        startPinchGesture();
      }
      handlePinchMove(event);
      return;
    }

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
      28,
      getGraphDimensions().width - 28
    );
    position.y = context.helpers.clamp(
      point.y - context.state.graphDrag.offsetY,
      28,
      getGraphDimensions().height - 28
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
      continuePanAfterPinch();
      return;
    }

    if (context.state.graphDrag.pointerId !== event.pointerId) {
      return;
    }

    if (context.state.graphDrag.moved) {
      context.state.graphDrag.suppressClickUntil = Date.now() + 280;
    }
    releaseLockedNode();
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
      pointerId: event.pointerId,
      pointerType: event.pointerType,
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

  function getTouchPointerCount() {
    return getActivePointerEntries().filter((pointer) => pointer.pointerType === "touch").length;
  }

  function startPinchGesture() {
    const pointers = getActivePointerEntries().filter((pointer) => pointer.pointerType === "touch");
    if (pointers.length < 2) {
      return;
    }

    releaseLockedNode();

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

  function continuePanAfterPinch() {
    const [pointer] = getActivePointerEntries().filter((entry) => entry.pointerType === "touch");
    if (!pointer) {
      return;
    }

    context.state.graphDrag.mode = "pan";
    context.state.graphDrag.pointerId = pointer.pointerId;
    context.state.graphDrag.startClientX = pointer.clientX;
    context.state.graphDrag.startClientY = pointer.clientY;
    context.state.graphDrag.startPanX = context.state.graphViewport.panX || 0;
    context.state.graphDrag.startPanY = context.state.graphViewport.panY || 0;
    context.state.graphDrag.moved = false;
  }

  function handlePinchMove(event) {
    const pointers = getActivePointerEntries().filter((pointer) => pointer.pointerType === "touch");
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
      MIN_GRAPH_ZOOM,
      MAX_GRAPH_ZOOM
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

  function handleGraphWheel(event) {
    stopZoomAnimation();

    if (event.ctrlKey || event.metaKey) {
      const zoomFactor = Math.exp(-event.deltaY * 0.0022);
      setZoomAtPoint(
        (context.state.graphZoom || 1) * zoomFactor,
        event.clientX,
        event.clientY
      );
      context.state.graphDrag.suppressClickUntil = Date.now() + 140;
      event.preventDefault();
      return;
    }

    const viewBox = getGraphViewBox();
    const rect = context.elements.graphCanvas.getBoundingClientRect();
    const scaleX = viewBox.width / rect.width;
    const scaleY = viewBox.height / rect.height;

    context.state.graphViewport.panX = (context.state.graphViewport.panX || 0) + event.deltaX * scaleX;
    context.state.graphViewport.panY = (context.state.graphViewport.panY || 0) + event.deltaY * scaleY;
    context.state.graphDrag.suppressClickUntil = Date.now() + 80;
    drawGraph();
    event.preventDefault();
  }

  function setZoomAtPoint(nextZoom, clientX, clientY, focalGraphX = null, focalGraphY = null) {
    const rect = context.elements.graphCanvas.getBoundingClientRect();
    const dimensions = getGraphDimensions();
    const currentViewBox = getGraphViewBox(dimensions);
    const safeZoom = clamp(nextZoom, MIN_GRAPH_ZOOM, MAX_GRAPH_ZOOM);
    const nextWidth = dimensions.width / safeZoom;
    const nextHeight = dimensions.height / safeZoom;
    const centeredX = (dimensions.width - nextWidth) / 2;
    const centeredY = (dimensions.height - nextHeight) / 2;
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

  function animateZoomTo(nextZoom, clientX, clientY) {
    stopZoomAnimation();

    const startZoom = context.state.graphZoom || 1;
    const targetZoom = clamp(nextZoom, MIN_GRAPH_ZOOM, MAX_GRAPH_ZOOM);
    if (Math.abs(targetZoom - startZoom) < 0.01) {
      setZoomAtPoint(targetZoom, clientX, clientY);
      return;
    }

    const rect = context.elements.graphCanvas.getBoundingClientRect();
    const currentViewBox = getGraphViewBox();
    const ratioX = clamp((clientX - rect.left) / rect.width, 0, 1);
    const ratioY = clamp((clientY - rect.top) / rect.height, 0, 1);
    const focalGraphX = currentViewBox.x + ratioX * currentViewBox.width;
    const focalGraphY = currentViewBox.y + ratioY * currentViewBox.height;
    const startTime = global.performance.now();
    const duration = 180;

    const tick = (now) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const interpolatedZoom = startZoom + (targetZoom - startZoom) * eased;
      setZoomAtPoint(interpolatedZoom, clientX, clientY, focalGraphX, focalGraphY);

      if (progress < 1) {
        zoomAnimationFrame = global.requestAnimationFrame(tick);
        return;
      }

      zoomAnimationFrame = null;
    };

    zoomAnimationFrame = global.requestAnimationFrame(tick);
  }

  function zoomIn() {
    const rect = context.elements.graphCanvas.getBoundingClientRect();
    animateZoomTo(
      (context.state.graphZoom || 1) * 1.18,
      rect.left + rect.width / 2,
      rect.top + rect.height / 2
    );
  }

  function zoomOut() {
    const rect = context.elements.graphCanvas.getBoundingClientRect();
    animateZoomTo(
      (context.state.graphZoom || 1) / 1.18,
      rect.left + rect.width / 2,
      rect.top + rect.height / 2
    );
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
    handleGraphWheel,
    recenterGraphLayout,
    renderGraphFocus,
    zoomIn,
    zoomOut,
  };
  };
})(window);
