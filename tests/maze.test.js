/**
 * Unit tests for MazeGenerator [TDD]
 *
 * Tests cover:
 * - AC1: Valid maze generation — perfect maze with entry/exit, no isolated areas
 * - Validation: dimension constraints (odd, 5–101)
 * - Reproducibility: seeded PRNG produces same maze
 * - Edge cases: minimum size, maximum size boundaries
 */

import { MazeGenerator, Cell } from '../js/maze.js';

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

function assertThrows(fn, expectedMsg, testName) {
  try {
    fn();
    failed++;
    console.error(`  ❌ ${testName} — expected error, but none thrown`);
  } catch (e) {
    if (expectedMsg && !e.message.includes(expectedMsg)) {
      failed++;
      console.error(`  ❌ ${testName} — wrong error: "${e.message}"`);
    } else {
      passed++;
      console.log(`  ✅ ${testName}`);
    }
  }
}

// ── Validation Tests ───────────────────────────────────────────

console.log('\n🧪 MazeGenerator — Validation');

assertThrows(
  () => new MazeGenerator({ width: 4, height: 5 }),
  'odd numbers',
  'rejects even width'
);

assertThrows(
  () => new MazeGenerator({ width: 5, height: 6 }),
  'odd numbers',
  'rejects even height'
);

assertThrows(
  () => new MazeGenerator({ width: 3, height: 5 }),
  'at least 5',
  'rejects width < 5'
);

assertThrows(
  () => new MazeGenerator({ width: 5, height: 3 }),
  'at least 5',
  'rejects height < 5'
);

assertThrows(
  () => new MazeGenerator({ width: 103, height: 5 }),
  'at most 101',
  'rejects width > 101'
);

assertThrows(
  () => new MazeGenerator({ width: 5, height: 103 }),
  'at most 101',
  'rejects height > 101'
);

assertThrows(
  () => new MazeGenerator({ width: 5.5, height: 7 }),
  'integers',
  'rejects non-integer width'
);

assertThrows(
  () => new MazeGenerator({ width: 7, height: 7.5 }),
  'integers',
  'rejects non-integer height'
);

// ── Generation Tests ───────────────────────────────────────────

console.log('\n🧪 MazeGenerator — Generation (7×7)');

const gen = new MazeGenerator({ width: 7, height: 7, seed: 42 });
const grid = gen.generate();

assert(
  grid.length === 7 && grid[0].length === 7,
  'grid dimensions are 7×7'
);

assert(
  grid[0][0] instanceof Cell,
  'grid cells are Cell instances'
);

// Entry: north wall of (0,0) is open
assert(
  grid[0][0].north === false,
  'entry cell (0,0) has north wall open'
);

// Exit: south wall of (6,6) is open
assert(
  grid[6][6].south === false,
  'exit cell (6,6) has south wall open'
);

// ── Perfect Maze Verification (AC1) ───────────────────────────

console.log('\n🧪 MazeGenerator — Perfect Maze (all cells reachable via BFS)');

function countReachable(grid) {
  const height = grid.length;
  const width = grid[0].length;
  const visited = Array.from({ length: height }, () => Array(width).fill(false));
  const queue = [[0, 0]];
  visited[0][0] = true;
  let count = 0;

  while (queue.length > 0) {
    const [r, c] = queue.shift();
    count++;
    const cell = grid[r][c];

    // North
    if (!cell.north && r > 0 && !visited[r - 1][c]) {
      visited[r - 1][c] = true;
      queue.push([r - 1, c]);
    }
    // South
    if (!cell.south && r < height - 1 && !visited[r + 1][c]) {
      visited[r + 1][c] = true;
      queue.push([r + 1, c]);
    }
    // West
    if (!cell.west && c > 0 && !visited[r][c - 1]) {
      visited[r][c - 1] = true;
      queue.push([r, c - 1]);
    }
    // East
    if (!cell.east && c < width - 1 && !visited[r][c + 1]) {
      visited[r][c + 1] = true;
      queue.push([r, c + 1]);
    }
  }
  return count;
}

const totalCells = 7 * 7;
const reachable = countReachable(grid);
assert(
  reachable === totalCells,
  `all ${totalCells} cells reachable from (0,0) — got ${reachable}`
);

// Count total passages (walls removed between adjacent cells)
function countPassages(grid) {
  let passages = 0;
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[0].length; c++) {
      // Only count south and east to avoid double-counting
      if (!grid[r][c].south && r < grid.length - 1) passages++;
      if (!grid[r][c].east && c < grid[0].length - 1) passages++;
    }
  }
  return passages;
}

// A perfect maze (spanning tree) has exactly (cells - 1) passages
const passages = countPassages(grid);
assert(
  passages === totalCells - 1,
  `perfect maze has ${totalCells - 1} passages — got ${passages}`
);

// ── Wall Consistency ───────────────────────────────────────────

console.log('\n🧪 MazeGenerator — Wall consistency (shared walls agree)');

let wallConsistent = true;
for (let r = 0; r < grid.length; r++) {
  for (let c = 0; c < grid[0].length; c++) {
    const cell = grid[r][c];
    // Check south/north symmetry
    if (r < grid.length - 1) {
      if (cell.south !== grid[r + 1][c].north) {
        wallConsistent = false;
      }
    }
    // Check east/west symmetry
    if (c < grid[0].length - 1) {
      if (cell.east !== grid[r][c + 1].west) {
        wallConsistent = false;
      }
    }
  }
}
assert(wallConsistent, 'all shared walls are consistent (south↔north, east↔west)');

// ── Reproducibility ────────────────────────────────────────────

console.log('\n🧪 MazeGenerator — Seeded reproducibility');

const gen2 = new MazeGenerator({ width: 7, height: 7, seed: 42 });
const grid2 = gen2.generate();

let identical = true;
for (let r = 0; r < 7; r++) {
  for (let c = 0; c < 7; c++) {
    if (
      grid[r][c].north !== grid2[r][c].north ||
      grid[r][c].south !== grid2[r][c].south ||
      grid[r][c].east !== grid2[r][c].east ||
      grid[r][c].west !== grid2[r][c].west
    ) {
      identical = false;
    }
  }
}
assert(identical, 'same seed produces identical maze');

const gen3 = new MazeGenerator({ width: 7, height: 7, seed: 99 });
const grid3 = gen3.generate();
let different = false;
for (let r = 0; r < 7; r++) {
  for (let c = 0; c < 7; c++) {
    if (
      grid[r][c].north !== grid3[r][c].north ||
      grid[r][c].south !== grid3[r][c].south ||
      grid[r][c].east !== grid3[r][c].east ||
      grid[r][c].west !== grid3[r][c].west
    ) {
      different = true;
    }
  }
}
assert(different, 'different seed produces different maze');

// ── Larger Maze ────────────────────────────────────────────────

console.log('\n🧪 MazeGenerator — Larger maze (21×21)');

const genLarge = new MazeGenerator({ width: 21, height: 21, seed: 7 });
const gridLarge = genLarge.generate();
const largeCells = 21 * 21;
const largeReachable = countReachable(gridLarge);
assert(
  largeReachable === largeCells,
  `all ${largeCells} cells reachable in 21×21 maze — got ${largeReachable}`
);
const largePassages = countPassages(gridLarge);
assert(
  largePassages === largeCells - 1,
  `21×21 perfect maze has ${largeCells - 1} passages — got ${largePassages}`
);

// ── Minimum Size ───────────────────────────────────────────────

console.log('\n🧪 MazeGenerator — Minimum size (5×5)');

const genMin = new MazeGenerator({ width: 5, height: 5, seed: 1 });
const gridMin = genMin.generate();
const minCells = 5 * 5;
const minReachable = countReachable(gridMin);
assert(
  minReachable === minCells,
  `all ${minCells} cells reachable in 5×5 maze — got ${minReachable}`
);

// ── Summary ────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
