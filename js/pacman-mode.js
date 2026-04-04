/**
 * PacManMode — PAC-MAN game loop orchestrator.
 *
 * Wires Phase 1+2 components (audio, sprites, maze, collectibles, ghosts)
 * into a playable PAC-MAN mode with lives, scoring, level progression,
 * power pellets, and ghost AI.
 *
 * Game states: READY → PLAYING → DYING → READY/GAME_OVER
 *              PLAYING → LEVEL_CLEAR → READY (next level)
 *              PLAYING ↔ PAUSED
 *
 * [CLEAN-CODE] [SOLID] — Orchestrates components, owns game rules only
 */

import { PacManMazeGenerator } from './pacman-maze.js';
import { CollectibleManager } from './collectibles.js';
import { GhostManager } from './ghost.js';
import { RaycastRenderer } from './renderer.js';
import { SpriteRenderer } from './sprites.js';
import { PlayerController } from './player.js';
import {
  drawPacManReadyScreen,
  drawPacManDyingOverlay,
  drawPacManLevelClearScreen,
  drawPacManGameOverScreen,
  drawPacManHUD,
  drawPacManPauseScreen,
  getPacButtonAtPoint,
  getHoveredPacButton,
} from './pacman-screens.js';

// ── Constants ──────────────────────────────────────────────────

/** PAC-MAN game state machine states */
const PACMAN_STATES = {
  READY: 'ready',
  PLAYING: 'playing',
  DYING: 'dying',
  LEVEL_CLEAR: 'level_clear',
  GAME_OVER: 'game_over',
  PAUSED: 'paused',
};

/** localStorage key for PAC-MAN save data */
const STORAGE_KEY = 'amaze_pacman_v1';

/** Duration constants (seconds) */
const READY_DURATION = 2;
const DYING_DURATION = 1;
const LEVEL_CLEAR_DURATION = 3;

/** Extra life threshold */
const EXTRA_LIFE_SCORE = 10000;

/** Starting lives */
const STARTING_LIVES = 3;

/**
 * Level progression configuration.
 * Each entry defines the thresholds — use the highest entry where level >= entry.level.
 */
const LEVEL_CONFIGS = [
  { level: 1,  mazeSize: 21, ghostSpeed: 2.25, frightenedDuration: 8, scatterDuration: 7 },
  { level: 3,  mazeSize: 21, ghostSpeed: 2.55, frightenedDuration: 6, scatterDuration: 5 },
  { level: 5,  mazeSize: 25, ghostSpeed: 2.7,  frightenedDuration: 5, scatterDuration: 4 },
  { level: 8,  mazeSize: 25, ghostSpeed: 2.85, frightenedDuration: 4, scatterDuration: 3 },
  { level: 12, mazeSize: 29, ghostSpeed: 3.0,  frightenedDuration: 3, scatterDuration: 2 },
  { level: 16, mazeSize: 29, ghostSpeed: 3.0,  frightenedDuration: 2, scatterDuration: 2 },
];

// ── PacManMode Class ───────────────────────────────────────────

class PacManMode {
  /**
   * @param {HTMLCanvasElement} canvas — game canvas
   * @param {Object} audioManager — sound effects manager
   * @param {Object} [options]
   * @param {Storage} [options.storage] — localStorage-compatible storage (injectable for testing)
   * @param {Function} [options.onExit] — callback when returning to menu
   */
  constructor(canvas, audioManager, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.audioManager = audioManager;
    this._storage = options.storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    this.onExit = options.onExit || null;

    // Game state
    this.state = PACMAN_STATES.READY;
    this.level = 1;
    this.score = 0;
    this.lives = STARTING_LIVES;
    this.extraLifeAwarded = false;

    // Timing
    this.stateTimer = 0;
    this.lastTime = 0;

    // Power pellet timer
    this.frightenedTimer = 0;

    // Pause/game-over menu selection
    this.pauseSelection = 0;
    this.gameOverSelection = 0;

    // Components (created per level by buildLevel)
    /** @type {RaycastRenderer | null} */
    this.renderer = null;
    /** @type {SpriteRenderer | null} */
    this.spriteRenderer = null;
    /** @type {PlayerController | null} */
    this.player = null;
    /** @type {GhostManager | null} */
    this.ghostManager = null;
    /** @type {CollectibleManager | null} */
    this.collectibles = null;
    /** @type {number[][] | null} */
    this.tileMap = null;

    // Player start position (for respawn)
    this.startX = 0;
    this.startY = 0;
    this.startAngle = 0;

    // AbortController for player input [CLEAN-CODE]
    this._inputController = null;

    // Cached paused ImageData (avoids re-raycasting while paused)
    this._pausedImageData = null;

    // Load high score from storage
    this.highScore = 0;
    this.#loadHighScore();
  }

  // ── Level Configuration ──────────────────────────────────────

  /**
   * Get configuration for a given level number.
   * Uses highest matching threshold from LEVEL_CONFIGS.
   * @param {number} level — level number (1-based)
   * @returns {{ mazeSize: number, ghostSpeed: number, frightenedDuration: number, scatterDuration: number }}
   */
  getLevelConfig(level) {
    let config = LEVEL_CONFIGS[0];
    for (const entry of LEVEL_CONFIGS) {
      if (level >= entry.level) {
        config = entry;
      } else {
        break;
      }
    }
    return { ...config };
  }

  // ── Level Building ───────────────────────────────────────────

  /**
   * Generate a PAC-MAN maze and create all components for the current level.
   * Resets player, ghosts, and collectibles.
   */
  buildLevel() {
    const config = this.getLevelConfig(this.level);

    // Generate PAC-MAN maze
    const seed = (Date.now() ^ (this.level * 2654435761)) >>> 0;
    const mazeGen = new PacManMazeGenerator({
      width: config.mazeSize,
      height: config.mazeSize,
      seed,
    });
    const mazeData = mazeGen.generate();

    this.tileMap = mazeData.map;

    // Create renderer
    this.renderer = new RaycastRenderer(this.canvas);
    this.spriteRenderer = new SpriteRenderer(
      this.renderer.ctx,
      this.canvas.width,
      this.canvas.height
    );

    // Create collectibles
    const intersections = this.#findIntersections(mazeData.map);
    this.collectibles = new CollectibleManager(
      mazeData.dotPositions,
      mazeData.powerPelletPositions,
      intersections,
      seed
    );

    // Create ghost manager with level-specific speed and scatter duration
    this.ghostManager = new GhostManager(mazeData.map, mazeData.ghostHouse);
    for (const ghost of this.ghostManager.ghosts) {
      ghost.baseSpeed = config.ghostSpeed;
      ghost.scatterDuration = config.scatterDuration;
    }

    // Abort previous input listeners
    if (this._inputController) {
      this._inputController.abort();
    }
    this._inputController = new AbortController();

    // Place player at start position
    this.startX = mazeData.startCol + 0.5;
    this.startY = mazeData.startRow + 0.5;
    this.startAngle = this.#findOpenDirection(mazeData.startRow, mazeData.startCol, mazeData.map);

    this.player = new PlayerController({
      x: this.startX,
      y: this.startY,
      angle: this.startAngle,
      tileMap: mazeData.map,
    });

    // Only bind input in browser environment (skip in tests)
    if (typeof document !== 'undefined') {
      this.player.bindInput(document, { signal: this._inputController.signal });
    }

    // Reset timers
    this.stateTimer = 0;
    this.frightenedTimer = 0;
    this._pausedImageData = null;
  }

  /**
   * Find intersection tiles (3+ open neighbors) for food placement.
   * @param {number[][]} map — tile map
   * @returns {number[][]} — [[row, col], ...]
   */
  #findIntersections(map) {
    const intersections = [];
    const rows = map.length;
    const cols = map[0].length;
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];

    for (let r = 1; r < rows - 1; r++) {
      for (let c = 1; c < cols - 1; c++) {
        if (map[r][c] !== 0) continue;
        let openNeighbors = 0;
        for (const [dr, dc] of dirs) {
          if (map[r + dr][c + dc] === 0) openNeighbors++;
        }
        if (openNeighbors >= 3) {
          intersections.push([r, c]);
        }
      }
    }
    return intersections;
  }

  /**
   * Find the first open direction from a tile position.
   * @param {number} row
   * @param {number} col
   * @param {number[][]} map
   * @returns {number} angle in radians
   */
  #findOpenDirection(row, col, map) {
    const dirs = [
      { dr: 0, dc: 1, angle: 0 },
      { dr: 1, dc: 0, angle: Math.PI / 2 },
      { dr: 0, dc: -1, angle: Math.PI },
      { dr: -1, dc: 0, angle: -Math.PI / 2 },
    ];
    for (const d of dirs) {
      const r = row + d.dr;
      const c = col + d.dc;
      if (r >= 0 && r < map.length && c >= 0 && c < map[0].length && map[r][c] === 0) {
        return d.angle;
      }
    }
    return 0;
  }

  // ── Game Loop ────────────────────────────────────────────────

  /**
   * Main game loop — called each frame by the parent Game class.
   * @param {number} timestamp — requestAnimationFrame timestamp
   */
  loop(timestamp) {
    const dt = Math.min((timestamp - this.lastTime) / 1000, 0.05);
    this.lastTime = timestamp;

    switch (this.state) {
      case PACMAN_STATES.READY:
        this.#renderGameView();
        this.#renderHUD();
        drawPacManReadyScreen(this.renderer.ctx, this.canvas.width, this.canvas.height);
        this.updateState(dt);
        break;

      case PACMAN_STATES.PLAYING:
        this.#updatePlaying(dt);
        break;

      case PACMAN_STATES.DYING:
        this.#renderGameView();
        drawPacManDyingOverlay(this.renderer.ctx, this.canvas.width, this.canvas.height,
          { timer: this.stateTimer, duration: DYING_DURATION });
        this.updateState(dt);
        break;

      case PACMAN_STATES.LEVEL_CLEAR:
        this.#renderGameView();
        drawPacManLevelClearScreen(this.renderer.ctx, this.canvas.width, this.canvas.height,
          { score: this.score, level: this.level });
        this.updateState(dt);
        break;

      case PACMAN_STATES.GAME_OVER:
        drawPacManGameOverScreen(this.renderer.ctx, this.canvas.width, this.canvas.height, {
          score: this.score,
          highScore: this.highScore,
          selectedIndex: this.gameOverSelection,
        });
        break;

      case PACMAN_STATES.PAUSED: {
        const ctx = this.renderer.ctx;
        if (this._pausedImageData) {
          ctx.putImageData(this._pausedImageData, 0, 0);
        }
        drawPacManPauseScreen(ctx, this.canvas.width, this.canvas.height, {
          selectedIndex: this.pauseSelection,
        });
        break;
      }
    }
  }

  /**
   * Update during active gameplay — movement, collection, ghosts, rendering.
   * @param {number} dt — delta time in seconds
   */
  #updatePlaying(dt) {
    // 1. Update player movement
    this.player.update(dt);

    // 2. Check collectible collection
    const playerRow = this.player.y;
    const playerCol = this.player.x;
    const collected = this.collectibles.checkCollection(playerRow, playerCol);
    if (collected) {
      this.handleCollection(collected);
    }

    // 3. Update ghosts
    this.ghostManager.update(dt, this.player.x, this.player.y, this.player.angle, this.tileMap);

    // 4. Check ghost collision
    const collision = this.ghostManager.checkPlayerCollision(this.player.y, this.player.x);
    if (collision) {
      if (collision.caught) {
        this.handleDeath();
        return;
      } else {
        this.handleGhostEaten(collision.ghostId, collision.score);
      }
    }

    // 5. Update frightened timer
    if (this.frightenedTimer > 0) {
      this.updateFrightenedTimer(dt);
    }

    // 6. Check level clear
    if (this.collectibles.isLevelClear()) {
      this.handleLevelClear();
      return;
    }

    // 7. Update animations
    this.collectibles.updateAnimations(dt);

    // 8. Render
    this.#renderGameView();
    this.#renderHUD();
  }

  /**
   * Render the 3D maze view with sprites.
   */
  #renderGameView() {
    if (!this.renderer || !this.player || !this.tileMap) return;

    this.renderer.render(this.player, this.tileMap, -1, -1, {});

    const sprites = this.getAllSprites();
    this.spriteRenderer.renderSprites(this.player, sprites, this.renderer.depthBuffer);

    // PAC-MAN minimap with ghosts and collectibles
    this.#renderPacMinimap();
  }

  /** Render PAC-MAN minimap showing maze, player, ghosts, dots, and pellets. */
  /** Render arcade-style PAC-MAN minimap — blue outlined walls, dots, ghosts. */
  #renderPacMinimap() {
    const ctx = this.renderer.ctx;
    const map = this.tileMap;
    if (!map) return;

    const rows = map.length;
    const cols = map[0].length;
    const maxPx = Math.min(this.canvas.width * 0.22, this.canvas.height * 0.35);
    const cs = Math.max(3, Math.floor(maxPx / Math.max(rows, cols)));
    const pad = 8;
    const topM = 35;
    const mapW = cols * cs;
    const mapH = rows * cs;

    ctx.save();

    // Black background
    ctx.fillStyle = '#000000';
    ctx.fillRect(pad - 2, topM - 2, mapW + 4, mapH + 4);

    // Draw walls — blue fill with brighter edges facing corridors
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (map[r][c] !== 1) continue;
        const x = pad + c * cs;
        const y = topM + r * cs;

        const adjOpen = (r > 0 && map[r - 1][c] === 0) ||
                        (r < rows - 1 && map[r + 1][c] === 0) ||
                        (c > 0 && map[r][c - 1] === 0) ||
                        (c < cols - 1 && map[r][c + 1] === 0);

        if (adjOpen) {
          ctx.fillStyle = '#1111aa';
          ctx.fillRect(x, y, cs, cs);
          ctx.strokeStyle = '#4444ff';
          ctx.lineWidth = 1;
          if (r > 0 && map[r - 1][c] === 0) { ctx.beginPath(); ctx.moveTo(x, y + 0.5); ctx.lineTo(x + cs, y + 0.5); ctx.stroke(); }
          if (r < rows - 1 && map[r + 1][c] === 0) { ctx.beginPath(); ctx.moveTo(x, y + cs - 0.5); ctx.lineTo(x + cs, y + cs - 0.5); ctx.stroke(); }
          if (c > 0 && map[r][c - 1] === 0) { ctx.beginPath(); ctx.moveTo(x + 0.5, y); ctx.lineTo(x + 0.5, y + cs); ctx.stroke(); }
          if (c < cols - 1 && map[r][c + 1] === 0) { ctx.beginPath(); ctx.moveTo(x + cs - 0.5, y); ctx.lineTo(x + cs - 0.5, y + cs); ctx.stroke(); }
        } else {
          ctx.fillStyle = '#0a0a2a';
          ctx.fillRect(x, y, cs, cs);
        }
      }
    }

    // Dots — small cream/pink squares like the arcade
    if (this.collectibles) {
      const time = performance.now() / 1000;
      for (const [, item] of this.collectibles.items) {
        if (!item.active) continue;
        const cx = pad + item.col * cs + cs / 2;
        const cy = topM + item.row * cs + cs / 2;

        if (item.type === 'dot') {
          ctx.fillStyle = '#ffcc66';
          ctx.beginPath();
          ctx.arc(cx, cy, Math.max(1.5, cs * 0.2), 0, Math.PI * 2);
          ctx.fill();
        } else if (item.type === 'power_pellet') {
          const pulse = 0.5 + 0.5 * Math.sin(time * 4);
          ctx.globalAlpha = pulse;
          ctx.fillStyle = '#ffb8a0';
          ctx.beginPath();
          ctx.arc(cx, cy, Math.max(2, cs * 0.4), 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1.0;
        } else {
          ctx.fillStyle = '#ff4444';
          const fs = Math.max(2, Math.floor(cs * 0.4));
          ctx.fillRect(cx - fs / 2, cy - fs / 2, fs, fs);
        }
      }
    }

    // Ghosts — classic ghost shape (dome + wavy skirt)
    if (this.ghostManager) {
      for (const ghost of this.ghostManager.ghosts) {
        const gx = pad + ghost.x * cs;
        const gy = topM + ghost.y * cs;
        const gc = ghost.state === 'frightened' ? '#2222ff' :
                   ghost.state === 'eaten' ? '#ffffff' :
                   ghost.id === 'blinky' ? '#ff0000' :
                   ghost.id === 'pinky' ? '#ffb8ff' :
                   ghost.id === 'inky' ? '#00ffff' : '#ffb852';
        const gr = Math.max(3, cs * 0.45);
        ctx.fillStyle = gc;
        // Dome (top half circle)
        ctx.beginPath();
        ctx.arc(gx, gy - gr * 0.2, gr, Math.PI, 0);
        // Wavy skirt (3 bumps at bottom)
        const bot = gy - gr * 0.2 + gr;
        ctx.lineTo(gx + gr, bot);
        const bumps = 3;
        for (let b = bumps; b > 0; b--) {
          const bx = gx + gr - (b - 0.5) * (2 * gr / bumps);
          const bx2 = gx + gr - b * (2 * gr / bumps);
          ctx.quadraticCurveTo(bx, bot + gr * 0.4, bx2, bot);
        }
        ctx.closePath();
        ctx.fill();
        // Eyes (white dots with dark pupils)
        if (ghost.state !== 'frightened') {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(gx - gr * 0.35, gy - gr * 0.4, gr * 0.25, gr * 0.25);
          ctx.fillRect(gx + gr * 0.1, gy - gr * 0.4, gr * 0.25, gr * 0.25);
          ctx.fillStyle = '#000022';
          ctx.fillRect(gx - gr * 0.25, gy - gr * 0.35, gr * 0.15, gr * 0.15);
          ctx.fillRect(gx + gr * 0.2, gy - gr * 0.35, gr * 0.15, gr * 0.15);
        }
      }
    }

    // Player — PAC-MAN shape (circle with animated mouth facing movement direction)
    const px = pad + this.player.x * cs;
    const py = topM + this.player.y * cs;
    const pr = Math.max(3, cs * 0.45);
    const angle = this.player.angle;
    // Animated mouth opening (chomp chomp)
    const time = performance.now() / 1000;
    const mouthOpen = 0.15 + 0.25 * Math.abs(Math.sin(time * 10));
    ctx.fillStyle = '#ffff00';
    ctx.beginPath();
    ctx.arc(px, py, pr, angle + mouthOpen, angle + Math.PI * 2 - mouthOpen);
    ctx.lineTo(px, py);
    ctx.closePath();
    ctx.fill();
    // Eye
    const eyeDist = pr * 0.35;
    const eyeAngle = angle - 0.5;
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(px + Math.cos(eyeAngle) * eyeDist, py + Math.sin(eyeAngle) * eyeDist, pr * 0.15, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  /** Render PAC-MAN HUD overlay. */
  #renderHUD() {
    drawPacManHUD(this.renderer.ctx, this.canvas.width, this.canvas.height, this.getHUDData());
  }

  // ── State Management ─────────────────────────────────────────

  /**
   * Update state timers and handle timed transitions.
   * Exposed for testing — normally called from loop().
   * @param {number} dt — delta time in seconds
   */
  updateState(dt) {
    this.stateTimer += dt;

    switch (this.state) {
      case PACMAN_STATES.READY:
        if (this.stateTimer >= READY_DURATION) {
          this.state = PACMAN_STATES.PLAYING;
          this.stateTimer = 0;
          if (this.ghostManager) this.ghostManager.releaseAll();
          this.audioManager.playGhostSiren();
        }
        break;

      case PACMAN_STATES.DYING:
        if (this.stateTimer >= DYING_DURATION) {
          if (this.lives > 0) {
            this.respawnPlayer();
            if (this.ghostManager) this.ghostManager.reset();
            this.state = PACMAN_STATES.READY;
            this.stateTimer = 0;
          } else {
            this.state = PACMAN_STATES.GAME_OVER;
            this.saveHighScore();
          }
        }
        break;

      case PACMAN_STATES.LEVEL_CLEAR:
        if (this.stateTimer >= LEVEL_CLEAR_DURATION) {
          this.level++;
          this.buildLevel();
          this.state = PACMAN_STATES.READY;
          this.stateTimer = 0;
        }
        break;
    }
  }

  /** Pause the game. */
  pause() {
    if (this.state !== PACMAN_STATES.PLAYING) return;

    if (this.renderer) {
      this._pausedImageData = this.renderer.ctx.getImageData(
        0, 0, this.canvas.width, this.canvas.height
      );
    }

    this.state = PACMAN_STATES.PAUSED;
    this.pauseSelection = 0;
    this.audioManager.stopGhostSiren();
    this.audioManager.stopPowerUpSiren();
  }

  /** Resume from pause. */
  resume() {
    if (this.state !== PACMAN_STATES.PAUSED) return;
    this.state = PACMAN_STATES.PLAYING;
    this._pausedImageData = null;
    if (typeof performance !== 'undefined') {
      this.lastTime = performance.now();
    }
    this.audioManager.playGhostSiren();
  }

  // ── Collection Handling ──────────────────────────────────────

  /**
   * Handle a collectible item being collected.
   * @param {{ type: string, points: number, row: number, col: number }} item
   */
  handleCollection(item) {
    this.addScore(item.points);

    switch (item.type) {
      case 'dot':
        this.audioManager.playWakaWaka();
        break;

      case 'power_pellet':
        this.audioManager.playPowerUpSiren();
        this.frightenedTimer = this.getLevelConfig(this.level).frightenedDuration;
        if (this.ghostManager) {
          this.ghostManager.triggerFrightened(this.frightenedTimer);
        }
        break;

      default:
        // Food items (apple, cherry, pizza, cupcake) — score already added
        this.audioManager.playWakaWaka();
        break;
    }
  }

  /**
   * Handle a ghost being eaten during frightened mode.
   * @param {string} ghostId
   * @param {number} score
   */
  handleGhostEaten(ghostId, score) {
    this.addScore(score);
    this.audioManager.playGhostEaten();
    if (this.ghostManager) {
      this.ghostManager.eatGhost(ghostId);
    }
  }

  // ── Scoring ──────────────────────────────────────────────────

  /**
   * Add points to the score. Checks for extra life threshold.
   * @param {number} points
   */
  addScore(points) {
    const wasBelowThreshold = this.score < EXTRA_LIFE_SCORE;
    this.score += points;

    if (!this.extraLifeAwarded && wasBelowThreshold && this.score >= EXTRA_LIFE_SCORE) {
      this.lives++;
      this.extraLifeAwarded = true;
    }
  }

  // ── Lives & Death ────────────────────────────────────────────

  /** Handle player death — decrement lives, transition to DYING. */
  handleDeath() {
    this.lives--;
    this.state = PACMAN_STATES.DYING;
    this.stateTimer = 0;
    this.frightenedTimer = 0;

    this.audioManager.stopPowerUpSiren();
    this.audioManager.stopGhostSiren();
    this.audioManager.playDeath();
  }

  /** Respawn player at the starting position. */
  respawnPlayer() {
    if (!this.player) return;
    this.player.x = this.startX;
    this.player.y = this.startY;
    this.player.angle = this.startAngle;
    this.frightenedTimer = 0;
  }

  // ── Level Clear ──────────────────────────────────────────────

  /** Handle level clear — all dots collected. */
  handleLevelClear() {
    this.state = PACMAN_STATES.LEVEL_CLEAR;
    this.stateTimer = 0;
    this.audioManager.stopGhostSiren();
    this.audioManager.stopPowerUpSiren();
    this.audioManager.playPacmanLevelClear();
  }

  // ── Power Pellet Timer ───────────────────────────────────────

  /**
   * Update the frightened/power pellet timer.
   * @param {number} dt — delta time in seconds
   */
  updateFrightenedTimer(dt) {
    this.frightenedTimer -= dt;
    if (this.frightenedTimer <= 0) {
      this.frightenedTimer = 0;
      this.audioManager.stopPowerUpSiren();
    }
  }

  // ── Sprite Aggregation ───────────────────────────────────────

  /**
   * Get all active sprites (collectibles + ghosts) for rendering.
   * @returns {{ x: number, y: number, type: string, active: boolean, animPhase: number }[]}
   */
  getAllSprites() {
    const collectibleSprites = this.collectibles ? this.collectibles.getActiveSprites() : [];
    const ghostSprites = this.ghostManager ? this.ghostManager.getSprites() : [];
    return [...collectibleSprites, ...ghostSprites];
  }

  // ── HUD Data ─────────────────────────────────────────────────

  /**
   * Get current HUD data for rendering.
   * @returns {Object}
   */
  getHUDData() {
    return {
      score: this.score,
      highScore: this.highScore,
      lives: this.lives,
      level: this.level,
      dotsRemaining: this.collectibles ? this.collectibles.getRemainingDots() : 0,
      frightenedTimer: this.frightenedTimer,
      frightenedDuration: this.getLevelConfig(this.level).frightenedDuration,
    };
  }

  // ── Save / Load ──────────────────────────────────────────────

  /** Load high score from storage. */
  #loadHighScore() {
    if (!this._storage) return;
    try {
      const raw = this._storage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (typeof data.highScore === 'number' && data.highScore > 0) {
        this.highScore = data.highScore;
      }
    } catch (_e) {
      // Corrupted data — ignore
    }
  }

  /** Save high score to storage (if beaten). */
  saveHighScore() {
    if (this.score > this.highScore) {
      this.highScore = this.score;
    }
    if (!this._storage) return;
    try {
      this._storage.setItem(STORAGE_KEY, JSON.stringify({ highScore: this.highScore }));
    } catch (_e) {
      // Storage full or unavailable
    }
  }

  // ── Restart ──────────────────────────────────────────────────

  /** Restart the game from scratch. */
  restart() {
    this.score = 0;
    this.level = 1;
    this.lives = STARTING_LIVES;
    this.extraLifeAwarded = false;
    this.frightenedTimer = 0;
    this.stateTimer = 0;
    this.pauseSelection = 0;
    this.gameOverSelection = 0;
    this.buildLevel();
    this.state = PACMAN_STATES.READY;
  }

  // ── Keyboard Handling ────────────────────────────────────────

  /**
   * Handle keyboard input for PAC-MAN mode.
   * Called by the parent Game class during 'pacman' state.
   * @param {KeyboardEvent} e
   */
  handleKey(e) {
    switch (this.state) {
      case PACMAN_STATES.PLAYING:
        this.#handlePlayingKey(e);
        break;
      case PACMAN_STATES.PAUSED:
        this.#handlePauseKey(e);
        break;
      case PACMAN_STATES.GAME_OVER:
        this.#handleGameOverKey(e);
        break;
    }
  }

  #handlePlayingKey(e) {
    if (e.code === 'Escape' || e.code === 'KeyP') {
      this.pause();
      if (typeof document !== 'undefined' && document.pointerLockElement) {
        document.exitPointerLock();
      }
      e.preventDefault();
    } else if (e.code === 'KeyN') {
      this.audioManager.toggleMute();
    }
  }

  #handlePauseKey(e) {
    if (e.code === 'ArrowUp') {
      this.pauseSelection = (this.pauseSelection - 1 + 3) % 3;
      e.preventDefault();
    } else if (e.code === 'ArrowDown') {
      this.pauseSelection = (this.pauseSelection + 1) % 3;
      e.preventDefault();
    } else if (e.code === 'Escape' || e.code === 'KeyP') {
      this.resume();
      e.preventDefault();
    } else if (e.code === 'Enter' || e.code === 'Space') {
      this.#activatePauseOption(this.pauseSelection);
      e.preventDefault();
    } else if (e.code === 'KeyR') {
      this.#activatePauseOption(1);
    } else if (e.code === 'KeyQ') {
      this.#activatePauseOption(2);
    }
  }

  #handleGameOverKey(e) {
    if (e.code === 'ArrowUp') {
      this.gameOverSelection = (this.gameOverSelection - 1 + 2) % 2;
      e.preventDefault();
    } else if (e.code === 'ArrowDown') {
      this.gameOverSelection = (this.gameOverSelection + 1) % 2;
      e.preventDefault();
    } else if (e.code === 'Enter' || e.code === 'Space') {
      this.#activateGameOverOption(this.gameOverSelection);
      e.preventDefault();
    } else if (e.code === 'KeyQ') {
      this.#activateGameOverOption(1);
    }
  }

  #activatePauseOption(index) {
    this._pausedImageData = null;
    if (index === 0) {
      this.resume();
    } else if (index === 1) {
      this.restart();
    } else if (index === 2) {
      this.#exitToMenu();
    }
  }

  #activateGameOverOption(index) {
    if (index === 0) {
      this.restart();
    } else if (index === 1) {
      this.#exitToMenu();
    }
  }

  /**
   * Handle click events during PAC-MAN mode.
   * @param {number} cx — canvas X coordinate
   * @param {number} cy — canvas Y coordinate
   */
  handleClick(cx, cy) {
    const btnIdx = getPacButtonAtPoint(cx, cy);
    if (btnIdx < 0) return;

    if (this.state === PACMAN_STATES.PAUSED) {
      this.#activatePauseOption(btnIdx);
    } else if (this.state === PACMAN_STATES.GAME_OVER) {
      this.#activateGameOverOption(btnIdx);
    }
  }

  /**
   * Handle mouse hover for button highlighting.
   * @param {number} cx
   * @param {number} cy
   * @returns {boolean} true if hovering a button
   */
  handleHover(cx, cy) {
    const hovered = getHoveredPacButton(cx, cy);
    if (hovered >= 0) {
      if (this.state === PACMAN_STATES.PAUSED) this.pauseSelection = hovered;
      else if (this.state === PACMAN_STATES.GAME_OVER) this.gameOverSelection = hovered;
      return true;
    }
    return false;
  }

  /** Exit PAC-MAN mode and return to main menu. */
  #exitToMenu() {
    this.saveHighScore();
    this.audioManager.stopGhostSiren();
    this.audioManager.stopPowerUpSiren();
    if (this._inputController) {
      this._inputController.abort();
      this._inputController = null;
    }
    if (this.onExit) {
      this.onExit();
    }
  }

  /** Start the PAC-MAN mode (called when entering from menu). */
  start() {
    this.restart();
    if (typeof performance !== 'undefined') {
      this.lastTime = performance.now();
    }
  }

  /** Stop the PAC-MAN mode (cleanup). */
  stop() {
    this.audioManager.stopGhostSiren();
    this.audioManager.stopPowerUpSiren();
    if (this._inputController) {
      this._inputController.abort();
      this._inputController = null;
    }
  }
}

export { PacManMode, PACMAN_STATES, LEVEL_CONFIGS, STORAGE_KEY };
