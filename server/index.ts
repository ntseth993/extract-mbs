import cors from "cors";
import express from "express";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { registerAuthRoutes } from "./auth";
import { downloadManager } from "./download-manager";
import type { DownloadJob } from "./types";
import { isSafePublicUrl } from "./url-safety";

const app = express();
const server = createServer(app);
const port = Number(process.env.PORT ?? 5000);
const host = process.env.HOST ?? "0.0.0.0";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

app.use(cors());
app.use(express.json({ limit: "32kb" }));
app.use((_request, response, next) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  // The dev server needs inline styles and a websocket for HMR, so the strict
  // policy is applied to the packaged production build only.
  if (process.env.NODE_ENV === "production") {
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'",
    );
  }
  next();
});

const urlSchema = z.string().url().refine(isSafePublicUrl, "Only public HTTP(S) URLs are supported");
const connectionsSchema = z.number().int().min(1).max(16);
const settingsSchema = z.object({
  downloadDir: z.string().min(1).optional(),
  maxConcurrent: z.number().int().min(1).max(8).optional(),
  connectionsPerDownload: connectionsSchema.optional(),
  autoStart: z.boolean().optional(),
});

const asyncRoute = (handler: express.RequestHandler): express.RequestHandler => (request, response, next) => Promise.resolve(handler(request, response, next)).catch(next);

app.get("/api/health", (_request, response) => response.json({ ok: true, service: "smart-download-accelerator" }));

// Public website config. Installer links come from the environment so the site
// can be pointed at real release assets without a rebuild; the fallback is the
// project's GitHub releases page.
const RELEASES_FALLBACK = "https://github.com/ntseth993/extract-mbs/releases/latest";
app.get("/api/site/config", (_request, response) => {
  response.json({
    version: process.env.APP_VERSION ?? "1.0.0",
    releases: {
      windows: process.env.DOWNLOAD_URL_WINDOWS ?? RELEASES_FALLBACK,
      mac: process.env.DOWNLOAD_URL_MAC ?? RELEASES_FALLBACK,
      linux: process.env.DOWNLOAD_URL_LINUX ?? RELEASES_FALLBACK,
    },
  });
});

registerAuthRoutes(app);

app.get("/api/settings", (_request, response) => response.json(downloadManager.getSettings()));
app.put("/api/settings", (request, response) => response.json(downloadManager.updateSettings(settingsSchema.parse(request.body))));

app.post("/api/analyze-url", asyncRoute(async (request, response) => {
  const url = urlSchema.parse(request.body?.url);
  response.json(await downloadManager.analyze(url));
}));

app.post("/api/download/start", asyncRoute(async (request, response) => {
  const url = urlSchema.parse(request.body?.url);
  const connections = connectionsSchema.default(4).parse(request.body?.connections);
  const priority = z.number().int().min(-5).max(5).default(0).parse(request.body?.priority);
  const checksum = z.string().regex(/^[a-fA-F0-9]{64}$/).optional().parse(request.body?.checksum);
  response.status(201).json(await downloadManager.start(url, { connections, priority, checksum }));
}));

app.post("/api/download/bulk", asyncRoute(async (request, response) => {
  const urls = z.array(z.string()).min(1).max(50).parse(request.body?.urls);
  const connections = connectionsSchema.default(4).parse(request.body?.connections);
  const started: DownloadJob[] = [];
  const failed: { url: string; error: string }[] = [];
  await Promise.all(urls.map(async (candidate) => {
    try {
      started.push(await downloadManager.start(urlSchema.parse(candidate), { connections }));
    } catch (error) {
      failed.push({ url: candidate, error: error instanceof Error ? error.message : "Could not start download" });
    }
  }));
  response.status(201).json({ started, failed });
}));

app.post("/api/download/pause-all", (_request, response) => response.json(downloadManager.pauseAll()));
app.post("/api/download/resume-all", (_request, response) => response.json(downloadManager.resumeAll()));

const actions: Record<string, (id: string) => DownloadJob> = {
  pause: (id) => downloadManager.pause(id),
  resume: (id) => downloadManager.resume(id),
  retry: (id) => downloadManager.resume(id),
  cancel: (id) => downloadManager.cancel(id),
};
for (const [action, run] of Object.entries(actions)) {
  app.post(`/api/download/:id/${action}`, (request, response) => {
    try {
      response.json(run(request.params.id));
    } catch (error) {
      response.status(404).json({ error: error instanceof Error ? error.message : "Download not found" });
    }
  });
}

app.get("/api/download/history", (_request, response) => response.json(downloadManager.list()));
app.get("/api/download/:id", (request, response) => {
  const job = downloadManager.get(request.params.id);
  return job ? response.json(job) : response.status(404).json({ error: "Download not found" });
});
app.delete("/api/download/:id", (request, response) => {
  const removed = downloadManager.remove(request.params.id);
  return removed ? response.status(204).end() : response.status(404).json({ error: "Download not found" });
});

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  const message = error instanceof z.ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : "Unexpected server error";
  response.status(400).json({ error: message });
});

if (process.env.NODE_ENV !== "production") {
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({ root, server: { middlewareMode: true, host: "0.0.0.0", allowedHosts: true }, appType: "spa" });
  app.use(vite.middlewares);
} else {
  app.use(express.static(resolve(root, "dist")));
  app.get("*", (_request, response) => response.sendFile(resolve(root, "dist/index.html")));
}

server.listen(port, host, () => console.log(`Smart Download Accelerator listening on ${host}:${port}`));
