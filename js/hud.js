/**
 * HUD — Heads-Up Display overlay drawn on the game canvas.
 *
 * Renders level number, timer, and hints remaining during gameplay.
 * All rendering is canvas-based — no DOM elements. [AC17]
 * Font sizes scale based on canvas height for mobile readability.
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

    /** Responsive font size — scales with canvas height, min 12px */
    this._fontSize = Math.max(12, Math.round(canvasHeight * 0.025));
    /** Responsive padding — scales with canvas width */
    this._padding = Math.max(10, Math.round(canvasWidth * 0.012));
    /** Responsive top offset */
    this._topOffset = Math.max(18, Math.round(canvasHeight * 0.04));
  }

  /**
   * Draw all HUD elements for gameplay.
   * @param {{ level: number, time: string, hintsDisplay: string }} data
   */
  draw({ level, time, hintsDisplay }) {
    const ctx = this.ctx;
    const fontSize = this._fontSize;
    const padding = this._padding;
    const topOffset = this._topOffset;

    ctx.save();
    ctx.font = `${fontSize}px ${HUD_STYLE.font}`;

    // Level number (top-left)
    ctx.fillStyle = HUD_STYLE.color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`Level ${level}`, padding, topOffset);

    // Timer MM:SS (top-center)
    ctx.textAlign = 'center';
    ctx.fillStyle = HUD_STYLE.dimColor;
    ctx.fillText(time, this.width / 2, topOffset);

    // Hints remaining (top-right)
    ctx.textAlign = 'right';
    ctx.fillStyle = HUD_STYLE.color;
    const hintsText = hintsDisplay === '∞' ? 'Hints: ∞' : `Hints: ${hintsDisplay}`;
    ctx.fillText(hintsText, this.width - padding, topOffset);

    ctx.restore();
  }
}

export { HUD, HUD_STYLE };
