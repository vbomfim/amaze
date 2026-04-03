/**
 * main.js — Entry point, game loop, and state machine orchestration.
 *
 * Game states: 'menu' | 'playing' | 'paused' | 'levelComplete' | 'victory' | 'levelSelect'
 *
 * Integrates: GameStateManager (logic), RaycastRenderer (3D view),
 *             PlayerController (input), HUD (overlay), Screens (menus).
 *
 * [CLEAN-CODE] [SOLID] — Orchestrates components, owns no domain logic
 */

import { MazeGenerator } from './maze.js';
import { RaycastRenderer } from './renderer.js';
import { PlayerController } from './player.js';
import { GameStateManager } from './game-state.js';
import { HUD } from './hud.js';
import {
  drawStartScreen,
  drawLevelCompleteScreen,
  drawPauseScreen,
  drawLevelSelectScreen,
  drawVictoryScreen,
} from './screens.js';

/** Game configuration constants */
const CONFIG = {
  canvasMaxWidth: 1200,
  aspectRatio: 16 / 9,
  resizeDebounceMs: 150,
};

class Game {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.lastTime = 0;

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

    /** Last level-complete result for display */
    this._lastResult = null;
    /** Cached level-complete ImageData — avoids raycasting while on level-complete screen [Fix 6] */
    this._levelCompleteImageData = null;

    // Menu navigation state
    this._menuSelection = 0;
    this._pauseSelection = 0;
    this._victorySelection = 0;
    this._levelSelectSelection = 1;
    this._levelSelectScroll = 0;

    // Game state manager — owns level config, scoring, save/load
    this.gsm = new GameStateManager({ storage: localStorage });
    this.gsm.load();

    this.#setupCanvas();
    this.renderer = new RaycastRenderer(this.canvas);
    // Cache HUD instance — avoid allocating every frame [Fix 3]
    this.hud = new HUD(this.renderer.ctx, this.canvas.width, this.canvas.height);
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
    // Auto-pause on tab blur
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.gsm.gameState === 'playing') {
        this.gsm.pause();
      }
    });

    // Global keyboard handler for menus and state transitions
    document.addEventListener('keydown', (e) => {
      this.#handleKeyDown(e);
    });

    // Handle window resize — debounced [Fix 7]
    window.addEventListener('resize', () => {
      clearTimeout(this._resizeTimer);
      this._resizeTimer = setTimeout(() => {
        this.#setupCanvas();
        this.renderer = new RaycastRenderer(this.canvas);
        this.hud = new HUD(this.renderer.ctx, this.canvas.width, this.canvas.height);
        this._pausedImageData = null;
        this._levelCompleteImageData = null;
      }, CONFIG.resizeDebounceMs);
    });
  }

  /**
   * Central keyboard handler — dispatches by game state.
   * @param {KeyboardEvent} e
   */
  #handleKeyDown(e) {
    const state = this.gsm.gameState;

    switch (state) {
      case 'menu':
        this.#handleMenuKey(e);
        break;
      case 'playing':
        this.#handlePlayingKey(e);
        break;
      case 'paused':
        this.#handlePauseKey(e);
        break;
      case 'levelComplete':
        this.#handleLevelCompleteKey(e);
        break;
      case 'victory':
        this.#handleVictoryKey(e);
        break;
      case 'levelSelect':
        this.#handleLevelSelectKey(e);
        break;
    }
  }

  // ── Menu Key Handling [AC18] ──────────────────────────────

  #handleMenuKey(e) {
    const maxItems = this.gsm.unlockedLevels > 1 ? 3 : 2;

    if (e.code === 'ArrowUp') {
      this._menuSelection = (this._menuSelection - 1 + maxItems) % maxItems;
      e.preventDefault();
    } else if (e.code === 'ArrowDown') {
      this._menuSelection = (this._menuSelection + 1) % maxItems;
      e.preventDefault();
    } else if (e.code === 'Enter' || e.code === 'Space') {
      this.#activateMenuOption(this._menuSelection);
      e.preventDefault();
    } else if (e.code === 'KeyN') {
      this.#activateMenuOption(0); // New Game
    } else if (e.code === 'KeyC' && this.gsm.canContinue()) {
      this.#activateMenuOption(1); // Continue
    } else if (e.code === 'KeyL' && this.gsm.unlockedLevels > 1) {
      this.gsm.goToLevelSelect();
      this._levelSelectSelection = 1;
      this._levelSelectScroll = 0;
    }
  }

  #activateMenuOption(index) {
    if (index === 0) {
      // New Game
      this.gsm.newGame(performance.now());
      this.#buildLevel();
    } else if (index === 1 && this.gsm.canContinue()) {
      // Continue
      this.gsm.continueGame(performance.now());
      this.#buildLevel();
    } else if (index === 2) {
      // Level Select
      this.gsm.goToLevelSelect();
      this._levelSelectSelection = 1;
      this._levelSelectScroll = 0;
    }
  }

  // ── Playing Key Handling ──────────────────────────────────

  #handlePlayingKey(e) {
    if (e.code === 'Escape' || e.code === 'KeyP') {
      this.gsm.pause();
      this._pauseSelection = 0;
      e.preventDefault();
    } else if (e.code === 'KeyH') {
      this.gsm.useHint();
      // Hint visual feedback would go here (future: path highlight)
    } else if (e.code === 'KeyM') {
      this.gsm.updateSettings({ showMinimap: !this.gsm.settings.showMinimap });
    }
  }

  // ── Pause Key Handling [AC19] ─────────────────────────────

  #handlePauseKey(e) {
    if (e.code === 'ArrowUp') {
      this._pauseSelection = (this._pauseSelection - 1 + 3) % 3;
      e.preventDefault();
    } else if (e.code === 'ArrowDown') {
      this._pauseSelection = (this._pauseSelection + 1) % 3;
      e.preventDefault();
    } else if (e.code === 'Escape' || e.code === 'KeyP') {
      this._pausedImageData = null;
      this.gsm.resume();
      e.preventDefault();
    } else if (e.code === 'Enter' || e.code === 'Space') {
      this.#activatePauseOption(this._pauseSelection);
      e.preventDefault();
    } else if (e.code === 'KeyR') {
      this.#activatePauseOption(1); // Restart
    } else if (e.code === 'KeyQ') {
      this.#activatePauseOption(2); // Quit
    }
  }

  #activatePauseOption(index) {
    this._pausedImageData = null;
    if (index === 0) {
      this.gsm.resume();
    } else if (index === 1) {
      this.gsm.restartLevel(performance.now());
      this.#buildLevel();
    } else if (index === 2) {
      this.gsm.quitToMenu();
      this.gsm.save();
      this._menuSelection = 0;
    }
  }

  // ── Level Complete Key Handling [AC14] ─────────────────────

  #handleLevelCompleteKey(e) {
    if (e.code === 'Enter' || e.code === 'Space') {
      this.gsm.nextLevel(performance.now());
      this._levelCompleteImageData = null;
      this.#buildLevel();
      e.preventDefault();
    }
  }

  // ── Victory Key Handling [AC16] ───────────────────────────

  #handleVictoryKey(e) {
    if (e.code === 'ArrowUp') {
      this._victorySelection = (this._victorySelection - 1 + 2) % 2;
      e.preventDefault();
    } else if (e.code === 'ArrowDown') {
      this._victorySelection = (this._victorySelection + 1) % 2;
      e.preventDefault();
    } else if (e.code === 'Enter' || e.code === 'Space') {
      if (this._victorySelection === 0) {
        this.gsm.newGame(performance.now());
        this.#buildLevel();
      } else {
        this.gsm.goToLevelSelect();
        this._levelSelectSelection = 1;
        this._levelSelectScroll = 0;
      }
      e.preventDefault();
    } else if (e.code === 'KeyL') {
      this.gsm.goToLevelSelect();
      this._levelSelectSelection = 1;
      this._levelSelectScroll = 0;
    }
  }

  // ── Level Select Key Handling ─────────────────────────────

  #handleLevelSelectKey(e) {
    const cols = 10;
    const maxLevel = this.gsm.unlockedLevels;

    if (e.code === 'ArrowRight') {
      this._levelSelectSelection = Math.min(maxLevel, this._levelSelectSelection + 1);
      e.preventDefault();
    } else if (e.code === 'ArrowLeft') {
      this._levelSelectSelection = Math.max(1, this._levelSelectSelection - 1);
      e.preventDefault();
    } else if (e.code === 'ArrowDown') {
      const next = this._levelSelectSelection + cols;
      if (next <= maxLevel) this._levelSelectSelection = next;
      e.preventDefault();
    } else if (e.code === 'ArrowUp') {
      const prev = this._levelSelectSelection - cols;
      if (prev >= 1) this._levelSelectSelection = prev;
      e.preventDefault();
    } else if (e.code === 'Enter' || e.code === 'Space') {
      this.gsm.selectLevel(this._levelSelectSelection, performance.now());
      this.#buildLevel();
      e.preventDefault();
    } else if (e.code === 'Escape') {
      this.gsm.goToMenu();
      this._menuSelection = 0;
      e.preventDefault();
    }

    // Update scroll to keep selection visible
    const selectedRow = Math.floor((this._levelSelectSelection - 1) / cols);
    if (selectedRow < this._levelSelectScroll) {
      this._levelSelectScroll = selectedRow;
    } else if (selectedRow > this._levelSelectScroll + 7) {
      this._levelSelectScroll = selectedRow - 7;
    }
  }

  // ── Level Building ────────────────────────────────────────

  /**
   * Generate a maze for the current level and reset the player.
   * Uses level config from GameStateManager for grid dimensions.
   */
  #buildLevel() {
    const level = this.gsm.currentLevel;
    const config = this.gsm.getLevelConfig(level);

    // Clear stale results from previous level [Fix 15]
    this._lastResult = null;
    this._levelCompleteImageData = null;

    // Fold level into lower bits to avoid Date.now() truncation [Fix 13]
    const seed = (Date.now() ^ (level * 2654435761)) >>> 0;
    const gen = new MazeGenerator({
      width: config.gridWidth,
      height: config.gridHeight,
      seed,
    });
    this.grid = gen.generate();

    this.exitRow = config.gridHeight - 1;
    this.exitCol = config.gridWidth - 1;

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

    this.lastTime = performance.now();
  }

  // ── Main Game Loop ────────────────────────────────────────

  /** Main game loop — called via requestAnimationFrame. */
  loop(timestamp) {
    this._rafHandle = requestAnimationFrame((t) => this.loop(t));

    const state = this.gsm.gameState;

    switch (state) {
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
        this.#renderLevelComplete();
        break;

      case 'victory':
        this.#renderVictory();
        break;

      case 'levelSelect':
        this.#renderLevelSelect();
        break;
    }
  }

  // ── Render Methods ────────────────────────────────────────

  /** Render the start menu screen [AC18]. */
  #renderMenu() {
    drawStartScreen(this.renderer.ctx, this.canvas.width, this.canvas.height, {
      highScore: this.gsm.highScore,
      canContinue: this.gsm.canContinue(),
      canLevelSelect: this.gsm.unlockedLevels > 1,
      selectedIndex: this._menuSelection,
    });
  }

  /** Update and render during active gameplay. */
  #updatePlaying(timestamp) {
    const dt = Math.min((timestamp - this.lastTime) / 1000, 0.05); // Cap at 50ms
    this.lastTime = timestamp;

    // Update player position
    this.player.update(dt);

    // Render the 3D view
    this.renderer.render(this.player, this.grid, this.exitRow, this.exitCol);

    // Draw HUD elements [AC17]
    this.renderer.drawCompass(this.player.angle);

    if (this.gsm.settings.showMinimap) {
      this.renderer.drawMinimap(this.grid, this.player, this.exitRow, this.exitCol);
    }

    // Draw HUD overlay (level, timer, hints) — using cached instance [Fix 3]
    const elapsed = this.gsm.getElapsedSeconds(performance.now());
    this.hud.draw({
      level: this.gsm.currentLevel,
      time: this.gsm.formatTime(elapsed),
      hintsDisplay: this.gsm.getHintsDisplay(),
    });

    // Check win condition
    if (this.player.isAtExit(this.exitRow, this.exitCol)) {
      this._lastResult = this.gsm.completeLevel(performance.now());
      this.gsm.save();
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
    drawPauseScreen(ctx, this.canvas.width, this.canvas.height, {
      selectedIndex: this._pauseSelection,
    });
  }

  /**
   * Render the level complete screen [AC14].
   * Uses cached ImageData to avoid re-raycasting every frame. [Fix 6]
   */
  #renderLevelComplete() {
    const ctx = this.renderer.ctx;
    if (!this._levelCompleteImageData && this.grid && this.player) {
      // First level-complete frame: render once and capture
      this.renderer.render(this.player, this.grid, this.exitRow, this.exitCol);
      this._levelCompleteImageData = ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    } else if (this._levelCompleteImageData) {
      // Subsequent frames: restore cached image
      ctx.putImageData(this._levelCompleteImageData, 0, 0);
    }
    if (this._lastResult) {
      drawLevelCompleteScreen(
        ctx,
        this.canvas.width,
        this.canvas.height,
        this._lastResult
      );
    }
  }

  /** Render the victory screen [AC16]. */
  #renderVictory() {
    drawVictoryScreen(this.renderer.ctx, this.canvas.width, this.canvas.height, {
      totalScore: this.gsm.totalScore,
      highScore: this.gsm.highScore,
      selectedIndex: this._victorySelection,
    });
  }

  /** Render the level select screen. */
  #renderLevelSelect() {
    drawLevelSelectScreen(this.renderer.ctx, this.canvas.width, this.canvas.height, {
      levels: this.gsm.getLevelSelectData(),
      selectedLevel: this._levelSelectSelection,
      scrollOffset: this._levelSelectScroll,
    });
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
