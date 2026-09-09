export type JobStatus = "downloading" | "paused" | "completed" | "failed" | "cancelled";

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
  createdAt: string;
  outputPath?: string;
}