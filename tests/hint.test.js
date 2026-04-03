/**
 * Unit tests for HintSystem [TDD]
 *
 * Tests cover:
 * - AC10: BFS shortest path from player cell to exit cell
 * - AC11: Path correctness — ordered [row, col][] array
 * - AC13: Path recomputes from current cell; clears on level complete
 * - Performance: <50ms for 51×51 grid
 * - Edge cases: player at exit, player at start, unreachable (impossible for perfect maze)
 */

import { HintSystem } from '../js/hint.js';
import { MazeGenerator } from '../js/maze.js';

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

// ── Helper: generate a maze for testing ────────────────────────

function createMaze(width, height, seed) {
  const gen = new MazeGenerator({ width, height, seed });
  return gen.generate();
}

/**
 * Verify that a path is valid: each step moves to an adjacent cell
 * with no wall between them.
 */
function isValidPath(grid, path) {
  for (let i = 0; i < path.length - 1; i++) {
    const [r1, c1] = path[i];
    const [r2, c2] = path[i + 1];

    // Must be adjacent (Manhattan distance = 1)
    const dist = Math.abs(r1 - r2) + Math.abs(c1 - c2);
    if (dist !== 1) return false;

    // Check no wall between them
    const cell = grid[r1][c1];
    if (r2 < r1 && cell.north) return false;   // moving north
    if (r2 > r1 && cell.south) return false;   // moving south
    if (c2 < c1 && cell.west) return false;    // moving west
    if (c2 > c1 && cell.east) return false;    // moving east
  }
  return true;
}

// ── Basic BFS Tests ────────────────────────────────────────────

console.log('\n🧪 HintSystem — BFS Pathfinding');

{
  const grid = createMaze(5, 5, 42);
  const hint = new HintSystem();

  const path = hint.computePath(grid, 0, 0, 4, 4);

  assert(Array.isArray(path), 'computePath returns an array');
  assert(path.length > 0, 'path is non-empty for reachable exit');
  assert(
    path[0][0] === 0 && path[0][1] === 0,
    'path starts at player cell (0, 0)'
  );
  assert(
    path[path.length - 1][0] === 4 && path[path.length - 1][1] === 4,
    'path ends at exit cell (4, 4)'
  );
}

// ── Path Validity (no walls crossed) ───────────────────────────

console.log('\n🧪 HintSystem — Path validity (no walls crossed)');

{
  const grid = createMaze(7, 7, 42);
  const hint = new HintSystem();
  const path = hint.computePath(grid, 0, 0, 6, 6);

  assert(isValidPath(grid, path), '7×7 path traverses only open passages');
}

{
  const grid = createMaze(11, 11, 99);
  const hint = new HintSystem();
  const path = hint.computePath(grid, 0, 0, 10, 10);

  assert(isValidPath(grid, path), '11×11 path traverses only open passages');
}

// ── Shortest Path (BFS guarantees) ─────────────────────────────

console.log('\n🧪 HintSystem — Shortest path guarantee');

{
  // In a perfect maze, there's exactly one path. BFS finds it.
  const grid = createMaze(7, 7, 42);
  const hint = new HintSystem();
  const path = hint.computePath(grid, 0, 0, 6, 6);

  // BFS finds shortest path — in a perfect maze, it's the ONLY path
  // Just verify it's valid and connects start to end
  assert(path.length >= 2, 'path has at least start and end');
  assert(isValidPath(grid, path), 'BFS path is valid in perfect maze');

  // No repeated cells (BFS visited tracking)
  const cellSet = new Set(path.map(([r, c]) => `${r},${c}`));
  assert(cellSet.size === path.length, 'no duplicate cells in path');
}

// ── Recompute from current cell (AC11) ─────────────────────────

console.log('\n🧪 HintSystem — Recompute from current cell');

{
  const grid = createMaze(7, 7, 42);
  const hint = new HintSystem();

  // Full path from start
  const fullPath = hint.computePath(grid, 0, 0, 6, 6);

  // Path from midpoint (player moved to a cell on the path)
  const midIdx = Math.floor(fullPath.length / 2);
  const [midRow, midCol] = fullPath[midIdx];
  const partialPath = hint.computePath(grid, midRow, midCol, 6, 6);

  assert(
    partialPath[0][0] === midRow && partialPath[0][1] === midCol,
    'recomputed path starts from current player cell'
  );
  assert(
    partialPath[partialPath.length - 1][0] === 6 &&
    partialPath[partialPath.length - 1][1] === 6,
    'recomputed path ends at exit'
  );
  assert(
    partialPath.length <= fullPath.length,
    'path from midpoint is shorter or equal to full path'
  );
  assert(isValidPath(grid, partialPath), 'recomputed path is valid');
}

// ── Player at exit cell ────────────────────────────────────────

console.log('\n🧪 HintSystem — Edge case: player at exit');

{
  const grid = createMaze(5, 5, 42);
  const hint = new HintSystem();
  const path = hint.computePath(grid, 4, 4, 4, 4);

  assert(path.length === 1, 'path has single cell when player is at exit');
  assert(
    path[0][0] === 4 && path[0][1] === 4,
    'single-cell path is the exit cell'
  );
}

// ── Different maze sizes ───────────────────────────────────────

console.log('\n🧪 HintSystem — Various maze sizes');

{
  const sizes = [5, 7, 9, 11, 13, 15, 21];
  for (const size of sizes) {
    const grid = createMaze(size, size, size * 7);
    const hint = new HintSystem();
    const exitRow = size - 1;
    const exitCol = size - 1;
    const path = hint.computePath(grid, 0, 0, exitRow, exitCol);

    assert(
      path.length > 0 && isValidPath(grid, path),
      `${size}×${size}: valid path found (length=${path.length})`
    );
    assert(
      path[0][0] === 0 && path[0][1] === 0,
      `${size}×${size}: starts at (0,0)`
    );
    assert(
      path[path.length - 1][0] === exitRow && path[path.length - 1][1] === exitCol,
      `${size}×${size}: ends at exit (${exitRow},${exitCol})`
    );
  }
}

// ── Performance: <50ms for 51×51 grid (AC10) ───────────────────

console.log('\n🧪 HintSystem — Performance (<50ms for 51×51)');

{
  const grid = createMaze(51, 51, 12345);
  const hint = new HintSystem();

  const start = performance.now();
  const path = hint.computePath(grid, 0, 0, 50, 50);
  const elapsed = performance.now() - start;

  assert(path.length > 0, `51×51: path found (length=${path.length})`);
  assert(isValidPath(grid, path), '51×51: path is valid');
  assert(elapsed < 50, `51×51: BFS completed in ${elapsed.toFixed(2)}ms (< 50ms)`);
  console.log(`    ⏱ Actual time: ${elapsed.toFixed(2)}ms`);
}

// ── Multiple BFS calls (recompute scenario) ────────────────────

console.log('\n🧪 HintSystem — Multiple recomputes (no accumulated state)');

{
  const grid = createMaze(11, 11, 77);
  const hint = new HintSystem();

  const path1 = hint.computePath(grid, 0, 0, 10, 10);
  const path2 = hint.computePath(grid, 0, 0, 10, 10);

  // Same grid, same start, same end → same path
  assert(path1.length === path2.length, 'repeated BFS produces same length path');

  let same = true;
  for (let i = 0; i < path1.length; i++) {
    if (path1[i][0] !== path2[i][0] || path1[i][1] !== path2[i][1]) {
      same = false;
      break;
    }
  }
  assert(same, 'repeated BFS produces identical path (deterministic)');
}

// ── HintSystem state management ────────────────────────────────

console.log('\n🧪 HintSystem — State management');

{
  const grid = createMaze(7, 7, 42);
  const hint = new HintSystem();

  assert(hint.isActive === false, 'hint starts inactive');
  assert(hint.currentPath === null, 'no path initially');

  // Activate
  hint.activate(grid, 0, 0, 6, 6);
  assert(hint.isActive === true, 'hint is active after activate()');
  assert(hint.currentPath !== null, 'path computed on activate');
  assert(hint.currentPath.length > 0, 'path is non-empty');

  // Deactivate
  hint.deactivate();
  assert(hint.isActive === false, 'hint is inactive after deactivate()');
  assert(hint.currentPath === null, 'path cleared on deactivate');
}

// ── Update path when player moves to new cell ─────────────────

console.log('\n🧪 HintSystem — Update on cell change');

{
  const grid = createMaze(7, 7, 42);
  const hint = new HintSystem();

  hint.activate(grid, 0, 0, 6, 6);
  const origPath = hint.currentPath;
  const origLength = origPath.length;

  // Simulate player moving to the next cell on the path
  const [nextRow, nextCol] = origPath[1]; // second cell in path
  const updated = hint.updateIfCellChanged(grid, nextRow, nextCol, 6, 6);

  assert(updated === true, 'returns true when cell changed');
  assert(hint.currentPath.length < origLength, 'path shortened after moving forward');
  assert(
    hint.currentPath[0][0] === nextRow && hint.currentPath[0][1] === nextCol,
    'new path starts from new player cell'
  );
}

{
  const grid = createMaze(7, 7, 42);
  const hint = new HintSystem();

  hint.activate(grid, 0, 0, 6, 6);

  // Same cell — no update needed
  const updated = hint.updateIfCellChanged(grid, 0, 0, 6, 6);
  assert(updated === false, 'returns false when cell has not changed');
}

// ── Path cell lookup (Set for O(1) checks) ─────────────────────

console.log('\n🧪 HintSystem — Path cell lookup');

{
  const grid = createMaze(7, 7, 42);
  const hint = new HintSystem();

  hint.activate(grid, 0, 0, 6, 6);

  // First cell should be on path
  assert(hint.isOnPath(0, 0), 'start cell is on path');

  // Exit cell should be on path
  assert(hint.isOnPath(6, 6), 'exit cell is on path');

  // A cell not on path should return false
  // Find a cell NOT on the path
  const pathSet = new Set(hint.currentPath.map(([r, c]) => `${r},${c}`));
  let foundOffPath = false;
  for (let r = 0; r < 7 && !foundOffPath; r++) {
    for (let c = 0; c < 7 && !foundOffPath; c++) {
      if (!pathSet.has(`${r},${c}`)) {
        assert(!hint.isOnPath(r, c), `cell (${r},${c}) not on path returns false`);
        foundOffPath = true;
      }
    }
  }

  // After deactivation, no cells should be on path
  hint.deactivate();
  assert(!hint.isOnPath(0, 0), 'after deactivate, isOnPath returns false');
}

// ── Wrong turn recompute (AC11) ────────────────────────────────

console.log('\n🧪 HintSystem — Wrong turn recompute');

{
  const grid = createMaze(7, 7, 42);
  const hint = new HintSystem();

  hint.activate(grid, 0, 0, 6, 6);

  // Find a neighbor of (0,0) that is NOT the next cell on the path
  const [nextOnPath_r, nextOnPath_c] = hint.currentPath[1];
  const cell00 = grid[0][0];
  let wrongRow = -1, wrongCol = -1;

  // Check all neighbors of (0,0)
  if (!cell00.south && 1 < 7) {
    if (1 !== nextOnPath_r || 0 !== nextOnPath_c) {
      wrongRow = 1; wrongCol = 0;
    }
  }
  if (wrongRow === -1 && !cell00.east && 1 < 7) {
    if (0 !== nextOnPath_r || 1 !== nextOnPath_c) {
      wrongRow = 0; wrongCol = 1;
    }
  }

  if (wrongRow >= 0) {
    // Player takes wrong turn — path should recompute from wrong cell
    hint.updateIfCellChanged(grid, wrongRow, wrongCol, 6, 6);
    assert(
      hint.currentPath[0][0] === wrongRow && hint.currentPath[0][1] === wrongCol,
      'path recomputed from wrong-turn cell'
    );
    assert(
      hint.currentPath[hint.currentPath.length - 1][0] === 6 &&
      hint.currentPath[hint.currentPath.length - 1][1] === 6,
      'recomputed path still reaches exit'
    );
    assert(isValidPath(grid, hint.currentPath), 'recomputed path is valid');
  } else {
    // (0,0) only has one neighbor — skip this test
    passed++;
    console.log('  ✅ (skipped: (0,0) has only one open neighbor in this maze)');
  }
}

// ── Large grid BFS performance stress test ─────────────────────

console.log('\n🧪 HintSystem — Stress test: multiple BFS on 51×51');

{
  const grid = createMaze(51, 51, 999);
  const hint = new HintSystem();

  // Run 10 BFS calls — should all complete quickly
  const start = performance.now();
  for (let i = 0; i < 10; i++) {
    hint.computePath(grid, 0, 0, 50, 50);
  }
  const elapsed = performance.now() - start;

  assert(
    elapsed < 500,
    `10× BFS on 51×51 completed in ${elapsed.toFixed(2)}ms (< 500ms)`
  );
}

// ── Summary ────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
