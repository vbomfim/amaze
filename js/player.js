/**
 * PlayerController — Handles keyboard input, movement, and collision detection.
 *
 * Movement is continuous, delta-time based, and frame-rate independent.
 * Wall sliding is implemented (player slides along walls, not hard-stopped).
 *
 * [TDD] [CLEAN-CODE] [SOLID]
 */

class PlayerController {
  /**
   * @param {Object} config
   * @param {number} config.x — starting X position (world units)
   * @param {number} config.y — starting Y position (world units)
   * @param {number} config.angle — starting angle in radians (0 = east)
   * @param {Cell[][]} config.grid — maze grid for collision detection
   */
  constructor({ x, y, angle, grid }) {
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.grid = grid;

    this.moveSpeed = 3.0;
    this.turnSpeed = 2.5;
    this.fov = (60 * Math.PI) / 180; // 60 degrees in radians
    this.radius = 0.2; // collision radius

    /** @type {Set<string>} currently pressed keys */
    this.keys = new Set();
  }

  /**
   * Bind keyboard event listeners to the document.
   * @param {Document} doc
   */
  bindInput(doc) {
    doc.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
    });
    doc.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
  }

  /**
   * Update player position and angle based on pressed keys and elapsed time.
   * @param {number} dt — delta time in seconds
   */
  update(dt) {
    this.#handleRotation(dt);
    this.#handleMovement(dt);
  }

  /** Rotate the player based on left/right keys. */
  #handleRotation(dt) {
    if (this.keys.has('ArrowLeft') || this.keys.has('KeyA')) {
      this.angle -= this.turnSpeed * dt;
    }
    if (this.keys.has('ArrowRight') || this.keys.has('KeyD')) {
      this.angle += this.turnSpeed * dt;
    }
    // Normalize angle to [0, 2π)
    this.angle = ((this.angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  }

  /** Move the player forward/backward with collision detection and wall sliding. */
  #handleMovement(dt) {
    let dx = 0;
    let dy = 0;

    if (this.keys.has('ArrowUp') || this.keys.has('KeyW')) {
      dx += Math.cos(this.angle) * this.moveSpeed * dt;
      dy += Math.sin(this.angle) * this.moveSpeed * dt;
    }
    if (this.keys.has('ArrowDown') || this.keys.has('KeyS')) {
      dx -= Math.cos(this.angle) * this.moveSpeed * dt;
      dy -= Math.sin(this.angle) * this.moveSpeed * dt;
    }

    if (dx === 0 && dy === 0) return;

    // Wall sliding: try full move, then individual axes [CLEAN-CODE]
    const newX = this.x + dx;
    const newY = this.y + dy;

    if (!this.#collides(newX, newY)) {
      this.x = newX;
      this.y = newY;
    } else if (!this.#collides(newX, this.y)) {
      this.x = newX; // slide along X axis
    } else if (!this.#collides(this.x, newY)) {
      this.y = newY; // slide along Y axis
    }
    // else: cornered, no movement
  }

  /**
   * Check if a position (with radius) collides with any wall.
   * Tests the four corners of the bounding box around the player circle.
   * @param {number} px — proposed X
   * @param {number} py — proposed Y
   * @returns {boolean}
   */
  #collides(px, py) {
    const r = this.radius;
    return (
      this.#isWall(px - r, py - r) ||
      this.#isWall(px + r, py - r) ||
      this.#isWall(px - r, py + r) ||
      this.#isWall(px + r, py + r)
    );
  }

  /**
   * Check if a world position is inside a wall.
   *
   * Walls exist on cell boundaries. A position is "in a wall" if it's trying
   * to cross a cell edge where a wall exists.
   *
   * For raycaster compatibility, we use the grid cell walls directly.
   */
  #isWall(wx, wy) {
    const col = Math.floor(wx);
    const row = Math.floor(wy);

    // Out of bounds = wall
    if (row < 0 || row >= this.grid.length || col < 0 || col >= this.grid[0].length) {
      return true;
    }

    const cell = this.grid[row][col];

    // Check if the point is near a wall edge within this cell
    const cellX = wx - col; // 0..1 within cell
    const cellY = wy - row;

    // Near north wall
    if (cellY < 0.01 && cell.north) return true;
    // Near south wall
    if (cellY > 0.99 && cell.south) return true;
    // Near west wall
    if (cellX < 0.01 && cell.west) return true;
    // Near east wall
    if (cellX > 0.99 && cell.east) return true;

    return false;
  }

  /**
   * Check if the player is within the exit cell.
   * @param {number} exitRow
   * @param {number} exitCol
   * @returns {boolean}
   */
  isAtExit(exitRow, exitCol) {
    const col = Math.floor(this.x);
    const row = Math.floor(this.y);
    return row === exitRow && col === exitCol;
  }
}

export { PlayerController };
