# Shaderbox (ENS Warp&Weft)

React + Vite app for **ENS-style weave drafts** and **image-to-grid mosaic** experiments. The in-app product name is **ENS Warp&Weft**. Rendering is **WebGL 1** on `<canvas>`; the shell uses **Tailwind CSS**, **Radix** primitives, and **Motion**.

**Repository:** [github.com/ali-rasheed/Jacquard](https://github.com/ali-rasheed/Jacquard)

---

## Quick links

| Page | Path | Purpose |
|------|------|---------|
| **Main app** | [`/`](index.html) | Weave + Mosaic editors, capture bar, export |
| **Design system** | [`/design-system.html`](design-system.html) | UI token and component gallery |
| **Canvas demo** | [`/canvas-demo.html`](canvas-demo.html) | Standalone Weave specimen gallery |

Full product behavior, URL params, and architecture: **[`docs/FEATURES.md`](docs/FEATURES.md)**.

---

## Prerequisites

- **Node.js** 18+ (20+ recommended)
- **npm** (lockfile is `package-lock.json`)

Optional: [Portless](https://port1355.dev/) for stable local URLs (`npm install -g portless`).

---

## Install

```bash
npm install
```

---

## Development

| Command | URL / notes |
|---------|-------------|
| `npm run dev` | [http://localhost:5173](http://localhost:5173) — ESLint check, then Vite |
| `npm run devp` | [http://shaderbox.localhost:1355](http://shaderbox.localhost:1355) — Portless proxy |
| `npm run dev:ds` | Design system at `/design-system.html` |
| `npm run devp:ds` | [http://shaderbox-design-system.localhost:1355/design-system.html](http://shaderbox-design-system.localhost:1355/design-system.html) |
| `npm run dev:canvas` | Canvas demo at `/canvas-demo.html` |
| `npm run devp:canvas` | [http://shaderbox-canvas-demo.localhost:1355/canvas-demo.html](http://shaderbox-canvas-demo.localhost:1355/canvas-demo.html) |

Vite dev server port defaults to **5173** (`vite.config.js`).

---

## Build & preview

```bash
npm run build    # eslint + vite build → dist/
npm run preview  # serve production build locally
```

**Output:** `dist/` with three HTML entry points (`index.html`, `design-system.html`, `canvas-demo.html`). Assets use relative paths (`base: './'`) so the build works on static hosts and subpaths.

### Deploy (Netlify)

[`netlify.toml`](netlify.toml) is configured:

- **Build command:** `npm run build`
- **Publish directory:** `dist`
- **SPA fallback:** `/*` → `/index.html` (200)

Connect the repo in Netlify or run `netlify deploy --prod` after a local build. Add your live site URL here when you have one.

### Optional access gate

For password-protected previews, set at **build time**:

```bash
# .env (see .env.example)
VITE_ACCESS_PASSWORD=your-shared-password
```

Leave unset for local dev (no gate). Unlock persists per device in `localStorage`.

---

## Scripts

| Script | Description |
|--------|-------------|
| `npm run check` | ESLint on `src/` (zero warnings) |
| `npm test` | Vitest unit tests |
| `npm run preset-maker` | CLI helper for weave presets (`bin/preset-maker.js`) |

---

## Modes (main app)

| Mode | URL | Surface |
|------|-----|---------|
| **Weave** | `?v=1` or omit | `ShaderCanvas` — warp/weft grid, gradients, shimmer, colorways, optional CMYK halftone |
| **Mosaic** | `?v=2` | `AppV2` — image / video / GIF → rect grid, tile art, stitch-in, optional halftone |

Legacy `?v=3`–`?v=6` bookmarks still route correctly; see **`docs/FEATURES.md`** for the full URL schema.

---

## Stack

- **React 18** + **Vite 6**
- **WebGL 1** fragment shaders (`src/shaders/`)
- **@paper-design/shaders-react** — CMYK halftone pass
- **Tailwind CSS 4**, **Radix UI**, **Motion**

---

## Project layout

```
src/
  App.jsx          # Main shell: Weave + Mosaic routing, URL sync
  AppV2.jsx        # Mosaic sidebar and stage
  shaders/         # GLSL (weave + image rects)
  hooks/           # WebGL sandboxes, colorways, capture
  components/      # UI primitives and capture toolbar
  urlDefaults.js   # Default state for URL parsing
docs/
  FEATURES.md      # Living product + architecture doc
```

Agent coordination for multi-worktree edits: **[`AGENTS.md`](AGENTS.md)**.

---

## Keyboard shortcuts (shell)

| Shortcut | Action |
|----------|--------|
| **⌘/Ctrl+C** | Copy canvas (capture bar) |
| **⌘/Ctrl+Shift+R** or **F5** | Reload |
| **⌘/Ctrl+1…9** | Apply weave preset 1–9 |

More detail in **`docs/FEATURES.md`**.
