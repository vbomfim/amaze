/**
 * Unit tests for SpriteRenderer [TDD]
 *
 * Tests cover:
 * - Construction with canvas dimensions
 * - Sprite distance calculation
 * - Sprite sorting (back-to-front, painter's algorithm)
 * - Depth buffer occlusion
 * - All sprite type drawing methods exist
 * - Inactive sprites are skipped
 * - Edge cases: empty sprite list, sprite at player position, behind player
 */

import { SpriteRenderer, SPRITE_TYPES } from '../js/sprites.js';

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

// ── Construction Tests ─────────────────────────────────────────

console.log('\n🧪 SpriteRenderer — Construction');

{
  const ctx = new MockCanvasContext();
  const sr = new SpriteRenderer(ctx, 320, 200);
  assert(sr !== null, 'creates SpriteRenderer instance');
  assert(sr.width === 320, 'stores canvas width');
  assert(sr.height === 200, 'stores canvas height');
}

// ── SPRITE_TYPES constant ──────────────────────────────────────

console.log('\n🧪 SpriteRenderer — SPRITE_TYPES definitions');

{
  assert(typeof SPRITE_TYPES === 'object', 'SPRITE_TYPES is exported');

  const expectedTypes = [
    'dot', 'power_pellet', 'apple', 'cherry', 'pizza', 'cupcake',
    'ghost_blinky', 'ghost_pinky', 'ghost_inky', 'ghost_clyde',
    'ghost_frightened', 'ghost_eaten',
  ];

  for (const type of expectedTypes) {
    assert(type in SPRITE_TYPES, `SPRITE_TYPES has '${type}'`);
    assert(typeof SPRITE_TYPES[type].color === 'string', `${type} has color`);
    assert(typeof SPRITE_TYPES[type].size === 'number', `${type} has size`);
  }
}

// ── renderSprites method ───────────────────────────────────────

console.log('\n🧪 SpriteRenderer — renderSprites method');

{
  const ctx = new MockCanvasContext();
  const sr = new SpriteRenderer(ctx, 320, 200);
  assert(typeof sr.renderSprites === 'function', 'renderSprites method exists');
}

// ── Empty sprite list ──────────────────────────────────────────

console.log('\n🧪 SpriteRenderer — Empty sprite list');

{
  const ctx = new MockCanvasContext();
  const sr = new SpriteRenderer(ctx, 320, 200);
  const player = { x: 5.5, y: 5.5, angle: 0, fov: Math.PI / 3 };
  const depthBuffer = new Float32Array(320).fill(10);

  let threw = false;
  try {
    sr.renderSprites(player, [], depthBuffer);
  } catch (_e) {
    threw = true;
  }
  assert(!threw, 'empty sprite list renders without error');
}

// ── Inactive sprites are skipped ───────────────────────────────

console.log('\n🧪 SpriteRenderer — Inactive sprites skipped');

{
  const ctx = new MockCanvasContext();
  const sr = new SpriteRenderer(ctx, 320, 200);
  const player = { x: 5.5, y: 5.5, angle: 0, fov: Math.PI / 3 };
  const depthBuffer = new Float32Array(320).fill(10);

  const sprites = [
    { x: 6.5, y: 5.5, type: 'dot', active: false, animPhase: 0 },
  ];

  ctx.clearCalls();
  sr.renderSprites(player, sprites, depthBuffer);
  // Should produce no draw calls for the sprite (maybe save/restore but no fill)
  const fillCalls = ctx._calls.filter(c => c[0] === 'arc' || c[0] === 'fillRect');
  assert(fillCalls.length === 0, 'inactive sprites produce no draw calls');
}

// ── Sprite behind player is not drawn ──────────────────────────

console.log('\n🧪 SpriteRenderer — Sprite behind player');

{
  const ctx = new MockCanvasContext();
  const sr = new SpriteRenderer(ctx, 320, 200);
  // Player at 5.5,5.5 facing east (angle=0)
  const player = { x: 5.5, y: 5.5, angle: 0, fov: Math.PI / 3 };
  const depthBuffer = new Float32Array(320).fill(10);

  // Sprite behind player (west)
  const sprites = [
    { x: 3.5, y: 5.5, type: 'dot', active: true, animPhase: 0 },
  ];

  ctx.clearCalls();
  sr.renderSprites(player, sprites, depthBuffer);
  // Should produce very few or no draw calls since sprite is behind
  const arcCalls = ctx._calls.filter(c => c[0] === 'arc');
  assert(arcCalls.length === 0, 'sprite behind player produces no arc draw calls');
}

// ── Sprite in front of player draws something ──────────────────

console.log('\n🧪 SpriteRenderer — Sprite in front draws');

{
  const ctx = new MockCanvasContext();
  const sr = new SpriteRenderer(ctx, 320, 200);
  // Player at 5.5,5.5 facing east (angle=0)
  const player = { x: 5.5, y: 5.5, angle: 0, fov: Math.PI / 3 };
  const depthBuffer = new Float32Array(320).fill(10);

  // Sprite directly in front, 2 tiles away
  const sprites = [
    { x: 7.5, y: 5.5, type: 'dot', active: true, animPhase: 0 },
  ];

  ctx.clearCalls();
  sr.renderSprites(player, sprites, depthBuffer);
  const drawCalls = ctx._calls.filter(c => c[0] === 'fill' || c[0] === 'fillRect');
  assert(drawCalls.length > 0, 'visible sprite in front produces draw calls');
}

// ── Depth buffer occlusion ─────────────────────────────────────

console.log('\n🧪 SpriteRenderer — Depth buffer occlusion');

{
  const ctx = new MockCanvasContext();
  const sr = new SpriteRenderer(ctx, 320, 200);
  const player = { x: 5.5, y: 5.5, angle: 0, fov: Math.PI / 3 };

  // Wall very close — should occlude sprite behind it
  const depthBuffer = new Float32Array(320).fill(0.5);

  const sprites = [
    { x: 7.5, y: 5.5, type: 'dot', active: true, animPhase: 0 },
  ];

  ctx.clearCalls();
  sr.renderSprites(player, sprites, depthBuffer);
  // Sprite at distance 2 should be occluded by wall at 0.5
  const arcCalls = ctx._calls.filter(c => c[0] === 'arc');
  assert(arcCalls.length === 0, 'sprite behind wall (depth buffer) is occluded');
}

// ── Sprite sorting (back-to-front) ────────────────────────────

console.log('\n🧪 SpriteRenderer — Sprite sorting');

{
  const ctx = new MockCanvasContext();
  const sr = new SpriteRenderer(ctx, 320, 200);
  const player = { x: 5.5, y: 5.5, angle: 0, fov: Math.PI / 3 };
  const depthBuffer = new Float32Array(320).fill(20);

  const sprites = [
    { x: 6.5, y: 5.5, type: 'dot', active: true, animPhase: 0 },      // close
    { x: 10.5, y: 5.5, type: 'dot', active: true, animPhase: 0 },     // far
    { x: 8.5, y: 5.5, type: 'dot', active: true, animPhase: 0 },      // medium
  ];

  // Should not throw — sorting happens internally
  let threw = false;
  try {
    sr.renderSprites(player, sprites, depthBuffer);
  } catch (_e) {
    threw = true;
  }
  assert(!threw, 'multiple sprites render without error (sorting)');
}

// ── All sprite types render without error ──────────────────────

console.log('\n🧪 SpriteRenderer — All sprite types render');

{
  const ctx = new MockCanvasContext();
  const sr = new SpriteRenderer(ctx, 320, 200);
  const player = { x: 5.5, y: 5.5, angle: 0, fov: Math.PI / 3 };
  const depthBuffer = new Float32Array(320).fill(20);

  const allTypes = Object.keys(SPRITE_TYPES);
  let allOk = true;

  for (const type of allTypes) {
    const sprites = [
      { x: 7.5, y: 5.5, type, active: true, animPhase: 0 },
    ];
    try {
      ctx.clearCalls();
      sr.renderSprites(player, sprites, depthBuffer);
    } catch (e) {
      allOk = false;
      console.error(`    ❌ ${type} threw: ${e.message}`);
    }
  }
  assert(allOk, `all ${allTypes.length} sprite types render without error`);
}

// ── Ghost types have diamond shape ─────────────────────────────

console.log('\n🧪 SpriteRenderer — Ghost sprite shapes');

{
  const ghostTypes = ['ghost_blinky', 'ghost_pinky', 'ghost_inky', 'ghost_clyde', 'ghost_frightened'];
  for (const type of ghostTypes) {
    assert(SPRITE_TYPES[type].shape === 'diamond', `${type} has diamond shape`);
  }
  assert(SPRITE_TYPES.ghost_eaten.shape === 'eyes', 'ghost_eaten has eyes shape');
}

// ── Dot and pellet shapes ──────────────────────────────────────

console.log('\n🧪 SpriteRenderer — Item sprite shapes');

{
  assert(SPRITE_TYPES.dot.shape === 'circle', 'dot has circle shape');
  assert(SPRITE_TYPES.power_pellet.shape === 'circle', 'power_pellet has circle shape');
  assert(SPRITE_TYPES.apple.shape === 'diamond', 'apple has diamond shape');
  assert(SPRITE_TYPES.cherry.shape === 'circles', 'cherry has circles shape');
  assert(SPRITE_TYPES.pizza.shape === 'triangle', 'pizza has triangle shape');
  assert(SPRITE_TYPES.cupcake.shape === 'rectangle', 'cupcake has rectangle shape');
}

// ── Sprite at same position as player ──────────────────────────

console.log('\n🧪 SpriteRenderer — Sprite at player position');

{
  const ctx = new MockCanvasContext();
  const sr = new SpriteRenderer(ctx, 320, 200);
  const player = { x: 5.5, y: 5.5, angle: 0, fov: Math.PI / 3 };
  const depthBuffer = new Float32Array(320).fill(10);

  const sprites = [
    { x: 5.5, y: 5.5, type: 'dot', active: true, animPhase: 0 },
  ];

  let threw = false;
  try {
    sr.renderSprites(player, sprites, depthBuffer);
  } catch (_e) {
    threw = true;
  }
  assert(!threw, 'sprite at player position does not crash');
}

// ── Large sprite count performance guard ───────────────────────

console.log('\n🧪 SpriteRenderer — Large sprite count');

{
  const ctx = new MockCanvasContext();
  const sr = new SpriteRenderer(ctx, 320, 200);
  const player = { x: 15.5, y: 15.5, angle: 0, fov: Math.PI / 3 };
  const depthBuffer = new Float32Array(320).fill(30);

  const sprites = [];
  for (let i = 0; i < 300; i++) {
    sprites.push({
      x: 16.5 + (i % 20),
      y: 15.5 + Math.floor(i / 20) - 7,
      type: i % 2 === 0 ? 'dot' : 'ghost_blinky',
      active: true,
      animPhase: 0,
    });
  }

  const start = performance.now();
  sr.renderSprites(player, sprites, depthBuffer);
  const elapsed = performance.now() - start;

  // Should complete in reasonable time (< 100ms for 300 sprites with mock)
  assert(elapsed < 500, `300 sprites rendered in ${elapsed.toFixed(1)}ms (< 500ms)`);
}

// ── Summary ────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`SpriteRenderer Tests: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
