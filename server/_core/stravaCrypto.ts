import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";

/**
 * Pseudonymization of the Strava athlete ID.
 *
 * Strava IDs are small, enumerable numbers, so a plain SHA-256 can be reversed by hashing every possible ID.
 * We use HMAC-SHA-256 with a server-only key derived (HKDF, distinct "info" label) from the dedicated
 * STRAVA_TOKEN_ENCRYPTION_KEY. The derived key is NOT the token-encryption key.
 */
function athleteHashKey(secret: string): Buffer {
  if (Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("A dedicated Strava key of at least 32 bytes is required to pseudonymize athlete IDs.");
  }
  return Buffer.from(
    hkdfSync("sha256", Buffer.from(secret, "utf8"), Buffer.from("run-club-magagna"), Buffer.from("strava-athlete-hash-v2"), 32),
  );
}

export function hmacStravaAthleteId(athleteId: string, secret: string): string {
  if (!/^\d{1,32}$/.test(athleteId)) throw new Error("Invalid Strava athlete ID.");
  return createHmac("sha256", athleteHashKey(secret)).update(`strava-athlete:${athleteId}`, "utf8").digest("hex");
}

export function activityBelongsToAthleteHash(activity: unknown, expectedHash: string, secret: string): boolean {
  if (!/^[a-f0-9]{64}$/.test(expectedHash) || !activity || typeof activity !== "object") return false;
  const athlete = (activity as Record<string, unknown>).athlete;
  if (!athlete || typeof athlete !== "object") return false;
  const rawId = (athlete as Record<string, unknown>).id;
  const athleteId = typeof rawId === "string"
    ? rawId
    : typeof rawId === "number" && Number.isSafeInteger(rawId) && rawId > 0
      ? String(rawId)
      : "";
  if (!/^\d{1,32}$/.test(athleteId)) return false;
  const actual = Buffer.from(hmacStravaAthleteId(athleteId, secret), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
