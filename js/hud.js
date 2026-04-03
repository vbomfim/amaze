/**
 * HUD — Heads-Up Display overlay drawn on the game canvas.
 *
 * Renders level number, timer, and hints remaining during gameplay.
 * All rendering is canvas-based — no DOM elements. [AC17]
 *
 * [CLEAN-CODE] [SOLID] — Single responsibility: HUD rendering only
 */

/** HUD visual constants */
const HUD_STYLE = {
  font: 'monospace',
  fontSize: 16,
  color: 'rgba(0, 204, 204, 0.7)',
  dimColor: 'rgba(0, 204, 204, 0.4)',
  padding: 15,
  topOffset: 25,
};

class HUD {
  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} canvasWidth
   * @param {number} canvasHeight
   */
  constructor(ctx, canvasWidth, canvasHeight) {
    this.ctx = ctx;
    this.width = canvasWidth;
    this.height = canvasHeight;
  }

  /**
   * Draw all HUD elements for gameplay.
   * @param {{ level: number, time: string, hintsDisplay: string }} data
   */
  draw({ level, time, hintsDisplay }) {
    const ctx = this.ctx;
    ctx.save();
    ctx.font = `${HUD_STYLE.fontSize}px ${HUD_STYLE.font}`;

    // Level number (top-left)
    ctx.fillStyle = HUD_STYLE.color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`Level ${level}`, HUD_STYLE.padding, HUD_STYLE.topOffset);

    // Timer MM:SS (top-center)
    ctx.textAlign = 'center';
    ctx.fillStyle = HUD_STYLE.dimColor;
    ctx.fillText(time, this.width / 2, HUD_STYLE.topOffset);

    // Hints remaining (top-right)
    ctx.textAlign = 'right';
    ctx.fillStyle = HUD_STYLE.color;
    const hintsText = hintsDisplay === '∞' ? 'Hints: ∞' : `Hints: ${hintsDisplay}`;
    ctx.fillText(hintsText, this.width - HUD_STYLE.padding, HUD_STYLE.topOffset);

    ctx.restore();
  }
}

export { HUD, HUD_STYLE };
