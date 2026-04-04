/**
 * Screens — Canvas-rendered UI screens for game menus and overlays.
 *
 * All screens are drawn on the canvas with no DOM elements.
 * Dark theme, centered layout, keyboard and mouse navigable.
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

/** Stores button hit-test rectangles from the last screen render.
 *  Each entry: { index, x, y, width, height, enabled } */
let _buttonRects = [];

/** Clear button rects before drawing a new screen */
function resetButtonRects() {
  _buttonRects = [];
}

/** Get the button index at a canvas coordinate, or -1 */
function getButtonAtPoint(canvasX, canvasY) {
  for (const btn of _buttonRects) {
    if (btn.enabled &&
        canvasX >= btn.x && canvasX <= btn.x + btn.width &&
        canvasY >= btn.y && canvasY <= btn.y + btn.height) {
      return btn.index;
    }
  }
  return -1;
}

/** Get the button index being hovered, or -1 */
function getHoveredButton(canvasX, canvasY) {
  return getButtonAtPoint(canvasX, canvasY);
}

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
function drawButton(ctx, text, cx, cy, selected, enabled, btnIndex, options = {}) {
  const width = options.buttonWidth || 260;
  const height = options.buttonHeight || 36;
  const fontSize = options.fontSize || 16;
  const x = cx - width / 2;
  const y = cy - height / 2;

  // Register for click hit-testing
  if (btnIndex !== undefined) {
    _buttonRects.push({ index: btnIndex, x, y, width, height, enabled });
  }

  ctx.save();
  ctx.fillStyle = selected ? SCREEN_COLORS.buttonHighlight : SCREEN_COLORS.buttonBg;
  ctx.fillRect(x, y, width, height);

  ctx.strokeStyle = selected ? SCREEN_COLORS.primary : SCREEN_COLORS.primaryDim;
  ctx.lineWidth = selected ? 2 : 1;
  ctx.strokeRect(x, y, width, height);

  ctx.font = `${fontSize}px monospace`;
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
  resetButtonRects();
  const cx = w / 2;

  // Responsive sizing
  const btnW = Math.min(260, Math.round(w * 0.6));
  const btnH = Math.max(44, Math.round(h * 0.065));
  const btnFontSize = Math.max(12, Math.round(h * 0.025));
  const titleFontSize = Math.max(28, Math.round(h * 0.083));
  const subtitleFontSize = Math.max(10, Math.round(h * 0.021));
  const instrFontSize = Math.max(10, Math.round(h * 0.019));
  const btnOpts = { buttonWidth: btnW, buttonHeight: btnH, fontSize: btnFontSize };

  // Background
  ctx.fillStyle = SCREEN_COLORS.background;
  ctx.fillRect(0, 0, w, h);

  // Title
  drawCenteredText(ctx, '🐭 aMaze', cx, h * 0.2, SCREEN_COLORS.primary, `bold ${titleFontSize}px monospace`);

  // Subtitle
  drawCenteredText(ctx, 'Find your way through the maze', cx, h * 0.2 + titleFontSize + 10, SCREEN_COLORS.textDim, `${subtitleFontSize}px monospace`);

  // Menu buttons
  const buttonStartY = h * 0.42;
  const buttonSpacing = btnH + Math.max(10, Math.round(h * 0.02));
  let btnIdx = 0;

  drawButton(ctx, 'New Game (N / Enter)', cx, buttonStartY + buttonSpacing * btnIdx, data.selectedIndex === btnIdx, true, btnIdx, btnOpts);
  btnIdx++;

  drawButton(ctx, 'Continue (C)', cx, buttonStartY + buttonSpacing * btnIdx, data.selectedIndex === btnIdx, data.canContinue, btnIdx, btnOpts);
  btnIdx++;

  drawButton(ctx, 'PAC-MAN Mode (P)', cx, buttonStartY + buttonSpacing * btnIdx, data.selectedIndex === btnIdx, true, btnIdx, btnOpts);
  btnIdx++;

  if (data.canLevelSelect) {
    drawButton(ctx, 'Level Select (L)', cx, buttonStartY + buttonSpacing * btnIdx, data.selectedIndex === btnIdx, true, btnIdx, btnOpts);
    btnIdx++;
  }

  // Instructions
  const instrY = h * 0.75;
  const instrLines = [
    '↑↓←→ or WASD — Move',
    'H — Hint  ·  M — Minimap  ·  ESC — Pause',
  ];
  instrLines.forEach((line, i) => {
    drawCenteredText(ctx, line, cx, instrY + i * (instrFontSize + 8), SCREEN_COLORS.textDim, `${instrFontSize}px monospace`);
  });

  // High score
  if (data.highScore > 0) {
    drawCenteredText(ctx, `High Score: ${data.highScore.toLocaleString()}`, cx, h * 0.9, SCREEN_COLORS.accent, `${btnFontSize}px monospace`);
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
  resetButtonRects();
  const cx = w / 2;

  // Responsive sizing
  const btnW = Math.min(260, Math.round(w * 0.6));
  const btnH = Math.max(44, Math.round(h * 0.065));
  const btnFontSize = Math.max(12, Math.round(h * 0.025));
  const headerFontSize = Math.max(22, Math.round(h * 0.059));
  const bodyFontSize = Math.max(12, Math.round(h * 0.024));
  const scoreFontSize = Math.max(14, Math.round(h * 0.033));
  const btnOpts = { buttonWidth: btnW, buttonHeight: btnH, fontSize: btnFontSize };

  // Semi-transparent overlay
  ctx.fillStyle = SCREEN_COLORS.overlay;
  ctx.fillRect(0, 0, w, h);

  // Header
  drawCenteredText(ctx, '✨ Level Complete!', cx, h * 0.18, SCREEN_COLORS.accent, `bold ${headerFontSize}px monospace`);

  // Level number
  drawCenteredText(ctx, `Level ${result.level}`, cx, h * 0.28, SCREEN_COLORS.primary, `${Math.round(bodyFontSize * 1.25)}px monospace`);

  // Stats
  const statsY = h * 0.38;
  const lineH = Math.max(22, Math.round(h * 0.042));

  // Use pre-formatted time string from completeLevel result [Fix 9]
  const timeStr = result.timeStr || (() => {
    const minutes = Math.floor(result.time / 60);
    const seconds = Math.floor(result.time % 60);
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  })();

  drawCenteredText(ctx, `Time: ${timeStr}`, cx, statsY, SCREEN_COLORS.text, `${bodyFontSize}px monospace`);
  drawCenteredText(ctx, `Hints Used: ${result.hintsUsed}`, cx, statsY + lineH, SCREEN_COLORS.text, `${bodyFontSize}px monospace`);

  // Score breakdown
  const breakdownY = statsY + lineH * 3;
  const bd = result.breakdown;
  drawCenteredText(ctx, 'Score Breakdown', cx, breakdownY, SCREEN_COLORS.primary, `bold ${bodyFontSize}px monospace`);
  drawCenteredText(ctx, `Base: ${bd.basePoints}  ×  Level: ${bd.levelMultiplier.toFixed(1)}`, cx, breakdownY + lineH, SCREEN_COLORS.textDim, `${Math.round(bodyFontSize * 0.875)}px monospace`);
  drawCenteredText(ctx, `Hint Factor: ${bd.hintFactor.toFixed(2)}  ×  Time Bonus: ${bd.timeBonus.toFixed(2)}`, cx, breakdownY + lineH * 2, SCREEN_COLORS.textDim, `${Math.round(bodyFontSize * 0.875)}px monospace`);

  // Final score
  drawCenteredText(ctx, `Level Score: ${result.score.toLocaleString()}`, cx, breakdownY + lineH * 3.5, SCREEN_COLORS.accent, `bold ${scoreFontSize}px monospace`);
  drawCenteredText(ctx, `Total Score: ${result.totalScore.toLocaleString()}`, cx, breakdownY + lineH * 4.5, SCREEN_COLORS.primary, `${Math.round(scoreFontSize * 0.82)}px monospace`);

  // Continue prompt
    drawButton(ctx, 'Next Level → (Enter)', cx, h * 0.88, true, true, 0, btnOpts);
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
  resetButtonRects();
  const cx = w / 2;

  // Responsive sizing
  const btnW = Math.min(260, Math.round(w * 0.6));
  const btnH = Math.max(44, Math.round(h * 0.065));
  const btnFontSize = Math.max(12, Math.round(h * 0.025));
  const headerFontSize = Math.max(24, Math.round(h * 0.062));
  const btnOpts = { buttonWidth: btnW, buttonHeight: btnH, fontSize: btnFontSize };

  // Semi-transparent overlay
  ctx.fillStyle = SCREEN_COLORS.overlay;
  ctx.fillRect(0, 0, w, h);

  // Header
  drawCenteredText(ctx, '⏸ PAUSED', cx, h * 0.3, SCREEN_COLORS.primary, `bold ${headerFontSize}px monospace`);

  // Buttons
  const btnY = h * 0.48;
  const spacing = btnH + Math.max(10, Math.round(h * 0.02));
  drawButton(ctx, 'Resume (ESC / P / Enter)', cx, btnY, data.selectedIndex === 0, true, 0, btnOpts);
  drawButton(ctx, 'Restart Level (R)', cx, btnY + spacing, data.selectedIndex === 1, true, 1, btnOpts);
  drawButton(ctx, 'Quit to Menu (Q)', cx, btnY + spacing * 2, data.selectedIndex === 2, true, 2, btnOpts);
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
  resetButtonRects();
  const cx = w / 2;

  // Responsive sizing
  const btnW = Math.min(260, Math.round(w * 0.6));
  const btnH = Math.max(44, Math.round(h * 0.065));
  const btnFontSize = Math.max(12, Math.round(h * 0.025));
  const headerFontSize = Math.max(24, Math.round(h * 0.065));
  const subFontSize = Math.max(12, Math.round(h * 0.027));
  const scoreFontSize = Math.max(16, Math.round(h * 0.039));
  const btnOpts = { buttonWidth: btnW, buttonHeight: btnH, fontSize: btnFontSize };

  // Background
  ctx.fillStyle = SCREEN_COLORS.background;
  ctx.fillRect(0, 0, w, h);

  // Trophy header
  drawCenteredText(ctx, '🏆 Congratulations!', cx, h * 0.2, SCREEN_COLORS.accent, `bold ${headerFontSize}px monospace`);
  drawCenteredText(ctx, 'You conquered all 50 levels!', cx, h * 0.2 + headerFontSize + 10, SCREEN_COLORS.text, `${subFontSize}px monospace`);

  // Scores
  drawCenteredText(ctx, `Total Score: ${data.totalScore.toLocaleString()}`, cx, h * 0.45, SCREEN_COLORS.accent, `bold ${scoreFontSize}px monospace`);
  drawCenteredText(ctx, `High Score: ${data.highScore.toLocaleString()}`, cx, h * 0.45 + scoreFontSize + 14, SCREEN_COLORS.primary, `${Math.round(scoreFontSize * 0.77)}px monospace`);

  // Buttons
  const btnY = h * 0.65;
  const spacing = btnH + Math.max(10, Math.round(h * 0.02));
  drawButton(ctx, 'Play Again (Enter)', cx, btnY, data.selectedIndex === 0, true, 0, btnOpts);
  drawButton(ctx, 'Level Select (L)', cx, btnY + spacing, data.selectedIndex === 1, true, 1, btnOpts);
}

export {
  drawStartScreen,
  drawLevelCompleteScreen,
  drawPauseScreen,
  drawLevelSelectScreen,
  drawVictoryScreen,
  getButtonAtPoint,
  getHoveredButton,
  resetButtonRects,
  SCREEN_COLORS,
};
