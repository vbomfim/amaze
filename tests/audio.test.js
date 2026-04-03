/**
 * Unit tests for AudioManager [TDD]
 *
 * Tests cover:
 * - Lazy AudioContext initialization
 * - Mute toggle and state persistence
 * - All maze-mode sound methods exist and are callable
 * - All PAC-MAN mode sound methods exist and are callable
 * - Sounds respect mute state
 * - Settings integration with GameStateManager
 */

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

// ── Mock AudioContext for Node.js ──────────────────────────────

class MockGainNode {
  constructor() {
    this.gain = { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} };
    this._connected = null;
  }
  connect(dest) { this._connected = dest; return dest; }
  disconnect() { this._connected = null; }
}

class MockOscillatorNode {
  constructor() {
    this.type = 'sine';
    this.frequency = { value: 440, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} };
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
    this.state = 'suspended';
    this.currentTime = 0;
    this.destination = {};
    this._resumed = false;
  }
  createOscillator() { return new MockOscillatorNode(); }
  createGain() { return new MockGainNode(); }
  resume() { this._resumed = true; this.state = 'running'; return Promise.resolve(); }
}

// ── Construction Tests ─────────────────────────────────────────

console.log('\n🧪 AudioManager — Construction');

{
  const am = new AudioManager({ AudioContextClass: MockAudioContext });
  assert(am !== null, 'creates AudioManager instance');
  assert(am.muted === false, 'defaults to unmuted');
  assert(am._ctx === null, 'AudioContext is null before init (lazy)');
}

// ── Lazy Initialization ────────────────────────────────────────

console.log('\n🧪 AudioManager — Lazy AudioContext initialization');

{
  const am = new AudioManager({ AudioContextClass: MockAudioContext });
  am.init();
  assert(am._ctx !== null, 'AudioContext created after init()');
  assert(am._ctx instanceof MockAudioContext, 'uses provided AudioContextClass');
}

{
  const am = new AudioManager({ AudioContextClass: MockAudioContext });
  am.init();
  const firstCtx = am._ctx;
  am.init();
  assert(am._ctx === firstCtx, 'double init() reuses same AudioContext');
}

// ── Mute Toggle ────────────────────────────────────────────────

console.log('\n🧪 AudioManager — Mute toggle');

{
  const am = new AudioManager({ AudioContextClass: MockAudioContext });
  assert(am.muted === false, 'starts unmuted');

  am.toggleMute();
  assert(am.muted === true, 'toggleMute() sets muted to true');

  am.toggleMute();
  assert(am.muted === false, 'toggleMute() again sets muted to false');
}

{
  const am = new AudioManager({ AudioContextClass: MockAudioContext });
  const result = am.toggleMute();
  assert(result === true, 'toggleMute() returns new muted state (true)');
  const result2 = am.toggleMute();
  assert(result2 === false, 'toggleMute() returns new muted state (false)');
}

// ── Muted state setter ─────────────────────────────────────────

console.log('\n🧪 AudioManager — Muted property setter');

{
  const am = new AudioManager({ AudioContextClass: MockAudioContext });
  am.muted = true;
  assert(am.muted === true, 'can set muted to true directly');
  am.muted = false;
  assert(am.muted === false, 'can set muted to false directly');
}

// ── Maze Mode Sounds Exist ─────────────────────────────────────

console.log('\n🧪 AudioManager — Maze mode sound methods exist');

{
  const am = new AudioManager({ AudioContextClass: MockAudioContext });
  am.init();

  assert(typeof am.playFootstep === 'function', 'playFootstep method exists');
  assert(typeof am.playWallBump === 'function', 'playWallBump method exists');
  assert(typeof am.playHintActivate === 'function', 'playHintActivate method exists');
  assert(typeof am.playLevelComplete === 'function', 'playLevelComplete method exists');
  assert(typeof am.playPortalProximity === 'function', 'playPortalProximity method exists');
}

// ── PAC-MAN Mode Sounds Exist ──────────────────────────────────

console.log('\n🧪 AudioManager — PAC-MAN mode sound methods exist');

{
  const am = new AudioManager({ AudioContextClass: MockAudioContext });
  am.init();

  assert(typeof am.playWakaWaka === 'function', 'playWakaWaka method exists');
  assert(typeof am.playPowerUpSiren === 'function', 'playPowerUpSiren method exists');
  assert(typeof am.playGhostEaten === 'function', 'playGhostEaten method exists');
  assert(typeof am.playDeath === 'function', 'playDeath method exists');
  assert(typeof am.playPacmanLevelClear === 'function', 'playPacmanLevelClear method exists');
  assert(typeof am.playGhostSiren === 'function', 'playGhostSiren method exists');
  assert(typeof am.stopPowerUpSiren === 'function', 'stopPowerUpSiren method exists');
  assert(typeof am.stopGhostSiren === 'function', 'stopGhostSiren method exists');
}

// ── Sounds respect mute state ──────────────────────────────────

console.log('\n🧪 AudioManager — Sounds respect mute state');

{
  const am = new AudioManager({ AudioContextClass: MockAudioContext });
  am.init();
  am.muted = true;

  // These should not throw even when muted — they just don't play
  let threw = false;
  try {
    am.playFootstep();
    am.playWallBump();
    am.playHintActivate();
    am.playLevelComplete();
    am.playPortalProximity();
    am.playWakaWaka();
    am.playGhostEaten();
    am.playDeath();
    am.playPacmanLevelClear();
  } catch (_e) {
    threw = true;
  }
  assert(!threw, 'all sound methods are safe to call when muted');
}

// ── Sounds safe before init ────────────────────────────────────

console.log('\n🧪 AudioManager — Sounds safe before init');

{
  const am = new AudioManager({ AudioContextClass: MockAudioContext });
  // Do NOT call init()

  let threw = false;
  try {
    am.playFootstep();
    am.playWallBump();
    am.playHintActivate();
    am.playLevelComplete();
    am.playPortalProximity();
    am.playWakaWaka();
    am.playGhostEaten();
    am.playDeath();
    am.playPacmanLevelClear();
  } catch (_e) {
    threw = true;
  }
  assert(!threw, 'all sound methods are safe to call before init()');
}

// ── Sounds play when unmuted and initialized ───────────────────

console.log('\n🧪 AudioManager — Sounds play when unmuted and initialized');

{
  const am = new AudioManager({ AudioContextClass: MockAudioContext });
  am.init();
  am.muted = false;

  // These should run without error and actually try to play
  let threw = false;
  try {
    am.playFootstep();
    am.playWallBump();
    am.playHintActivate();
    am.playLevelComplete();
    am.playPortalProximity();
    am.playWakaWaka();
    am.playGhostEaten();
    am.playDeath();
    am.playPacmanLevelClear();
  } catch (_e) {
    threw = true;
  }
  assert(!threw, 'all sound methods execute without error when unmuted');
}

// ── Looping sounds start/stop ──────────────────────────────────

console.log('\n🧪 AudioManager — Looping sounds start/stop');

{
  const am = new AudioManager({ AudioContextClass: MockAudioContext });
  am.init();

  let threw = false;
  try {
    am.playPowerUpSiren();
    am.stopPowerUpSiren();
    am.playGhostSiren();
    am.stopGhostSiren();
  } catch (_e) {
    threw = true;
  }
  assert(!threw, 'looping sounds can be started and stopped');
}

{
  const am = new AudioManager({ AudioContextClass: MockAudioContext });
  am.init();

  // Double stop should not throw
  let threw = false;
  try {
    am.stopPowerUpSiren();
    am.stopGhostSiren();
  } catch (_e) {
    threw = true;
  }
  assert(!threw, 'stopping non-playing loops does not throw');
}

// ── Settings integration ───────────────────────────────────────

console.log('\n🧪 AudioManager — Settings integration');

{
  const am = new AudioManager({ AudioContextClass: MockAudioContext });
  am.muted = true;
  assert(am.muted === true, 'muted state readable for settings save');
}

{
  // Construct with initial muted state
  const am = new AudioManager({ AudioContextClass: MockAudioContext, muted: true });
  assert(am.muted === true, 'accepts initial muted state from constructor');
}

{
  const am = new AudioManager({ AudioContextClass: MockAudioContext, muted: false });
  assert(am.muted === false, 'accepts initial muted=false from constructor');
}

// ── Resume on init ─────────────────────────────────────────────

console.log('\n🧪 AudioManager — Resumes suspended context on init');

{
  const am = new AudioManager({ AudioContextClass: MockAudioContext });
  am.init();
  assert(am._ctx._resumed === true, 'calls resume() on AudioContext');
}

// ── Summary ────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`AudioManager Tests: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
