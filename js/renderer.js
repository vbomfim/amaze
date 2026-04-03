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
  /** Minimum brightness so distant walls don't vanish entirely */
  minShade: 0.15,
  /** Maximum shade multiplier for bright edge accents */
  maxShadeBoost: 1.2,
  /** Distance at which walls fade to minimum shade */
  shadeDropoffDistance: 12,
  /** Column interval for wireframe accent lines */
  accentColumnInterval: 4,
  /** Opacity multiplier for wireframe accent fill */
  accentOpacity: 0.3,
  /** Dim fill multiplier for wall depth fill */
  depthFillMultiplier: 0.15,
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

    // TODO: Add depthBuffer back when sprite rendering is implemented [YAGNI][Fix 11]
    // Reusable hit-result object — avoids per-ray allocation [Fix 2]
    this._hitResult = { distance: 0, side: 0, mapRow: 0, mapCol: 0 };

    // Reverse lookup: hex value → COLORS key for pre-parsed RGB [Fix 2]
    this._colorKeyCache = new Map(
      Object.entries(COLORS).map(([key, hex]) => [hex, key])
    );
  }

  /**
   * Render a single frame of the 3D view.
   * @param {Object} player — { x, y, angle, fov }
   * @param {Cell[][]} grid — maze grid
   * @param {number} exitRow
   * @param {number} exitCol
   */
  render(player, grid, exitRow, exitCol) {
    this.#drawBackground();
    this.#castAllRays(player, grid, exitRow, exitCol);
  }

  /** Draw ceiling and floor as solid color bands. */
  #drawBackground() {
    const ctx = this.ctx;
    const halfH = this.height / 2;

    // Ceiling
    ctx.fillStyle = COLORS.ceiling;
    ctx.fillRect(0, 0, this.width, halfH);

    // Floor
    ctx.fillStyle = COLORS.floor;
    ctx.fillRect(0, halfH, this.width, halfH);
  }

  /**
   * Cast one ray per screen column using the DDA algorithm.
   * @param {Object} player
   * @param {Cell[][]} grid
   * @param {number} exitRow
   * @param {number} exitCol
   */
  #castAllRays(player, grid, exitRow, exitCol) {
    const numRays = this.width;
    const halfFov = player.fov / 2;

    for (let col = 0; col < numRays; col++) {
      // Calculate ray angle: spread across FOV from left to right
      const rayFraction = (col / numRays) * 2 - 1; // -1 to +1
      const rayAngle = player.angle + rayFraction * halfFov;

      const hit = this.#castRay(player.x, player.y, rayAngle, grid);

      if (hit) {
        // Fix fisheye distortion: use perpendicular distance
        const perpDist = hit.distance * Math.cos(rayAngle - player.angle);

        // Calculate wall slice height (inversely proportional to distance)
        const sliceHeight = Math.min(this.height * 2, this.height / perpDist);
        const sliceTop = (this.height - sliceHeight) / 2;

        // Choose color based on wall orientation and whether it's the exit
        const isExit = hit.mapRow === exitRow && hit.mapCol === exitCol;
        let color;

        if (isExit) {
          // Pulsing glow effect for exit
          color = COLORS.exit;
        } else {
          color = hit.side === 0 ? COLORS.wallNS : COLORS.wallEW;
        }

        // Apply distance-based shading (fade to dark with distance) [Fix 15]
        const shade = Math.max(VISUAL.minShade, 1.0 - perpDist / VISUAL.shadeDropoffDistance);

        this.#drawWallSlice(col, sliceTop, sliceHeight, color, shade, isExit);
      }
    }
  }

  /**
   * Cast a single ray using the DDA (Digital Differential Analysis) algorithm.
   * Efficient grid traversal — steps through cell boundaries one at a time.
   * Writes into this._hitResult to avoid per-ray object allocation. [Fix 2]
   *
   * @param {number} ox — ray origin X
   * @param {number} oy — ray origin Y
   * @param {number} angle — ray direction in radians
   * @param {Cell[][]} grid
   * @returns {{ distance: number, side: number, mapRow: number, mapCol: number } | null}
   */
  #castRay(ox, oy, angle, grid) {
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);

    // Current grid cell
    let mapCol = Math.floor(ox);
    let mapRow = Math.floor(oy);

    // Length of ray from one X/Y side to next X/Y side
    const deltaDistX = Math.abs(dirX) < 1e-10 ? 1e10 : Math.abs(1 / dirX);
    const deltaDistY = Math.abs(dirY) < 1e-10 ? 1e10 : Math.abs(1 / dirY);

    // Step direction and initial side distances
    let stepCol, stepRow;
    let sideDistX, sideDistY;

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

    // DDA loop
    let side = 0; // 0 = hit vertical (N/S facing) wall, 1 = hit horizontal (E/W facing) wall
    const maxSteps = 200;
    const hit = this._hitResult;

    for (let i = 0; i < maxSteps; i++) {
      // Step to next cell boundary
      if (sideDistX < sideDistY) {
        // Crossing a vertical boundary (east/west edge)
        const prevCol = mapCol;
        sideDistX += deltaDistX;
        mapCol += stepCol;
        side = 0;

        // Check wall between prevCol and mapCol
        if (this.#hasWallBetweenCols(grid, mapRow, prevCol, mapCol)) {
          // side is always 0 here — use direct assignment [Fix 10]
          hit.distance = sideDistX - deltaDistX;
          hit.side = 0;
          hit.mapRow = mapRow;
          hit.mapCol = mapCol;
          return hit;
        }
      } else {
        // Crossing a horizontal boundary (north/south edge)
        const prevRow = mapRow;
        sideDistY += deltaDistY;
        mapRow += stepRow;
        side = 1;

        // Check wall between prevRow and mapRow
        if (this.#hasWallBetweenRows(grid, prevRow, mapRow, mapCol)) {
          // side is always 1 here — use direct assignment [Fix 10]
          hit.distance = sideDistY - deltaDistY;
          hit.side = 1;
          hit.mapRow = mapRow;
          hit.mapCol = mapCol;
          return hit;
        }
      }

      // Out of bounds = hit outer wall
      if (mapRow < 0 || mapRow >= grid.length || mapCol < 0 || mapCol >= grid[0].length) {
        hit.distance = side === 0
          ? (sideDistX - deltaDistX)
          : (sideDistY - deltaDistY);
        hit.side = side;
        hit.mapRow = Math.max(0, Math.min(mapRow, grid.length - 1));
        hit.mapCol = Math.max(0, Math.min(mapCol, grid[0].length - 1));
        return hit;
      }
    }

    return null; // No hit within max steps
  }

  /**
   * Check if there's a wall between two horizontally adjacent cells.
   * @param {Cell[][]} grid
   * @param {number} row
   * @param {number} fromCol
   * @param {number} toCol
   * @returns {boolean}
   */
  #hasWallBetweenCols(grid, row, fromCol, toCol) {
    const height = grid.length;
    const width = grid[0].length;

    // Out of bounds = wall
    if (row < 0 || row >= height) return true;
    if (fromCol < 0 || fromCol >= width || toCol < 0 || toCol >= width) return true;

    if (toCol > fromCol) {
      // Moving east: check east wall of fromCol cell
      return grid[row][fromCol].east;
    } else {
      // Moving west: check west wall of fromCol cell
      return grid[row][fromCol].west;
    }
  }

  /**
   * Check if there's a wall between two vertically adjacent cells.
   * @param {Cell[][]} grid
   * @param {number} fromRow
   * @param {number} toRow
   * @param {number} col
   * @returns {boolean}
   */
  #hasWallBetweenRows(grid, fromRow, toRow, col) {
    const height = grid.length;
    const width = grid[0].length;

    if (col < 0 || col >= width) return true;
    if (fromRow < 0 || fromRow >= height || toRow < 0 || toRow >= height) return true;

    if (toRow > fromRow) {
      // Moving south: check south wall of fromRow cell
      return grid[fromRow][col].south;
    } else {
      // Moving north: check north wall of fromRow cell
      return grid[fromRow][col].north;
    }
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

    if (isExit) {
      // Exit: solid glowing column
      ctx.fillStyle = this.#applyShade(COLORS.exit, shade);
      ctx.fillRect(x, top, 1, height);
      // Add bright edge [Fix 15]
      ctx.fillStyle = this.#applyShade(COLORS.exitGlow, shade * VISUAL.maxShadeBoost);
      ctx.fillRect(x, top, 1, 2);
      ctx.fillRect(x, top + height - 2, 1, 2);
    } else {
      // Wireframe style: draw edges of the wall slice
      const shadedColor = this.#applyShade(color, shade);

      // Fill with a very dim version for depth [Fix 15]
      ctx.fillStyle = this.#applyShade(color, shade * VISUAL.depthFillMultiplier);
      ctx.fillRect(x, top, 1, height);

      // Top and bottom edge (bright)
      ctx.fillStyle = shadedColor;
      ctx.fillRect(x, top, 1, 1);
      ctx.fillRect(x, top + height - 1, 1, 1);

      // Add occasional vertical accent lines for wireframe feel [Fix 15]
      if (x % VISUAL.accentColumnInterval === 0) {
        ctx.globalAlpha = shade * VISUAL.accentOpacity;
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
   * Draw minimap in top-left corner.
   * @param {Cell[][]} grid
   * @param {Object} player — { x, y, angle }
   * @param {number} exitRow
   * @param {number} exitCol
   */
  drawMinimap(grid, player, exitRow, exitCol) {
    const ctx = this.ctx;
    const cellSize = 6;
    const padding = 10;
    const mapHeight = grid.length;
    const mapWidth = grid[0].length;

    ctx.save();
    ctx.globalAlpha = 0.5;

    // Background
    ctx.fillStyle = '#000000';
    ctx.fillRect(padding - 2, padding - 2, mapWidth * cellSize + 4, mapHeight * cellSize + 4);

    // Draw cells and walls
    for (let row = 0; row < mapHeight; row++) {
      for (let col = 0; col < mapWidth; col++) {
        const x = padding + col * cellSize;
        const y = padding + row * cellSize;
        const cell = grid[row][col];

        // Cell fill
        if (row === exitRow && col === exitCol) {
          ctx.fillStyle = '#332200';
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

    // Player dot
    const px = padding + player.x * cellSize;
    const py = padding + player.y * cellSize;
    ctx.fillStyle = '#ff3333';
    ctx.beginPath();
    ctx.arc(px, py, 2, 0, Math.PI * 2);
    ctx.fill();

    // Player direction
    ctx.strokeStyle = '#ff3333';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + Math.cos(player.angle) * 6, py + Math.sin(player.angle) * 6);
    ctx.stroke();

    // Exit marker
    const ex = padding + (exitCol + 0.5) * cellSize;
    const ey = padding + (exitRow + 0.5) * cellSize;
    ctx.fillStyle = COLORS.exit;
    ctx.beginPath();
    ctx.arc(ex, ey, 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 1.0;
    ctx.restore();
  }
}

export { RaycastRenderer, COLORS, COLORS_RGB, VISUAL };
