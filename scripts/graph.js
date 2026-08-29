(function initializeGraphModule(global) {
  const AtlasApp = (global.AtlasApp = global.AtlasApp || {});

  AtlasApp.createGraphModule = function createGraphModule(context) {
    const { clamp, escapeHtml, extractLinks, extractSummary, unique } = AtlasApp.helpers;
    // Le monde du graphe est fixe et bien plus grand que l'ecran. Avant, il
    // epousait la fenetre : la disposition remplissait donc l'ecran bord a
    // bord, sans un pixel de vide autour, et deplacer la vue etait impossible
    // au zoom 1. Un monde fixe donne trois choses d'un coup : du vide autour
    // du nuage, une vue qu'on promene dedans, et des positions identiques sur
    // telephone et sur bureau.
    const WORLD_WIDTH = 4200;
    const WORLD_HEIGHT = 2800;

    // La disposition n'occupe que le centre du monde : le reste est le vide
    // dans lequel on se promene.
    const LAYOUT_FILL = 0.72;

    // Les distances de la disposition sont multipliees par ce facteur, mais
    // pas le rayon des noeuds ni la taille des etiquettes. C'est le seul
    // reglage qui cree vraiment de l'air : agrandir tout dans les memes
    // proportions redonne exactement la meme image, en plus petit.
    const LAYOUT_SPREAD = 2.2;
    const REPULSION = 10000 * LAYOUT_SPREAD * LAYOUT_SPREAD * LAYOUT_SPREAD;

    // Le zoom vaut le nombre de pixels par unite du monde. Au zoom 1 un noeud
    // occupe a l'ecran exactement ce qu'il occupait avant ce changement.
    const MIN_GRAPH_ZOOM = 0.08;
    const MAX_GRAPH_ZOOM = 4.4;

    // On peut sortir d'une demi-fenetre au-dela des bords du monde : sans ce
    // debord, le vide s'arrete net et la sensation d'espace tombe.
    const VIEW_OVERSCROLL = 0.5;

    // Cadrage a l'ouverture : le nuage entier, avec une marge, mais jamais
    // assez loin pour que les noeuds deviennent des poussieres.
    const FIT_MARGIN = 1.18;
    const MAX_FIT_ZOOM = 1.15;

    // Plancher du cadrage d'ouverture : en dessous, les noeuds deviennent des
    // poussieres. Il est plus bas sur telephone, ou un plancher de bureau
    // deposerait le lecteur au milieu du nuage sans lui montrer sa forme.
    const MIN_FIT_ZOOM = 0.38;
    const MIN_FIT_ZOOM_COMPACT = 0.22;

    // En dessous de ce zoom, seuls les carrefours gardent une etiquette. Les
    // etiquettes ne retrecissant plus avec le recul, les afficher toutes en
    // vue d'ensemble remplirait de texte l'espace qu'on vient de degager.
    const LABEL_CROWD_ZOOM = 0.62;

    const FALLBACK_VIEWPORT_WIDTH = 960;
    const FALLBACK_VIEWPORT_HEIGHT = 620;
    const GRAPH_LABEL_BREAKPOINT = "(max-width: 780px)";

    // Les positions du graphe coutaient un reglage complet a chaque
    // rechargement de page : 0,6 s a 136 pages, 2,6 s a 303, 9,6 s a 603,
    // le tout en O(N2) et en bloquant l'onglet. Les conserver rend ce cout
    // ponctuel au lieu de quotidien, sans changer le dessin obtenu.
    const graphPositionsStorageKey = `${AtlasApp.config.appStorageKey}-graph-positions`;
    let savePositionsTimer = null;

    // Une seule disposition, desormais. Il fallait auparavant en garder une
    // par format d'affichage parce que l'espace logique suivait l'ecran : une
    // visite sur telephone abimait durablement la disposition de bureau. Le
    // monde etant fixe, les deux appareils travaillent sur les memes
    // coordonnees et partagent la meme disposition.
    function currentLayoutMode() {
      return "world";
    }

    function readStoredPositions(mode, width, height) {
      try {
        const brut = window.localStorage.getItem(graphPositionsStorageKey);
        const parse = brut ? JSON.parse(brut) : null;
        const entree = parse && typeof parse === "object" ? parse[mode] : null;
        if (!entree || typeof entree.positions !== "object") {
          return new Map();
        }

        // Dimensions trop differentes : mieux vaut recalculer que recadrer.
        if (
          !Number.isFinite(entree.height) ||
          Math.abs(entree.height - height) > 80 ||
          !Number.isFinite(entree.width) ||
          Math.abs(entree.width - width) > 80
        ) {
          return new Map();
        }

        const positions = new Map();
        for (const [id, valeur] of Object.entries(entree.positions)) {
          if (Number.isFinite(valeur?.x) && Number.isFinite(valeur?.y)) {
            positions.set(id, { x: valeur.x, y: valeur.y, locked: Boolean(valeur.locked) });
          }
        }
        return positions;
      } catch (error) {
        return new Map();
      }
    }

    function scheduleStorePositions(mode, width, height) {
      if (savePositionsTimer) {
        window.clearTimeout(savePositionsTimer);
      }

      savePositionsTimer = window.setTimeout(() => {
        savePositionsTimer = null;
        try {
          const positions = {};
          context.state.graphPositions.forEach((valeur, id) => {
            positions[id] = {
              x: Math.round(valeur.x * 10) / 10,
              y: Math.round(valeur.y * 10) / 10,
              locked: Boolean(valeur.locked),
            };
          });

          // On reecrit l'objet au lieu de le completer : les anciennes entrees
          // "compact" et "wide" ne sont plus lues et resteraient sinon
          // indefiniment dans le stockage.
          window.localStorage.setItem(
            graphPositionsStorageKey,
            JSON.stringify({ [mode]: { width, height, positions } })
          );
        } catch (error) {
          // Le graphe se recalculera au prochain chargement : rien de perdu.
        }
      }, 900);
    }
    let zoomAnimationFrame = null;
    let graphLayoutNeedsSettling = false;
    let graphViewNeedsFraming = true;
    let retryLayoutFrame = null;
    let retryLayoutCount = 0;

    // Le premier dessin arrive parfois avant que la zone du graphe ait sa
    // taille : le panneau vient d'etre affiche et la mise en page n'a pas
    // encore eu lieu. Cadrer sur des dimensions de repli placerait la vue sur
    // un coin vide du monde, et plus rien ne la ramenerait. On repasse donc
    // jusqu'a ce que la zone soit mesurable, sans jamais boucler indefiniment
    // si l'onglet reste cache.
    const MAX_LAYOUT_RETRIES = 12;

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
          edges.push({
            from: note.id,
            to: target.id,
            kind: "note",
            distance: 140 * LAYOUT_SPREAD,
          });
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
            edges.push({
              from: note.id,
              to: tagId,
              kind: "tag",
              distance: 110 * LAYOUT_SPREAD,
            });
          });
      });
    }

    return { nodes, edges };
  }

  // Tous les noeuds possibles, filtres compris. L'elagage des positions doit
  // raisonner la-dessus et non sur le graphe affiche : un filtre par tag ou la
  // vue voisinage ne montre qu'une poignee de pages, et elaguer sur cette
  // poignee jetait la position de toutes les autres. Au retour en vue
  // complete elles revenaient au barycentre de leurs voisins, et la
  // disposition entiere s'effondrait sur elle-meme.
  function getAllGraphNodeIds() {
    const ids = new Set();
    context.state.notes.forEach((note) => {
      ids.add(note.id);
      note.tags.forEach((tag) => ids.add(`tag::${tag}`));
    });
    return ids;
  }

  function getNodeDegree(nodeId, edges) {
    return edges.filter((edge) => edge.from === nodeId || edge.to === nodeId).length;
  }

  function isCompactGraphViewport() {
    return global.matchMedia?.(GRAPH_LABEL_BREAKPOINT)?.matches ?? false;
  }

  // Le monde ne depend plus de l'ecran. Il epousait la zone affichee, ce qui
  // avait deux consequences genantes : aucun vide autour du nuage, et le
  // moindre redimensionnement de fenetre jetait la disposition enregistree.
  function getWorldSize() {
    return { width: WORLD_WIDTH, height: WORLD_HEIGHT };
  }

  // La zone dans laquelle la disposition est calculee : le centre du monde.
  // Ce qui deborde autour est le vide qu'on parcourt.
  function getLayoutBox() {
    const width = WORLD_WIDTH * LAYOUT_FILL;
    const height = WORLD_HEIGHT * LAYOUT_FILL;
    return {
      x: (WORLD_WIDTH - width) / 2,
      y: (WORLD_HEIGHT - height) / 2,
      width,
      height,
    };
  }

  function getViewportPixels() {
    const rect = context.elements.graphCanvas?.getBoundingClientRect();
    if (!rect?.width || !rect?.height) {
      return { width: FALLBACK_VIEWPORT_WIDTH, height: FALLBACK_VIEWPORT_HEIGHT };
    }
    return { width: rect.width, height: rect.height };
  }

  // La fenetre de vue, exprimee en unites du monde. Elle garde exactement les
  // proportions de la zone affichee : sans cela le navigateur ajouterait ses
  // propres bandes et les conversions pixel vers monde seraient fausses.
  function getViewSpan(zoom) {
    const viewport = getViewportPixels();
    const safeZoom = clamp(zoom, MIN_GRAPH_ZOOM, MAX_GRAPH_ZOOM);
    return { width: viewport.width / safeZoom, height: viewport.height / safeZoom };
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
    const radiusX = width * 0.44;
    const radiusY = height * 0.44;
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

    // Les regles ci-dessous affichent une etiquette des qu'un noeud a assez de
    // voisins, quel que soit le zoom. C'etait sans consequence tant que le
    // texte retrecissait avec le recul ; il ne retrecit plus. En vue large,
    // seuls les carrefours gardent donc leur nom -- et sur telephone, ou le
    // texte est plus gros et le recul plus grand, aucun : meme les carrefours
    // s'y chevauchaient.
    if (zoom < LABEL_CROWD_ZOOM && (compactViewport || degree < 7)) {
      return null;
    }

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

  function restoreDraggedNodeLock(
    nodeId = context.state.graphDrag.nodeId,
    wasLocked = context.state.graphDrag.wasLocked
  ) {
    if (!nodeId) {
      return;
    }

    const position = context.state.graphPositions.get(nodeId);
    if (position) {
      position.locked = Boolean(wasLocked);
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

  // La disposition est calculee dans un repere local qui part de zero, puis
  // deposee au centre du monde. Les fonctions ci-dessous n'ont donc pas a
  // savoir ou se trouve la boite : elles raisonnent sur sa seule taille.
  function initializeGraphPositions(graph, box = getLayoutBox()) {
    const positions = computeLayoutPositions(graph, box.width, box.height);
    positions.forEach((position) => {
      position.x += box.x;
      position.y += box.y;
    });
    return positions;
  }

  function computeLayoutPositions(graph, width, height) {
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

  // Un nouveau noeud apparait au barycentre de ses voisins deja places,
  // legerement decale pour ne pas se superposer. Sans voisin connu, au centre.
  function placeNewNodes(nodes, adjacency) {
    const world = getWorldSize();
    const box = getLayoutBox();
    nodes.forEach((node, index) => {
      const voisins = [...(adjacency.get(node.id) || [])]
        .map((id) => context.state.graphPositions.get(id))
        .filter(Boolean);

      const base = voisins.length
        ? {
            x: voisins.reduce((somme, position) => somme + position.x, 0) / voisins.length,
            y: voisins.reduce((somme, position) => somme + position.y, 0) / voisins.length,
          }
        : { x: box.x + box.width / 2, y: box.y + box.height / 2 };

      const angle = (index / Math.max(nodes.length, 1)) * Math.PI * 2;
      const ecart = 46 * LAYOUT_SPREAD;
      context.state.graphPositions.set(node.id, {
        x: clamp(base.x + Math.cos(angle) * ecart, 38, world.width - 38),
        y: clamp(base.y + Math.sin(angle) * ecart, 38, world.height - 38),
        locked: false,
      });
    });
  }

  // Filtrer par tag ou passer en vue voisinage ne laisse parfois que trois
  // pages a l'ecran : sans recadrage elles resteraient minuscules dans un coin
  // du monde, a l'echelle du graphe entier.
  function scheduleLayoutRetry() {
    if (retryLayoutFrame || retryLayoutCount >= MAX_LAYOUT_RETRIES) {
      return;
    }

    retryLayoutCount += 1;
    retryLayoutFrame = global.requestAnimationFrame(() => {
      retryLayoutFrame = null;
      drawGraph();
    });
  }

  function requestGraphFraming() {
    graphViewNeedsFraming = true;
  }

  function recenterGraphLayout() {
    const graph = buildGraphModel();
    context.state.graphPositions = initializeGraphPositions(graph);
    context.state.graphViewport.panX = 0;
    context.state.graphViewport.panY = 0;
    graphLayoutNeedsSettling = true;
    graphViewNeedsFraming = true;
    drawGraph();
  }

  // La repulsion gonfle le nuage jusqu'a ce que les bornes l'arretent : sans
  // cette etape il se plaque contre les bords du monde, exactement comme il se
  // plaquait contre ceux de l'ecran avant ce changement. On le ramene donc
  // dans la boite centrale. Jamais dans l'autre sens : un graphe de dix pages
  // doit rester groupe au milieu, pas etre ecartele pour remplir la boite.
  function shrinkPositionsIntoLayoutBox(graph) {
    const points = graph.nodes
      .map((node) => context.state.graphPositions.get(node.id))
      .filter(Boolean);

    if (points.length < 2) {
      return;
    }

    const box = getLayoutBox();
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    points.forEach((position) => {
      minX = Math.min(minX, position.x);
      maxX = Math.max(maxX, position.x);
      minY = Math.min(minY, position.y);
      maxY = Math.max(maxY, position.y);
    });

    const largeur = Math.max(maxX - minX, 1);
    const hauteur = Math.max(maxY - minY, 1);
    const facteur = Math.min(1, box.width / largeur, box.height / hauteur);
    const centreX = (minX + maxX) / 2;
    const centreY = (minY + maxY) / 2;
    const cibleX = box.x + box.width / 2;
    const cibleY = box.y + box.height / 2;

    points.forEach((position) => {
      position.x = cibleX + (position.x - centreX) * facteur;
      position.y = cibleY + (position.y - centreY) * facteur;
    });
  }

  // Cadre la vue sur le nuage plutot que sur le monde. Cadrer le monde entier
  // reduirait les noeuds a des poussieres : l'espace gagne entre eux serait
  // aussitot repris par l'eloignement de la vue.
  function frameViewOnNodes(graph) {
    const points = graph.nodes
      .map((node) => context.state.graphPositions.get(node.id))
      .filter(Boolean);

    if (!points.length) {
      return;
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    points.forEach((position) => {
      minX = Math.min(minX, position.x);
      maxX = Math.max(maxX, position.x);
      minY = Math.min(minY, position.y);
      maxY = Math.max(maxY, position.y);
    });

    const viewport = getViewportPixels();
    const largeurNuage = Math.max(maxX - minX, 1) * FIT_MARGIN;
    const hauteurNuage = Math.max(maxY - minY, 1) * FIT_MARGIN;

    context.state.graphZoom = clamp(
      Math.min(viewport.width / largeurNuage, viewport.height / hauteurNuage),
      isCompactGraphViewport() ? MIN_FIT_ZOOM_COMPACT : MIN_FIT_ZOOM,
      MAX_FIT_ZOOM
    );

    // panX est un ecart par rapport a la vue centree sur le monde ; la
    // largeur de la fenetre s'y annule, quel que soit le zoom.
    context.state.graphViewport.panX = (minX + maxX) / 2 - WORLD_WIDTH / 2;
    context.state.graphViewport.panY = (minY + maxY) / 2 - WORLD_HEIGHT / 2;
  }

  // La vue pouvait auparavant se deplacer entre 0 et zero au zoom 1 : elle
  // etait litteralement clouee sur le rectangle du monde. Elle se promene
  // desormais dans le monde, et peut meme deborder de ses bords.
  function getGraphViewBox(zoom = context.state.graphZoom || 1) {
    const { width, height } = getViewSpan(zoom);
    const centeredX = (WORLD_WIDTH - width) / 2;
    const centeredY = (WORLD_HEIGHT - height) / 2;
    const debordX = width * VIEW_OVERSCROLL;
    const debordY = height * VIEW_OVERSCROLL;
    const premierX = -debordX;
    const dernierX = WORLD_WIDTH - width + debordX;
    const premierY = -debordY;
    const dernierY = WORLD_HEIGHT - height + debordY;
    return {
      x: clamp(
        centeredX + (context.state.graphViewport.panX || 0),
        Math.min(premierX, dernierX),
        Math.max(premierX, dernierX)
      ),
      y: clamp(
        centeredY + (context.state.graphViewport.panY || 0),
        Math.min(premierY, dernierY),
        Math.max(premierY, dernierY)
      ),
      width,
      height,
    };
  }

  function drawGraph() {
    const graph = buildGraphModel();
    const { width, height } = getWorldSize();
    const centerX = width / 2;
    const centerY = height / 2;
    const focusNodeId = context.state.graphSelection?.id || null;
    const adjacency = buildAdjacency(graph);
    const focusNeighbors = focusNodeId ? adjacency.get(focusNodeId) || new Set() : new Set();

    // Le monde ne bouge plus avec la fenetre : redimensionner l'ecran ne jette
    // donc plus la disposition. C'est tout ce que faisait le controle qui se
    // trouvait ici.

    const layoutMode = currentLayoutMode();
    if (!context.state.graphPositions.size) {
      context.state.graphPositions = readStoredPositions(layoutMode, width, height);
    }

    const nouveaux = graph.nodes.filter((node) => !context.state.graphPositions.has(node.id));
    const partDeZero = context.state.graphPositions.size === 0;

    if (partDeZero) {
      context.state.graphPositions = initializeGraphPositions(graph);
      graphViewNeedsFraming = true;
    } else if (nouveaux.length) {
      // Ajouter une page ne jette plus la disposition entiere : les nouveaux
      // venus se placent pres de leurs voisins deja positionnes, et une
      // courte relaxation suffit a les integrer.
      placeNewNodes(nouveaux, adjacency);
    }

    // A l'ajout de pages, seuls les nouveaux venus se deplacent. Laisser toute
    // la disposition se reorganiser deplacait les anciens noeuds de 90 px en
    // moyenne : la carte mentale du graphe changeait a chaque page creee.
    //
    // Et aucune passe : un nouveau noeud subit la repulsion de toutes les pages
    // figees sans rien pour le retenir hormis ses quelques liens. Avec 24 passes
    // il finissait ejecte contre le bord, avec 6 encore a 400 px de ses voisins.
    // Le placement au barycentre est deja le bon endroit ; simuler ne fait que
    // l'en eloigner.
    const noeudsAdeplacer =
      !partDeZero && !graphLayoutNeedsSettling && nouveaux.length
        ? new Set(nouveaux.map((node) => node.id))
        : null;

    // Rien n'a change depuis la derniere fois : aucune passe. Les dix passes
    // de retouche appliquees jusqu'ici faisaient deriver le graphe de 31 px en
    // moyenne a chaque ouverture, sans rien ameliorer. Le dessin qu'on quitte
    // est desormais celui qu'on retrouve.
    const simulationPasses =
      partDeZero || graphLayoutNeedsSettling
        ? 180
        : context.state.graphDrag.mode
          ? 2
          : 0;
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
          // Repulsion relevee de 2800 a 10000. Mesure sur 136 noeuds de rayon
          // moyen 30 px : l'espacement au plus proche voisin passe de 52 a 63 px
          // et les chevauchements de 107 a 69. Au-dela, le gain sature et les
          // noeuds se plaquent contre les bords.
          //
          // Le cube vient de la mise a l'echelle : pour que la disposition
          // garde la meme forme en s'etalant d'un facteur k, les distances de
          // repos sont multipliees par k et la repulsion par k au cube. La
          // regler seule ne ferait qu'ecarteler la meme figure.
          const repulsion = REPULSION / (distance * distance);
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

        if (noeudsAdeplacer && !noeudsAdeplacer.has(node.id)) {
          return;
        }

        const force = forces.get(node.id);
        position.x += force.x + (centerX - position.x) * 0.002;
        position.y += force.y + (centerY - position.y) * 0.002;
        // Les noeuds restent dans le monde, mais sans etre plaques contre ses
        // bords : la marge garantit qu'il y a toujours du vide au-dela du nuage.
        const margeX = width * 0.06;
        const margeY = height * 0.06;
        position.x = context.helpers.clamp(position.x, margeX, width - margeX);
        position.y = context.helpers.clamp(position.y, margeY, height - margeY);
      });
    }

    // Recentrer apres coup, et seulement quand la disposition entiere vient
    // d'etre calculee : a l'ajout d'une page, deplacer tout le monde de
    // quelques pixels annulerait la stabilite gagnee juste au-dessus.
    if (simulationPasses > 2) {
      shrinkPositionsIntoLayoutBox(graph);
    }

    // Les pages supprimees laissaient leur position derriere elles ; on elague
    // pour que ni la memoire ni le stockage ne grossissent indefiniment.
    const vivants = getAllGraphNodeIds();
    if (context.state.graphPositions.size > vivants.size) {
      context.state.graphPositions.forEach((_, id) => {
        if (!vivants.has(id)) {
          context.state.graphPositions.delete(id);
        }
      });
    }

    scheduleStorePositions(layoutMode, width, height);

    // Le cadrage vient apres la disposition : il lui faut les positions
    // definitives. Et seulement quand la zone est reellement affichee, sinon
    // il se calculerait sur les dimensions de repli.
    const zoneAffichee = context.elements.graphCanvas.getBoundingClientRect();
    const zoneMesurable = zoneAffichee.width > 0 && zoneAffichee.height > 0;

    if (!zoneMesurable) {
      scheduleLayoutRetry();
    } else {
      retryLayoutCount = 0;
      if (graphViewNeedsFraming) {
        frameViewOnNodes(graph);
        graphViewNeedsFraming = false;
      }
    }

    const zoom = clamp(context.state.graphZoom || 1, MIN_GRAPH_ZOOM, MAX_GRAPH_ZOOM);

    if (zoneMesurable) {
      const viewBox = getGraphViewBox(zoom);
      context.elements.graphCanvas.setAttribute(
        "viewBox",
        `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`
      );
    }

    // Les etiquettes sont ecrites en unites du monde : sans compensation elles
    // retrecissaient avec le zoom et devenaient illisibles des qu'on prenait du
    // recul. Les noeuds, eux, doivent bien retrecir : c'est ce qui donne la
    // sensation d'espace.
    context.elements.graphCanvas.style.setProperty("--graph-label-scale", String(1 / zoom));
    const labelScale = 1 / zoom;

    context.elements.graphCanvas.innerHTML = "";

    if (!graph.nodes.length) {
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
      const isDragging =
        context.state.graphDrag.mode === "node" && context.state.graphDrag.nodeId === node.id;
      const degree = getNodeDegree(node.id, graph.edges);
      const labelMode = getGraphLabelMode(node, degree, zoom, isCurrent, isSelected);
      const effectiveLabelMode = labelMode || (position.locked ? "compact" : null);
      const shouldShowLabel = Boolean(effectiveLabelMode);
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
      group.setAttribute(
        "aria-label",
        `${node.kind === "tag" ? `Tag ${node.label}` : node.label}${
          position.locked ? ", épinglé" : ""
        }`
      );
      group.style.cursor = isDragging ? "grabbing" : "grab";

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
        }${position.locked ? " is-pinned" : ""}${isDragging ? " is-dragging" : ""}${
          !isRelatedToFocus ? " is-muted" : ""
        }`
      );
      circle.style.fill = isSelected ? "#8b6cf6" : nodeFill;
      circle.style.stroke = isSelected
        ? "#c4b5fd"
        : position.locked
          ? "#a78bfa"
          : nodeStroke;
      circle.style.strokeWidth = isCurrent || isSelected || position.locked ? "3" : "2";

      group.appendChild(circle);
      if (shouldShowLabel) {
        const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
        // Le decalage suit la taille apparente du texte, pas celle du monde :
        // sinon l'etiquette se decolle du noeud quand on prend du recul.
        label.setAttribute(
          "x",
          isSelected
            ? position.x
            : position.x +
              nodeRadius +
              (effectiveLabelMode === "compact" ? 5 : 7) * labelScale
        );
        label.setAttribute(
          "y",
          isSelected
            ? position.y + nodeRadius + 16 * labelScale
            : position.y + 3 * labelScale
        );
        if (isSelected) {
          label.setAttribute("text-anchor", "middle");
        }
        label.setAttribute(
          "class",
          [
            "graph-label",
            node.kind === "tag" ? "is-tag-label" : "",
            effectiveLabelMode === "compact" ? "is-compact" : "",
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
  }

  function setGraphSelectionFromNode(group) {
    if (!group) {
      context.state.graphSelection = null;
      return;
    }

    context.state.graphSelection = {
      kind: group.dataset.graphNodeKind,
      id: group.dataset.graphNodeId,
    };
  }

  function handleGraphClick(event) {
    if ((context.state.graphDrag.suppressClickUntil || 0) > Date.now()) {
      return;
    }

    const group = event.target.closest("[data-graph-node-id]");
    if (!group) {
      if (context.state.graphSelection) {
        setGraphSelectionFromNode(null);
        drawGraph();
      }
      return;
    }

    setGraphSelectionFromNode(group);

    if (context.state.graphSelection.kind === "note") {
      context.state.activeNoteId = context.state.graphSelection.id;
      context.renderers.renderEverything();
      return;
    }

    drawGraph();
  }

  function handleGraphPointerDown(event) {
    if (!context.state.graphDrag.mode) {
      context.state.graphDrag.activePointers = {};
    }
    updateActivePointer(event);
    stopZoomAnimation();
    context.elements.graphCanvas.setPointerCapture?.(event.pointerId);

    if (event.pointerType === "touch" && getTouchPointerCount() > 1) {
      restoreDraggedNodeLock();
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
      context.state.graphDrag.wasLocked = Boolean(position.locked);
      context.state.graphDrag.offsetX = point.x - position.x;
      context.state.graphDrag.offsetY = point.y - position.y;
      position.locked = true;
      event.preventDefault();
      return;
    }

    context.state.graphDrag.mode = "pan";
    context.state.graphDrag.nodeId = null;
    context.state.graphDrag.wasLocked = false;
    context.state.graphDrag.startPanX = context.state.graphViewport.panX || 0;
    context.state.graphDrag.startPanY = context.state.graphViewport.panY || 0;
    event.preventDefault();
  }

  function handleGraphPointerMove(event) {
    updateActivePointer(event);

    if (getTouchPointerCount() > 1) {
      if (context.state.graphDrag.mode !== "pinch") {
        restoreDraggedNodeLock();
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

    const dragDistance = Math.hypot(
      event.clientX - context.state.graphDrag.startClientX,
      event.clientY - context.state.graphDrag.startClientY
    );
    if (!context.state.graphDrag.moved && dragDistance < 5) {
      event.preventDefault();
      return;
    }

    const monde = getWorldSize();
    position.x = context.helpers.clamp(
      point.x - context.state.graphDrag.offsetX,
      28,
      monde.width - 28
    );
    position.y = context.helpers.clamp(
      point.y - context.state.graphDrag.offsetY,
      28,
      monde.height - 28
    );
    context.state.graphDrag.moved = true;
    drawGraph();
    event.preventDefault();
  }

  function handleGraphPointerUp(event) {
    removeActivePointer(event.pointerId);
    if (context.elements.graphCanvas.hasPointerCapture?.(event.pointerId)) {
      context.elements.graphCanvas.releasePointerCapture?.(event.pointerId);
    }

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

    const group = event.target.closest("[data-graph-node-id]");
    const isTap = event.pointerType === "touch" && !context.state.graphDrag.moved;
    const isNodeDrag = context.state.graphDrag.mode === "node";
    const wasCancelled = event.type === "pointercancel";
    const draggedNodeId = context.state.graphDrag.nodeId;
    const tapSelection =
      isNodeDrag && draggedNodeId
        ? {
            kind: draggedNodeId.startsWith("tag::") ? "tag" : "note",
            id: draggedNodeId,
          }
        : null;

    if (context.state.graphDrag.moved) {
      context.state.graphDrag.suppressClickUntil = Date.now() + 280;
    }
    if (isNodeDrag && (!context.state.graphDrag.moved || wasCancelled)) {
      restoreDraggedNodeLock();
    }
    context.state.graphDrag.mode = null;
    context.state.graphDrag.nodeId = null;
    context.state.graphDrag.pointerId = null;
    context.state.graphDrag.moved = false;
    context.state.graphDrag.wasLocked = false;

    if (isNodeDrag) {
      drawGraph();
    }

    if (!isTap || wasCancelled) {
      return;
    }

    if (tapSelection) {
      context.state.graphSelection = tapSelection;
    } else {
      setGraphSelectionFromNode(group);
    }
    context.state.graphDrag.suppressClickUntil = Date.now() + 280;

    if (context.state.graphSelection?.kind === "note") {
      context.state.activeNoteId = context.state.graphSelection.id;
      context.renderers.renderEverything();
      return;
    }

    drawGraph();
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

    restoreDraggedNodeLock();

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
    context.state.graphDrag.wasLocked = false;
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
    context.state.graphDrag.wasLocked = false;
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
    const currentViewBox = getGraphViewBox();
    const safeZoom = clamp(nextZoom, MIN_GRAPH_ZOOM, MAX_GRAPH_ZOOM);
    const { width: nextWidth, height: nextHeight } = getViewSpan(safeZoom);
    const centeredX = (WORLD_WIDTH - nextWidth) / 2;
    const centeredY = (WORLD_HEIGHT - nextHeight) / 2;
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
    handleGraphPointerDown,
    handleGraphPointerMove,
    handleGraphPointerUp,
    handleGraphWheel,
    recenterGraphLayout,
    requestGraphFraming,
    zoomIn,
    zoomOut,
  };
  };
})(window);
