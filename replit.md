# Smart Download Accelerator

## Run

- `npm run dev` starts the combined Vite React dashboard and Express API on port 5000.
- `npm run build:extension` packages the Manifest V3 extension into `dist-extension/`.
- `npm run check` runs the TypeScript compiler without emitting files.

## Architecture

- `src/` is the React/TypeScript dashboard.
- `server/` is the Node/TypeScript API and range downloader.
- `extension/` is the browser extension loaded unpacked from `dist-extension/`.

The API intentionally validates public HTTP(S) URLs and rejects private/local network targets. The current MVP stores jobs in memory and files in the local `downloads/` directory; production persistence and queueing are follow-up work.