/**
 * HintSystem — BFS pathfinding and hint state management.
 *
 * Computes the shortest path from the player's current cell to the exit
 * using Breadth-First Search (BFS). Guarantees optimal path in perfect mazes.
 *
 * Re-computes only when the player enters a new cell (not every frame).
 * Maintains a Set of path cells for O(1) lookup during rendering.
 *
 * [TDD] [CLEAN-CODE] [SOLID] — Single responsibility: pathfinding and hint state
 */

class HintSystem {
  constructor() {
    /** @type {boolean} Whether a hint is currently active */
    this.isActive = false;

    /** @type {Array<[number, number]> | null} Current computed path */
    this.currentPath = null;

    /** @type {Set<string> | null} O(1) lookup set for path cells ("row,col") */
    this._pathCellSet = null;

    /** @type {number} Last player cell row (to detect cell changes) */
    this._lastRow = -1;

    /** @type {number} Last player cell col (to detect cell changes) */
    this._lastCol = -1;
  }

  /**
   * Compute shortest path from (startRow, startCol) to (exitRow, exitCol)
   * using BFS. Returns ordered [row, col][] array.
   *
   * BFS guarantees shortest path in unweighted graphs (maze cells). [TDD]
   *
   * @param {Cell[][]} grid — maze grid
   * @param {number} startRow — player's current cell row
   * @param {number} startCol — player's current cell col
   * @param {number} exitRow — exit cell row
   * @param {number} exitCol — exit cell col
   * @returns {Array<[number, number]>} ordered path from start to exit
   */
  computePath(grid, startRow, startCol, exitRow, exitCol) {
    // Edge case: player already at exit
    if (startRow === exitRow && startCol === exitCol) {
      return [[exitRow, exitCol]];
    }

    const height = grid.length;
    const width = grid[0].length;

    // BFS with parent tracking for path reconstruction
    const visited = new Uint8Array(height * width);
    const parent = new Int32Array(height * width).fill(-1);

    const startIdx = startRow * width + startCol;
    const exitIdx = exitRow * width + exitCol;

    visited[startIdx] = 1;

    // Use array as queue with index pointer (avoids shift() overhead) [CLEAN-CODE]
    const queue = [startIdx];
    let head = 0;

    while (head < queue.length) {
      const idx = queue[head++];
      const row = (idx / width) | 0;
      const col = idx % width;

      if (idx === exitIdx) {
        return this._reconstructPath(parent, startIdx, exitIdx, width);
      }

      const cell = grid[row][col];

      // North neighbor
      if (!cell.north && row > 0) {
        const nIdx = (row - 1) * width + col;
        if (!visited[nIdx]) {
          visited[nIdx] = 1;
          parent[nIdx] = idx;
          queue.push(nIdx);
        }
      }

      // South neighbor
      if (!cell.south && row < height - 1) {
        const nIdx = (row + 1) * width + col;
        if (!visited[nIdx]) {
          visited[nIdx] = 1;
          parent[nIdx] = idx;
          queue.push(nIdx);
        }
      }

      // West neighbor
      if (!cell.west && col > 0) {
        const nIdx = row * width + (col - 1);
        if (!visited[nIdx]) {
          visited[nIdx] = 1;
          parent[nIdx] = idx;
          queue.push(nIdx);
        }
      }

      // East neighbor
      if (!cell.east && col < width - 1) {
        const nIdx = row * width + (col + 1);
        if (!visited[nIdx]) {
          visited[nIdx] = 1;
          parent[nIdx] = idx;
          queue.push(nIdx);
        }
      }
    }

    // Should never happen in a perfect maze — all cells are reachable
    return [];
  }

  /**
   * Reconstruct path from BFS parent array by backtracking from exit to start.
   * @param {Int32Array} parent — parent index for each cell
   * @param {number} startIdx — flattened index of start cell
   * @param {number} exitIdx — flattened index of exit cell
   * @param {number} width — grid width (for index → row/col conversion)
   * @returns {Array<[number, number]>}
   */
  _reconstructPath(parent, startIdx, exitIdx, width) {
    const path = [];
    let idx = exitIdx;

    while (idx !== startIdx) {
      const row = (idx / width) | 0;
      const col = idx % width;
      path.push([row, col]);
      idx = parent[idx];
    }

    // Add start cell
    const startRow = (startIdx / width) | 0;
    const startCol = startIdx % width;
    path.push([startRow, startCol]);

    path.reverse();
    return path;
  }

  /**
   * Activate the hint — compute path and build lookup set.
   * @param {Cell[][]} grid
   * @param {number} playerRow
   * @param {number} playerCol
   * @param {number} exitRow
   * @param {number} exitCol
   */
  activate(grid, playerRow, playerCol, exitRow, exitCol) {
    this.isActive = true;
    this._lastRow = playerRow;
    this._lastCol = playerCol;
    this.currentPath = this.computePath(grid, playerRow, playerCol, exitRow, exitCol);
    this._buildPathSet();
  }

  /** Deactivate the hint — clear path and state. */
  deactivate() {
    this.isActive = false;
    this.currentPath = null;
    this._pathCellSet = null;
    this._lastRow = -1;
    this._lastCol = -1;
  }

  /**
   * Update path if player moved to a new cell. Returns true if path was recomputed.
   * Called each frame with player's current cell — only recomputes on cell change.
   *
   * @param {Cell[][]} grid
   * @param {number} playerRow
   * @param {number} playerCol
   * @param {number} exitRow
   * @param {number} exitCol
   * @returns {boolean} true if path was recomputed
   */
  updateIfCellChanged(grid, playerRow, playerCol, exitRow, exitCol) {
    if (!this.isActive) return false;

    if (playerRow === this._lastRow && playerCol === this._lastCol) {
      return false;
    }

    this._lastRow = playerRow;
    this._lastCol = playerCol;
    this.currentPath = this.computePath(grid, playerRow, playerCol, exitRow, exitCol);
    this._buildPathSet();
    return true;
  }

  /**
   * Check if a cell is on the current hint path. O(1) via Set lookup.
   * @param {number} row
   * @param {number} col
   * @returns {boolean}
   */
  isOnPath(row, col) {
    if (!this._pathCellSet) return false;
    return this._pathCellSet.has(`${row},${col}`);
  }

  /** Build the O(1) path cell lookup Set from currentPath. */
  _buildPathSet() {
    this._pathCellSet = new Set();
    if (this.currentPath) {
      for (const [r, c] of this.currentPath) {
        this._pathCellSet.add(`${r},${c}`);
      }
    }
  }
}

export { HintSystem };
