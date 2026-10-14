# Smart Download Accelerator

A React + TypeScript dashboard, Chrome Manifest V3 extension, and Node/Express backend for optimizing legitimate file downloads with adaptive parallel HTTP range requests.

> This tool optimizes how an existing internet connection downloads files. It cannot create free mobile data, extract MB from a SIM card, bypass carrier limits, DRM, paywalls, authentication, or copyright restrictions.

## Run the dashboard

```bash
npm install
npm run dev
```

Open the Replit preview. The app listens on `0.0.0.0:5000` and serves the React dashboard plus API.

## Build and load the Chrome extension

```bash
npm run build:extension
```

In Chrome, open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select `dist-extension/`. The extension popup and right-click “Download with Smart Accelerator” action use the local dashboard API.

## Build the desktop app

The dashboard and API can be packaged as a standalone desktop application (Electron) for Windows, macOS and Linux.

```bash
npm run desktop        # web build + server bundle + installers -> release/
npm run desktop:dir    # unpacked app, for a quick local check
```

Installers are produced per platform in CI via `.github/workflows/build-desktop.yml` (run it manually or push a `v*` tag). Each OS builds its own installer: Windows `.exe`, macOS `.dmg`, Linux `.AppImage`/`.deb`. macOS builds require a macOS runner and are unsigned unless you add an Apple Developer certificate.

## API

- `POST /api/analyze-url` — validate a public URL, inspect headers, and determine range support
- `POST /api/download/start` — queue a download (optional `connections`, `priority`, sha256 `checksum`)
- `POST /api/download/bulk` — queue up to 50 URLs at once; returns `{ started, failed }`
- `POST /api/download/:id/pause` · `/resume` · `/retry` · `/cancel`
- `DELETE /api/download/:id` — remove a job from the list
- `POST /api/download/pause-all` · `/resume-all`
- `GET /api/download/:id` · `GET /api/download/history`
- `GET /api/settings` · `PUT /api/settings` — `{ downloadDir, maxConcurrent, connectionsPerDownload, autoStart }`
- `GET /api/health`

### Download engine

Requests are always sent with `Accept-Encoding: identity`, because HTTP byte ranges index the *compressed* body — mixing ranges with a compressed response silently corrupts the output.

The engine follows up to five safe public redirects, probes servers with `HEAD` and a ranged `GET` fallback, then either splits the file into concurrent byte ranges or streams it in one connection when the server does not support ranges. Each download is written to a `.part` file and only renamed to its final name once it has fully verified, so a partial file is never mistaken for a finished one. Downloads are queued (`maxConcurrent` files at a time, highest priority first), retried up to three times with exponential backoff and jitter, and back off on `429`/`503` using `Retry-After`. A resumed download re-checks the remote file's `ETag`/`Last-Modified` and size first and starts over if the file changed. On completion the byte count, the final file size, and — when supplied — a sha256 checksum are all verified.

Job history and settings are stored in `data/store.json` (atomic writes) and restored on startup; anything that was mid-download when the app closed comes back paused.

## Project layout

- `src/` — React dashboard and UI styles
- `server/` — Express API and adaptive download manager
- `extension/` — Manifest V3 popup and background service worker
- `scripts/` — extension packaging

## Production notes

Job history and settings persist to `data/store.json`; downloaded files go to `downloads/` (or the folder chosen in Settings). Progress is polled by the dashboard, so a WebSocket progress stream is still a worthwhile upgrade. Remaining hardening for public deployment: authenticated users, a retention/cleanup policy, and an SSRF policy that also resolves DNS and blocks rebinding. Never expose the server as an unrestricted proxy.