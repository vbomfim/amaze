/**
 * Unit tests for TouchInput, VirtualJoystick, and mobile utilities [TDD]
 *
 * Tests cover:
 * - isTouchDevice() feature detection
 * - VirtualJoystick rendering and state management
 * - TouchInput dual-joystick tracking (left = movement, right = look)
 * - Multi-touch support (2 simultaneous fingers)
 * - Dynamic joystick positioning
 * - Normalized output ranges (-1 to 1)
 * - Fade-out timer after release
 * - PlayerController.setTouchInput() integration
 * - Orientation detection helpers
 * - Mobile canvas sizing
 * - Responsive UI scaling utilities
 */

import { PlayerController } from '../js/player.js';
import {
  isTouchDevice,
  TouchInput,
  VirtualJoystick,
  isPortrait,
  getResponsiveButtonSize,
  getResponsiveFontSize,
  getMobileRayScale,
  getMobileSpriteMaxDist,
} from '../js/touch-input.js';

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

// ── isTouchDevice() Tests ──────────────────────────────────────

console.log('\n🧪 isTouchDevice — Feature Detection');

{
  // In Node.js, neither 'ontouchstart' in window nor navigator.maxTouchPoints exist
  // so isTouchDevice() should return false
  const result = isTouchDevice();
  assert(result === false, 'returns false in Node.js environment (no touch APIs)');
}

// ── VirtualJoystick Tests ──────────────────────────────────────

console.log('\n🧪 VirtualJoystick — Construction');

{
  const joystick = new VirtualJoystick();
  assert(joystick.active === false, 'initially inactive');
  assert(joystick.centerX === 0, 'initial centerX is 0');
  assert(joystick.centerY === 0, 'initial centerY is 0');
  assert(joystick.thumbX === 0, 'initial thumbX is 0');
  assert(joystick.thumbY === 0, 'initial thumbY is 0');
  assertApprox(joystick.dx, 0, 0.001, 'initial dx is 0');
  assertApprox(joystick.dy, 0, 0.001, 'initial dy is 0');
  assert(joystick.fadeAlpha === 0, 'initial fadeAlpha is 0');
}

console.log('\n🧪 VirtualJoystick — Activation');

{
  const joystick = new VirtualJoystick();

  joystick.activate(100, 200);
  assert(joystick.active === true, 'active after activate()');
  assert(joystick.centerX === 100, 'centerX set to touch start X');
  assert(joystick.centerY === 200, 'centerY set to touch start Y');
  assert(joystick.thumbX === 100, 'thumbX starts at center');
  assert(joystick.thumbY === 200, 'thumbY starts at center');
  assert(joystick.fadeAlpha === 1, 'fadeAlpha set to 1 on activate');
}

console.log('\n🧪 VirtualJoystick — Thumb Movement & Normalization');

{
  const joystick = new VirtualJoystick({ radius: 50 });

  joystick.activate(200, 300);

  // Move thumb to the right, within radius
  joystick.updateThumb(230, 300);
  assertApprox(joystick.dx, 0.6, 0.01, 'dx normalized correctly within radius (30/50 = 0.6)');
  assertApprox(joystick.dy, 0, 0.01, 'dy is 0 when thumb moves only horizontally');

  // Move thumb upward
  joystick.updateThumb(200, 275);
  assertApprox(joystick.dx, 0, 0.01, 'dx is 0 when thumb moves only vertically');
  assertApprox(joystick.dy, -0.5, 0.01, 'dy negative when thumb moves up (25/50 = -0.5)');

  // Move thumb diagonally
  joystick.updateThumb(250, 350);
  // distance = sqrt(50^2 + 50^2) = ~70.7, exceeds radius=50, so clamped
  const expectedLen = 1.0; // clamped to radius
  const actualLen = Math.sqrt(joystick.dx * joystick.dx + joystick.dy * joystick.dy);
  assertApprox(actualLen, expectedLen, 0.01, 'thumb clamped to radius when exceeding');
}

console.log('\n🧪 VirtualJoystick — Clamping to Radius');

{
  const joystick = new VirtualJoystick({ radius: 40 });

  joystick.activate(100, 100);

  // Move WAY beyond radius
  joystick.updateThumb(300, 100);
  assertApprox(joystick.dx, 1.0, 0.01, 'dx clamped to 1.0 when far right');
  assertApprox(joystick.dy, 0, 0.01, 'dy stays 0 for horizontal move');

  // Thumb position should be clamped too
  assertApprox(joystick.thumbX, 140, 0.5, 'thumbX clamped to center + radius');
  assertApprox(joystick.thumbY, 100, 0.5, 'thumbY unchanged for horizontal move');
}

console.log('\n🧪 VirtualJoystick — Deactivation & Fade');

{
  const joystick = new VirtualJoystick();

  joystick.activate(100, 200);
  assert(joystick.active === true, 'active before deactivate');

  joystick.deactivate();
  assert(joystick.active === false, 'inactive after deactivate');
  assertApprox(joystick.dx, 0, 0.001, 'dx reset to 0 after deactivate');
  assertApprox(joystick.dy, 0, 0.001, 'dy reset to 0 after deactivate');

  // Fade should still have alpha (fades over time, not instant)
  assert(joystick.fadeAlpha > 0, 'fadeAlpha > 0 immediately after deactivate (fading)');

  // Simulate fade update
  joystick.updateFade(0.5); // 0.5s should fully fade (fadeTime = 0.5)
  assertApprox(joystick.fadeAlpha, 0, 0.01, 'fadeAlpha reaches 0 after fadeTime elapsed');
}

console.log('\n🧪 VirtualJoystick — Fade Timing');

{
  const joystick = new VirtualJoystick({ fadeTime: 1.0 });

  joystick.activate(100, 100);
  joystick.deactivate();

  joystick.updateFade(0.25);
  assertApprox(joystick.fadeAlpha, 0.75, 0.05, 'fadeAlpha at 75% after 0.25s of 1.0s fade');

  joystick.updateFade(0.25);
  assertApprox(joystick.fadeAlpha, 0.5, 0.05, 'fadeAlpha at 50% after 0.5s of 1.0s fade');

  joystick.updateFade(0.5);
  assertApprox(joystick.fadeAlpha, 0, 0.05, 'fadeAlpha at 0% after 1.0s of 1.0s fade');
}

// ── TouchInput Tests ───────────────────────────────────────────

console.log('\n🧪 TouchInput — Construction');

{
  const touchInput = new TouchInput({ canvasWidth: 800, canvasHeight: 450 });
  assert(touchInput.moveJoystick instanceof VirtualJoystick, 'has moveJoystick (VirtualJoystick)');
  assert(touchInput.lookJoystick instanceof VirtualJoystick, 'has lookJoystick (VirtualJoystick)');
  assert(touchInput.isActive === false, 'initially not active');
}

console.log('\n🧪 TouchInput — Left Half = Movement Joystick');

{
  const touchInput = new TouchInput({ canvasWidth: 800, canvasHeight: 450 });

  // Simulate touchstart on left half of screen (x=100, y=300)
  touchInput.handleTouchStart([
    { identifier: 0, clientX: 100, clientY: 300 },
  ]);

  assert(touchInput.moveJoystick.active === true, 'left touch activates move joystick');
  assert(touchInput.lookJoystick.active === false, 'left touch does NOT activate look joystick');
  assert(touchInput.isActive === true, 'touchInput is active after touch');

  // Move finger right and forward (up on screen = forward in game)
  touchInput.handleTouchMove([
    { identifier: 0, clientX: 130, clientY: 270 },
  ]);

  assert(touchInput.moveJoystick.dx > 0, 'moving right produces positive moveX');
  assert(touchInput.moveJoystick.dy < 0, 'moving up produces negative moveY (screen coords)');
}

console.log('\n🧪 TouchInput — Right Half = Look Joystick');

{
  const touchInput = new TouchInput({ canvasWidth: 800, canvasHeight: 450 });

  // Simulate touchstart on right half (x=600, y=300)
  touchInput.handleTouchStart([
    { identifier: 1, clientX: 600, clientY: 300 },
  ]);

  assert(touchInput.lookJoystick.active === true, 'right touch activates look joystick');
  assert(touchInput.moveJoystick.active === false, 'right touch does NOT activate move joystick');

  // Move finger right (look right)
  touchInput.handleTouchMove([
    { identifier: 1, clientX: 640, clientY: 300 },
  ]);

  assert(touchInput.lookJoystick.dx > 0, 'moving right produces positive lookX');
}

console.log('\n🧪 TouchInput — Multi-Touch (Two Fingers)');

{
  const touchInput = new TouchInput({ canvasWidth: 800, canvasHeight: 450 });

  // Touch both halves simultaneously
  touchInput.handleTouchStart([
    { identifier: 0, clientX: 150, clientY: 300 },
  ]);
  touchInput.handleTouchStart([
    { identifier: 1, clientX: 600, clientY: 300 },
  ]);

  assert(touchInput.moveJoystick.active === true, 'move joystick active with dual touch');
  assert(touchInput.lookJoystick.active === true, 'look joystick active with dual touch');

  // Move both fingers
  touchInput.handleTouchMove([
    { identifier: 0, clientX: 180, clientY: 270 },
  ]);
  touchInput.handleTouchMove([
    { identifier: 1, clientX: 640, clientY: 300 },
  ]);

  assert(touchInput.moveJoystick.dx > 0, 'move joystick responds to left finger');
  assert(touchInput.lookJoystick.dx > 0, 'look joystick responds to right finger');
}

console.log('\n🧪 TouchInput — Touch End');

{
  const touchInput = new TouchInput({ canvasWidth: 800, canvasHeight: 450 });

  // Start touch
  touchInput.handleTouchStart([
    { identifier: 0, clientX: 100, clientY: 300 },
  ]);
  assert(touchInput.moveJoystick.active === true, 'move active before touchend');

  // End touch
  touchInput.handleTouchEnd([
    { identifier: 0 },
  ]);
  assert(touchInput.moveJoystick.active === false, 'move inactive after touchend');
  assertApprox(touchInput.moveJoystick.dx, 0, 0.001, 'moveX reset after touchend');
}

console.log('\n🧪 TouchInput — Touch Cancel');

{
  const touchInput = new TouchInput({ canvasWidth: 800, canvasHeight: 450 });

  touchInput.handleTouchStart([
    { identifier: 0, clientX: 100, clientY: 300 },
  ]);

  touchInput.handleTouchCancel([
    { identifier: 0 },
  ]);

  assert(touchInput.moveJoystick.active === false, 'move deactivated on cancel');
}

console.log('\n🧪 TouchInput — getInput() Normalized Output');

{
  const touchInput = new TouchInput({ canvasWidth: 800, canvasHeight: 450 });

  // No touch = zero input
  const idle = touchInput.getInput();
  assertApprox(idle.moveX, 0, 0.001, 'moveX is 0 when no touch');
  assertApprox(idle.moveY, 0, 0.001, 'moveY is 0 when no touch');
  assertApprox(idle.lookX, 0, 0.001, 'lookX is 0 when no touch');

  // Activate and move
  touchInput.handleTouchStart([
    { identifier: 0, clientX: 100, clientY: 300 },
  ]);
  touchInput.handleTouchMove([
    { identifier: 0, clientX: 150, clientY: 260 },
  ]);

  const input = touchInput.getInput();
  assert(input.moveX >= -1 && input.moveX <= 1, 'moveX normalized to [-1, 1]');
  assert(input.moveY >= -1 && input.moveY <= 1, 'moveY normalized to [-1, 1]');
  assert(input.lookX >= -1 && input.lookX <= 1, 'lookX normalized to [-1, 1]');
}

console.log('\n🧪 TouchInput — Dynamic Joystick Positioning');

{
  const touchInput = new TouchInput({ canvasWidth: 800, canvasHeight: 450 });

  // Touch at different positions on left half
  touchInput.handleTouchStart([
    { identifier: 0, clientX: 50, clientY: 150 },
  ]);
  assert(touchInput.moveJoystick.centerX === 50, 'joystick center at touch X');
  assert(touchInput.moveJoystick.centerY === 150, 'joystick center at touch Y');

  touchInput.handleTouchEnd([{ identifier: 0 }]);

  // Touch at different position
  touchInput.handleTouchStart([
    { identifier: 0, clientX: 300, clientY: 400 },
  ]);
  assert(touchInput.moveJoystick.centerX === 300, 'joystick re-centers on new touch');
  assert(touchInput.moveJoystick.centerY === 400, 'joystick re-centers on new touch Y');
}

console.log('\n🧪 TouchInput — Ignores Third Finger');

{
  const touchInput = new TouchInput({ canvasWidth: 800, canvasHeight: 450 });

  touchInput.handleTouchStart([
    { identifier: 0, clientX: 100, clientY: 300 },
  ]);
  touchInput.handleTouchStart([
    { identifier: 1, clientX: 600, clientY: 300 },
  ]);

  // Third finger should be ignored
  touchInput.handleTouchStart([
    { identifier: 2, clientX: 400, clientY: 200 },
  ]);

  assert(touchInput.moveJoystick.active === true, 'move still active');
  assert(touchInput.lookJoystick.active === true, 'look still active');
  // No crash from third finger
  assert(true, 'third finger does not crash');
}

// ── PlayerController.setTouchInput() Tests ────────────────────

console.log('\n🧪 PlayerController — setTouchInput()');

{
  // Create a small open tile map for movement testing
  const tileMap = [
    [1, 1, 1, 1, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 1, 1, 1, 1],
  ];

  const player = new PlayerController({ x: 2.5, y: 2.5, angle: 0, tileMap });

  // Set touch input for forward movement
  player.setTouchInput(0, -1, 0); // moveX=0, moveY=-1 (forward), lookX=0
  const startX = player.x;
  const startY = player.y;

  player.update(0.1); // 100ms

  // With angle=0 (facing east) and moveY=-1 (forward), player should move east (+x)
  assert(player.x > startX || player.y !== startY, 'touch input causes movement');
}

{
  const tileMap = [
    [1, 1, 1, 1, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 1, 1, 1, 1],
  ];

  const player = new PlayerController({ x: 2.5, y: 2.5, angle: 0, tileMap });

  // Touch rotation
  player.setTouchInput(0, 0, 0.5); // lookX=0.5, turn right
  const startAngle = player.angle;
  player.update(0.1);

  assert(player.angle !== startAngle, 'lookX causes rotation');
  assert(player.angle > startAngle, 'positive lookX rotates clockwise');
}

{
  const tileMap = [
    [1, 1, 1, 1, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 1, 1, 1, 1],
  ];

  const player = new PlayerController({ x: 2.5, y: 2.5, angle: 0, tileMap });

  // Clear touch input = no movement from touch
  player.setTouchInput(0, 0, 0);
  const startX = player.x;
  const startAngle = player.angle;
  player.update(0.1);

  assertApprox(player.x, startX, 0.001, 'zero touch input = no movement');
  assertApprox(player.angle, startAngle, 0.001, 'zero touch input = no rotation');
}

{
  const tileMap = [
    [1, 1, 1, 1, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 1, 1, 1, 1],
  ];

  const player = new PlayerController({ x: 2.5, y: 2.5, angle: 0, tileMap });

  // Keyboard still works when no touch input active
  player.keys.add('KeyW');
  const startX = player.x;
  player.update(0.1);

  assert(player.x > startX, 'keyboard still works alongside touch system');
  player.keys.clear();
}

{
  const tileMap = [
    [1, 1, 1, 1, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 1, 1, 1, 1],
  ];

  const player = new PlayerController({ x: 2.5, y: 2.5, angle: 0, tileMap });

  // Touch input overrides keyboard when active
  player.setTouchInput(0, -1, 0); // forward
  player.keys.add('KeyS'); // backward via keyboard

  const startX = player.x;
  player.update(0.1);

  // Touch should take precedence — moving forward
  assert(player.x > startX, 'touch input overrides keyboard when active');
  player.keys.clear();
  player.clearTouchInput();
}

{
  const tileMap = [
    [1, 1, 1, 1, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 1, 1, 1, 1],
  ];

  const player = new PlayerController({ x: 2.5, y: 2.5, angle: 0, tileMap });

  // clearTouchInput resets to keyboard mode
  player.setTouchInput(0.5, -0.5, 0.3);
  player.clearTouchInput();

  assert(player._touchMoveX === 0, 'clearTouchInput resets moveX');
  assert(player._touchMoveY === 0, 'clearTouchInput resets moveY');
  assert(player._touchLookX === 0, 'clearTouchInput resets lookX');
  assert(player._touchActive === false, 'clearTouchInput sets touch inactive');
}

// ── Responsive UI Helpers ─────────────────────────────────────

console.log('\n🧪 Responsive UI — getResponsiveFontSize');

{
  // On a small mobile screen (375px height)
  const small = getResponsiveFontSize(375);
  assert(small >= 12, 'font size >= 12px minimum on small screen');

  // On a desktop screen (675px height)
  const desktop = getResponsiveFontSize(675);
  assert(desktop >= small, 'desktop font size >= mobile font size');

  // On very large screen
  const large = getResponsiveFontSize(1080);
  assert(large >= desktop, 'large screen font size >= desktop');
}

console.log('\n🧪 Responsive UI — getResponsiveButtonSize');

{
  // Small mobile screen (375px wide)
  const small = getResponsiveButtonSize(375, 667);
  assert(small.width <= 375, 'button width fits within small screen');
  assert(small.height >= 44, 'button height >= 44px on mobile (touch target)');

  // Desktop screen
  const desktop = getResponsiveButtonSize(1200, 675);
  assert(desktop.width <= 260, 'desktop button width capped at 260px');
  assert(desktop.height >= 36, 'desktop button height >= 36px');
}

console.log('\n🧪 Responsive UI — getMobileRayScale');

{
  // Non-touch = scale 1
  const desktopScale = getMobileRayScale(false);
  assert(desktopScale === 1, 'desktop ray scale = 1');

  // Touch device = scale 2
  const mobileScale = getMobileRayScale(true);
  assert(mobileScale === 2, 'mobile ray scale = 2');
}

console.log('\n🧪 Responsive UI — getMobileSpriteMaxDist');

{
  const desktopDist = getMobileSpriteMaxDist(false);
  assert(desktopDist === 24, 'desktop MAX_SPRITE_DIST = 24');

  const mobileDist = getMobileSpriteMaxDist(true);
  assert(mobileDist === 16, 'mobile MAX_SPRITE_DIST = 16');
}

// ── isPortrait Tests ──────────────────────────────────────────

console.log('\n🧪 isPortrait — Orientation Detection');

{
  assert(isPortrait(375, 667) === true, '375x667 is portrait');
  assert(isPortrait(667, 375) === false, '667x375 is landscape');
  assert(isPortrait(400, 400) === false, 'square is not portrait');
  assert(isPortrait(1024, 768) === false, '1024x768 is landscape');
  assert(isPortrait(768, 1024) === true, '768x1024 is portrait');
}

// ── Summary ───────────────────────────────────────────────────

console.log('\n──────────────────────────────────────────────────');
console.log(`Touch Input Tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
