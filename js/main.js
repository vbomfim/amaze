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
import { HintSystem } from './hint.js';
import { AudioManager } from './audio.js';
import {
  drawStartScreen,
  drawLevelCompleteScreen,
  drawPauseScreen,
  drawLevelSelectScreen,
  drawVictoryScreen,
  getButtonAtPoint,
  getHoveredButton,
} from './screens.js';
import { PacManMode } from './pacman-mode.js';
import {
  isTouchDevice,
  isPortrait,
  TouchInput,
  getMobileRayScale,
  getMobileSpriteMaxDist,
} from './touch-input.js';

/** Game configuration constants */
const CONFIG = {
  canvasMaxWidth: Infinity,
  aspectRatio: 16 / 9,
  resizeDebounceMs: 150,
  hintDebounceMs: 500,
};

class Game {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.lastTime = 0;

    /** @type {Cell[][] | null} */
    this.grid = null;
    /** @type {number[][] | null} */
    this.tileMap = null;
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

    // Hint system [AC10]
    this.hintSystem = new HintSystem();
    /** @type {number} Last H key press timestamp for debounce */
    this._lastHintTime = 0;

    // Audio system — lazy init on first user interaction [Issue #4]
    this.audioManager = new AudioManager({
      muted: false,
    });
    /** Whether audioManager.init() has been called */
    this._audioInitialized = false;
    /** Last player position for footstep distance tracking */
    this._lastFootstepX = 0;
    this._lastFootstepY = 0;

    // FPS counter state
    this._showFps = false;
    this._fpsFrames = 0;
    this._fpsLastTime = 0;
    this._fpsDisplay = 0;

    // Visited cells for fog of war [AC20]
    /** @type {Set<string>} Cells the player has visited ("row,col") */
    this._visitedCells = new Set();

    // Game state manager — owns level config, scoring, save/load
    this.gsm = new GameStateManager({ storage: localStorage });
    this.gsm.load();

    // PAC-MAN mode instance (created on first entry) [Phase 3]
    this.pacmanMode = null;

    // ── Mobile support ────────────────────────────────────────
    /** @type {boolean} Whether this is a touch-enabled device */
    this._isMobile = isTouchDevice();
    /** @type {TouchInput | null} Touch input handler (mobile only) */
    this._touchInput = null;
    /** @type {number} Ray scale factor for mobile performance */
    this._rayScale = getMobileRayScale(this._isMobile);

    this.#setupCanvas();
    this.renderer = new RaycastRenderer(this.canvas, { rayScale: this._rayScale });
    // Cache HUD instance — avoid allocating every frame [Fix 3]
    this.hud = new HUD(this.renderer.ctx, this.canvas.width, this.canvas.height);
    this.#bindEvents();

    // Set up touch input and orientation overlay for mobile
    if (this._isMobile) {
      this.#setupTouchInput();
      this.#setupOrientationOverlay();
      this.#hideControlsHint();
    }
  }

  /** Size canvas to fill viewport width (max 1200px) at 16:9. Mobile fills full viewport. [AC: Responsive Resize] */
  #setupCanvas() {
    const maxW = window.innerWidth;
    const maxH = window.innerHeight - 10;

    let width, height;

    if (this._isMobile) {
      // Mobile: fill full viewport, no aspect ratio constraint
      width = window.innerWidth;
      height = window.innerHeight;
    } else {
      // Desktop: maintain 16:9 aspect ratio
      width = maxW;
      height = Math.floor(width / CONFIG.aspectRatio);
      if (height > maxH) {
        height = maxH;
        width = Math.floor(height * CONFIG.aspectRatio);
      }
    }

    this.canvas.width = width;
    this.canvas.height = height;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;

    // Update touch input dimensions on resize
    if (this._touchInput) {
      this._touchInput.updateDimensions(width, height);
    }
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
      this.#initAudioOnce();
      this.#handleKeyDown(e);
    });

    // Mouse click on menu buttons
    this.canvas.addEventListener('click', (e) => {
      this.#initAudioOnce();
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = this.canvas.width / rect.width;
      const scaleY = this.canvas.height / rect.height;
      const cx = (e.clientX - rect.left) * scaleX;
      const cy = (e.clientY - rect.top) * scaleY;
      this.#handleClick(cx, cy);
    });

    // Mouse hover — update selectedIndex for button highlighting
    this.canvas.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = this.canvas.width / rect.width;
      const scaleY = this.canvas.height / rect.height;
      const cx = (e.clientX - rect.left) * scaleX;
      const cy = (e.clientY - rect.top) * scaleY;
      const hovered = getHoveredButton(cx, cy);
      if (hovered >= 0) {
        const state = this.gsm.gameState;
        if (state === 'menu') this._menuSelection = hovered;
        else if (state === 'paused') this._pauseSelection = hovered;
        else if (state === 'victory') this._victorySelection = hovered;
        else if (state === 'levelComplete') this._levelCompleteSelection = hovered;
        this.canvas.style.cursor = 'pointer';
      } else if (this.gsm.gameState === 'pacman' && this.pacmanMode && this.pacmanMode.handleHover(cx, cy)) {
        this.canvas.style.cursor = 'pointer';
      } else {
        this.canvas.style.cursor = 'default';
      }
    });

    // Handle window resize — debounced [Fix 7]
    const resizeHandler = () => {
      clearTimeout(this._resizeTimer);
      this._resizeTimer = setTimeout(() => {
        this.#setupCanvas();
        this.renderer = new RaycastRenderer(this.canvas, { rayScale: this._rayScale });
        this.hud = new HUD(this.renderer.ctx, this.canvas.width, this.canvas.height);
        this._pausedImageData = null;
        this._levelCompleteImageData = null;
      }, CONFIG.resizeDebounceMs);
    };
    window.addEventListener('resize', resizeHandler);
    // Also listen for orientationchange on mobile
    if (this._isMobile) {
      window.addEventListener('orientationchange', resizeHandler);
    }
  }

  /**
   * Initialize AudioManager on first user interaction (click/keypress).
   * Satisfies browser autoplay policy. Idempotent. [Issue #4]
   */
  #initAudioOnce() {
    if (this._audioInitialized) return;
    this._audioInitialized = true;
    this.audioManager.init();
    // Restore muted state from settings
    if (this.gsm.settings.muted === true) {
      this.audioManager.muted = true;
    }
  }

  // ── Mobile Support Methods ──────────────────────────────────

  /** Set up touch input handler and bind to canvas. */
  #setupTouchInput() {
    this._touchInput = new TouchInput({
      canvasWidth: this.canvas.width,
      canvasHeight: this.canvas.height,
    });
    this._touchInput.bind(this.canvas);

    // Initialize audio on first touch (browser autoplay policy)
    this.canvas.addEventListener('touchstart', () => {
      this.#initAudioOnce();
    }, { once: true });
  }

  /** Create and manage portrait orientation overlay. */
  #setupOrientationOverlay() {
    // Create overlay element
    const overlay = document.createElement('div');
    overlay.id = 'orientation-overlay';
    overlay.innerHTML = '🔄<br>Please rotate your device<br>to landscape';
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: #050510; color: #00cccc; display: none;
      justify-content: center; align-items: center; text-align: center;
      font-family: monospace; font-size: 18px; line-height: 2;
      z-index: 9999;
    `;
    document.body.appendChild(overlay);
    this._orientationOverlay = overlay;

    // Try to lock to landscape
    try {
      if (screen.orientation && screen.orientation.lock) {
        screen.orientation.lock('landscape').catch(() => {
          // Silently ignore — not all browsers support orientation lock
        });
      }
    } catch (_e) {
      // Ignore
    }

    // Check orientation on load and on change
    const checkOrientation = () => {
      if (isPortrait(window.innerWidth, window.innerHeight)) {
        overlay.style.display = 'flex';
      } else {
        overlay.style.display = 'none';
      }
    };

    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', () => {
      setTimeout(checkOrientation, 100); // Delay for orientation to settle
    });
    checkOrientation();
  }

  /** Hide the desktop controls hint on mobile. */
  #hideControlsHint() {
    const hint = document.querySelector('.controls-hint');
    if (hint) hint.style.display = 'none';
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
      case 'pacman':
        if (this.pacmanMode) {
          this.pacmanMode.handleKey(e);
        }
        break;
    }
  }

  /** Handle mouse clicks on menu buttons */
  #handleClick(cx, cy) {
    const btnIdx = getButtonAtPoint(cx, cy);
    if (btnIdx < 0) return;

    const state = this.gsm.gameState;

    if (state === 'menu') {
      this.#activateMenuOption(btnIdx);
    } else if (state === 'paused') {
      this.#activatePauseOption(btnIdx);
    } else if (state === 'victory') {
      this.#activateVictoryOption(btnIdx);
    } else if (state === 'levelComplete') {
      this.#activateLevelCompleteOption();
    } else if (state === 'pacman' && this.pacmanMode) {
      this.pacmanMode.handleClick(cx, cy);
    }
  }

  // ── Menu Key Handling [AC18] ──────────────────────────────

  #handleMenuKey(e) {
    const maxItems = this.gsm.unlockedLevels > 1 ? 4 : 3;

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
    } else if (e.code === 'KeyP') {
      this.#enterPacManMode();
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
      // PAC-MAN Mode
      this.#enterPacManMode();
    } else if (index === 3) {
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
      if (document.pointerLockElement) document.exitPointerLock();
      e.preventDefault();
    } else if (e.code === 'KeyH') {
      this.#activateHint();
    } else if (e.code === 'KeyM') {
      this.gsm.updateSettings({ showMinimap: !this.gsm.settings.showMinimap });
    } else if (e.code === 'KeyN') {
      // Toggle mute [Issue #4]
      const muted = this.audioManager.toggleMute();
      this.gsm.updateSettings({ muted });
    } else if (e.code === 'KeyF') {
      this._showFps = !this._showFps;
    } else if (e.code === 'KeyT') {
      this.renderer.toggleDayNight();
      this._pausedImageData = null;
      this._levelCompleteImageData = null;
    }
  }

  /**
   * Activate hint with debounce and hint counter management. [AC10] [AC12]
   * Debounce: 500ms between activations to prevent spam.
   */
  #activateHint() {
    const now = performance.now();

    // Debounce H key [Edge case: hint spam]
    if (now - this._lastHintTime < CONFIG.hintDebounceMs) {
      return;
    }

    // If hint is already active, ignore (carpet stays until level end)
    if (this.hintSystem.isActive) {
      return;
    }

    // Check if player can use a hint [AC12]
    if (!this.gsm.useHint()) {
      // Show "No hints remaining" feedback
      this._noHintsMessage = now;
      return;
    }

    this._lastHintTime = now;

    // Play hint activation sound [Issue #4]
    this.audioManager.playHintActivate();

    // Compute path and activate carpet [AC10]
    const playerRow = Math.floor(this.player.y);
    const playerCol = Math.floor(this.player.x);
    this.hintSystem.activate(this.grid, this._tileToCell(playerRow), this._tileToCell(playerCol), this.cellExitRow, this.cellExitCol);
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

  // ── PAC-MAN Mode Entry [Phase 3] ──────────────────────────

  /**
   * Enter PAC-MAN mode — create PacManMode instance and switch state.
   */
  #enterPacManMode() {
    try {
      if (!this.pacmanMode) {
        this.pacmanMode = new PacManMode(this.canvas, this.audioManager, {
          storage: localStorage,
          onExit: () => {
            this.gsm.goToMenu();
            this._menuSelection = 0;
            if (this.player) this.player.enableMouseLook = false;
          },
        });
      }
      this.pacmanMode.start();
      this.gsm.goToPacMan();
    } catch (err) {
      // Temporarily log to help debug
      const ctx = this.canvas.getContext('2d');
      ctx.fillStyle = '#ff0000';
      ctx.font = '14px monospace';
      ctx.fillText('PAC-MAN Error: ' + err.message, 20, 40);
      ctx.fillText(err.stack ? err.stack.split('\n')[1] : '', 20, 60);
    }
  }

  // ── Level Complete Key Handling [AC14] ─────────────────────

  #handleLevelCompleteKey(e) {
    if (e.code === 'Enter' || e.code === 'Space') {
      this.#activateLevelCompleteOption();
      e.preventDefault();
    }
  }

  #activateLevelCompleteOption() {
    this.gsm.nextLevel(performance.now());
    this._levelCompleteImageData = null;
    this.#buildLevel();
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
      this.#activateVictoryOption(this._victorySelection);
      e.preventDefault();
    } else if (e.code === 'KeyL') {
      this.#activateVictoryOption(1);
    }
  }

  #activateVictoryOption(index) {
    if (index === 0) {
      this.gsm.newGame(performance.now());
      this.#buildLevel();
    } else {
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

    // Clear hint state on new level [AC13]
    this.hintSystem.deactivate();
    this._noHintsMessage = null;

    // Clear visited cells for new level fog of war [AC20]
    this._visitedCells = new Set();

    // Fold level into lower bits to avoid Date.now() truncation [Fix 13]
    const seed = (Date.now() ^ (level * 2654435761)) >>> 0;
    const gen = new MazeGenerator({
      width: config.gridWidth,
      height: config.gridHeight,
      seed,
    });
    this.grid = gen.generate();

    // Convert to tile map for thick-wall rendering and collision
    const tileData = MazeGenerator.toTileMap(this.grid);
    this.tileMap = tileData.map;
    this.exitRow = tileData.exitRow;
    this.exitCol = tileData.exitCol;
    // Keep cell-grid exit for minimap and hint system
    this.cellExitRow = config.gridHeight - 1;
    this.cellExitCol = config.gridWidth - 1;

    // Abort previous player's input listeners before creating a new player [Fix 1]
    if (this._inputController) {
      this._inputController.abort();
    }
    this._inputController = new AbortController();

    // Place player at center of entry tile, facing an open corridor
    const startX = tileData.startCol + 0.5;
    const startY = tileData.startRow + 0.5;
    const startAngle = this.#findOpenDirection(tileData.startRow, tileData.startCol);

    this.player = new PlayerController({
      x: startX,
      y: startY,
      angle: startAngle,
      tileMap: this.tileMap,
    });
    this.player.bindInput(document, { signal: this._inputController.signal });

    // Mark starting cell as visited [AC20]
    this._visitedCells.add('0,0');

    // Reset footstep tracking for audio [Issue #4]
    this._lastFootstepX = startX;
    this._lastFootstepY = startY;

    this.lastTime = performance.now();
  }

  /** Convert a tile coordinate to the original cell coordinate */
  _tileToCell(tile) {
    return (tile - 1) / 2 | 0;
  }

  /** Create a proxy player object with cell-grid coordinates for minimap/hint */
  _cellPlayer() {
    return {
      x: (this.player.x - 1) / 2,
      y: (this.player.y - 1) / 2,
      angle: this.player.angle,
      fov: this.player.fov,
    };
  }

  /** Find the first open direction from a tile position. Returns angle in radians. */
  #findOpenDirection(tileRow, tileCol) {
    const map = this.tileMap;
    // Check east (0), south (π/2), west (π), north (3π/2)
    const dirs = [
      { dr: 0, dc: 1, angle: 0 },          // east
      { dr: 1, dc: 0, angle: Math.PI / 2 }, // south
      { dr: 0, dc: -1, angle: Math.PI },     // west
      { dr: -1, dc: 0, angle: -Math.PI / 2 }, // north
    ];
    for (const d of dirs) {
      const r = tileRow + d.dr;
      const c = tileCol + d.dc;
      if (r >= 0 && r < map.length && c >= 0 && c < map[0].length && map[r][c] === 0) {
        return d.angle;
      }
    }
    return 0; // fallback
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
        if (this.player) this.player.enableMouseLook = true;
        this.#updatePlaying(timestamp);
        break;

      case 'paused':
        if (this.player) this.player.enableMouseLook = false;
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

      case 'pacman':
        if (this.pacmanMode) {
          this.pacmanMode.loop(timestamp);
        }
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

    // Feed touch input to player (mobile)
    if (this._touchInput && this._touchInput.isActive) {
      const input = this._touchInput.getInput();
      this.player.setTouchInput(input.moveX, input.moveY, input.lookX);
    } else if (this._touchInput) {
      this.player.clearTouchInput();
    }

    // Update player position
    this.player.update(dt);

    // Wall bump audio — play when player collided with a wall [Fix 4]
    if (this.player.collided) {
      this.audioManager.playWallBump();
    }

    // Footstep audio — play when player moves >0.1 units since last footstep [Issue #4]
    const footDx = this.player.x - this._lastFootstepX;
    const footDy = this.player.y - this._lastFootstepY;
    const footDist = footDx * footDx + footDy * footDy;
    if (footDist > 0.01) {
      this.audioManager.playFootstep();
      this._lastFootstepX = this.player.x;
      this._lastFootstepY = this.player.y;
    }

    // Track visited cells for fog of war [AC20] — convert tile to cell coords
    const playerRow = Math.floor(this.player.y);
    const playerCol = Math.floor(this.player.x);
    const cellRow = this._tileToCell(playerRow);
    const cellCol = this._tileToCell(playerCol);
    this._visitedCells.add(`${cellRow},${cellCol}`);

    // Update hint path if player moved to new cell [AC11]
    if (this.hintSystem.isActive) {
      this.hintSystem.updateIfCellChanged(this.grid, cellRow, cellCol, this.cellExitRow, this.cellExitCol);
    }

    // Render the 3D view (with hint carpet if active)
    this.renderer.render(this.player, this.tileMap, this.exitRow, this.exitCol, {
      hintSystem: this.hintSystem,
    });

    // Draw HUD elements [AC17]
    this.renderer.drawCompass(this.player.angle);

    if (this.gsm.settings.showMinimap) {
      this.renderer.drawMinimap(this.grid, this._cellPlayer(), this.cellExitRow, this.cellExitCol, {
        visitedCells: this._visitedCells,
        hintSystem: this.hintSystem,
      });
    }

    // Draw HUD overlay (level, timer, hints) — using cached instance [Fix 3]
    const elapsed = this.gsm.getElapsedSeconds(performance.now());
    this.hud.draw({
      level: this.gsm.currentLevel,
      time: this.gsm.formatTime(elapsed),
      hintsDisplay: this.gsm.getHintsDisplay(),
    });

    // "No hints remaining" message overlay [AC12]
    if (this._noHintsMessage && timestamp - this._noHintsMessage < 2000) {
      this.renderer.drawSubtitle('No hints remaining', '#ff6666', 18);
    } else {
      this._noHintsMessage = null;
    }

    // FPS counter [AC: FPS Counter]
    if (this._showFps) {
      this.#updateFps(timestamp);
      this.renderer.drawFpsCounter(this._fpsDisplay);
    }

    // Render touch joystick overlays (mobile)
    if (this._touchInput) {
      this._touchInput.updateFade(dt);
      this._touchInput.render(this.renderer.ctx);
    }

    // Check win condition
    if (this.player.isAtExit(this.exitRow, this.exitCol)) {
      this.hintSystem.deactivate();
      this.audioManager.playLevelComplete();
      this._lastResult = this.gsm.completeLevel(performance.now());
      this.gsm.save();
      if (document.pointerLockElement) document.exitPointerLock();
    }
  }

  /**
   * Update FPS calculation. Averaged over rolling window for stability.
   * @param {number} timestamp — current frame timestamp
   */
  #updateFps(timestamp) {
    this._fpsFrames++;
    const delta = timestamp - this._fpsLastTime;
    if (delta >= 1000) {
      this._fpsDisplay = Math.round((this._fpsFrames * 1000) / delta);
      this._fpsFrames = 0;
      this._fpsLastTime = timestamp;
    }
  }

  /**
   * Render the paused screen using cached ImageData [Fix 5].
   * Only raycast once when entering pause; subsequent frames use putImageData.
   */
  #renderPaused() {
    const ctx = this.renderer.ctx;
    if (!this._pausedImageData && this.tileMap && this.player) {
      // First paused frame: render once and capture
      this.renderer.render(this.player, this.tileMap, this.exitRow, this.exitCol, {
        hintSystem: this.hintSystem,
      });
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
    if (!this._levelCompleteImageData && this.tileMap && this.player) {
      // First level-complete frame: render once and capture
      this.renderer.render(this.player, this.tileMap, this.exitRow, this.exitCol, {
        hintSystem: this.hintSystem,
      });
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
