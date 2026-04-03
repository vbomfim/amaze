# 🐭 aMaze

A first-person 3D maze browser game. You are the mouse — navigate through raycasted wireframe mazes, find the cheese, and escape!

## 🎮 Play

> **[Play aMaze](https://vbomfim.github.io/amaze/)** — runs in any modern browser, no install needed.

## Features

- **First-person 3D** — raycasted wireframe corridor view
- **Keyboard controls** — WASD or arrow keys to move and turn
- **Progressive difficulty** — mazes grow from 5×5 to 51×51 across 50 levels
- **Red carpet hints** — press H for a BFS-computed path to the exit
- **Minimap** — press M for a top-down view with fog of war
- **Save progress** — level and scores saved to browser localStorage
- **Zero dependencies** — vanilla JS, HTML5 Canvas, no build step

## 🛠 Development

```bash
# Clone and serve locally (ES modules require a server)
git clone https://github.com/vbomfim/amaze.git
cd amaze
python3 -m http.server 8000
# Open http://localhost:8000
```

### Run tests

```bash
node tests/maze.test.js
node tests/player.test.js
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
| PlayerController | `js/player.js` | Keyboard input, collision, wall sliding |
| Game Loop | `js/main.js` | State management, game loop, level transitions |

**Tech stack:** Vanilla JavaScript (ES2020), HTML5 Canvas 2D, zero dependencies.

## License

MIT
