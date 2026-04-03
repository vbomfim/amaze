/**
 * SpriteRenderer — Billboard sprites rendered in the 3D raycasted view.
 *
 * Renders geometric shapes (circles, diamonds, triangles) as sprites in the
 * 3D raycasted view. Uses painter's algorithm (back-to-front sorting) and
 * depth buffer occlusion testing.
 *
 * [TDD] [CLEAN-CODE] [SOLID] — Single responsibility: sprite rendering only
 */

/**
 * Sprite type definitions — geometric shapes, no images.
 * Each type has: color, size (world units), shape type.
 */
const SPRITE_TYPES = {
  dot:              { color: '#ffcc00', size: 0.1,  shape: 'circle' },
  power_pellet:     { color: '#ffee00', size: 0.3,  shape: 'circle' },
  apple:            { color: '#ff3333', size: 0.15, shape: 'diamond' },
  cherry:           { color: '#cc0000', size: 0.15, shape: 'circles' },
  pizza:            { color: '#ff8800', size: 0.15, shape: 'triangle' },
  cupcake:          { color: '#ff66aa', size: 0.15, shape: 'rectangle' },
  ghost_blinky:     { color: '#ff0000', size: 0.45, shape: 'diamond' },
  ghost_pinky:      { color: '#ffb8ff', size: 0.45, shape: 'diamond' },
  ghost_inky:       { color: '#00ffff', size: 0.45, shape: 'diamond' },
  ghost_clyde:      { color: '#ffb852', size: 0.45, shape: 'diamond' },
  ghost_frightened: { color: '#0000ff', size: 0.45, shape: 'diamond' },
  ghost_eaten:      { color: '#ffffff', size: 0.3,  shape: 'eyes' },
};

/** Minimum distance to render a sprite (avoids division by near-zero) */
const MIN_SPRITE_DIST = 0.2;

/** Maximum distance to render a sprite (culling far sprites) */
const MAX_SPRITE_DIST = 24;

class SpriteRenderer {
  /**
   * @param {CanvasRenderingContext2D} ctx — canvas 2D context
   * @param {number} width — canvas width in pixels
   * @param {number} height — canvas height in pixels
   */
  constructor(ctx, width, height) {
    this.ctx = ctx;
    this.width = width;
    this.height = height;
  }

  /**
   * Render all active sprites from the player's perspective.
   *
   * Algorithm:
   * 1. Calculate distance from player to each sprite
   * 2. Filter out inactive, too-close, too-far, and behind-player sprites
   * 3. Sort back-to-front (painter's algorithm)
   * 4. For each sprite: project to screen, check depth buffer, draw shape
   *
   * @param {Object} player — { x, y, angle, fov }
   * @param {Array<Object>} sprites — [{ x, y, type, active, animPhase }]
   * @param {Float32Array} depthBuffer — wall distances per screen column
   */
  renderSprites(player, sprites, depthBuffer) {
    if (sprites.length === 0) return;

    const halfFov = player.fov / 2;
    const projDist = (this.width / 2) / Math.tan(halfFov);

    // Step 1–2: compute distance, filter
    const visible = [];
    for (let i = 0; i < sprites.length; i++) {
      const s = sprites[i];
      if (!s.active) continue;

      const dx = s.x - player.x;
      const dy = s.y - player.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < MIN_SPRITE_DIST || dist > MAX_SPRITE_DIST) continue;

      // Angle to sprite relative to player direction
      const angle = Math.atan2(dy, dx) - player.angle;
      // Normalize to [-PI, PI]
      const normAngle = ((angle + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;

      // Skip if outside FOV (with margin)
      if (Math.abs(normAngle) > halfFov + 0.3) continue;

      visible.push({ sprite: s, dist, normAngle });
    }

    // Step 3: Sort back-to-front
    visible.sort((a, b) => b.dist - a.dist);

    // Step 4: Render each sprite
    for (const item of visible) {
      this.#renderOneSprite(item.sprite, item.dist, item.normAngle, projDist, depthBuffer);
    }
  }

  /**
   * Render a single sprite.
   * @param {Object} sprite — sprite data
   * @param {number} dist — distance from player
   * @param {number} normAngle — angle relative to player view direction
   * @param {number} projDist — projection plane distance
   * @param {Float32Array} depthBuffer — wall distances
   */
  #renderOneSprite(sprite, dist, normAngle, projDist, depthBuffer) {
    const typeDef = SPRITE_TYPES[sprite.type];
    if (!typeDef) return;

    // Screen X position — use tan(angle) for correct perspective projection [Fix 1]
    const screenX = Math.floor(this.width / 2 + Math.tan(normAngle) * projDist);

    // Screen size based on distance (same scale as walls)
    const spriteScreenSize = Math.floor((typeDef.size / dist) * projDist);
    if (spriteScreenSize < 1) return;

    // Screen Y centered at horizon
    const screenY = Math.floor(this.height / 2 - spriteScreenSize / 2);

    // Distance shading (match wall shading)
    const shade = Math.max(0.15, 1.0 - dist / 12);

    // Column range on screen
    const halfSize = Math.floor(spriteScreenSize / 2);
    const startCol = screenX - halfSize;
    const endCol = screenX + halfSize;

    // Perpendicular sprite distance for depth comparison (matches wall depth buffer) [Fix 2]
    const perpSpriteDist = dist * Math.cos(normAngle);

    // Check if any column is visible (not occluded by walls)
    let hasVisibleColumn = false;
    for (let col = Math.max(0, startCol); col < Math.min(this.width, endCol); col++) {
      if (depthBuffer[col] > perpSpriteDist) {
        hasVisibleColumn = true;
        break;
      }
    }
    if (!hasVisibleColumn) return;

    // Draw the sprite shape
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = shade;

    const color = this.#getColor(sprite, typeDef);

    switch (typeDef.shape) {
      case 'circle':
        this.#drawCircle(ctx, screenX, screenY + halfSize, halfSize, color, sprite);
        break;
      case 'diamond':
        this.#drawDiamond(ctx, screenX, screenY + halfSize, halfSize, color, sprite);
        break;
      case 'triangle':
        this.#drawTriangle(ctx, screenX, screenY + halfSize, halfSize, color);
        break;
      case 'rectangle':
        this.#drawRectangle(ctx, screenX, screenY + halfSize, halfSize, color);
        break;
      case 'circles':
        this.#drawTwoCircles(ctx, screenX, screenY + halfSize, halfSize, color);
        break;
      case 'eyes':
        this.#drawEyes(ctx, screenX, screenY + halfSize, halfSize, color);
        break;
    }

    ctx.restore();
  }

  /**
   * Get the render color for a sprite (handles frightened flashing).
   * @param {Object} sprite
   * @param {Object} typeDef
   * @returns {string} color hex
   */
  #getColor(sprite, typeDef) {
    if (sprite.type === 'ghost_frightened' && sprite.animPhase > 0.7) {
      // Flash white near end of frightened mode
      return sprite.animPhase % 0.2 > 0.1 ? '#ffffff' : typeDef.color;
    }
    if (sprite.type === 'power_pellet') {
      // Pulsing effect
      const pulse = 0.7 + 0.3 * Math.sin(sprite.animPhase * Math.PI * 2);
      const r = Math.floor(255 * pulse);
      const g = Math.floor(238 * pulse);
      return `rgb(${r},${g},0)`;
    }
    return typeDef.color;
  }

  // ── Shape Drawing Methods ──────────────────────────────────

  /** Draw a filled circle */
  #drawCircle(ctx, cx, cy, radius, color, _sprite) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(1, radius), 0, Math.PI * 2);
    ctx.fill();
  }

  /** Draw a diamond (ghost body) with 2 eyes */
  #drawDiamond(ctx, cx, cy, halfSize, color, sprite) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx, cy - halfSize);           // top
    ctx.lineTo(cx + halfSize, cy);            // right
    ctx.lineTo(cx + halfSize * 0.4, cy + halfSize);  // bottom-right
    ctx.lineTo(cx - halfSize * 0.4, cy + halfSize);  // bottom-left
    ctx.lineTo(cx - halfSize, cy);            // left
    ctx.closePath();
    ctx.fill();

    // Eyes
    if (sprite.type !== 'ghost_eaten') {
      const eyeR = Math.max(1, halfSize * 0.2);
      const eyeY = cy - halfSize * 0.15;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(cx - halfSize * 0.25, eyeY, eyeR, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx + halfSize * 0.25, eyeY, eyeR, 0, Math.PI * 2);
      ctx.fill();

      // Pupils
      const pupilR = Math.max(1, eyeR * 0.5);
      ctx.fillStyle = '#000033';
      ctx.beginPath();
      ctx.arc(cx - halfSize * 0.25, eyeY, pupilR, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx + halfSize * 0.25, eyeY, pupilR, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** Draw a triangle (pizza) */
  #drawTriangle(ctx, cx, cy, halfSize, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx, cy - halfSize);
    ctx.lineTo(cx + halfSize, cy + halfSize);
    ctx.lineTo(cx - halfSize, cy + halfSize);
    ctx.closePath();
    ctx.fill();
  }

  /** Draw a rounded rectangle (cupcake) */
  #drawRectangle(ctx, cx, cy, halfSize, color) {
    ctx.fillStyle = color;
    const w = halfSize * 1.4;
    const h = halfSize * 1.6;
    ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
  }

  /** Draw two small circles (cherry) */
  #drawTwoCircles(ctx, cx, cy, halfSize, color) {
    const r = Math.max(1, halfSize * 0.6);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx - halfSize * 0.3, cy + halfSize * 0.2, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + halfSize * 0.3, cy - halfSize * 0.2, r, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Draw just 2 eyes (ghost eaten) */
  #drawEyes(ctx, cx, cy, halfSize, color) {
    const eyeR = Math.max(2, halfSize * 0.35);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx - halfSize * 0.3, cy, eyeR, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + halfSize * 0.3, cy, eyeR, 0, Math.PI * 2);
    ctx.fill();

    // Pupils
    const pupilR = Math.max(1, eyeR * 0.4);
    ctx.fillStyle = '#000033';
    ctx.beginPath();
    ctx.arc(cx - halfSize * 0.3, cy, pupilR, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + halfSize * 0.3, cy, pupilR, 0, Math.PI * 2);
    ctx.fill();
  }
}

export { SpriteRenderer, SPRITE_TYPES };
