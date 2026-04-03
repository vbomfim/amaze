/**
 * RaycastRenderer — First-person 3D raycasting renderer using DDA algorithm.
 *
 * Casts one ray per screen column from the player's position, detects wall hits,
 * and draws vertical wall slices with height inversely proportional to distance.
 *
 * Visual style: wireframe/line aesthetic — colored lines on dark background.
 *
 * [CLEAN-CODE] [SOLID] — Single responsibility: rendering only
 */

/** Color palette for the wireframe aesthetic */
const COLORS = {
  ceiling: '#0d0d2b',
  floor: '#0d1a0d',
  wallNS: '#00cccc',   // North/South facing walls (brighter)
  wallEW: '#009999',   // East/West facing walls (slightly darker for depth)
  exit: '#ffcc00',     // Glowing yellow/gold for exit
  exitGlow: '#ffe066',
  carpet: '#cc2222',   // Red carpet for hint path [AC10]
};

/**
 * Pre-parsed { r, g, b } tuples for every COLORS entry.
 * Eliminates hot-path parseInt/slice allocations in #applyShade. [Fix 2]
 */
const COLORS_RGB = Object.fromEntries(
  Object.entries(COLORS).map(([key, hex]) => [
    key,
    {
      r: parseInt(hex.slice(1, 3), 16),
      g: parseInt(hex.slice(3, 5), 16),
      b: parseInt(hex.slice(5, 7), 16),
    },
  ])
);

/** Named visual constants — replaces magic numbers [Fix 15] */
const VISUAL = {
  minShade: 0.15,
  maxShadeBoost: 1.2,
  shadeDropoffDistance: 12,
  accentColumnInterval: 4,
  accentOpacity: 0.3,
  depthFillMultiplier: 0.6,
  carpetMaxDistance: 8,
};

/** Sky/atmosphere configuration */
const SKY = {
  day: {
    gradientTop: '#1a6dd4',
    gradientBottom: '#87ceeb',
    floorTop: '#2a5a1a',
    floorBottom: '#0d1a0d',
    cloudColor: 'rgba(255,255,255,0.6)',
    cloudShadow: 'rgba(200,200,220,0.3)',
  },
  night: {
    gradientTop: '#030310',
    gradientBottom: '#0d0d2b',
    floorTop: '#0a120a',
    floorBottom: '#050a05',
    starColor: 'rgba(255,255,255,0.8)',
    moonColor: '#ffffcc',
    moonGlow: 'rgba(255,255,200,0.15)',
  },
};

class RaycastRenderer {
  /**
   * @param {HTMLCanvasElement} canvas
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.width = canvas.width;
    this.height = canvas.height;

    this._hitResult = { distance: 0, side: 0, mapRow: 0, mapCol: 0 };

    /** Depth buffer for sprite occlusion — perpendicular wall distance per column */
    this.depthBuffer = new Float32Array(this.width);
    this._colorKeyCache = new Map(
      Object.entries(COLORS).map(([key, hex]) => [hex, key])
    );

    // Sky state
    this.isNight = false;
    this._stars = this.#generateStars(120);
    this._clouds = this.#generateClouds(8);
    this._cloudOffset = 0;
  }

  /** Toggle day/night mode */
  toggleDayNight() {
    this.isNight = !this.isNight;
    return this.isNight;
  }

  #generateStars(count) {
    const stars = [];
    for (let i = 0; i < count; i++) {
      stars.push({
        x: Math.random(),
        y: Math.random(),
        size: Math.random() * 1.5 + 0.5,
        twinkle: Math.random() * Math.PI * 2,
      });
    }
    return stars;
  }

  #generateClouds(count) {
    const clouds = [];
    for (let i = 0; i < count; i++) {
      clouds.push({
        x: Math.random(),
        y: 0.15 + Math.random() * 0.5,
        width: 0.06 + Math.random() * 0.1,
        height: 0.015 + Math.random() * 0.02,
        puffs: 2 + Math.floor(Math.random() * 3),
      });
    }
    return clouds;
  }

  /**
   * Render a single frame of the 3D view.
   * @param {Object} player — { x, y, angle, fov }
   * @param {number[][]} tileMap — 2D tile array: 0=open, 1=wall
   * @param {number} exitRow — exit tile row
   * @param {number} exitCol — exit tile col
   * @param {Object} [options]
   * @param {import('./hint.js').HintSystem} [options.hintSystem]
   */
  render(player, tileMap, exitRow, exitCol, options) {
    this.#drawBackground(player.angle, player.pitch);
    this.#castAllRays(player, tileMap, exitRow, exitCol, options);
  }

  /** Draw sky/ceiling and floor with gradients + clouds or stars. */
  #drawBackground(playerAngle, playerPitch) {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    const pitch = playerPitch || 0;
    const horizonY = h / 2 + pitch * h;
    const theme = this.isNight ? SKY.night : SKY.day;

    // Sky gradient — extends above horizon
    const skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
    skyGrad.addColorStop(0, theme.gradientTop);
    skyGrad.addColorStop(1, theme.gradientBottom);
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, horizonY);

    // Floor gradient — extends below horizon
    const floorGrad = ctx.createLinearGradient(0, horizonY, 0, h);
    floorGrad.addColorStop(0, theme.floorTop);
    floorGrad.addColorStop(1, theme.floorBottom);
    ctx.fillStyle = floorGrad;
    ctx.fillRect(0, horizonY, w, h - horizonY);

    // Virtual panorama: 360° maps to panoramaWidth pixels.
    // The visible screen is a FOV-sized window into that panorama.
    const fov = (60 * Math.PI) / 180;
    const panoramaWidth = w * (Math.PI * 2) / fov; // ~6x screen width
    const angleFrac = playerAngle / (Math.PI * 2);
    const panX = -angleFrac * panoramaWidth + w / 2;

    if (this.isNight) {
      this.#drawNightSky(ctx, w, horizonY, panX, panoramaWidth);
    } else {
      this.#drawDaySky(ctx, w, horizonY, panX, panoramaWidth);
    }
  }

  /** Compute screen X from a world position (0..1) in the panorama */
  #skyScreenX(worldFrac, panX, panoramaWidth, screenWidth) {
    let x = worldFrac * panoramaWidth + panX;
    // Wrap so it can appear from either side
    x = ((x % panoramaWidth) + panoramaWidth) % panoramaWidth;
    // Only return if within visible screen (with margin for large objects)
    if (x > screenWidth + 100) x -= panoramaWidth;
    return x;
  }

  #drawDaySky(ctx, w, halfH, panX, pw) {
    const sunR = Math.min(w, halfH) * 0.04;
    const sunX = this.#skyScreenX(0.75, panX, pw, w);
    const sunY = halfH * 0.25;

    // Only draw if on screen
    if (sunX > -sunR * 3 && sunX < w + sunR * 3) {
      ctx.beginPath();
      ctx.arc(sunX, sunY, sunR * 2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,200,0.15)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
      ctx.fillStyle = '#fff8cc';
      ctx.fill();
    }

    // Clouds
    this._cloudOffset += 0.00005;
    const theme = SKY.day;
    for (const cloud of this._clouds) {
      const worldX = (cloud.x + this._cloudOffset) % 1.0;
      const cx = this.#skyScreenX(worldX, panX, pw, w);
      if (cx < -200 || cx > w + 200) continue;

      const cy = cloud.y * halfH;
      const cw = cloud.width * w;
      const ch = cloud.height * halfH;

      ctx.fillStyle = theme.cloudShadow;
      for (let p = 0; p < cloud.puffs; p++) {
        ctx.beginPath();
        ctx.ellipse(cx + p * cw * 0.6, cy + ch * 0.3, cw * 0.5, ch * 0.8, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = theme.cloudColor;
      for (let p = 0; p < cloud.puffs; p++) {
        ctx.beginPath();
        ctx.ellipse(cx + p * cw * 0.6, cy, cw * 0.5, ch, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  #drawNightSky(ctx, w, halfH, panX, pw) {
    const theme = SKY.night;
    const time = performance.now() / 1000;

    // Moon
    const moonR = Math.min(w, halfH) * 0.035;
    const moonX = this.#skyScreenX(0.8, panX, pw, w);
    const moonY = halfH * 0.2;

    if (moonX > -moonR * 4 && moonX < w + moonR * 4) {
      ctx.beginPath();
      ctx.arc(moonX, moonY, moonR * 3, 0, Math.PI * 2);
      ctx.fillStyle = theme.moonGlow;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
      ctx.fillStyle = theme.moonColor;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(moonX + moonR * 0.4, moonY - moonR * 0.1, moonR * 0.85, 0, Math.PI * 2);
      ctx.fillStyle = theme.gradientTop;
      ctx.fill();
    }

    // Stars
    for (const star of this._stars) {
      const sx = this.#skyScreenX(star.x, panX, pw, w);
      if (sx < -2 || sx > w + 2) continue;
      const sy = star.y * halfH;
      const twinkle = 0.4 + 0.6 * Math.abs(Math.sin(time * 1.5 + star.twinkle));
      ctx.globalAlpha = twinkle;
      ctx.fillStyle = theme.starColor;
      ctx.fillRect(sx, sy, star.size, star.size);
    }
    ctx.globalAlpha = 1.0;
  }

  /**
   * Cast one ray per screen column using the DDA algorithm on a tile map.
   * @param {Object} player
   * @param {number[][]} tileMap — 0=open, 1=wall
   * @param {number} exitRow
   * @param {number} exitCol
   * @param {Object} [options]
   */
  #castAllRays(player, tileMap, exitRow, exitCol, options) {
    const numRays = this.width;
    const halfFov = player.fov / 2;
    const hintSystem = options && options.hintSystem;
    const pitchOffset = (player.pitch || 0) * this.height;

    // Reset depth buffer for sprite occlusion testing
    this.depthBuffer.fill(Infinity);

    for (let col = 0; col < numRays; col++) {
      const rayFraction = (col / numRays) * 2 - 1;
      const rayAngle = player.angle + rayFraction * halfFov;

      const hit = this.#castRay(player.x, player.y, rayAngle, tileMap);

      if (hit) {
        const perpDist = hit.distance * Math.cos(rayAngle - player.angle);
        this.depthBuffer[col] = perpDist;
        const sliceHeight = Math.min(this.height * 2, this.height / perpDist);
        const sliceTop = (this.height - sliceHeight) / 2 + pitchOffset;

        // Check if the wall is adjacent to the exit tile
        const isExit = this.#isAdjacentTo(hit.mapRow, hit.mapCol, exitRow, exitCol);
        let color;

        if (isExit) {
          color = COLORS.exit;
        } else {
          color = hit.side === 0 ? COLORS.wallNS : COLORS.wallEW;
        }

        const shade = Math.max(VISUAL.minShade, 1.0 - perpDist / VISUAL.shadeDropoffDistance);
        this.#drawWallSlice(col, sliceTop, sliceHeight, color, shade, isExit);

        // Red carpet or exit portal on floor
        if (hintSystem && hintSystem.isActive) {
          this.#drawCarpetFloorStrip(col, sliceTop, sliceHeight, perpDist, rayAngle, player, hintSystem);
        }
        this.#drawExitPortal(col, sliceTop, sliceHeight, perpDist, rayAngle, player, exitRow, exitCol);
      }
    }
  }

  /** Check if tile (r1,c1) is orthogonally adjacent to tile (r2,c2) */
  #isAdjacentTo(r1, c1, r2, c2) {
    const dr = Math.abs(r1 - r2);
    const dc = Math.abs(c1 - c2);
    return (dr + dc) === 1;
  }

  /** Render a glowing portal effect on the floor at the exit tile */
  #drawExitPortal(col, sliceTop, sliceHeight, perpDist, rayAngle, player, exitRow, exitCol) {
    if (perpDist > 10) return;

    const ctx = this.ctx;
    const floorStart = Math.ceil(sliceTop + sliceHeight);
    const floorEnd = this.height;
    const step = 3;
    const time = performance.now() / 1000;
    const pitchOffset = (player.pitch || 0) * this.height;
    const horizon = this.height / 2 + pitchOffset;

    for (let y = floorStart; y < floorEnd; y += step) {
      const rowDist = this.height / (2.0 * (y - horizon));
      if (rowDist <= 0) continue;

      const floorX = player.x + Math.cos(rayAngle) * rowDist;
      const floorY = player.y + Math.sin(rayAngle) * rowDist;

      const tileCol = Math.floor(floorX);
      const tileRow = Math.floor(floorY);

      if (tileRow === exitRow && tileCol === exitCol) {
        // Pulsing portal glow
        const pulse = 0.5 + 0.5 * Math.sin(time * 3);
        const distFade = Math.max(0.2, 1.0 - rowDist / 8);
        const alpha = distFade * (0.3 + 0.4 * pulse);

        // Concentric ring pattern
        const cx = floorX - tileCol - 0.5;
        const cy = floorY - tileRow - 0.5;
        const dist = Math.sqrt(cx * cx + cy * cy);
        const ring = Math.sin(dist * 12 - time * 4);

        if (ring > 0) {
          ctx.fillStyle = `rgba(255, 204, 0, ${alpha * 0.8})`;
        } else {
          ctx.fillStyle = `rgba(255, 150, 0, ${alpha * 0.4})`;
        }
        ctx.fillRect(col, y, 1, step);
      }
    }
  }

  /**
   * Cast a single ray using DDA on a tile map.
   * Wall = map[row][col] === 1. Much simpler than cell-wall checking.
   */
  #castRay(ox, oy, angle, tileMap) {
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);

    let mapCol = Math.floor(ox);
    let mapRow = Math.floor(oy);

    const deltaDistX = Math.abs(dirX) < 1e-10 ? 1e10 : Math.abs(1 / dirX);
    const deltaDistY = Math.abs(dirY) < 1e-10 ? 1e10 : Math.abs(1 / dirY);

    let stepCol, stepRow, sideDistX, sideDistY;

    if (dirX < 0) {
      stepCol = -1;
      sideDistX = (ox - mapCol) * deltaDistX;
    } else {
      stepCol = 1;
      sideDistX = (mapCol + 1 - ox) * deltaDistX;
    }

    if (dirY < 0) {
      stepRow = -1;
      sideDistY = (oy - mapRow) * deltaDistY;
    } else {
      stepRow = 1;
      sideDistY = (mapRow + 1 - oy) * deltaDistY;
    }

    const maxSteps = 400;
    const hit = this._hitResult;
    const mapH = tileMap.length;
    const mapW = tileMap[0].length;

    for (let i = 0; i < maxSteps; i++) {
      if (sideDistX < sideDistY) {
        sideDistX += deltaDistX;
        mapCol += stepCol;
        hit.side = 0;
      } else {
        sideDistY += deltaDistY;
        mapRow += stepRow;
        hit.side = 1;
      }

      // Out of bounds
      if (mapRow < 0 || mapRow >= mapH || mapCol < 0 || mapCol >= mapW) {
        hit.distance = hit.side === 0
          ? (sideDistX - deltaDistX)
          : (sideDistY - deltaDistY);
        hit.mapRow = Math.max(0, Math.min(mapRow, mapH - 1));
        hit.mapCol = Math.max(0, Math.min(mapCol, mapW - 1));
        return hit;
      }

      // Hit a wall tile
      if (tileMap[mapRow][mapCol] === 1) {
        hit.distance = hit.side === 0
          ? (sideDistX - deltaDistX)
          : (sideDistY - deltaDistY);
        hit.mapRow = mapRow;
        hit.mapCol = mapCol;
        return hit;
      }
    }

    return null;
  }

  /**
   * Draw a single vertical wall slice with wireframe aesthetic.
   * @param {number} x — screen column
   * @param {number} top — top of wall slice
   * @param {number} height — height of wall slice
   * @param {string} color — base color hex
   * @param {number} shade — brightness 0..1
   * @param {boolean} isExit — draw with glow effect
   */
  #drawWallSlice(x, top, height, color, shade, isExit) {
    const ctx = this.ctx;
    // Edge thickness proportional to wall height (closer = thicker edges)
    const edgeThick = Math.max(1, Math.round(height / 60));

    if (isExit) {
      ctx.fillStyle = this.#applyShade(COLORS.exit, shade);
      ctx.fillRect(x, top, 1, height);
      ctx.fillStyle = this.#applyShade(COLORS.exitGlow, shade * VISUAL.maxShadeBoost);
      ctx.fillRect(x, top, 1, edgeThick * 2);
      ctx.fillRect(x, top + height - edgeThick * 2, 1, edgeThick * 2);
    } else {
      const shadedColor = this.#applyShade(color, shade);

      // Solid fill with visible depth shading
      ctx.fillStyle = this.#applyShade(color, shade * VISUAL.depthFillMultiplier * 2.5);
      ctx.fillRect(x, top, 1, height);

      // Top and bottom edges — proportional thickness
      ctx.fillStyle = shadedColor;
      ctx.fillRect(x, top, 1, edgeThick);
      ctx.fillRect(x, top + height - edgeThick, 1, edgeThick);

      // Vertical accent lines for wireframe structure
      if (x % VISUAL.accentColumnInterval === 0) {
        ctx.globalAlpha = shade * VISUAL.accentOpacity * 1.5;
        ctx.fillStyle = color;
        ctx.fillRect(x, top, 1, height);
        ctx.globalAlpha = 1.0;
      }
    }
  }

  /**
   * Apply brightness shade to a color using pre-parsed RGB tuples. [Fix 2]
   * Pure arithmetic — no parseInt/slice on hot path.
   * @param {string} hex — color key matching a COLORS entry (e.g. '#00cccc')
   * @param {number} shade — 0..1 brightness multiplier
   * @returns {string} shaded color as rgb() string
   */
  #applyShade(hex, shade) {
    const rgb = COLORS_RGB[this._colorKeyCache.get(hex)] || this.#parseHexFallback(hex);
    const s = Math.min(1, Math.max(0, shade));
    return `rgb(${rgb.r * s | 0},${rgb.g * s | 0},${rgb.b * s | 0})`;
  }

  /**
   * Fallback for hex values not in COLORS_RGB (should not happen in normal flow).
   * @param {string} hex
   * @returns {{ r: number, g: number, b: number }}
   */
  #parseHexFallback(hex) {
    return {
      r: parseInt(hex.slice(1, 3), 16),
      g: parseInt(hex.slice(3, 5), 16),
      b: parseInt(hex.slice(5, 7), 16),
    };
  }

  /**
   * Draw a red carpet floor strip below a wall slice for hint-path cells. [AC10] [AC11]
   *
   * For each screen column, after drawing the wall slice, samples the floor area
   * at a representative depth to determine which maze cell it maps to.
   * If that cell is on the hint path AND within FOV distance, draws red floor.
   *
   * @param {number} col — screen column
   * @param {number} sliceTop — top of wall slice
   * @param {number} sliceHeight — height of wall slice
   * @param {number} perpDist — perpendicular distance to the wall hit
   * @param {number} rayAngle — angle of this ray
   * @param {Object} player — { x, y, angle }
   * @param {import('./hint.js').HintSystem} hintSystem
   */
  #drawCarpetFloorStrip(col, sliceTop, sliceHeight, perpDist, rayAngle, player, hintSystem) {
    const ctx = this.ctx;
    const pitchOffset = (player.pitch || 0) * this.height;
    const halfH = this.height / 2 + pitchOffset;
    const floorStart = Math.ceil(sliceTop + sliceHeight);

    if (floorStart >= this.height) return;

    const dirX = Math.cos(rayAngle);
    const dirY = Math.sin(rayAngle);
    const cosAngleDiff = Math.cos(rayAngle - player.angle);
    const maxDist = VISUAL.carpetMaxDistance;

    // Sample floor pixels in bands for efficiency [CLEAN-CODE]
    const step = 3; // sample every 3rd pixel for performance
    for (let y = floorStart; y < this.height; y += step) {
      // Reverse-project screen Y to world distance
      const rowDist = halfH / (y - halfH);
      // Correct for fisheye
      const worldDist = rowDist / cosAngleDiff;

      // Only render carpet within FOV distance [AC11]
      if (worldDist > maxDist) continue;

      // Calculate world position of this floor pixel
      const floorX = player.x + dirX * worldDist;
      const floorY = player.y + dirY * worldDist;

      const cellCol = Math.floor(floorX);
      const cellRow = Math.floor(floorY);

      // Check if this cell is on the hint path
      if (hintSystem.isOnPath(cellRow, cellCol)) {
        // Distance-based fade for subtle appearance
        const fade = Math.max(0.2, 1.0 - worldDist / maxDist);
        ctx.fillStyle = this.#applyShade(COLORS.carpet, fade * 0.7);
        ctx.fillRect(col, y, 1, step);
      }
    }
  }

  /**
   * Draw overlay text (used for game state messages).
   * @param {string} text
   * @param {string} [color='#ffffff']
   * @param {number} [fontSize=48]
   */
  drawOverlayText(text, color = '#ffffff', fontSize = 48) {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, this.height / 2 - fontSize, this.width, fontSize * 2.5);
    ctx.font = `bold ${fontSize}px monospace`;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, this.width / 2, this.height / 2);
    ctx.restore();
  }

  /**
   * Draw a simple subtitle below the main text.
   * @param {string} text
   * @param {string} [color='#888888']
   * @param {number} [fontSize=20]
   */
  drawSubtitle(text, color = '#888888', fontSize = 20) {
    const ctx = this.ctx;
    ctx.save();
    ctx.font = `${fontSize}px monospace`;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, this.width / 2, this.height / 2 + 40);
    ctx.restore();
  }

  /**
   * Draw a mini heading-indicator showing player direction (HUD element). [Fix 4]
   * Note: this is a heading indicator, not a compass — no cardinal labels.
   * @param {number} angle — player angle in radians
   */
  drawCompass(angle) {
    const ctx = this.ctx;
    const cx = this.width - 40;
    const cy = 40;
    const r = 20;

    ctx.save();
    ctx.globalAlpha = 0.4;

    // Circle
    ctx.strokeStyle = '#00cccc';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    // Direction needle
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(angle) * r * 0.8, cy + Math.sin(angle) * r * 0.8);
    ctx.stroke();

    ctx.globalAlpha = 1.0;
    ctx.restore();
  }

  /**
   * Draw minimap in top-left corner with optional fog of war and hint path. [AC20]
   * @param {Cell[][]} grid
   * @param {Object} player — { x, y, angle }
   * @param {number} exitRow
   * @param {number} exitCol
   * @param {Object} [options]
   * @param {Set<string>} [options.visitedCells] — fog of war: only show visited cells
   * @param {import('./hint.js').HintSystem} [options.hintSystem] — show hint path on minimap
   */
  drawMinimap(grid, player, exitRow, exitCol, options) {
    const ctx = this.ctx;
    const mapRows = grid.length;
    const mapCols = grid[0].length;
    // Scale cell size to fit minimap within ~25% of screen height
    const maxMapPx = Math.min(this.width * 0.25, this.height * 0.35);
    const cellSize = Math.max(4, Math.floor(maxMapPx / Math.max(mapRows, mapCols)));
    const padding = 10;
    const topMargin = 40; // Below HUD text
    const visitedCells = options && options.visitedCells;
    const hintSystem = options && options.hintSystem;

    ctx.save();
    ctx.globalAlpha = 0.5;

    // Background
    ctx.fillStyle = '#000000';
    ctx.fillRect(padding - 2, topMargin + padding - 2, mapCols * cellSize + 4, mapRows * cellSize + 4);

    // Draw cells and walls
    for (let row = 0; row < mapRows; row++) {
      for (let col = 0; col < mapCols; col++) {
        const x = padding + col * cellSize;
        const y = topMargin + padding + row * cellSize;
        const cell = grid[row][col];
        const cellKey = `${row},${col}`;

        // Fog of war: skip cells the player hasn't visited [AC20]
        const isExitCell = row === exitRow && col === exitCol;
        const isVisited = !visitedCells || visitedCells.has(cellKey);

        if (!isVisited && !isExitCell) {
          // Unexplored cell — dark fog
          ctx.fillStyle = '#050510';
          ctx.fillRect(x, y, cellSize, cellSize);
          continue;
        }

        // Cell fill
        if (isExitCell) {
          ctx.fillStyle = '#332200';
        } else if (hintSystem && hintSystem.isOnPath(row, col)) {
          // Hint path on minimap — subtle red tint
          ctx.fillStyle = '#1a0808';
        } else {
          ctx.fillStyle = '#0a0a1a';
        }
        ctx.fillRect(x, y, cellSize, cellSize);

        // Draw walls
        ctx.strokeStyle = '#00cccc';
        ctx.lineWidth = 1;

        if (cell.north) {
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + cellSize, y);
          ctx.stroke();
        }
        if (cell.south) {
          ctx.beginPath();
          ctx.moveTo(x, y + cellSize);
          ctx.lineTo(x + cellSize, y + cellSize);
          ctx.stroke();
        }
        if (cell.west) {
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x, y + cellSize);
          ctx.stroke();
        }
        if (cell.east) {
          ctx.beginPath();
          ctx.moveTo(x + cellSize, y);
          ctx.lineTo(x + cellSize, y + cellSize);
          ctx.stroke();
        }
      }
    }

    // Hint path line on minimap [AC20]
    if (hintSystem && hintSystem.isActive && hintSystem.currentPath) {
      ctx.strokeStyle = '#cc2222';
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      const path = hintSystem.currentPath;
      for (let i = 0; i < path.length; i++) {
        const px = padding + (path[i][1] + 0.5) * cellSize;
        const py = topMargin + padding + (path[i][0] + 0.5) * cellSize;
        if (i === 0) {
          ctx.moveTo(px, py);
        } else {
          ctx.lineTo(px, py);
        }
      }
      ctx.stroke();
      ctx.globalAlpha = 0.5;
    }

    // Player dot (green with direction indicator) [AC20]
    const px = padding + player.x * cellSize;
    const py = topMargin + padding + player.y * cellSize;
    ctx.fillStyle = '#33ff33';
    ctx.beginPath();
    ctx.arc(px, py, Math.max(3, cellSize * 0.4), 0, Math.PI * 2);
    ctx.fill();

    // Player direction indicator
    ctx.strokeStyle = '#33ff33';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px, py);
    const dirLen = Math.max(6, cellSize * 0.8);
    ctx.lineTo(px + Math.cos(player.angle) * dirLen, py + Math.sin(player.angle) * dirLen);
    ctx.stroke();

    // Exit marker (red — always visible regardless of fog) [AC20]
    const ex = padding + (exitCol + 0.5) * cellSize;
    const ey = padding + (exitRow + 0.5) * cellSize;
    ctx.fillStyle = '#ff3333';
    ctx.beginPath();
    ctx.arc(ex, ey, 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 1.0;
    ctx.restore();
  }

  /**
   * Draw FPS counter in the bottom-left corner. [AC: FPS Counter]
   * @param {number} fps — current frames per second
   */
  drawFpsCounter(fps) {
    const ctx = this.ctx;
    ctx.save();

    const isWarning = fps < 30;
    const text = `${Math.round(fps)} FPS`;
    ctx.font = '12px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = isWarning ? 'rgba(255, 80, 80, 0.8)' : 'rgba(0, 204, 204, 0.5)';
    ctx.fillText(text, 10, this.height - 10);

    if (isWarning) {
      ctx.fillStyle = 'rgba(255, 80, 80, 0.6)';
      ctx.fillText('⚠', 10 + ctx.measureText(text).width + 5, this.height - 10);
    }

    ctx.restore();
  }
}

export { RaycastRenderer, COLORS, COLORS_RGB, VISUAL };
