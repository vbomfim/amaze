/**
 * CollectibleManager — Manages dots, power pellets, and food items.
 *
 * Stores all collectible items with state tracking (active/collected).
 * Provides sprite arrays for SpriteRenderer and handles proximity-based
 * collection detection.
 *
 * Item types:
 * - dot (10 pts) — placed on every open tile from maze generator
 * - power_pellet (50 pts) — 4 corner positions from maze generator
 * - apple (50 pts), cherry (100 pts), pizza (200 pts), cupcake (500 pts)
 *   — placed at random intersections (3+ open neighbors)
 *
 * [TDD] [CLEAN-CODE] [SOLID] — Single responsibility: collectible state management
 */

import { mulberry32 } from './maze.js';

/** Point values for each collectible type */
const POINT_VALUES = {
  dot: 10,
  power_pellet: 50,
  apple: 50,
  cherry: 100,
  pizza: 200,
  cupcake: 500,
};

/** Food types with weighted distribution (lower-point items more frequent) */
const FOOD_WEIGHTS = [
  { type: 'apple', weight: 4 },
  { type: 'cherry', weight: 3 },
  { type: 'pizza', weight: 2 },
  { type: 'cupcake', weight: 1 },
];

/** Total weight for food distribution */
const TOTAL_FOOD_WEIGHT = FOOD_WEIGHTS.reduce((sum, fw) => sum + fw.weight, 0);

/** Proximity threshold for item collection (in tiles) */
const COLLECTION_RADIUS = 0.6;

/** Animation speed for pulsing/spinning effects */
const ANIM_SPEED = 1.5;

class CollectibleManager {
  /**
   * @param {number[][]} dotPositions — [[row, col], ...] from maze generator
   * @param {number[][]} powerPelletPositions — [[row, col], ...] from maze generator
   * @param {number[][]} intersections — [[row, col], ...] cells with 3+ open neighbors
   * @param {number} [seed] — optional PRNG seed for deterministic food placement
   */
  constructor(dotPositions, powerPelletPositions, intersections, seed) {
    /** @type {Map<string, Object>} key = "row,col" → item object */
    this.items = new Map();

    const random = seed !== null && seed !== undefined ? mulberry32(seed) : Math.random;

    this.#createDots(dotPositions);
    this.#createPowerPellets(powerPelletPositions);
    this.#createFoodItems(intersections, random);
  }

  // ── Item Creation ─────────────────────────────────────────

  /**
   * Create dot items at every provided dot position.
   * @param {number[][]} positions — [[row, col], ...]
   */
  #createDots(positions) {
    for (const [row, col] of positions) {
      this.#addItem(row, col, 'dot');
    }
  }

  /**
   * Create power pellet items at corner positions.
   * @param {number[][]} positions — [[row, col], ...]
   */
  #createPowerPellets(positions) {
    for (const [row, col] of positions) {
      this.#addItem(row, col, 'power_pellet');
    }
  }

  /**
   * Place 4–6 food items at random intersections.
   * Uses weighted distribution favoring lower-point items.
   * @param {number[][]} intersections — cells with 3+ open neighbors
   * @param {function} random — PRNG function returning [0, 1)
   */
  #createFoodItems(intersections, random) {
    if (intersections.length === 0) return;

    const count = Math.min(
      intersections.length,
      4 + Math.floor(random() * 3) // 4, 5, or 6
    );

    // Shuffle intersections to pick random ones
    const shuffled = [...intersections];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    for (let i = 0; i < count; i++) {
      const [row, col] = shuffled[i];
      const foodType = this.#pickWeightedFood(random);
      this.#addItem(row, col, foodType);
    }
  }

  /**
   * Pick a food type using weighted random distribution.
   * @param {function} random — PRNG function
   * @returns {string} food type name
   */
  #pickWeightedFood(random) {
    let roll = random() * TOTAL_FOOD_WEIGHT;
    for (const { type, weight } of FOOD_WEIGHTS) {
      roll -= weight;
      if (roll <= 0) return type;
    }
    return FOOD_WEIGHTS[0].type; // fallback
  }

  /**
   * Add a single collectible item to the internal map.
   * @param {number} row — tile row
   * @param {number} col — tile column
   * @param {string} type — item type name
   */
  #addItem(row, col, type) {
    const key = `${row},${col}`;
    this.items.set(key, {
      row,
      col,
      type,
      points: POINT_VALUES[type],
      active: true,
      animPhase: 0,
    });
  }

  // ── Collection ────────────────────────────────────────────

  /**
   * Check if the player is close enough to collect an item.
   * Returns the collected item (with points) or null.
   * Marks collected items as inactive (prevents double-collection).
   *
   * @param {number} playerRow — player row position (float)
   * @param {number} playerCol — player column position (float)
   * @returns {{ type: string, points: number, row: number, col: number } | null}
   */
  checkCollection(playerRow, playerCol) {
    for (const item of this.items.values()) {
      if (!item.active) continue;

      const dRow = Math.abs(playerRow - (item.row + 0.5));
      const dCol = Math.abs(playerCol - (item.col + 0.5));

      if (dRow < COLLECTION_RADIUS && dCol < COLLECTION_RADIUS) {
        item.active = false;
        return { type: item.type, points: item.points, row: item.row, col: item.col };
      }
    }
    return null;
  }

  // ── Sprite Generation ─────────────────────────────────────

  /**
   * Get active sprites for SpriteRenderer.
   * Returns sprite array matching the format: { x, y, type, active, animPhase }
   * Position is tile center: x = col + 0.5, y = row + 0.5
   *
   * @returns {{ x: number, y: number, type: string, active: boolean, animPhase: number }[]}
   */
  getActiveSprites() {
    const sprites = [];
    for (const item of this.items.values()) {
      if (!item.active) continue;
      sprites.push({
        x: item.col + 0.5,
        y: item.row + 0.5,
        type: item.type,
        active: true,
        animPhase: item.animPhase,
      });
    }
    return sprites;
  }

  // ── Level State ───────────────────────────────────────────

  /**
   * Count remaining uncollected dots.
   * Only counts 'dot' type items (not pellets or food).
   * @returns {number}
   */
  getRemainingDots() {
    let count = 0;
    for (const item of this.items.values()) {
      if (item.type === 'dot' && item.active) {
        count++;
      }
    }
    return count;
  }

  /**
   * Check if the level is clear (all dots collected).
   * Food items and power pellets are optional.
   * @returns {boolean}
   */
  isLevelClear() {
    return this.getRemainingDots() === 0;
  }

  // ── Animation ─────────────────────────────────────────────

  /**
   * Update animation phases for active items (pulsing, spinning).
   * @param {number} dt — delta time in seconds
   */
  updateAnimations(dt) {
    for (const item of this.items.values()) {
      if (!item.active) continue;
      item.animPhase = (item.animPhase + dt * ANIM_SPEED) % 1;
    }
  }
}

export { CollectibleManager, POINT_VALUES, COLLECTION_RADIUS };
