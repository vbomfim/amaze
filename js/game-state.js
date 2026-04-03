/**
 * GameStateManager — Level progression, scoring, save/load, and game state machine.
 *
 * Manages the full game lifecycle: menu → playing → paused → levelComplete → victory.
 * Owns level configuration, score calculation, hint tracking, and localStorage persistence.
 *
 * [TDD] [CLEAN-CODE] [SOLID] — Single responsibility: game state management only
 */

/** Save key for localStorage — versioned to handle migrations */
const SAVE_KEY = 'amaze_save_v1';

/** Tutorial level hints — effectively unlimited [Fix 11] */
const UNLIMITED_HINTS = 99;

/** Score formula constants [AC15] */
const SCORE_CONFIG = {
  basePoints: 1000,
  levelMultiplierStep: 0.5,
  hintPenalty: 0.15,
  maxHintPenalty: 0.75,
  minTimeBonus: 0.25,
  parTimeFactor: 2,
};

/**
 * Level progression table [AC2].
 *
 * Returns { gridWidth, gridHeight, hintsAllowed } for a given level number.
 * Grid dimensions are always odd (MazeGenerator constraint).
 */
const LEVEL_CONFIG = {
  maxLevel: 50,

  /**
   * @param {number} level — 1-based level number
   * @returns {{ gridWidth: number, gridHeight: number, hintsAllowed: number }}
   */
  getConfig(level) {
    const lvl = Math.max(1, level);
    const capped = Math.min(lvl, this.maxLevel);

    let gridSize;
    let hints;

    if (capped === 1) {
      gridSize = 5;
      hints = UNLIMITED_HINTS;
    } else if (capped === 2) {
      gridSize = 7;
      hints = 5;
    } else if (capped === 3) {
      gridSize = 9;
      hints = 4;
    } else if (capped <= 5) {
      gridSize = 11;
      hints = 3;
    } else if (capped <= 10) {
      gridSize = 13;
      hints = 2;
    } else if (capped <= 20) {
      // 11–20: 15×15 → 21×21, increment by 2 every 2 levels
      // Level 11–12: 15, 13–14: 17, 15–16: 19, 17–18: 21, 19–20: 21
      const offset = capped - 11; // 0..9
      const step = Math.floor(offset / 2); // 0,0,1,1,2,2,3,3,4,4
      gridSize = Math.min(21, 15 + step * 2);
      hints = 1;
    } else {
      // 21–50: 23×23 → 51×51, increment by 2 every 2 levels
      const offset = capped - 21; // 0..29
      const step = Math.floor(offset / 2); // 0,0,1,1,...,14,14
      gridSize = Math.min(51, 23 + step * 2);
      hints = 0;
    }

    // Ensure grid size is odd (should be by construction, safety net)
    if (gridSize % 2 === 0) {
      gridSize++;
    }

    return { gridWidth: gridSize, gridHeight: gridSize, hintsAllowed: hints };
  },
};

class GameStateManager {
  /**
   * Valid game state values for the state machine.
   * @type {Set<string>}
   */
  static #VALID_STATES = new Set([
    'menu', 'playing', 'paused', 'levelComplete', 'victory', 'levelSelect',
  ]);

  /**
   * @param {Object} options
   * @param {Storage} options.storage — localStorage or compatible mock
   */
  constructor({ storage }) {
    this._storage = storage;

    // Game state machine [Fix 4] — private backing field with read-only getter
    this.#gameState = 'menu';

    // Level tracking
    this.currentLevel = 0;
    this.maxLevel = LEVEL_CONFIG.maxLevel;
    this.unlockedLevels = 1;

    // Score tracking
    this.totalScore = 0;
    this.highScore = 0;
    /** @type {number[]} Best score per level (0-indexed: levelScores[0] = level 1) */
    this.levelScores = [];

    // Current level state
    this.hintsUsed = 0;
    this.levelStartTime = 0;

    // Pause time compensation [Fix 1]
    /** @type {number} Timestamp when pause started (0 if not paused) */
    this._pausedAt = 0;
    /** @type {number} Total accumulated pause duration in milliseconds */
    this._accumulatedPauseMs = 0;

    // Settings
    this.settings = { showMinimap: true };

    // Level select data cache [Fix 5]
    /** @type {Array<{ level: number, bestScore: number, unlocked: boolean }> | null} */
    this._levelSelectCache = null;
  }

  // ── Game State Property [Fix 4] ────────────────────────────

  /** @type {string} */
  #gameState;

  /** Read-only access to current game state. */
  get gameState() {
    return this.#gameState;
  }

  /**
   * Transition to the level select screen. [Fix 4]
   * Encapsulates direct state mutation that was scattered across main.js.
   */
  goToLevelSelect() {
    this.#gameState = 'levelSelect';
  }

  /**
   * Return to the main menu. [Fix 4]
   * Encapsulates direct state mutation that was scattered across main.js.
   */
  goToMenu() {
    this.#gameState = 'menu';
  }

  // ── Level Configuration ────────────────────────────────────

  /**
   * Get the configuration for a specific level.
   * @param {number} level — 1-based level number
   * @returns {{ gridWidth: number, gridHeight: number, hintsAllowed: number }}
   */
  getLevelConfig(level) {
    return LEVEL_CONFIG.getConfig(level);
  }

  // ── Score Calculation [AC15] ───────────────────────────────

  /**
   * Calculate score for a completed level.
   * Formula: basePoints × levelMultiplier × hintFactor × timeBonus
   *
   * Returns the score and its full breakdown for display. [Fix 2]
   * Single source of truth — completeLevel() delegates here instead of recomputing.
   *
   * @param {{ level: number, hintsUsed: number, seconds: number }} params
   * @returns {{ score: number, breakdown: { basePoints: number, levelMultiplier: number, hintFactor: number, timeBonus: number, parTime: number } }}
   */
  calculateScore({ level, hintsUsed, seconds }) {
    const { basePoints, levelMultiplierStep, hintPenalty, maxHintPenalty, minTimeBonus, parTimeFactor } = SCORE_CONFIG;

    const levelMultiplier = 1 + level * levelMultiplierStep;
    const hintFactor = Math.max(1 - maxHintPenalty, 1 - hintsUsed * hintPenalty);

    const config = this.getLevelConfig(level);
    const parTime = config.gridWidth * config.gridHeight * parTimeFactor;
    const timeBonus = Math.max(minTimeBonus, 1 - seconds / parTime);

    const score = Math.floor(basePoints * levelMultiplier * hintFactor * timeBonus);

    return {
      score,
      breakdown: { basePoints, levelMultiplier, hintFactor, timeBonus, parTime },
    };
  }

  // ── Level Lifecycle ────────────────────────────────────────

  /**
   * Start (or restart) a level.
   * @param {number} level — 1-based level number
   * @param {number} timestamp — current time in milliseconds
   */
  startLevel(level, timestamp) {
    this.currentLevel = level;
    this.hintsUsed = 0;
    this.levelStartTime = timestamp;
    // Reset pause accumulators [Fix 1]
    this._pausedAt = 0;
    this._accumulatedPauseMs = 0;
  }

  /**
   * Complete the current level. Calculates score, updates tracking.
   * @param {number} timestamp — completion time in milliseconds
   * @returns {{ level, time, hintsUsed, score, totalScore, breakdown, timeStr, isVictory }}
   */
  completeLevel(timestamp) {
    const seconds = this.getElapsedSeconds(timestamp);
    const level = this.currentLevel;
    const hintsUsed = this.hintsUsed;

    // Single source of truth for score computation [Fix 2]
    const { score, breakdown } = this.calculateScore({ level, hintsUsed, seconds });

    // Pre-formatted time string for display [Fix 9]
    const timeStr = this.formatTime(seconds);

    // Update best score for this level (0-indexed)
    const levelIndex = level - 1;
    if (levelIndex >= this.levelScores.length) {
      // Fill gaps with 0
      while (this.levelScores.length <= levelIndex) {
        this.levelScores.push(0);
      }
    }
    this.levelScores[levelIndex] = Math.max(this.levelScores[levelIndex], score);

    // Update totals
    this.totalScore += score;
    if (this.totalScore > this.highScore) {
      this.highScore = this.totalScore;
    }

    // Unlock next level
    if (level < this.maxLevel) {
      this.unlockedLevels = Math.max(this.unlockedLevels, level + 1);
    }

    // Check victory [AC16]
    const isVictory = level >= this.maxLevel;
    this.#gameState = isVictory ? 'victory' : 'levelComplete';

    // Invalidate level select cache [Fix 5]
    this._levelSelectCache = null;

    return {
      level,
      time: seconds,
      hintsUsed,
      score,
      totalScore: this.totalScore,
      breakdown,
      timeStr,
      isVictory,
    };
  }

  // ── Hint Management [AC17] ─────────────────────────────────

  /** Use a hint if allowed. Returns true if hint was used. */
  useHint() {
    if (this.canUseHint()) {
      this.hintsUsed++;
      return true;
    }
    return false;
  }

  /** Check if the player can use another hint on the current level. */
  canUseHint() {
    const config = this.getLevelConfig(this.currentLevel);
    return this.hintsUsed < config.hintsAllowed;
  }

  // ── HUD Data [AC17] ───────────────────────────────────────

  /**
   * Get elapsed seconds since level start, excluding paused time. [Fix 1]
   * @param {number} currentTimestamp — current time in milliseconds
   * @returns {number}
   */
  getElapsedSeconds(currentTimestamp) {
    return (currentTimestamp - this.levelStartTime - this._accumulatedPauseMs) / 1000;
  }

  /**
   * Format seconds as MM:SS.
   * @param {number} totalSeconds
   * @returns {string}
   */
  formatTime(totalSeconds) {
    const clamped = Math.max(0, Math.floor(totalSeconds));
    const minutes = Math.floor(clamped / 60);
    const seconds = clamped % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  /**
   * Get hints display string for HUD.
   * @returns {string} — '∞' for unlimited, or remaining count
   */
  getHintsDisplay() {
    const config = this.getLevelConfig(this.currentLevel);
    if (config.hintsAllowed >= UNLIMITED_HINTS) {
      return '∞';
    }
    return String(config.hintsAllowed - this.hintsUsed);
  }

  // ── State Machine Transitions ──────────────────────────────

  /**
   * Start a new game from level 1.
   * @param {number} timestamp
   */
  newGame(timestamp) {
    this.totalScore = 0;
    this.levelScores = [];
    this.unlockedLevels = Math.max(this.unlockedLevels, 1);
    this.startLevel(1, timestamp);
    this.#gameState = 'playing';
  }

  /**
   * Continue from saved level.
   * @param {number} timestamp
   */
  continueGame(timestamp) {
    const level = Math.max(1, this.currentLevel);
    this.startLevel(level, timestamp);
    this.#gameState = 'playing';
  }

  /** Pause the game. Records pause timestamp for time compensation. [Fix 1] */
  pause() {
    if (this.#gameState === 'playing') {
      this.#gameState = 'paused';
      this._pausedAt = Date.now();
    }
  }

  /** Resume from pause. Accumulates paused duration. [Fix 1] */
  resume() {
    if (this.#gameState === 'paused') {
      if (this._pausedAt > 0) {
        this._accumulatedPauseMs += Date.now() - this._pausedAt;
        this._pausedAt = 0;
      }
      this.#gameState = 'playing';
    }
  }

  /**
   * Advance to the next level after completing current.
   * @param {number} timestamp
   */
  nextLevel(timestamp) {
    const next = Math.min(this.currentLevel + 1, this.maxLevel);
    this.startLevel(next, timestamp);
    this.#gameState = 'playing';
  }

  /**
   * Restart the current level.
   * @param {number} timestamp
   */
  restartLevel(timestamp) {
    this.startLevel(this.currentLevel, timestamp);
    this.#gameState = 'playing';
  }

  /** Quit to main menu. */
  quitToMenu() {
    this.#gameState = 'menu';
  }

  /**
   * Select a specific level (from level select screen).
   * @param {number} level — 1-based
   * @param {number} timestamp
   */
  selectLevel(level, timestamp) {
    this.startLevel(level, timestamp);
    this.#gameState = 'playing';
    // Invalidate level select cache [Fix 5]
    this._levelSelectCache = null;
  }

  // ── Start Screen Data [AC18] ──────────────────────────────

  /** Check if save data exists in storage. */
  hasSaveData() {
    try {
      return this._storage.getItem(SAVE_KEY) !== null;
    } catch (_e) {
      return false;
    }
  }

  /** Check if player can continue (has completed at least 1 level). */
  canContinue() {
    return this.hasSaveData() && this.currentLevel > 0;
  }

  // ── Level Select Data ─────────────────────────────────────

  /**
   * Get data for the level select screen.
   * Cached to avoid allocating 50 objects every render frame. [Fix 5]
   * Cache is invalidated on completeLevel(), selectLevel(), and load().
   * @returns {Array<{ level: number, bestScore: number, unlocked: boolean }>}
   */
  getLevelSelectData() {
    if (this._levelSelectCache !== null) {
      return this._levelSelectCache;
    }
    const data = [];
    for (let i = 1; i <= this.maxLevel; i++) {
      data.push({
        level: i,
        bestScore: i <= this.levelScores.length ? this.levelScores[i - 1] : 0,
        unlocked: i <= this.unlockedLevels,
      });
    }
    this._levelSelectCache = data;
    return data;
  }

  // ── Save/Load System ──────────────────────────────────────

  /** Save current state to localStorage. */
  save() {
    try {
      const data = {
        version: 1,
        currentLevel: this.currentLevel,
        highScore: this.highScore,
        totalScore: this.totalScore,
        levelScores: [...this.levelScores],
        unlockedLevels: this.unlockedLevels,
        settings: { ...this.settings },
        /** Preserved for future "Last saved" display [Fix 16] */
        savedAt: new Date().toISOString(),
      };
      data.checksum = this.#computeChecksum(data);
      this._storage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch (_e) {
      // Storage unavailable — silently continue [CLEAN-CODE]
    }
  }

  /** Load state from localStorage. Resets to defaults on invalid data. */
  load() {
    try {
      const raw = this._storage.getItem(SAVE_KEY);
      if (raw === null) return;

      const data = JSON.parse(raw);
      if (!this.#validateSaveData(data)) {
        this.#resetToDefaults();
        return;
      }

      // Verify checksum [Fix 14]
      const savedChecksum = data.checksum;
      const dataWithoutChecksum = { ...data };
      delete dataWithoutChecksum.checksum;
      if (this.#computeChecksum(dataWithoutChecksum) !== savedChecksum) {
        this.#resetToDefaults();
        return;
      }

      this.currentLevel = data.currentLevel;
      this.highScore = data.highScore;
      this.totalScore = data.totalScore;
      this.levelScores = [...data.levelScores];
      this.unlockedLevels = data.unlockedLevels;

      // Explicit allowlist for settings — reject unknown keys [Fix 8]
      if (data.settings && typeof data.settings === 'object') {
        this.settings = {
          showMinimap: typeof data.settings.showMinimap === 'boolean'
            ? data.settings.showMinimap
            : true,
        };
      }

      // Invalidate level select cache [Fix 5]
      this._levelSelectCache = null;
    } catch (_e) {
      this.#resetToDefaults();
    }
  }

  /** Reset all state to defaults. */
  #resetToDefaults() {
    this.currentLevel = 0;
    this.totalScore = 0;
    this.highScore = 0;
    this.levelScores = [];
    this.unlockedLevels = 1;
    this.hintsUsed = 0;
    this.levelStartTime = 0;
    this._pausedAt = 0;
    this._accumulatedPauseMs = 0;
    this.settings = { showMinimap: true };
    this._levelSelectCache = null;
  }

  /**
   * Validate save data schema, types, and ranges. [Fix 7]
   * @param {Object} data
   * @returns {boolean}
   */
  #validateSaveData(data) {
    if (typeof data !== 'object' || data === null) return false;
    if (data.version !== 1) return false;
    if (typeof data.currentLevel !== 'number' || !Number.isInteger(data.currentLevel)) return false;
    if (typeof data.highScore !== 'number') return false;
    if (typeof data.totalScore !== 'number') return false;
    if (!Array.isArray(data.levelScores)) return false;
    if (typeof data.unlockedLevels !== 'number' || !Number.isInteger(data.unlockedLevels)) return false;
    if (typeof data.checksum !== 'string') return false;
    if (typeof data.savedAt !== 'string') return false;

    // Range validation [Fix 7] — reject tampered extreme values
    if (!Number.isFinite(data.currentLevel) || data.currentLevel < 0 || data.currentLevel > 50) return false;
    if (!Number.isFinite(data.unlockedLevels) || data.unlockedLevels < 1 || data.unlockedLevels > 50) return false;
    if (!Number.isFinite(data.highScore) || data.highScore < 0) return false;
    if (!Number.isFinite(data.totalScore) || data.totalScore < 0) return false;

    // Validate levelScores elements are finite non-negative numbers [Fix 7]
    for (const s of data.levelScores) {
      if (typeof s !== 'number' || !Number.isFinite(s) || s < 0) return false;
    }

    return true;
  }

  /**
   * Compute a simple checksum for save data integrity detection. [Fix 14]
   * Private — tested indirectly via save/load roundtrip.
   * Not cryptographic — just detects accidental corruption.
   * @param {Object} data
   * @returns {string}
   */
  #computeChecksum(data) {
    const str = JSON.stringify(data);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash + char) | 0;
    }
    return (hash >>> 0).toString(36);
  }

  // ── Settings ──────────────────────────────────────────────

  /**
   * Update settings and optionally auto-save.
   * @param {Object} newSettings — partial settings object
   */
  updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
  }
}

/**
 * Standalone checksum utility — same algorithm as the private class method.
 * Exported for test helpers that need to construct valid save data. [Fix 14]
 * Not part of the GameStateManager public API.
 * @param {Object} data
 * @returns {string}
 */
function computeChecksum(data) {
  const str = JSON.stringify(data);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return (hash >>> 0).toString(36);
}

export { GameStateManager, LEVEL_CONFIG, SCORE_CONFIG, SAVE_KEY, UNLIMITED_HINTS, computeChecksum };
