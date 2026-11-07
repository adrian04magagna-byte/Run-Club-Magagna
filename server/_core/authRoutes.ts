import { randomBytes } from "node:crypto";
import { parse as parseCookieHeader } from "cookie";
import { eq } from "drizzle-orm";
import type { Express, Request, Response } from "express";
import { SignJWT, jwtVerify } from "jose";

import { athleteAccounts, users } from "../../drizzle/schema";
import { getDb } from "../db";
import { accountUser } from "../routers/account";
import { uploadProfileAvatar } from "../storage/profile-avatars";
import { ENV, isCoachEmail } from "./env";
import { authenticateRequest, createSessionToken, touchLastSignedIn } from "./session";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const NONCE_COOKIE = "rcm_google_nonce";
const STATE_LIFETIME_SECONDS = 10 * 60;

export function googleLoginConfigured(): boolean {
  return Boolean(ENV.googleClientId && ENV.googleClientSecret && ENV.apiBaseUrl && ENV.sessionSecret);
}

function stateKey() {
  return new TextEncoder().encode(`google-state:${ENV.sessionSecret}`);
}

function googleRedirectUri() {
  return new URL("/api/auth/google/callback", ENV.apiBaseUrl).toString();
}

/** Only exact, pre-registered app URLs may receive a session token. */
export function isAllowedReturnUrl(value: unknown): value is string {
  return typeof value === "string" && ENV.appReturnUrls.includes(value);
}

function redirectWithFragment(res: Response, returnTo: string, params: Record<string, string>) {
  // The fragment never reaches servers or logs, so the session token stays on the device.
  res.setHeader("Cache-Control", "no-store");
  res.redirect(302, `${returnTo}#${new URLSearchParams(params).toString()}`);
}

function isSecure(req: Request) {
  return req.protocol === "https" || String(req.headers["x-forwarded-proto"] ?? "").split(",")[0]?.trim() === "https";
}

type GoogleProfile = { sub: string; email: string; name: string | null; picture: string | null };

async function fetchGoogleProfile(code: string): Promise<GoogleProfile | null> {
  const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: ENV.googleClientId,
      client_secret: ENV.googleClientSecret,
      redirect_uri: googleRedirectUri(),
      grant_type: "authorization_code",
    }),
  });
  if (!tokenResponse.ok) return null;
  const token = (await tokenResponse.json()) as { access_token?: unknown };
  if (typeof token.access_token !== "string") return null;

  const infoResponse = await fetch(GOOGLE_USERINFO_URL, { headers: { Authorization: `Bearer ${token.access_token}` } });
  if (!infoResponse.ok) return null;
  const info = (await infoResponse.json()) as Record<string, unknown>;
  if (typeof info.sub !== "string" || typeof info.email !== "string" || info.email_verified !== true) return null;
  return {
    sub: info.sub,
    email: info.email.trim().toLowerCase(),
    name: typeof info.name === "string" ? info.name : null,
    picture: typeof info.picture === "string" ? info.picture : null,
  };
}

/** Only Google's own photo host is fetched, so the profile cannot point the server elsewhere. */
function googlePhotoUrl(picture: string | null): URL | null {
  if (!picture) return null;
  try {
    const url = new URL(picture);
    if (url.protocol !== "https:" || !url.hostname.endsWith(".googleusercontent.com")) return null;
    // Ask for a 256px square crop instead of the default 96px.
    url.pathname = url.pathname.replace(/=[^/]*$/, "") + "=s256-c";
    return url;
  } catch {
    return null;
  }
}

/** Copies the Google profile photo for people who have not chosen one yet. Best effort. */
async function importGooglePhoto(userId: number, picture: string | null) {
  const url = googlePhotoUrl(picture);
  if (!url) return;
  try {
    const response = await fetch(url, { headers: { Accept: "image/jpeg" }, redirect: "error" });
    if (!response.ok) return;
    const bytes = Buffer.from(await response.arrayBuffer());
    const avatarKey = await uploadProfileAvatar(userId, bytes.toString("base64"));
    const db = await getDb();
    await db?.update(users).set({ avatarKey }).where(eq(users.id, userId));
  } catch {
    console.warn("[Auth] Could not import Google profile photo");
  }
}

/**
 * Finds the person behind a verified Google email, creating them on first sign-in.
 * New athletes wait for coach approval exactly like email/password sign-ups.
 */
async function signInGoogleProfile(profile: GoogleProfile) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const isCoach = isCoachEmail(profile.email);

  return db.transaction(async (tx) => {
    const byEmail = await tx.select().from(users).where(eq(users.email, profile.email)).limit(1);
    let user = byEmail[0];
    if (!user) {
      const inserted = await tx.insert(users).values({
        openId: `google_${profile.sub}`,
        name: profile.name ?? profile.email,
        email: profile.email,
        loginMethod: "google",
        role: isCoach ? "admin" : "user",
      }).returning();
      user = inserted[0];
    } else if (isCoach && user.role !== "admin") {
      await tx.update(users).set({ role: "admin" }).where(eq(users.id, user.id));
      user = { ...user, role: "admin" };
    }

    const accounts = await tx.select({ status: athleteAccounts.status }).from(athleteAccounts)
      .where(eq(athleteAccounts.userId, user.id)).limit(1);
    let status = accounts[0]?.status;
    if (!status) {
      status = isCoach ? "approved" : "pending";
      await tx.insert(athleteAccounts).values({ userId: user.id, normalizedEmail: profile.email, passwordHash: null, status });
    }
    return { user, status: user.role === "admin" ? "approved" : status };
  });
}

export function registerAuthRoutes(app: Express) {
  app.get("/api/auth/providers", (_req, res) => {
    res.json({ google: googleLoginConfigured() });
  });

  app.get("/api/auth/google/start", async (req, res) => {
    const returnTo = req.query.returnTo;
    if (!isAllowedReturnUrl(returnTo)) {
      res.status(400).send("Endereço de retorno não autorizado.");
      return;
    }
    if (!googleLoginConfigured()) {
      redirectWithFragment(res, returnTo, { error: "google_not_configured" });
      return;
    }
    const nonce = randomBytes(32).toString("hex");
    const state = await new SignJWT({ returnTo, nonce })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime(Math.floor(Date.now() / 1000) + STATE_LIFETIME_SECONDS)
      .sign(stateKey());
    res.cookie(NONCE_COOKIE, nonce, {
      httpOnly: true,
      secure: isSecure(req),
      sameSite: "lax",
      path: "/api/auth/google",
      maxAge: STATE_LIFETIME_SECONDS * 1000,
    });
    const url = new URL(GOOGLE_AUTH_URL);
    url.searchParams.set("client_id", ENV.googleClientId);
    url.searchParams.set("redirect_uri", googleRedirectUri());
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("state", state);
    url.searchParams.set("prompt", "select_account");
    res.redirect(302, url.toString());
  });

  app.get("/api/auth/google/callback", async (req, res) => {
    let returnTo: string | null = null;
    try {
      const { payload } = await jwtVerify(String(req.query.state ?? ""), stateKey(), { algorithms: ["HS256"] });
      if (!isAllowedReturnUrl(payload.returnTo) || typeof payload.nonce !== "string") throw new Error("bad state");
      returnTo = payload.returnTo;
      const cookieNonce = parseCookieHeader(req.headers.cookie ?? "")[NONCE_COOKIE];
      res.clearCookie(NONCE_COOKIE, { path: "/api/auth/google" });
      if (!cookieNonce || cookieNonce !== payload.nonce) throw new Error("nonce mismatch");
    } catch {
      if (returnTo) redirectWithFragment(res, returnTo, { error: "expired" });
      else res.status(400).send("O login expirou. Volte ao app e tente novamente.");
      return;
    }

    if (typeof req.query.error === "string" || typeof req.query.code !== "string") {
      redirectWithFragment(res, returnTo, { error: "cancelled" });
      return;
    }

    try {
      const profile = await fetchGoogleProfile(req.query.code);
      if (!profile) {
        redirectWithFragment(res, returnTo, { error: "google_failed" });
        return;
      }
      const { user, status } = await signInGoogleProfile(profile);
      if (!user.avatarKey) await importGooglePhoto(user.id, profile.picture);
      if (status !== "approved") {
        redirectWithFragment(res, returnTo, { status, email: profile.email });
        return;
      }
      await touchLastSignedIn(user.id);
      redirectWithFragment(res, returnTo, { token: await createSessionToken(user.openId) });
    } catch {
      console.error("[Auth] Google sign-in failed");
      redirectWithFragment(res, returnTo, { error: "google_failed" });
    }
  });

  app.get("/api/auth/me", async (req, res) => {
    try {
      const user = await authenticateRequest(req);
      res.json({ user: await accountUser(user) });
    } catch {
      res.status(401).json({ error: "Not authenticated", user: null });
    }
  });

  // Sessions are bearer tokens kept by the app; logging out only needs the app to forget it.
  app.post("/api/auth/logout", (_req, res) => {
    res.json({ success: true });
  });
}
