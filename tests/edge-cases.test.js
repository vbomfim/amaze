/**
 * Edge case tests — Boundary conditions, adversarial inputs, unusual states
 *
 * These tests cover scenarios NOT in the acceptance criteria but important
 * for robustness. Each test is tagged with its rationale.
 *
 * [QA Guardian] — scope: edge cases, boundary values, stress
 */

import { MazeGenerator, Cell, mulberry32 } from '../js/maze.js';
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

function assertApprox(actual, expected, tolerance, message) {
  const ok = Math.abs(actual - expected) < tolerance;
  if (ok) {
    passed++;
    console.log(`  ✅ ${message}`);
  } else {
    failed++;
    console.error(`  ❌ ${message} — expected ~${expected}, got ${actual}`);
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

// Create a test maze for player edge cases
const gen = new MazeGenerator({ width: 7, height: 7, seed: 42 });
const grid = gen.generate();

// ═══════════════════════════════════════════════════════════════
// MAZE GENERATOR — Edge Cases
// ═══════════════════════════════════════════════════════════════

console.log('\n🧪 MazeGenerator — Boundary dimension edge cases [EDGE]');

{
  // Maximum size maze: 101×101
  const genMax = new MazeGenerator({ width: 101, height: 101, seed: 1 });
  const gridMax = genMax.generate();

  assert(
    gridMax.length === 101 && gridMax[0].length === 101,
    '[EDGE] 101×101 maze generates correct dimensions'
  );

  // Verify all cells reachable (perfect maze property)
  const visited = Array.from({ length: 101 }, () => Array(101).fill(false));
  const queue = [[0, 0]];
  visited[0][0] = true;
  let count = 0;

  while (queue.length > 0) {
    const [r, c] = queue.shift();
    count++;
    const cell = gridMax[r][c];

    if (!cell.north && r > 0 && !visited[r - 1][c]) { visited[r - 1][c] = true; queue.push([r - 1, c]); }
    if (!cell.south && r < 100 && !visited[r + 1][c]) { visited[r + 1][c] = true; queue.push([r + 1, c]); }
    if (!cell.west && c > 0 && !visited[r][c - 1]) { visited[r][c - 1] = true; queue.push([r, c - 1]); }
    if (!cell.east && c < 100 && !visited[r][c + 1]) { visited[r][c + 1] = true; queue.push([r, c + 1]); }
  }

  assert(count === 101 * 101, `[EDGE] 101×101 maze is perfect — all ${101 * 101} cells reachable (got ${count})`);

  // Entry and exit open
  assert(gridMax[0][0].north === false, '[EDGE] 101×101 entry cell (0,0) north wall open');
  assert(gridMax[100][100].south === false, '[EDGE] 101×101 exit cell (100,100) south wall open');
}

console.log('\n🧪 MazeGenerator — Exact boundary validation [EDGE]');

{
  // Exact boundary: 5 and 101 should work
  const gen5 = new MazeGenerator({ width: 5, height: 5, seed: 1 });
  assert(gen5 instanceof MazeGenerator, '[EDGE] width=5, height=5 accepted (lower bound)');

  const gen101 = new MazeGenerator({ width: 101, height: 101, seed: 1 });
  assert(gen101 instanceof MazeGenerator, '[EDGE] width=101, height=101 accepted (upper bound)');

  // Just outside boundaries
  assertThrows(
    () => new MazeGenerator({ width: 4, height: 4 }),
    null,
    '[EDGE] width=4, height=4 rejected (below minimum and even)'
  );

  assertThrows(
    () => new MazeGenerator({ width: 103, height: 103 }),
    null,
    '[EDGE] width=103, height=103 rejected (above maximum)'
  );
}

console.log('\n🧪 MazeGenerator — Cell visited flag cleaned up after generation [EDGE][Fix 16]');

{
  const genV = new MazeGenerator({ width: 7, height: 7, seed: 42 });
  const gridV = genV.generate();

  let noneHaveVisited = true;
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 7; c++) {
      if ('visited' in gridV[r][c]) {
        noneHaveVisited = false;
      }
    }
  }
  assert(noneHaveVisited, '[EDGE][Fix 16] visited flag removed from all cells after generation');
}

console.log('\n🧪 MazeGenerator — Asymmetric dimensions [EDGE]');

{
  const genTall = new MazeGenerator({ width: 5, height: 21, seed: 7 });
  const gridTall = genTall.generate();
  assert(
    gridTall.length === 21 && gridTall[0].length === 5,
    '[EDGE] tall maze (5×21) has correct dimensions'
  );

  const genWide = new MazeGenerator({ width: 21, height: 5, seed: 7 });
  const gridWide = genWide.generate();
  assert(
    gridWide.length === 5 && gridWide[0].length === 21,
    '[EDGE] wide maze (21×5) has correct dimensions'
  );
}

// ═══════════════════════════════════════════════════════════════
// PRNG (mulberry32) — Edge Cases
// ═══════════════════════════════════════════════════════════════

console.log('\n🧪 mulberry32 — PRNG properties [EDGE]');

{
  const rng = mulberry32(42);
  let allInRange = true;
  let allDistinct = new Set();
  const sampleSize = 1000;

  for (let i = 0; i < sampleSize; i++) {
    const val = rng();
    if (val < 0 || val >= 1) {
      allInRange = false;
    }
    allDistinct.add(val);
  }

  assert(allInRange, `[EDGE] mulberry32: all ${sampleSize} values in [0, 1)`);
  assert(allDistinct.size === sampleSize, `[EDGE] mulberry32: all ${sampleSize} values are distinct`);
}

{
  // Seed 0 should still work
  const rng0 = mulberry32(0);
  const val = rng0();
  assert(
    typeof val === 'number' && val >= 0 && val < 1,
    '[EDGE] mulberry32: seed=0 produces valid output'
  );
}

{
  // Negative seed should work
  const rngNeg = mulberry32(-1);
  const val = rngNeg();
  assert(
    typeof val === 'number' && val >= 0 && val < 1,
    '[EDGE] mulberry32: negative seed produces valid output'
  );
}

{
  // Same seed = same sequence
  const rng1 = mulberry32(12345);
  const rng2 = mulberry32(12345);
  let same = true;
  for (let i = 0; i < 100; i++) {
    if (rng1() !== rng2()) {
      same = false;
      break;
    }
  }
  assert(same, '[EDGE] mulberry32: deterministic — same seed = same sequence');
}

// ═══════════════════════════════════════════════════════════════
// PLAYER CONTROLLER — Edge Cases
// ═══════════════════════════════════════════════════════════════

console.log('\n🧪 PlayerController — Zero delta-time [EDGE]');

{
  const player = new PlayerController({ x: 3.5, y: 3.5, angle: 0, grid, tileMap: grid });
  const startX = player.x;
  const startY = player.y;
  const startAngle = player.angle;

  player.keys.add('KeyW');
  player.keys.add('KeyD');
  player.update(0); // zero dt
  player.keys.clear();

  assertApprox(player.x, startX, 0.001, '[EDGE] zero dt: no X movement');
  assertApprox(player.y, startY, 0.001, '[EDGE] zero dt: no Y movement');
  assertApprox(player.angle, startAngle, 0.001, '[EDGE] zero dt: no rotation');
}

console.log('\n🧪 PlayerController — Very large delta-time [EDGE]');

{
  // Large dt should not teleport player through walls
  const player = new PlayerController({ x: 0.5, y: 0.5, angle: 0, grid, tileMap: grid });
  player.keys.add('KeyW');
  player.update(10.0); // 10 seconds in one frame — absurd but possible if tab was suspended
  player.keys.clear();

  // Player must stay within grid bounds
  assert(player.x >= 0, '[EDGE] large dt: x >= 0');
  assert(player.y >= 0, '[EDGE] large dt: y >= 0');
  assert(player.x < grid[0].length, `[EDGE] large dt: x < ${grid[0].length}`);
  assert(player.y < grid.length, `[EDGE] large dt: y < ${grid.length}`);
}

console.log('\n🧪 PlayerController — Opposing keys simultaneously [EDGE]');

{
  // W + S simultaneously should cancel (or near-cancel)
  const player = new PlayerController({ x: 3.5, y: 3.5, angle: 0, grid, tileMap: grid });
  const startX = player.x;
  const startY = player.y;

  player.keys.add('KeyW');
  player.keys.add('KeyS');
  player.update(0.5);
  player.keys.clear();

  // Forward and backward use the SAME angle — should roughly cancel out
  // W: dx = +cos(0)*speed*dt, S: dx = -cos(0)*speed*dt → net ~0
  // But implementation processes W then S separately... let's check the code.
  // Actually, looking at the code: W adds to dx, S subtracts. They're accumulated before move.
  assertApprox(player.x, startX, 0.01, '[EDGE] W+S simultaneously: no net X movement');
  assertApprox(player.y, startY, 0.01, '[EDGE] W+S simultaneously: no net Y movement');
}

{
  // A + D simultaneously should cancel rotation
  const player = new PlayerController({ x: 3.5, y: 3.5, angle: 1.0, grid, tileMap: grid });
  const startAngle = player.angle;

  player.keys.add('KeyA');
  player.keys.add('KeyD');
  player.update(0.5);
  player.keys.clear();

  // Left subtracts, right adds → should net ~0 change
  assertApprox(player.angle, startAngle, 0.01, '[EDGE] A+D simultaneously: no net rotation');
}

{
  // ArrowLeft + ArrowRight simultaneously
  const player = new PlayerController({ x: 3.5, y: 3.5, angle: 1.0, grid, tileMap: grid });
  const startAngle = player.angle;

  player.keys.add('ArrowLeft');
  player.keys.add('ArrowRight');
  player.update(0.5);
  player.keys.clear();

  assertApprox(player.angle, startAngle, 0.01, '[EDGE] Left+Right arrows simultaneously: no net rotation');
}

console.log('\n🧪 PlayerController — Missing key bindings coverage [COVERAGE]');

{
  // KeyA (left rotation) — not tested in existing player.test.js
  const player = new PlayerController({ x: 3.5, y: 3.5, angle: 1.0, grid, tileMap: grid });
  const startAngle = player.angle;

  player.keys.add('KeyA');
  player.update(0.5);
  player.keys.clear();

  assert(
    player.angle !== startAngle,
    '[COVERAGE] KeyA produces rotation'
  );
  // KeyA should turn left (counterclockwise → angle decreases)
  // After normalization: should be less than startAngle (or wrapped)
  const expected = ((startAngle - 2.5 * 0.5) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
  assertApprox(player.angle, expected, 0.01, '[COVERAGE] KeyA rotates counterclockwise');
}

{
  // ArrowDown (backward) — not tested in existing player.test.js
  const player = new PlayerController({ x: 3.5, y: 3.5, angle: 0, grid, tileMap: grid });
  const startX = player.x;

  player.keys.add('ArrowDown');
  player.update(0.1);
  player.keys.clear();

  assert(player.x < startX, '[COVERAGE] ArrowDown moves backward');
}

{
  // ArrowRight (right rotation)
  const player = new PlayerController({ x: 3.5, y: 3.5, angle: 0, grid, tileMap: grid });

  player.keys.add('ArrowRight');
  player.update(1.0);
  player.keys.clear();

  assertApprox(player.angle, 2.5, 0.01, '[COVERAGE] ArrowRight rotates clockwise at turnSpeed');
}

console.log('\n🧪 PlayerController — Angle normalization wraparound [EDGE]');

{
  const player = new PlayerController({ x: 3.5, y: 3.5, angle: 0, grid, tileMap: grid });

  // Rotate left a LOT → angle should wrap around and stay in [0, 2π)
  player.keys.add('ArrowLeft');
  for (let i = 0; i < 1000; i++) {
    player.update(0.016);
  }
  player.keys.clear();

  assert(
    player.angle >= 0 && player.angle < 2 * Math.PI,
    `[EDGE] angle stays in [0, 2π) after many rotations — got ${player.angle.toFixed(4)}`
  );
}

{
  // Rotate right a LOT
  const player = new PlayerController({ x: 3.5, y: 3.5, angle: 0, grid, tileMap: grid });

  player.keys.add('ArrowRight');
  for (let i = 0; i < 1000; i++) {
    player.update(0.016);
  }
  player.keys.clear();

  assert(
    player.angle >= 0 && player.angle < 2 * Math.PI,
    `[EDGE] angle stays in [0, 2π) after many clockwise rotations — got ${player.angle.toFixed(4)}`
  );
}

console.log('\n🧪 PlayerController — Rapid key toggling [EDGE]');

{
  const player = new PlayerController({ x: 3.5, y: 3.5, angle: 0, grid, tileMap: grid });
  const startX = player.x;
  const startY = player.y;

  // Simulate rapid key press/release
  for (let i = 0; i < 100; i++) {
    player.keys.add('KeyW');
    player.update(0.001);
    player.keys.delete('KeyW');
    player.update(0.001);
  }

  // Player should have moved slightly (only active half the time)
  // But the critical thing is no crash and valid position
  assert(player.x >= 0 && player.y >= 0, '[EDGE] rapid toggling: position remains valid');
  assert(
    !isNaN(player.x) && !isNaN(player.y) && !isNaN(player.angle),
    '[EDGE] rapid toggling: no NaN values'
  );
}

console.log('\n🧪 PlayerController — Boundary escape attempts [EDGE]');

{
  // Try to escape from all 4 corners
  const corners = [
    { x: 0.5, y: 0.5, angle: Math.PI + Math.PI / 4, desc: 'top-left → northwest' },
    { x: 6.5, y: 0.5, angle: -Math.PI / 4, desc: 'top-right → northeast' },
    { x: 0.5, y: 6.5, angle: Math.PI - Math.PI / 4, desc: 'bottom-left → southwest' },
    { x: 6.5, y: 6.5, angle: Math.PI / 4, desc: 'bottom-right → southeast' },
  ];

  for (const corner of corners) {
    const player = new PlayerController({
      x: corner.x,
      y: corner.y,
      angle: corner.angle,
      grid,
    });

    player.keys.add('KeyW');
    for (let f = 0; f < 200; f++) {
      player.update(0.016);
    }
    player.keys.clear();

    assert(
      player.x >= 0 && player.y >= 0 &&
      player.x < grid[0].length && player.y < grid.length,
      `[EDGE] ${corner.desc}: player stays in bounds`
    );
  }
}

console.log('\n🧪 PlayerController — Exit detection sub-positions [EDGE]');

{
  // isAtExit should return true for any position within the exit cell
  const subPositions = [
    { x: 6.01, y: 6.01, desc: 'near top-left of exit cell' },
    { x: 6.99, y: 6.99, desc: 'near bottom-right of exit cell' },
    { x: 6.5, y: 6.5, desc: 'center of exit cell' },
    { x: 6.01, y: 6.99, desc: 'near bottom-left of exit cell' },
  ];

  for (const pos of subPositions) {
    const player = new PlayerController({ x: pos.x, y: pos.y, angle: 0, grid, tileMap: grid });
    assert(
      player.isAtExit(6, 6),
      `[EDGE] isAtExit at ${pos.desc} (${pos.x}, ${pos.y})`
    );
  }

  // Should NOT be at exit if in adjacent cells
  const notExit = [
    { x: 5.5, y: 6.5, desc: 'cell (6,5) — one column left' },
    { x: 6.5, y: 5.5, desc: 'cell (5,6) — one row up' },
    { x: 0.5, y: 0.5, desc: 'entry cell (0,0)' },
  ];

  for (const pos of notExit) {
    const player = new PlayerController({ x: pos.x, y: pos.y, angle: 0, grid, tileMap: grid });
    assert(
      !player.isAtExit(6, 6),
      `[EDGE] NOT at exit from ${pos.desc}`
    );
  }
}

console.log('\n🧪 PlayerController — Initial state contract [CONTRACT]');

{
  const player = new PlayerController({ x: 1.5, y: 2.5, angle: 0.7, grid, tileMap: grid });

  assert(player.x === 1.5, '[CONTRACT] initial x preserved');
  assert(player.y === 2.5, '[CONTRACT] initial y preserved');
  assert(player.angle === 0.7, '[CONTRACT] initial angle preserved');
  assert(player.keys instanceof Set, '[CONTRACT] keys is a Set');
  assert(player.keys.size === 0, '[CONTRACT] keys initially empty');
  assert(typeof player.moveSpeed === 'number' && player.moveSpeed > 0, '[CONTRACT] moveSpeed is positive number');
  assert(typeof player.turnSpeed === 'number' && player.turnSpeed > 0, '[CONTRACT] turnSpeed is positive number');
  assert(typeof player.fov === 'number' && player.fov > 0 && player.fov < Math.PI, '[CONTRACT] fov is valid radian range');
  assert(typeof player.radius === 'number' && player.radius > 0 && player.radius < 0.5, '[CONTRACT] collision radius is reasonable');
}

console.log('\n🧪 MazeGenerator — Cell contract [CONTRACT]');

{
  const cell = new Cell(2, 3);

  assert(cell.row === 2, '[CONTRACT] Cell.row preserved');
  assert(cell.col === 3, '[CONTRACT] Cell.col preserved');
  assert(cell.north === true, '[CONTRACT] Cell.north defaults to true (wall present)');
  assert(cell.south === true, '[CONTRACT] Cell.south defaults to true');
  assert(cell.east === true, '[CONTRACT] Cell.east defaults to true');
  assert(cell.west === true, '[CONTRACT] Cell.west defaults to true');
  assert(cell.visited === false, '[CONTRACT] Cell.visited defaults to false');
}

console.log('\n🧪 MazeGenerator — generate() return contract [CONTRACT]');

{
  const genC = new MazeGenerator({ width: 7, height: 7, seed: 42 });
  const gridC = genC.generate();

  assert(Array.isArray(gridC), '[CONTRACT] generate() returns an array');
  assert(Array.isArray(gridC[0]), '[CONTRACT] generate() returns 2D array');
  assert(gridC[0][0] instanceof Cell, '[CONTRACT] grid contains Cell instances');

  // Every cell has all expected wall properties
  let allHaveWalls = true;
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 7; c++) {
      const cell = gridC[r][c];
      if (
        typeof cell.north !== 'boolean' ||
        typeof cell.south !== 'boolean' ||
        typeof cell.east !== 'boolean' ||
        typeof cell.west !== 'boolean'
      ) {
        allHaveWalls = false;
      }
    }
  }
  assert(allHaveWalls, '[CONTRACT] all cells have boolean wall properties');
}

// ═══════════════════════════════════════════════════════════════
// PERFORMANCE — Edge Cases
// ═══════════════════════════════════════════════════════════════

console.log('\n🧪 Performance — Maze generation time [PERF]');

{
  const start = performance.now();
  const genPerf = new MazeGenerator({ width: 101, height: 101, seed: 42 });
  genPerf.generate();
  const elapsed = performance.now() - start;

  assert(
    elapsed < 1000,
    `[PERF] 101×101 maze generates in <1s — took ${elapsed.toFixed(1)}ms`
  );
}

{
  const start = performance.now();
  const genPerf = new MazeGenerator({ width: 7, height: 7, seed: 42 });
  for (let i = 0; i < 100; i++) {
    genPerf.generate();
  }
  const elapsed = performance.now() - start;

  assert(
    elapsed < 500,
    `[PERF] 100× 7×7 maze generations in <500ms — took ${elapsed.toFixed(1)}ms`
  );
}

console.log('\n🧪 Performance — Player update throughput [PERF]');

{
  const player = new PlayerController({ x: 3.5, y: 3.5, angle: 0, grid, tileMap: grid });
  player.keys.add('KeyW');
  player.keys.add('KeyD');

  const start = performance.now();
  for (let i = 0; i < 10000; i++) {
    player.update(0.016);
  }
  const elapsed = performance.now() - start;

  assert(
    elapsed < 500,
    `[PERF] 10,000 player updates in <500ms — took ${elapsed.toFixed(1)}ms`
  );
}

// ── Summary ────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`Edge Case & Contract Tests: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
