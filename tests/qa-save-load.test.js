/**
 * QA Guardian — Save/Load Edge Case Tests
 *
 * Deep testing of save/load corruption scenarios, field tampering,
 * partial data, type coercion attacks, and storage edge cases.
 *
 * The existing tests cover: invalid JSON, wrong version, missing fields,
 * wrong types, tampered checksum, broken storage.
 *
 * THIS file covers gaps: partial field presence, boundary values in saved data,
 * array corruption, settings corruption, concurrent save/load, save size limits,
 * and the checksum collision/bypass edge cases.
 *
 * Tags: [EDGE] [CONTRACT] [REGRESSION]
 */

import { GameStateManager, SAVE_KEY, SCORE_CONFIG, computeChecksum } from '../js/game-state.js';

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

class FakeStorage {
  constructor() { this._data = {}; }
  getItem(key) { return key in this._data ? this._data[key] : null; }
  setItem(key, value) { this._data[key] = String(value); }
  removeItem(key) { delete this._data[key]; }
  clear() { this._data = {}; }
}

/** Helper: create a valid save blob with correct checksum */
function createValidSave(gsm, overrides = {}) {
  const data = {
    version: 1,
    currentLevel: 5,
    highScore: 5000,
    totalScore: 3000,
    levelScores: [1500, 1200, 800, 500, 0],
    unlockedLevels: 6,
    settings: { showMinimap: true },
    savedAt: new Date().toISOString(),
    ...overrides,
  };
  // Compute valid checksum
  const withoutChecksum = { ...data };
  delete withoutChecksum.checksum;
  data.checksum = computeChecksum(withoutChecksum);
  return data;
}

// ═══════════════════════════════════════════════════════════════
// PARTIAL FIELD CORRUPTION
// ═══════════════════════════════════════════════════════════════

console.log('\n🧪 QA Save/Load — Partial field corruption [EDGE]');

{
  // Missing only checksum field
  const storage = new FakeStorage();
  storage.setItem(SAVE_KEY, JSON.stringify({
    version: 1,
    currentLevel: 5,
    highScore: 5000,
    totalScore: 3000,
    levelScores: [1500, 1200],
    unlockedLevels: 6,
    settings: { showMinimap: true },
    savedAt: new Date().toISOString(),
    // no checksum
  }));
  const gsm = new GameStateManager({ storage });
  gsm.load();
  assert(gsm.currentLevel === 0, '[EDGE] missing checksum → reset');
}

{
  // Missing savedAt field
  const storage = new FakeStorage();
  const gsm = new GameStateManager({ storage });
  const data = createValidSave(gsm);
  delete data.savedAt;
  // Recompute checksum without savedAt
  const noChecksum = { ...data };
  delete noChecksum.checksum;
  data.checksum = computeChecksum(noChecksum);
  storage.setItem(SAVE_KEY, JSON.stringify(data));

  const gsm2 = new GameStateManager({ storage });
  gsm2.load();
  assert(gsm2.currentLevel === 0, '[EDGE] missing savedAt → reset');
}

{
  // Missing levelScores field
  const storage = new FakeStorage();
  storage.setItem(SAVE_KEY, JSON.stringify({
    version: 1,
    currentLevel: 5,
    highScore: 5000,
    totalScore: 3000,
    // no levelScores
    unlockedLevels: 6,
    settings: {},
    savedAt: new Date().toISOString(),
    checksum: 'abc',
  }));
  const gsm = new GameStateManager({ storage });
  gsm.load();
  assert(gsm.currentLevel === 0, '[EDGE] missing levelScores → reset');
}

// ═══════════════════════════════════════════════════════════════
// TYPE COERCION ATTACKS
// ═══════════════════════════════════════════════════════════════

console.log('\n🧪 QA Save/Load — Type coercion attacks [EDGE]');

{
  // currentLevel as float (not integer)
  const storage = new FakeStorage();
  storage.setItem(SAVE_KEY, JSON.stringify({
    version: 1,
    currentLevel: 5.5,
    highScore: 5000,
    totalScore: 3000,
    levelScores: [],
    unlockedLevels: 6,
    settings: {},
    savedAt: new Date().toISOString(),
    checksum: 'abc',
  }));
  const gsm = new GameStateManager({ storage });
  gsm.load();
  assert(gsm.currentLevel === 0, '[EDGE] float currentLevel → reset (requires integer)');
}

{
  // unlockedLevels as float
  const storage = new FakeStorage();
  storage.setItem(SAVE_KEY, JSON.stringify({
    version: 1,
    currentLevel: 5,
    highScore: 5000,
    totalScore: 3000,
    levelScores: [],
    unlockedLevels: 6.7,
    settings: {},
    savedAt: new Date().toISOString(),
    checksum: 'abc',
  }));
  const gsm = new GameStateManager({ storage });
  gsm.load();
  assert(gsm.currentLevel === 0, '[EDGE] float unlockedLevels → reset');
}

{
  // levelScores is object instead of array
  const storage = new FakeStorage();
  storage.setItem(SAVE_KEY, JSON.stringify({
    version: 1,
    currentLevel: 5,
    highScore: 5000,
    totalScore: 3000,
    levelScores: { 0: 1500 },
    unlockedLevels: 6,
    settings: {},
    savedAt: new Date().toISOString(),
    checksum: 'abc',
  }));
  const gsm = new GameStateManager({ storage });
  gsm.load();
  assert(gsm.currentLevel === 0, '[EDGE] levelScores as object → reset');
}

{
  // version as string "1" instead of number 1
  const storage = new FakeStorage();
  storage.setItem(SAVE_KEY, JSON.stringify({
    version: '1',
    currentLevel: 5,
    highScore: 5000,
    totalScore: 3000,
    levelScores: [],
    unlockedLevels: 6,
    settings: {},
    savedAt: new Date().toISOString(),
    checksum: 'abc',
  }));
  const gsm = new GameStateManager({ storage });
  gsm.load();
  assert(gsm.currentLevel === 0, '[EDGE] version as string → reset (strict equality)');
}

// ═══════════════════════════════════════════════════════════════
// BOUNDARY VALUES IN SAVED DATA
// ═══════════════════════════════════════════════════════════════

console.log('\n🧪 QA Save/Load — Boundary value roundtrips [BOUNDARY]');

{
  // Save and load with level 0 (fresh game)
  const storage = new FakeStorage();
  const gsm = new GameStateManager({ storage });
  gsm.save();

  const gsm2 = new GameStateManager({ storage });
  gsm2.load();
  assert(gsm2.currentLevel === 0, '[BOUNDARY] level 0 roundtrips correctly');
  assert(gsm2.totalScore === 0, '[BOUNDARY] score 0 roundtrips');
}

{
  // Save with max level 50 and large scores
  const storage = new FakeStorage();
  const gsm = new GameStateManager({ storage });
  gsm.newGame(0);

  // Play through all 50 levels
  for (let i = 1; i <= 50; i++) {
    gsm.completeLevel(i * 1000);
    if (i < 50) gsm.nextLevel(i * 1000);
  }
  gsm.save();

  const gsm2 = new GameStateManager({ storage });
  gsm2.load();
  assert(gsm2.currentLevel === 50, '[BOUNDARY] level 50 roundtrips');
  assert(gsm2.highScore === gsm.highScore, '[BOUNDARY] large high score roundtrips');
  assert(gsm2.levelScores.length === 50, '[BOUNDARY] 50 level scores roundtrip');
  assert(gsm2.unlockedLevels === gsm.unlockedLevels, '[BOUNDARY] unlocked levels roundtrip');
}

{
  // Empty levelScores array roundtrip
  const storage = new FakeStorage();
  const gsm = new GameStateManager({ storage });
  gsm.save();

  const gsm2 = new GameStateManager({ storage });
  gsm2.load();
  assert(gsm2.levelScores.length === 0, '[BOUNDARY] empty levelScores roundtrips');
}

// ═══════════════════════════════════════════════════════════════
// SETTINGS CORRUPTION
// ═══════════════════════════════════════════════════════════════

console.log('\n🧪 QA Save/Load — Settings edge cases [EDGE]');

{
  // settings is null in saved data (should fallback to defaults)
  const storage = new FakeStorage();
  const gsm = new GameStateManager({ storage });
  const data = createValidSave(gsm, { settings: null });
  // Recompute checksum
  const noCs = { ...data };
  delete noCs.checksum;
  data.checksum = computeChecksum(noCs);
  storage.setItem(SAVE_KEY, JSON.stringify(data));

  const gsm2 = new GameStateManager({ storage });
  gsm2.load();
  // If settings is null, the load should still work (it checks typeof === 'object')
  // null passes typeof === 'object' but data.settings && typeof... check should catch it
  // Actually: null && ... = false, so settings block is skipped
  assert(gsm2.settings.showMinimap === true, '[EDGE] null settings → default showMinimap');
}

{
  // settings is a string (invalid)
  const storage = new FakeStorage();
  const gsm = new GameStateManager({ storage });
  const data = createValidSave(gsm, { settings: 'invalid' });
  const noCs = { ...data };
  delete noCs.checksum;
  data.checksum = computeChecksum(noCs);
  storage.setItem(SAVE_KEY, JSON.stringify(data));

  const gsm2 = new GameStateManager({ storage });
  gsm2.load();
  // String fails typeof === 'object' check, settings block skipped
  assert(gsm2.settings.showMinimap === true, '[EDGE] string settings → default showMinimap');
}

{
  // Extra unknown settings field (should not crash)
  const storage = new FakeStorage();
  const gsm = new GameStateManager({ storage });
  const data = createValidSave(gsm, {
    settings: { showMinimap: false, unknownSetting: 42, volume: 0.5 },
  });
  const noCs = { ...data };
  delete noCs.checksum;
  data.checksum = computeChecksum(noCs);
  storage.setItem(SAVE_KEY, JSON.stringify(data));

  const gsm2 = new GameStateManager({ storage });
  gsm2.load();
  assert(gsm2.settings.showMinimap === false, '[EDGE] extra settings fields: showMinimap preserved');
}

// ═══════════════════════════════════════════════════════════════
// SAVE/LOAD ISOLATION (no cross-contamination)
// ═══════════════════════════════════════════════════════════════

console.log('\n🧪 QA Save/Load — Array isolation (no shared references) [REGRESSION]');

{
  const storage = new FakeStorage();
  const gsm = new GameStateManager({ storage });
  gsm.newGame(0);
  gsm.completeLevel(10000);
  gsm.save();

  // Load into new instance
  const gsm2 = new GameStateManager({ storage });
  gsm2.load();

  // Mutate gsm2's arrays — should NOT affect gsm
  gsm2.levelScores.push(9999);
  assert(gsm.levelScores.length === 1, '[REGRESSION] levelScores arrays are independent copies');
}

{
  const storage = new FakeStorage();
  const gsm = new GameStateManager({ storage });
  gsm.updateSettings({ showMinimap: false });
  gsm.save();

  const gsm2 = new GameStateManager({ storage });
  gsm2.load();

  // Mutate settings — should NOT affect gsm
  gsm2.settings.showMinimap = true;
  assert(gsm.settings.showMinimap === false, '[REGRESSION] settings objects are independent copies');
}

// ═══════════════════════════════════════════════════════════════
// STORAGE EDGE CASES
// ═══════════════════════════════════════════════════════════════

console.log('\n🧪 QA Save/Load — Storage edge cases [EDGE]');

{
  // getItem throws on load
  const throwOnGetStorage = {
    getItem() { throw new Error('QuotaExceededError'); },
    setItem() {},
    removeItem() {},
  };
  const gsm = new GameStateManager({ storage: throwOnGetStorage });
  gsm.load(); // should not throw
  assert(gsm.currentLevel === 0, '[EDGE] getItem throws → reset to defaults, no crash');
}

{
  // setItem throws on save (e.g., localStorage quota exceeded)
  const throwOnSetStorage = {
    getItem() { return null; },
    setItem() { throw new Error('QuotaExceededError'); },
    removeItem() {},
  };
  const gsm = new GameStateManager({ storage: throwOnSetStorage });
  gsm.newGame(0);
  gsm.completeLevel(10000);

  let didNotThrow = true;
  try {
    gsm.save();
  } catch (_e) {
    didNotThrow = false;
  }
  assert(didNotThrow, '[EDGE] save with quota exceeded does not throw');
}

{
  // Empty string in storage
  const storage = new FakeStorage();
  storage.setItem(SAVE_KEY, '');
  const gsm = new GameStateManager({ storage });
  gsm.load();
  assert(gsm.currentLevel === 0, '[EDGE] empty string in storage → reset');
}

{
  // "null" string in storage
  const storage = new FakeStorage();
  storage.setItem(SAVE_KEY, 'null');
  const gsm = new GameStateManager({ storage });
  gsm.load();
  assert(gsm.currentLevel === 0, '[EDGE] "null" string → reset');
}

{
  // "undefined" string in storage
  const storage = new FakeStorage();
  storage.setItem(SAVE_KEY, 'undefined');
  const gsm = new GameStateManager({ storage });
  gsm.load();
  assert(gsm.currentLevel === 0, '[EDGE] "undefined" string → reset');
}

{
  // Extremely large JSON (should still parse)
  const storage = new FakeStorage();
  const gsm = new GameStateManager({ storage });
  const data = createValidSave(gsm, {
    levelScores: new Array(1000).fill(999),
  });
  const noCs = { ...data };
  delete noCs.checksum;
  data.checksum = computeChecksum(noCs);
  storage.setItem(SAVE_KEY, JSON.stringify(data));

  const gsm2 = new GameStateManager({ storage });
  gsm2.load();
  assert(gsm2.levelScores.length === 1000, '[EDGE] large levelScores array loads correctly');
}

// ═══════════════════════════════════════════════════════════════
// CHECKSUM EDGE CASES
// ═══════════════════════════════════════════════════════════════

console.log('\n🧪 QA Save/Load — Checksum edge cases [CONTRACT]');

{
  const gsm = new GameStateManager({ storage: new FakeStorage() });

  // Empty object checksum
  const c1 = computeChecksum({});
  assert(typeof c1 === 'string' && c1.length > 0, '[CONTRACT] empty object produces valid checksum');

  // Nested object checksum
  const c2 = computeChecksum({ a: { b: { c: 1 } } });
  assert(typeof c2 === 'string', '[CONTRACT] nested object produces checksum');

  // Array checksum
  const c3 = computeChecksum([1, 2, 3]);
  assert(typeof c3 === 'string', '[CONTRACT] array produces checksum');

  // Same data different key order should produce same checksum
  // (JSON.stringify with same insertion order)
  const obj1 = { a: 1, b: 2 };
  const obj2 = { a: 1, b: 2 };
  assert(
    computeChecksum(obj1) === computeChecksum(obj2),
    '[CONTRACT] same data same order = same checksum'
  );
}

// ═══════════════════════════════════════════════════════════════
// SAVE THEN OVERWRITE WITH NEW PROGRESS
// ═══════════════════════════════════════════════════════════════

console.log('\n🧪 QA Save/Load — Overwrite save with new progress [REGRESSION]');

{
  const storage = new FakeStorage();

  // First save: level 3
  const gsm = new GameStateManager({ storage });
  gsm.newGame(0);
  gsm.completeLevel(10000);
  gsm.nextLevel(10000);
  gsm.completeLevel(20000);
  gsm.nextLevel(20000);
  gsm.completeLevel(30000);
  gsm.save();

  // Continue playing: reach level 5
  gsm.nextLevel(30000);
  gsm.completeLevel(40000);
  gsm.nextLevel(40000);
  gsm.completeLevel(50000);

  // Save again (should overwrite)
  gsm.save();

  const gsm2 = new GameStateManager({ storage });
  gsm2.load();
  assert(gsm2.currentLevel === gsm.currentLevel, '[REGRESSION] overwritten save has latest level');
  assert(gsm2.totalScore === gsm.totalScore, '[REGRESSION] overwritten save has latest total score');
  assert(gsm2.levelScores.length === gsm.levelScores.length, '[REGRESSION] overwritten save has latest scores');
}

// ═══════════════════════════════════════════════════════════════
// hasSaveData and canContinue edge cases
// ═══════════════════════════════════════════════════════════════

console.log('\n🧪 QA Save/Load — hasSaveData/canContinue edge cases [AC18][EDGE]');

{
  // Save exists but currentLevel is 0 — canContinue should be false
  const storage = new FakeStorage();
  const gsm = new GameStateManager({ storage });
  gsm.save(); // level is 0
  assert(gsm.hasSaveData() === true, '[AC18] hasSaveData true after save');
  assert(gsm.canContinue() === false, '[AC18] canContinue false when level is 0');
}

{
  // hasSaveData with broken storage
  const brokenStorage = {
    getItem() { throw new Error('broken'); },
    setItem() { throw new Error('broken'); },
    removeItem() {},
  };
  const gsm = new GameStateManager({ storage: brokenStorage });
  assert(gsm.hasSaveData() === false, '[EDGE] hasSaveData returns false when storage throws');
}

// ── Summary ────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`QA Save/Load Edge Case Tests: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
