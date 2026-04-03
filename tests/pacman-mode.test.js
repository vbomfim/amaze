/**
 * Unit tests for PacManMode — PAC-MAN Game Loop & Integration [TDD]
 *
 * Tests cover:
 * - PacManMode construction and initial state
 * - Level configuration scaling (maze size, ghost speed, frightened/scatter duration)
 * - State machine transitions (READY → PLAYING → DYING → GAME_OVER / LEVEL_CLEAR)
 * - Scoring: dots (10), pellets (50), food items, ghost eating (200→400→800→1600)
 * - Lives system: 3 lives, death decrements, extra life at 10,000
 * - Power pellet: triggers frightened, timer countdown
 * - Audio integration: correct sounds at correct events
 * - High score: save/load from localStorage
 * - Level progression: advance after all dots collected
 * - Pause/resume
 * - HUD data generation
 * - Sprite aggregation (collectibles + ghosts)
 *
 * [TDD] Red phase — tests written before implementation
 */

import {
  PacManMode,
  PACMAN_STATES,
  LEVEL_CONFIGS,
  STORAGE_KEY,
} from '../js/pacman-mode.js';

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

// ── Mocks ──────────────────────────────────────────────────────

/** Minimal canvas mock */
function createMockCanvas() {
  const ctx = {
    save: () => {},
    restore: () => {},
    fillRect: () => {},
    strokeRect: () => {},
    clearRect: () => {},
    fillText: () => {},
    measureText: () => ({ width: 0 }),
    beginPath: () => {},
    arc: () => {},
    fill: () => {},
    stroke: () => {},
    moveTo: () => {},
    lineTo: () => {},
    closePath: () => {},
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    putImageData: () => {},
    drawImage: () => {},
    createLinearGradient: () => ({
      addColorStop: () => {},
    }),
    set fillStyle(_v) {},
    get fillStyle() { return '#000'; },
    set strokeStyle(_v) {},
    get strokeStyle() { return '#000'; },
    set font(_v) {},
    get font() { return '16px sans-serif'; },
    set textAlign(_v) {},
    get textAlign() { return 'left'; },
    set textBaseline(_v) {},
    get textBaseline() { return 'top'; },
    set lineWidth(_v) {},
    get lineWidth() { return 1; },
    set globalAlpha(_v) {},
    get globalAlpha() { return 1; },
  };
  return {
    width: 1200,
    height: 675,
    getContext: () => ctx,
    style: {},
    addEventListener: () => {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1200, height: 675 }),
  };
}

/** Minimal AudioManager mock tracking calls */
function createMockAudio() {
  const calls = [];
  return {
    calls,
    init: () => calls.push('init'),
    playWakaWaka: () => calls.push('playWakaWaka'),
    playPowerUpSiren: () => calls.push('playPowerUpSiren'),
    stopPowerUpSiren: () => calls.push('stopPowerUpSiren'),
    playGhostEaten: () => calls.push('playGhostEaten'),
    playDeath: () => calls.push('playDeath'),
    playPacmanLevelClear: () => calls.push('playPacmanLevelClear'),
    playGhostSiren: () => calls.push('playGhostSiren'),
    stopGhostSiren: () => calls.push('stopGhostSiren'),
    playFootstep: () => calls.push('playFootstep'),
    playWallBump: () => calls.push('playWallBump'),
    toggleMute: () => { calls.push('toggleMute'); return false; },
    muted: false,
  };
}

/** Minimal localStorage mock */
function createMockStorage() {
  const store = {};
  return {
    getItem: (key) => store[key] ?? null,
    setItem: (key, val) => { store[key] = String(val); },
    removeItem: (key) => { delete store[key]; },
    _store: store,
  };
}

// ═══════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════

console.log('\n🎮 PacManMode — Construction & Initial State');
{
  const canvas = createMockCanvas();
  const audio = createMockAudio();
  const storage = createMockStorage();
  const pm = new PacManMode(canvas, audio, { storage });

  assert(pm.state === PACMAN_STATES.READY, 'initial state is READY');
  assert(pm.level === 1, 'starts at level 1');
  assert(pm.score === 0, 'score starts at 0');
  assert(pm.lives === 3, 'starts with 3 lives');
  assert(pm.highScore === 0, 'high score starts at 0 with empty storage');
  assert(pm.extraLifeAwarded === false, 'extra life not yet awarded');
}

console.log('\n🎮 PacManMode — High Score Load from Storage');
{
  const canvas = createMockCanvas();
  const audio = createMockAudio();
  const storage = createMockStorage();
  storage.setItem(STORAGE_KEY, JSON.stringify({ highScore: 42000 }));
  const pm = new PacManMode(canvas, audio, { storage });

  assert(pm.highScore === 42000, 'loads high score from storage');
}

console.log('\n🎮 PacManMode — Level Configuration');
{
  const canvas = createMockCanvas();
  const audio = createMockAudio();
  const pm = new PacManMode(canvas, audio, { storage: createMockStorage() });

  // Level 1
  const c1 = pm.getLevelConfig(1);
  assert(c1.mazeSize === 15, 'level 1 maze is 15×15');
  assert(c1.ghostSpeed === 2.25, 'level 1 ghost speed is 2.25');
  assert(c1.frightenedDuration === 8, 'level 1 frightened duration is 8s');
  assert(c1.scatterDuration === 7, 'level 1 scatter duration is 7s');

  // Level 2
  const c2 = pm.getLevelConfig(2);
  assert(c2.mazeSize === 17, 'level 2 maze is 17×17');
  assert(c2.ghostSpeed === 2.4, 'level 2 ghost speed is 2.4');
  assert(c2.frightenedDuration === 7, 'level 2 frightened duration is 7s');
  assert(c2.scatterDuration === 6, 'level 2 scatter duration is 6s');

  // Level 3
  const c3 = pm.getLevelConfig(3);
  assert(c3.mazeSize === 19, 'level 3 maze is 19×19');
  assert(c3.ghostSpeed === 2.55, 'level 3 ghost speed is 2.55');

  // Level 4
  const c4 = pm.getLevelConfig(4);
  assert(c4.mazeSize === 21, 'level 4 maze is 21×21');
  assert(c4.ghostSpeed === 2.7, 'level 4 ghost speed is 2.7');

  // Level 5 (5-9 bracket)
  const c5 = pm.getLevelConfig(5);
  assert(c5.mazeSize === 23, 'level 5 maze is 23×23');
  assert(c5.ghostSpeed === 2.85, 'level 5 ghost speed is 2.85');
  assert(c5.frightenedDuration === 4, 'level 5 frightened duration is 4s');
  assert(c5.scatterDuration === 3, 'level 5 scatter duration is 3s');

  // Level 7 (still 5-9 bracket)
  const c7 = pm.getLevelConfig(7);
  assert(c7.mazeSize === 23, 'level 7 maze is 23×23 (5-9 bracket)');
  assert(c7.ghostSpeed === 2.85, 'level 7 ghost speed is 2.85');

  // Level 10 (10-14 bracket)
  const c10 = pm.getLevelConfig(10);
  assert(c10.mazeSize === 25, 'level 10 maze is 25×25');
  assert(c10.ghostSpeed === 3.0, 'level 10 ghost speed is 3.0');
  assert(c10.frightenedDuration === 3, 'level 10 frightened duration is 3s');
  assert(c10.scatterDuration === 2, 'level 10 scatter duration is 2s');

  // Level 15 (15+ bracket)
  const c15 = pm.getLevelConfig(15);
  assert(c15.mazeSize === 27, 'level 15 maze is 27×27');
  assert(c15.ghostSpeed === 3.0, 'level 15 ghost speed is 3.0');
  assert(c15.frightenedDuration === 2, 'level 15 frightened duration is 2s');

  // Level 25 (still 15+ bracket)
  const c25 = pm.getLevelConfig(25);
  assert(c25.mazeSize === 27, 'level 25 stays at 27×27 max');
  assert(c25.frightenedDuration === 2, 'level 25 frightened stays at 2s');
}

console.log('\n🎮 PacManMode — buildLevel creates components');
{
  const canvas = createMockCanvas();
  const audio = createMockAudio();
  const pm = new PacManMode(canvas, audio, { storage: createMockStorage() });
  pm.buildLevel();

  assert(pm.tileMap !== null, 'tileMap created after buildLevel');
  assert(pm.player !== null, 'player created after buildLevel');
  assert(pm.ghostManager !== null, 'ghostManager created after buildLevel');
  assert(pm.collectibles !== null, 'collectibles created after buildLevel');
  assert(pm.renderer !== null, 'renderer created after buildLevel');
  assert(pm.spriteRenderer !== null, 'spriteRenderer created after buildLevel');

  // Check tileMap dimensions match level config
  const config = pm.getLevelConfig(1);
  assert(pm.tileMap.length > 0, 'tileMap has rows');
  assert(pm.tileMap[0].length > 0, 'tileMap has columns');
}

console.log('\n🎮 PacManMode — State Transitions: READY → PLAYING');
{
  const canvas = createMockCanvas();
  const audio = createMockAudio();
  const pm = new PacManMode(canvas, audio, { storage: createMockStorage() });
  pm.buildLevel();

  assert(pm.state === PACMAN_STATES.READY, 'starts in READY');

  // Simulate time passing (2 seconds for ready countdown)
  pm.stateTimer = 0;
  pm.updateState(2.1);

  assert(pm.state === PACMAN_STATES.PLAYING, 'transitions to PLAYING after 2s');
}

console.log('\n🎮 PacManMode — State Transitions: PLAYING → DYING');
{
  const canvas = createMockCanvas();
  const audio = createMockAudio();
  const pm = new PacManMode(canvas, audio, { storage: createMockStorage() });
  pm.buildLevel();
  pm.state = PACMAN_STATES.PLAYING;

  pm.handleDeath();

  assert(pm.state === PACMAN_STATES.DYING, 'transitions to DYING on death');
  assert(pm.lives === 2, 'loses one life on death');
  assert(audio.calls.includes('playDeath'), 'plays death sound');
  assert(audio.calls.includes('stopPowerUpSiren'), 'stops power siren on death');
  assert(audio.calls.includes('stopGhostSiren'), 'stops ghost siren on death');
}

console.log('\n🎮 PacManMode — State Transitions: DYING → READY (lives > 0)');
{
  const canvas = createMockCanvas();
  const audio = createMockAudio();
  const pm = new PacManMode(canvas, audio, { storage: createMockStorage() });
  pm.buildLevel();
  pm.state = PACMAN_STATES.DYING;
  pm.lives = 2;
  pm.stateTimer = 0;

  pm.updateState(1.1); // 1 second death freeze

  assert(pm.state === PACMAN_STATES.READY, 'transitions to READY after death freeze');
  assert(pm.stateTimer === 0, 'state timer reset');
}

console.log('\n🎮 PacManMode — State Transitions: DYING → GAME_OVER (lives = 0)');
{
  const canvas = createMockCanvas();
  const audio = createMockAudio();
  const storage = createMockStorage();
  const pm = new PacManMode(canvas, audio, { storage });
  pm.buildLevel();
  pm.state = PACMAN_STATES.DYING;
  pm.lives = 0;
  pm.score = 5000;
  pm.stateTimer = 0;

  pm.updateState(1.1);

  assert(pm.state === PACMAN_STATES.GAME_OVER, 'transitions to GAME_OVER when no lives');
}

console.log('\n🎮 PacManMode — State Transitions: PLAYING → LEVEL_CLEAR');
{
  const canvas = createMockCanvas();
  const audio = createMockAudio();
  const pm = new PacManMode(canvas, audio, { storage: createMockStorage() });
  pm.buildLevel();
  pm.state = PACMAN_STATES.PLAYING;

  pm.handleLevelClear();

  assert(pm.state === PACMAN_STATES.LEVEL_CLEAR, 'transitions to LEVEL_CLEAR');
  assert(audio.calls.includes('playPacmanLevelClear'), 'plays level clear sound');
  assert(audio.calls.includes('stopGhostSiren'), 'stops ghost siren on level clear');
}

console.log('\n🎮 PacManMode — State Transitions: LEVEL_CLEAR → READY (next level)');
{
  const canvas = createMockCanvas();
  const audio = createMockAudio();
  const pm = new PacManMode(canvas, audio, { storage: createMockStorage() });
  pm.buildLevel();
  pm.state = PACMAN_STATES.LEVEL_CLEAR;
  pm.level = 1;
  pm.stateTimer = 0;

  pm.updateState(3.1); // 3 second celebration

  assert(pm.state === PACMAN_STATES.READY, 'transitions to READY for next level');
  assert(pm.level === 2, 'level incremented');
  assert(pm.stateTimer === 0, 'state timer reset');
}

console.log('\n🎮 PacManMode — State Transitions: PLAYING ↔ PAUSED');
{
  const canvas = createMockCanvas();
  const audio = createMockAudio();
  const pm = new PacManMode(canvas, audio, { storage: createMockStorage() });
  pm.buildLevel();
  pm.state = PACMAN_STATES.PLAYING;

  pm.pause();
  assert(pm.state === PACMAN_STATES.PAUSED, 'pause transitions to PAUSED');
  assert(audio.calls.includes('stopGhostSiren'), 'stops ghost siren on pause');

  pm.resume();
  assert(pm.state === PACMAN_STATES.PLAYING, 'resume transitions back to PLAYING');
}

console.log('\n🎮 PacManMode — Scoring: dot collection');
{
  const canvas = createMockCanvas();
  const audio = createMockAudio();
  const pm = new PacManMode(canvas, audio, { storage: createMockStorage() });
  pm.buildLevel();
  pm.state = PACMAN_STATES.PLAYING;
  pm.score = 0;

  pm.handleCollection({ type: 'dot', points: 10, row: 1, col: 1 });

  assert(pm.score === 10, 'dot adds 10 points');
  assert(audio.calls.includes('playWakaWaka'), 'dot plays waka-waka');
}

console.log('\n🎮 PacManMode — Scoring: power pellet');
{
  const canvas = createMockCanvas();
  const audio = createMockAudio();
  const pm = new PacManMode(canvas, audio, { storage: createMockStorage() });
  pm.buildLevel();
  pm.state = PACMAN_STATES.PLAYING;
  pm.score = 0;

  pm.handleCollection({ type: 'power_pellet', points: 50, row: 1, col: 1 });

  assert(pm.score === 50, 'power pellet adds 50 points');
  assert(audio.calls.includes('playPowerUpSiren'), 'power pellet starts siren');
  assert(pm.frightenedTimer > 0, 'frightened timer started');
}

console.log('\n🎮 PacManMode — Scoring: food items');
{
  const canvas = createMockCanvas();
  const audio = createMockAudio();
  const pm = new PacManMode(canvas, audio, { storage: createMockStorage() });
  pm.buildLevel();
  pm.score = 0;

  pm.handleCollection({ type: 'cherry', points: 100, row: 1, col: 1 });
  assert(pm.score === 100, 'cherry adds 100 points');

  pm.handleCollection({ type: 'pizza', points: 200, row: 2, col: 2 });
  assert(pm.score === 300, 'pizza adds 200 points (total 300)');

  pm.handleCollection({ type: 'cupcake', points: 500, row: 3, col: 3 });
  assert(pm.score === 800, 'cupcake adds 500 points (total 800)');

  pm.handleCollection({ type: 'apple', points: 50, row: 4, col: 4 });
  assert(pm.score === 850, 'apple adds 50 points (total 850)');
}

console.log('\n🎮 PacManMode — Scoring: ghost eating sequence');
{
  const canvas = createMockCanvas();
  const audio = createMockAudio();
  const pm = new PacManMode(canvas, audio, { storage: createMockStorage() });
  pm.buildLevel();
  pm.state = PACMAN_STATES.PLAYING;
  pm.score = 0;

  // Simulate eating 4 ghosts during one power pellet
  pm.handleGhostEaten('blinky', 200);
  assert(pm.score === 200, 'first ghost eaten = 200 points');
  assert(audio.calls.filter(c => c === 'playGhostEaten').length === 1, 'ghost eaten sound plays');

  pm.handleGhostEaten('pinky', 400);
  assert(pm.score === 600, 'second ghost eaten = 400 points (total 600)');

  pm.handleGhostEaten('inky', 800);
  assert(pm.score === 1400, 'third ghost eaten = 800 points (total 1400)');

  pm.handleGhostEaten('clyde', 1600);
  assert(pm.score === 3000, 'fourth ghost eaten = 1600 points (total 3000)');
}

console.log('\n🎮 PacManMode — Lives: extra life at 10,000');
{
  const canvas = createMockCanvas();
  const audio = createMockAudio();
  const pm = new PacManMode(canvas, audio, { storage: createMockStorage() });
  pm.buildLevel();
  pm.lives = 3;
  pm.score = 9990;
  pm.extraLifeAwarded = false;

  pm.handleCollection({ type: 'dot', points: 10, row: 1, col: 1 });

  assert(pm.score === 10000, 'score reaches 10,000');
  assert(pm.lives === 4, 'extra life awarded at 10,000');
  assert(pm.extraLifeAwarded === true, 'extra life flag set');
}

console.log('\n🎮 PacManMode — Lives: only one extra life');
{
  const canvas = createMockCanvas();
  const audio = createMockAudio();
  const pm = new PacManMode(canvas, audio, { storage: createMockStorage() });
  pm.buildLevel();
  pm.lives = 4;
  pm.score = 10000;
  pm.extraLifeAwarded = true;

  pm.handleCollection({ type: 'dot', points: 10, row: 1, col: 1 });

  assert(pm.lives === 4, 'no second extra life');
}

console.log('\n🎮 PacManMode — Lives: death reduces lives');
{
  const canvas = createMockCanvas();
  const audio = createMockAudio();
  const pm = new PacManMode(canvas, audio, { storage: createMockStorage() });
  pm.buildLevel();
  pm.state = PACMAN_STATES.PLAYING;
  pm.lives = 3;

  pm.handleDeath();
  assert(pm.lives === 2, 'first death: 3 → 2 lives');

  // Reset for next death
  pm.state = PACMAN_STATES.PLAYING;
  pm.handleDeath();
  assert(pm.lives === 1, 'second death: 2 → 1 lives');

  pm.state = PACMAN_STATES.PLAYING;
  pm.handleDeath();
  assert(pm.lives === 0, 'third death: 1 → 0 lives');
}

console.log('\n🎮 PacManMode — Power Pellet Timer');
{
  const canvas = createMockCanvas();
  const audio = createMockAudio();
  const pm = new PacManMode(canvas, audio, { storage: createMockStorage() });
  pm.buildLevel();
  pm.state = PACMAN_STATES.PLAYING;

  // Level 1 frightened = 8s
  const config = pm.getLevelConfig(1);
  pm.handleCollection({ type: 'power_pellet', points: 50, row: 1, col: 1 });

  assert(pm.frightenedTimer === config.frightenedDuration, 'frightened timer set to level config duration');

  pm.updateFrightenedTimer(3);
  assert(Math.abs(pm.frightenedTimer - (config.frightenedDuration - 3)) < 0.01, 'frightened timer decrements');

  // Drain timer fully
  pm.updateFrightenedTimer(config.frightenedDuration);
  assert(pm.frightenedTimer <= 0, 'frightened timer reaches 0');
  assert(audio.calls.includes('stopPowerUpSiren'), 'siren stopped when timer expires');
}

console.log('\n🎮 PacManMode — High Score Save');
{
  const canvas = createMockCanvas();
  const audio = createMockAudio();
  const storage = createMockStorage();
  const pm = new PacManMode(canvas, audio, { storage });
  pm.score = 15000;
  pm.highScore = 10000;

  pm.saveHighScore();

  assert(pm.highScore === 15000, 'high score updated when beaten');
  const saved = JSON.parse(storage.getItem(STORAGE_KEY));
  assert(saved.highScore === 15000, 'high score persisted to storage');
}

console.log('\n🎮 PacManMode — High Score Not Updated When Lower');
{
  const canvas = createMockCanvas();
  const audio = createMockAudio();
  const storage = createMockStorage();
  storage.setItem(STORAGE_KEY, JSON.stringify({ highScore: 50000 }));
  const pm = new PacManMode(canvas, audio, { storage });
  pm.score = 5000;

  pm.saveHighScore();

  assert(pm.highScore === 50000, 'high score unchanged when not beaten');
}

console.log('\n🎮 PacManMode — HUD Data Generation');
{
  const canvas = createMockCanvas();
  const audio = createMockAudio();
  const pm = new PacManMode(canvas, audio, { storage: createMockStorage() });
  pm.buildLevel();
  pm.score = 1234;
  pm.highScore = 5000;
  pm.lives = 2;
  pm.level = 3;
  pm.frightenedTimer = 4.5;

  const hud = pm.getHUDData();

  assert(hud.score === 1234, 'HUD shows current score');
  assert(hud.highScore === 5000, 'HUD shows high score');
  assert(hud.lives === 2, 'HUD shows lives');
  assert(hud.level === 3, 'HUD shows level');
  assert(hud.frightenedTimer === 4.5, 'HUD shows frightened timer');
  assert(typeof hud.dotsRemaining === 'number', 'HUD shows dots remaining');
}

console.log('\n🎮 PacManMode — Sprite Aggregation');
{
  const canvas = createMockCanvas();
  const audio = createMockAudio();
  const pm = new PacManMode(canvas, audio, { storage: createMockStorage() });
  pm.buildLevel();

  const sprites = pm.getAllSprites();

  assert(Array.isArray(sprites), 'getAllSprites returns array');
  assert(sprites.length > 0, 'sprites array is not empty');

  // Should contain both collectible and ghost sprites
  const hasGhost = sprites.some(s => s.type && s.type.startsWith('ghost_'));
  const hasDot = sprites.some(s => s.type === 'dot');
  assert(hasGhost, 'sprites include ghost sprites');
  assert(hasDot, 'sprites include dot sprites');
}

console.log('\n🎮 PacManMode — Restart (Play Again)');
{
  const canvas = createMockCanvas();
  const audio = createMockAudio();
  const pm = new PacManMode(canvas, audio, { storage: createMockStorage() });
  pm.buildLevel();
  pm.state = PACMAN_STATES.GAME_OVER;
  pm.score = 5000;
  pm.level = 5;
  pm.lives = 0;

  pm.restart();

  assert(pm.state === PACMAN_STATES.READY, 'restart resets to READY');
  assert(pm.score === 0, 'restart resets score');
  assert(pm.level === 1, 'restart resets level');
  assert(pm.lives === 3, 'restart resets lives');
  assert(pm.extraLifeAwarded === false, 'restart resets extra life flag');
}

console.log('\n🎮 PacManMode — READY Screen Timer');
{
  const canvas = createMockCanvas();
  const audio = createMockAudio();
  const pm = new PacManMode(canvas, audio, { storage: createMockStorage() });
  pm.buildLevel();
  pm.state = PACMAN_STATES.READY;
  pm.stateTimer = 0;

  // After 1s, still READY
  pm.updateState(1.0);
  assert(pm.state === PACMAN_STATES.READY, 'still READY at 1s');

  // After 2s total, transitions to PLAYING
  pm.updateState(1.1);
  assert(pm.state === PACMAN_STATES.PLAYING, 'transitions to PLAYING at 2s');
}

console.log('\n🎮 PacManMode — DYING Screen Timer');
{
  const canvas = createMockCanvas();
  const audio = createMockAudio();
  const pm = new PacManMode(canvas, audio, { storage: createMockStorage() });
  pm.buildLevel();
  pm.state = PACMAN_STATES.DYING;
  pm.lives = 2;
  pm.stateTimer = 0;

  // After 0.5s, still DYING
  pm.updateState(0.5);
  assert(pm.state === PACMAN_STATES.DYING, 'still DYING at 0.5s');

  // After 1s total, transitions to READY
  pm.updateState(0.6);
  assert(pm.state === PACMAN_STATES.READY, 'transitions to READY after 1s freeze');
}

console.log('\n🎮 PacManMode — LEVEL_CLEAR Screen Timer');
{
  const canvas = createMockCanvas();
  const audio = createMockAudio();
  const pm = new PacManMode(canvas, audio, { storage: createMockStorage() });
  pm.buildLevel();
  pm.state = PACMAN_STATES.LEVEL_CLEAR;
  pm.level = 1;
  pm.stateTimer = 0;

  // After 1.5s, still LEVEL_CLEAR
  pm.updateState(1.5);
  assert(pm.state === PACMAN_STATES.LEVEL_CLEAR, 'still LEVEL_CLEAR at 1.5s');

  // After 3s total, transitions
  pm.updateState(1.6);
  assert(pm.state === PACMAN_STATES.READY, 'transitions to READY after 3s');
  assert(pm.level === 2, 'level advanced to 2');
}

console.log('\n🎮 PacManMode — Game Over saves high score');
{
  const canvas = createMockCanvas();
  const audio = createMockAudio();
  const storage = createMockStorage();
  const pm = new PacManMode(canvas, audio, { storage });
  pm.buildLevel();
  pm.state = PACMAN_STATES.DYING;
  pm.lives = 0;
  pm.score = 25000;
  pm.highScore = 10000;
  pm.stateTimer = 0;

  pm.updateState(1.1); // triggers GAME_OVER

  assert(pm.state === PACMAN_STATES.GAME_OVER, 'transitions to GAME_OVER');
  assert(pm.highScore === 25000, 'high score updated on game over');
  const saved = JSON.parse(storage.getItem(STORAGE_KEY));
  assert(saved.highScore === 25000, 'high score saved to storage');
}

console.log('\n🎮 PacManMode — Multiple level progressions');
{
  const canvas = createMockCanvas();
  const audio = createMockAudio();
  const pm = new PacManMode(canvas, audio, { storage: createMockStorage() });
  pm.buildLevel();

  // Progress through multiple levels
  for (let i = 1; i <= 5; i++) {
    assert(pm.level === i, `at level ${i}`);
    pm.state = PACMAN_STATES.LEVEL_CLEAR;
    pm.stateTimer = 0;
    pm.updateState(3.1);
    assert(pm.state === PACMAN_STATES.READY, `ready for level ${i + 1}`);
  }
  assert(pm.level === 6, 'advanced to level 6 after 5 clears');
}

console.log('\n🎮 PacManMode — Pause menu selection');
{
  const canvas = createMockCanvas();
  const audio = createMockAudio();
  const pm = new PacManMode(canvas, audio, { storage: createMockStorage() });
  pm.buildLevel();
  pm.state = PACMAN_STATES.PAUSED;
  pm.pauseSelection = 0;

  assert(pm.pauseSelection === 0, 'pause selection starts at 0 (Resume)');
  pm.pauseSelection = 1;
  assert(pm.pauseSelection === 1, 'can set pause selection to 1 (Restart)');
  pm.pauseSelection = 2;
  assert(pm.pauseSelection === 2, 'can set pause selection to 2 (Quit)');
}

console.log('\n🎮 PacManMode — Game Over screen selection');
{
  const canvas = createMockCanvas();
  const audio = createMockAudio();
  const pm = new PacManMode(canvas, audio, { storage: createMockStorage() });
  pm.state = PACMAN_STATES.GAME_OVER;
  pm.gameOverSelection = 0;

  assert(pm.gameOverSelection === 0, 'game over selection starts at 0 (Play Again)');
  pm.gameOverSelection = 1;
  assert(pm.gameOverSelection === 1, 'can set game over selection to 1 (Back to Menu)');
}

console.log('\n🎮 PacManMode — Death and respawn resets ghost positions');
{
  const canvas = createMockCanvas();
  const audio = createMockAudio();
  const pm = new PacManMode(canvas, audio, { storage: createMockStorage() });
  pm.buildLevel();
  pm.state = PACMAN_STATES.PLAYING;
  pm.lives = 3;

  // Death should trigger respawn sequence
  pm.handleDeath();
  assert(pm.state === PACMAN_STATES.DYING, 'in DYING state');

  // After timer, should be READY with reset positions
  pm.updateState(1.1);
  assert(pm.state === PACMAN_STATES.READY, 'back to READY for respawn');
  // Ghost manager should be reset (ghosts back in ghost house)
  const ghostSprites = pm.ghostManager.getSprites();
  assert(ghostSprites.length === 4, 'all 4 ghosts still exist after death');
}

console.log('\n🎮 PacManMode — Audio: ghost siren starts on PLAYING');
{
  const canvas = createMockCanvas();
  const audio = createMockAudio();
  const pm = new PacManMode(canvas, audio, { storage: createMockStorage() });
  pm.buildLevel();
  pm.state = PACMAN_STATES.READY;
  pm.stateTimer = 0;
  audio.calls.length = 0; // Reset call tracking

  pm.updateState(2.1); // Transition to PLAYING

  assert(pm.state === PACMAN_STATES.PLAYING, 'transitioned to PLAYING');
  assert(audio.calls.includes('playGhostSiren'), 'ghost siren starts when entering PLAYING');
}

console.log('\n🎮 PacManMode — LEVEL_CONFIGS exported');
{
  assert(Array.isArray(LEVEL_CONFIGS), 'LEVEL_CONFIGS is an array');
  assert(LEVEL_CONFIGS.length >= 7, 'LEVEL_CONFIGS has at least 7 entries');

  const first = LEVEL_CONFIGS[0];
  assert(first.level === 1, 'first config is level 1');
  assert(first.mazeSize === 15, 'first config maze is 15');
}

console.log('\n🎮 PacManMode — PACMAN_STATES exported');
{
  assert(PACMAN_STATES.READY === 'ready', 'READY state exported');
  assert(PACMAN_STATES.PLAYING === 'playing', 'PLAYING state exported');
  assert(PACMAN_STATES.DYING === 'dying', 'DYING state exported');
  assert(PACMAN_STATES.LEVEL_CLEAR === 'level_clear', 'LEVEL_CLEAR state exported');
  assert(PACMAN_STATES.GAME_OVER === 'game_over', 'GAME_OVER state exported');
  assert(PACMAN_STATES.PAUSED === 'paused', 'PAUSED state exported');
}

console.log('\n🎮 PacManMode — STORAGE_KEY exported');
{
  assert(STORAGE_KEY === 'amaze_pacman_v1', 'correct storage key');
}

console.log('\n🎮 PacManMode — Edge Case: corrupted storage');
{
  const canvas = createMockCanvas();
  const audio = createMockAudio();
  const storage = createMockStorage();
  storage.setItem(STORAGE_KEY, 'not-json');
  const pm = new PacManMode(canvas, audio, { storage });

  assert(pm.highScore === 0, 'corrupted storage defaults to 0 high score');
}

console.log('\n🎮 PacManMode — Edge Case: negative high score in storage');
{
  const canvas = createMockCanvas();
  const audio = createMockAudio();
  const storage = createMockStorage();
  storage.setItem(STORAGE_KEY, JSON.stringify({ highScore: -100 }));
  const pm = new PacManMode(canvas, audio, { storage });

  assert(pm.highScore === 0, 'negative high score defaults to 0');
}

console.log('\n🎮 PacManMode — Extra life only once');
{
  const canvas = createMockCanvas();
  const audio = createMockAudio();
  const pm = new PacManMode(canvas, audio, { storage: createMockStorage() });
  pm.buildLevel();

  // Simulate score jumping over 10k
  pm.lives = 3;
  pm.score = 0;
  pm.extraLifeAwarded = false;

  pm.addScore(10500);
  assert(pm.lives === 4, 'extra life awarded when crossing 10,000');
  assert(pm.extraLifeAwarded === true, 'extra life flag set');

  // Add more score — no second extra life
  pm.addScore(10000);
  assert(pm.lives === 4, 'no extra life above 10,000 (already awarded)');
}

console.log('\n🎮 PacManMode — respawnPlayer resets position');
{
  const canvas = createMockCanvas();
  const audio = createMockAudio();
  const pm = new PacManMode(canvas, audio, { storage: createMockStorage() });
  pm.buildLevel();

  const startX = pm.startX;
  const startY = pm.startY;

  // Move player away from start
  pm.player.x = 10;
  pm.player.y = 10;

  pm.respawnPlayer();

  assert(pm.player.x === startX, 'player X reset to start');
  assert(pm.player.y === startY, 'player Y reset to start');
}

// ── Summary ────────────────────────────────────────────────────
console.log(`\n📊 PacManMode Tests: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
