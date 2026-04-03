/**
 * Ghost + GhostManager — Ghost AI with personalities and state machine.
 *
 * Each ghost has:
 * - Continuous floating-point position (like the player)
 * - State machine: SPAWN → SCATTER ↔ CHASE → FRIGHTENED → EATEN
 * - Personality-based chase targeting (blinky, pinky, inky, clyde)
 * - BFS pathfinding on the tile map (cached, recomputed every 0.5s)
 *
 * Ghost speeds (relative to player speed 3.0):
 * - Normal: 2.25 (75%)
 * - Frightened: 1.5 (50%)
 * - Eaten (eyes): 4.5 (150%)
 *
 * [TDD] [CLEAN-CODE] [SOLID] — Single responsibility per class
 */

/** Ghost state machine states */
const GHOST_STATES = {
  SPAWN: 'spawn',
  SCATTER: 'scatter',
  CHASE: 'chase',
  FRIGHTENED: 'frightened',
  EATEN: 'eaten',
};

/** Ghost speed constants (world units per second) */
const GHOST_SPEEDS = {
  NORMAL: 2.25,
  FRIGHTENED: 1.5,
  EATEN: 4.5,
};

/** Duration constants for state transitions (seconds) */
const SCATTER_DURATION = 7;
const CHASE_DURATION = 20;

/** Path recompute interval (seconds) */
const PATH_RECOMPUTE_INTERVAL = 0.5;

/** Clyde's proximity threshold for switching targets */
const CLYDE_DISTANCE_THRESHOLD = 8;

/** Directions for movement: [dRow, dCol] */
const DIRECTIONS = {
  up: [-1, 0],
  down: [1, 0],
  left: [0, -1],
  right: [0, 1],
};

/** Opposite directions (ghosts cannot reverse unless entering frightened) */
const OPPOSITE = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
};

// ── BFS Pathfinding ─────────────────────────────────────────

/**
 * BFS pathfinding on a tile map (0 = open, 1 = wall).
 * Returns path as [[row, col], ...] from start to target (excludes start).
 *
 * @param {number} startRow
 * @param {number} startCol
 * @param {number} targetRow
 * @param {number} targetCol
 * @param {number[][]} maze — tile map
 * @returns {number[][] | null} — path array or null if unreachable
 */
function bfsPath(startRow, startCol, targetRow, targetCol, maze) {
  const rows = maze.length;
  const cols = maze[0].length;

  if (startRow === targetRow && startCol === targetCol) {
    return [[targetRow, targetCol]];
  }

  // Bounds and wall check for target
  if (targetRow < 0 || targetRow >= rows || targetCol < 0 || targetCol >= cols) {
    return null;
  }
  if (maze[targetRow][targetCol] === 1) {
    return null;
  }

  const visited = new Set();
  const queue = [[startRow, startCol]];
  const parent = new Map();
  const startKey = `${startRow},${startCol}`;
  visited.add(startKey);

  const dirList = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  while (queue.length > 0) {
    const [cr, cc] = queue.shift();

    for (const [dr, dc] of dirList) {
      const nr = cr + dr;
      const nc = cc + dc;
      const nKey = `${nr},${nc}`;

      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      if (maze[nr][nc] === 1) continue;
      if (visited.has(nKey)) continue;

      visited.add(nKey);
      parent.set(nKey, `${cr},${cc}`);
      queue.push([nr, nc]);

      if (nr === targetRow && nc === targetCol) {
        // Reconstruct path
        const path = [];
        let key = nKey;
        while (key !== startKey) {
          const [pr, pc] = key.split(',').map(Number);
          path.push([pr, pc]);
          key = parent.get(key);
        }
        path.reverse();
        return path;
      }
    }
  }

  return null; // unreachable
}

// ── Ghost Class ─────────────────────────────────────────────

class Ghost {
  /**
   * @param {Object} config
   * @param {string} config.id — ghost identifier (blinky, pinky, inky, clyde)
   * @param {string} config.color — hex color
   * @param {number} config.row — starting tile row
   * @param {number} config.col — starting tile column
   * @param {string} config.personality — chase behavior type
   * @param {number} config.speed — base movement speed
   * @param {number[][]} config.maze — tile map reference
   */
  constructor({ id, color, row, col, personality, speed, maze }) {
    this.id = id;
    this.color = color;
    this.personality = personality;
    this.baseSpeed = speed;
    this.maze = maze;

    // Continuous position (tile center)
    this.x = col + 0.5;
    this.y = row + 0.5;

    // Spawn position (for reset)
    this.spawnRow = row;
    this.spawnCol = col;

    // State machine
    this.state = GHOST_STATES.SPAWN;
    this.previousState = GHOST_STATES.SCATTER;
    this.stateTimer = 0;
    this.frightenedDuration = 0;

    // Movement
    this.direction = 'up';
    this.path = null;
    this.pathTimer = 0;

    // Configurable durations (allow per-level override from PacManMode)
    this.scatterDuration = SCATTER_DURATION;

    // Scatter corners (resolve dynamic values)
    this.scatterTarget = this.#resolveScatterCorner(personality, maze);

    // Ghost house target (for EATEN state return)
    this.ghostHouseRow = row;
    this.ghostHouseCol = col;

    // Animation
    this.animPhase = 0;
  }

  // ── State Machine ─────────────────────────────────────────

  /**
   * Release ghost from ghost house → start SCATTER.
   */
  release() {
    if (this.state === GHOST_STATES.SPAWN) {
      this.state = GHOST_STATES.SCATTER;
      this.stateTimer = 0;
    }
  }

  /**
   * Update state timer. Handles SCATTER ↔ CHASE transitions
   * and FRIGHTENED timeout.
   * @param {number} dt — elapsed time in seconds
   */
  updateStateTimer(dt) {
    this.stateTimer += dt;

    if (this.state === GHOST_STATES.SCATTER) {
      if (this.stateTimer >= this.scatterDuration) {
        this.state = GHOST_STATES.CHASE;
        this.stateTimer = 0;
      }
    } else if (this.state === GHOST_STATES.CHASE) {
      if (this.stateTimer >= CHASE_DURATION) {
        this.state = GHOST_STATES.SCATTER;
        this.stateTimer = 0;
      }
    } else if (this.state === GHOST_STATES.FRIGHTENED) {
      if (this.stateTimer >= this.frightenedDuration) {
        this.state = this.previousState;
        this.stateTimer = 0;
      }
    }
  }

  /**
   * Enter FRIGHTENED state (power pellet eaten).
   * Stores previous state for restoration. Reverses direction.
   * @param {number} duration — frightened duration in seconds
   */
  frighten(duration) {
    if (this.state === GHOST_STATES.EATEN || this.state === GHOST_STATES.SPAWN) return;

    if (this.state !== GHOST_STATES.FRIGHTENED) {
      this.previousState = this.state;
    }
    this.state = GHOST_STATES.FRIGHTENED;
    this.stateTimer = 0;
    this.frightenedDuration = duration;

    // Reverse direction (exception to "no reversal" rule)
    if (OPPOSITE[this.direction]) {
      this.direction = OPPOSITE[this.direction];
    }

    // Clear cached path (frightened uses random movement)
    this.path = null;
  }

  /**
   * Ghost eaten by player → enter EATEN state (eyes return to ghost house).
   */
  eat() {
    this.state = GHOST_STATES.EATEN;
    this.stateTimer = 0;
    this.path = null;
  }

  /**
   * Reset ghost to spawn position and SPAWN state.
   */
  reset() {
    this.x = this.spawnCol + 0.5;
    this.y = this.spawnRow + 0.5;
    this.state = GHOST_STATES.SPAWN;
    this.previousState = GHOST_STATES.SCATTER;
    this.stateTimer = 0;
    this.direction = 'up';
    this.path = null;
    this.pathTimer = 0;
    this.animPhase = 0;
  }

  // ── Speed ─────────────────────────────────────────────────

  /**
   * Get current movement speed based on state.
   * @returns {number} speed in world units per second
   */
  getCurrentSpeed() {
    if (this.state === GHOST_STATES.FRIGHTENED) return GHOST_SPEEDS.FRIGHTENED;
    if (this.state === GHOST_STATES.EATEN) return GHOST_SPEEDS.EATEN;
    return this.baseSpeed;
  }

  // ── Chase Targeting ───────────────────────────────────────

  /**
   * Compute chase target tile based on personality.
   *
   * @param {number} playerRow — player's current tile row
   * @param {number} playerCol — player's current tile column
   * @param {number} playerAngle — player's facing angle (radians)
   * @param {{ row: number, col: number } | null} blinkyPos — blinky's position (for inky)
   * @returns {{ row: number, col: number }}
   */
  getChaseTarget(playerRow, playerCol, playerAngle, blinkyPos) {
    const rows = this.maze.length;
    const cols = this.maze[0].length;

    switch (this.personality) {
    case 'blinky':
      // Direct chase: target player's current tile
      return { row: playerRow, col: playerCol };

    case 'pinky': {
      // Ambush: target 4 tiles ahead of player's facing direction
      const dCol = Math.round(Math.cos(playerAngle) * 4);
      const dRow = Math.round(-Math.sin(playerAngle) * 4);
      return {
        row: this.#clamp(playerRow + dRow, 1, rows - 2),
        col: this.#clamp(playerCol + dCol, 1, cols - 2),
      };
    }

    case 'inky': {
      // Flanking: 2× vector from blinky to 2-tiles-ahead-of-player
      const aheadCol = playerCol + Math.round(Math.cos(playerAngle) * 2);
      const aheadRow = playerRow + Math.round(-Math.sin(playerAngle) * 2);

      if (blinkyPos) {
        const dRow = aheadRow - blinkyPos.row;
        const dCol = aheadCol - blinkyPos.col;
        return {
          row: this.#clamp(blinkyPos.row + dRow * 2, 1, rows - 2),
          col: this.#clamp(blinkyPos.col + dCol * 2, 1, cols - 2),
        };
      }
      // Fallback if blinky not available
      return { row: playerRow, col: playerCol };
    }

    case 'clyde': {
      // Shy: target player when far, scatter corner when close
      const dist = Math.sqrt(
        (this.y - 0.5 - playerRow) ** 2 + (this.x - 0.5 - playerCol) ** 2
      );
      if (dist > CLYDE_DISTANCE_THRESHOLD) {
        return { row: playerRow, col: playerCol };
      }
      return { ...this.scatterTarget };
    }

    default:
      return { row: playerRow, col: playerCol };
    }
  }

  // ── Pathfinding ───────────────────────────────────────────

  /**
   * Find BFS path from (startRow, startCol) to (targetRow, targetCol).
   * Public method for testing.
   *
   * @param {number} startRow
   * @param {number} startCol
   * @param {number} targetRow
   * @param {number} targetCol
   * @param {number[][]} maze
   * @returns {number[][] | null}
   */
  findPath(startRow, startCol, targetRow, targetCol, maze) {
    return bfsPath(startRow, startCol, targetRow, targetCol, maze);
  }

  // ── Movement ──────────────────────────────────────────────

  /**
   * Update ghost position and state for one frame.
   *
   * @param {number} dt — delta time in seconds
   * @param {number} playerRow — player's tile row
   * @param {number} playerCol — player's tile column
   * @param {number} playerAngle — player's facing angle
   * @param {{ row: number, col: number } | null} blinkyPos — blinky position (for inky)
   * @param {number[][]} maze — tile map
   */
  update(dt, playerRow, playerCol, playerAngle, blinkyPos, maze) {
    if (this.state === GHOST_STATES.SPAWN) return;
    if (dt <= 0) return;

    // Update state timer
    this.updateStateTimer(dt);

    // Get target based on state
    const target = this.#getTargetForState(playerRow, playerCol, playerAngle, blinkyPos);

    // Recompute path periodically (not every frame)
    this.pathTimer += dt;
    if (this.state === GHOST_STATES.FRIGHTENED) {
      // Frightened: random movement, no pathfinding
      this.#moveFrightened(dt, maze);
    } else {
      // Normal / EATEN: follow BFS path
      if (this.pathTimer >= PATH_RECOMPUTE_INTERVAL || this.path === null || this.path.length === 0) {
        this.pathTimer = 0;
        const currentRow = Math.round(this.y - 0.5);
        const currentCol = Math.round(this.x - 0.5);
        this.path = bfsPath(currentRow, currentCol, target.row, target.col, maze);
      }
      this.#moveAlongPath(dt, maze);
    }

    // Update animation
    this.animPhase = (this.animPhase + dt * 1.5) % 1;

    // Check if eaten ghost reached ghost house → respawn
    if (this.state === GHOST_STATES.EATEN) {
      const distToHome = Math.abs(this.y - 0.5 - this.ghostHouseRow) + Math.abs(this.x - 0.5 - this.ghostHouseCol);
      if (distToHome < 0.5) {
        this.state = GHOST_STATES.SPAWN;
        this.stateTimer = 0;
        // Immediately re-release
        this.release();
      }
    }
  }

  /**
   * Move ghost along the cached BFS path toward the next waypoint.
   * @param {number} dt — delta time in seconds
   * @param {number[][]} maze — tile map
   */
  #moveAlongPath(dt, maze) {
    if (!this.path || this.path.length === 0) return;

    const speed = this.getCurrentSpeed();
    let remaining = speed * dt;

    while (remaining > 0 && this.path && this.path.length > 0) {
      const [nextRow, nextCol] = this.path[0];
      const targetX = nextCol + 0.5;
      const targetY = nextRow + 0.5;

      const dx = targetX - this.x;
      const dy = targetY - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 0.01) {
        // Arrived at waypoint
        this.path.shift();
        this.#updateDirection(dx, dy);
        continue;
      }

      if (remaining >= dist) {
        // Can reach this waypoint
        this.x = targetX;
        this.y = targetY;
        remaining -= dist;
        this.#updateDirection(dx, dy);
        this.path.shift();
      } else {
        // Move partially toward waypoint
        const ratio = remaining / dist;
        this.x += dx * ratio;
        this.y += dy * ratio;
        this.#updateDirection(dx, dy);
        remaining = 0;
      }
    }

    // Clamp to valid positions
    this.#clampPosition(maze);
  }

  /**
   * Move ghost randomly at intersections (frightened mode).
   * @param {number} dt — delta time in seconds
   * @param {number[][]} maze — tile map
   */
  #moveFrightened(dt, maze) {
    const speed = this.getCurrentSpeed();
    const moveAmount = speed * dt;

    const currentRow = Math.round(this.y - 0.5);
    const currentCol = Math.round(this.x - 0.5);

    // Check if at center of a tile (intersection decision point)
    const atCenter = Math.abs(this.x - (currentCol + 0.5)) < 0.1 &&
                     Math.abs(this.y - (currentRow + 0.5)) < 0.1;

    if (atCenter) {
      // Choose random valid direction (not opposite, not into walls)
      const validDirs = this.#getValidDirections(currentRow, currentCol, maze);
      if (validDirs.length > 0) {
        // Prefer non-opposite direction
        const nonOpposite = validDirs.filter(d => d !== OPPOSITE[this.direction]);
        this.direction = nonOpposite.length > 0
          ? nonOpposite[Math.floor(Math.random() * nonOpposite.length)]
          : validDirs[Math.floor(Math.random() * validDirs.length)];
      }
    }

    // Move in current direction
    const [dr, dc] = DIRECTIONS[this.direction] || [0, 0];
    const newX = this.x + dc * moveAmount;
    const newY = this.y + dr * moveAmount;

    // Check wall collision
    const newRow = Math.floor(newY + dr * 0.3);
    const newCol = Math.floor(newX + dc * 0.3);

    if (newRow >= 0 && newRow < maze.length && newCol >= 0 && newCol < maze[0].length && maze[newRow][newCol] === 0) {
      this.x = newX;
      this.y = newY;
    }

    this.#clampPosition(maze);
  }

  /**
   * Get valid movement directions from a tile (not walls).
   * @param {number} row
   * @param {number} col
   * @param {number[][]} maze
   * @returns {string[]} array of direction names
   */
  #getValidDirections(row, col, maze) {
    const valid = [];
    for (const [name, [dr, dc]] of Object.entries(DIRECTIONS)) {
      const nr = row + dr;
      const nc = col + dc;
      if (nr >= 0 && nr < maze.length && nc >= 0 && nc < maze[0].length && maze[nr][nc] === 0) {
        valid.push(name);
      }
    }
    return valid;
  }

  /**
   * Update direction property based on movement vector.
   * @param {number} dx — x displacement
   * @param {number} dy — y displacement
   */
  #updateDirection(dx, dy) {
    if (Math.abs(dx) > Math.abs(dy)) {
      this.direction = dx > 0 ? 'right' : 'left';
    } else if (Math.abs(dy) > 0.001) {
      this.direction = dy > 0 ? 'down' : 'up';
    }
  }

  /**
   * Clamp ghost position to valid map bounds.
   * @param {number[][]} maze
   */
  #clampPosition(maze) {
    const rows = maze.length;
    const cols = maze[0].length;
    this.x = Math.max(0.5, Math.min(cols - 0.5, this.x));
    this.y = Math.max(0.5, Math.min(rows - 0.5, this.y));
  }

  // ── Targeting Helpers ─────────────────────────────────────

  /**
   * Get target tile based on current state.
   * @param {number} playerRow
   * @param {number} playerCol
   * @param {number} playerAngle
   * @param {{ row: number, col: number } | null} blinkyPos
   * @returns {{ row: number, col: number }}
   */
  #getTargetForState(playerRow, playerCol, playerAngle, blinkyPos) {
    switch (this.state) {
    case GHOST_STATES.SCATTER:
      return { ...this.scatterTarget };
    case GHOST_STATES.CHASE:
      return this.getChaseTarget(playerRow, playerCol, playerAngle, blinkyPos);
    case GHOST_STATES.EATEN:
      return { row: this.ghostHouseRow, col: this.ghostHouseCol };
    default:
      return { ...this.scatterTarget };
    }
  }

  /**
   * Resolve scatter corner target to actual maze coordinates.
   * @param {string} personality
   * @param {number[][]} maze
   * @returns {{ row: number, col: number }}
   */
  #resolveScatterCorner(personality, maze) {
    const rows = maze.length;
    const cols = maze[0].length;
    const corners = {
      blinky: { row: 1, col: cols - 2 },    // top-right
      pinky: { row: 1, col: 1 },             // top-left
      inky: { row: rows - 2, col: cols - 2 },// bottom-right
      clyde: { row: rows - 2, col: 1 },      // bottom-left
    };
    return corners[personality] || { row: 1, col: 1 };
  }

  /**
   * Clamp a value to [min, max].
   * @param {number} val
   * @param {number} min
   * @param {number} max
   * @returns {number}
   */
  #clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  // ── Sprite Generation ─────────────────────────────────────

  /**
   * Get sprite representation for SpriteRenderer.
   * Sprite type changes based on state:
   * - Normal: ghost_{personality} (e.g., ghost_blinky)
   * - Frightened: ghost_frightened
   * - Eaten: ghost_eaten
   *
   * @returns {{ x: number, y: number, type: string, active: boolean, animPhase: number }}
   */
  getSprite() {
    let type;
    if (this.state === GHOST_STATES.FRIGHTENED) {
      type = 'ghost_frightened';
    } else if (this.state === GHOST_STATES.EATEN) {
      type = 'ghost_eaten';
    } else {
      type = `ghost_${this.id}`;
    }

    return {
      x: this.x,
      y: this.y,
      type,
      active: true,
      animPhase: this.animPhase,
    };
  }

  /**
   * Update animation phase (for frightened flashing).
   * @param {number} dt — delta time in seconds
   */
  updateAnimPhase(dt) {
    this.animPhase = (this.animPhase + dt * 1.5) % 1;
  }
}

// ── GhostManager Class ──────────────────────────────────────

/** Ghost configuration: id, color, personality, position offset within ghost house */
const GHOST_CONFIGS = [
  { id: 'blinky', color: '#ff0000', personality: 'blinky', offsetRow: 0, offsetCol: 2 },
  { id: 'pinky', color: '#ffb8ff', personality: 'pinky', offsetRow: 1, offsetCol: 1 },
  { id: 'inky', color: '#00ffff', personality: 'inky', offsetRow: 1, offsetCol: 2 },
  { id: 'clyde', color: '#ffb852', personality: 'clyde', offsetRow: 1, offsetCol: 3 },
];

/** Sequential ghost eating scores */
const GHOST_EAT_SCORES = [200, 400, 800, 1600];

/** Collision proximity threshold */
const COLLISION_RADIUS = 0.8;

class GhostManager {
  /**
   * @param {number[][]} maze — tile map (0 = open, 1 = wall)
   * @param {{ row: number, col: number, width: number, height: number }} ghostHouse
   */
  constructor(maze, ghostHouse) {
    this.maze = maze;
    this.ghostHouse = ghostHouse;

    /** @type {Ghost[]} */
    this.ghosts = this.#createGhosts(maze, ghostHouse);

    /** Current eat score index (resets each power pellet) */
    this.eatScoreIndex = 0;
  }

  // ── Ghost Creation ────────────────────────────────────────

  /**
   * Create 4 ghosts positioned inside the ghost house.
   * @param {number[][]} maze
   * @param {{ row: number, col: number, width: number, height: number }} ghostHouse
   * @returns {Ghost[]}
   */
  #createGhosts(maze, ghostHouse) {
    return GHOST_CONFIGS.map(config => {
      const row = ghostHouse.row + config.offsetRow;
      const col = ghostHouse.col + config.offsetCol;
      return new Ghost({
        id: config.id,
        color: config.color,
        row,
        col,
        personality: config.personality,
        speed: GHOST_SPEEDS.NORMAL,
        maze,
      });
    });
  }

  // ── Update ────────────────────────────────────────────────

  /**
   * Update all ghosts for one frame.
   * @param {number} dt — delta time in seconds
   * @param {number} playerX — player x (world coords)
   * @param {number} playerY — player y (world coords)
   * @param {number} playerAngle — player facing angle (radians)
   * @param {number[][]} tileMap — maze tile map
   */
  update(dt, playerX, playerY, playerAngle, tileMap) {
    const playerRow = Math.round(playerY - 0.5);
    const playerCol = Math.round(playerX - 0.5);

    // Get blinky position for inky's targeting
    const blinky = this.ghosts.find(g => g.id === 'blinky');
    const blinkyPos = blinky ? { row: Math.round(blinky.y - 0.5), col: Math.round(blinky.x - 0.5) } : null;

    for (const ghost of this.ghosts) {
      ghost.update(dt, playerRow, playerCol, playerAngle, blinkyPos, tileMap);
    }
  }

  // ── Collision Detection ───────────────────────────────────

  /**
   * Check if player collides with any ghost.
   * Collision behavior depends on ghost state:
   * - SCATTER/CHASE: player caught (lose life)
   * - FRIGHTENED: player eats ghost (score)
   * - SPAWN/EATEN: no collision
   *
   * @param {number} playerY — player y position (world coords)
   * @param {number} playerX — player x position (world coords)
   * @returns {{ caught: boolean, ghostId: string, score: number } | null}
   */
  checkPlayerCollision(playerY, playerX) {
    for (const ghost of this.ghosts) {
      if (ghost.state === GHOST_STATES.SPAWN || ghost.state === GHOST_STATES.EATEN) {
        continue;
      }

      const dist = Math.sqrt((ghost.x - playerX) ** 2 + (ghost.y - playerY) ** 2);
      if (dist < COLLISION_RADIUS) {
        if (ghost.state === GHOST_STATES.FRIGHTENED) {
          return { caught: false, ghostId: ghost.id, score: this.#getNextEatScore() };
        }
        return { caught: true, ghostId: ghost.id, score: 0 };
      }
    }
    return null;
  }

  // ── Frightened Mode ───────────────────────────────────────

  /**
   * Trigger frightened mode on all non-eaten ghosts.
   * Resets sequential eat score counter.
   * @param {number} duration — frightened duration in seconds
   */
  triggerFrightened(duration) {
    this.eatScoreIndex = 0;
    for (const ghost of this.ghosts) {
      ghost.frighten(duration);
    }
  }

  // ── Ghost Eating ──────────────────────────────────────────

  /**
   * Mark a ghost as eaten.
   * @param {string} ghostId — ghost identifier
   */
  eatGhost(ghostId) {
    const ghost = this.ghosts.find(g => g.id === ghostId);
    if (ghost) {
      ghost.eat();
    }
  }

  /**
   * Get sequential eat scores for the current power pellet.
   * @returns {number[]} — [200, 400, 800, 1600] minus already eaten
   */
  getGhostEatScores() {
    return GHOST_EAT_SCORES.slice(this.eatScoreIndex);
  }

  /**
   * Get next eat score and advance the counter.
   * @returns {number}
   */
  #getNextEatScore() {
    const score = GHOST_EAT_SCORES[Math.min(this.eatScoreIndex, GHOST_EAT_SCORES.length - 1)];
    this.eatScoreIndex++;
    return score;
  }

  // ── Release ───────────────────────────────────────────────

  /**
   * Release all ghosts from ghost house.
   */
  releaseAll() {
    for (const ghost of this.ghosts) {
      ghost.release();
    }
  }

  // ── Sprite Generation ─────────────────────────────────────

  /**
   * Get sprite array for all ghosts (for SpriteRenderer).
   * @returns {{ x: number, y: number, type: string, active: boolean, animPhase: number }[]}
   */
  getSprites() {
    return this.ghosts.map(ghost => ghost.getSprite());
  }

  // ── Reset ─────────────────────────────────────────────────

  /**
   * Reset all ghosts to ghost house positions and SPAWN state.
   */
  reset() {
    this.eatScoreIndex = 0;
    for (const ghost of this.ghosts) {
      ghost.reset();
    }
  }
}

export { Ghost, GhostManager, GHOST_STATES, GHOST_SPEEDS, bfsPath };
