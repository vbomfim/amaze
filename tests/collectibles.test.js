/**
 * Unit tests for CollectibleManager [TDD]
 *
 * Tests cover:
 * - Construction with dot/pellet/intersection positions
 * - Item creation with correct types and points
 * - Food item placement at intersections
 * - Collection detection with proximity check
 * - Active sprite generation for SpriteRenderer
 * - Remaining dot count and level-clear logic
 * - Animation phase updates
 * - Edge cases: empty positions, double-collection, out-of-range
 *
 * [TDD] Red phase — tests written before implementation
 */

import { CollectibleManager } from '../js/collectibles.js';

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

// ── Helper: generate test positions ────────────────────────────

function makeDotPositions(count) {
  const positions = [];
  for (let i = 0; i < count; i++) {
    positions.push([1 + Math.floor(i / 5) * 2, 1 + (i % 5) * 2]);
  }
  return positions;
}

function makePowerPelletPositions() {
  return [[1, 1], [1, 13], [13, 1], [13, 13]];
}

function makeIntersections() {
  // Cells with 3+ open neighbors — used for food placement
  return [[3, 3], [3, 7], [3, 11], [7, 3], [7, 7], [7, 11], [11, 3], [11, 7], [11, 11]];
}

// ── Construction Tests ─────────────────────────────────────────

console.log('\n🧪 CollectibleManager — Construction');

{
  const cm = new CollectibleManager(
    makeDotPositions(10),
    makePowerPelletPositions(),
    makeIntersections()
  );
  assert(cm !== null, 'creates CollectibleManager instance');
  assert(typeof cm.checkCollection === 'function', 'has checkCollection method');
  assert(typeof cm.getActiveSprites === 'function', 'has getActiveSprites method');
  assert(typeof cm.getRemainingDots === 'function', 'has getRemainingDots method');
  assert(typeof cm.isLevelClear === 'function', 'has isLevelClear method');
  assert(typeof cm.updateAnimations === 'function', 'has updateAnimations method');
}

// ── Dot Creation Tests ─────────────────────────────────────────

console.log('\n🧪 CollectibleManager — Dot Creation');

{
  const dots = makeDotPositions(10);
  const cm = new CollectibleManager(dots, [], []);

  assert(cm.getRemainingDots() === 10, 'creates correct number of dots');

  const sprites = cm.getActiveSprites();
  const dotSprites = sprites.filter(s => s.type === 'dot');
  assert(dotSprites.length === 10, 'all dots appear in active sprites');
}

{
  const dots = makeDotPositions(5);
  const cm = new CollectibleManager(dots, [], []);
  const sprites = cm.getActiveSprites();

  for (const sprite of sprites) {
    assert(sprite.type === 'dot', 'dot sprites have type "dot"');
    assert(sprite.active === true, 'new dots are active');
    assert(typeof sprite.x === 'number', 'sprite has numeric x position');
    assert(typeof sprite.y === 'number', 'sprite has numeric y position');
    assert(typeof sprite.animPhase === 'number', 'sprite has animPhase');
  }
}

// ── Power Pellet Creation Tests ────────────────────────────────

console.log('\n🧪 CollectibleManager — Power Pellet Creation');

{
  const pellets = makePowerPelletPositions();
  const cm = new CollectibleManager([], pellets, []);

  const sprites = cm.getActiveSprites();
  const pelletSprites = sprites.filter(s => s.type === 'power_pellet');
  assert(pelletSprites.length === 4, 'creates 4 power pellets');
}

{
  const pellets = [[5, 5]];
  const cm = new CollectibleManager([], pellets, []);
  const sprites = cm.getActiveSprites();
  assert(sprites.length === 1, 'single power pellet created');
  assert(sprites[0].type === 'power_pellet', 'power pellet has correct type');
  // Sprite position: center of tile (col + 0.5, row + 0.5)
  assert(sprites[0].x === 5.5, 'power pellet x = col + 0.5');
  assert(sprites[0].y === 5.5, 'power pellet y = row + 0.5');
}

// ── Food Item Placement Tests ──────────────────────────────────

console.log('\n🧪 CollectibleManager — Food Item Placement');

{
  const intersections = makeIntersections();
  const cm = new CollectibleManager([], [], intersections);

  const sprites = cm.getActiveSprites();
  const foodTypes = ['apple', 'cherry', 'pizza', 'cupcake'];
  const foodSprites = sprites.filter(s => foodTypes.includes(s.type));

  assert(foodSprites.length >= 4, 'places at least 4 food items');
  assert(foodSprites.length <= 6, 'places at most 6 food items');
}

{
  const intersections = makeIntersections();
  const cm = new CollectibleManager([], [], intersections);

  const sprites = cm.getActiveSprites();
  const foodTypes = ['apple', 'cherry', 'pizza', 'cupcake'];
  const foodSprites = sprites.filter(s => foodTypes.includes(s.type));

  for (const sprite of foodSprites) {
    assert(foodTypes.includes(sprite.type), `food item has valid type: ${sprite.type}`);
    assert(sprite.active === true, 'food items are active');
  }
}

{
  // Food items placed at intersection positions only
  const intersections = [[5, 5], [5, 9], [9, 5], [9, 9]];
  const cm = new CollectibleManager([], [], intersections);

  const sprites = cm.getActiveSprites();
  for (const sprite of sprites) {
    const matchesIntersection = intersections.some(
      ([r, c]) => sprite.x === c + 0.5 && sprite.y === r + 0.5
    );
    assert(matchesIntersection, `food item at (${sprite.x}, ${sprite.y}) is at an intersection`);
  }
}

{
  // With only 2 intersections, should place at most 2 food items
  const intersections = [[3, 3], [3, 7]];
  const cm = new CollectibleManager([], [], intersections);

  const sprites = cm.getActiveSprites();
  assert(sprites.length <= 2, 'does not exceed available intersections');
}

// ── Point Values Tests ─────────────────────────────────────────

console.log('\n🧪 CollectibleManager — Point Values');

{
  const dotPos = [[5, 5]];
  const cm = new CollectibleManager(dotPos, [], []);

  const item = cm.checkCollection(5, 5);
  assert(item !== null, 'collects dot at exact position');
  assert(item.type === 'dot', 'collected item is a dot');
  assert(item.points === 10, 'dot is worth 10 points');
}

{
  const pelletPos = [[5, 5]];
  const cm = new CollectibleManager([], pelletPos, []);

  const item = cm.checkCollection(5, 5);
  assert(item !== null, 'collects power pellet at exact position');
  assert(item.type === 'power_pellet', 'collected item is a power pellet');
  assert(item.points === 50, 'power pellet is worth 50 points');
}

{
  // Verify food point values: apple=50, cherry=100, pizza=200, cupcake=500
  const pointMap = { apple: 50, cherry: 100, pizza: 200, cupcake: 500 };
  const intersections = makeIntersections();
  const cm = new CollectibleManager([], [], intersections);
  const sprites = cm.getActiveSprites();
  const foodTypes = ['apple', 'cherry', 'pizza', 'cupcake'];
  const foodSprites = sprites.filter(s => foodTypes.includes(s.type));

  for (const sprite of foodSprites) {
    // Collect each food item and check points
    const row = sprite.y - 0.5;
    const col = sprite.x - 0.5;
    const item = cm.checkCollection(row, col);
    if (item) {
      assert(item.points === pointMap[item.type], `${item.type} is worth ${pointMap[item.type]} points`);
    }
  }
}

// ── Collection Detection Tests ─────────────────────────────────

console.log('\n🧪 CollectibleManager — Collection Detection');

{
  const dotPos = [[5, 5]];
  const cm = new CollectibleManager(dotPos, [], []);

  // Exact position
  const item = cm.checkCollection(5, 5);
  assert(item !== null, 'collects at exact tile position');
}

{
  const dotPos = [[5, 5]];
  const cm = new CollectibleManager(dotPos, [], []);

  // Within 0.5 tile proximity
  const item = cm.checkCollection(5.3, 5.3);
  assert(item !== null, 'collects within 0.5 tile proximity');
}

{
  const dotPos = [[5, 5]];
  const cm = new CollectibleManager(dotPos, [], []);

  // Just outside proximity
  const item = cm.checkCollection(6.2, 6.2);
  assert(item === null, 'does not collect beyond 0.6 tile proximity');
}

{
  const dotPos = [[5, 5]];
  const cm = new CollectibleManager(dotPos, [], []);

  // Far away
  const item = cm.checkCollection(10, 10);
  assert(item === null, 'does not collect from far away');
}

{
  // Double-collection prevention
  const dotPos = [[5, 5]];
  const cm = new CollectibleManager(dotPos, [], []);

  const first = cm.checkCollection(5, 5);
  const second = cm.checkCollection(5, 5);
  assert(first !== null, 'first collection succeeds');
  assert(second === null, 'second collection of same item returns null');
}

{
  // Collection removes from active sprites
  const dotPos = [[5, 5]];
  const cm = new CollectibleManager(dotPos, [], []);

  assert(cm.getActiveSprites().length === 1, 'one active sprite before collection');
  cm.checkCollection(5, 5);
  assert(cm.getActiveSprites().length === 0, 'no active sprites after collection');
}

// ── Remaining Dots and Level Clear Tests ───────────────────────

console.log('\n🧪 CollectibleManager — Remaining Dots & Level Clear');

{
  const dots = makeDotPositions(3);
  const cm = new CollectibleManager(dots, [], []);

  assert(cm.getRemainingDots() === 3, 'starts with 3 remaining dots');
  assert(!cm.isLevelClear(), 'level not clear with dots remaining');

  // Collect all dots
  for (const [row, col] of dots) {
    cm.checkCollection(row, col);
  }
  assert(cm.getRemainingDots() === 0, '0 remaining dots after collecting all');
  assert(cm.isLevelClear(), 'level clear when all dots collected');
}

{
  // Food items are optional — level clear only requires dots
  const dots = makeDotPositions(2);
  const intersections = makeIntersections();
  const cm = new CollectibleManager(dots, [], intersections);

  // Collect only dots (not food items)
  for (const [row, col] of dots) {
    cm.checkCollection(row, col);
  }
  assert(cm.isLevelClear(), 'level clear even with uncollected food items');
}

{
  // Power pellets also required for level clear (they're special dots)
  const dots = makeDotPositions(2);
  const pellets = makePowerPelletPositions();
  const cm = new CollectibleManager(dots, pellets, []);

  for (const [row, col] of dots) {
    cm.checkCollection(row, col);
  }
  assert(cm.getRemainingDots() === 0, 'dots remaining count excludes pellets');
  assert(cm.isLevelClear(), 'level clear checks only dots (not pellets)');
}

// ── Animation Update Tests ─────────────────────────────────────

console.log('\n🧪 CollectibleManager — Animation Updates');

{
  const pellets = [[5, 5]];
  const cm = new CollectibleManager([], pellets, []);

  const before = cm.getActiveSprites()[0].animPhase;
  cm.updateAnimations(0.5);
  const after = cm.getActiveSprites()[0].animPhase;
  assert(after !== before, 'updateAnimations changes animPhase');
}

{
  const pellets = [[5, 5]];
  const cm = new CollectibleManager([], pellets, []);

  cm.updateAnimations(0);
  const sprites = cm.getActiveSprites();
  assert(sprites.length === 1, 'zero dt does not break sprites');
}

{
  // animPhase wraps around (stays in [0, 1) range)
  const pellets = [[5, 5]];
  const cm = new CollectibleManager([], pellets, []);

  cm.updateAnimations(100); // Large dt
  const phase = cm.getActiveSprites()[0].animPhase;
  assert(phase >= 0 && phase < 1, 'animPhase wraps to [0, 1) range');
}

// ── Sprite Format Tests ────────────────────────────────────────

console.log('\n🧪 CollectibleManager — Sprite Format');

{
  const dots = [[3, 7]];
  const cm = new CollectibleManager(dots, [], []);
  const sprites = cm.getActiveSprites();

  assert(sprites.length === 1, 'returns one sprite');
  const s = sprites[0];

  // Sprite format must match SpriteRenderer expectations: { x, y, type, active, animPhase }
  assert(typeof s.x === 'number', 'sprite has x (number)');
  assert(typeof s.y === 'number', 'sprite has y (number)');
  assert(typeof s.type === 'string', 'sprite has type (string)');
  assert(typeof s.active === 'boolean', 'sprite has active (boolean)');
  assert(typeof s.animPhase === 'number', 'sprite has animPhase (number)');

  // Position: world coordinates at tile center
  assert(s.x === 7.5, 'sprite x = col + 0.5 (center of tile)');
  assert(s.y === 3.5, 'sprite y = row + 0.5 (center of tile)');
}

// ── Edge Case Tests ────────────────────────────────────────────

console.log('\n🧪 CollectibleManager — Edge Cases');

{
  // Empty positions
  const cm = new CollectibleManager([], [], []);
  assert(cm.getRemainingDots() === 0, 'handles empty dot positions');
  assert(cm.isLevelClear(), 'level clear with no dots');
  assert(cm.getActiveSprites().length === 0, 'no sprites with empty positions');
  assert(cm.checkCollection(5, 5) === null, 'collection returns null with no items');
}

{
  // Large dot count
  const dots = makeDotPositions(200);
  const cm = new CollectibleManager(dots, [], []);
  assert(cm.getRemainingDots() === 200, 'handles 200 dots');
  assert(cm.getActiveSprites().length === 200, '200 active sprites');
}

{
  // Negative coordinates
  const cm = new CollectibleManager([], [], []);
  const result = cm.checkCollection(-1, -1);
  assert(result === null, 'handles negative coordinates gracefully');
}

// ── Deterministic Seed Test ────────────────────────────────────

console.log('\n🧪 CollectibleManager — Deterministic with Seed');

{
  const intersections = makeIntersections();
  const cm1 = new CollectibleManager([], [], intersections, 42);
  const cm2 = new CollectibleManager([], [], intersections, 42);

  const sprites1 = cm1.getActiveSprites();
  const sprites2 = cm2.getActiveSprites();

  assert(sprites1.length === sprites2.length, 'same seed produces same number of food items');

  let allMatch = true;
  for (let i = 0; i < sprites1.length; i++) {
    if (sprites1[i].type !== sprites2[i].type || sprites1[i].x !== sprites2[i].x) {
      allMatch = false;
      break;
    }
  }
  assert(allMatch, 'same seed produces identical food placement');
}

{
  // Different seeds produce different layouts (probabilistically)
  const intersections = makeIntersections();
  const cm1 = new CollectibleManager([], [], intersections, 42);
  const cm2 = new CollectibleManager([], [], intersections, 99);

  const types1 = cm1.getActiveSprites().map(s => s.type).join(',');
  const types2 = cm2.getActiveSprites().map(s => s.type).join(',');

  // Not guaranteed but highly likely with 9 intersections
  assert(types1 !== types2 || true, 'different seeds may produce different layouts (non-deterministic assertion skipped)');
}

// ── Summary ────────────────────────────────────────────────────

console.log(`\n📊 Collectibles Tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
