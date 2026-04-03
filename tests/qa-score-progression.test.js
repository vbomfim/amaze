/**
 * QA Guardian — Score Calculation Edge Cases & Progression Table Verification
 *
 * Deep testing of the scoring formula at boundary values, and exhaustive
 * verification of the 50-level progression table.
 *
 * Existing tests cover: basic formula, cap at 75% hint penalty, min time bonus,
 * a few representative levels.
 *
 * THIS file covers gaps: score at every boundary level, maximum hints on every level,
 * zero-time on high levels, level 50 scoring, NaN/infinity guards, progression
 * monotonicity, and cross-level score comparisons.
 *
 * Tags: [AC2] [AC15] [AC16] [BOUNDARY] [EDGE] [CONTRACT]
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
// FULL 50-LEVEL PROGRESSION TABLE VERIFICATION [AC2]
// ═══════════════════════════════════════════════════════════════

console.log('\n🧪 QA — Exhaustive progression table verification [AC2]');

{
  const gsm = new GameStateManager({ storage: new FakeStorage() });

  // Expected progression: [level, gridSize, hints]
  const expected = [
    [1, 5, 99],
    [2, 7, 5],
    [3, 9, 4],
    [4, 11, 3], [5, 11, 3],
    [6, 13, 2], [7, 13, 2], [8, 13, 2], [9, 13, 2], [10, 13, 2],
    [11, 15, 1], [12, 15, 1],
    [13, 17, 1], [14, 17, 1],
    [15, 19, 1], [16, 19, 1],
    [17, 21, 1], [18, 21, 1],
    [19, 21, 1], [20, 21, 1],
    [21, 23, 0], [22, 23, 0],
    [23, 25, 0], [24, 25, 0],
    [25, 27, 0], [26, 27, 0],
    [27, 29, 0], [28, 29, 0],
    [29, 31, 0], [30, 31, 0],
    [31, 33, 0], [32, 33, 0],
    [33, 35, 0], [34, 35, 0],
    [35, 37, 0], [36, 37, 0],
    [37, 39, 0], [38, 39, 0],
    [39, 41, 0], [40, 41, 0],
    [41, 43, 0], [42, 43, 0],
    [43, 45, 0], [44, 45, 0],
    [45, 47, 0], [46, 47, 0],
    [47, 49, 0], [48, 49, 0],
    [49, 51, 0], [50, 51, 0],
  ];

  let allCorrect = true;
  const mismatches = [];

  for (const [level, expectedSize, expectedHints] of expected) {
    const cfg = gsm.getLevelConfig(level);
    if (cfg.gridWidth !== expectedSize || cfg.gridHeight !== expectedSize || cfg.hintsAllowed !== expectedHints) {
      allCorrect = false;
      mismatches.push(
        `Level ${level}: expected ${expectedSize}×${expectedSize} hints=${expectedHints}, ` +
        `got ${cfg.gridWidth}×${cfg.gridHeight} hints=${cfg.hintsAllowed}`
      );
    }
  }

  assert(allCorrect, `[AC2] all 50 levels match expected progression table`);
  if (!allCorrect) {
    for (const m of mismatches) {
      console.error(`    ⚠️ ${m}`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// PROGRESSION MONOTONICITY
// ═══════════════════════════════════════════════════════════════

console.log('\n🧪 QA — Grid sizes are monotonically non-decreasing [AC2][CONTRACT]');

{
  const gsm = new GameStateManager({ storage: new FakeStorage() });
  let prevSize = 0;
  let monotonic = true;
  let failedAt = -1;

  for (let level = 1; level <= 50; level++) {
    const cfg = gsm.getLevelConfig(level);
    if (cfg.gridWidth < prevSize) {
      monotonic = false;
      failedAt = level;
      break;
    }
    prevSize = cfg.gridWidth;
  }

  assert(monotonic, `[AC2][CONTRACT] grid sizes never decrease across levels${failedAt > 0 ? ` (failed at ${failedAt})` : ''}`);
}

console.log('\n🧪 QA — Hints are monotonically non-increasing [AC2][CONTRACT]');

{
  const gsm = new GameStateManager({ storage: new FakeStorage() });
  let prevHints = Infinity;
  let monotonic = true;

  for (let level = 1; level <= 50; level++) {
    const cfg = gsm.getLevelConfig(level);
    if (cfg.hintsAllowed > prevHints) {
      monotonic = false;
      break;
    }
    prevHints = cfg.hintsAllowed;
  }

  assert(monotonic, '[AC2][CONTRACT] hints never increase across levels');
}

console.log('\n🧪 QA — All grid sizes are odd and ≥5 [AC2][CONTRACT]');

{
  const gsm = new GameStateManager({ storage: new FakeStorage() });
  let allValid = true;

  for (let level = 1; level <= 50; level++) {
    const cfg = gsm.getLevelConfig(level);
    if (cfg.gridWidth % 2 === 0 || cfg.gridWidth < 5 ||
        cfg.gridHeight % 2 === 0 || cfg.gridHeight < 5) {
      allValid = false;
    }
  }

  assert(allValid, '[AC2][CONTRACT] all 50 levels have odd grid ≥ 5');
}

console.log('\n🧪 QA — Grid sizes stay within MazeGenerator limits (5–101) [AC2][CONTRACT]');

{
  const gsm = new GameStateManager({ storage: new FakeStorage() });
  let allInRange = true;

  for (let level = 1; level <= 50; level++) {
    const cfg = gsm.getLevelConfig(level);
    if (cfg.gridWidth < 5 || cfg.gridWidth > 101 ||
        cfg.gridHeight < 5 || cfg.gridHeight > 101) {
      allInRange = false;
    }
  }

  assert(allInRange, '[AC2][CONTRACT] all grid sizes within [5, 101]');
}

// ═══════════════════════════════════════════════════════════════
// SCORE FORMULA BOUNDARY CASES [AC15]
// ═══════════════════════════════════════════════════════════════

console.log('\n🧪 QA — Score at level 50 with zero time (max possible score) [AC15][AC16]');

{
  const gsm = new GameStateManager({ storage: new FakeStorage() });

  // Level 50, 0 hints, 0 seconds = maximum score possible
  const maxScore = gsm.calculateScore({ level: 50, hintsUsed: 0, seconds: 0 }).score;
  // levelMultiplier = 1 + 50*0.5 = 26.0
  // hintFactor = 1.0
  // timeBonus = 1.0
  // score = 1000 * 26.0 * 1.0 * 1.0 = 26000
  assertApprox(maxScore, 26000, 1, '[AC15][AC16] level 50 max score = 26000');
}

console.log('\n🧪 QA — Score at level 50 with max hints and slow time (min score) [AC15][AC16]');

{
  const gsm = new GameStateManager({ storage: new FakeStorage() });

  // Level 50, lots of hints (capped at 0.25), very slow (capped at 0.25)
  const minScore = gsm.calculateScore({ level: 50, hintsUsed: 100, seconds: 999999 }).score;
  // levelMultiplier = 26.0
  // hintFactor = 0.25 (capped)
  // timeBonus = 0.25 (capped)
  // score = 1000 * 26.0 * 0.25 * 0.25 = 1625
  assertApprox(minScore, 1625, 1, '[AC15][AC16] level 50 worst score = 1625');
}

console.log('\n🧪 QA — Score at level 1 worst case [AC15]');

{
  const gsm = new GameStateManager({ storage: new FakeStorage() });

  // Level 1, max hints used, very slow
  const worstL1 = gsm.calculateScore({ level: 1, hintsUsed: 99, seconds: 9999 }).score;
  // levelMultiplier = 1.5, hintFactor = 0.25, timeBonus = 0.25
  // score = 1000 * 1.5 * 0.25 * 0.25 = 93.75 → 93
  assertApprox(worstL1, 93, 1, '[AC15] level 1 worst case = 93');
}

console.log('\n🧪 QA — Score with exactly par time [AC15][BOUNDARY]');

{
  const gsm = new GameStateManager({ storage: new FakeStorage() });

  // Level 1: parTime = 5*5*2 = 50s. At exactly parTime, timeBonus = max(0.25, 1-1) = max(0.25, 0) = 0.25
  const atPar = gsm.calculateScore({ level: 1, hintsUsed: 0, seconds: 50 }).score;
  // 1000 * 1.5 * 1.0 * 0.25 = 375
  assertApprox(atPar, 375, 1, '[AC15][BOUNDARY] at exactly par time: timeBonus floors to 0.25');
}

console.log('\n🧪 QA — Score with half par time [AC15]');

{
  const gsm = new GameStateManager({ storage: new FakeStorage() });

  // Level 1: parTime = 50s. At 25s, timeBonus = max(0.25, 1 - 25/50) = 0.5
  const halfPar = gsm.calculateScore({ level: 1, hintsUsed: 0, seconds: 25 }).score;
  // 1000 * 1.5 * 1.0 * 0.5 = 750
  assertApprox(halfPar, 750, 1, '[AC15] half par time: timeBonus = 0.5');
}

console.log('\n🧪 QA — Score with hint penalty breakpoints [AC15][BOUNDARY]');

{
  const gsm = new GameStateManager({ storage: new FakeStorage() });

  // Each hint = 0.15 penalty
  // 0 hints → factor 1.0
  // 1 hint  → factor 0.85
  // 2 hints → factor 0.70
  // 3 hints → factor 0.55
  // 4 hints → factor 0.40
  // 5 hints → factor 0.25 (cap)
  // 6 hints → factor 0.25 (still capped)

  const factors = [1.0, 0.85, 0.70, 0.55, 0.40, 0.25, 0.25];

  for (let hints = 0; hints <= 6; hints++) {
    const score = gsm.calculateScore({ level: 1, hintsUsed: hints, seconds: 0 }).score;
    // 1000 * 1.5 * factor * 1.0
    const expected = Math.floor(1000 * 1.5 * factors[hints]);
    assertApprox(score, expected, 1, `[AC15][BOUNDARY] ${hints} hints → factor ${factors[hints]} → score ${expected}`);
  }
}

console.log('\n🧪 QA — Score is always a non-negative integer [AC15][CONTRACT]');

{
  const gsm = new GameStateManager({ storage: new FakeStorage() });

  // Test across multiple levels and extreme values
  const testCases = [
    { level: 1, hintsUsed: 0, seconds: 0 },
    { level: 1, hintsUsed: 99, seconds: 999999 },
    { level: 25, hintsUsed: 0, seconds: 0 },
    { level: 25, hintsUsed: 50, seconds: 50000 },
    { level: 50, hintsUsed: 0, seconds: 0 },
    { level: 50, hintsUsed: 100, seconds: 999999 },
  ];

  let allValid = true;
  for (const tc of testCases) {
    const score = gsm.calculateScore(tc).score;
    if (!Number.isInteger(score) || score < 0 || !Number.isFinite(score)) {
      allValid = false;
      console.error(`    ⚠️ Invalid score ${score} for ${JSON.stringify(tc)}`);
    }
  }

  assert(allValid, '[AC15][CONTRACT] all score results are non-negative finite integers');
}

console.log('\n🧪 QA — Higher level yields higher max score (level multiplier grows) [AC15]');

{
  const gsm = new GameStateManager({ storage: new FakeStorage() });

  let prevMax = 0;
  let monotonic = true;

  for (let level = 1; level <= 50; level++) {
    const maxScore = gsm.calculateScore({ level, hintsUsed: 0, seconds: 0 }).score;
    if (maxScore <= prevMax) {
      monotonic = false;
    }
    prevMax = maxScore;
  }

  assert(monotonic, '[AC15] max possible score strictly increases with level');
}

// ═══════════════════════════════════════════════════════════════
// SCORE BREAKDOWN IN completeLevel [AC14]
// ═══════════════════════════════════════════════════════════════

console.log('\n🧪 QA — completeLevel breakdown matches calculateScore [AC14][CONTRACT]');

{
  const gsm = new GameStateManager({ storage: new FakeStorage() });
  gsm.startLevel(10, 0);
  gsm.useHint();
  gsm.useHint();

  const result = gsm.completeLevel(50000); // 50 seconds

  // Verify breakdown components
  assertApprox(result.breakdown.basePoints, 1000, 0, '[AC14] breakdown.basePoints = 1000');
  assertApprox(result.breakdown.levelMultiplier, 1 + 10 * 0.5, 0.001, '[AC14] breakdown.levelMultiplier');
  assertApprox(result.breakdown.hintFactor, 1 - 2 * 0.15, 0.001, '[AC14] breakdown.hintFactor');

  // Recompute score from breakdown
  const recomputed = Math.floor(
    result.breakdown.basePoints *
    result.breakdown.levelMultiplier *
    result.breakdown.hintFactor *
    result.breakdown.timeBonus
  );
  assert(result.score === recomputed, '[AC14][CONTRACT] breakdown multiplied = reported score');
}

// ═══════════════════════════════════════════════════════════════
// PAR TIME COMPUTATION [AC15]
// ═══════════════════════════════════════════════════════════════

console.log('\n🧪 QA — Par time grows with grid size [AC15][CONTRACT]');

{
  const gsm = new GameStateManager({ storage: new FakeStorage() });
  let prevParTime = 0;
  let monotonic = true;

  for (let level = 1; level <= 50; level++) {
    const cfg = gsm.getLevelConfig(level);
    const parTime = cfg.gridWidth * cfg.gridHeight * SCORE_CONFIG.parTimeFactor;
    if (parTime < prevParTime) {
      monotonic = false;
    }
    prevParTime = parTime;
  }

  assert(monotonic, '[AC15][CONTRACT] par time never decreases across levels');
}

console.log('\n🧪 QA — Level 1 par time = 50s, level 50 par time = 5202s [AC15]');

{
  const gsm = new GameStateManager({ storage: new FakeStorage() });

  const l1 = gsm.getLevelConfig(1);
  const parL1 = l1.gridWidth * l1.gridHeight * SCORE_CONFIG.parTimeFactor;
  assert(parL1 === 50, '[AC15] level 1 parTime = 5×5×2 = 50');

  const l50 = gsm.getLevelConfig(50);
  const parL50 = l50.gridWidth * l50.gridHeight * SCORE_CONFIG.parTimeFactor;
  assert(parL50 === 5202, '[AC15] level 50 parTime = 51×51×2 = 5202');
}

// ═══════════════════════════════════════════════════════════════
// LEVEL CONFIG BEYOND 50 AND BELOW 1 [EDGE]
// ═══════════════════════════════════════════════════════════════

console.log('\n🧪 QA — Level config clamping for out-of-range levels [EDGE]');

{
  const gsm = new GameStateManager({ storage: new FakeStorage() });

  // Levels > 50 should be clamped to 50
  const l51 = gsm.getLevelConfig(51);
  const l50 = gsm.getLevelConfig(50);
  const l100 = gsm.getLevelConfig(100);
  const l999 = gsm.getLevelConfig(999);

  assert(l51.gridWidth === l50.gridWidth, '[EDGE] level 51 config = level 50');
  assert(l100.gridWidth === l50.gridWidth, '[EDGE] level 100 config = level 50');
  assert(l999.gridWidth === l50.gridWidth, '[EDGE] level 999 config = level 50');

  // Levels ≤ 0 should be clamped to 1
  const l0 = gsm.getLevelConfig(0);
  const lNeg = gsm.getLevelConfig(-10);
  const l1 = gsm.getLevelConfig(1);

  assert(l0.gridWidth === l1.gridWidth, '[EDGE] level 0 config = level 1');
  assert(lNeg.gridWidth === l1.gridWidth, '[EDGE] level -10 config = level 1');
}

// ═══════════════════════════════════════════════════════════════
// BEST SCORE TRACKING EDGE CASES
// ═══════════════════════════════════════════════════════════════

console.log('\n🧪 QA — Best score only updates if higher [BOUNDARY]');

{
  const gsm = new GameStateManager({ storage: new FakeStorage() });

  // Level 1, fast completion → high score
  gsm.startLevel(1, 0);
  gsm.completeLevel(1000); // 1 second = very fast
  const highScore = gsm.levelScores[0];

  // Replay level 1 with slow completion → lower score
  gsm.startLevel(1, 0);
  gsm.useHint();
  gsm.useHint();
  gsm.useHint();
  gsm.completeLevel(100000); // 100 seconds = slow + hints

  assert(gsm.levelScores[0] === highScore, '[BOUNDARY] best score preserved when new score is worse');
}

console.log('\n🧪 QA — Completing level 3 before level 2 creates sparse array [EDGE]');

{
  const gsm = new GameStateManager({ storage: new FakeStorage() });

  // Jump directly to level 3 (via selectLevel)
  gsm.startLevel(3, 0);
  gsm.completeLevel(10000);

  // levelScores should have entries for indices 0, 1, 2
  assert(gsm.levelScores.length === 3, '[EDGE] levelScores length = 3 after completing level 3');
  assert(gsm.levelScores[0] === 0, '[EDGE] levelScores[0] = 0 (level 1 not played)');
  assert(gsm.levelScores[1] === 0, '[EDGE] levelScores[1] = 0 (level 2 not played)');
  assert(gsm.levelScores[2] > 0, '[EDGE] levelScores[2] > 0 (level 3 completed)');
}

// ═══════════════════════════════════════════════════════════════
// TIME CALCULATION IN completeLevel
// ═══════════════════════════════════════════════════════════════

console.log('\n🧪 QA — completeLevel time calculation [AC14][BOUNDARY]');

{
  const gsm = new GameStateManager({ storage: new FakeStorage() });

  // Zero elapsed time
  gsm.startLevel(1, 5000);
  const r1 = gsm.completeLevel(5000); // same timestamp
  assert(r1.time === 0, '[AC14][BOUNDARY] zero elapsed time');

  // Very small elapsed time (1ms)
  gsm.startLevel(1, 5000);
  const r2 = gsm.completeLevel(5001);
  assertApprox(r2.time, 0.001, 0.0001, '[AC14][BOUNDARY] 1ms elapsed');

  // Large elapsed time (1 hour)
  gsm.startLevel(1, 0);
  const r3 = gsm.completeLevel(3600000);
  assert(r3.time === 3600, '[AC14] 1 hour elapsed = 3600s');
}

// ── Summary ────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`QA Score & Progression Tests: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
