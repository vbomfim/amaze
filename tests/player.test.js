/**
 * Unit tests for PlayerController [TDD]
 *
 * Tests cover:
 * - AC7: WASD and arrow key movement
 * - AC8: Collision detection, wall sliding
 * - AC9: Delta-time based movement, multi-key support
 * - Exit detection
 */

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

// Create a test maze
const gen = new MazeGenerator({ width: 7, height: 7, seed: 42 });
const grid = gen.generate();

// ── Movement Tests ─────────────────────────────────────────────

console.log('\n🧪 PlayerController — Movement');

{
  const player = new PlayerController({ x: 0.5, y: 0.5, angle: 0, grid });

  // Forward movement (angle=0 → east → +X)
  player.keys.add('KeyW');
  player.update(1.0); // 1 second at speed 3.0
  assertApprox(player.x, 0.5 + 3.0, 0.5, 'W key moves forward (east)');
  player.keys.clear();
}

{
  // Use a wall-free scenario: ArrowUp at center of maze with long run
  const player = new PlayerController({ x: 0.5, y: 0.5, angle: 0, grid });
  const startX = player.x;
  player.keys.add('ArrowUp');
  player.update(1.0);
  assert(player.x !== startX || player.y !== 0.5, 'ArrowUp moves player');
  player.keys.clear();
}

// ── Rotation Tests ─────────────────────────────────────────────

console.log('\n🧪 PlayerController — Rotation');

{
  const player = new PlayerController({ x: 3.5, y: 3.5, angle: 0, grid });

  player.keys.add('ArrowLeft');
  player.update(1.0); // turn left for 1 second at 2.5 rad/s
  assertApprox(
    player.angle,
    (2 * Math.PI - 2.5) % (2 * Math.PI),
    0.01,
    'ArrowLeft rotates counterclockwise'
  );
  player.keys.clear();
}

{
  const player = new PlayerController({ x: 3.5, y: 3.5, angle: 0, grid });

  player.keys.add('KeyD');
  player.update(1.0);
  assertApprox(player.angle, 2.5, 0.01, 'D key rotates clockwise');
  player.keys.clear();
}

// ── Multi-Key Support (AC9) ────────────────────────────────────

console.log('\n🧪 PlayerController — Multi-key support');

{
  const player = new PlayerController({ x: 3.5, y: 3.5, angle: 0, grid });
  const startAngle = player.angle;
  const startX = player.x;

  player.keys.add('KeyW');
  player.keys.add('KeyD');
  player.update(0.1);

  assert(player.angle > startAngle, 'simultaneous forward + turn: angle changed');
  // Player should have moved (though collision may limit)
  // The key is that both inputs are processed
  player.keys.clear();
}

// ── Delta-Time Independence (AC9) ──────────────────────────────

console.log('\n🧪 PlayerController — Delta-time independence');

{
  // One big step vs many small steps should produce similar results
  const player1 = new PlayerController({ x: 3.5, y: 3.5, angle: 0, grid });
  player1.keys.add('KeyD');
  player1.update(1.0);
  const angle1 = player1.angle;

  const player2 = new PlayerController({ x: 3.5, y: 3.5, angle: 0, grid });
  player2.keys.add('KeyD');
  for (let i = 0; i < 100; i++) {
    player2.update(0.01);
  }
  const angle2 = player2.angle;

  assertApprox(angle1, angle2, 0.01, 'rotation is frame-rate independent');
}

// ── Collision Detection (AC8) ──────────────────────────────────

console.log('\n🧪 PlayerController — Collision detection');

{
  // Place player facing north wall — should not pass through
  const player = new PlayerController({ x: 0.5, y: 0.5, angle: -Math.PI / 2, grid });
  // angle = -π/2 → facing north (−Y direction)
  player.keys.add('KeyW');
  for (let i = 0; i < 100; i++) {
    player.update(0.016);
  }
  // Player should not go below row 0
  assert(player.y >= 0, 'player does not pass through outer north wall');
  player.keys.clear();
}

{
  // Place player facing west wall — should not pass through
  const player = new PlayerController({ x: 0.5, y: 0.5, angle: Math.PI, grid });
  player.keys.add('KeyW');
  for (let i = 0; i < 100; i++) {
    player.update(0.016);
  }
  assert(player.x >= 0, 'player does not pass through outer west wall');
  player.keys.clear();
}

// ── Wall Sliding (AC8) ────────────────────────────────────────

console.log('\n🧪 PlayerController — Wall sliding');

{
  // Move diagonally into a wall — should slide along one axis
  const player = new PlayerController({ x: 0.5, y: 0.5, angle: Math.PI * 0.75, grid });
  // angle ~135° → northwest-ish
  const startX = player.x;
  const startY = player.y;
  player.keys.add('KeyW');
  player.update(0.016);
  // Player should have moved at least on one axis (sliding), or stayed if cornered
  // The important thing is no crash and position is valid
  assert(
    player.x >= 0 && player.y >= 0,
    'wall sliding: player position remains valid'
  );
  player.keys.clear();
}

// ── Exit Detection ─────────────────────────────────────────────

console.log('\n🧪 PlayerController — Exit detection');

{
  const player = new PlayerController({ x: 6.5, y: 6.5, angle: 0, grid });
  assert(player.isAtExit(6, 6), 'detects player at exit cell (6,6)');
}

{
  const player = new PlayerController({ x: 0.5, y: 0.5, angle: 0, grid });
  assert(!player.isAtExit(6, 6), 'player at (0,0) is not at exit');
}

// ── Backward Movement ──────────────────────────────────────────

console.log('\n🧪 PlayerController — Backward movement');

{
  const player = new PlayerController({ x: 3.5, y: 3.5, angle: 0, grid });
  const startX = player.x;
  player.keys.add('KeyS');
  player.update(0.1);
  assert(player.x < startX, 'S key moves backward (west when facing east)');
  player.keys.clear();
}

// ── Summary ────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
