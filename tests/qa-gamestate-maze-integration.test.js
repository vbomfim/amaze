/**
 * QA Guardian — GameStateManager + MazeGenerator Integration Tests
 *
 * Tests that the level progression table produces configs that MazeGenerator
 * can actually generate valid, navigable mazes for. This is the critical
 * integration boundary between game-state.js and maze.js.
 *
 * Also tests the full play loop: config → generate maze → player movement → exit.
 *
 * Tags: [AC2] [AC14] [BOUNDARY] [CONTRACT] [PERF]
 */

import { GameStateManager, LEVEL_CONFIG, SCORE_CONFIG } from '../js/game-state.js';
import { MazeGenerator } from '../js/maze.js';
import { PlayerController } from '../js/player.js';

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

function findPath(grid, startRow, startCol, endRow, endCol) {
  const height = grid.length;
  const width = grid[0].length;
  const visited = Array.from({ length: height }, () => Array(width).fill(false));
  const parent = Array.from({ length: height }, () => Array(width).fill(null));
  const queue = [{ row: startRow, col: startCol }];
  visited[startRow][startCol] = true;

  while (queue.length > 0) {
    const { row, col } = queue.shift();
    if (row === endRow && col === endCol) {
      const path = [];
      let cur = { row, col };
      while (cur) {
        path.unshift(cur);
        cur = parent[cur.row][cur.col];
      }
      return path;
    }

    const cell = grid[row][col];
    const moves = [
      { dr: -1, dc: 0, wall: 'north' },
      { dr: 1, dc: 0, wall: 'south' },
      { dc: -1, dr: 0, wall: 'west' },
      { dc: 1, dr: 0, wall: 'east' },
    ];

    for (const { dr, dc, wall } of moves) {
      const nr = row + dr;
      const nc = col + dc;
      if (nr >= 0 && nr < height && nc >= 0 && nc < width && !visited[nr][nc] && !cell[wall]) {
        visited[nr][nc] = true;
        parent[nr][nc] = { row, col };
        queue.push({ row: nr, col: nc });
      }
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════
// EVERY LEVEL CONFIG PRODUCES A VALID MAZE [AC2][CONTRACT]
// ═══════════════════════════════════════════════════════════════

console.log('\n🧪 QA Integration — Every level config generates a valid maze [AC2][CONTRACT]');

{
  const gsm = new GameStateManager({ storage: new FakeStorage() });
  let allValid = true;
  const failedLevels = [];

  // Test every level with seed 42
  for (let level = 1; level <= 50; level++) {
    const cfg = gsm.getLevelConfig(level);
    try {
      const gen = new MazeGenerator({
        width: cfg.gridWidth,
        height: cfg.gridHeight,
        seed: 42,
      });
      const grid = gen.generate();

      // Verify it's a valid maze
      if (grid.length !== cfg.gridHeight || grid[0].length !== cfg.gridWidth) {
        allValid = false;
        failedLevels.push(`Level ${level}: wrong dimensions`);
      }
    } catch (e) {
      allValid = false;
      failedLevels.push(`Level ${level}: ${e.message}`);
    }
  }

  assert(allValid, `[AC2][CONTRACT] all 50 level configs produce valid mazes`);
  for (const f of failedLevels) {
    console.error(`    ⚠️ ${f}`);
  }
}

// ═══════════════════════════════════════════════════════════════
// EVERY LEVEL MAZE IS NAVIGABLE (entry-to-exit path exists)
// ═══════════════════════════════════════════════════════════════

console.log('\n🧪 QA Integration — Every level maze is navigable [AC2][BOUNDARY]');

{
  const gsm = new GameStateManager({ storage: new FakeStorage() });
  let allNavigable = true;
  const failedLevels = [];

  // Test every level with multiple seeds
  const seeds = [1, 42, 999];
  for (let level = 1; level <= 50; level++) {
    const cfg = gsm.getLevelConfig(level);
    for (const seed of seeds) {
      const gen = new MazeGenerator({
        width: cfg.gridWidth,
        height: cfg.gridHeight,
        seed,
      });
      const grid = gen.generate();
      const exitRow = cfg.gridHeight - 1;
      const exitCol = cfg.gridWidth - 1;
      const path = findPath(grid, 0, 0, exitRow, exitCol);

      if (!path) {
        allNavigable = false;
        failedLevels.push(`Level ${level}, seed ${seed}`);
      }
    }
  }

  assert(allNavigable, `[AC2][BOUNDARY] all 50 levels × 3 seeds = 150 mazes are navigable`);
  for (const f of failedLevels) {
    console.error(`    ⚠️ ${f}`);
  }
}

// ═══════════════════════════════════════════════════════════════
// FULL PLAY LOOP: config → maze → player → exit → score
// ═══════════════════════════════════════════════════════════════

console.log('\n🧪 QA Integration — Full play loop for levels 1, 10, 25, 50 [AC14][BOUNDARY]');

{
  const gsm = new GameStateManager({ storage: new FakeStorage() });
  const testLevels = [1, 10, 25, 50];

  for (const level of testLevels) {
    const cfg = gsm.getLevelConfig(level);

    // Generate maze
    const gen = new MazeGenerator({
      width: cfg.gridWidth,
      height: cfg.gridHeight,
      seed: level * 7,
    });
    const grid = gen.generate();

    // Find path
    const exitRow = cfg.gridHeight - 1;
    const exitCol = cfg.gridWidth - 1;
    const path = findPath(grid, 0, 0, exitRow, exitCol);
    assert(path !== null, `[BOUNDARY] level ${level}: BFS path exists`);

    // Create player and walk the path
    const player = new PlayerController({ x: 0.5, y: 0.5, angle: 0, grid });

    for (let i = 0; i < path.length - 1; i++) {
      const to = path[i + 1];
      player.x = path[i].col + 0.5;
      player.y = path[i].row + 0.5;
      player.angle = Math.atan2(
        (to.row + 0.5) - player.y,
        (to.col + 0.5) - player.x
      );
      player.keys.add('KeyW');
      for (let f = 0; f < 25; f++) {
        player.update(0.016);
      }
      player.keys.clear();
    }

    // Verify exit reached
    assert(
      player.isAtExit(exitRow, exitCol),
      `[AC14] level ${level}: player reaches exit at (${exitRow}, ${exitCol})`
    );

    // Calculate score
    gsm.startLevel(level, 0);
    const elapsedMs = path.length * 25 * 16; // approximate
    const result = gsm.completeLevel(elapsedMs);
    assert(result.score > 0, `[AC14] level ${level}: score > 0`);
    assert(result.level === level, `[AC14] level ${level}: result.level matches`);
  }
}

// ═══════════════════════════════════════════════════════════════
// HINT AVAILABILITY MATCHES LEVEL CONFIG [AC17]
// ═══════════════════════════════════════════════════════════════

console.log('\n🧪 QA Integration — Hint counts match config for every level [AC17][CONTRACT]');

{
  const gsm = new GameStateManager({ storage: new FakeStorage() });
  let allMatch = true;

  for (let level = 1; level <= 50; level++) {
    const cfg = gsm.getLevelConfig(level);
    gsm.startLevel(level, 0);

    // Use all allowed hints
    let used = 0;
    while (gsm.canUseHint()) {
      gsm.useHint();
      used++;
      if (used > 100) break; // safety
    }

    if (used !== cfg.hintsAllowed) {
      allMatch = false;
      console.error(`    ⚠️ Level ${level}: expected ${cfg.hintsAllowed} hints, got ${used}`);
    }
  }

  assert(allMatch, '[AC17][CONTRACT] every level allows exactly hintsAllowed hints');
}

// ═══════════════════════════════════════════════════════════════
// PERFORMANCE: MAZE GENERATION FOR ALL LEVEL SIZES [PERF]
// ═══════════════════════════════════════════════════════════════

console.log('\n🧪 QA Integration — Maze generation perf for all 50 level sizes [PERF]');

{
  const gsm = new GameStateManager({ storage: new FakeStorage() });
  const start = performance.now();

  for (let level = 1; level <= 50; level++) {
    const cfg = gsm.getLevelConfig(level);
    const gen = new MazeGenerator({
      width: cfg.gridWidth,
      height: cfg.gridHeight,
      seed: level,
    });
    gen.generate();
  }

  const elapsed = performance.now() - start;
  assert(
    elapsed < 2000,
    `[PERF] all 50 levels generated in <2s — took ${elapsed.toFixed(1)}ms`
  );
}

console.log('\n🧪 QA Integration — Level 50 (51×51) maze generation + BFS perf [PERF]');

{
  const gsm = new GameStateManager({ storage: new FakeStorage() });
  const cfg = gsm.getLevelConfig(50);
  const start = performance.now();

  const gen = new MazeGenerator({
    width: cfg.gridWidth,
    height: cfg.gridHeight,
    seed: 42,
  });
  const grid = gen.generate();
  const path = findPath(grid, 0, 0, cfg.gridHeight - 1, cfg.gridWidth - 1);

  const elapsed = performance.now() - start;
  assert(path !== null, '[PERF] level 50 maze is navigable');
  assert(
    elapsed < 500,
    `[PERF] level 50 generate + BFS in <500ms — took ${elapsed.toFixed(1)}ms`
  );
  assert(path.length > 0, `[PERF] level 50 path length = ${path.length} steps`);
}

// ═══════════════════════════════════════════════════════════════
// HUD DISPLAY + STATE CONSISTENCY
// ═══════════════════════════════════════════════════════════════

console.log('\n🧪 QA Integration — HUD display consistency across levels [AC17]');

{
  const gsm = new GameStateManager({ storage: new FakeStorage() });

  // Level 1: unlimited hints display
  gsm.startLevel(1, 0);
  assert(gsm.getHintsDisplay() === '∞', '[AC17] level 1 shows ∞');
  assert(gsm.formatTime(0) === '00:00', '[AC17] timer starts at 00:00');

  // Level 2: 5 hints display
  gsm.startLevel(2, 0);
  assert(gsm.getHintsDisplay() === '5', '[AC17] level 2 shows 5');

  // Use all hints, display shows 0
  for (let i = 0; i < 5; i++) gsm.useHint();
  assert(gsm.getHintsDisplay() === '0', '[AC17] level 2 after all hints: shows 0');

  // Level 21: 0 hints display
  gsm.startLevel(21, 0);
  assert(gsm.getHintsDisplay() === '0', '[AC17] level 21 shows 0 (no hints available)');
  assert(gsm.canUseHint() === false, '[AC17] level 21 canUseHint = false');
}

// ═══════════════════════════════════════════════════════════════
// LEVEL SELECT DATA MATCHES GAME STATE
// ═══════════════════════════════════════════════════════════════

console.log('\n🧪 QA Integration — Level select data after multi-level playthrough [BOUNDARY]');

{
  const gsm = new GameStateManager({ storage: new FakeStorage() });
  gsm.newGame(0);

  // Play levels 1-10
  for (let i = 1; i <= 10; i++) {
    gsm.completeLevel(i * 10000);
    if (i < 10) gsm.nextLevel(i * 10000);
  }

  const data = gsm.getLevelSelectData();

  // Should have 50 entries
  assert(data.length === 50, '[BOUNDARY] level select has 50 entries');

  // Levels 1-10 should have scores and be unlocked
  for (let i = 0; i < 10; i++) {
    assert(data[i].unlocked === true, `level ${i + 1} unlocked`);
    assert(data[i].bestScore > 0, `level ${i + 1} has best score`);
  }

  // Level 11 should be unlocked (completing 10 unlocks 11)
  assert(data[10].unlocked === true, 'level 11 unlocked by completing 10');
  assert(data[10].bestScore === 0, 'level 11 not played yet (score 0)');

  // Levels 12-50 should be locked
  for (let i = 11; i < 50; i++) {
    assert(data[i].unlocked === false, `level ${i + 1} still locked`);
  }
}

// ── Summary ────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`QA GameState + Maze Integration Tests: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
