/**
 * Unit tests for Ghost + GhostManager [TDD]
 *
 * Tests cover:
 * - Ghost construction and initial state
 * - Ghost state machine (SPAWN → SCATTER → CHASE → FRIGHTENED → EATEN)
 * - Ghost personalities and chase targets
 * - GhostManager creation and ghost spawning
 * - Player collision detection
 * - Frightened mode trigger and sequential scoring
 * - BFS pathfinding on tile map
 * - Ghost movement with continuous positions
 * - Speed constants for each state
 * - Sprite generation for SpriteRenderer
 * - Edge cases: wall handling, ghost house exit, reset
 *
 * [TDD] Red phase — tests written before implementation
 */

import { Ghost, GhostManager, GHOST_STATES, GHOST_SPEEDS } from '../js/ghost.js';

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

// ── Helper: create a simple test maze ──────────────────────────

function createTestMaze() {
  // 15x15 simple open maze with walls on borders
  const map = [];
  for (let r = 0; r < 15; r++) {
    map[r] = [];
    for (let c = 0; c < 15; c++) {
      map[r][c] = (r === 0 || r === 14 || c === 0 || c === 14) ? 1 : 0;
    }
  }
  return map;
}

function createTestGhostHouse() {
  return { row: 5, col: 5, width: 5, height: 3 };
}

function createMazeWithWalls() {
  // Maze with internal walls for pathfinding tests
  const map = createTestMaze();
  // Add a wall barrier in the middle
  for (let c = 1; c < 10; c++) {
    map[7][c] = 1;
  }
  return map;
}

// ── Exported Constants Tests ───────────────────────────────────

console.log('\n🧪 Ghost — Exported Constants');

{
  assert(GHOST_STATES !== undefined, 'GHOST_STATES is exported');
  assert(GHOST_STATES.SPAWN !== undefined, 'has SPAWN state');
  assert(GHOST_STATES.SCATTER !== undefined, 'has SCATTER state');
  assert(GHOST_STATES.CHASE !== undefined, 'has CHASE state');
  assert(GHOST_STATES.FRIGHTENED !== undefined, 'has FRIGHTENED state');
  assert(GHOST_STATES.EATEN !== undefined, 'has EATEN state');
}

{
  assert(GHOST_SPEEDS !== undefined, 'GHOST_SPEEDS is exported');
  assert(GHOST_SPEEDS.NORMAL === 2.25, 'normal speed is 2.25 (75% of player 3.0)');
  assert(GHOST_SPEEDS.FRIGHTENED === 1.5, 'frightened speed is 1.5 (50% of player)');
  assert(GHOST_SPEEDS.EATEN === 4.5, 'eaten speed is 4.5 (150% of player)');
}

// ── Ghost Construction Tests ───────────────────────────────────

console.log('\n🧪 Ghost — Construction');

{
  const maze = createTestMaze();
  const ghost = new Ghost({
    id: 'blinky',
    color: '#ff0000',
    row: 6,
    col: 7,
    personality: 'blinky',
    speed: GHOST_SPEEDS.NORMAL,
    maze,
  });

  assert(ghost !== null, 'creates Ghost instance');
  assert(ghost.id === 'blinky', 'stores ghost id');
  assert(ghost.color === '#ff0000', 'stores ghost color');
  assert(typeof ghost.x === 'number', 'has x position (float)');
  assert(typeof ghost.y === 'number', 'has y position (float)');
  assert(ghost.x === 7.5, 'x position is col + 0.5 (tile center)');
  assert(ghost.y === 6.5, 'y position is row + 0.5 (tile center)');
  assert(ghost.state === GHOST_STATES.SPAWN, 'initial state is SPAWN');
}

// ── Ghost State Machine Tests ──────────────────────────────────

console.log('\n🧪 Ghost — State Machine');

{
  const maze = createTestMaze();
  const ghost = new Ghost({
    id: 'blinky', color: '#ff0000', row: 6, col: 7,
    personality: 'blinky', speed: GHOST_SPEEDS.NORMAL, maze,
  });

  assert(ghost.state === GHOST_STATES.SPAWN, 'starts in SPAWN');

  // Release ghost from ghost house
  ghost.release();
  assert(ghost.state === GHOST_STATES.SCATTER, 'transitions to SCATTER after release');
}

{
  const maze = createTestMaze();
  const ghost = new Ghost({
    id: 'blinky', color: '#ff0000', row: 6, col: 7,
    personality: 'blinky', speed: GHOST_SPEEDS.NORMAL, maze,
  });

  ghost.release();
  assert(ghost.state === GHOST_STATES.SCATTER, 'in SCATTER state');

  // Simulate enough time passing to transition to CHASE (7 seconds)
  ghost.updateStateTimer(7.1);
  assert(ghost.state === GHOST_STATES.CHASE, 'transitions to CHASE after 7s scatter');
}

{
  const maze = createTestMaze();
  const ghost = new Ghost({
    id: 'blinky', color: '#ff0000', row: 6, col: 7,
    personality: 'blinky', speed: GHOST_SPEEDS.NORMAL, maze,
  });

  ghost.release();
  ghost.updateStateTimer(7.1); // → CHASE
  assert(ghost.state === GHOST_STATES.CHASE, 'in CHASE state');

  // CHASE lasts 20 seconds → back to SCATTER
  ghost.updateStateTimer(20.1);
  assert(ghost.state === GHOST_STATES.SCATTER, 'transitions back to SCATTER after 20s chase');
}

{
  // FRIGHTENED state
  const maze = createTestMaze();
  const ghost = new Ghost({
    id: 'blinky', color: '#ff0000', row: 6, col: 7,
    personality: 'blinky', speed: GHOST_SPEEDS.NORMAL, maze,
  });

  ghost.release();
  ghost.frighten(8);
  assert(ghost.state === GHOST_STATES.FRIGHTENED, 'enters FRIGHTENED on power pellet');
}

{
  // FRIGHTENED → resumes previous state
  const maze = createTestMaze();
  const ghost = new Ghost({
    id: 'blinky', color: '#ff0000', row: 6, col: 7,
    personality: 'blinky', speed: GHOST_SPEEDS.NORMAL, maze,
  });

  ghost.release(); // SCATTER
  ghost.updateStateTimer(7.1); // → CHASE
  ghost.frighten(8);
  assert(ghost.state === GHOST_STATES.FRIGHTENED, 'in FRIGHTENED');

  ghost.updateStateTimer(8.1); // frightened duration elapsed
  assert(ghost.state === GHOST_STATES.CHASE, 'resumes CHASE after frightened ends');
}

{
  // EATEN state
  const maze = createTestMaze();
  const ghost = new Ghost({
    id: 'blinky', color: '#ff0000', row: 6, col: 7,
    personality: 'blinky', speed: GHOST_SPEEDS.NORMAL, maze,
  });

  ghost.release();
  ghost.frighten(8);
  ghost.eat();
  assert(ghost.state === GHOST_STATES.EATEN, 'transitions to EATEN when eaten');
}

// ── Ghost Speed Tests ──────────────────────────────────────────

console.log('\n🧪 Ghost — Speed by State');

{
  const maze = createTestMaze();
  const ghost = new Ghost({
    id: 'blinky', color: '#ff0000', row: 6, col: 7,
    personality: 'blinky', speed: GHOST_SPEEDS.NORMAL, maze,
  });

  ghost.release();
  assert(ghost.getCurrentSpeed() === GHOST_SPEEDS.NORMAL, 'normal speed in SCATTER');

  ghost.frighten(8);
  assert(ghost.getCurrentSpeed() === GHOST_SPEEDS.FRIGHTENED, 'reduced speed in FRIGHTENED');

  ghost.eat();
  assert(ghost.getCurrentSpeed() === GHOST_SPEEDS.EATEN, 'fast speed in EATEN');
}

// ── Ghost Personality Target Tests ─────────────────────────────

console.log('\n🧪 Ghost — Personality Chase Targets');

{
  const maze = createTestMaze();

  // Blinky: targets player's current tile
  const blinky = new Ghost({
    id: 'blinky', color: '#ff0000', row: 6, col: 7,
    personality: 'blinky', speed: GHOST_SPEEDS.NORMAL, maze,
  });
  blinky.release();
  blinky.updateStateTimer(7.1); // → CHASE

  const target = blinky.getChaseTarget(10, 10, 0, null);
  assert(target.row === 10, 'blinky targets player row');
  assert(target.col === 10, 'blinky targets player col');
}

{
  const maze = createTestMaze();

  // Pinky: targets 4 tiles ahead of player
  const pinky = new Ghost({
    id: 'pinky', color: '#ffb8ff', row: 6, col: 7,
    personality: 'pinky', speed: GHOST_SPEEDS.NORMAL, maze,
  });
  pinky.release();
  pinky.updateStateTimer(7.1);

  // Player at (10, 5) facing east (angle 0)
  const target = pinky.getChaseTarget(10, 5, 0, null);
  assert(target.col === 9, 'pinky targets 4 tiles ahead (east): col = 5+4=9');
  assert(target.row === 10, 'pinky keeps player row when facing east');
}

{
  const maze = createTestMaze();

  // Clyde: targets player when > 8 tiles away, scatter corner when close
  const clyde = new Ghost({
    id: 'clyde', color: '#ffb852', row: 6, col: 7,
    personality: 'clyde', speed: GHOST_SPEEDS.NORMAL, maze,
  });
  clyde.release();
  clyde.updateStateTimer(7.1);

  // Player far away (> 8 tiles) — ghost at (6,7), player at (13,13)
  // Distance = sqrt((6-13)^2 + (7-13)^2) = sqrt(85) ≈ 9.2 > 8
  const targetFar = clyde.getChaseTarget(13, 13, 0, null);
  assert(targetFar.row === 13, 'clyde targets player when far away');
  assert(targetFar.col === 13, 'clyde targets player col when far away');

  // Player close (within 8 tiles) — should target scatter corner
  const targetClose = clyde.getChaseTarget(6, 8, 0, null);
  assert(targetClose.row !== 6 || targetClose.col !== 8, 'clyde targets scatter corner when close');
}

// ── GhostManager Construction Tests ────────────────────────────

console.log('\n🧪 GhostManager — Construction');

{
  const maze = createTestMaze();
  const ghostHouse = createTestGhostHouse();
  const gm = new GhostManager(maze, ghostHouse);

  assert(gm !== null, 'creates GhostManager instance');
  assert(typeof gm.update === 'function', 'has update method');
  assert(typeof gm.checkPlayerCollision === 'function', 'has checkPlayerCollision method');
  assert(typeof gm.triggerFrightened === 'function', 'has triggerFrightened method');
  assert(typeof gm.getSprites === 'function', 'has getSprites method');
  assert(typeof gm.reset === 'function', 'has reset method');
}

// ── GhostManager Ghost Spawning Tests ──────────────────────────

console.log('\n🧪 GhostManager — Ghost Spawning');

{
  const maze = createTestMaze();
  const ghostHouse = createTestGhostHouse();
  const gm = new GhostManager(maze, ghostHouse);

  const sprites = gm.getSprites();
  assert(sprites.length === 4, 'creates 4 ghosts');

  const types = sprites.map(s => s.type).sort();
  assert(types.includes('ghost_blinky'), 'has blinky ghost');
  assert(types.includes('ghost_pinky'), 'has pinky ghost');
  assert(types.includes('ghost_inky'), 'has inky ghost');
  assert(types.includes('ghost_clyde'), 'has clyde ghost');
}

{
  // Ghosts start in ghost house area
  const maze = createTestMaze();
  const ghostHouse = createTestGhostHouse();
  const gm = new GhostManager(maze, ghostHouse);

  const sprites = gm.getSprites();
  for (const sprite of sprites) {
    const row = Math.floor(sprite.y);
    const col = Math.floor(sprite.x);
    const inGhostHouse = (
      row >= ghostHouse.row && row < ghostHouse.row + ghostHouse.height &&
      col >= ghostHouse.col && col < ghostHouse.col + ghostHouse.width
    );
    assert(inGhostHouse, `${sprite.type} starts inside ghost house`);
  }
}

// ── GhostManager Sprite Format Tests ───────────────────────────

console.log('\n🧪 GhostManager — Sprite Format');

{
  const maze = createTestMaze();
  const ghostHouse = createTestGhostHouse();
  const gm = new GhostManager(maze, ghostHouse);

  const sprites = gm.getSprites();
  for (const s of sprites) {
    assert(typeof s.x === 'number', `${s.type} has numeric x`);
    assert(typeof s.y === 'number', `${s.type} has numeric y`);
    assert(typeof s.type === 'string', `has string type`);
    assert(typeof s.active === 'boolean', `has boolean active`);
    assert(s.active === true, `ghost sprite is active`);
    assert(typeof s.animPhase === 'number', `has numeric animPhase`);
  }
}

// ── GhostManager Player Collision Tests ────────────────────────

console.log('\n🧪 GhostManager — Player Collision');

{
  const maze = createTestMaze();
  const ghostHouse = createTestGhostHouse();
  const gm = new GhostManager(maze, ghostHouse);

  // Player far from ghosts
  const result = gm.checkPlayerCollision(13, 13);
  assert(result === null, 'no collision when player is far from ghosts');
}

{
  const maze = createTestMaze();
  const ghostHouse = createTestGhostHouse();
  const gm = new GhostManager(maze, ghostHouse);

  // Get a ghost position and check collision near it
  const sprites = gm.getSprites();
  const ghost = sprites[0];
  const result = gm.checkPlayerCollision(ghost.y, ghost.x);
  // Ghosts in SPAWN state should not collide (they're in the ghost house)
  assert(result === null, 'no collision with ghosts in SPAWN state');
}

// ── GhostManager Frightened Mode Tests ─────────────────────────

console.log('\n🧪 GhostManager — Frightened Mode');

{
  const maze = createTestMaze();
  const ghostHouse = createTestGhostHouse();
  const gm = new GhostManager(maze, ghostHouse);

  // Release all ghosts first
  gm.releaseAll();

  gm.triggerFrightened(8);

  const sprites = gm.getSprites();
  const frightenedSprites = sprites.filter(s => s.type === 'ghost_frightened');
  assert(frightenedSprites.length === 4, 'all ghosts become frightened');
}

{
  // Sequential ghost eating scoring: 200, 400, 800, 1600
  const maze = createTestMaze();
  const ghostHouse = createTestGhostHouse();
  const gm = new GhostManager(maze, ghostHouse);

  gm.releaseAll();
  gm.triggerFrightened(8);

  const scores = gm.getGhostEatScores();
  assert(scores[0] === 200, 'first ghost worth 200');
  assert(scores[1] === 400, 'second ghost worth 400');
  assert(scores[2] === 800, 'third ghost worth 800');
  assert(scores[3] === 1600, 'fourth ghost worth 1600');
}

{
  // Score resets with each power pellet
  const maze = createTestMaze();
  const ghostHouse = createTestGhostHouse();
  const gm = new GhostManager(maze, ghostHouse);

  gm.releaseAll();
  gm.triggerFrightened(8);

  // Simulate eating one ghost
  gm.eatGhost('blinky');
  // Now trigger another frightened
  gm.triggerFrightened(8);
  const scores = gm.getGhostEatScores();
  assert(scores[0] === 200, 'score resets to 200 with new power pellet');
}

// ── GhostManager Update Tests ──────────────────────────────────

console.log('\n🧪 GhostManager — Update');

{
  const maze = createTestMaze();
  const ghostHouse = createTestGhostHouse();
  const gm = new GhostManager(maze, ghostHouse);

  // Should not throw with valid parameters
  let noError = true;
  try {
    gm.update(0.016, 10, 10, 0, maze);
  } catch (_e) {
    noError = false;
  }
  assert(noError, 'update runs without error');
}

{
  // Update moves released ghosts
  const maze = createTestMaze();
  const ghostHouse = createTestGhostHouse();
  const gm = new GhostManager(maze, ghostHouse);

  gm.releaseAll();
  const beforeSprites = gm.getSprites();
  const beforePos = beforeSprites.map(s => ({ x: s.x, y: s.y }));

  // Simulate several updates
  for (let i = 0; i < 60; i++) {
    gm.update(0.016, 10, 10, 0, maze);
  }

  const afterSprites = gm.getSprites();
  let anyMoved = false;
  for (let i = 0; i < afterSprites.length; i++) {
    if (afterSprites[i].x !== beforePos[i].x || afterSprites[i].y !== beforePos[i].y) {
      anyMoved = true;
      break;
    }
  }
  assert(anyMoved, 'ghosts move after update calls');
}

// ── GhostManager Reset Tests ───────────────────────────────────

console.log('\n🧪 GhostManager — Reset');

{
  const maze = createTestMaze();
  const ghostHouse = createTestGhostHouse();
  const gm = new GhostManager(maze, ghostHouse);

  gm.releaseAll();
  gm.triggerFrightened(8);

  // Move ghosts
  for (let i = 0; i < 30; i++) {
    gm.update(0.016, 10, 10, 0, maze);
  }

  gm.reset();

  const sprites = gm.getSprites();
  assert(sprites.length === 4, 'still has 4 ghosts after reset');

  // Check ghosts are back in ghost house
  for (const sprite of sprites) {
    const row = Math.floor(sprite.y);
    const col = Math.floor(sprite.x);
    const inGhostHouse = (
      row >= ghostHouse.row && row < ghostHouse.row + ghostHouse.height &&
      col >= ghostHouse.col && col < ghostHouse.col + ghostHouse.width
    );
    assert(inGhostHouse, `${sprite.type} back in ghost house after reset`);
  }
}

// ── BFS Pathfinding Tests ──────────────────────────────────────

console.log('\n🧪 Ghost — BFS Pathfinding');

{
  const maze = createTestMaze();
  const ghost = new Ghost({
    id: 'blinky', color: '#ff0000', row: 1, col: 1,
    personality: 'blinky', speed: GHOST_SPEEDS.NORMAL, maze,
  });

  const path = ghost.findPath(1, 1, 13, 13, maze);
  assert(path !== null, 'finds path in open maze');
  assert(path.length > 0, 'path has steps');
  assert(path[path.length - 1][0] === 13 && path[path.length - 1][1] === 13, 'path ends at target');
}

{
  const maze = createMazeWithWalls();
  const ghost = new Ghost({
    id: 'blinky', color: '#ff0000', row: 1, col: 1,
    personality: 'blinky', speed: GHOST_SPEEDS.NORMAL, maze,
  });

  const path = ghost.findPath(1, 1, 13, 13, maze);
  assert(path !== null, 'finds path around walls');

  // Verify path doesn't go through walls
  let pathClear = true;
  for (const [pr, pc] of path) {
    if (maze[pr][pc] !== 0) {
      pathClear = false;
      break;
    }
  }
  assert(pathClear, 'path avoids walls');
}

{
  // Path to unreachable cell (surrounded by walls)
  const maze = createTestMaze();
  maze[5][5] = 1; maze[5][6] = 1; maze[5][7] = 1;
  maze[6][5] = 1; /* target: 6,6 */ maze[6][7] = 1;
  maze[7][5] = 1; maze[7][6] = 1; maze[7][7] = 1;

  const ghost = new Ghost({
    id: 'blinky', color: '#ff0000', row: 1, col: 1,
    personality: 'blinky', speed: GHOST_SPEEDS.NORMAL, maze,
  });

  const path = ghost.findPath(1, 1, 6, 6, maze);
  assert(path === null || path.length === 0, 'returns null/empty for unreachable target');
}

// ── Ghost Movement Tests ───────────────────────────────────────

console.log('\n🧪 Ghost — Continuous Movement');

{
  const maze = createTestMaze();
  const ghost = new Ghost({
    id: 'blinky', color: '#ff0000', row: 3, col: 3,
    personality: 'blinky', speed: GHOST_SPEEDS.NORMAL, maze,
  });

  ghost.release();
  ghost.updateStateTimer(7.1); // → CHASE

  const startX = ghost.x;
  const startY = ghost.y;

  // Update with target at (10, 10)
  ghost.update(0.5, 10, 10, 0, null, maze);

  const moved = (ghost.x !== startX || ghost.y !== startY);
  assert(moved, 'ghost moves toward target');
}

{
  // Ghost stays within map bounds
  const maze = createTestMaze();
  const ghost = new Ghost({
    id: 'blinky', color: '#ff0000', row: 1, col: 1,
    personality: 'blinky', speed: GHOST_SPEEDS.NORMAL, maze,
  });

  ghost.release();
  ghost.updateStateTimer(7.1);

  // Many updates
  for (let i = 0; i < 100; i++) {
    ghost.update(0.016, 13, 13, 0, null, maze);
  }

  assert(ghost.x >= 0.5 && ghost.x < 14.5, 'ghost x stays in bounds');
  assert(ghost.y >= 0.5 && ghost.y < 14.5, 'ghost y stays in bounds');
}

// ── Ghost Sprite Type by State Tests ───────────────────────────

console.log('\n🧪 Ghost — Sprite Type by State');

{
  const maze = createTestMaze();
  const ghost = new Ghost({
    id: 'blinky', color: '#ff0000', row: 6, col: 7,
    personality: 'blinky', speed: GHOST_SPEEDS.NORMAL, maze,
  });

  ghost.release();
  let sprite = ghost.getSprite();
  assert(sprite.type === 'ghost_blinky', 'normal state: ghost_blinky sprite type');

  ghost.frighten(8);
  sprite = ghost.getSprite();
  assert(sprite.type === 'ghost_frightened', 'frightened state: ghost_frightened sprite type');

  ghost.eat();
  sprite = ghost.getSprite();
  assert(sprite.type === 'ghost_eaten', 'eaten state: ghost_eaten sprite type');
}

// ── Frightened Ghost Flashing Tests ────────────────────────────

console.log('\n🧪 Ghost — Frightened Flashing');

{
  const maze = createTestMaze();
  const ghost = new Ghost({
    id: 'blinky', color: '#ff0000', row: 6, col: 7,
    personality: 'blinky', speed: GHOST_SPEEDS.NORMAL, maze,
  });

  ghost.release();
  ghost.frighten(8);

  // Update animPhase
  ghost.updateAnimPhase(0.5);
  const sprite = ghost.getSprite();
  assert(typeof sprite.animPhase === 'number', 'frightened ghost has animPhase for flashing');
}

// ── Inky Target Calculation Test ───────────────────────────────

console.log('\n🧪 Ghost — Inky Target Calculation');

{
  const maze = createTestMaze();
  const inky = new Ghost({
    id: 'inky', color: '#00ffff', row: 6, col: 7,
    personality: 'inky', speed: GHOST_SPEEDS.NORMAL, maze,
  });

  inky.release();
  inky.updateStateTimer(7.1);

  // Blinky at (3, 3), player at (10, 10) facing east
  // 2 tiles ahead of player: (10, 12)
  // Vector from blinky to 2-ahead: (7, 9)
  // 2× vector: (14, 18) → target: (3+14, 3+18) = (17, 21) → clamped to maze bounds
  const blinkyPos = { row: 3, col: 3 };
  const target = inky.getChaseTarget(10, 10, 0, blinkyPos);
  assert(target !== null, 'inky computes chase target');
  assert(typeof target.row === 'number', 'inky target has row');
  assert(typeof target.col === 'number', 'inky target has col');
}

// ── GhostManager Staggered Release Tests ───────────────────────

console.log('\n🧪 GhostManager — Staggered Release');

{
  const maze = createTestMaze();
  const ghostHouse = createTestGhostHouse();
  const gm = new GhostManager(maze, ghostHouse);

  // Initially all ghosts in SPAWN
  const sprites = gm.getSprites();
  const normalSprites = sprites.filter(s => !s.type.includes('frightened') && !s.type.includes('eaten'));
  assert(normalSprites.length === 4, 'all 4 ghosts have normal sprite types initially');
}

// ── Edge Case Tests ────────────────────────────────────────────

console.log('\n🧪 Ghost — Edge Cases');

{
  // Zero dt update
  const maze = createTestMaze();
  const ghostHouse = createTestGhostHouse();
  const gm = new GhostManager(maze, ghostHouse);

  let noError = true;
  try {
    gm.update(0, 10, 10, 0, maze);
  } catch (_e) {
    noError = false;
  }
  assert(noError, 'handles zero dt without error');
}

{
  // Very large dt (shouldn't teleport through walls)
  const maze = createTestMaze();
  const ghost = new Ghost({
    id: 'blinky', color: '#ff0000', row: 1, col: 1,
    personality: 'blinky', speed: GHOST_SPEEDS.NORMAL, maze,
  });

  ghost.release();
  ghost.updateStateTimer(7.1);
  ghost.update(10, 13, 13, 0, null, maze);

  // Ghost should still be on a valid tile
  const row = Math.floor(ghost.y);
  const col = Math.floor(ghost.x);
  assert(row >= 0 && row < 15, 'ghost row valid after large dt');
  assert(col >= 0 && col < 15, 'ghost col valid after large dt');
  assert(maze[row][col] === 0, 'ghost on open tile after large dt');
}

{
  // Ghost direction reversal on frightened
  const maze = createTestMaze();
  const ghost = new Ghost({
    id: 'blinky', color: '#ff0000', row: 6, col: 7,
    personality: 'blinky', speed: GHOST_SPEEDS.NORMAL, maze,
  });

  ghost.release();
  ghost.updateStateTimer(7.1);

  // Move a bit
  ghost.update(0.1, 13, 13, 0, null, maze);

  ghost.frighten(8);

  // Direction should reverse (or be valid)
  assert(typeof ghost.direction === 'string' || typeof ghost.direction === 'number', 'ghost has direction after frighten');
}

// ── Performance Tests ──────────────────────────────────────────

console.log('\n🧪 Ghost — Performance');

{
  const maze = createTestMaze();
  const ghostHouse = createTestGhostHouse();
  const gm = new GhostManager(maze, ghostHouse);
  gm.releaseAll();

  const start = performance.now();
  for (let i = 0; i < 1000; i++) {
    gm.update(0.016, 10, 10, 0, maze);
  }
  const elapsed = performance.now() - start;

  assert(elapsed < 2000, `1000 ghost updates in ${elapsed.toFixed(1)}ms (< 2000ms)`);
}

// ── Summary ────────────────────────────────────────────────────

console.log(`\n📊 Ghost Tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
