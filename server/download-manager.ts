import { createHash, randomUUID } from "node:crypto";
import { closeSync, createReadStream, existsSync, ftruncateSync, mkdirSync, openSync, renameSync, statfsSync, statSync, unlinkSync, writeSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import type { AnalyzeResult, AppSettings, DownloadJob } from "./types";
import { loadStore, saveStore } from "./store";
import { isSafePublicUrl } from "./url-safety";

const MAX_RETRIES = 3;
const MAX_REDIRECTS = 5;
const BACKOFF_BASE_MS = 500;
const BACKOFF_MAX_MS = 15_000;
const MIN_FREE_BYTES = 64 * 1024 * 1024;
const MAX_CONCURRENT = 8;
const MAX_CONNECTIONS = 16;
const USER_AGENT = "SmartDownloadAccelerator/1.0";
// Byte ranges only line up with file bytes when the body is not compressed,
// so every request asks the server for the identity encoding.
const BASE_HEADERS: Record<string, string> = { "User-Agent": USER_AGENT, "Accept-Encoding": "identity" };

type Range = { start: number; end: number; done: number; retries: number };

const delay = (ms: number) => new Promise((done) => setTimeout(done, ms));
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, Math.round(value)));

export class DownloadManager {
  private jobs = new Map<string, DownloadJob>();
  private controllers = new Map<string, AbortController>();
  private ranges = new Map<string, Range[]>();
  private checksums = new Map<string, string>();
  private settings: AppSettings;
  private running = 0;

  constructor() {
    const downloadDir = process.env.DOWNLOAD_DIR ? resolve(process.env.DOWNLOAD_DIR) : join(process.cwd(), "downloads");
    mkdirSync(downloadDir, { recursive: true });
    const stored = loadStore(downloadDir);
    // The environment's download directory always wins over a stored one.
    this.settings = { ...stored.settings, downloadDir };
    for (const saved of stored.jobs) {
      const { ranges, ...job } = saved as DownloadJob & { ranges?: Range[] };
      // Anything mid-flight when the app closed comes back paused, never "downloading".
      if (job.status === "downloading" || job.status === "queued") job.status = "paused";
      job.speed = 0;
      job.eta = 0;
      if (Array.isArray(ranges) && ranges.length) this.ranges.set(job.id, ranges);
      this.jobs.set(job.id, job);
    }
    this.persist();
  }

  getSettings(): AppSettings {
    return this.settings;
  }

  updateSettings(patch: Partial<AppSettings>): AppSettings {
    if (patch.downloadDir) {
      const dir = resolve(patch.downloadDir);
      mkdirSync(dir, { recursive: true });
      this.settings.downloadDir = dir;
    }
    if (typeof patch.maxConcurrent === "number") this.settings.maxConcurrent = clamp(patch.maxConcurrent, 1, MAX_CONCURRENT);
    if (typeof patch.connectionsPerDownload === "number") this.settings.connectionsPerDownload = clamp(patch.connectionsPerDownload, 1, MAX_CONNECTIONS);
    if (typeof patch.autoStart === "boolean") this.settings.autoStart = patch.autoStart;
    this.persist();
    this.pump();
    return this.settings;
  }

  list(): DownloadJob[] {
    return Array.from(this.jobs.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  get(id: string): DownloadJob | undefined {
    return this.jobs.get(id);
  }

  async analyze(url: string): Promise<AnalyzeResult> {
    const probe = await this.probe(url);
    const response = probe.response;
    const rangeSize = response.headers.get("content-range")?.match(/\/(\d+)$/)?.[1];
    const fileSize = Number(rangeSize ?? response.headers.get("content-length") ?? 0);
    const supportsRange = response.status === 206 || /bytes/i.test(response.headers.get("accept-ranges") ?? "");
    return {
      resolvedUrl: probe.finalUrl,
      fileName: this.fileName(probe.finalUrl, response.headers.get("content-disposition")),
      fileSize,
      contentType: response.headers.get("content-type") ?? "application/octet-stream",
      supportsRange,
      recommendedConnections: supportsRange ? Math.min(8, fileSize > 100_000_000 ? 8 : 4) : 1,
      etag: response.headers.get("etag") ?? undefined,
      lastModified: response.headers.get("last-modified") ?? undefined,
    };
  }

  async start(url: string, options: { connections?: number; priority?: number; checksum?: string } = {}): Promise<DownloadJob> {
    const info = await this.analyze(url);
    this.ensureSpace(info.fileSize);
    const id = randomUUID();
    const fileName = this.uniqueName(info.fileName);
    const job: DownloadJob = {
      id,
      fileName,
      url: info.resolvedUrl,
      fileSize: info.fileSize,
      downloaded: 0,
      speed: 0,
      eta: 0,
      connections: info.supportsRange ? clamp(options.connections ?? this.settings.connectionsPerDownload, 1, MAX_CONNECTIONS) : 1,
      status: "queued",
      supportsRange: info.supportsRange,
      retries: 0,
      priority: options.priority ?? 0,
      createdAt: new Date().toISOString(),
      etag: info.etag,
      lastModified: info.lastModified,
      outputPath: join(this.settings.downloadDir, fileName),
    };
    this.jobs.set(id, job);
    if (options.checksum) this.checksums.set(id, options.checksum.toLowerCase());
    this.persist();
    if (this.settings.autoStart) this.pump();
    return job;
  }

  pause(id: string): DownloadJob {
    const job = this.require(id);
    if (job.status === "downloading") {
      job.status = "paused";
      this.controllers.get(id)?.abort();
    } else if (job.status === "queued") {
      job.status = "paused";
    }
    this.persist();
    return job;
  }

  resume(id: string): DownloadJob {
    const job = this.require(id);
    if (job.status !== "paused" && job.status !== "failed") return job;
    job.status = "queued";
    job.error = undefined;
    this.persist();
    this.pump();
    return job;
  }

  cancel(id: string): DownloadJob {
    const job = this.require(id);
    job.status = "cancelled";
    job.speed = 0;
    job.eta = 0;
    this.controllers.get(id)?.abort();
    if (job.outputPath) this.cleanupPart(`${job.outputPath}.part`);
    this.persist();
    return job;
  }

  remove(id: string): boolean {
    const job = this.jobs.get(id);
    if (!job) return false;
    this.controllers.get(id)?.abort();
    if (job.outputPath) this.cleanupPart(`${job.outputPath}.part`);
    this.jobs.delete(id);
    this.ranges.delete(id);
    this.controllers.delete(id);
    this.checksums.delete(id);
    this.persist();
    return true;
  }

  pauseAll(): DownloadJob[] {
    for (const job of this.jobs.values()) {
      if (job.status === "downloading") {
        job.status = "paused";
        this.controllers.get(job.id)?.abort();
      } else if (job.status === "queued") {
        job.status = "paused";
      }
    }
    this.persist();
    return this.list();
  }

  resumeAll(): DownloadJob[] {
    for (const job of this.jobs.values()) {
      if (job.status === "paused") {
        job.status = "queued";
        job.error = undefined;
      }
    }
    this.persist();
    this.pump();
    return this.list();
  }

  // --- queue -----------------------------------------------------------------

  private pump(): void {
    while (this.running < this.settings.maxConcurrent) {
      const next = this.nextQueued();
      if (!next) return;
      this.launch(next);
    }
  }

  private nextQueued(): DownloadJob | undefined {
    return Array.from(this.jobs.values())
      .filter((job) => job.status === "queued")
      .sort((a, b) => b.priority - a.priority || a.createdAt.localeCompare(b.createdAt))[0];
  }

  private launch(job: DownloadJob): void {
    job.status = "downloading";
    job.startedAt ??= new Date().toISOString();
    job.error = undefined;
    this.running += 1;
    this.controllers.set(job.id, new AbortController());
    this.persist();
    void this.run(job)
      .catch(() => undefined)
      .finally(() => {
        this.running -= 1;
        this.persist();
        this.pump();
      });
  }

  // --- engine ----------------------------------------------------------------

  private async run(job: DownloadJob): Promise<void> {
    const partPath = `${job.outputPath!}.part`;
    try {
      // A resumed job re-checks the remote file first so incompatible versions
      // are never stitched together.
      if (job.downloaded > 0) await this.revalidate(job);

      const resumable = job.supportsRange && job.fileSize > 0;
      if (resumable) {
        const handle = openSync(partPath, existsSync(partPath) ? "r+" : "w+");
        ftruncateSync(handle, job.fileSize);
        closeSync(handle);
      } else {
        // Single-stream and unknown-length downloads always start over.
        job.downloaded = 0;
        closeSync(openSync(partPath, "w+"));
      }

      if (resumable) {
        const ranges = this.ranges.get(job.id) ?? this.buildRanges(job);
        this.ranges.set(job.id, ranges);
        await this.downloadSegments(job, partPath, ranges);
      } else {
        await this.downloadSingleStream(job, partPath);
      }

      if (job.status !== "downloading") return;

      if (resumable) {
        const ranges = this.ranges.get(job.id) ?? [];
        const complete = ranges.length > 0 && ranges.every((range) => range.done >= range.end - range.start + 1);
        if (!complete) throw new Error("The download finished with incomplete segments");
      }

      const expected = this.checksums.get(job.id);
      if (expected) await this.verifyChecksum(partPath, expected);
      if (job.fileSize > 0 && statSync(partPath).size !== job.fileSize) {
        throw new Error("The downloaded file size does not match what the server reported");
      }

      renameSync(partPath, job.outputPath!);
      job.downloaded = job.fileSize || job.downloaded;
      job.status = "completed";
      job.completedAt = new Date().toISOString();
      job.speed = 0;
      job.eta = 0;
      job.error = undefined;
    } catch (error) {
      if (job.status === "cancelled") {
        this.cleanupPart(partPath);
        return;
      }
      job.status = "failed";
      job.error = error instanceof Error ? error.message : "Download failed";
      job.speed = 0;
      job.eta = 0;
      console.error(`Download ${job.id} failed: ${job.error}`);
    }
  }

  /** Confirms the remote file is still the one we partially downloaded. */
  private async revalidate(job: DownloadJob): Promise<void> {
    let fresh: AnalyzeResult;
    try {
      fresh = await this.analyze(job.url);
    } catch {
      return; // Offline: keep the partial file and let the normal retry path run.
    }
    const changed =
      fresh.fileSize !== job.fileSize ||
      Boolean(job.etag && fresh.etag && job.etag !== fresh.etag) ||
      Boolean(job.lastModified && fresh.lastModified && job.lastModified !== fresh.lastModified);
    if (!changed) return;

    const partPath = `${job.outputPath!}.part`;
    this.ranges.delete(job.id);
    job.downloaded = 0;
    job.fileSize = fresh.fileSize;
    job.etag = fresh.etag;
    job.lastModified = fresh.lastModified;
    try {
      const handle = openSync(partPath, "w+");
      if (fresh.fileSize > 0) ftruncateSync(handle, fresh.fileSize);
      closeSync(handle);
    } catch {
      // The next write recreates the temp file.
    }
  }

  private buildRanges(job: DownloadJob): Range[] {
    const chunk = Math.ceil(job.fileSize / job.connections);
    return Array.from({ length: job.connections }, (_, index) => ({
      start: index * chunk,
      end: Math.min(job.fileSize - 1, (index + 1) * chunk - 1),
      done: 0,
      retries: 0,
    })).filter((range) => range.start <= range.end);
  }

  private async downloadSegments(job: DownloadJob, partPath: string, ranges: Range[]): Promise<void> {
    const next = async (): Promise<void> => {
      const range = ranges.find((candidate) => candidate.done < candidate.end - candidate.start + 1);
      if (!range || job.status !== "downloading") return;
      try {
        await this.downloadRange(job, range, partPath);
      } catch (error) {
        if (job.status !== "downloading") return;
        range.retries += 1;
        job.retries += 1;
        if (range.retries > MAX_RETRIES) {
          job.status = "failed";
          job.error = error instanceof Error ? error.message : "Segment failed";
          throw error;
        }
        await delay(this.backoffMs(range.retries));
      }
      await next();
    };
    await Promise.all(ranges.map(next));
  }

  private async downloadRange(job: DownloadJob, range: Range, partPath: string): Promise<void> {
    const signal = this.controllers.get(job.id)?.signal;
    let attempt = 0;
    while (true) {
      if (job.status !== "downloading") return;
      const headers: Record<string, string> = { ...BASE_HEADERS, Range: `bytes=${range.start + range.done}-${range.end}` };

      let response: Response;
      try {
        response = await fetch(job.url, { headers, signal });
      } catch (error) {
        if (job.status !== "downloading") return;
        attempt += 1;
        if (attempt > MAX_RETRIES) throw error;
        await delay(this.backoffMs(attempt));
        continue;
      }

      if (response.status === 429 || response.status === 503) {
        attempt += 1;
        const wait = this.retryAfterMs(response, attempt);
        await response.body?.cancel();
        if (attempt > MAX_RETRIES) throw new Error(`The server is rate limiting downloads (HTTP ${response.status})`);
        await delay(wait);
        continue;
      }

      if (!response.ok || !response.body) throw new Error(`Chunk request returned HTTP ${response.status}`);
      if (response.status !== 206) {
        // A full-body reply to a ranged request cannot be placed safely.
        await response.body.cancel();
        throw new Error("The server stopped honoring byte-range requests");
      }

      await this.writeResponse(job, range, response, partPath);
      return;
    }
  }

  private async writeResponse(job: DownloadJob, range: Range, response: Response, partPath: string): Promise<void> {
    const handle = openSync(partPath, "r+");
    const reader = response.body!.getReader();
    try {
      while (true) {
        if (job.status !== "downloading") return;
        const { done, value } = await reader.read();
        if (done) break;
        const remaining = range.end - range.start + 1 - range.done;
        if (remaining <= 0) break;
        const chunk = Buffer.from(value);
        const slice = chunk.byteLength > remaining ? chunk.subarray(0, remaining) : chunk;
        writeSync(handle, slice, 0, slice.byteLength, range.start + range.done);
        range.done += slice.byteLength;
        job.downloaded = this.totalDownloaded(this.ranges.get(job.id) ?? []);
        this.updateSpeed(job);
      }
    } finally {
      closeSync(handle);
    }
  }

  private async downloadSingleStream(job: DownloadJob, partPath: string): Promise<void> {
    const response = await fetch(job.url, { headers: BASE_HEADERS, signal: this.controllers.get(job.id)?.signal });
    if (response.status === 429 || response.status === 503) {
      throw new Error(`The server is rate limiting downloads (HTTP ${response.status})`);
    }
    if (!response.ok || !response.body) throw new Error(`Download returned HTTP ${response.status}`);
    const handle = openSync(partPath, "r+");
    const reader = response.body.getReader();
    try {
      while (true) {
        if (job.status !== "downloading") return;
        const { done, value } = await reader.read();
        if (done) break;
        writeSync(handle, Buffer.from(value), 0, value.byteLength, job.downloaded);
        job.downloaded += value.byteLength;
        if (!job.fileSize) job.fileSize = job.downloaded;
        this.updateSpeed(job);
      }
    } finally {
      closeSync(handle);
    }
  }

  private updateSpeed(job: DownloadJob): void {
    const startedAt = new Date(job.startedAt ?? job.createdAt).getTime();
    const elapsed = Math.max(0.5, (Date.now() - startedAt) / 1000);
    const average = job.downloaded / elapsed;
    // Exponential smoothing keeps the displayed speed from jumping around.
    job.speed = job.speed ? Math.round(job.speed * 0.7 + average * 0.3) : Math.round(average);
    job.eta = job.speed > 0 && job.fileSize > job.downloaded ? Math.ceil((job.fileSize - job.downloaded) / job.speed) : 0;
  }

  private async verifyChecksum(filePath: string, expected: string): Promise<void> {
    const hash = createHash("sha256");
    await new Promise<void>((done, fail) => {
      createReadStream(filePath)
        .on("data", (chunk) => hash.update(chunk))
        .on("end", () => done())
        .on("error", fail);
    });
    if (hash.digest("hex") !== expected) throw new Error("The downloaded file failed its checksum check");
  }

  // --- helpers ---------------------------------------------------------------

  private backoffMs(attempt: number): number {
    const base = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** (attempt - 1));
    return Math.round(base * (0.7 + Math.random() * 0.6));
  }

  private retryAfterMs(response: Response, attempt: number): number {
    const header = response.headers.get("retry-after");
    if (header) {
      const seconds = Number(header);
      if (Number.isFinite(seconds)) return Math.min(BACKOFF_MAX_MS, Math.max(0, seconds * 1000));
      const date = Date.parse(header);
      if (!Number.isNaN(date)) return Math.min(BACKOFF_MAX_MS, Math.max(0, date - Date.now()));
    }
    return this.backoffMs(attempt);
  }

  private ensureSpace(fileSize: number): void {
    if (!fileSize) return;
    let free: number;
    try {
      const stats = statfsSync(this.settings.downloadDir);
      free = Number(stats.bavail) * Number(stats.bsize);
    } catch {
      return; // The filesystem cannot report free space — skip the pre-flight check.
    }
    if (free < fileSize + MIN_FREE_BYTES) throw new Error("Not enough free disk space for this download");
  }

  private uniqueName(fileName: string): string {
    const dir = this.settings.downloadDir;
    const ext = extname(fileName);
    const stem = basename(fileName, ext) || "download";
    let candidate = fileName;
    let index = 1;
    while (existsSync(join(dir, candidate)) || existsSync(join(dir, `${candidate}.part`))) {
      candidate = `${stem} (${index})${ext}`;
      index += 1;
    }
    return candidate;
  }

  private cleanupPart(partPath: string): void {
    try {
      if (existsSync(partPath)) unlinkSync(partPath);
    } catch {
      // A locked temp file will be replaced on the next attempt.
    }
  }

  private totalDownloaded(ranges: Range[]): number {
    return ranges.reduce((total, range) => total + range.done, 0);
  }

  private persist(): void {
    saveStore({
      settings: this.settings,
      jobs: Array.from(this.jobs.values()).map((job) => ({ ...job, ranges: this.ranges.get(job.id) })),
    });
  }

  private async probe(url: string) {
    let current = url;
    for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
      if (!isSafePublicUrl(current)) throw new Error("A redirect pointed to a private or local address");
      let response = await fetch(current, {
        method: "HEAD",
        redirect: "manual",
        headers: BASE_HEADERS,
      });
      if (response.status >= 300 && response.status < 400) {
        current = this.redirectTarget(current, response.headers.get("location"));
        continue;
      }
      if (response.ok && Number(response.headers.get("content-length") ?? 0) > 0) {
        return { response, finalUrl: current };
      }
      if ([403, 405, 406, 410, 415, 501].includes(response.status) || !response.ok || !response.headers.get("content-length")) {
        response = await fetch(current, {
          headers: { ...BASE_HEADERS, Range: "bytes=0-0" },
          redirect: "manual",
        });
        if (response.status >= 300 && response.status < 400) {
          current = this.redirectTarget(current, response.headers.get("location"));
          continue;
        }
      }
      if (!response.ok) throw new Error(`The server returned HTTP ${response.status}`);
      await response.body?.cancel();
      return { response, finalUrl: current };
    }
    throw new Error("Too many redirects");
  }

  private redirectTarget(from: string, location: string | null) {
    if (!location) throw new Error("The server returned an invalid redirect");
    const target = new URL(location, from).toString();
    if (!isSafePublicUrl(target)) throw new Error("A redirect pointed to a private or local address");
    return target;
  }

  private fileName(url: string, disposition: string | null) {
    const fromHeader = disposition?.match(/filename="?([^";]+)"?/i)?.[1];
    if (fromHeader) return fromHeader.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 160);
    try {
      const name = basename(new URL(url).pathname);
      return name && name !== "/" ? decodeURIComponent(name).replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 160) : "download.bin";
    } catch {
      return "download.bin";
    }
  }

  private require(id: string) {
    const job = this.jobs.get(id);
    if (!job) throw new Error("Download job not found");
    return job;
  }
}

export const downloadManager = new DownloadManager();
