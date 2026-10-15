import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Express, Request, RequestHandler, Response } from "express";
import { z } from "zod";
import {
  getUser,
  listUsers,
  removeUser,
  updateUser,
  upsertOAuthUser,
  type AuthProvider,
  type OAuthProfile,
  type UserRecord,
} from "./users";

const SESSION_COOKIE = "sda_session";
const OAUTH_COOKIE = "sda_oauth";

const sessionSecret = (() => {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  console.warn("SESSION_SECRET is not set — signing sessions with an ephemeral secret that resets on restart.");
  return randomBytes(32).toString("hex");
})();

const sign = (value: string) => createHmac("sha256", sessionSecret).update(value).digest("base64url");

function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const part of (header ?? "").split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    cookies[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return cookies;
}

function verifySession(raw: string | undefined): string | null {
  if (!raw) return null;
  const index = raw.lastIndexOf(".");
  if (index <= 0) return null;
  const id = raw.slice(0, index);
  const provided = raw.slice(index + 1);
  const expected = sign(id);
  if (provided.length !== expected.length) return null;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected)) ? id : null;
}

export function currentUser(request: Request): UserRecord | null {
  const id = verifySession(parseCookies(request.headers.cookie)[SESSION_COOKIE]);
  if (!id) return null;
  const user = getUser(id);
  return user && !user.blocked ? user : null;
}

const requireUser: RequestHandler = (request, response, next) => {
  const user = currentUser(request);
  if (!user) return response.status(401).json({ error: "Sign in required" });
  response.locals.user = user;
  next();
};

const requireAdmin: RequestHandler = (request, response, next) => {
  const user = currentUser(request);
  if (!user) return response.status(401).json({ error: "Sign in required" });
  if (user.role !== "admin") return response.status(403).json({ error: "Administrator access required" });
  response.locals.user = user;
  next();
};

const publicUser = (user: UserRecord) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  avatar: user.avatar,
  provider: user.provider,
  role: user.role,
  blocked: user.blocked,
  createdAt: user.createdAt,
  lastLoginAt: user.lastLoginAt,
  logins: user.logins,
});

interface ProviderConfig {
  id: AuthProvider;
  label: string;
  clientId?: string;
  clientSecret?: string;
  authorizeUrl: string;
  tokenUrl: string;
  scope: string;
  loadProfile: (accessToken: string) => Promise<OAuthProfile>;
}

const providers: Record<AuthProvider, ProviderConfig> = {
  google: {
    id: "google",
    label: "Google",
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scope: "openid email profile",
    loadProfile: async (accessToken) => {
      const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) throw new Error("Could not read the Google profile");
      const profile = (await response.json()) as { sub: string; email: string; name?: string; picture?: string };
      return {
        provider: "google",
        providerId: profile.sub,
        email: profile.email,
        name: profile.name ?? profile.email,
        avatar: profile.picture,
      };
    },
  },
  github: {
    id: "github",
    label: "GitHub",
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    authorizeUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    scope: "read:user user:email",
    loadProfile: async (accessToken) => {
      const headers = {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "smart-download-accelerator",
      };
      const response = await fetch("https://api.github.com/user", { headers });
      if (!response.ok) throw new Error("Could not read the GitHub profile");
      const profile = (await response.json()) as { id: number; login: string; name?: string; avatar_url?: string; email?: string };
      let email = profile.email ?? "";
      if (!email) {
        const emailResponse = await fetch("https://api.github.com/user/emails", { headers });
        if (emailResponse.ok) {
          const emails = (await emailResponse.json()) as { email: string; primary: boolean; verified: boolean }[];
          email = emails.find((entry) => entry.primary && entry.verified)?.email
            ?? emails.find((entry) => entry.verified)?.email
            ?? "";
        }
      }
      return {
        provider: "github",
        providerId: String(profile.id),
        email: email || `${profile.login}@users.noreply.github.com`,
        name: profile.name ?? profile.login,
        avatar: profile.avatar_url,
      };
    },
  },
};

/** Public base URL the OAuth redirect_uri is built from. */
function baseUrl(request: Request): string {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/+$/, "");
  const suffix = process.env.BASE44_PUBLIC_HOST_SUFFIX;
  if (suffix) return `https://${process.env.PREVIEW_PORT ?? "3000"}-${suffix}`;
  const proto = (request.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0]?.trim() || request.protocol;
  return `${proto}://${request.headers["x-forwarded-host"] ?? request.headers.host}`;
}

const safeNext = (value: unknown): string => {
  const raw = typeof value === "string" ? value : "";
  return raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
};

const sessionCookie = (userId: string) =>
  `${SESSION_COOKIE}=${userId}.${sign(userId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`;

export function registerAuthRoutes(app: Express): void {
  app.get("/api/auth/providers", (_request, response) => {
    response.json({
      providers: Object.values(providers).map((provider) => ({
        id: provider.id,
        label: provider.label,
        enabled: Boolean(provider.clientId && provider.clientSecret),
      })),
    });
  });

  app.get("/api/auth/me", requireUser, (_request, response) => {
    response.json({ user: publicUser(response.locals.user as UserRecord) });
  });

  app.post("/api/auth/logout", (_request, response) => {
    response.setHeader("Set-Cookie", `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
    response.status(204).end();
  });

  for (const provider of Object.values(providers)) {
    const configured = () => Boolean(provider.clientId && provider.clientSecret);

    app.get(`/api/auth/${provider.id}/start`, (request, response) => {
      if (!configured()) return response.status(503).json({ error: `${provider.label} sign-in is not configured` });
      const state = randomBytes(16).toString("base64url");
      const next = safeNext(request.query.next);
      response.setHeader("Set-Cookie", `${OAUTH_COOKIE}=${state}:${encodeURIComponent(next)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`);
      const url = new URL(provider.authorizeUrl);
      url.searchParams.set("client_id", provider.clientId!);
      url.searchParams.set("redirect_uri", `${baseUrl(request)}/api/auth/${provider.id}/callback`);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("scope", provider.scope);
      url.searchParams.set("state", state);
      response.redirect(url.toString());
    });

    app.get(`/api/auth/${provider.id}/callback`, async (request, response) => {
      const redirectUri = `${baseUrl(request)}/api/auth/${provider.id}/callback`;
      try {
        if (!configured()) return response.status(503).send("Sign-in is not configured");
        const [expectedState, rawNext] = (parseCookies(request.headers.cookie)[OAUTH_COOKIE] ?? "").split(":");
        const code = typeof request.query.code === "string" ? request.query.code : "";
        if (!code || !expectedState || request.query.state !== expectedState) {
          return response.redirect("/login?error=state");
        }
        const tokenResponse = await fetch(provider.tokenUrl, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
          body: new URLSearchParams({
            client_id: provider.clientId!,
            client_secret: provider.clientSecret!,
            code,
            redirect_uri: redirectUri,
            grant_type: "authorization_code",
          }),
        });
        const tokenPayload = (await tokenResponse.json()) as { access_token?: string };
        if (!tokenResponse.ok || !tokenPayload.access_token) throw new Error("Token exchange failed");
        const user = upsertOAuthUser(await provider.loadProfile(tokenPayload.access_token));
        if (user.blocked) return response.redirect("/login?error=blocked");
        response.setHeader("Set-Cookie", [
          sessionCookie(user.id),
          `${OAUTH_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
        ]);
        response.redirect(rawNext ? decodeURIComponent(rawNext) : "/");
      } catch (error) {
        console.error(`${provider.label} sign-in failed`, error);
        response.redirect("/login?error=oauth");
      }
    });
  }

  app.get("/api/admin/users", requireAdmin, (_request, response) => {
    response.json({ users: listUsers().map(publicUser) });
  });

  app.patch("/api/admin/users/:id", requireAdmin, (request, response) => {
    const patch = z.object({
      role: z.enum(["admin", "user"]).optional(),
      blocked: z.boolean().optional(),
    }).parse(request.body ?? {});
    const self = response.locals.user as UserRecord;
    const target = String(request.params.id);
    if (patch.blocked === true && target === self.id) {
      return response.status(400).json({ error: "You cannot block your own account" });
    }
    if (patch.role === "user" && target === self.id) {
      return response.status(400).json({ error: "You cannot remove your own administrator role" });
    }
    const id = String(request.params.id);
    const user = updateUser(id, patch);
    return user ? response.json({ user: publicUser(user) }) : response.status(404).json({ error: "User not found" });
  });

  app.delete("/api/admin/users/:id", requireAdmin, (request, response) => {
    const self = response.locals.user as UserRecord;
    if (String(request.params.id) === self.id) {
      return response.status(400).json({ error: "You cannot remove your own account" });
    }
    return removeUser(String(request.params.id)) ? response.status(204).end() : response.status(404).json({ error: "User not found" });
  });
}
