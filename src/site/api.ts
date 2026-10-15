export type ProviderId = "google" | "github";

export interface SiteUser {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  provider: ProviderId;
  role: "admin" | "user";
  blocked: boolean;
  createdAt: string;
  lastLoginAt?: string;
  logins: number;
}

export interface ProviderInfo {
  id: ProviderId;
  label: string;
  enabled: boolean;
}

export interface SiteConfig {
  version: string;
  releases: { windows: string; mac: string; linux: string };
}

const json = async <T>(url: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (response.status === 204) return undefined as T;
  const payload = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "Request failed");
  return payload as T;
};

export const siteApi = {
  config: () => json<SiteConfig>("/api/site/config"),
  providers: () => json<{ providers: ProviderInfo[] }>("/api/auth/providers"),
  me: () => json<{ user: SiteUser }>("/api/auth/me"),
  logout: () => json<void>("/api/auth/logout", { method: "POST" }),
  users: () => json<{ users: SiteUser[] }>("/api/admin/users"),
  updateUser: (id: string, patch: { role?: "admin" | "user"; blocked?: boolean }) =>
    json<{ user: SiteUser }>(`/api/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  removeUser: (id: string) => json<void>(`/api/admin/users/${id}`, { method: "DELETE" }),
};
