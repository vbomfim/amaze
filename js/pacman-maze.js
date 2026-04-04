/**
 * PacManMazeGenerator — Generates mazes suited for PAC-MAN chase gameplay.
 *
 * Generates mazes with loops (NOT perfect mazes), a ghost house in the center,
 * semi-symmetrical layout, and positions for dots and power pellets.
 *
 * Algorithm:
 * 1. Start with all walls
 * 2. Carve corridors using modified Kruskal's (random spanning tree)
 * 3. Remove additional walls to create loops (~20% extra wall removals)
 * 4. Remove most dead ends (if a cell has 3 walls, remove one)
 * 5. Carve ghost house in center
 * 6. Mirror left half to right half (with some randomness)
 * 7. BFS verification that all open tiles are connected
 *
 * [TDD] [CLEAN-CODE] [SOLID]
 */

import { mulberry32 } from './maze.js';

class PacManMazeGenerator {
  /**
   * @param {Object} config
   * @param {number} config.width — odd number 15–31
   * @param {number} config.height — odd number 15–31
   * @param {number} [config.seed] — optional PRNG seed
   */
  constructor({ width, height, seed }) {
    this.#validate(width, height);
    this.width = width;
    this.height = height;
    this.random = seed !== null && seed !== undefined ? mulberry32(seed) : Math.random;
  }

  /**
   * Validate dimensions: must be odd integers in [15, 31].
   * @throws {Error} if dimensions are invalid
   */
  #validate(width, height) {
    if (!Number.isInteger(width) || !Number.isInteger(height)) {
      throw new Error('Width and height must be integers');
    }
    if (width % 2 === 0 || height % 2 === 0) {
      throw new Error('Width and height must be odd numbers');
    }
    if (width < 15 || height < 15) {
      throw new Error('Width and height must be at least 15');
    }
    if (width > 31 || height > 31) {
      throw new Error('Width and height must be at most 31');
    }
  }

  /**
   * Generate the PAC-MAN maze.
   * @returns {{
   *   map: number[][],
   *   ghostHouse: { row: number, col: number, width: number, height: number },
   *   startRow: number,
   *   startCol: number,
   *   dotPositions: number[][],
   *   powerPelletPositions: number[][]
   * }}
   */
  generate() {
    // Use a hand-designed template for classic arcade feel
    const map = this.#createTemplateMap();
    const ghostHouse = this.#findGhostHouse(map);

    const startRow = this.height - 2;
    const startCol = Math.floor(this.width / 2);
    map[startRow][startCol] = 0;

    const powerPelletPositions = this.#generatePowerPelletPositions(map);
    const dotPositions = this.#generateDotPositions(map, ghostHouse, startRow, startCol, powerPelletPositions);

    return {
      map,
      ghostHouse,
      startRow,
      startCol,
      dotPositions,
      powerPelletPositions,
    };
  }

  /**
   * Create an original PAC-MAN-style template maze.
   * Symmetrical, with ghost house, side tunnels, T-intersections.
   * Each template is for the LEFT half — mirrored to make the full maze.
   */
  #createTemplateMap() {
    // Templates: left-half rows (including center column).
    // 1=wall, 0=open. Each is mirrored left-to-right for full width.
    // Width = 2 * halfWidth - 1 (center column shared)
    const templates = [
      this.#template21x21(),
      this.#template25x25(),
      this.#template29x29(),
    ];

    // Pick template closest to requested size, or fallback to procedural
    let template = null;
    for (const t of templates) {
      if (t.length === this.height && (t[0].length * 2 - 1) === this.width) {
        template = t;
        break;
      }
    }

    if (!template) {
      // Fallback to procedural generation for non-template sizes
      return this.#createProceduralMap();
    }

    // Mirror left half to create full map
    const map = [];
    for (let r = 0; r < template.length; r++) {
      const left = template[r];
      const right = [...left].reverse();
      // Merge: left half + right half (skip center column duplicate)
      map[r] = [...left, ...right.slice(1)];
    }
    return map;
  }

  /** Find ghost house bounds in the map (region of 2s or known position) */
  #findGhostHouse(map) {
    const midR = Math.floor(this.height / 2);
    const midC = Math.floor(this.width / 2);
    // Ghost house is 5 wide × 3 tall centered in the map
    return {
      row: midR - 1,
      col: midC - 2,
      width: 5,
      height: 3,
    };
  }

  /** 21×21 template (left half = 11 columns) — original arcade-style design */
  #template21x21() {
    // W=wall(1), O=open(0). Left half including center column.
    // Mirror creates the right half.
    return [
      [1,1,1,1,1,1,1,1,1,1,1],
      [1,0,0,0,0,1,0,0,0,0,1],
      [1,0,1,1,0,1,0,1,1,0,1],
      [1,0,0,0,0,0,0,0,0,0,1],
      [1,0,1,1,0,1,1,1,0,1,1],
      [1,0,0,0,0,1,0,0,0,0,0],
      [1,1,1,1,0,1,0,1,1,0,1],
      [0,0,0,0,0,0,0,0,1,0,1],
      [1,1,1,1,0,1,0,0,0,0,1],
      [1,0,0,0,0,1,1,1,0,1,1],
      [1,0,1,1,0,0,0,0,0,0,1],
      [1,0,0,1,0,1,1,1,0,1,1],
      [1,1,0,0,0,1,0,0,0,0,0],
      [1,0,0,1,0,1,0,1,1,0,1],
      [1,0,1,1,0,0,0,0,1,0,1],
      [1,0,0,0,0,1,0,0,0,0,1],
      [1,0,1,1,1,1,0,1,1,0,1],
      [1,0,0,0,0,0,0,0,0,0,1],
      [1,0,1,0,1,1,1,1,0,1,1],
      [1,0,0,0,0,0,0,0,0,0,1],
      [1,1,1,1,1,1,1,1,1,1,1],
    ];
  }

  /** 25×25 template (left half = 13 columns) */
  #template25x25() {
    return [
      [1,1,1,1,1,1,1,1,1,1,1,1,1],
      [1,0,0,0,0,0,0,0,0,0,0,0,1],
      [1,0,1,1,0,1,1,1,0,1,1,0,1],
      [1,0,0,0,0,0,0,0,0,0,0,0,1],
      [1,0,1,1,0,1,0,1,0,1,1,0,1],
      [1,0,0,0,0,1,0,1,0,0,0,0,1],
      [1,1,1,1,0,1,0,0,0,1,1,1,1],
      [0,0,0,1,0,1,0,1,0,1,0,0,0],
      [1,1,0,0,0,0,0,1,0,0,0,1,1],
      [0,0,0,1,0,1,1,1,0,1,0,0,0],
      [1,1,1,1,0,0,0,0,0,1,1,1,1],
      [1,0,0,0,0,1,0,1,0,0,0,0,1],
      [1,0,1,1,0,0,0,0,0,1,1,0,1],
      [1,0,0,1,0,1,0,1,0,1,0,0,1],
      [1,1,0,0,0,1,0,1,0,0,0,1,1],
      [0,0,0,1,0,0,0,0,0,1,0,0,0],
      [1,1,0,1,0,1,1,1,0,1,0,1,1],
      [1,0,0,0,0,0,0,0,0,0,0,0,1],
      [1,0,1,1,1,1,0,1,1,1,1,0,1],
      [1,0,0,0,1,0,0,0,1,0,0,0,1],
      [1,0,1,0,0,0,1,0,0,0,1,0,1],
      [1,0,1,0,1,0,1,0,1,0,1,0,1],
      [1,0,0,0,0,0,0,0,0,0,0,0,1],
      [1,0,1,1,0,1,1,1,0,1,1,0,1],
      [1,1,1,1,1,1,1,1,1,1,1,1,1],
    ];
  }

  /** 29×29 template (left half = 15 columns) */
  #template29x29() {
    return [
      [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
      [1,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
      [1,0,1,1,0,1,1,1,1,0,1,1,1,0,1],
      [1,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
      [1,0,1,1,0,1,0,1,1,1,0,1,1,0,1],
      [1,0,0,0,0,1,0,0,0,0,0,0,0,0,1],
      [1,1,1,1,0,1,1,1,0,1,0,1,1,1,1],
      [0,0,0,0,0,0,0,1,0,1,0,0,0,0,0],
      [1,1,1,1,0,1,0,0,0,0,0,1,1,1,1],
      [0,0,0,1,0,1,0,1,1,1,0,1,0,0,0],
      [1,1,0,0,0,0,0,0,0,0,0,0,0,1,1],
      [0,0,0,1,0,1,0,1,1,1,0,1,0,0,0],
      [1,1,1,1,0,1,0,0,0,0,0,1,1,1,1],
      [0,0,0,0,0,0,0,1,0,1,0,0,0,0,0],
      [1,1,1,1,0,1,1,1,0,1,1,1,0,1,1],
      [1,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
      [1,0,1,1,0,1,0,1,1,1,0,1,1,0,1],
      [1,0,0,1,0,0,0,0,0,0,0,0,0,0,1],
      [1,1,0,0,0,1,0,1,0,1,0,1,1,0,1],
      [1,0,0,1,0,1,0,1,0,1,0,0,0,0,1],
      [1,0,1,1,0,0,0,0,0,0,0,1,1,0,1],
      [1,0,0,0,0,1,0,1,1,1,0,0,0,0,1],
      [1,0,1,1,1,1,0,0,0,0,0,1,1,0,1],
      [1,0,0,0,0,0,0,1,0,1,0,0,0,0,1],
      [1,0,1,0,1,1,0,1,0,1,1,1,0,1,1],
      [1,0,1,0,0,0,0,0,0,0,0,0,0,0,1],
      [1,0,1,1,0,1,1,1,0,1,1,1,1,0,1],
      [1,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
      [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    ];
  }

  /** Fallback procedural generation for non-standard sizes */
  #createProceduralMap() {
    const map = this.#createEmptyMap();

    this.#carveCorridors(map);
    this.#mirrorLeftToRight(map);
    this.#addLoops(map);
    this.#removeDeadEnds(map);
    this.#carveGhostHouse(map);
    this.#ensureConnectivity(map);

    return map;
  }

  // ── Map Creation ───────────────────────────────────────────

  /** Create a map filled entirely with walls, with borders locked as walls */
  #createEmptyMap() {
    const map = [];
    for (let r = 0; r < this.height; r++) {
      map[r] = new Array(this.width).fill(1);
    }
    return map;
  }

  // ── Corridor Carving (Modified Kruskal's on left half) ─────

  /**
   * Carve corridors using a modified approach:
   * - Only work on odd-positioned cells in the left half
   * - Use randomized Kruskal's to create a spanning tree
   * - This creates the base corridor structure
   */
  #carveCorridors(map) {
    const halfW = Math.floor(this.width / 2) + 1; // include center column

    // Union-Find for Kruskal's
    const cells = [];
    const parent = new Map();
    const rank = new Map();

    // Collect all interior odd-positioned cells in left half
    for (let r = 1; r < this.height - 1; r += 2) {
      for (let c = 1; c < halfW; c += 2) {
        const key = `${r},${c}`;
        cells.push([r, c]);
        parent.set(key, key);
        rank.set(key, 0);
      }
    }

    // Open all cell positions
    for (const [r, c] of cells) {
      map[r][c] = 0;
    }

    // Collect all possible edges between adjacent cells
    const edges = [];
    for (const [r, c] of cells) {
      // Right neighbor
      if (c + 2 < halfW) {
        edges.push([r, c, r, c + 2]);
      }
      // Down neighbor
      if (r + 2 < this.height - 1) {
        edges.push([r, c, r + 2, c]);
      }
    }

    // Shuffle edges
    this.#shuffle(edges);

    // Kruskal's: merge sets by removing walls between cells
    for (const [r1, c1, r2, c2] of edges) {
      const key1 = `${r1},${c1}`;
      const key2 = `${r2},${c2}`;

      if (this.#find(parent, key1) !== this.#find(parent, key2)) {
        this.#union(parent, rank, key1, key2);
        // Remove wall between the two cells
        const wallR = (r1 + r2) / 2;
        const wallC = (c1 + c2) / 2;
        map[wallR][wallC] = 0;
      }
    }
  }

  // ── Union-Find helpers ─────────────────────────────────────

  #find(parent, key) {
    if (parent.get(key) !== key) {
      parent.set(key, this.#find(parent, parent.get(key)));
    }
    return parent.get(key);
  }

  #union(parent, rank, a, b) {
    const rootA = this.#find(parent, a);
    const rootB = this.#find(parent, b);
    if (rootA === rootB) return;
    if (rank.get(rootA) < rank.get(rootB)) {
      parent.set(rootA, rootB);
    } else if (rank.get(rootA) > rank.get(rootB)) {
      parent.set(rootB, rootA);
    } else {
      parent.set(rootB, rootA);
      rank.set(rootA, rank.get(rootA) + 1);
    }
  }

  // ── Mirror ─────────────────────────────────────────────────

  /** Mirror left half to right half for semi-symmetry */
  #mirrorLeftToRight(map) {
    const midC = Math.floor(this.width / 2);
    for (let r = 1; r < this.height - 1; r++) {
      for (let c = 1; c <= midC; c++) {
        const mirrorC = this.width - 1 - c;
        if (mirrorC > midC && mirrorC < this.width - 1) {
          map[r][mirrorC] = map[r][c];
        }
      }
    }
  }

  // ── Loop Creation ──────────────────────────────────────────

  /** Add extra passages to create loops (~20% of remaining walls) */
  #addLoops(map) {
    const candidates = [];

    for (let r = 2; r < this.height - 2; r++) {
      for (let c = 2; c < this.width - 2; c++) {
        if (map[r][c] === 1) {
          // Only remove walls that connect two open areas
          const openNeighbors = this.#countOpenNeighbors(map, r, c);
          if (openNeighbors >= 2) {
            candidates.push([r, c]);
          }
        }
      }
    }

    this.#shuffle(candidates);

    const toRemove = Math.floor(candidates.length * 0.2);
    for (let i = 0; i < toRemove; i++) {
      const [r, c] = candidates[i];
      map[r][c] = 0;
      // Mirror
      const mirrorC = this.width - 1 - c;
      if (mirrorC > 0 && mirrorC < this.width - 1) {
        map[r][mirrorC] = 0;
      }
    }
  }

  // ── Dead End Removal ───────────────────────────────────────

  /** Remove dead ends by opening a wall when a cell has only 1 open neighbor */
  #removeDeadEnds(map) {
    let changed = true;
    let iterations = 0;
    const maxIterations = 10;

    while (changed && iterations < maxIterations) {
      changed = false;
      iterations++;

      for (let r = 1; r < this.height - 1; r++) {
        for (let c = 1; c < this.width - 1; c++) {
          if (map[r][c] !== 0) continue;

          const openNeighbors = this.#countOpenNeighbors(map, r, c);
          if (openNeighbors === 1) {
            // Dead end — try to open a wall to a nearby corridor
            if (this.#openDeadEnd(map, r, c)) {
              changed = true;
            }
          }
        }
      }
    }
  }

  /** Open a wall adjacent to a dead-end cell to create an alternate path */
  #openDeadEnd(map, r, c) {
    const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
    this.#shuffle(dirs);

    for (const [dr, dc] of dirs) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr <= 0 || nr >= this.height - 1 || nc <= 0 || nc >= this.width - 1) continue;
      if (map[nr][nc] === 1) {
        // Check if beyond the wall there's another open cell
        const beyondR = nr + dr;
        const beyondC = nc + dc;
        if (beyondR > 0 && beyondR < this.height - 1 && beyondC > 0 && beyondC < this.width - 1) {
          if (map[beyondR][beyondC] === 0) {
            map[nr][nc] = 0;
            // Mirror
            const mirrorC = this.width - 1 - nc;
            if (mirrorC > 0 && mirrorC < this.width - 1) {
              map[nr][mirrorC] = 0;
            }
            return true;
          }
        }
      }
    }
    return false;
  }

  // ── Ghost House ────────────────────────────────────────────

  /** Carve a 5×3 ghost house in the center with a single exit on top */
  #carveGhostHouse(map) {
    const ghWidth = 5;
    const ghHeight = 3;
    const centerRow = Math.floor(this.height / 2);
    const centerCol = Math.floor(this.width / 2);

    const ghRow = centerRow - Math.floor(ghHeight / 2);
    const ghCol = centerCol - Math.floor(ghWidth / 2);

    // Clear interior
    for (let r = ghRow; r < ghRow + ghHeight; r++) {
      for (let c = ghCol; c < ghCol + ghWidth; c++) {
        map[r][c] = 0;
      }
    }

    // Build walls around ghost house
    for (let c = ghCol - 1; c <= ghCol + ghWidth; c++) {
      if (c >= 0 && c < this.width) {
        if (ghRow - 1 >= 0) map[ghRow - 1][c] = 1;
        if (ghRow + ghHeight < this.height) map[ghRow + ghHeight][c] = 1;
      }
    }
    for (let r = ghRow; r < ghRow + ghHeight; r++) {
      if (ghCol - 1 >= 0) map[r][ghCol - 1] = 1;
      if (ghCol + ghWidth < this.width) map[r][ghCol + ghWidth] = 1;
    }

    // Open single exit on top (center of top wall)
    const exitCol = centerCol;
    if (ghRow - 1 >= 0) {
      map[ghRow - 1][exitCol] = 0;
    }
    // Ensure path above exit connects to the maze
    if (ghRow - 2 >= 0) {
      map[ghRow - 2][exitCol] = 0;
    }

    return { row: ghRow, col: ghCol, width: ghWidth, height: ghHeight };
  }

  // ── Connectivity Fix ───────────────────────────────────────

  /** Ensure all open tiles are connected using BFS + wall removal */
  #ensureConnectivity(map) {
    // Find first open tile
    let startR = -1;
    let startC = -1;
    for (let r = 1; r < this.height - 1 && startR < 0; r++) {
      for (let c = 1; c < this.width - 1; c++) {
        if (map[r][c] === 0) {
          startR = r;
          startC = c;
          break;
        }
      }
    }
    if (startR < 0) return;

    // BFS to find main connected component
    const visited = new Set();
    const queue = [[startR, startC]];
    visited.add(`${startR},${startC}`);
    const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];

    while (queue.length > 0) {
      const [r, c] = queue.shift();
      for (const [dr, dc] of dirs) {
        const nr = r + dr;
        const nc = c + dc;
        const key = `${nr},${nc}`;
        if (nr > 0 && nr < this.height - 1 && nc > 0 && nc < this.width - 1
            && map[nr][nc] === 0 && !visited.has(key)) {
          visited.add(key);
          queue.push([nr, nc]);
        }
      }
    }

    // Find disconnected open tiles and connect them
    for (let r = 1; r < this.height - 1; r++) {
      for (let c = 1; c < this.width - 1; c++) {
        if (map[r][c] === 0 && !visited.has(`${r},${c}`)) {
          // This tile is disconnected — carve a path to the main component
          this.#connectToMainComponent(map, r, c, visited);
        }
      }
    }
  }

  /** Carve a path from a disconnected tile to the main component [Fix 5] — O(n) parent-pointer BFS */
  #connectToMainComponent(map, fromR, fromC, mainVisited) {
    // BFS from the disconnected tile, allowing wall removal, until we reach main component
    const cameFrom = new Map();
    const startKey = `${fromR},${fromC}`;
    const visited = new Set([startKey]);
    const queue = [[fromR, fromC]];
    const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];

    while (queue.length > 0) {
      const [r, c] = queue.shift();
      const currentKey = `${r},${c}`;

      for (const [dr, dc] of dirs) {
        const nr = r + dr;
        const nc = c + dc;
        const key = `${nr},${nc}`;

        if (nr <= 0 || nr >= this.height - 1 || nc <= 0 || nc >= this.width - 1) continue;
        if (visited.has(key)) continue;

        visited.add(key);
        cameFrom.set(key, currentKey);

        if (mainVisited.has(key)) {
          // Found path to main component — walk cameFrom backwards to reconstruct and carve
          let walkKey = key;
          while (walkKey && walkKey !== startKey) {
            const [wr, wc] = walkKey.split(',').map(Number);
            map[wr][wc] = 0;
            mainVisited.add(walkKey);
            walkKey = cameFrom.get(walkKey);
          }
          // Also add original disconnected region
          this.#floodAdd(map, fromR, fromC, mainVisited);
          return;
        }

        queue.push([nr, nc]);
      }
    }
  }

  /** Flood-fill add all open tiles from a start point to the visited set */
  #floodAdd(map, startR, startC, visited) {
    const queue = [[startR, startC]];
    visited.add(`${startR},${startC}`);
    const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];

    while (queue.length > 0) {
      const [r, c] = queue.shift();
      for (const [dr, dc] of dirs) {
        const nr = r + dr;
        const nc = c + dc;
        const key = `${nr},${nc}`;
        if (nr > 0 && nr < this.height - 1 && nc > 0 && nc < this.width - 1
            && map[nr][nc] === 0 && !visited.has(key)) {
          visited.add(key);
          queue.push([nr, nc]);
        }
      }
    }
  }

  // ── Dot & Power Pellet Placement ───────────────────────────

  /** Place dots on every open tile except ghost house interior, player start, and power pellet positions [Fix 3] */
  #generateDotPositions(map, ghostHouse, startRow, startCol, powerPelletPositions) {
    const dots = [];
    const gh = ghostHouse;

    // Build a Set of power pellet positions for O(1) lookup
    const pelletKeys = new Set(powerPelletPositions.map(([r, c]) => `${r},${c}`));

    for (let r = 1; r < this.height - 1; r++) {
      for (let c = 1; c < this.width - 1; c++) {
        if (map[r][c] !== 0) continue;
        if (r === startRow && c === startCol) continue;
        // Skip ghost house interior
        if (r >= gh.row && r < gh.row + gh.height && c >= gh.col && c < gh.col + gh.width) continue;
        // Skip power pellet positions
        if (pelletKeys.has(`${r},${c}`)) continue;
        dots.push([r, c]);
      }
    }

    return dots;
  }

  /** Place 4 power pellets near the maze corners */
  #generatePowerPelletPositions(map) {
    const positions = [];
    const margin = 3;

    // Four corner regions
    const corners = [
      { rStart: 1, rEnd: Math.floor(this.height / 3), cStart: 1, cEnd: Math.floor(this.width / 3) },
      { rStart: 1, rEnd: Math.floor(this.height / 3), cStart: Math.floor(this.width * 2 / 3), cEnd: this.width - 2 },
      { rStart: Math.floor(this.height * 2 / 3), rEnd: this.height - 2, cStart: 1, cEnd: Math.floor(this.width / 3) },
      { rStart: Math.floor(this.height * 2 / 3), rEnd: this.height - 2, cStart: Math.floor(this.width * 2 / 3), cEnd: this.width - 2 },
    ];

    for (const corner of corners) {
      let bestR = -1;
      let bestC = -1;
      let bestDist = -1;

      // Find the open tile closest to the actual corner of this region
      const cornerR = corner.rStart < this.height / 2 ? margin : this.height - 1 - margin;
      const cornerC = corner.cStart < this.width / 2 ? margin : this.width - 1 - margin;

      for (let r = corner.rStart; r <= corner.rEnd; r++) {
        for (let c = corner.cStart; c <= corner.cEnd; c++) {
          if (map[r][c] !== 0) continue;
          const dist = Math.abs(r - cornerR) + Math.abs(c - cornerC);
          if (bestR < 0 || dist < bestDist) {
            bestR = r;
            bestC = c;
            bestDist = dist;
          }
        }
      }

      if (bestR >= 0) {
        positions.push([bestR, bestC]);
      }
    }

    return positions;
  }

  // ── Utility ────────────────────────────────────────────────

  /** Count open (0) cardinal neighbors */
  #countOpenNeighbors(map, r, c) {
    let count = 0;
    if (r > 0 && map[r - 1][c] === 0) count++;
    if (r < this.height - 1 && map[r + 1][c] === 0) count++;
    if (c > 0 && map[r][c - 1] === 0) count++;
    if (c < this.width - 1 && map[r][c + 1] === 0) count++;
    return count;
  }

  /** Fisher-Yates shuffle using seeded PRNG */
  #shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
  }
}

export { PacManMazeGenerator };
