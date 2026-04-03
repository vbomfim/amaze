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
        this.state = 'playing';
        return;
      }
      if (this.state === 'menu' && (e.code === 'Space' || e.code === 'Enter')) {
        this.#startLevel();
        return;
      }
    });

    // Handle window resize
    window.addEventListener('resize', () => {
      this.#setupCanvas();
      this.renderer = new RaycastRenderer(this.canvas);
    });
  }

  /** Generate a new maze and reset the player. */
  #startLevel() {
    this.level++;
    const seed = Date.now() + this.level;
    const gen = new MazeGenerator({
      width: CONFIG.mazeWidth,
      height: CONFIG.mazeHeight,
      seed,
    });
    this.grid = gen.generate();

    this.exitRow = CONFIG.mazeHeight - 1;
    this.exitCol = CONFIG.mazeWidth - 1;

    // Place player at center of entry cell (0,0), facing east
    this.player = new PlayerController({
      x: 0.5,
      y: 0.5,
      angle: 0,
      grid: this.grid,
    });
    this.player.bindInput(document);

    this.state = 'playing';
    this.lastTime = performance.now();
  }

  /** Main game loop — called via requestAnimationFrame. */
  loop(timestamp) {
    requestAnimationFrame((t) => this.loop(t));

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

  /** Render the start menu screen. */
  #renderMenu() {
    const ctx = this.canvas.getContext('2d');
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

    // Draw level indicator
    const ctx = this.canvas.getContext('2d');
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

  /** Render the paused screen (overlay on top of last frame). */
  #renderPaused() {
    // Re-render the last frame underneath
    if (this.grid && this.player) {
      this.renderer.render(this.player, this.grid, this.exitRow, this.exitCol);
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

  /** Start the game. */
  start() {
    requestAnimationFrame((t) => this.loop(t));
  }
}

// Boot the game when the DOM is ready
const game = new Game();
game.start();
