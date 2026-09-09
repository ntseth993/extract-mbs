import { createWriteStream, existsSync, mkdirSync, openSync, closeSync, ftruncateSync, readSync, writeSync } from "node:fs";
import { basename, join } from "node:path";
import { randomUUID } from "node:crypto";
import type { DownloadJob } from "./types";

const MAX_RETRIES = 3;
const DEFAULT_CONNECTIONS = 4;
const DOWNLOAD_DIR = join(process.cwd(), "downloads");
mkdirSync(DOWNLOAD_DIR, { recursive: true });

type Range = { start: number; end: number; done: number; retries: number };

export class DownloadManager {
  private jobs = new Map<string, DownloadJob>();
  private controllers = new Map<string, AbortController>();
  private ranges = new Map<string, Range[]>();

  list() {
    return Array.from(this.jobs.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  get(id: string) {
    return this.jobs.get(id);
  }

  async analyze(url: string) {
    const response = await fetch(url, { method: "HEAD", redirect: "manual" });
    if (response.status >= 300 && response.status < 400) throw new Error("Redirecting download URLs are not supported by the safe analyzer");
    if (!response.ok) throw new Error(`The server returned HTTP ${response.status}`);
    const fileSize = Number(response.headers.get("content-length") ?? 0);
    const supportsRange = /bytes/i.test(response.headers.get("accept-ranges") ?? "");
    const fileName = this.fileName(url, response.headers.get("content-disposition"));
    return {
      fileName,
      fileSize,
      contentType: response.headers.get("content-type") ?? "application/octet-stream",
      supportsRange: supportsRange && fileSize > 0,
      recommendedConnections: supportsRange ? Math.min(DEFAULT_CONNECTIONS, fileSize > 100_000_000 ? 8 : 4) : 1,
    };
  }

  async start(url: string, connectionCount = DEFAULT_CONNECTIONS) {
    const info = await this.analyze(url);
    const id = randomUUID();
    const filePath = join(DOWNLOAD_DIR, `${id}-${info.fileName}`);
    const job: DownloadJob = {
      id, fileName: info.fileName, url, fileSize: info.fileSize, downloaded: 0, speed: 0, eta: 0,
      connections: info.supportsRange ? Math.max(1, Math.min(16, connectionCount)) : 1,
      status: "downloading", supportsRange: info.supportsRange, retries: 0, createdAt: new Date().toISOString(), outputPath: filePath,
    };
    this.jobs.set(id, job);
    const handle = openSync(filePath, "w+");
    if (info.fileSize > 0) ftruncateSync(handle, info.fileSize);
    closeSync(handle);
    this.controllers.set(id, new AbortController());
    void this.run(job, info.fileSize, filePath);
    return job;
  }

  pause(id: string) {
    const job = this.require(id);
    if (job.status === "downloading") {
      job.status = "paused";
      this.controllers.get(id)?.abort();
    }
    return job;
  }

  resume(id: string) {
    const job = this.require(id);
    if (job.status !== "paused") return job;
    job.status = "downloading";
    const filePath = job.outputPath!;
    this.controllers.set(id, new AbortController());
    void this.run(job, job.fileSize, filePath);
    return job;
  }

  cancel(id: string) {
    const job = this.require(id);
    job.status = "cancelled";
    this.controllers.get(id)?.abort();
    return job;
  }

  private async run(job: DownloadJob, fileSize: number, filePath: string) {
    const chunkSize = fileSize > 0 ? Math.ceil(fileSize / job.connections) : 0;
    const ranges = this.ranges.get(job.id) ?? Array.from({ length: job.connections }, (_, index) => ({
      start: index * chunkSize, end: Math.min(fileSize - 1, (index + 1) * chunkSize - 1), done: 0, retries: 0,
    })).filter((range) => range.start <= range.end);
    this.ranges.set(job.id, ranges);
    if (!fileSize) {
      job.status = "failed";
      return;
    }
    const started = Date.now();
    let active = 0;
    const next = async (): Promise<void> => {
      const range = ranges.find((candidate) => candidate.done < candidate.end - candidate.start + 1);
      if (!range || job.status !== "downloading") return;
      active += 1;
      try {
        await this.downloadRange(job, range, filePath);
      } catch (error) {
        if (job.status !== "downloading") return;
        range.retries += 1;
        job.retries += 1;
        if (range.retries > MAX_RETRIES) {
          job.status = "failed";
          console.error(`Download ${job.id} failed`, error);
          return;
        }
      } finally {
        active -= 1;
      }
      await next();
    };
    await Promise.all(Array.from({ length: job.connections }, next));
    if (job.status === "downloading" && ranges.every((range) => range.done >= range.end - range.start + 1)) {
      job.status = "completed";
      job.downloaded = fileSize;
      job.speed = fileSize / Math.max(1, (Date.now() - started) / 1000);
      job.eta = 0;
    }
    void active;
  }

  private async downloadRange(job: DownloadJob, range: Range, filePath: string) {
    const start = range.start + range.done;
    const response = await fetch(job.url, {
      headers: { Range: `bytes=${start}-${range.end}` },
      signal: this.controllers.get(job.id)?.signal,
    });
    if (!response.ok || !response.body) throw new Error(`Chunk request returned HTTP ${response.status}`);
    const handle = openSync(filePath, "r+");
    const reader = response.body.getReader();
    const started = Date.now();
    try {
      while (true) {
        if (job.status !== "downloading") return;
        const { done, value } = await reader.read();
        if (done) break;
        writeSync(handle, Buffer.from(value), 0, value.byteLength, start + range.done);
        range.done += value.byteLength;
        job.downloaded = this.totalDownloaded(this.ranges.get(job.id) ?? []);
        const elapsed = Math.max(1, (Date.now() - started) / 1000);
        job.speed = Math.round((job.downloaded / Math.max(1, (Date.now() - new Date(job.createdAt).getTime()) / 1000)));
        job.eta = job.speed ? Math.ceil((job.fileSize - job.downloaded) / job.speed) : 0;
        void elapsed;
      }
    } finally {
      closeSync(handle);
    }
  }

  private totalDownloaded(ranges: Range[]) {
    return ranges.reduce((total, range) => total + range.done, 0);
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