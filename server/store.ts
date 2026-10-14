import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { AppSettings, DownloadJob } from "./types";

/**
 * Durable state for download history and settings. Written atomically
 * (temp file + rename) so a crash mid-write cannot corrupt the store.
 */
export interface PersistedState {
  settings: AppSettings;
  jobs: (DownloadJob & { ranges?: unknown })[];
}

const DATA_DIR = process.env.DATA_DIR ? resolve(process.env.DATA_DIR) : join(process.cwd(), "data");
const STORE_FILE = join(DATA_DIR, "store.json");

export function defaultSettings(downloadDir: string): AppSettings {
  return { downloadDir, maxConcurrent: 3, connectionsPerDownload: 4, autoStart: true };
}

export function loadStore(downloadDir: string): PersistedState {
  try {
    const raw = JSON.parse(readFileSync(STORE_FILE, "utf8")) as Partial<PersistedState>;
    return {
      settings: { ...defaultSettings(downloadDir), ...raw.settings },
      jobs: Array.isArray(raw.jobs) ? raw.jobs : [],
    };
  } catch {
    return { settings: defaultSettings(downloadDir), jobs: [] };
  }
}

export function saveStore(state: PersistedState): void {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    const tmp = `${STORE_FILE}.tmp`;
    writeFileSync(tmp, JSON.stringify(state));
    renameSync(tmp, STORE_FILE);
  } catch (error) {
    console.error("Could not persist download state", error);
  }
}
