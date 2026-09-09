import { mkdirSync, openSync, closeSync, ftruncateSync, writeSync } from "node:fs";
import { basename, join } from "node:path";
import { randomUUID } from "node:crypto";
import type { DownloadJob } from "./types";
import { isSafePublicUrl } from "./url-safety";

const MAX_RETRIES = 3;
const DEFAULT_CONNECTIONS = 4;
const MAX_REDIRECTS = 5;
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
    const probe = await this.probe(url);
    const response = probe.response;
    const rangeSize = response.headers.get("content-range")?.match(/\/(\d+)$/)?.[1];
    const fileSize = Number(rangeSize ?? response.headers.get("content-length") ?? 0);
    const supportsRange = response.status === 206 || /bytes/i.test(response.headers.get("accept-ranges") ?? "");
    const fileName = this.fileName(probe.finalUrl, response.headers.get("content-disposition"));
    return {
      resolvedUrl: probe.finalUrl,
      fileName,
      fileSize,
      contentType: response.headers.get("content-type") ?? "application/octet-stream",
      supportsRange,
      recommendedConnections: supportsRange ? Math.min(DEFAULT_CONNECTIONS, fileSize > 100_000_000 ? 8 : 4) : 1,
    };
  }

  async start(url: string, connectionCount = DEFAULT_CONNECTIONS) {
    const info = await this.analyze(url);
    const id = randomUUID();
    const filePath = join(DOWNLOAD_DIR, `${id}-${info.fileName}`);
    const job: DownloadJob = {
      id, fileName: info.fileName, url: info.resolvedUrl, fileSize: info.fileSize, downloaded: 0, speed: 0, eta: 0,
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
    if (!job.supportsRange) {
      const handle = openSync(filePath, "w+");
      ftruncateSync(handle, 0);
      closeSync(handle);
      job.downloaded = 0;
      job.speed = 0;
      job.eta = 0;
    }
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
      await this.downloadUnknownLength(job, filePath);
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
    const rangeRequested = job.supportsRange;
    const response = await fetch(job.url, {
      headers: rangeRequested ? { Range: `bytes=${start}-${range.end}` } : undefined,
      signal: this.controllers.get(job.id)?.signal,
    });
    if (!response.ok || !response.body) throw new Error(`Chunk request returned HTTP ${response.status}`);
    if (rangeRequested && response.status !== 206) throw new Error("The server did not honor the requested byte range");
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

  private async downloadUnknownLength(job: DownloadJob, filePath: string) {
    try {
      const response = await fetch(job.url, { signal: this.controllers.get(job.id)?.signal });
      if (!response.ok || !response.body) throw new Error(`Download returned HTTP ${response.status}`);
      const handle = openSync(filePath, "w+");
      const reader = response.body.getReader();
      const started = Date.now();
      try {
        while (true) {
          if (job.status !== "downloading") return;
          const { done, value } = await reader.read();
          if (done) break;
          writeSync(handle, Buffer.from(value), 0, value.byteLength, job.downloaded);
          job.downloaded += value.byteLength;
          job.speed = Math.round(job.downloaded / Math.max(1, (Date.now() - started) / 1000));
        }
      } finally {
        closeSync(handle);
      }
      if (job.status === "downloading") job.status = "completed";
    } catch (error) {
      if (job.status === "downloading") {
        job.status = "failed";
        console.error(`Download ${job.id} failed`, error);
      }
    }
  }

  private async probe(url: string) {
    let current = url;
    for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
      if (!isSafePublicUrl(current)) throw new Error("A redirect pointed to a private or local address");
      let response = await fetch(current, {
        method: "HEAD",
        redirect: "manual",
        headers: { "User-Agent": "SmartDownloadAccelerator/1.0" },
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
          headers: { Range: "bytes=0-0", "User-Agent": "SmartDownloadAccelerator/1.0" },
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