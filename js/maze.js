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
    return grid;
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
}

export { MazeGenerator, Cell, mulberry32 };
