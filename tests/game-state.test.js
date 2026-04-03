/**
 * Unit tests for GameStateManager [TDD]
 *
 * Tests cover:
 * - AC2: Progressive difficulty — level progression table
 * - AC15: Score formula with all factors (base, level, hints, time)
 * - AC14: Level complete data (time, hints, score)
 * - AC16: Level 50 cap and victory detection
 * - AC17: HUD data access (level, timer, hints)
 * - AC18: Start screen data (continue availability, high score)
 * - Save/Load: localStorage roundtrip, corruption handling, schema validation
 * - Replay: Level select with best scores per level
 */

import { GameStateManager, SCORE_CONFIG, computeChecksum } from '../js/game-state.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${message}`);
  } else {
    failed++;
    console.error(`  ❌ ${message}`);
  }
}

function assertApprox(actual, expected, tolerance, message) {
  const diff = Math.abs(actual - expected);
  if (diff <= tolerance) {
    passed++;
    console.log(`  ✅ ${message} (got ${actual})`);
  } else {
    failed++;
    console.error(`  ❌ ${message} — expected ~${expected}, got ${actual} (diff ${diff})`);
  }
}



// ── Fake localStorage for Node.js ──────────────────────────────
class FakeStorage {
  constructor() { this._data = {}; }
  getItem(key) { return key in this._data ? this._data[key] : null; }
  setItem(key, value) { this._data[key] = String(value); }
  removeItem(key) { delete this._data[key]; }
  clear() { this._data = {}; }
}

// ── Level Progression Table Tests (AC2) ────────────────────────

console.log('\n🧪 GameStateManager — Level Progression Table [AC2]');

{
  const gsm = new GameStateManager({ storage: new FakeStorage() });

  // Level 1: 5×5, unlimited hints (99)
  const l1 = gsm.getLevelConfig(1);
  assert(l1.gridWidth === 5 && l1.gridHeight === 5, 'level 1: grid 5×5');
  assert(l1.hintsAllowed === 99, 'level 1: unlimited hints (99)');

  // Level 2: 7×7, 5 hints
  const l2 = gsm.getLevelConfig(2);
  assert(l2.gridWidth === 7 && l2.gridHeight === 7, 'level 2: grid 7×7');
  assert(l2.hintsAllowed === 5, 'level 2: 5 hints');

  // Level 3: 9×9, 4 hints
  const l3 = gsm.getLevelConfig(3);
  assert(l3.gridWidth === 9 && l3.gridHeight === 9, 'level 3: grid 9×9');
  assert(l3.hintsAllowed === 4, 'level 3: 4 hints');

  // Level 4: 11×11, 3 hints
  const l4 = gsm.getLevelConfig(4);
  assert(l4.gridWidth === 11 && l4.gridHeight === 11, 'level 4: grid 11×11');
  assert(l4.hintsAllowed === 3, 'level 4: 3 hints');

  // Level 5: 11×11, 3 hints
  const l5 = gsm.getLevelConfig(5);
  assert(l5.gridWidth === 11 && l5.gridHeight === 11, 'level 5: grid 11×11');
  assert(l5.hintsAllowed === 3, 'level 5: 3 hints');

  // Level 6: 13×13, 2 hints
  const l6 = gsm.getLevelConfig(6);
  assert(l6.gridWidth === 13 && l6.gridHeight === 13, 'level 6: grid 13×13');
  assert(l6.hintsAllowed === 2, 'level 6: 2 hints');

  // Level 10: 13×13, 2 hints
  const l10 = gsm.getLevelConfig(10);
  assert(l10.gridWidth === 13 && l10.gridHeight === 13, 'level 10: grid 13×13');
  assert(l10.hintsAllowed === 2, 'level 10: 2 hints');

  // Level 11: 15×15, 1 hint
  const l11 = gsm.getLevelConfig(11);
  assert(l11.gridWidth === 15 && l11.gridHeight === 15, 'level 11: grid 15×15');
  assert(l11.hintsAllowed === 1, 'level 11: 1 hint');

  // Level 12: 15×15 (same pair as 11)
  const l12 = gsm.getLevelConfig(12);
  assert(l12.gridWidth === 15 && l12.gridHeight === 15, 'level 12: grid 15×15');

  // Level 13: 17×17 (increment by 2 from 15)
  const l13 = gsm.getLevelConfig(13);
  assert(l13.gridWidth === 17 && l13.gridHeight === 17, 'level 13: grid 17×17');

  // Level 20: 21×21 (11→12:15, 13→14:17, 15→16:19, 17→18:21, 19→20:21)
  const l20 = gsm.getLevelConfig(20);
  assert(l20.gridWidth === 21 && l20.gridHeight === 21, 'level 20: grid 21×21');
  assert(l20.hintsAllowed === 1, 'level 20: 1 hint');

  // Level 21: 23×23, 0 hints
  const l21 = gsm.getLevelConfig(21);
  assert(l21.gridWidth === 23 && l21.gridHeight === 23, 'level 21: grid 23×23');
  assert(l21.hintsAllowed === 0, 'level 21: 0 hints');

  // Level 22: 23×23 (same pair as 21)
  const l22 = gsm.getLevelConfig(22);
  assert(l22.gridWidth === 23 && l22.gridHeight === 23, 'level 22: grid 23×23');

  // Level 23: 25×25
  const l23 = gsm.getLevelConfig(23);
  assert(l23.gridWidth === 25 && l23.gridHeight === 25, 'level 23: grid 25×25');

  // Level 50: should cap at valid size
  const l50 = gsm.getLevelConfig(50);
  assert(l50.gridWidth <= 101 && l50.gridHeight <= 101, 'level 50: grid ≤ 101');
  assert(l50.hintsAllowed === 0, 'level 50: 0 hints');
  // Level 50: 21→22:23, 23→24:25, ..., 49→50:51
  assert(l50.gridWidth === 51 && l50.gridHeight === 51, 'level 50: grid 51×51');
}

// ── Grid sizes must be odd (MazeGenerator constraint) ──────────

console.log('\n🧪 GameStateManager — Grid sizes always odd [AC2][BOUNDARY]');

{
  const gsm = new GameStateManager({ storage: new FakeStorage() });
  let allOdd = true;
  for (let level = 1; level <= 50; level++) {
    const cfg = gsm.getLevelConfig(level);
    if (cfg.gridWidth % 2 === 0 || cfg.gridHeight % 2 === 0) {
      allOdd = false;
      console.error(`  ❌ level ${level}: grid ${cfg.gridWidth}×${cfg.gridHeight} has even dimension`);
    }
  }
  assert(allOdd, 'all levels 1–50 produce odd grid dimensions');
}

// ── Score Formula Tests (AC15) ─────────────────────────────────

console.log('\n🧪 GameStateManager — Score Formula [AC15]');

{
  const gsm = new GameStateManager({ storage: new FakeStorage() });

  // Base case: level 1, 0 hints, 0 seconds (instant win)
  // score = 1000 × (1 + 1×0.5) × (1 - 0×0.15) × max(0.25, 1 - 0/parTime)
  // parTime = 5×5×2 = 50, timeBonus = max(0.25, 1 - 0/50) = 1.0
  // score = 1000 × 1.5 × 1.0 × 1.0 = 1500
  const s1 = gsm.calculateScore({ level: 1, hintsUsed: 0, seconds: 0 }).score;
  assertApprox(s1, 1500, 1, 'level 1, 0 hints, 0s → 1500');

  // Level 1, 2 hints, 25 seconds
  // parTime = 50, timeBonus = max(0.25, 1 - 25/50) = 0.5
  // hintPenalty = 1 - 2×0.15 = 0.7
  // score = 1000 × 1.5 × 0.7 × 0.5 = 525
  const s2 = gsm.calculateScore({ level: 1, hintsUsed: 2, seconds: 25 }).score;
  assertApprox(s2, 525, 1, 'level 1, 2 hints, 25s → 525');

  // Level 5, 0 hints, 0 seconds
  // levelMultiplier = 1 + 5×0.5 = 3.5
  // parTime = 11×11×2 = 242, timeBonus = 1.0
  // score = 1000 × 3.5 × 1.0 × 1.0 = 3500
  const s3 = gsm.calculateScore({ level: 5, hintsUsed: 0, seconds: 0 }).score;
  assertApprox(s3, 3500, 1, 'level 5, 0 hints, 0s → 3500');

  // Max hint penalty capped at 75% (5 hints × 0.15 = 0.75)
  // hintFactor = max(0.25, 1 - 5×0.15) = max(0.25, 0.25) = 0.25
  const s4 = gsm.calculateScore({ level: 1, hintsUsed: 5, seconds: 0 }).score;
  assertApprox(s4, 375, 1, 'max hint penalty caps at 75% → factor 0.25');

  // More than 5 hints should still cap at 75%
  const s5 = gsm.calculateScore({ level: 1, hintsUsed: 10, seconds: 0 }).score;
  assertApprox(s5, 375, 1, '10 hints still caps at 75% penalty');

  // Time bonus floor at 0.25
  // parTime = 50, seconds = 200 → timeBonus = max(0.25, 1 - 200/50) = max(0.25, -3) = 0.25
  const s6 = gsm.calculateScore({ level: 1, hintsUsed: 0, seconds: 200 }).score;
  assertApprox(s6, 375, 1, 'time bonus floors at 0.25 for very slow completion');

  // Level 10, 1 hint, 100 seconds
  // levelMultiplier = 1 + 10×0.5 = 6.0
  // parTime = 13×13×2 = 338, timeBonus = max(0.25, 1 - 100/338) = max(0.25, 0.704) = 0.704
  // hintFactor = 1 - 1×0.15 = 0.85
  // score = 1000 × 6.0 × 0.85 × 0.704 = 3590.4 → floor = 3590
  const s7 = gsm.calculateScore({ level: 10, hintsUsed: 1, seconds: 100 }).score;
  assertApprox(s7, 3590, 2, 'level 10, 1 hint, 100s → ~3590');

  // Score is always a non-negative integer
  const s8 = gsm.calculateScore({ level: 1, hintsUsed: 99, seconds: 99999 }).score;
  assert(Number.isInteger(s8) && s8 >= 0, 'score is always a non-negative integer');
}

// ── Score config constants [AC15] ──────────────────────────────

console.log('\n🧪 GameStateManager — Score config constants [AC15]');

{
  assert(SCORE_CONFIG.basePoints === 1000, 'basePoints = 1000');
  assert(SCORE_CONFIG.levelMultiplierStep === 0.5, 'levelMultiplierStep = 0.5');
  assert(SCORE_CONFIG.hintPenalty === 0.15, 'hintPenalty = 0.15 per hint');
  assert(SCORE_CONFIG.maxHintPenalty === 0.75, 'maxHintPenalty = 0.75');
  assert(SCORE_CONFIG.minTimeBonus === 0.25, 'minTimeBonus = 0.25');
  assert(SCORE_CONFIG.parTimeFactor === 2, 'parTimeFactor = 2 (width × height × 2)');
}

// ── Level State Management ─────────────────────────────────────

console.log('\n🧪 GameStateManager — Level state management');

{
  const gsm = new GameStateManager({ storage: new FakeStorage() });

  // Initial state
  assert(gsm.currentLevel === 0, 'initial level is 0 (not started)');
  assert(gsm.totalScore === 0, 'initial total score is 0');
  assert(gsm.highScore === 0, 'initial high score is 0');
  assert(gsm.hintsUsed === 0, 'initial hints used is 0');
  assert(gsm.levelStartTime === 0, 'initial level start time is 0');

  // Start level 1
  gsm.startLevel(1, 1000.0);
  assert(gsm.currentLevel === 1, 'current level is 1 after startLevel(1)');
  assert(gsm.hintsUsed === 0, 'hints reset on new level');
  assert(gsm.levelStartTime === 1000.0, 'level start time recorded');

  // Use hints
  gsm.useHint();
  assert(gsm.hintsUsed === 1, 'hints used incremented to 1');
  gsm.useHint();
  assert(gsm.hintsUsed === 2, 'hints used incremented to 2');

  // Cannot use more hints than allowed
  const l1Config = gsm.getLevelConfig(1);
  assert(l1Config.hintsAllowed === 99, 'level 1 allows 99 hints');
  // For level 2 with 5 hints allowed:
  gsm.startLevel(2, 2000.0);
  for (let i = 0; i < 5; i++) gsm.useHint();
  assert(gsm.hintsUsed === 5, '5 hints used on level 2');
  const canUseMore = gsm.canUseHint();
  assert(canUseMore === false, 'cannot use 6th hint on level 2 (max 5)');
}

// ── Level Complete and Score Tracking (AC14) ───────────────────

console.log('\n🧪 GameStateManager — Level complete & score tracking [AC14]');

{
  const gsm = new GameStateManager({ storage: new FakeStorage() });

  // Start and complete level 1
  gsm.startLevel(1, 1000.0);
  gsm.useHint();
  const result = gsm.completeLevel(26000.0); // 25 seconds elapsed

  assert(result !== null, 'completeLevel returns a result object');
  assert(result.level === 1, 'result.level is 1');
  assert(result.time === 25, 'result.time is 25 seconds');
  assert(result.hintsUsed === 1, 'result.hintsUsed is 1');
  assert(typeof result.score === 'number' && result.score > 0, 'result.score is a positive number');
  assert(typeof result.totalScore === 'number', 'result.totalScore is a number');
  assert(result.totalScore === result.score, 'total score equals first level score');

  // Score breakdown should be present
  assert(typeof result.breakdown === 'object', 'result has breakdown object');
  assert(result.breakdown.basePoints === 1000, 'breakdown.basePoints');
  assert(typeof result.breakdown.levelMultiplier === 'number', 'breakdown.levelMultiplier');
  assert(typeof result.breakdown.hintFactor === 'number', 'breakdown.hintFactor');
  assert(typeof result.breakdown.timeBonus === 'number', 'breakdown.timeBonus');

  // High score should be set
  assert(gsm.highScore === result.totalScore, 'high score set after first level');

  // Level scores array should have the score
  assert(gsm.levelScores.length === 1, 'levelScores has 1 entry');
  assert(gsm.levelScores[0] === result.score, 'levelScores[0] matches result.score');

  // Unlocked levels should advance
  assert(gsm.unlockedLevels === 2, 'completing level 1 unlocks level 2');
}

// ── Level Best Scores (Replay) ─────────────────────────────────

console.log('\n🧪 GameStateManager — Level best scores for replay');

{
  const gsm = new GameStateManager({ storage: new FakeStorage() });

  // Complete level 1 twice with different scores
  gsm.startLevel(1, 0);
  gsm.completeLevel(25000); // 25s
  const firstScore = gsm.levelScores[0];

  gsm.startLevel(1, 0); // replay level 1
  gsm.completeLevel(5000); // 5s — faster, better score
  const secondScore = gsm.levelScores[0];

  assert(secondScore >= firstScore, 'best score kept when replaying (better score wins)');
}

// ── Level Cap at 50 (AC16) ─────────────────────────────────────

console.log('\n🧪 GameStateManager — Level cap at 50 [AC16]');

{
  const gsm = new GameStateManager({ storage: new FakeStorage() });

  assert(gsm.maxLevel === 50, 'max level is 50');

  // Level 50 config should be valid
  const l50 = gsm.getLevelConfig(50);
  assert(l50.gridWidth >= 5, 'level 50 has valid grid width');
  assert(l50.gridWidth % 2 === 1, 'level 50 grid width is odd');

  // Levels beyond 50 should replay level 50 config
  const l51 = gsm.getLevelConfig(51);
  assert(l51.gridWidth === l50.gridWidth, 'level 51 uses level 50 grid width');
  assert(l51.gridHeight === l50.gridHeight, 'level 51 uses level 50 grid height');
  assert(l51.hintsAllowed === l50.hintsAllowed, 'level 51 uses level 50 hints');

  // isVictory flag
  gsm.startLevel(50, 0);
  const result = gsm.completeLevel(10000);
  assert(result.isVictory === true, 'completing level 50 sets isVictory flag');

  // After victory, next level is still 50 config
  gsm.startLevel(50, 0); // replay
  assert(gsm.currentLevel === 50, 'can replay level 50');
}

// ── HUD Data Access (AC17) ─────────────────────────────────────

console.log('\n🧪 GameStateManager — HUD data access [AC17]');

{
  const gsm = new GameStateManager({ storage: new FakeStorage() });

  gsm.startLevel(1, 5000);

  // Level display
  assert(gsm.currentLevel === 1, 'HUD: current level');

  // Timer — elapsed seconds from level start
  const elapsed = gsm.getElapsedSeconds(35000); // 30 seconds
  assert(elapsed === 30, 'HUD: elapsed seconds = 30');

  // Format timer
  const formatted = gsm.formatTime(65); // 1:05
  assert(formatted === '01:05', 'formatTime(65) → 01:05');
  const formatted2 = gsm.formatTime(0);
  assert(formatted2 === '00:00', 'formatTime(0) → 00:00');
  const formatted3 = gsm.formatTime(3599);
  assert(formatted3 === '59:59', 'formatTime(3599) → 59:59');

  // Hints display
  const hintsDisplay = gsm.getHintsDisplay();
  assert(hintsDisplay === '∞', 'level 1 shows ∞ for unlimited hints');

  gsm.startLevel(2, 0);
  const hintsDisplay2 = gsm.getHintsDisplay();
  assert(hintsDisplay2 === '5', 'level 2 starts with 5 hints remaining');

  gsm.useHint();
  const hintsDisplay3 = gsm.getHintsDisplay();
  assert(hintsDisplay3 === '4', 'after 1 hint used, 4 remaining');
}

// ── Start Screen Data (AC18) ───────────────────────────────────

console.log('\n🧪 GameStateManager — Start screen data [AC18]');

{
  const storage = new FakeStorage();
  const gsm = new GameStateManager({ storage });

  // Fresh game — no save data
  assert(gsm.hasSaveData() === false, 'no save data on fresh game');
  assert(gsm.highScore === 0, 'high score is 0 on fresh game');
  assert(gsm.unlockedLevels === 1, 'unlocked levels starts at 1');
  assert(gsm.canContinue() === false, 'cannot continue with no save');

  // After completing a level and saving
  gsm.startLevel(1, 0);
  gsm.completeLevel(10000);
  gsm.save();

  assert(gsm.hasSaveData() === true, 'has save data after save()');
  assert(gsm.canContinue() === true, 'can continue after completing level');
}

// ── Save/Load System ───────────────────────────────────────────

console.log('\n🧪 GameStateManager — Save/Load roundtrip');

{
  const storage = new FakeStorage();
  const gsm = new GameStateManager({ storage });

  // Play through some levels
  gsm.startLevel(1, 0);
  gsm.completeLevel(10000);
  gsm.startLevel(2, 10000);
  gsm.useHint();
  gsm.useHint();
  gsm.completeLevel(30000);
  gsm.save();

  // Verify save key
  const raw = storage.getItem('amaze_save_v1');
  assert(raw !== null, 'save data written to amaze_save_v1');

  const data = JSON.parse(raw);
  assert(data.version === 1, 'save data version is 1');
  assert(data.currentLevel === 2, 'saved current level');
  assert(typeof data.highScore === 'number', 'saved high score');
  assert(typeof data.totalScore === 'number', 'saved total score');
  assert(Array.isArray(data.levelScores), 'saved level scores array');
  assert(data.unlockedLevels === 3, 'saved unlocked levels');
  assert(typeof data.checksum === 'string', 'saved checksum');
  assert(typeof data.savedAt === 'string', 'saved timestamp (ISO-8601)');
  assert(typeof data.settings === 'object', 'saved settings object');

  // Load into new instance
  const gsm2 = new GameStateManager({ storage });
  gsm2.load();

  assert(gsm2.currentLevel === gsm.currentLevel, 'loaded current level matches');
  assert(gsm2.highScore === gsm.highScore, 'loaded high score matches');
  assert(gsm2.totalScore === gsm.totalScore, 'loaded total score matches');
  assert(gsm2.unlockedLevels === gsm.unlockedLevels, 'loaded unlocked levels matches');
  assert(gsm2.levelScores.length === gsm.levelScores.length, 'loaded level scores length matches');
}

// ── Save/Load — Corruption Handling ────────────────────────────

console.log('\n🧪 GameStateManager — Save corruption handling');

{
  // Invalid JSON
  const storage1 = new FakeStorage();
  storage1.setItem('amaze_save_v1', 'not-json');
  const gsm1 = new GameStateManager({ storage: storage1 });
  gsm1.load();
  assert(gsm1.currentLevel === 0, 'invalid JSON → reset to defaults');
  assert(gsm1.totalScore === 0, 'invalid JSON → score 0');

  // Wrong version
  const storage2 = new FakeStorage();
  storage2.setItem('amaze_save_v1', JSON.stringify({ version: 99 }));
  const gsm2 = new GameStateManager({ storage: storage2 });
  gsm2.load();
  assert(gsm2.currentLevel === 0, 'wrong version → reset to defaults');

  // Missing fields
  const storage3 = new FakeStorage();
  storage3.setItem('amaze_save_v1', JSON.stringify({ version: 1 }));
  const gsm3 = new GameStateManager({ storage: storage3 });
  gsm3.load();
  assert(gsm3.currentLevel === 0, 'missing fields → reset to defaults');

  // Invalid types (string instead of number)
  const storage4 = new FakeStorage();
  storage4.setItem('amaze_save_v1', JSON.stringify({
    version: 1,
    currentLevel: 'five',
    highScore: 100,
    totalScore: 100,
    levelScores: [],
    unlockedLevels: 1,
    settings: {},
    checksum: 'abc',
    savedAt: new Date().toISOString()
  }));
  const gsm4 = new GameStateManager({ storage: storage4 });
  gsm4.load();
  assert(gsm4.currentLevel === 0, 'invalid type → reset to defaults');

  // Tampered checksum
  const storage5 = new FakeStorage();
  const validGsm = new GameStateManager({ storage: storage5 });
  validGsm.startLevel(1, 0);
  validGsm.completeLevel(10000);
  validGsm.save();
  // Tamper with the saved data
  const savedData = JSON.parse(storage5.getItem('amaze_save_v1'));
  savedData.highScore = 9999999;
  storage5.setItem('amaze_save_v1', JSON.stringify(savedData));
  const gsm5 = new GameStateManager({ storage: storage5 });
  gsm5.load();
  assert(gsm5.currentLevel === 0, 'tampered checksum → reset to defaults');
}

// ── Save/Load — No storage (graceful fallback) ─────────────────

console.log('\n🧪 GameStateManager — No storage graceful fallback');

{
  // Broken storage that throws
  const brokenStorage = {
    getItem() { throw new Error('storage unavailable'); },
    setItem() { throw new Error('storage unavailable'); },
    removeItem() { throw new Error('storage unavailable'); },
  };
  const gsm = new GameStateManager({ storage: brokenStorage });
  // Should not throw
  gsm.load();
  assert(gsm.currentLevel === 0, 'broken storage → defaults (no crash)');
  // save should also not throw
  let saveOk = true;
  try { gsm.save(); } catch (_e) { saveOk = false; }
  assert(saveOk, 'save with broken storage does not throw');
}

// ── Settings ───────────────────────────────────────────────────

console.log('\n🧪 GameStateManager — Settings');

{
  const storage = new FakeStorage();
  const gsm = new GameStateManager({ storage });

  // Default settings
  assert(gsm.settings.showMinimap === true, 'default: minimap shown');

  // Update setting
  gsm.updateSettings({ showMinimap: false });
  assert(gsm.settings.showMinimap === false, 'updated: minimap hidden');

  // Persist and reload
  gsm.save();
  const gsm2 = new GameStateManager({ storage });
  gsm2.load();
  assert(gsm2.settings.showMinimap === false, 'setting persisted through save/load');
}

// ── State Machine Transitions ──────────────────────────────────

console.log('\n🧪 GameStateManager — Game state machine');

{
  const gsm = new GameStateManager({ storage: new FakeStorage() });

  assert(gsm.gameState === 'menu', 'initial state is menu');

  // MENU → PLAYING (new game)
  gsm.newGame(0);
  assert(gsm.gameState === 'playing', 'newGame → playing');
  assert(gsm.currentLevel === 1, 'newGame starts at level 1');

  // PLAYING → PAUSED
  gsm.pause();
  assert(gsm.gameState === 'paused', 'pause → paused');

  // PAUSED → PLAYING (resume)
  gsm.resume();
  assert(gsm.gameState === 'playing', 'resume → playing');

  // PLAYING → LEVEL_COMPLETE
  gsm.completeLevel(10000);
  assert(gsm.gameState === 'levelComplete', 'completeLevel → levelComplete');

  // LEVEL_COMPLETE → PLAYING (next level)
  gsm.nextLevel(10000);
  assert(gsm.gameState === 'playing', 'nextLevel → playing');
  assert(gsm.currentLevel === 2, 'nextLevel advances to level 2');

  // PLAYING → PAUSED → MENU (quit)
  gsm.pause();
  gsm.quitToMenu();
  assert(gsm.gameState === 'menu', 'quitToMenu → menu');

  // MENU → PLAYING (continue)
  gsm.continueGame(20000);
  assert(gsm.gameState === 'playing', 'continueGame → playing');
  assert(gsm.currentLevel === 2, 'continueGame resumes at saved level');

  // PAUSED → PLAYING (restart level)
  gsm.pause();
  gsm.restartLevel(30000);
  assert(gsm.gameState === 'playing', 'restartLevel → playing');
  assert(gsm.currentLevel === 2, 'restartLevel keeps same level');
  assert(gsm.hintsUsed === 0, 'restartLevel resets hints');
}

// ── Victory State Machine (AC16) ──────────────────────────────

console.log('\n🧪 GameStateManager — Victory state machine [AC16]');

{
  const gsm = new GameStateManager({ storage: new FakeStorage() });

  // Fast-forward to level 50
  gsm.newGame(0);
  for (let i = 1; i < 50; i++) {
    gsm.completeLevel(i * 1000);
    gsm.nextLevel(i * 1000);
  }
  assert(gsm.currentLevel === 50, 'reached level 50');

  // Complete level 50
  const result = gsm.completeLevel(50000);
  assert(result.isVictory === true, 'level 50 completion is victory');
  assert(gsm.gameState === 'victory', 'state is victory after level 50');

  // VICTORY → PLAYING (play again from level 1)
  gsm.newGame(60000);
  assert(gsm.currentLevel === 1, 'play again starts at level 1');
  assert(gsm.gameState === 'playing', 'play again → playing');

  // High score should be preserved
  assert(gsm.highScore > 0, 'high score preserved after play again');
}

// ── Level Select Data ──────────────────────────────────────────

console.log('\n🧪 GameStateManager — Level select data');

{
  const gsm = new GameStateManager({ storage: new FakeStorage() });

  gsm.newGame(0);
  gsm.completeLevel(10000);
  gsm.nextLevel(10000);
  gsm.completeLevel(30000);

  const levels = gsm.getLevelSelectData();
  assert(levels.length >= 2, 'level select has at least 2 entries');
  assert(levels[0].level === 1, 'first entry is level 1');
  assert(typeof levels[0].bestScore === 'number', 'level 1 has best score');
  assert(levels[0].unlocked === true, 'level 1 is unlocked');
  assert(levels[1].level === 2, 'second entry is level 2');
  assert(levels[1].unlocked === true, 'level 2 is unlocked');
  // Level 3 should be unlocked (we completed 2 levels)
  assert(levels[2].level === 3, 'third entry is level 3');
  assert(levels[2].unlocked === true, 'level 3 is unlocked');

  // Select a level to replay
  gsm.selectLevel(1, 40000);
  assert(gsm.currentLevel === 1, 'selectLevel(1) sets level to 1');
  assert(gsm.gameState === 'playing', 'selectLevel → playing');
}

// ── Checksum ───────────────────────────────────────────────────

console.log('\n🧪 GameStateManager — Checksum validation');

{
  // Checksum should be deterministic for same data [Fix 14]
  const data1 = { currentLevel: 5, highScore: 1000, totalScore: 2000 };
  const data2 = { currentLevel: 5, highScore: 1000, totalScore: 2000 };
  const c1 = computeChecksum(data1);
  const c2 = computeChecksum(data2);
  assert(c1 === c2, 'same data produces same checksum');

  // Different data produces different checksum
  const data3 = { currentLevel: 5, highScore: 9999, totalScore: 2000 };
  const c3 = computeChecksum(data3);
  assert(c1 !== c3, 'different data produces different checksum');

  // Checksum is a string
  assert(typeof c1 === 'string', 'checksum is a string');
  assert(c1.length > 0, 'checksum is non-empty');
}

// ── Edge Cases ─────────────────────────────────────────────────

console.log('\n🧪 GameStateManager — Edge cases [EDGE]');

{
  const gsm = new GameStateManager({ storage: new FakeStorage() });

  // getLevelConfig(0) should default to level 1
  const l0 = gsm.getLevelConfig(0);
  assert(l0.gridWidth === 5 && l0.gridHeight === 5, 'getLevelConfig(0) → level 1 defaults');

  // Negative level → clamp to 1
  const ln = gsm.getLevelConfig(-5);
  assert(ln.gridWidth === 5, 'negative level → level 1 defaults');

  // calculateScore with 0 seconds
  const s = gsm.calculateScore({ level: 1, hintsUsed: 0, seconds: 0 }).score;
  assert(s > 0, 'score with 0 seconds is positive');

  // formatTime edge cases
  assert(gsm.formatTime(-1) === '00:00', 'formatTime(-1) → 00:00');
  assert(gsm.formatTime(3661) === '61:01', 'formatTime(3661) → 61:01 (overflow OK)');
}

// ── Cumulative score tracking ──────────────────────────────────

console.log('\n🧪 GameStateManager — Cumulative score tracking');

{
  const gsm = new GameStateManager({ storage: new FakeStorage() });
  gsm.newGame(0);
  const r1 = gsm.completeLevel(10000);
  gsm.nextLevel(10000);
  const r2 = gsm.completeLevel(20000);

  assert(r2.totalScore === r1.score + r2.score, 'total score is cumulative');
  assert(gsm.totalScore === r1.score + r2.score, 'gsm.totalScore matches');
}

// ── Pause Time Compensation (Fix 1) ────────────────────────────

console.log('\n🧪 GameStateManager — Pause time compensation [Fix 1]');

{
  const gsm = new GameStateManager({ storage: new FakeStorage() });

  // Start level at t=0
  gsm.startLevel(1, 0);

  // Verify initial pause accumulators are zero
  assert(gsm._pausedAt === 0, '[Fix 1] initial _pausedAt is 0');
  assert(gsm._accumulatedPauseMs === 0, '[Fix 1] initial _accumulatedPauseMs is 0');

  // Elapsed at t=10000 with no pause should be 10 seconds
  const elapsed1 = gsm.getElapsedSeconds(10000);
  assert(elapsed1 === 10, '[Fix 1] elapsed 10s with no pause');
}

{
  const gsm = new GameStateManager({ storage: new FakeStorage() });

  // Start level at t=0
  gsm.startLevel(1, 0);

  // Simulate pause: manually set _pausedAt and _accumulatedPauseMs
  // to test the elapsed time calculation without relying on Date.now()
  gsm._accumulatedPauseMs = 5000; // 5 seconds of pause

  // At t=15000 with 5s pause, effective elapsed = (15000 - 0 - 5000) / 1000 = 10s
  const elapsed = gsm.getElapsedSeconds(15000);
  assert(elapsed === 10, '[Fix 1] elapsed excludes 5s of pause → 10s effective');
}

{
  const gsm = new GameStateManager({ storage: new FakeStorage() });

  // Start level at t=1000
  gsm.startLevel(1, 1000);

  // Accumulate 3000ms of pause time
  gsm._accumulatedPauseMs = 3000;

  // At t=11000, raw elapsed = 10000ms, minus 3000ms pause = 7000ms = 7s
  const elapsed = gsm.getElapsedSeconds(11000);
  assert(elapsed === 7, '[Fix 1] elapsed with pause offset: 7s');
}

{
  const gsm = new GameStateManager({ storage: new FakeStorage() });

  // Multiple pauses should accumulate
  gsm.startLevel(1, 0);
  gsm._accumulatedPauseMs = 2000; // first pause: 2s

  // Accumulate more pause
  gsm._accumulatedPauseMs += 3000; // second pause: 3s more = 5s total

  // At t=20000, effective = (20000 - 0 - 5000) / 1000 = 15s
  const elapsed = gsm.getElapsedSeconds(20000);
  assert(elapsed === 15, '[Fix 1] multiple pauses accumulate: 15s effective');
}

{
  const gsm = new GameStateManager({ storage: new FakeStorage() });

  // startLevel should reset pause accumulators
  gsm._accumulatedPauseMs = 9999;
  gsm._pausedAt = 12345;
  gsm.startLevel(2, 5000);

  assert(gsm._accumulatedPauseMs === 0, '[Fix 1] startLevel resets _accumulatedPauseMs');
  assert(gsm._pausedAt === 0, '[Fix 1] startLevel resets _pausedAt');
}

{
  const gsm = new GameStateManager({ storage: new FakeStorage() });

  // Score should exclude pause time
  gsm.startLevel(1, 0);
  gsm._accumulatedPauseMs = 300000; // 5 minutes of pause

  // Complete at t=325000 (325s wall time, but 25s effective play time)
  const result = gsm.completeLevel(325000);
  assert(result.time === 25, '[Fix 1] completeLevel time excludes pause duration');

  // Score should be based on 25s, not 325s
  const scoreWithPause = result.score;
  // Reset and check score for 25s without pause
  gsm.startLevel(1, 0);
  const resultNoPause = gsm.completeLevel(25000);
  assert(resultNoPause.score === scoreWithPause, '[Fix 1] score identical with/without pause for same play time');
}

{
  const gsm = new GameStateManager({ storage: new FakeStorage() });

  // pause() should record _pausedAt
  gsm.newGame(0);
  const beforePause = Date.now();
  gsm.pause();
  const afterPause = Date.now();

  assert(gsm._pausedAt >= beforePause && gsm._pausedAt <= afterPause,
    '[Fix 1] pause() records _pausedAt as Date.now()');
  assert(gsm.gameState === 'paused', '[Fix 1] pause() transitions to paused');
}

{
  const gsm = new GameStateManager({ storage: new FakeStorage() });

  // resume() should accumulate pause duration
  gsm.newGame(0);

  // Pause (this sets _pausedAt via Date.now())
  gsm.pause();
  assert(gsm._pausedAt > 0, '[Fix 1] after pause, _pausedAt is set');
  const pausedAt = gsm._pausedAt;

  // Simulate time passing (we can't reliably wait, so check accumulator grows)
  // Manually set _pausedAt to 100ms in the past to guarantee measurable duration
  gsm._pausedAt = Date.now() - 100;

  gsm.resume();

  assert(gsm._pausedAt === 0, '[Fix 1] resume() resets _pausedAt to 0');
  assert(gsm._accumulatedPauseMs >= 100, '[Fix 1] resume() accumulates pause duration (≥100ms)');
  assert(gsm.gameState === 'playing', '[Fix 1] resume() transitions to playing');
}

// ── Summary ────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`GameStateManager Tests: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
