/**
 * PlayerController — Handles keyboard input, movement, and collision detection.
 *
 * Movement is continuous, delta-time based, and frame-rate independent.
 * Wall sliding is implemented (player slides along walls, not hard-stopped).
 *
 * [TDD] [CLEAN-CODE] [SOLID]
 */

/** Keys that the game handles — prevent default browser behavior [Fix 3] */
const GAME_KEYS = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space',
  'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight',
]);

class PlayerController {
  /**
   * @param {Object} config
   * @param {number} config.x — starting X position (world units)
   * @param {number} config.y — starting Y position (world units)
   * @param {number} config.angle — starting angle in radians (0 = east)
   * @param {number[][]} [config.tileMap] — tile map: 0=open, 1=wall
   * @param {Cell[][]} [config.grid] — legacy cell grid (converted to simple tile map)
   */
  constructor({ x, y, angle, tileMap, grid }) {
    this.x = x;
    this.y = y;
    this.angle = angle;

    // Support both tile map and legacy cell grid
    if (tileMap) {
      this.tileMap = tileMap;
    } else if (grid) {
      // Legacy: build a simple blocked-tile lookup from cell walls
      this.tileMap = grid;
      this._legacyGrid = true;
    }

    this.moveSpeed = 3.0;
    this.turnSpeed = 2.5;
    this.fov = (60 * Math.PI) / 180;
    this.radius = 0.15;

    /** Vertical look offset — shifts the horizon line (-1 to 1) */
    this.pitch = 0;
    /** Mouse sensitivity */
    this.mouseSensitivity = 0.003;
    this.pitchSensitivity = 0.002;
    this._pointerLocked = false;
    /** Set to true when game is in 'playing' state */
    this.enableMouseLook = false;

    /** True when the last update() was blocked by a wall collision [Fix 4] */
    this.collided = false;

    /** @type {Set<string>} currently pressed keys */
    this.keys = new Set();

    /** Touch input state — set by setTouchInput(), used in update() */
    this._touchMoveX = 0;
    this._touchMoveY = 0;
    this._touchLookX = 0;
    this._touchActive = false;
  }

  /**
   * Bind keyboard event listeners to the document.
   * Uses AbortController so listeners can be removed cleanly. [Fix 1]
   * Prevents default browser scrolling for game-relevant keys. [Fix 3]
   *
   * @param {Document} doc
   * @param {{ signal?: AbortSignal }} [options] — pass { signal } from an AbortController
   */
  bindInput(doc, options) {
    const opts = options || {};
    doc.addEventListener('keydown', (e) => {
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      this.keys.add(e.code);
    }, opts);
    doc.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    }, opts);

    // Mouse look — click canvas to lock pointer, move to rotate/pitch
    const canvas = doc.querySelector('#game-canvas');
    if (canvas) {
      canvas.addEventListener('mousedown', (_e) => {
        if (this.enableMouseLook && !this._pointerLocked) {
          canvas.requestPointerLock();
        }
      }, opts);

      doc.addEventListener('pointerlockchange', () => {
        this._pointerLocked = doc.pointerLockElement === canvas;
      }, opts);

      doc.addEventListener('mousemove', (e) => {
        if (!this._pointerLocked) return;
        // Horizontal = rotate
        this.angle += e.movementX * this.mouseSensitivity;
        this.angle = ((this.angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        // Vertical = pitch (clamped)
        this.pitch -= e.movementY * this.pitchSensitivity;
        this.pitch = Math.max(-0.6, Math.min(0.6, this.pitch));
      }, opts);
    }
  }

  /**
   * Set touch input values for the next update cycle.
   * When active, touch input overrides keyboard for movement and rotation.
   * @param {number} moveX — horizontal movement (-1 to 1, left to right)
   * @param {number} moveY — vertical movement (-1 to 1, up to down in screen coords, up = forward)
   * @param {number} lookX — horizontal look (-1 to 1, left to right rotation)
   */
  setTouchInput(moveX, moveY, lookX) {
    this._touchMoveX = moveX;
    this._touchMoveY = moveY;
    this._touchLookX = lookX;
    this._touchActive = (moveX !== 0 || moveY !== 0 || lookX !== 0);
  }

  /**
   * Clear touch input — reverts to keyboard-only control.
   */
  clearTouchInput() {
    this._touchMoveX = 0;
    this._touchMoveY = 0;
    this._touchLookX = 0;
    this._touchActive = false;
  }

  /**
   * Update player position and angle based on pressed keys and elapsed time.
   * @param {number} dt — delta time in seconds
   */
  update(dt) {
    this.collided = false;
    if (this._touchActive) {
      this.#handleTouchRotation(dt);
      this.#handleTouchMovement(dt);
    } else {
      this.#handleRotation(dt);
      this.#handleMovement(dt);
    }
  }

  /** Rotate the player based on touch lookX input. */
  #handleTouchRotation(dt) {
    if (this._touchLookX === 0) return;
    this.angle += this._touchLookX * this.turnSpeed * dt;
    this.angle = ((this.angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  }

  /** Move the player based on touch joystick input. */
  #handleTouchMovement(dt) {
    const moveX = this._touchMoveX;
    const moveY = this._touchMoveY;
    if (moveX === 0 && moveY === 0) return;

    const speed = this.moveSpeed;

    // moveY = -1 means "forward" (up on screen), +1 means "backward"
    // moveX = -1 means "strafe left", +1 means "strafe right"
    let dx = 0;
    let dy = 0;

    // Forward/backward along facing direction
    dx += Math.cos(this.angle) * speed * (-moveY) * dt;
    dy += Math.sin(this.angle) * speed * (-moveY) * dt;

    // Strafe along perpendicular direction
    const strafeAngle = this.angle + Math.PI / 2;
    dx += Math.cos(strafeAngle) * speed * moveX * dt;
    dy += Math.sin(strafeAngle) * speed * moveX * dt;

    if (dx === 0 && dy === 0) return;

    // Wall sliding (same logic as keyboard movement)
    const newX = this.x + dx;
    const newY = this.y + dy;

    if (!this.#collides(newX, newY)) {
      this.x = newX;
      this.y = newY;
    } else if (!this.#collides(newX, this.y)) {
      this.x = newX;
      this.collided = true;
    } else if (!this.#collides(this.x, newY)) {
      this.y = newY;
      this.collided = true;
    } else {
      this.collided = true;
    }
  }

  /** Rotate the player based on left/right keys (only when Shift is NOT held). */
  #handleRotation(dt) {
    const shift = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    if (shift) return; // Shift + arrows = strafe, not rotate

    if (this.keys.has('ArrowLeft') || this.keys.has('KeyA')) {
      this.angle -= this.turnSpeed * dt;
    }
    if (this.keys.has('ArrowRight') || this.keys.has('KeyD')) {
      this.angle += this.turnSpeed * dt;
    }
    this.angle = ((this.angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  }

  /** Move the player with collision detection, strafe (Shift), and slow walk (Ctrl). */
  #handleMovement(dt) {
    const shift = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    const ctrl = this.keys.has('ControlLeft') || this.keys.has('ControlRight');
    const speed = this.moveSpeed * (ctrl ? 0.4 : 1.0);

    let dx = 0;
    let dy = 0;

    // Forward/backward
    if (this.keys.has('ArrowUp') || this.keys.has('KeyW')) {
      dx += Math.cos(this.angle) * speed * dt;
      dy += Math.sin(this.angle) * speed * dt;
    }
    if (this.keys.has('ArrowDown') || this.keys.has('KeyS')) {
      dx -= Math.cos(this.angle) * speed * dt;
      dy -= Math.sin(this.angle) * speed * dt;
    }

    // Strafe left/right (Shift + arrows or Q/E)
    if (shift && (this.keys.has('ArrowLeft') || this.keys.has('KeyA'))) {
      const strafeAngle = this.angle - Math.PI / 2;
      dx += Math.cos(strafeAngle) * speed * dt;
      dy += Math.sin(strafeAngle) * speed * dt;
    }
    if (shift && (this.keys.has('ArrowRight') || this.keys.has('KeyD'))) {
      const strafeAngle = this.angle + Math.PI / 2;
      dx += Math.cos(strafeAngle) * speed * dt;
      dy += Math.sin(strafeAngle) * speed * dt;
    }

    if (dx === 0 && dy === 0) return;

    // Wall sliding: try full move, then individual axes [Fix 4] — track collision
    const newX = this.x + dx;
    const newY = this.y + dy;

    if (!this.#collides(newX, newY)) {
      this.x = newX;
      this.y = newY;
    } else if (!this.#collides(newX, this.y)) {
      this.x = newX;
      this.collided = true;
    } else if (!this.#collides(this.x, newY)) {
      this.y = newY;
      this.collided = true;
    } else {
      this.collided = true;
    }
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
   */
  #isWall(wx, wy) {
    const col = Math.floor(wx);
    const row = Math.floor(wy);

    if (this._legacyGrid) {
      // Legacy cell-wall mode (for tests using old grid format)
      const grid = this.tileMap;
      if (row < 0 || row >= grid.length || col < 0 || col >= grid[0].length) return true;
      const cell = grid[row][col];
      const cellX = wx - col;
      const cellY = wy - row;
      const t = 0.15;
      if (cellY < t && cell.north) return true;
      if (cellY > (1 - t) && cell.south) return true;
      if (cellX < t && cell.west) return true;
      if (cellX > (1 - t) && cell.east) return true;
      return false;
    }

    // Tile map mode: wall = tileMap[row][col] === 1
    if (row < 0 || row >= this.tileMap.length || col < 0 || col >= this.tileMap[0].length) {
      return true;
    }
    return this.tileMap[row][col] === 1;
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

export { PlayerController, GAME_KEYS };
