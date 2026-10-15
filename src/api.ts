import type { AppSettings, DownloadJob } from "./types";

const json = async <T>(url: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? "Request failed");
  return payload as T;
};

export const api = {
  analyze: (url: string) => json<{
    fileName: string;
    fileSize: number;
    contentType: string;
    supportsRange: boolean;
    recommendedConnections: number;
  }>("/api/analyze-url", { method: "POST", body: JSON.stringify({ url }) }),
  start: (url: string, connections: number) =>
    json<DownloadJob>("/api/download/start", {
      method: "POST",
      body: JSON.stringify({ url, connections }),
    }),
  startBulk: (urls: string[], connections: number) =>
    json<{ started: DownloadJob[]; failed: { url: string; error: string }[] }>("/api/download/bulk", {
      method: "POST",
      body: JSON.stringify({ urls, connections }),
    }),
  list: () => json<DownloadJob[]>("/api/download/history"),
  action: (id: string, action: "pause" | "resume" | "retry" | "cancel") =>
    json<DownloadJob>(`/api/download/${id}/${action}`, { method: "POST" }),
  remove: async (id: string) => {
    const response = await fetch(`/api/download/${id}`, { method: "DELETE" });
    if (!response.ok) throw new Error("Could not remove download");
  },
  pauseAll: () => json<DownloadJob[]>("/api/download/pause-all", { method: "POST" }),
  resumeAll: () => json<DownloadJob[]>("/api/download/resume-all", { method: "POST" }),
  settings: () => json<AppSettings>("/api/settings"),
  saveSettings: (patch: Partial<AppSettings>) =>
    json<AppSettings>("/api/settings", { method: "PUT", body: JSON.stringify(patch) }),
};
