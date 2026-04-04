# 🐭 aMaze

A first-person 3D maze browser game with two modes. You are the mouse!

## 🎮 Play Now

> ### **[▶ Play aMaze](https://vbomfim.github.io/amaze/)** — runs in any modern browser, no install needed.

## Game Modes

### 🧀 Maze Mode
Navigate through raycasted 3D mazes, find the cheese, and escape! 50 levels of increasing difficulty.

### 👻 PAC-MAN Mode
Collect dots, avoid ghosts, eat power pellets! Classic arcade gameplay in first-person 3D.

## Features

- **First-person 3D** — raycasted corridor view with day/night sky
- **Two game modes** — Maze escape + PAC-MAN chase
- **Mouse look** — click to capture pointer, look around like an FPS
- **Keyboard controls** — WASD/arrows, Shift+arrows to strafe, Ctrl for slow walk
- **4 AI ghosts** — Blinky, Pinky, Inky, Clyde with distinct chase personalities
- **Red carpet hints** — press H for a BFS-computed path to the exit (Maze Mode)
- **Arcade minimap** — classic top-down view with ghosts, dots, and PAC-MAN player
- **Progressive difficulty** — mazes grow larger, ghosts get faster
- **Sound effects** — synthesized waka-waka, ghost sirens, jingles (Web Audio API)
- **Save progress** — scores saved to browser localStorage
- **Zero dependencies** — vanilla JS, HTML5 Canvas, no build step

## Controls

| Key | Action |
|-----|--------|
| WASD / ↑↓←→ | Move and turn |
| Shift + ←/→ | Strafe sideways |
| Ctrl + move | Slow walk |
| Mouse (click) | Look around (pointer lock) |
| H | Hint — red carpet to exit (Maze Mode) |
| M | Minimap toggle (Maze Mode) |
| T | Day/night sky toggle |
| N | Mute/unmute sounds |
| F | FPS counter |
| ESC | Pause |

## 🛠 Development

```bash
git clone https://github.com/vbomfim/amaze.git
cd amaze
python3 -m http.server 8000
# Open http://localhost:8000
```

### Run tests

```bash
# Run all tests
for f in tests/*.test.js; do node "$f"; done
```

### Lint

```bash
npx eslint@9 js/ -c eslint.config.js
```

## Architecture

| Component | File | Responsibility |
|-----------|------|---------------|
| MazeGenerator | `js/maze.js` | Recursive backtracker maze generation |
| RaycastRenderer | `js/renderer.js` | First-person 3D rendering via raycasting |
| PlayerController | `js/player.js` | Keyboard/mouse input, collision, wall sliding |
| GameStateManager | `js/game-state.js` | Level progression, scoring, save/load |
| HintSystem | `js/hint.js` | BFS pathfinding, red carpet rendering |
| AudioManager | `js/audio.js` | Web Audio API synthesized sound effects |
| SpriteRenderer | `js/sprites.js` | Billboard sprites in 3D (ghosts, dots, food) |
| PacManMazeGenerator | `js/pacman-maze.js` | Arcade-style symmetric mazes with ghost house |
| CollectibleManager | `js/collectibles.js` | Dots, food items, power pellets |
| GhostAI | `js/ghost.js` | 4 ghost personalities with state machine |
| PacManMode | `js/pacman-mode.js` | PAC-MAN game loop orchestrator |
| Game | `js/main.js` | Main orchestrator, mode selection, Maze Mode loop |

**Tech stack:** Vanilla JavaScript (ES2020), HTML5 Canvas 2D, Web Audio API, zero dependencies.

## License

MIT
