export type DownloadStatus = "queued" | "downloading" | "paused" | "completed" | "failed" | "cancelled";

export interface DownloadJob {
  id: string;
  fileName: string;
  url?: string;
  fileSize: number;
  downloaded: number;
  speed: number;
  eta: number;
  connections: number;
  status: DownloadStatus;
  supportsRange: boolean;
  retries: number;
  priority?: number;
  createdAt: string;
  completedAt?: string;
  error?: string;
  outputPath?: string;
  sample?: boolean;
}

export interface NetworkInfo {
  type: string;
  downlink: number;
  latency: number;
  effectiveType: string;
}

export interface AppSettings {
  downloadDir: string;
  maxConcurrent: number;
  connectionsPerDownload: number;
  autoStart: boolean;
}

export interface DesktopBridge {
  platform: string;
  chooseDirectory: () => Promise<string | null>;
  revealFile: (target: string) => Promise<boolean>;
  openFile: (target: string) => Promise<boolean>;
}
