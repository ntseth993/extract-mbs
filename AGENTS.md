# AGENTS.md

## Setup quirks

- The `package-lock.json` committed in this repo had `resolved` URLs pointing to Replit's internal npm proxy (`http://package-firewall.replit.internal/npm/`). These are unreachable outside Replit. They were rewritten to `https://registry.npmjs.org/` so `npm install` works in any environment.
- The app is single-origin: `tsx server/index.ts` starts an Express server that serves both the `/api/*` endpoints and the Vite React dashboard (middleware mode) on one port. No separate frontend/backend services.
- The port is controlled by the `PORT` env var (default 5000). The Base44 compose sets `PORT=3000` to match the preview port.
- No database and no external services. Job history and settings persist to `data/store.json` (gitignored, atomic temp-file + rename) and reload on startup; jobs that were `downloading`/`queued` come back `paused`. `DOWNLOAD_DIR` from the environment always overrides the stored download directory. Downloaded files go to `downloads/` by default.
- Bulk downloads: `POST /api/download/bulk` takes `{ urls: string[], connections }` (1–50 URLs) and returns `{ started: DownloadJob[], failed: { url, error }[] }`, so one bad link does not block the rest. The dashboard's New-download modal accepts a pasted list (split on whitespace/commas) and uses this endpoint when more than one link is given.
- Every probe and download request sends `Accept-Encoding: identity`. Without it HTTP ranges index the *compressed* body and the assembled file is corrupt — the size/checksum check catches it, but the fix is the header, not the check.
- Downloads write to `<name>.part` and are renamed to the final name only after the byte count, file size and (optional) sha256 checksum verify, so a partial file is never mistaken for a finished one.
- Electron: `electron/preload.cjs` exposes only `sda.chooseDirectory/revealFile/openFile` through `contextBridge`, and `main.cjs` rejects any path that is not an existing file inside the OS downloads folder. `sandbox: true`, `nodeIntegration: false`, `contextIsolation: true`, a strict CSP on every response, plus window-open and navigation guards. The renderer feature-detects `window.sda`, so the dashboard also runs in a plain browser. The built `dist/index.html` has only an external module script, so `script-src 'self'` is safe.

## Running

```bash
docker compose -f docker-compose.base44.yml up -d
```

- Health check: `GET /api/health` → `{"ok":true,...}`
- Frontend: `GET /` serves the Vite dev dashboard
- Dev server binds `0.0.0.0` with `allowedHosts: true`, so the preview proxy host works without extra config.

## Desktop app builds

- `electron/main.cjs` is the Electron entry point (`package.json` `main`). It picks a free localhost port, starts the bundled server in-process in production mode, waits for `/api/health`, then opens a `BrowserWindow` at that URL.
- `npm run build:server` bundles `server/index.ts` into a self-contained `dist-server/index.mjs` with esbuild. `NODE_ENV` is defined as `"production"` at build time so the Vite dev branch is stripped and `vite` stays external — the bundle needs no `node_modules`.
- `npm run desktop` = web build + server bundle + `electron-builder` (config under `package.json` `build`). Outputs to `release/`.
- Installers are built per OS in CI: `.github/workflows/build-desktop.yml` runs on ubuntu / macos / windows GitHub runners and uploads artifacts. macOS installers can only be produced on macOS, and they are unsigned (no Apple Developer certificate is configured).
- In the sandbox, `ELECTRON_SKIP_BINARY_DOWNLOAD=1` (set in `docker-compose.base44.yml`) skips Electron's ~100MB binary download. Installers are never built in the sandbox.
- The server now honours `HOST` (default `0.0.0.0`) and `DOWNLOAD_DIR` (default `./downloads`). The desktop app sets `HOST=127.0.0.1` and `DOWNLOAD_DIR` to the OS Downloads folder so the packaged app writes to a writable location and does not expose the server on the LAN.

## Verification

- `curl http://localhost:3000/api/health` confirms the API is up.
- `curl http://localhost:3000/` should return HTML with Vite client scripts (confirms live dev source, not a prebuilt bundle).
- `npm run check` runs TypeScript type checking without emitting.
