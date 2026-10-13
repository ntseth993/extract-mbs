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
- `POST /api/download/start` — create a download job and begin parallel chunks
- `POST /api/download/:id/pause`
- `POST /api/download/:id/resume`
- `POST /api/download/:id/cancel`
- `GET /api/download/:id`
- `GET /api/download/history`
- `GET /api/health`

The downloader follows up to five safe public redirects, probes servers with `HEAD` and a ranged `GET` fallback, starts with the configured number of streams, writes range chunks directly to a temporary file, retries failed chunks up to three times, and resumes from already written byte ranges after pausing. Servers that do not support ranges automatically use one normal stream; resources without a known size are streamed until completion.

## Project layout

- `src/` — React dashboard and UI styles
- `server/` — Express API and adaptive download manager
- `extension/` — Manifest V3 popup and background service worker
- `scripts/` — extension packaging

## Production notes

This MVP keeps job metadata in memory and downloaded files in `downloads/`. For production, add durable job storage, authenticated users, a cleanup policy, object storage, a job queue, a WebSocket progress stream, and a stronger SSRF policy with DNS rebinding protection. Never expose the server as an unrestricted proxy.