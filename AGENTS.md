# AGENTS.md

## Setup quirks

- The `package-lock.json` committed in this repo had `resolved` URLs pointing to Replit's internal npm proxy (`http://package-firewall.replit.internal/npm/`). These are unreachable outside Replit. They were rewritten to `https://registry.npmjs.org/` so `npm install` works in any environment.
- The app is single-origin: `tsx server/index.ts` starts an Express server that serves both the `/api/*` endpoints and the Vite React dashboard (middleware mode) on one port. No separate frontend/backend services.
- The port is controlled by the `PORT` env var (default 5000). The Base44 compose sets `PORT=3000` to match the preview port.
- No database, no external services, no secrets required. Job metadata is in-memory; downloaded files go to `downloads/`.

## Running

```bash
docker compose -f docker-compose.base44.yml up -d
```

- Health check: `GET /api/health` → `{"ok":true,...}`
- Frontend: `GET /` serves the Vite dev dashboard
- Dev server binds `0.0.0.0` with `allowedHosts: true`, so the preview proxy host works without extra config.

## Verification

- `curl http://localhost:3000/api/health` confirms the API is up.
- `curl http://localhost:3000/` should return HTML with Vite client scripts (confirms live dev source, not a prebuilt bundle).
- `npm run check` runs TypeScript type checking without emitting.
