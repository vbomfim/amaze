/**
 * QA Guardian — PAC-MAN Phase 1 Cross-Component Integration Tests
 *
 * Tests the interaction BETWEEN the three new components:
 * - PacManMazeGenerator → sprite entity placement
 * - PacManMazeGenerator → AudioManager trigger points
 * - Sprite rendering of maze-generated entities
 *
 * Each test traces to a rationale tag:
 *   [AC-N]       — Acceptance criterion N
 *   [INTEGRATION] — Cross-component integration
 *   [BOUNDARY]   — Component boundary verification
 *   [CONTRACT]   — Interface/API contract
 *   [COVERAGE]   — Fills a coverage gap
 */

import { PacManMazeGenerator } from '../js/pacman-maze.js';
import { SpriteRenderer, SPRITE_TYPES } from '../js/sprites.js';
import { AudioManager } from '../js/audio.js';

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

// ── Mock Canvas Context ────────────────────────────────────────

class MockCanvasContext {
  constructor() {
    this.fillStyle = '';
    this.strokeStyle = '';
    this.globalAlpha = 1;
    this.lineWidth = 1;
    this._calls = [];
  }
  fillRect(x, y, w, h) { this._calls.push(['fillRect', x, y, w, h]); }
  beginPath() { this._calls.push(['beginPath']); }
  arc(x, y, r, s, e) { this._calls.push(['arc', x, y, r, s, e]); }
  fill() { this._calls.push(['fill']); }
  stroke() { this._calls.push(['stroke']); }
  closePath() { this._calls.push(['closePath']); }
  moveTo(x, y) { this._calls.push(['moveTo', x, y]); }
  lineTo(x, y) { this._calls.push(['lineTo', x, y]); }
  save() { this._calls.push(['save']); }
  restore() { this._calls.push(['restore']); }
  clearCalls() { this._calls = []; }
}

// ── Mock AudioContext ──────────────────────────────────────────

class MockGainNode {
  constructor() {
    this.gain = { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {} };
  }
  connect(dest) { return dest; }
  disconnect() {}
}

class MockOscillatorNode {
  constructor() {
    this.type = 'sine';
    this.frequency = { value: 440, setValueAtTime() {}, linearRampToValueAtTime() {} };
    this._started = false;
    this._stopped = false;
  }
  connect(dest) { return dest; }
  start(_t) { this._started = true; }
  stop(_t) { this._stopped = true; }
  disconnect() {}
}

class MockAudioContext {
  constructor() {
    this.state = 'running';
    this.currentTime = 0;
    this.destination = {};
  }
  createOscillator() { return new MockOscillatorNode(); }
  createGain() { return new MockGainNode(); }
  resume() { return Promise.resolve(); }
}

// ── Helpers ────────────────────────────────────────────────────

/** BFS from a start tile — returns set of reachable tile keys "r,c" */
function bfsReachableSet(map, startRow, startCol) {
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
  return visited;
}

// ═══════════════════════════════════════════════════════════════
// Maze → Sprite Placement Integration
// ═══════════════════════════════════════════════════════════════

console.log('\n🧪 Integration — Maze dot positions → sprite coordinates [INTEGRATION]');

{
  // Generate a PAC-MAN maze and convert dot positions to sprites
  const gen = new PacManMazeGenerator({ width: 21, height: 21, seed: 42 });
  const result = gen.generate();

  // Convert maze dot positions to sprite objects (as a game would)
  const dotSprites = result.dotPositions.map(([r, c]) => ({
    x: c + 0.5,
    y: r + 0.5,
    type: 'dot',
    active: true,
    animPhase: 0,
  }));

  // Every dot sprite should be on a walkable tile
  let allOnOpen = true;
  for (const sprite of dotSprites) {
    const tileRow = Math.floor(sprite.y);
    const tileCol = Math.floor(sprite.x);
    if (result.map[tileRow][tileCol] !== 0) {
      allOnOpen = false;
      break;
    }
  }
  assert(allOnOpen, '[INTEGRATION] all dot sprites map to open maze tiles');
  assert(dotSprites.length > 0, '[INTEGRATION] maze generates non-zero dot sprites');
}

console.log('\n🧪 Integration — Maze power pellets → sprite coordinates [INTEGRATION]');

{
  const gen = new PacManMazeGenerator({ width: 21, height: 21, seed: 42 });
  const result = gen.generate();

  const pelletSprites = result.powerPelletPositions.map(([r, c]) => ({
    x: c + 0.5,
    y: r + 0.5,
    type: 'power_pellet',
    active: true,
    animPhase: 0,
  }));

  assert(pelletSprites.length === 4, '[INTEGRATION] exactly 4 power pellet sprites from maze');

  // All pellet sprites on open tiles
  let allOnOpen = true;
  for (const sprite of pelletSprites) {
    const tileRow = Math.floor(sprite.y);
    const tileCol = Math.floor(sprite.x);
    if (result.map[tileRow][tileCol] !== 0) {
      allOnOpen = false;
      break;
    }
  }
  assert(allOnOpen, '[INTEGRATION] all power pellet sprites map to open maze tiles');
}

console.log('\n🧪 Integration — Ghost house positions → ghost sprites [INTEGRATION]');

{
  const gen = new PacManMazeGenerator({ width: 21, height: 21, seed: 42 });
  const result = gen.generate();
  const gh = result.ghostHouse;

  // Place 4 ghosts inside the ghost house (as a game would)
  const ghostTypes = ['ghost_blinky', 'ghost_pinky', 'ghost_inky', 'ghost_clyde'];
  const ghostSprites = ghostTypes.map((type, i) => ({
    x: gh.col + 1 + i + 0.5,
    y: gh.row + 1 + 0.5,
    type,
    active: true,
    animPhase: 0,
  }));

  // All ghost positions should be inside the ghost house (open tiles)
  let allInsideOpen = true;
  for (const sprite of ghostSprites) {
    const tileRow = Math.floor(sprite.y);
    const tileCol = Math.floor(sprite.x);
    if (tileRow < gh.row || tileRow >= gh.row + gh.height ||
        tileCol < gh.col || tileCol >= gh.col + gh.width) {
      allInsideOpen = false;
      break;
    }
    if (result.map[tileRow][tileCol] !== 0) {
      allInsideOpen = false;
      break;
    }
  }
  assert(allInsideOpen, '[INTEGRATION] ghost sprites placed inside ghost house are on open tiles');
}

// ═══════════════════════════════════════════════════════════════
// Maze → Sprite Rendering Integration
// ═══════════════════════════════════════════════════════════════

console.log('\n🧪 Integration — Rendering maze-generated sprites [INTEGRATION]');

{
  const gen = new PacManMazeGenerator({ width: 15, height: 15, seed: 42 });
  const result = gen.generate();
  const ctx = new MockCanvasContext();
  const sr = new SpriteRenderer(ctx, 640, 480);

  // Player at start position, facing north
  const player = {
    x: result.startCol + 0.5,
    y: result.startRow + 0.5,
    angle: -Math.PI / 2,
    fov: Math.PI / 3,
  };
  const depthBuffer = new Float32Array(640).fill(20);

  // Build sprites from ALL maze entities
  const sprites = [
    ...result.dotPositions.map(([r, c]) => ({
      x: c + 0.5, y: r + 0.5, type: 'dot', active: true, animPhase: 0,
    })),
    ...result.powerPelletPositions.map(([r, c]) => ({
      x: c + 0.5, y: r + 0.5, type: 'power_pellet', active: true, animPhase: 0.5,
    })),
  ];

  let threw = false;
  try {
    sr.renderSprites(player, sprites, depthBuffer);
  } catch (e) {
    threw = true;
    console.error(`    Error: ${e.message}`);
  }
  assert(!threw, '[INTEGRATION] rendering all maze-generated sprites does not throw');

  // Should have produced draw calls (player is surrounded by dots)
  const fillCalls = ctx._calls.filter(c => c[0] === 'fill' || c[0] === 'fillRect');
  assert(fillCalls.length > 0, '[INTEGRATION] visible maze sprites produce draw calls');
}

console.log('\n🧪 Integration — Rendering ghosts from ghost house [INTEGRATION]');

{
  const gen = new PacManMazeGenerator({ width: 21, height: 21, seed: 42 });
  const result = gen.generate();
  const gh = result.ghostHouse;
  const ctx = new MockCanvasContext();
  const sr = new SpriteRenderer(ctx, 640, 480);

  // Player facing toward the ghost house from above
  const exitCol = Math.floor(21 / 2);
  const player = {
    x: exitCol + 0.5,
    y: gh.row - 3 + 0.5,
    angle: Math.PI / 2, // facing south (toward ghost house)
    fov: Math.PI / 3,
  };
  const depthBuffer = new Float32Array(640).fill(20);

  const ghostSprites = [
    { x: gh.col + 1 + 0.5, y: gh.row + 1 + 0.5, type: 'ghost_blinky', active: true, animPhase: 0 },
    { x: gh.col + 2 + 0.5, y: gh.row + 1 + 0.5, type: 'ghost_pinky', active: true, animPhase: 0 },
    { x: gh.col + 3 + 0.5, y: gh.row + 1 + 0.5, type: 'ghost_inky', active: true, animPhase: 0 },
  ];

  let threw = false;
  try {
    sr.renderSprites(player, ghostSprites, depthBuffer);
  } catch (e) {
    threw = true;
  }
  assert(!threw, '[INTEGRATION] rendering ghost sprites at ghost house positions does not throw');
}

// ═══════════════════════════════════════════════════════════════
// Audio Lifecycle Integration
// ═══════════════════════════════════════════════════════════════

console.log('\n🧪 Integration — Audio event sequence for dot eating [INTEGRATION]');

{
  const am = new AudioManager({ AudioContextClass: MockAudioContext });
  am.init();

  // Simulate: player eats dot → wakaWaka, eats power pellet → siren starts,
  // eats ghost → ghostEaten, siren continues, mode ends → siren stops
  let threw = false;
  try {
    am.playWakaWaka();    // eat dot
    am.playWakaWaka();    // eat another dot
    am.playPowerUpSiren(); // eat power pellet
    am.playGhostEaten();   // eat a ghost while power-up active
    am.playWakaWaka();    // eat another dot
    am.stopPowerUpSiren(); // power-up wears off
  } catch (e) {
    threw = true;
  }
  assert(!threw, '[INTEGRATION] dot-eating audio sequence completes without error');
}

console.log('\n🧪 Integration — Audio event sequence for death [INTEGRATION]');

{
  const am = new AudioManager({ AudioContextClass: MockAudioContext });
  am.init();

  // Simulate: ghost siren playing → player dies → all sirens stop, death plays
  let threw = false;
  try {
    am.playGhostSiren();
    am.playWakaWaka();
    // Player dies — stop all loops, play death
    am.stopGhostSiren();
    am.stopPowerUpSiren();
    am.playDeath();
  } catch (e) {
    threw = true;
  }
  assert(!threw, '[INTEGRATION] death audio sequence completes without error');
}

console.log('\n🧪 Integration — Audio event sequence for level clear [INTEGRATION]');

{
  const am = new AudioManager({ AudioContextClass: MockAudioContext });
  am.init();

  // Simulate: eating last dot → stop all loops → play level clear
  let threw = false;
  try {
    am.playGhostSiren();
    am.playWakaWaka(); // last dot
    am.stopGhostSiren();
    am.stopPowerUpSiren();
    am.playPacmanLevelClear();
  } catch (e) {
    threw = true;
  }
  assert(!threw, '[INTEGRATION] level-clear audio sequence completes without error');
}

console.log('\n🧪 Integration — Mute toggle stops active sirens [COVERAGE]');

{
  const am = new AudioManager({ AudioContextClass: MockAudioContext });
  am.init();

  // Start both sirens
  am.playPowerUpSiren();
  am.playGhostSiren();

  // Verify sirens are running (node refs exist)
  assert(am._powerUpSirenNodes !== null, '[COVERAGE] power-up siren is active before mute');
  assert(am._ghostSirenNodes !== null, '[COVERAGE] ghost siren is active before mute');

  // Toggle mute — should stop both
  am.toggleMute();

  assert(am._powerUpSirenNodes === null, '[COVERAGE] power-up siren stopped by toggleMute');
  assert(am._ghostSirenNodes === null, '[COVERAGE] ghost siren stopped by toggleMute');
}

console.log('\n🧪 Integration — Siren replacement on double-play [COVERAGE]');

{
  const am = new AudioManager({ AudioContextClass: MockAudioContext });
  am.init();

  // Play power-up siren, then play it again (should replace, not leak)
  am.playPowerUpSiren();
  const firstNodes = am._powerUpSirenNodes;
  am.playPowerUpSiren();
  const secondNodes = am._powerUpSirenNodes;

  assert(secondNodes !== null, '[COVERAGE] power-up siren has nodes after double play');
  assert(firstNodes !== secondNodes, '[COVERAGE] double playPowerUpSiren replaces siren nodes');

  // Same for ghost siren
  am.playGhostSiren();
  const firstGhost = am._ghostSirenNodes;
  am.playGhostSiren();
  const secondGhost = am._ghostSirenNodes;

  assert(secondGhost !== null, '[COVERAGE] ghost siren has nodes after double play');
  assert(firstGhost !== secondGhost, '[COVERAGE] double playGhostSiren replaces siren nodes');

  am.stopPowerUpSiren();
  am.stopGhostSiren();
}

// ═══════════════════════════════════════════════════════════════
// Dot Coverage Completeness
// ═══════════════════════════════════════════════════════════════

console.log('\n🧪 Integration — Dots cover all walkable tiles [CONTRACT]');

{
  const sizes = [15, 21, 31];
  let allCovered = true;

  for (const size of sizes) {
    const gen = new PacManMazeGenerator({ width: size, height: size, seed: 42 });
    const result = gen.generate();
    const gh = result.ghostHouse;

    // Count open tiles outside ghost house, start, and power pellets [Fix 3]
    let expectedDots = 0;
    const pelletKeys = new Set(result.powerPelletPositions.map(([r, c]) => `${r},${c}`));
    for (let r = 1; r < size - 1; r++) {
      for (let c = 1; c < size - 1; c++) {
        if (result.map[r][c] !== 0) continue;
        if (r === result.startRow && c === result.startCol) continue;
        if (r >= gh.row && r < gh.row + gh.height && c >= gh.col && c < gh.col + gh.width) continue;
        if (pelletKeys.has(`${r},${c}`)) continue;
        expectedDots++;
      }
    }

    if (result.dotPositions.length !== expectedDots) {
      allCovered = false;
      console.error(`    ❌ ${size}×${size}: expected ${expectedDots} dots, got ${result.dotPositions.length}`);
    }
  }
  assert(allCovered, '[CONTRACT] dot count matches open tiles minus ghost house minus start minus power pellets');
}

// ═══════════════════════════════════════════════════════════════
// SPRITE_TYPES Contract vs Maze Entity Types
// ═══════════════════════════════════════════════════════════════

console.log('\n🧪 Integration — SPRITE_TYPES covers all PAC-MAN entities [CONTRACT]');

{
  // All entity types a PAC-MAN game needs must exist in SPRITE_TYPES
  const requiredTypes = [
    'dot', 'power_pellet',
    'ghost_blinky', 'ghost_pinky', 'ghost_inky', 'ghost_clyde',
    'ghost_frightened', 'ghost_eaten',
  ];

  for (const type of requiredTypes) {
    assert(type in SPRITE_TYPES, `[CONTRACT] SPRITE_TYPES includes '${type}'`);
  }

  // Ghost sprites must be larger than dot sprites (visual hierarchy)
  const dotSize = SPRITE_TYPES.dot.size;
  const ghostSize = SPRITE_TYPES.ghost_blinky.size;
  assert(ghostSize > dotSize, `[CONTRACT] ghost size (${ghostSize}) > dot size (${dotSize})`);

  // Power pellet must be larger than dot (visually distinct)
  const pelletSize = SPRITE_TYPES.power_pellet.size;
  assert(pelletSize > dotSize, `[CONTRACT] power pellet size (${pelletSize}) > dot size (${dotSize})`);
}

console.log('\n🧪 Integration — All ghost sprites share consistent shape [CONTRACT]');

{
  const activeGhosts = ['ghost_blinky', 'ghost_pinky', 'ghost_inky', 'ghost_clyde', 'ghost_frightened'];
  const shapes = new Set(activeGhosts.map(t => SPRITE_TYPES[t].shape));
  assert(shapes.size === 1, `[CONTRACT] all active ghosts use same shape: ${[...shapes].join(', ')}`);
  assert(shapes.has('diamond'), '[CONTRACT] active ghost shape is diamond');

  // Ghost eaten has different shape (eyes only)
  assert(SPRITE_TYPES.ghost_eaten.shape !== SPRITE_TYPES.ghost_blinky.shape,
    '[CONTRACT] ghost_eaten has different shape from active ghosts');
}

// ═══════════════════════════════════════════════════════════════
// Start Position → Player Spawn Integration
// ═══════════════════════════════════════════════════════════════

console.log('\n🧪 Integration — Start position is reachable from all dots [INTEGRATION]');

{
  const gen = new PacManMazeGenerator({ width: 21, height: 21, seed: 42 });
  const result = gen.generate();

  // BFS from start to verify all dots are reachable
  const reachable = bfsReachableSet(result.map, result.startRow, result.startCol);

  let allDotsReachable = true;
  for (const [r, c] of result.dotPositions) {
    if (!reachable.has(`${r},${c}`)) {
      allDotsReachable = false;
      console.error(`    ❌ dot at (${r},${c}) not reachable from start`);
      break;
    }
  }
  assert(allDotsReachable, '[INTEGRATION] all dot positions reachable from player start');

  let allPelletsReachable = true;
  for (const [r, c] of result.powerPelletPositions) {
    if (!reachable.has(`${r},${c}`)) {
      allPelletsReachable = false;
      break;
    }
  }
  assert(allPelletsReachable, '[INTEGRATION] all power pellet positions reachable from player start');
}

// ═══════════════════════════════════════════════════════════════
// Ghost House Exit → Maze Connectivity
// ═══════════════════════════════════════════════════════════════

console.log('\n🧪 Integration — Ghost house exit connects to maze [INTEGRATION]');

{
  const seeds = [1, 42, 100, 999];
  let allConnected = true;

  for (const seed of seeds) {
    const gen = new PacManMazeGenerator({ width: 21, height: 21, seed });
    const result = gen.generate();
    const gh = result.ghostHouse;
    const map = result.map;

    // Find the exit tile (open tile on the row above ghost house)
    const exitRow = gh.row - 1;
    const centerCol = Math.floor(21 / 2);

    if (exitRow >= 0 && map[exitRow][centerCol] === 0) {
      // BFS from exit — should reach the start position
      const reachable = bfsReachableSet(map, exitRow, centerCol);
      if (!reachable.has(`${result.startRow},${result.startCol}`)) {
        allConnected = false;
        console.error(`    ❌ seed ${seed}: ghost house exit not connected to start`);
      }
    } else {
      allConnected = false;
      console.error(`    ❌ seed ${seed}: no exit tile above ghost house`);
    }
  }
  assert(allConnected, '[INTEGRATION] ghost house exit connects to main maze for all seeds');
}

// ═══════════════════════════════════════════════════════════════
// Multi-Seed Robustness
// ═══════════════════════════════════════════════════════════════

console.log('\n🧪 Integration — Multi-seed maze→sprite pipeline [INTEGRATION]');

{
  const ctx = new MockCanvasContext();
  const sr = new SpriteRenderer(ctx, 640, 480);
  const depthBuffer = new Float32Array(640).fill(20);
  const seeds = [0, 1, 42, 100, 255, 999, 12345, 65535];
  let allOk = true;

  for (const seed of seeds) {
    const gen = new PacManMazeGenerator({ width: 21, height: 21, seed });
    const result = gen.generate();

    const player = {
      x: result.startCol + 0.5,
      y: result.startRow + 0.5,
      angle: 0,
      fov: Math.PI / 3,
    };

    const sprites = result.dotPositions.map(([r, c]) => ({
      x: c + 0.5, y: r + 0.5, type: 'dot', active: true, animPhase: 0,
    }));

    try {
      ctx.clearCalls();
      sr.renderSprites(player, sprites, depthBuffer);
    } catch (e) {
      allOk = false;
      console.error(`    ❌ seed ${seed}: ${e.message}`);
    }
  }
  assert(allOk, `[INTEGRATION] maze→sprite pipeline works for ${seeds.length} different seeds`);
}

// ── Summary ────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`QA PAC-MAN Integration Tests: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
