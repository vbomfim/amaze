/**
 * PAC-MAN Screens — Canvas-rendered UI screens for PAC-MAN mode.
 *
 * Screens: READY countdown, DYING flash, LEVEL CLEAR, GAME OVER, HUD, PAUSE.
 * Reuses the button system from screens.js for click hit-testing.
 *
 * [CLEAN-CODE] [SOLID] — Single responsibility: PAC-MAN screen rendering only
 */

import {
  SCREEN_COLORS,
} from './screens.js';

// ── Shared helpers ─────────────────────────────────────────────

/**
 * Draw centered text (local helper matching screens.js pattern).
 */
function drawCentered(ctx, text, x, y, color, font) {
  ctx.save();
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** Button rects for PAC-MAN screens (same pattern as screens.js) */
let _pacButtonRects = [];

function resetPacButtonRects() {
  _pacButtonRects = [];
}

/**
 * Draw a PAC-MAN button (same visual as screens.js buttons).
 */
function drawPacButton(ctx, text, cx, cy, selected, enabled, btnIndex, options = {}) {
  const width = options.buttonWidth || 260;
  const height = options.buttonHeight || 36;
  const fontSize = options.fontSize || 16;
  const x = cx - width / 2;
  const y = cy - height / 2;

  if (btnIndex !== undefined) {
    _pacButtonRects.push({ index: btnIndex, x, y, width, height, enabled });
  }

  ctx.save();
  ctx.fillStyle = selected ? SCREEN_COLORS.buttonHighlight : SCREEN_COLORS.buttonBg;
  ctx.fillRect(x, y, width, height);

  ctx.strokeStyle = selected ? SCREEN_COLORS.primary : SCREEN_COLORS.primaryDim;
  ctx.lineWidth = selected ? 2 : 1;
  ctx.strokeRect(x, y, width, height);

  ctx.font = `${fontSize}px monospace`;
  ctx.fillStyle = enabled
    ? (selected ? SCREEN_COLORS.primary : SCREEN_COLORS.text)
    : SCREEN_COLORS.textDim;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, cy);
  ctx.restore();
}

/**
 * Get the button index at a canvas coordinate, or -1.
 * Checks PAC-MAN-specific button rects.
 */
function getPacButtonAtPoint(canvasX, canvasY) {
  for (const btn of _pacButtonRects) {
    if (btn.enabled &&
        canvasX >= btn.x && canvasX <= btn.x + btn.width &&
        canvasY >= btn.y && canvasY <= btn.y + btn.height) {
      return btn.index;
    }
  }
  return -1;
}

/**
 * Get hovered PAC-MAN button index, or -1.
 */
function getHoveredPacButton(canvasX, canvasY) {
  return getPacButtonAtPoint(canvasX, canvasY);
}

// ── READY Screen ───────────────────────────────────────────────

/**
 * Draw "READY!" text centered over the 3D maze view.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w — canvas width
 * @param {number} h — canvas height
 */
function drawPacManReadyScreen(ctx, w, h) {
  const cx = w / 2;
  const readyFontSize = Math.max(32, Math.round(h * 0.095));
  const subFontSize = Math.max(12, Math.round(h * 0.027));

  // Semi-transparent overlay
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.fillRect(0, 0, w, h);
  ctx.restore();

  // "READY!" text
  drawCentered(ctx, 'READY!', cx, h * 0.45, '#ffcc00', `bold ${readyFontSize}px monospace`);
  drawCentered(ctx, 'Get ready...', cx, h * 0.55, SCREEN_COLORS.textDim, `${subFontSize}px monospace`);
}

// ── DYING Overlay ──────────────────────────────────────────────

/**
 * Draw death flash overlay (red flash that fades).
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w
 * @param {number} h
 * @param {{ timer: number, duration: number }} data
 */
function drawPacManDyingOverlay(ctx, w, h, data) {
  // Red flash in first 200ms, then fade
  const flashDuration = 0.2;
  const alpha = data.timer < flashDuration
    ? 0.5 * (1 - data.timer / flashDuration)
    : 0;

  if (alpha > 0) {
    ctx.save();
    ctx.fillStyle = `rgba(255, 0, 0, ${alpha})`;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  // "DYING" text overlay
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

// ── LEVEL CLEAR Screen ─────────────────────────────────────────

/**
 * Draw "LEVEL CLEAR!" celebration overlay.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w
 * @param {number} h
 * @param {{ score: number, level: number }} data
 */
function drawPacManLevelClearScreen(ctx, w, h, data) {
  const cx = w / 2;

  // Semi-transparent overlay
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.fillRect(0, 0, w, h);
  ctx.restore();

  drawCentered(ctx, '✨ LEVEL CLEAR!', cx, h * 0.35, '#ffcc00', `bold ${Math.max(24, Math.round(h * 0.071))}px monospace`);
  drawCentered(ctx, `Level ${data.level} Complete`, cx, h * 0.48, SCREEN_COLORS.primary, `${Math.max(14, Math.round(h * 0.033))}px monospace`);
  drawCentered(ctx, `Score: ${data.score.toLocaleString()}`, cx, h * 0.58, SCREEN_COLORS.text, `${Math.max(12, Math.round(h * 0.030))}px monospace`);
  drawCentered(ctx, 'Next level starting...', cx, h * 0.68, SCREEN_COLORS.textDim, `${Math.max(10, Math.round(h * 0.021))}px monospace`);
}

// ── GAME OVER Screen ───────────────────────────────────────────

/**
 * Draw game over screen with final score and options.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w
 * @param {number} h
 * @param {{ score: number, highScore: number, selectedIndex: number }} data
 */
function drawPacManGameOverScreen(ctx, w, h, data) {
  resetPacButtonRects();
  const cx = w / 2;

  // Responsive sizing
  const btnW = Math.min(260, Math.round(w * 0.6));
  const btnH = Math.max(44, Math.round(h * 0.065));
  const btnFontSize = Math.max(12, Math.round(h * 0.025));
  const headerFontSize = Math.max(28, Math.round(h * 0.083));
  const scoreFontSize = Math.max(14, Math.round(h * 0.036));
  const hiFontSize = Math.max(12, Math.round(h * 0.030));
  const btnOpts = { buttonWidth: btnW, buttonHeight: btnH, fontSize: btnFontSize };

  // Full background
  ctx.fillStyle = SCREEN_COLORS.background;
  ctx.fillRect(0, 0, w, h);

  // Header
  drawCentered(ctx, 'GAME OVER', cx, h * 0.2, '#ff3333', `bold ${headerFontSize}px monospace`);

  // Scores
  drawCentered(ctx, `Score: ${data.score.toLocaleString()}`, cx, h * 0.38, SCREEN_COLORS.text, `${scoreFontSize}px monospace`);
  drawCentered(ctx, `High Score: ${data.highScore.toLocaleString()}`, cx, h * 0.48, SCREEN_COLORS.accent, `${hiFontSize}px monospace`);

  // New high score indicator
  if (data.score >= data.highScore && data.score > 0) {
    drawCentered(ctx, '🏆 NEW HIGH SCORE!', cx, h * 0.55, '#ffcc00', `bold ${Math.round(hiFontSize * 0.9)}px monospace`);
  }

  // Buttons
  const btnY = h * 0.68;
  const spacing = btnH + Math.max(10, Math.round(h * 0.02));
  drawPacButton(ctx, 'Play Again (Enter)', cx, btnY, data.selectedIndex === 0, true, 0, btnOpts);
  drawPacButton(ctx, 'Back to Menu (Q)', cx, btnY + spacing, data.selectedIndex === 1, true, 1, btnOpts);
}

// ── PAUSE Screen ───────────────────────────────────────────────

/**
 * Draw PAC-MAN pause overlay.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w
 * @param {number} h
 * @param {{ selectedIndex: number }} data
 */
function drawPacManPauseScreen(ctx, w, h, data) {
  resetPacButtonRects();
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
  drawCentered(ctx, '⏸ PAUSED', cx, h * 0.3, SCREEN_COLORS.primary, `bold ${headerFontSize}px monospace`);

  // Buttons
  const btnY = h * 0.48;
  const spacing = btnH + Math.max(10, Math.round(h * 0.02));
  drawPacButton(ctx, 'Resume (ESC / P)', cx, btnY, data.selectedIndex === 0, true, 0, btnOpts);
  drawPacButton(ctx, 'Restart (R)', cx, btnY + spacing, data.selectedIndex === 1, true, 1, btnOpts);
  drawPacButton(ctx, 'Quit to Menu (Q)', cx, btnY + spacing * 2, data.selectedIndex === 2, true, 2, btnOpts);
}

// ── PAC-MAN HUD ────────────────────────────────────────────────

/**
 * Draw PAC-MAN HUD overlay during gameplay.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w
 * @param {number} h
 * @param {{ score: number, highScore: number, lives: number, level: number, dotsRemaining: number, frightenedTimer: number, frightenedDuration: number }} data
 */
function drawPacManHUD(ctx, w, h, data) {
  ctx.save();
  const pad = Math.max(10, Math.round(w * 0.012));
  const scoreFontSize = Math.max(16, Math.round(h * 0.036));
  const hiFontSize = Math.max(10, Math.round(h * 0.021));
  const lvlFontSize = Math.max(12, Math.round(h * 0.024));
  const dotsFontSize = Math.max(10, Math.round(h * 0.018));
  const livesFontSize = Math.max(14, Math.round(h * 0.030));

  // ── Score (top-center, large)
  ctx.font = `bold ${scoreFontSize}px monospace`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(data.score.toLocaleString(), w / 2, pad);

  // ── High Score (top-right)
  ctx.font = `${hiFontSize}px monospace`;
  ctx.fillStyle = 'rgba(0, 204, 204, 0.7)';
  ctx.textAlign = 'right';
  ctx.fillText(`HI: ${data.highScore.toLocaleString()}`, w - pad, pad);

  // ── Level (top-left)
  ctx.font = `${lvlFontSize}px monospace`;
  ctx.fillStyle = 'rgba(0, 204, 204, 0.7)';
  ctx.textAlign = 'left';
  ctx.fillText(`LVL ${data.level}`, pad, pad);

  // ── Dots remaining (below score)
  ctx.font = `${dotsFontSize}px monospace`;
  ctx.fillStyle = 'rgba(255, 204, 0, 0.6)';
  ctx.textAlign = 'center';
  ctx.fillText(`${data.dotsRemaining} dots`, w / 2, pad + scoreFontSize + 4);

  // ── Lives (bottom-left — mouse emoji × remaining)
  ctx.font = `${livesFontSize}px monospace`;
  ctx.fillStyle = '#ffcc00';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  const livesStr = '🐭'.repeat(Math.min(data.lives, 5)) + (data.lives > 5 ? `+${data.lives - 5}` : '');
  ctx.fillText(livesStr, pad, h - pad);

  // ── Power-up timer bar (below score, when active)
  if (data.frightenedTimer > 0 && data.frightenedDuration > 0) {
    const barW = 200;
    const barH = 6;
    const barX = (w - barW) / 2;
    const barY = pad + 44;
    const fill = data.frightenedTimer / data.frightenedDuration;

    // Background bar
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.fillRect(barX, barY, barW, barH);

    // Filled portion (blue → red as timer depletes)
    const r = Math.round(255 * (1 - fill));
    const b = Math.round(255 * fill);
    ctx.fillStyle = `rgb(${r}, 50, ${b})`;
    ctx.fillRect(barX, barY, barW * fill, barH);
  }

  ctx.restore();
}

export {
  drawPacManReadyScreen,
  drawPacManDyingOverlay,
  drawPacManLevelClearScreen,
  drawPacManGameOverScreen,
  drawPacManHUD,
  drawPacManPauseScreen,
  getPacButtonAtPoint,
  getHoveredPacButton,
  resetPacButtonRects,
};
