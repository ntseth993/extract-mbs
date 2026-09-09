export type DownloadStatus = "downloading" | "paused" | "completed" | "failed" | "cancelled";

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
  createdAt: string;
  sample?: boolean;
}

export interface NetworkInfo {
  type: string;
  downlink: number;
  latency: number;
  effectiveType: string;
}