/**
 * main.js — Entry point, game loop, and state management.
 *
 * Game states: 'menu', 'playing', 'paused', 'levelComplete'
 *
 * [CLEAN-CODE] [SOLID] — Orchestrates components, owns no domain logic
 */

import { MazeGenerator } from './maze.js';
import { RaycastRenderer } from './renderer.js';
import { PlayerController } from './player.js';

/** Game configuration constants */
const CONFIG = {
  mazeWidth: 7,
  mazeHeight: 7,
  canvasMaxWidth: 1200,
  aspectRatio: 16 / 9,
  levelCompleteDelay: 2000, // ms before auto-generating next maze
  resizeDebounceMs: 150, // debounce delay for resize handler [Fix 7]
};

class Game {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.state = 'menu'; // 'menu' | 'playing' | 'paused' | 'levelComplete'
    this.level = 0;
    this.lastTime = 0;
    this.levelCompleteTime = 0;

    /** @type {Cell[][] | null} */
    this.grid = null;
    /** @type {PlayerController | null} */
    this.player = null;
    /** @type {RaycastRenderer | null} */
    this.renderer = null;

    this.exitRow = 0;
    this.exitCol = 0;

    /** AbortController for player input listeners — aborted on level change [Fix 1] */
    this._inputController = null;
    /** requestAnimationFrame handle — stored so loop can be cancelled [Fix 6] */
    this._rafHandle = null;
    /** Cached paused-screen ImageData — avoids raycasting while paused [Fix 5] */
    this._pausedImageData = null;
    /** Resize debounce timer [Fix 7] */
    this._resizeTimer = null;

    this.#setupCanvas();
    this.renderer = new RaycastRenderer(this.canvas);
    this.#bindEvents();
  }

  /** Size canvas to fill viewport width (max 1200px) at 16:9 */
  #setupCanvas() {
    const width = Math.min(CONFIG.canvasMaxWidth, window.innerWidth - 20);
    const height = Math.floor(width / CONFIG.aspectRatio);
    this.canvas.width = width;
    this.canvas.height = height;
  }

  /** Bind keyboard, visibility, and resize events. */
  #bindEvents() {
    // Auto-pause on tab blur (AC: visibilitychange)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') {
        this.state = 'paused';
      }
    });

    // Resume on any keypress when paused
    document.addEventListener('keydown', (e) => {
      if (this.state === 'paused') {
        this._pausedImageData = null; // Invalidate cached frame [Fix 5]
        this.state = 'playing';
        return;
      }
      if (this.state === 'menu' && (e.code === 'Space' || e.code === 'Enter')) {
        this.#startLevel();
        return;
      }
    });

    // Handle window resize — debounced [Fix 7]
    window.addEventListener('resize', () => {
      clearTimeout(this._resizeTimer);
      this._resizeTimer = setTimeout(() => {
        this.#setupCanvas();
        this.renderer = new RaycastRenderer(this.canvas);
        this._pausedImageData = null; // Invalidate cached frame [Fix 5]
      }, CONFIG.resizeDebounceMs);
    });
  }

  /** Generate a new maze and reset the player. */
  #startLevel() {
    this.level++;
    // Fold level into lower bits to avoid Date.now() truncation [Fix 13]
    const seed = (Date.now() ^ (this.level * 2654435761)) >>> 0;
    const gen = new MazeGenerator({
      width: CONFIG.mazeWidth,
      height: CONFIG.mazeHeight,
      seed,
    });
    this.grid = gen.generate();

    this.exitRow = CONFIG.mazeHeight - 1;
    this.exitCol = CONFIG.mazeWidth - 1;

    // Abort previous player's input listeners before creating a new player [Fix 1]
    if (this._inputController) {
      this._inputController.abort();
    }
    this._inputController = new AbortController();

    // Place player at center of entry cell (0,0), facing east
    this.player = new PlayerController({
      x: 0.5,
      y: 0.5,
      angle: 0,
      grid: this.grid,
    });
    this.player.bindInput(document, { signal: this._inputController.signal });

    this.state = 'playing';
    this.lastTime = performance.now();
  }

  /** Main game loop — called via requestAnimationFrame. */
  loop(timestamp) {
    this._rafHandle = requestAnimationFrame((t) => this.loop(t));

    switch (this.state) {
      case 'menu':
        this.#renderMenu();
        break;

      case 'playing':
        this.#updatePlaying(timestamp);
        break;

      case 'paused':
        this.#renderPaused();
        break;

      case 'levelComplete':
        this.#updateLevelComplete(timestamp);
        break;
    }
  }

  /** Render the start menu screen. [Fix 14] — uses this.renderer.ctx */
  #renderMenu() {
    const ctx = this.renderer.ctx;
    ctx.fillStyle = '#0d0d2b';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.renderer.drawOverlayText('aMaze', '#00cccc', 64);
    this.renderer.drawSubtitle('Press SPACE or ENTER to start', '#00cccc', 20);
  }

  /** Update and render during active gameplay. */
  #updatePlaying(timestamp) {
    const dt = Math.min((timestamp - this.lastTime) / 1000, 0.05); // Cap at 50ms
    this.lastTime = timestamp;

    // Update player position
    this.player.update(dt);

    // Render the 3D view
    this.renderer.render(this.player, this.grid, this.exitRow, this.exitCol);

    // Draw HUD elements
    this.renderer.drawCompass(this.player.angle);
    this.renderer.drawMinimap(this.grid, this.player, this.exitRow, this.exitCol);

    // Draw level indicator [Fix 14] — uses this.renderer.ctx
    const ctx = this.renderer.ctx;
    ctx.save();
    ctx.font = '14px monospace';
    ctx.fillStyle = 'rgba(0, 204, 204, 0.5)';
    ctx.textAlign = 'right';
    ctx.fillText(`Level ${this.level}`, this.canvas.width - 15, this.canvas.height - 15);
    ctx.restore();

    // Check win condition
    if (this.player.isAtExit(this.exitRow, this.exitCol)) {
      this.state = 'levelComplete';
      this.levelCompleteTime = timestamp;
    }
  }

  /**
   * Render the paused screen using cached ImageData [Fix 5].
   * Only raycast once when entering pause; subsequent frames use putImageData.
   */
  #renderPaused() {
    const ctx = this.renderer.ctx;
    if (!this._pausedImageData && this.grid && this.player) {
      // First paused frame: render once and capture
      this.renderer.render(this.player, this.grid, this.exitRow, this.exitCol);
      this._pausedImageData = ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    } else if (this._pausedImageData) {
      // Subsequent frames: restore cached image
      ctx.putImageData(this._pausedImageData, 0, 0);
    }
    this.renderer.drawOverlayText('PAUSED', '#00cccc', 48);
    this.renderer.drawSubtitle('Press any key to resume', '#888888', 18);
  }

  /** Show level complete and auto-start next level after delay. */
  #updateLevelComplete(timestamp) {
    if (this.grid && this.player) {
      this.renderer.render(this.player, this.grid, this.exitRow, this.exitCol);
    }
    this.renderer.drawOverlayText('Level Complete!', '#ffcc00', 48);
    this.renderer.drawSubtitle(`Generating next maze...`, '#ffcc00', 18);

    if (timestamp - this.levelCompleteTime > CONFIG.levelCompleteDelay) {
      this.#startLevel();
    }
  }

  /**
   * Start the game loop. Guarded against double-start. [Fix 6]
   */
  start() {
    if (this._rafHandle) return;
    this._rafHandle = requestAnimationFrame((t) => this.loop(t));
  }

  /**
   * Stop the game loop. [Fix 6]
   */
  stop() {
    if (this._rafHandle) {
      cancelAnimationFrame(this._rafHandle);
      this._rafHandle = null;
    }
  }
}

// Boot the game when the DOM is ready
const game = new Game();
game.start();
