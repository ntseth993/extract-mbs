import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

export type AuthProvider = "google" | "github";
export type UserRole = "admin" | "user";

export interface UserRecord {
  id: string;
  provider: AuthProvider;
  providerId: string;
  email: string;
  name: string;
  avatar?: string;
  role: UserRole;
  blocked: boolean;
  createdAt: string;
  lastLoginAt?: string;
  logins: number;
}

export interface OAuthProfile {
  provider: AuthProvider;
  providerId: string;
  email: string;
  name: string;
  avatar?: string;
}

const DATA_DIR = process.env.DATA_DIR ? resolve(process.env.DATA_DIR) : join(process.cwd(), "data");
const USERS_FILE = join(DATA_DIR, "users.json");

/**
 * Website accounts, kept beside the download store and written atomically so a
 * crash mid-write cannot corrupt the file.
 *
 * Roles: anyone whose email is listed in ADMIN_EMAILS is an admin. When
 * ADMIN_EMAILS is empty the first account to sign in becomes the admin, so a
 * fresh deployment always has someone who can reach the admin dashboard.
 */
function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
}

function load(): UserRecord[] {
  try {
    const raw = JSON.parse(readFileSync(USERS_FILE, "utf8")) as { users?: UserRecord[] };
    return Array.isArray(raw.users) ? raw.users : [];
  } catch {
    return [];
  }
}

let users: UserRecord[] = load();

function persist(): void {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    const tmp = `${USERS_FILE}.tmp`;
    writeFileSync(tmp, JSON.stringify({ users }, null, 2));
    renameSync(tmp, USERS_FILE);
  } catch (error) {
    console.error("Could not persist the user store", error);
  }
}

export function listUsers(): UserRecord[] {
  return [...users].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getUser(id: string): UserRecord | undefined {
  return users.find((user) => user.id === id);
}

export function upsertOAuthUser(profile: OAuthProfile): UserRecord {
  const now = new Date().toISOString();
  const configured = adminEmails();
  const existing = users.find((user) => user.provider === profile.provider && user.providerId === profile.providerId)
    ?? users.find((user) => user.email.toLowerCase() === profile.email.toLowerCase());

  if (existing) {
    existing.provider = profile.provider;
    existing.providerId = profile.providerId;
    existing.email = profile.email || existing.email;
    existing.name = profile.name || existing.name;
    existing.avatar = profile.avatar ?? existing.avatar;
    existing.lastLoginAt = now;
    existing.logins += 1;
    if (configured.length && configured.includes(existing.email.toLowerCase())) existing.role = "admin";
    persist();
    return existing;
  }

  const role: UserRole = configured.length
    ? configured.includes(profile.email.toLowerCase()) ? "admin" : "user"
    : users.some((user) => user.role === "admin") ? "user" : "admin";

  const created: UserRecord = {
    id: randomUUID(),
    provider: profile.provider,
    providerId: profile.providerId,
    email: profile.email,
    name: profile.name,
    avatar: profile.avatar,
    role,
    blocked: false,
    createdAt: now,
    lastLoginAt: now,
    logins: 1,
  };
  users.push(created);
  persist();
  return created;
}

export function updateUser(id: string, patch: { role?: UserRole; blocked?: boolean }): UserRecord | undefined {
  const user = getUser(id);
  if (!user) return undefined;
  if (patch.role) user.role = patch.role;
  if (typeof patch.blocked === "boolean") user.blocked = patch.blocked;
  persist();
  return user;
}

export function removeUser(id: string): boolean {
  const next = users.filter((user) => user.id !== id);
  if (next.length === users.length) return false;
  users = next;
  persist();
  return true;
}
