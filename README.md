# Hollow Dash

A fast, endless side-scrolling platformer for the web, built for phones. No dependencies, no build step.

**Play:** https://crumplabsandbox.github.io/SideScroller/

## Controls
- **Phone:** left side of the screen = ◀ ▶ (left 30% / next 25%), right side = jump. Hold to jump higher, tap again mid-air to double jump. Multi-touch works.
- **Keyboard:** ← → or A D to move, Space / ↑ / W to jump, P or Esc to pause, M to mute.

## Run locally
```sh
python3 -m http.server 8000
# open http://localhost:8000
```
(ES modules need http://, not file://.)

## Deploy
`.github/workflows/deploy.yml` deploys the repo root to GitHub Pages on every push to `main`. Live: https://crumplabsandbox.github.io/SideScroller/
One-time setup: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

See [plan.md](plan.md) for the design and architecture.
