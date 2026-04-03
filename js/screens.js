/**
 * Screens — Canvas-rendered UI screens for game menus and overlays.
 *
 * All screens are drawn on the canvas with no DOM elements.
 * Dark theme, centered layout, keyboard-navigable.
 *
 * Screens: Start, LevelComplete, Pause, LevelSelect, Victory
 *
 * [CLEAN-CODE] [SOLID] — Single responsibility: screen rendering only
 */

/** Shared visual constants matching the game's dark wireframe aesthetic */
const SCREEN_COLORS = {
  background: '#0d0d2b',
  primary: '#00cccc',
  primaryDim: 'rgba(0, 204, 204, 0.6)',
  accent: '#ffcc00',
  accentDim: 'rgba(255, 204, 0, 0.6)',
  text: '#cccccc',
  textDim: '#666666',
  overlay: 'rgba(0, 0, 0, 0.75)',
  buttonBg: 'rgba(0, 204, 204, 0.1)',
  buttonBorder: '#00cccc',
  buttonHighlight: 'rgba(0, 204, 204, 0.3)',
};

/**
 * Draw a centered text line.
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} x — center X
 * @param {number} y — baseline Y
 * @param {string} color
 * @param {string} font
 */
function drawCenteredText(ctx, text, x, y, color, font) {
  ctx.save();
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
  ctx.restore();
}

/**
 * Draw a button-like text element.
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} cx — center X
 * @param {number} cy — center Y
 * @param {boolean} selected — if true, draw highlighted
 * @param {boolean} enabled — if false, draw dimmed
 */
function drawButton(ctx, text, cx, cy, selected, enabled) {
  const width = 260;
  const height = 36;
  const x = cx - width / 2;
  const y = cy - height / 2;

  ctx.save();
  ctx.fillStyle = selected ? SCREEN_COLORS.buttonHighlight : SCREEN_COLORS.buttonBg;
  ctx.fillRect(x, y, width, height);

  ctx.strokeStyle = selected ? SCREEN_COLORS.primary : SCREEN_COLORS.primaryDim;
  ctx.lineWidth = selected ? 2 : 1;
  ctx.strokeRect(x, y, width, height);

  ctx.font = '16px monospace';
  ctx.fillStyle = enabled ? (selected ? SCREEN_COLORS.primary : SCREEN_COLORS.text) : SCREEN_COLORS.textDim;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, cy);
  ctx.restore();
}

// ── Start Screen [AC18] ─────────────────────────────────────

/**
 * Render the start/menu screen.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w — canvas width
 * @param {number} h — canvas height
 * @param {{ highScore: number, canContinue: boolean, canLevelSelect: boolean, selectedIndex: number }} data
 */
function drawStartScreen(ctx, w, h, data) {
  const cx = w / 2;

  // Background
  ctx.fillStyle = SCREEN_COLORS.background;
  ctx.fillRect(0, 0, w, h);

  // Title
  drawCenteredText(ctx, '🐭 aMaze', cx, h * 0.2, SCREEN_COLORS.primary, 'bold 56px monospace');

  // Subtitle
  drawCenteredText(ctx, 'Find your way through the maze', cx, h * 0.2 + 50, SCREEN_COLORS.textDim, '14px monospace');

  // Menu buttons
  const buttonStartY = h * 0.42;
  const buttonSpacing = 50;
  let btnIdx = 0;

  drawButton(ctx, 'New Game (N / Enter)', cx, buttonStartY + buttonSpacing * btnIdx, data.selectedIndex === btnIdx, true);
  btnIdx++;

  drawButton(ctx, 'Continue (C)', cx, buttonStartY + buttonSpacing * btnIdx, data.selectedIndex === btnIdx, data.canContinue);
  btnIdx++;

  if (data.canLevelSelect) {
    drawButton(ctx, 'Level Select (L)', cx, buttonStartY + buttonSpacing * btnIdx, data.selectedIndex === btnIdx, true);
    btnIdx++;
  }

  // Instructions
  const instrY = h * 0.75;
  const instrLines = [
    '↑↓←→ or WASD — Move',
    'H — Hint  ·  M — Minimap  ·  ESC — Pause',
  ];
  instrLines.forEach((line, i) => {
    drawCenteredText(ctx, line, cx, instrY + i * 22, SCREEN_COLORS.textDim, '13px monospace');
  });

  // High score
  if (data.highScore > 0) {
    drawCenteredText(ctx, `High Score: ${data.highScore.toLocaleString()}`, cx, h * 0.9, SCREEN_COLORS.accent, '16px monospace');
  }
}

// ── Level Complete Screen [AC14] ────────────────────────────

/**
 * Render the level complete overlay.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w
 * @param {number} h
 * @param {{ level, time, hintsUsed, score, totalScore, breakdown }} result
 */
function drawLevelCompleteScreen(ctx, w, h, result) {
  const cx = w / 2;

  // Semi-transparent overlay
  ctx.fillStyle = SCREEN_COLORS.overlay;
  ctx.fillRect(0, 0, w, h);

  // Header
  drawCenteredText(ctx, '✨ Level Complete!', cx, h * 0.18, SCREEN_COLORS.accent, 'bold 40px monospace');

  // Level number
  drawCenteredText(ctx, `Level ${result.level}`, cx, h * 0.28, SCREEN_COLORS.primary, '20px monospace');

  // Stats
  const statsY = h * 0.38;
  const lineH = 28;

  // Use pre-formatted time string from completeLevel result [Fix 9]
  const timeStr = result.timeStr || (() => {
    const minutes = Math.floor(result.time / 60);
    const seconds = Math.floor(result.time % 60);
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  })();

  drawCenteredText(ctx, `Time: ${timeStr}`, cx, statsY, SCREEN_COLORS.text, '16px monospace');
  drawCenteredText(ctx, `Hints Used: ${result.hintsUsed}`, cx, statsY + lineH, SCREEN_COLORS.text, '16px monospace');

  // Score breakdown
  const breakdownY = statsY + lineH * 3;
  const bd = result.breakdown;
  drawCenteredText(ctx, 'Score Breakdown', cx, breakdownY, SCREEN_COLORS.primary, 'bold 16px monospace');
  drawCenteredText(ctx, `Base: ${bd.basePoints}  ×  Level: ${bd.levelMultiplier.toFixed(1)}`, cx, breakdownY + lineH, SCREEN_COLORS.textDim, '14px monospace');
  drawCenteredText(ctx, `Hint Factor: ${bd.hintFactor.toFixed(2)}  ×  Time Bonus: ${bd.timeBonus.toFixed(2)}`, cx, breakdownY + lineH * 2, SCREEN_COLORS.textDim, '14px monospace');

  // Final score
  drawCenteredText(ctx, `Level Score: ${result.score.toLocaleString()}`, cx, breakdownY + lineH * 3.5, SCREEN_COLORS.accent, 'bold 22px monospace');
  drawCenteredText(ctx, `Total Score: ${result.totalScore.toLocaleString()}`, cx, breakdownY + lineH * 4.5, SCREEN_COLORS.primary, '18px monospace');

  // Continue prompt
  drawCenteredText(ctx, 'Press Enter or Space for Next Level →', cx, h * 0.88, SCREEN_COLORS.primaryDim, '15px monospace');
}

// ── Pause Menu [AC19] ───────────────────────────────────────

/**
 * Render the pause overlay.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w
 * @param {number} h
 * @param {{ selectedIndex: number }} data
 */
function drawPauseScreen(ctx, w, h, data) {
  const cx = w / 2;

  // Semi-transparent overlay
  ctx.fillStyle = SCREEN_COLORS.overlay;
  ctx.fillRect(0, 0, w, h);

  // Header
  drawCenteredText(ctx, '⏸ PAUSED', cx, h * 0.3, SCREEN_COLORS.primary, 'bold 42px monospace');

  // Buttons
  const btnY = h * 0.48;
  const spacing = 50;
  drawButton(ctx, 'Resume (ESC / P / Enter)', cx, btnY, data.selectedIndex === 0, true);
  drawButton(ctx, 'Restart Level (R)', cx, btnY + spacing, data.selectedIndex === 1, true);
  drawButton(ctx, 'Quit to Menu (Q)', cx, btnY + spacing * 2, data.selectedIndex === 2, true);
}

// ── Level Select Screen ─────────────────────────────────────

/**
 * Render the level select grid.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w
 * @param {number} h
 * @param {{ levels: Array<{ level, bestScore, unlocked }>, selectedLevel: number, scrollOffset: number }} data
 */
function drawLevelSelectScreen(ctx, w, h, data) {
  const cx = w / 2;

  // Background
  ctx.fillStyle = SCREEN_COLORS.background;
  ctx.fillRect(0, 0, w, h);

  // Header
  drawCenteredText(ctx, 'Level Select', cx, 40, SCREEN_COLORS.primary, 'bold 30px monospace');
  drawCenteredText(ctx, 'Arrow keys to navigate · Enter to play · ESC to go back', cx, 70, SCREEN_COLORS.textDim, '12px monospace');

  // Grid layout
  const cols = 10;
  const cellW = 90;
  const cellH = 60;
  const gridW = cols * cellW;
  const startX = (w - gridW) / 2;
  const startY = 95;

  // Level data already capped to 50 by GameStateManager [Fix 13]
  data.levels.forEach((lvl) => {
    const idx = lvl.level - 1;
    const col = idx % cols;
    const row = Math.floor(idx / cols) - data.scrollOffset;

    if (row < 0 || row > 7) return; // skip off-screen rows

    const x = startX + col * cellW;
    const y = startY + row * cellH;

    const isSelected = lvl.level === data.selectedLevel;

    ctx.save();

    // Cell background
    if (isSelected) {
      ctx.fillStyle = SCREEN_COLORS.buttonHighlight;
    } else if (lvl.unlocked) {
      ctx.fillStyle = SCREEN_COLORS.buttonBg;
    } else {
      ctx.fillStyle = 'rgba(30, 30, 50, 0.5)';
    }
    ctx.fillRect(x + 2, y + 2, cellW - 4, cellH - 4);

    // Cell border
    ctx.strokeStyle = isSelected ? SCREEN_COLORS.primary : (lvl.unlocked ? SCREEN_COLORS.primaryDim : SCREEN_COLORS.textDim);
    ctx.lineWidth = isSelected ? 2 : 1;
    ctx.strokeRect(x + 2, y + 2, cellW - 4, cellH - 4);

    // Level number
    ctx.font = 'bold 18px monospace';
    ctx.fillStyle = lvl.unlocked ? (isSelected ? SCREEN_COLORS.primary : SCREEN_COLORS.text) : SCREEN_COLORS.textDim;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(lvl.level), x + cellW / 2, y + 22);

    // Best score (if completed)
    if (lvl.bestScore > 0) {
      ctx.font = '11px monospace';
      ctx.fillStyle = SCREEN_COLORS.accentDim;
      ctx.fillText(String(lvl.bestScore), x + cellW / 2, y + 42);
    } else if (!lvl.unlocked) {
      ctx.font = '14px monospace';
      ctx.fillStyle = SCREEN_COLORS.textDim;
      ctx.fillText('🔒', x + cellW / 2, y + 42);
    }

    ctx.restore();
  });
}

// ── Victory Screen [AC16] ───────────────────────────────────

/**
 * Render the victory screen.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w
 * @param {number} h
 * @param {{ totalScore: number, highScore: number, selectedIndex: number }} data
 */
function drawVictoryScreen(ctx, w, h, data) {
  const cx = w / 2;

  // Background
  ctx.fillStyle = SCREEN_COLORS.background;
  ctx.fillRect(0, 0, w, h);

  // Trophy header
  drawCenteredText(ctx, '🏆 Congratulations!', cx, h * 0.2, SCREEN_COLORS.accent, 'bold 44px monospace');
  drawCenteredText(ctx, 'You conquered all 50 levels!', cx, h * 0.2 + 50, SCREEN_COLORS.text, '18px monospace');

  // Scores
  drawCenteredText(ctx, `Total Score: ${data.totalScore.toLocaleString()}`, cx, h * 0.45, SCREEN_COLORS.accent, 'bold 26px monospace');
  drawCenteredText(ctx, `High Score: ${data.highScore.toLocaleString()}`, cx, h * 0.45 + 40, SCREEN_COLORS.primary, '20px monospace');

  // Buttons
  const btnY = h * 0.65;
  const spacing = 50;
  drawButton(ctx, 'Play Again (Enter)', cx, btnY, data.selectedIndex === 0, true);
  drawButton(ctx, 'Level Select (L)', cx, btnY + spacing, data.selectedIndex === 1, true);
}

export {
  drawStartScreen,
  drawLevelCompleteScreen,
  drawPauseScreen,
  drawLevelSelectScreen,
  drawVictoryScreen,
  SCREEN_COLORS,
};
