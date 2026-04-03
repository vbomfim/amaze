/**
 * QA Guardian — State Machine Integration Tests
 *
 * Tests the GameStateManager state machine through MULTI-STEP transitions,
 * verifying that complete user flows work end-to-end. These are NOT unit tests
 * for individual transitions (already covered in game-state.test.js).
 *
 * Focus: full lifecycle flows, illegal transition guards, state invariants.
 *
 * Tags: [AC14] [AC16] [AC18] [AC19] [BOUNDARY] [EDGE] [REGRESSION]
 */

import { GameStateManager, LEVEL_CONFIG, SCORE_CONFIG } from '../js/game-state.js';

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

class FakeStorage {
  constructor() { this._data = {}; }
  getItem(key) { return key in this._data ? this._data[key] : null; }
  setItem(key, value) { this._data[key] = String(value); }
  removeItem(key) { delete this._data[key]; }
  clear() { this._data = {}; }
}

// ═══════════════════════════════════════════════════════════════
// FLOW 1: Complete new-game lifecycle (menu → play → complete → next → … → victory)
// ═══════════════════════════════════════════════════════════════

console.log('\n🧪 QA — Full game lifecycle: menu → level 1 → … → victory [AC14][AC16]');

{
  const gsm = new GameStateManager({ storage: new FakeStorage() });
  assert(gsm.gameState === 'menu', '[AC18] starts at menu');

  // Start new game
  gsm.newGame(0);
  assert(gsm.gameState === 'playing', 'newGame transitions to playing');
  assert(gsm.currentLevel === 1, 'starts at level 1');
  assert(gsm.totalScore === 0, 'new game resets total score');

  // Play through all 50 levels
  let timestamp = 0;
  let allTransitionsCorrect = true;
  let prevTotal = 0;

  for (let level = 1; level <= 50; level++) {
    assert(gsm.currentLevel === level, `playing level ${level}`);

    // Simulate some time passing
    timestamp += 10000; // 10s per level
    const result = gsm.completeLevel(timestamp);

    // Verify result shape [AC14]
    if (level < 50) {
      if (gsm.gameState !== 'levelComplete') {
        allTransitionsCorrect = false;
      }
      assert(result.isVictory === false, `level ${level}: not victory`);
      gsm.nextLevel(timestamp);
      if (gsm.gameState !== 'playing') {
        allTransitionsCorrect = false;
      }
    } else {
      // Level 50 → victory [AC16]
      assert(result.isVictory === true, '[AC16] level 50 is victory');
      assert(gsm.gameState === 'victory', '[AC16] state is victory');
    }

    // Score must be cumulative and increasing
    assert(result.totalScore > prevTotal, `score cumulative at level ${level}`);
    prevTotal = result.totalScore;
  }

  assert(allTransitionsCorrect, 'all levelComplete → nextLevel → playing transitions correct');
  assert(gsm.unlockedLevels === 50, 'all 50 levels unlocked after full playthrough');
  assert(gsm.highScore > 0, 'high score set after full playthrough');
  assert(gsm.levelScores.length === 50, 'best scores recorded for all 50 levels');
}

// ═══════════════════════════════════════════════════════════════
// FLOW 2: Pause/Resume cycle during gameplay
// ═══════════════════════════════════════════════════════════════

console.log('\n🧪 QA — Pause/resume preserves level state [AC19]');

{
  const gsm = new GameStateManager({ storage: new FakeStorage() });
  gsm.newGame(0);
  gsm.useHint();
  gsm.useHint();

  const levelBefore = gsm.currentLevel;
  const hintsBefore = gsm.hintsUsed;
  const startTimeBefore = gsm.levelStartTime;

  // Pause
  gsm.pause();
  assert(gsm.gameState === 'paused', '[AC19] paused');

  // Verify no state mutation during pause
  assert(gsm.currentLevel === levelBefore, '[AC19] level unchanged during pause');
  assert(gsm.hintsUsed === hintsBefore, '[AC19] hints unchanged during pause');
  assert(gsm.levelStartTime === startTimeBefore, '[AC19] start time unchanged during pause');

  // Resume
  gsm.resume();
  assert(gsm.gameState === 'playing', '[AC19] resumed to playing');
  assert(gsm.currentLevel === levelBefore, '[AC19] level preserved after resume');
  assert(gsm.hintsUsed === hintsBefore, '[AC19] hints preserved after resume');

  // Multiple rapid pause/resume cycles
  for (let i = 0; i < 10; i++) {
    gsm.pause();
    gsm.resume();
  }
  assert(gsm.gameState === 'playing', '[EDGE] 10 rapid pause/resume cycles: still playing');
  assert(gsm.currentLevel === levelBefore, '[EDGE] rapid pause/resume: level preserved');
}

// ═══════════════════════════════════════════════════════════════
// FLOW 3: Restart level resets correctly [AC19]
// ═══════════════════════════════════════════════════════════════

console.log('\n🧪 QA — Restart level resets hints but keeps score [AC19]');

{
  const gsm = new GameStateManager({ storage: new FakeStorage() });
  gsm.newGame(0);

  // Complete level 1 to accumulate some score
  gsm.completeLevel(10000);
  const scoreAfterL1 = gsm.totalScore;
  gsm.nextLevel(10000);

  // Use some hints on level 2
  gsm.useHint();
  gsm.useHint();
  assert(gsm.hintsUsed === 2, 'used 2 hints before restart');

  // Pause then restart
  gsm.pause();
  gsm.restartLevel(15000);

  assert(gsm.gameState === 'playing', '[AC19] restart → playing');
  assert(gsm.currentLevel === 2, '[AC19] restart stays on same level');
  assert(gsm.hintsUsed === 0, '[AC19] restart resets hints to 0');
  assert(gsm.levelStartTime === 15000, '[AC19] restart resets start time');
  assert(gsm.totalScore === scoreAfterL1, '[AC19] restart does not lose accumulated score');
}

// ═══════════════════════════════════════════════════════════════
// FLOW 4: Quit to menu preserves progress
// ═══════════════════════════════════════════════════════════════

console.log('\n🧪 QA — Quit to menu preserves unlocked levels and scores [AC19]');

{
  const storage = new FakeStorage();
  const gsm = new GameStateManager({ storage });
  gsm.newGame(0);

  // Complete levels 1-3
  for (let i = 1; i <= 3; i++) {
    gsm.completeLevel(i * 10000);
    if (i < 3) gsm.nextLevel(i * 10000);
  }

  const scoreBefore = gsm.totalScore;
  const highScoreBefore = gsm.highScore;
  const unlockedBefore = gsm.unlockedLevels;
  const levelScoresLen = gsm.levelScores.length;

  // Quit
  gsm.quitToMenu();
  assert(gsm.gameState === 'menu', '[AC19] quit → menu');
  assert(gsm.totalScore === scoreBefore, 'total score preserved after quit');
  assert(gsm.highScore === highScoreBefore, 'high score preserved after quit');
  assert(gsm.unlockedLevels === unlockedBefore, 'unlocked levels preserved after quit');
  assert(gsm.levelScores.length === levelScoresLen, 'level scores preserved after quit');
}

// ═══════════════════════════════════════════════════════════════
// FLOW 5: Level select → play → complete → return to menu
// ═══════════════════════════════════════════════════════════════

console.log('\n🧪 QA — Level select replay flow [BOUNDARY]');

{
  const gsm = new GameStateManager({ storage: new FakeStorage() });
  gsm.newGame(0);

  // Complete levels 1-5 to unlock them
  for (let i = 1; i <= 5; i++) {
    gsm.completeLevel(i * 10000);
    if (i < 5) gsm.nextLevel(i * 10000);
  }
  gsm.quitToMenu();

  // Verify level select data
  const selectData = gsm.getLevelSelectData();
  assert(selectData.length === 50, 'level select shows all 50 levels');
  for (let i = 0; i < 6; i++) {
    assert(selectData[i].unlocked === true, `level ${i + 1} unlocked`);
  }
  assert(selectData[6].unlocked === false, 'level 7 still locked');

  // Replay level 3
  const oldScoreL3 = gsm.levelScores[2];
  gsm.selectLevel(3, 100000);
  assert(gsm.gameState === 'playing', 'selectLevel → playing');
  assert(gsm.currentLevel === 3, 'playing level 3');

  // Complete with a faster time (should update best score)
  const result = gsm.completeLevel(100001); // 0.001 seconds = insanely fast
  assert(result.score > 0, 'replay produces a score');

  // Best score should be the better of old and new
  assert(
    gsm.levelScores[2] >= oldScoreL3,
    'best score updated if new score is better'
  );
}

// ═══════════════════════════════════════════════════════════════
// FLOW 6: Continue game after save/load
// ═══════════════════════════════════════════════════════════════

console.log('\n🧪 QA — Save → reload → continue game flow [AC18]');

{
  const storage = new FakeStorage();

  // Session 1: play through levels 1-3
  const gsm1 = new GameStateManager({ storage });
  gsm1.newGame(0);
  gsm1.completeLevel(10000);
  gsm1.nextLevel(10000);
  gsm1.completeLevel(20000);
  gsm1.nextLevel(20000);
  gsm1.completeLevel(30000);
  gsm1.save();

  // Session 2: fresh instance, load, continue
  const gsm2 = new GameStateManager({ storage });
  gsm2.load();

  assert(gsm2.canContinue() === true, '[AC18] canContinue after load');
  assert(gsm2.hasSaveData() === true, '[AC18] hasSaveData after load');

  gsm2.continueGame(50000);
  assert(gsm2.gameState === 'playing', 'continueGame → playing');
  assert(gsm2.currentLevel === gsm1.currentLevel, 'continues at saved level');
  assert(gsm2.highScore === gsm1.highScore, 'high score preserved across sessions');
  assert(gsm2.unlockedLevels === gsm1.unlockedLevels, 'unlocked levels preserved');

  // Can still complete levels
  const result = gsm2.completeLevel(60000);
  assert(result.score > 0, 'can complete levels after continue');
}

// ═══════════════════════════════════════════════════════════════
// FLOW 7: Victory → play again vs level select
// ═══════════════════════════════════════════════════════════════

console.log('\n🧪 QA — Victory → play again resets score; level select preserves [AC16]');

{
  const gsm = new GameStateManager({ storage: new FakeStorage() });
  gsm.newGame(0);

  // Fast-forward to victory
  for (let i = 1; i <= 50; i++) {
    gsm.completeLevel(i * 1000);
    if (i < 50) gsm.nextLevel(i * 1000);
  }

  const victoryHighScore = gsm.highScore;
  const victoryTotal = gsm.totalScore;
  assert(gsm.gameState === 'victory', 'reached victory');

  // Play again (new game from victory)
  gsm.newGame(100000);
  assert(gsm.currentLevel === 1, '[AC16] play again starts at level 1');
  assert(gsm.totalScore === 0, '[AC16] play again resets total score');
  assert(gsm.highScore === victoryHighScore, '[AC16] play again preserves high score');
  assert(gsm.unlockedLevels >= 50, '[AC16] play again preserves unlocked levels');
}

{
  const gsm = new GameStateManager({ storage: new FakeStorage() });
  gsm.newGame(0);

  // Fast-forward to victory
  for (let i = 1; i <= 50; i++) {
    gsm.completeLevel(i * 1000);
    if (i < 50) gsm.nextLevel(i * 1000);
  }

  const victoryHighScore = gsm.highScore;

  // Level select from victory
  gsm.selectLevel(25, 100000);
  assert(gsm.gameState === 'playing', '[AC16] level select from victory → playing');
  assert(gsm.currentLevel === 25, '[AC16] selected level 25');
  assert(gsm.highScore === victoryHighScore, '[AC16] level select preserves high score');
}

// ═══════════════════════════════════════════════════════════════
// GUARD TESTS: Illegal/no-op transitions
// ═══════════════════════════════════════════════════════════════

console.log('\n🧪 QA — Illegal state transitions are no-ops [EDGE]');

{
  const gsm = new GameStateManager({ storage: new FakeStorage() });

  // Pause from menu (should be no-op)
  gsm.pause();
  assert(gsm.gameState === 'menu', '[EDGE] pause from menu: no-op');

  // Resume from menu (should be no-op)
  gsm.resume();
  assert(gsm.gameState === 'menu', '[EDGE] resume from menu: no-op');

  // Start playing
  gsm.newGame(0);

  // Resume while already playing (should be no-op)
  gsm.resume();
  assert(gsm.gameState === 'playing', '[EDGE] resume while playing: stays playing');

  // Double pause
  gsm.pause();
  gsm.pause();
  assert(gsm.gameState === 'paused', '[EDGE] double pause: still paused');

  // Double resume
  gsm.resume();
  gsm.resume();
  assert(gsm.gameState === 'playing', '[EDGE] double resume: still playing');
}

// ═══════════════════════════════════════════════════════════════
// FLOW 8: Hint tracking across state transitions
// ═══════════════════════════════════════════════════════════════

console.log('\n🧪 QA — Hint tracking survives pause/resume [AC17]');

{
  const gsm = new GameStateManager({ storage: new FakeStorage() });
  gsm.newGame(0);
  gsm.nextLevel(0); // go to level 2 (5 hints)
  gsm.startLevel(2, 0);

  gsm.useHint();
  gsm.useHint();
  assert(gsm.hintsUsed === 2, 'used 2 hints');
  assert(gsm.getHintsDisplay() === '3', '3 remaining displayed');

  // Pause and resume
  gsm.pause();
  gsm.resume();

  assert(gsm.hintsUsed === 2, '[AC17] hints preserved through pause/resume');
  assert(gsm.getHintsDisplay() === '3', '[AC17] hints display correct after pause/resume');

  // Use another hint
  gsm.useHint();
  assert(gsm.hintsUsed === 3, 'used 3 hints total');

  // Use remaining 2
  gsm.useHint();
  gsm.useHint();
  assert(gsm.hintsUsed === 5, 'all 5 hints used');
  assert(gsm.canUseHint() === false, 'no more hints available');

  // Try to use one more (should fail)
  const result = gsm.useHint();
  assert(result === false, '[EDGE] useHint returns false when exhausted');
  assert(gsm.hintsUsed === 5, '[EDGE] hints not incremented beyond max');
}

// ═══════════════════════════════════════════════════════════════
// FLOW 9: Multiple new games reset correctly
// ═══════════════════════════════════════════════════════════════

console.log('\n🧪 QA — Multiple new games reset correctly [REGRESSION]');

{
  const gsm = new GameStateManager({ storage: new FakeStorage() });

  // First playthrough — complete 3 levels
  gsm.newGame(0);
  gsm.completeLevel(10000);
  gsm.nextLevel(10000);
  gsm.completeLevel(20000);
  gsm.nextLevel(20000);
  gsm.completeLevel(30000);
  const firstRunScore = gsm.totalScore;
  const firstRunHigh = gsm.highScore;

  // Second playthrough — new game should reset score but preserve high
  gsm.newGame(50000);
  assert(gsm.currentLevel === 1, '[REGRESSION] second newGame starts at 1');
  assert(gsm.totalScore === 0, '[REGRESSION] second newGame resets total score');
  assert(gsm.highScore === firstRunHigh, '[REGRESSION] second newGame preserves high score');
  assert(gsm.hintsUsed === 0, '[REGRESSION] second newGame resets hints');
  assert(gsm.levelScores.length === 0, '[REGRESSION] second newGame clears level scores');

  // Third playthrough
  gsm.completeLevel(60000);
  gsm.newGame(70000);
  assert(gsm.currentLevel === 1, '[REGRESSION] third newGame starts at 1');
  assert(gsm.totalScore === 0, '[REGRESSION] third newGame resets total score');
}

// ═══════════════════════════════════════════════════════════════
// FLOW 10: Level 49→50 boundary transition
// ═══════════════════════════════════════════════════════════════

console.log('\n🧪 QA — Level 49→50 boundary: nextLevel caps at 50 [AC16][BOUNDARY]');

{
  const gsm = new GameStateManager({ storage: new FakeStorage() });
  gsm.newGame(0);

  // Skip to level 49
  for (let i = 1; i < 49; i++) {
    gsm.completeLevel(i * 1000);
    gsm.nextLevel(i * 1000);
  }
  assert(gsm.currentLevel === 49, 'at level 49');

  // Complete level 49 → should go to level 50, NOT victory yet
  gsm.completeLevel(49000);
  assert(gsm.gameState === 'levelComplete', 'level 49 → levelComplete (not victory)');

  gsm.nextLevel(49000);
  assert(gsm.currentLevel === 50, 'nextLevel → level 50');

  // Complete level 50 → VICTORY
  const result = gsm.completeLevel(50000);
  assert(result.isVictory === true, '[AC16] level 50 → victory');
  assert(gsm.gameState === 'victory', '[AC16] state is victory');

  // nextLevel from level 50 should stay at 50 (capped)
  gsm.newGame(60000);
  for (let i = 1; i < 50; i++) {
    gsm.completeLevel(60000 + i * 1000);
    gsm.nextLevel(60000 + i * 1000);
  }
  assert(gsm.currentLevel === 50, 'at level 50 again');

  // Calling nextLevel from levelComplete on level 50...
  // (first complete it to get to levelComplete/victory)
  gsm.completeLevel(120000);
  // After completing level 50, state is victory, not levelComplete
  assert(gsm.gameState === 'victory', 'completing 50 goes to victory');
}

// ── Summary ────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`QA State Machine Integration Tests: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
