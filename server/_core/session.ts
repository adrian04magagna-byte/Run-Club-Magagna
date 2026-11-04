import type { Request } from "express";
import { SignJWT, jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import { users, type User } from "../../drizzle/schema";
import { ForbiddenError } from "../../shared/_core/errors.js";
import { getDb, getUserByOpenId } from "../db";
import { ENV } from "./env";

export const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const ISSUER = "run-club-magagna";

function sessionKey() {
  if (!ENV.sessionSecret || (ENV.isProduction && ENV.sessionSecret.length < 32)) {
    throw new Error("SESSION_SECRET is missing or too short");
  }
  return new TextEncoder().encode(ENV.sessionSecret);
}

/** Signs a session token. The app keeps it (SecureStore/localStorage) and sends it as a Bearer token. */
export async function createSessionToken(openId: string, expiresInMs = SESSION_LIFETIME_MS): Promise<string> {
  return new SignJWT({ openId })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(Math.floor((Date.now() + expiresInMs) / 1000))
    .sign(sessionKey());
}

export async function verifySessionToken(token: string | undefined | null): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, sessionKey(), { algorithms: ["HS256"], issuer: ISSUER });
    return typeof payload.openId === "string" && payload.openId ? payload.openId : null;
  } catch {
    return null;
  }
}

export function bearerToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  return typeof header === "string" && header.startsWith("Bearer ")
    ? header.slice("Bearer ".length).trim()
    : undefined;
}

export async function authenticateRequest(req: Request): Promise<User> {
  const openId = await verifySessionToken(bearerToken(req));
  if (!openId) throw ForbiddenError("Invalid session");
  const user = await getUserByOpenId(openId);
  if (!user) throw ForbiddenError("User not found");
  return user;
}

export async function touchLastSignedIn(userId: number) {
  const db = await getDb();
  await db?.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, userId));
}
