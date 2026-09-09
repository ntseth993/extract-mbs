import cors from "cors";
import express from "express";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { downloadManager } from "./download-manager";
import { isSafePublicUrl } from "./url-safety";

const app = express();
const server = createServer(app);
const port = Number(process.env.PORT ?? 5000);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

app.use(cors());
app.use(express.json({ limit: "32kb" }));

const urlSchema = z.string().url().refine(isSafePublicUrl, "Only public HTTP(S) URLs are supported");

const asyncRoute = (handler: express.RequestHandler): express.RequestHandler => (request, response, next) => Promise.resolve(handler(request, response, next)).catch(next);

app.get("/api/health", (_request, response) => response.json({ ok: true, service: "smart-download-accelerator" }));
app.post("/api/analyze-url", asyncRoute(async (request, response) => {
  const url = urlSchema.parse(request.body?.url);
  response.json(await downloadManager.analyze(url));
}));
app.post("/api/download/start", asyncRoute(async (request, response) => {
  const url = urlSchema.parse(request.body?.url);
  const connections = z.number().int().min(1).max(16).default(4).parse(request.body?.connections);
  response.status(201).json(await downloadManager.start(url, connections));
}));
for (const action of ["pause", "resume", "cancel"] as const) {
  app.post(`/api/download/:id/${action}`, (request, response) => {
    try {
      response.json(downloadManager[action](request.params.id));
    } catch (error) {
      response.status(404).json({ error: error instanceof Error ? error.message : "Download not found" });
    }
  });
}
app.get("/api/download/:id", (request, response) => {
  const job = downloadManager.get(request.params.id);
  return job ? response.json(job) : response.status(404).json({ error: "Download not found" });
});
app.get("/api/download/history", (_request, response) => response.json(downloadManager.list()));
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

server.listen(port, "0.0.0.0", () => console.log(`Smart Download Accelerator listening on port ${port}`));