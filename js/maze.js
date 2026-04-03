/**
 * MazeGenerator — Generates perfect mazes using recursive backtracker (randomized DFS).
 *
 * A "perfect" maze has exactly one path between any two cells (no loops, no isolated areas).
 *
 * @example
 *   const generator = new MazeGenerator({ width: 7, height: 7 });
 *   const grid = generator.generate();
 *   // grid[row][col] => { north: bool, south: bool, east: bool, west: bool }
 *
 * [TDD] [CLEAN-CODE] [SOLID]
 */

/** Seeded PRNG (mulberry32) for reproducible maze generation. */
function mulberry32(seed) {
  let s = seed | 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Represents a single cell in the maze grid.
 * Walls are true when present, false when removed (passage exists).
 */
class Cell {
  constructor(row, col) {
    this.row = row;
    this.col = col;
    this.north = true;
    this.south = true;
    this.east = true;
    this.west = true;
    this.visited = false;
  }
}

class MazeGenerator {
  /**
   * @param {Object} config
   * @param {number} config.width  — grid width in cells (odd, 5–101)
   * @param {number} config.height — grid height in cells (odd, 5–101)
   * @param {number} [config.seed] — optional PRNG seed for reproducibility
   */
  constructor({ width, height, seed }) {
    this.#validate(width, height);
    this.width = width;
    this.height = height;
    this.random = seed !== null && seed !== undefined ? mulberry32(seed) : Math.random;
  }

  /**
   * Validate dimensions: must be odd integers in [5, 101].
   * @throws {Error} if dimensions are invalid
   */
  #validate(width, height) {
    if (!Number.isInteger(width) || !Number.isInteger(height)) {
      throw new Error('Width and height must be integers');
    }
    if (width % 2 === 0 || height % 2 === 0) {
      throw new Error('Width and height must be odd numbers');
    }
    if (width < 5 || height < 5) {
      throw new Error('Width and height must be at least 5');
    }
    if (width > 101 || height > 101) {
      throw new Error('Width and height must be at most 101');
    }
  }

  /**
   * Generate the maze grid using recursive backtracker (iterative with explicit stack).
   * @returns {Cell[][]} 2D array indexed as grid[row][col]
   */
  generate() {
    const grid = this.#createGrid();
    this.#carve(grid);
    this.#openEntryAndExit(grid);
    this.#cleanupVisited(grid);
    return grid;
  }

  /**
   * Convert a cell-wall maze into a tile map where walls occupy actual cells.
   * Each maze cell becomes a 2×2 block: passage + right wall + bottom wall + corner.
   * Result is a 2D number array: 0 = open, 1 = wall.
   * Player coordinates must be scaled: tileX = cellCol * 2 + 1, tileY = cellRow * 2 + 1.
   * @param {Cell[][]} grid
   * @returns {{ map: number[][], tileWidth: number, tileHeight: number, startRow: number, startCol: number, exitRow: number, exitCol: number }}
   */
  static toTileMap(grid) {
    const rows = grid.length;
    const cols = grid[0].length;
    const tileH = rows * 2 + 1;
    const tileW = cols * 2 + 1;
    const map = [];

    // Fill everything as wall first
    for (let r = 0; r < tileH; r++) {
      map[r] = new Array(tileW).fill(1);
    }

    // Carve passages from the cell grid
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const tr = r * 2 + 1;
        const tc = c * 2 + 1;
        map[tr][tc] = 0; // cell itself is open

        // Open passage to the south neighbor
        if (!grid[r][c].south && r < rows - 1) {
          map[tr + 1][tc] = 0;
        }
        // Open passage to the east neighbor
        if (!grid[r][c].east && c < cols - 1) {
          map[tr][tc + 1] = 0;
        }
        // Open passage to the north (for entry)
        if (!grid[r][c].north && r === 0) {
          map[tr - 1][tc] = 0;
        }
        // Open passage to the west (for entry)
        if (!grid[r][c].west && c === 0) {
          map[tr][tc - 1] = 0;
        }
      }
    }

    // Open exit at south boundary
    const lastRow = rows - 1;
    const lastCol = cols - 1;
    if (!grid[lastRow][lastCol].south) {
      map[lastRow * 2 + 2][lastCol * 2 + 1] = 0;
    }

    return {
      map,
      tileWidth: tileW,
      tileHeight: tileH,
      startRow: 1,
      startCol: 1,
      exitRow: lastRow * 2 + 1,
      exitCol: lastCol * 2 + 1,
    };
  }

  /** Create an empty grid of cells with all walls intact. */
  #createGrid() {
    const grid = [];
    for (let row = 0; row < this.height; row++) {
      const rowCells = [];
      for (let col = 0; col < this.width; col++) {
        rowCells.push(new Cell(row, col));
      }
      grid.push(rowCells);
    }
    return grid;
  }

  /**
   * Carve passages using iterative randomized DFS (recursive backtracker).
   * Uses an explicit stack to avoid call-stack overflow on large mazes.
   */
  #carve(grid) {
    const stack = [];
    const startCell = grid[0][0];
    startCell.visited = true;
    stack.push(startCell);

    while (stack.length > 0) {
      const current = stack[stack.length - 1];
      const neighbors = this.#getUnvisitedNeighbors(grid, current);

      if (neighbors.length === 0) {
        stack.pop();
        continue;
      }

      const next = neighbors[Math.floor(this.random() * neighbors.length)];
      this.#removeWallBetween(current, next);
      next.visited = true;
      stack.push(next);
    }
  }

  /** Get all unvisited cardinal neighbors of a cell. */
  #getUnvisitedNeighbors(grid, cell) {
    const neighbors = [];
    const { row, col } = cell;

    if (row > 0 && !grid[row - 1][col].visited) {
      neighbors.push(grid[row - 1][col]);
    }
    if (row < this.height - 1 && !grid[row + 1][col].visited) {
      neighbors.push(grid[row + 1][col]);
    }
    if (col > 0 && !grid[row][col - 1].visited) {
      neighbors.push(grid[row][col - 1]);
    }
    if (col < this.width - 1 && !grid[row][col + 1].visited) {
      neighbors.push(grid[row][col + 1]);
    }

    return neighbors;
  }

  /** Remove the shared wall between two adjacent cells. */
  #removeWallBetween(a, b) {
    const rowDiff = b.row - a.row;
    const colDiff = b.col - a.col;

    if (rowDiff === -1) {
      a.north = false;
      b.south = false;
    } else if (rowDiff === 1) {
      a.south = false;
      b.north = false;
    } else if (colDiff === -1) {
      a.west = false;
      b.east = false;
    } else if (colDiff === 1) {
      a.east = false;
      b.west = false;
    }
  }

  /** Ensure entry cell (0,0) and exit cell (height-1, width-1) are accessible. */
  #openEntryAndExit(grid) {
    // Entry: top-left corner — open north wall to signal entry
    grid[0][0].north = false;
    // Exit: bottom-right corner — open south wall to signal exit
    grid[this.height - 1][this.width - 1].south = false;
  }

  /**
   * Remove the internal `visited` flag from all cells after generation.
   * This is a DFS implementation detail that should not leak to consumers. [Fix 16]
   */
  #cleanupVisited(grid) {
    for (let row = 0; row < this.height; row++) {
      for (let col = 0; col < this.width; col++) {
        delete grid[row][col].visited;
      }
    }
  }
}

export { MazeGenerator, Cell, mulberry32 };
