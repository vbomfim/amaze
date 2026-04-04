/**
 * TouchInput — Mobile touch controls with dual virtual joysticks.
 *
 * Left half of screen = movement joystick (moveX, moveY).
 * Right half of screen = look joystick (lookX — horizontal only).
 * Dynamic positioning — joystick center appears where finger first touches.
 *
 * [TDD] [CLEAN-CODE] [SOLID] — Single responsibility: touch input processing
 */

// ── Feature Detection ─────────────────────────────────────────

/**
 * Detect touch device using feature detection (not user-agent sniffing).
 * @returns {boolean}
 */
function isTouchDevice() {
  if (typeof window === 'undefined') return false;
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

/**
 * Detect portrait orientation.
 * @param {number} width — viewport width
 * @param {number} height — viewport height
 * @returns {boolean}
 */
function isPortrait(width, height) {
  return height > width;
}

// ── Responsive UI Helpers ─────────────────────────────────────

/**
 * Calculate responsive font size based on canvas height.
 * @param {number} canvasHeight
 * @returns {number} font size in pixels
 */
function getResponsiveFontSize(canvasHeight) {
  return Math.max(12, Math.round(canvasHeight * 0.025));
}

/**
 * Calculate responsive button size.
 * @param {number} canvasWidth
 * @param {number} canvasHeight
 * @returns {{ width: number, height: number }}
 */
function getResponsiveButtonSize(canvasWidth, canvasHeight) {
  const width = Math.min(260, Math.round(canvasWidth * 0.6));
  const height = Math.max(44, Math.round(canvasHeight * 0.065));
  return { width, height };
}

/**
 * Get ray scale factor for mobile performance.
 * @param {boolean} isTouch — whether device is touch-enabled
 * @returns {number} 1 for desktop, 2 for mobile
 */
function getMobileRayScale(isTouch) {
  return isTouch ? 2 : 1;
}

/**
 * Get maximum sprite render distance for mobile performance.
 * @param {boolean} isTouch
 * @returns {number}
 */
function getMobileSpriteMaxDist(isTouch) {
  return isTouch ? 16 : 24;
}

// ── VirtualJoystick ───────────────────────────────────────────

/** Default joystick configuration */
const JOYSTICK_DEFAULTS = {
  radius: 50,
  fadeTime: 0.5,
  baseColor: 'rgba(0, 204, 204, 0.25)',
  thumbColor: 'rgba(0, 204, 204, 0.5)',
  baseRadius: 50,
  thumbRadius: 20,
};

/**
 * VirtualJoystick — Manages a single virtual joystick state and rendering.
 *
 * Tracks center position (where finger first touched), thumb position
 * (current finger position), and normalized delta (dx, dy in [-1, 1]).
 */
class VirtualJoystick {
  /**
   * @param {Object} [options]
   * @param {number} [options.radius=50] — maximum thumb distance from center
   * @param {number} [options.fadeTime=0.5] — fade-out duration in seconds
   */
  constructor(options = {}) {
    this.radius = options.radius || JOYSTICK_DEFAULTS.radius;
    this.fadeTime = options.fadeTime || JOYSTICK_DEFAULTS.fadeTime;

    /** Whether the joystick is actively being touched */
    this.active = false;

    /** Center position (where finger first touched) */
    this.centerX = 0;
    this.centerY = 0;

    /** Current thumb position (clamped to radius) */
    this.thumbX = 0;
    this.thumbY = 0;

    /** Normalized delta: -1 to 1 on each axis */
    this.dx = 0;
    this.dy = 0;

    /** Fade alpha for rendering (1 = visible, 0 = hidden) */
    this.fadeAlpha = 0;

    /** Touch identifier tracking this joystick */
    this._touchId = null;
  }

  /**
   * Activate the joystick at a touch position (dynamic positioning).
   * @param {number} x — touch start X (canvas coordinates)
   * @param {number} y — touch start Y (canvas coordinates)
   */
  activate(x, y) {
    this.active = true;
    this.centerX = x;
    this.centerY = y;
    this.thumbX = x;
    this.thumbY = y;
    this.dx = 0;
    this.dy = 0;
    this.fadeAlpha = 1;
  }

  /**
   * Update thumb position and compute normalized delta.
   * Clamps thumb to radius distance from center.
   * @param {number} x — current touch X
   * @param {number} y — current touch Y
   */
  updateThumb(x, y) {
    const rawDx = x - this.centerX;
    const rawDy = y - this.centerY;
    const dist = Math.sqrt(rawDx * rawDx + rawDy * rawDy);

    if (dist > this.radius) {
      // Clamp to radius
      const scale = this.radius / dist;
      this.thumbX = this.centerX + rawDx * scale;
      this.thumbY = this.centerY + rawDy * scale;
      this.dx = (rawDx * scale) / this.radius;
      this.dy = (rawDy * scale) / this.radius;
    } else {
      this.thumbX = x;
      this.thumbY = y;
      this.dx = rawDx / this.radius;
      this.dy = rawDy / this.radius;
    }
  }

  /**
   * Deactivate the joystick (finger lifted). Resets delta but starts fade.
   */
  deactivate() {
    this.active = false;
    this.dx = 0;
    this.dy = 0;
    this._touchId = null;
    // fadeAlpha stays at current value — will fade via updateFade()
  }

  /**
   * Update fade-out animation.
   * @param {number} dt — delta time in seconds
   */
  updateFade(dt) {
    if (!this.active && this.fadeAlpha > 0) {
      this.fadeAlpha = Math.max(0, this.fadeAlpha - dt / this.fadeTime);
    }
  }

  /**
   * Render the joystick overlay on the canvas.
   * @param {CanvasRenderingContext2D} ctx
   */
  render(ctx) {
    if (this.fadeAlpha <= 0) return;

    ctx.save();
    ctx.globalAlpha = this.fadeAlpha;

    // Outer ring (base)
    ctx.beginPath();
    ctx.arc(this.centerX, this.centerY, JOYSTICK_DEFAULTS.baseRadius, 0, Math.PI * 2);
    ctx.strokeStyle = JOYSTICK_DEFAULTS.baseColor;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
    ctx.fill();

    // Inner circle (thumb)
    ctx.beginPath();
    ctx.arc(this.thumbX, this.thumbY, JOYSTICK_DEFAULTS.thumbRadius, 0, Math.PI * 2);
    ctx.fillStyle = JOYSTICK_DEFAULTS.thumbColor;
    ctx.fill();

    ctx.restore();
  }
}

// ── TouchInput ────────────────────────────────────────────────

/**
 * TouchInput — Manages dual virtual joystick touch input.
 *
 * Listens for touch events, routes touches to left (movement) or
 * right (look) joystick based on screen half. Tracks up to 2 fingers.
 */
class TouchInput {
  /**
   * @param {Object} config
   * @param {number} config.canvasWidth — canvas width in pixels
   * @param {number} config.canvasHeight — canvas height in pixels
   */
  constructor({ canvasWidth, canvasHeight }) {
    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;

    this.moveJoystick = new VirtualJoystick();
    this.lookJoystick = new VirtualJoystick();

    /** Map of active touch identifiers to joystick assignment ('move' | 'look') */
    this._touchMap = new Map();
  }

  /** Whether any touch is currently active */
  get isActive() {
    return this.moveJoystick.active || this.lookJoystick.active;
  }

  /**
   * Update canvas dimensions (e.g., on resize).
   * @param {number} width
   * @param {number} height
   */
  updateDimensions(width, height) {
    this.canvasWidth = width;
    this.canvasHeight = height;
  }

  /**
   * Handle touchstart — route new touches to appropriate joystick.
   * @param {Touch[]} changedTouches — array-like of changed touches
   */
  handleTouchStart(changedTouches) {
    for (const touch of changedTouches) {
      // Limit to 2 simultaneous touches
      if (this._touchMap.size >= 2) break;

      const x = touch.clientX;
      const halfWidth = this.canvasWidth / 2;

      if (x < halfWidth && !this.moveJoystick.active) {
        // Left half → movement joystick
        this.moveJoystick.activate(touch.clientX, touch.clientY);
        this.moveJoystick._touchId = touch.identifier;
        this._touchMap.set(touch.identifier, 'move');
      } else if (x >= halfWidth && !this.lookJoystick.active) {
        // Right half → look joystick
        this.lookJoystick.activate(touch.clientX, touch.clientY);
        this.lookJoystick._touchId = touch.identifier;
        this._touchMap.set(touch.identifier, 'look');
      }
    }
  }

  /**
   * Handle touchmove — update the joystick for the moving finger.
   * @param {Touch[]} changedTouches
   */
  handleTouchMove(changedTouches) {
    for (const touch of changedTouches) {
      const assignment = this._touchMap.get(touch.identifier);
      if (assignment === 'move') {
        this.moveJoystick.updateThumb(touch.clientX, touch.clientY);
      } else if (assignment === 'look') {
        this.lookJoystick.updateThumb(touch.clientX, touch.clientY);
      }
    }
  }

  /**
   * Handle touchend — deactivate the joystick for the lifted finger.
   * @param {Touch[]} changedTouches
   */
  handleTouchEnd(changedTouches) {
    for (const touch of changedTouches) {
      const assignment = this._touchMap.get(touch.identifier);
      if (assignment === 'move') {
        this.moveJoystick.deactivate();
      } else if (assignment === 'look') {
        this.lookJoystick.deactivate();
      }
      this._touchMap.delete(touch.identifier);
    }
  }

  /**
   * Handle touchcancel — same as touchend.
   * @param {Touch[]} changedTouches
   */
  handleTouchCancel(changedTouches) {
    this.handleTouchEnd(changedTouches);
  }

  /**
   * Get normalized input values for the current frame.
   * @returns {{ moveX: number, moveY: number, lookX: number }}
   */
  getInput() {
    return {
      moveX: this.moveJoystick.active ? this.moveJoystick.dx : 0,
      moveY: this.moveJoystick.active ? this.moveJoystick.dy : 0,
      lookX: this.lookJoystick.active ? this.lookJoystick.dx : 0,
    };
  }

  /**
   * Update fade animations for both joysticks.
   * @param {number} dt — delta time in seconds
   */
  updateFade(dt) {
    this.moveJoystick.updateFade(dt);
    this.lookJoystick.updateFade(dt);
  }

  /**
   * Render both joystick overlays.
   * @param {CanvasRenderingContext2D} ctx
   */
  render(ctx) {
    this.moveJoystick.render(ctx);
    this.lookJoystick.render(ctx);
  }

  /**
   * Bind touch event listeners to a canvas element.
   * @param {HTMLCanvasElement} canvas
   * @param {{ signal?: AbortSignal }} [options]
   */
  bind(canvas, options = {}) {
    const opts = { passive: false, ...(options.signal ? { signal: options.signal } : {}) };

    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.handleTouchStart(e.changedTouches);
    }, opts);

    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      this.handleTouchMove(e.changedTouches);
    }, opts);

    canvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      this.handleTouchEnd(e.changedTouches);
    }, opts);

    canvas.addEventListener('touchcancel', (e) => {
      e.preventDefault();
      this.handleTouchCancel(e.changedTouches);
    }, opts);
  }
}

export {
  isTouchDevice,
  isPortrait,
  TouchInput,
  VirtualJoystick,
  getResponsiveFontSize,
  getResponsiveButtonSize,
  getMobileRayScale,
  getMobileSpriteMaxDist,
};
