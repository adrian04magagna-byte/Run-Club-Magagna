import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, eq, ne } from "drizzle-orm";
import type { Express } from "express";

import { profileAvatars } from "../../drizzle/schema";
import { ENV } from "../_core/env";
import { getDb } from "../db";

const MAX_AVATAR_BYTES = 300_000;
const MAX_AVATAR_BASE64_CHARS = 400_000;
const URL_LIFETIME_SECONDS = 60 * 60;
const KEY_PATTERN = /^profile-avatars\/\d+\/[0-9a-f-]{36}\.jpg$/;

function serviceUnavailable(): TRPCError {
  return new TRPCError({
    code: "SERVICE_UNAVAILABLE",
    message: "O armazenamento de fotos está indisponível agora. Tente novamente mais tarde.",
  });
}

function decodeJpeg(base64: string): Buffer {
  if (base64.length < 16 || base64.length > MAX_AVATAR_BASE64_CHARS || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "A foto não está em um formato válido. Escolha uma imagem JPEG menor." });
  }

  const bytes = Buffer.from(base64, "base64");
  const canonical = bytes.toString("base64").replace(/=+$/, "");
  if (
    bytes.length > MAX_AVATAR_BYTES ||
    bytes.length < 4 ||
    canonical !== base64.replace(/=+$/, "") ||
    bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff ||
    bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9
  ) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "A foto precisa ser um JPEG válido de até 300 KB." });
  }
  return bytes;
}

function sign(objectKey: string, expires: number): string {
  return createHmac("sha256", `avatar-url:${ENV.sessionSecret}`).update(`${objectKey}:${expires}`).digest("hex");
}

export async function uploadProfileAvatar(userId: number, base64: string): Promise<string> {
  const bytes = decodeJpeg(base64);
  const db = await getDb();
  if (!db) throw serviceUnavailable();
  const objectKey = `profile-avatars/${userId}/${randomUUID()}.jpg`;
  await db.insert(profileAvatars).values({ avatarKey: objectKey, userId, data: bytes });
  // Only the newest photo is referenced; drop older ones.
  await db.delete(profileAvatars).where(and(eq(profileAvatars.userId, userId), ne(profileAvatars.avatarKey, objectKey)));
  return objectKey;
}

/**
 * Returns a short-lived signed URL. Callers decide who may see which photo (own photo, or the
 * coach for linked athletes); the URL itself carries the permission so <img> tags can load it.
 */
export async function getProfileAvatarUrl(userId: number, objectKey: string | null | undefined): Promise<string | null> {
  if (!objectKey || !Number.isSafeInteger(userId) || userId < 1) return null;
  if (!objectKey.startsWith(`profile-avatars/${userId}/`) || !KEY_PATTERN.test(objectKey)) return null;
  if (!ENV.apiBaseUrl || !ENV.sessionSecret) return null;
  // Round expiry to the hour so repeated queries return the same URL and images stay cached.
  const expires = (Math.floor(Date.now() / 1000 / URL_LIFETIME_SECONDS) + 2) * URL_LIFETIME_SECONDS;
  const url = new URL(`/api/avatars/${objectKey}`, ENV.apiBaseUrl);
  url.searchParams.set("expires", String(expires));
  url.searchParams.set("sig", sign(objectKey, expires));
  return url.toString();
}

export function registerAvatarRoute(app: Express) {
  app.get(/^\/api\/avatars\/(profile-avatars\/\d+\/[0-9a-f-]{36}\.jpg)$/, async (req, res) => {
    const objectKey = (req.params as Record<string, string>)[0];
    const expires = Number(req.query.expires);
    const sig = typeof req.query.sig === "string" ? req.query.sig : "";
    const expected = Buffer.from(sign(objectKey, expires), "hex");
    const given = Buffer.from(/^[a-f0-9]{64}$/.test(sig) ? sig : "", "hex");
    if (!Number.isFinite(expires) || expires * 1000 < Date.now() || given.length !== expected.length || !timingSafeEqual(given, expected)) {
      res.status(403).end();
      return;
    }
    const db = await getDb();
    const rows = db
      ? await db.select({ data: profileAvatars.data }).from(profileAvatars).where(eq(profileAvatars.avatarKey, objectKey)).limit(1)
      : [];
    if (!rows[0]) {
      res.status(404).end();
      return;
    }
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.send(rows[0].data);
  });
}
