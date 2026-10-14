export type JobStatus = "queued" | "downloading" | "paused" | "completed" | "failed" | "cancelled";

export interface DownloadJob {
  id: string;
  fileName: string;
  url: string;
  fileSize: number;
  downloaded: number;
  speed: number;
  eta: number;
  connections: number;
  status: JobStatus;
  supportsRange: boolean;
  retries: number;
  priority: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  etag?: string;
  lastModified?: string;
  outputPath?: string;
}

export interface AppSettings {
  downloadDir: string;
  maxConcurrent: number;
  connectionsPerDownload: number;
  autoStart: boolean;
}

export interface AnalyzeResult {
  resolvedUrl: string;
  fileName: string;
  fileSize: number;
  contentType: string;
  supportsRange: boolean;
  recommendedConnections: number;
  etag?: string;
  lastModified?: string;
}
