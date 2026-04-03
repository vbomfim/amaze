/**
 * Unit tests for PacManMazeGenerator [TDD]
 *
 * Tests cover:
 * - Validation: dimensions must be odd, 15–31
 * - Maze output format: number[][] tile map with 0=open, 1=wall
 * - Loops: NOT a perfect maze — multiple paths exist
 * - Ghost house: 5×3 enclosed area in center with single exit on top
 * - Connectivity: BFS verification all open tiles are connected
 * - Dot positions: every open tile except ghost house and player start
 * - Power pellet positions: 4 positions near corners
 * - Semi-symmetry: left half approximates right half
 * - Seeded PRNG reproducibility
 * - Start position validity
 */

import { PacManMazeGenerator } from '../js/pacman-maze.js';

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

// ── Helpers ────────────────────────────────────────────────────

/** Count all open tiles in a map */
function countOpen(map) {
  let count = 0;
  for (let r = 0; r < map.length; r++) {
    for (let c = 0; c < map[0].length; c++) {
      if (map[r][c] === 0) count++;
    }
  }
  return count;
}

/** BFS from a start tile — returns count of reachable open tiles */
function bfsReachable(map, startRow, startCol) {
  const rows = map.length;
  const cols = map[0].length;
  const visited = new Set();
  const queue = [[startRow, startCol]];
  visited.add(`${startRow},${startCol}`);

  const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];

  while (queue.length > 0) {
    const [r, c] = queue.shift();
    for (const [dr, dc] of dirs) {
      const nr = r + dr;
      const nc = c + dc;
      const key = `${nr},${nc}`;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && map[nr][nc] === 0 && !visited.has(key)) {
        visited.add(key);
        queue.push([nr, nc]);
      }
    }
  }
  return visited.size;
}

// ── Validation Tests ───────────────────────────────────────────

console.log('\n🧪 PacManMazeGenerator — Validation');

{
  let threw = false;
  try { new PacManMazeGenerator({ width: 14, height: 15, seed: 1 }); } catch (_e) { threw = true; }
  assert(threw, 'rejects even width');
}

{
  let threw = false;
  try { new PacManMazeGenerator({ width: 15, height: 14, seed: 1 }); } catch (_e) { threw = true; }
  assert(threw, 'rejects even height');
}

{
  let threw = false;
  try { new PacManMazeGenerator({ width: 13, height: 15, seed: 1 }); } catch (_e) { threw = true; }
  assert(threw, 'rejects width < 15');
}

{
  let threw = false;
  try { new PacManMazeGenerator({ width: 15, height: 13, seed: 1 }); } catch (_e) { threw = true; }
  assert(threw, 'rejects height < 15');
}

{
  let threw = false;
  try { new PacManMazeGenerator({ width: 33, height: 15, seed: 1 }); } catch (_e) { threw = true; }
  assert(threw, 'rejects width > 31');
}

{
  let threw = false;
  try { new PacManMazeGenerator({ width: 15, height: 33, seed: 1 }); } catch (_e) { threw = true; }
  assert(threw, 'rejects height > 31');
}

{
  let threw = false;
  try { new PacManMazeGenerator({ width: 15, height: 15, seed: 1 }); } catch (_e) { threw = true; }
  assert(!threw, 'accepts valid 15×15');
}

{
  let threw = false;
  try { new PacManMazeGenerator({ width: 31, height: 31, seed: 1 }); } catch (_e) { threw = true; }
  assert(!threw, 'accepts valid 31×31');
}

// ── Basic Generation ───────────────────────────────────────────

console.log('\n🧪 PacManMazeGenerator — Basic generation');

{
  const gen = new PacManMazeGenerator({ width: 21, height: 21, seed: 42 });
  const result = gen.generate();

  assert(result !== null, 'generate() returns a result');
  assert(Array.isArray(result.map), 'result has map array');
  assert(result.map.length === 21, 'map has correct height (21)');
  assert(result.map[0].length === 21, 'map has correct width (21)');

  // Check map values are 0 or 1
  let validValues = true;
  for (let r = 0; r < result.map.length; r++) {
    for (let c = 0; c < result.map[0].length; c++) {
      if (result.map[r][c] !== 0 && result.map[r][c] !== 1) {
        validValues = false;
        break;
      }
    }
  }
  assert(validValues, 'map contains only 0s and 1s');
}

// ── Borders are walls ──────────────────────────────────────────

console.log('\n🧪 PacManMazeGenerator — Border walls');

{
  const gen = new PacManMazeGenerator({ width: 21, height: 21, seed: 42 });
  const result = gen.generate();
  const map = result.map;

  let allBordersWall = true;
  for (let c = 0; c < map[0].length; c++) {
    if (map[0][c] !== 1) allBordersWall = false;
    if (map[map.length - 1][c] !== 1) allBordersWall = false;
  }
  for (let r = 0; r < map.length; r++) {
    if (map[r][0] !== 1) allBordersWall = false;
    if (map[r][map[0].length - 1] !== 1) allBordersWall = false;
  }
  assert(allBordersWall, 'all border tiles are walls');
}

// ── Connectivity ───────────────────────────────────────────────

console.log('\n🧪 PacManMazeGenerator — Connectivity');

{
  const gen = new PacManMazeGenerator({ width: 21, height: 21, seed: 42 });
  const result = gen.generate();
  const map = result.map;

  const openCount = countOpen(map);
  const reachable = bfsReachable(map, result.startRow, result.startCol);
  assert(reachable === openCount, `all ${openCount} open tiles reachable from start (got ${reachable})`);
}

{
  // Test with different seed
  const gen = new PacManMazeGenerator({ width: 15, height: 15, seed: 999 });
  const result = gen.generate();
  const map = result.map;

  const openCount = countOpen(map);
  const reachable = bfsReachable(map, result.startRow, result.startCol);
  assert(reachable === openCount, `15×15 (seed 999): all ${openCount} open tiles reachable`);
}

{
  // Test with max size
  const gen = new PacManMazeGenerator({ width: 31, height: 31, seed: 7 });
  const result = gen.generate();
  const map = result.map;

  const openCount = countOpen(map);
  const reachable = bfsReachable(map, result.startRow, result.startCol);
  assert(reachable === openCount, `31×31: all ${openCount} open tiles reachable`);
}

// ── Has Loops (not perfect maze) ───────────────────────────────

console.log('\n🧪 PacManMazeGenerator — Has loops');

{
  const gen = new PacManMazeGenerator({ width: 21, height: 21, seed: 42 });
  const result = gen.generate();
  const map = result.map;

  // In a perfect maze with N open tiles, there are exactly N-1 passages.
  // A maze with loops has MORE connections than a perfect maze.
  // We test this by checking that blocking some path tiles still leaves
  // connectivity — i.e., multiple paths exist.
  const openCount = countOpen(map);

  // A spanning tree of openCount nodes has openCount-1 edges.
  // Count actual edges (adjacent open-open pairs, counting each once).
  let edges = 0;
  for (let r = 0; r < map.length; r++) {
    for (let c = 0; c < map[0].length; c++) {
      if (map[r][c] === 0) {
        if (r + 1 < map.length && map[r + 1][c] === 0) edges++;
        if (c + 1 < map[0].length && map[r][c + 1] === 0) edges++;
      }
    }
  }
  assert(edges > openCount - 1, `has loops: ${edges} edges > ${openCount - 1} (spanning tree minimum)`);
}

// ── Ghost House ────────────────────────────────────────────────

console.log('\n🧪 PacManMazeGenerator — Ghost house');

{
  const gen = new PacManMazeGenerator({ width: 21, height: 21, seed: 42 });
  const result = gen.generate();
  const gh = result.ghostHouse;

  assert(gh !== null && gh !== undefined, 'ghostHouse exists in result');
  assert(typeof gh.row === 'number', 'ghostHouse has row');
  assert(typeof gh.col === 'number', 'ghostHouse has col');
  assert(gh.width === 5, 'ghostHouse width is 5');
  assert(gh.height === 3, 'ghostHouse height is 3');

  // Ghost house should be roughly centered
  const centerRow = Math.floor(21 / 2);
  const centerCol = Math.floor(21 / 2);
  assert(Math.abs(gh.row + 1 - centerRow) <= 2, 'ghostHouse is near vertical center');
  assert(Math.abs(gh.col + 2 - centerCol) <= 2, 'ghostHouse is near horizontal center');

  // Ghost house interior should be open (value 0)
  const map = result.map;
  let interiorOpen = true;
  for (let r = gh.row; r < gh.row + gh.height; r++) {
    for (let c = gh.col; c < gh.col + gh.width; c++) {
      if (map[r][c] !== 0) interiorOpen = false;
    }
  }
  assert(interiorOpen, 'ghost house interior tiles are all open');

  // Ghost house should have walls around it (except exit on top)
  const aboveRow = gh.row - 1;
  let hasExit = false;
  for (let c = gh.col; c < gh.col + gh.width; c++) {
    if (aboveRow >= 0) {
      if (map[aboveRow][c] === 0) hasExit = true;
    }
  }
  assert(hasExit, 'ghost house has at least one exit on top');
}

// ── Start Position ─────────────────────────────────────────────

console.log('\n🧪 PacManMazeGenerator — Start position');

{
  const gen = new PacManMazeGenerator({ width: 21, height: 21, seed: 42 });
  const result = gen.generate();

  assert(typeof result.startRow === 'number', 'startRow is a number');
  assert(typeof result.startCol === 'number', 'startCol is a number');
  assert(result.map[result.startRow][result.startCol] === 0, 'start position is an open tile');
}

// ── Dot Positions ──────────────────────────────────────────────

console.log('\n🧪 PacManMazeGenerator — Dot positions');

{
  const gen = new PacManMazeGenerator({ width: 21, height: 21, seed: 42 });
  const result = gen.generate();

  assert(Array.isArray(result.dotPositions), 'dotPositions is an array');
  assert(result.dotPositions.length > 0, 'has dots');

  // All dots should be on open tiles
  let allOnOpen = true;
  for (const [r, c] of result.dotPositions) {
    if (result.map[r][c] !== 0) {
      allOnOpen = false;
      break;
    }
  }
  assert(allOnOpen, 'all dots are on open tiles');

  // No dots inside ghost house
  const gh = result.ghostHouse;
  let noneInGhostHouse = true;
  for (const [r, c] of result.dotPositions) {
    if (r >= gh.row && r < gh.row + gh.height && c >= gh.col && c < gh.col + gh.width) {
      noneInGhostHouse = false;
      break;
    }
  }
  assert(noneInGhostHouse, 'no dots inside ghost house');

  // No dot at start position
  const noDotAtStart = !result.dotPositions.some(([r, c]) => r === result.startRow && c === result.startCol);
  assert(noDotAtStart, 'no dot at player start position');
}

// ── Power Pellet Positions ─────────────────────────────────────

console.log('\n🧪 PacManMazeGenerator — Power pellet positions');

{
  const gen = new PacManMazeGenerator({ width: 21, height: 21, seed: 42 });
  const result = gen.generate();

  assert(Array.isArray(result.powerPelletPositions), 'powerPelletPositions is an array');
  assert(result.powerPelletPositions.length === 4, 'exactly 4 power pellets');

  // All pellets on open tiles
  let allOnOpen = true;
  for (const [r, c] of result.powerPelletPositions) {
    if (result.map[r][c] !== 0) {
      allOnOpen = false;
      break;
    }
  }
  assert(allOnOpen, 'all power pellets on open tiles');

  // Power pellets should be near corners (in quadrants)
  const midR = Math.floor(21 / 2);
  const midC = Math.floor(21 / 2);
  const quadrants = new Set();
  for (const [r, c] of result.powerPelletPositions) {
    const qr = r < midR ? 'top' : 'bottom';
    const qc = c < midC ? 'left' : 'right';
    quadrants.add(`${qr}-${qc}`);
  }
  assert(quadrants.size === 4, `power pellets in 4 different quadrants (got ${quadrants.size})`);
}

// ── Seeded Reproducibility ─────────────────────────────────────

console.log('\n🧪 PacManMazeGenerator — Seeded reproducibility');

{
  const gen1 = new PacManMazeGenerator({ width: 21, height: 21, seed: 42 });
  const result1 = gen1.generate();

  const gen2 = new PacManMazeGenerator({ width: 21, height: 21, seed: 42 });
  const result2 = gen2.generate();

  let mapsMatch = true;
  for (let r = 0; r < result1.map.length; r++) {
    for (let c = 0; c < result1.map[0].length; c++) {
      if (result1.map[r][c] !== result2.map[r][c]) {
        mapsMatch = false;
        break;
      }
    }
  }
  assert(mapsMatch, 'same seed produces identical maps');
}

{
  const gen1 = new PacManMazeGenerator({ width: 21, height: 21, seed: 42 });
  const result1 = gen1.generate();

  const gen2 = new PacManMazeGenerator({ width: 21, height: 21, seed: 99 });
  const result2 = gen2.generate();

  let mapsMatch = true;
  for (let r = 0; r < result1.map.length; r++) {
    for (let c = 0; c < result1.map[0].length; c++) {
      if (result1.map[r][c] !== result2.map[r][c]) {
        mapsMatch = false;
        break;
      }
    }
  }
  assert(!mapsMatch, 'different seeds produce different maps');
}

// ── Semi-symmetry ──────────────────────────────────────────────

console.log('\n🧪 PacManMazeGenerator — Semi-symmetry');

{
  const gen = new PacManMazeGenerator({ width: 21, height: 21, seed: 42 });
  const result = gen.generate();
  const map = result.map;
  const w = map[0].length;

  let matchCount = 0;
  let totalCount = 0;

  // Check how many interior tiles match their mirror
  for (let r = 1; r < map.length - 1; r++) {
    for (let c = 1; c < Math.floor(w / 2); c++) {
      const mirror = w - 1 - c;
      totalCount++;
      if (map[r][c] === map[r][mirror]) matchCount++;
    }
  }

  const symmetryRatio = matchCount / totalCount;
  // Should be mostly symmetric (>70%)
  assert(symmetryRatio > 0.7, `semi-symmetry ratio: ${(symmetryRatio * 100).toFixed(1)}% > 70%`);
}

// ── Multiple sizes generate correctly ──────────────────────────

console.log('\n🧪 PacManMazeGenerator — Multiple valid sizes');

{
  const sizes = [15, 17, 19, 21, 23, 25, 27, 29, 31];
  let allOk = true;

  for (const size of sizes) {
    try {
      const gen = new PacManMazeGenerator({ width: size, height: size, seed: size });
      const result = gen.generate();
      const openCount = countOpen(result.map);
      const reachable = bfsReachable(result.map, result.startRow, result.startCol);
      if (reachable !== openCount) {
        allOk = false;
        console.error(`    ❌ ${size}×${size}: only ${reachable}/${openCount} tiles reachable`);
      }
    } catch (e) {
      allOk = false;
      console.error(`    ❌ ${size}×${size}: threw ${e.message}`);
    }
  }
  assert(allOk, `all sizes ${sizes.join(', ')} generate valid connected mazes`);
}

// ── Summary ────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`PacManMazeGenerator Tests: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
