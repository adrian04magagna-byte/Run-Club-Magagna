import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  decryptStravaTokens,
  encryptStravaTokens,
  hashStravaAthleteId,
  hashStravaOAuthState,
  parseStravaJsonText,
  stravaActivityBelongsToAthleteHash,
  validateStravaReturnUri,
} from "../server/_core/stravaOAuth";
import { RUN_CLUB_APP_SCHEME, STRAVA_CALLBACK_PATH } from "../shared/strava";

describe("Strava OAuth security helpers", () => {
  it("encrypts tokens with authenticated encryption and decrypts only with the same key", () => {
    const secret = "test-secret-that-is-only-used-in-this-test";
    const tokens = { accessToken: "access-token-test", refreshToken: "refresh-token-test" };
    const encrypted = encryptStravaTokens(tokens, secret);

    expect(encrypted).not.toContain(tokens.accessToken);
    expect(encrypted).not.toContain(tokens.refreshToken);
    expect(decryptStravaTokens(encrypted, secret)).toEqual(tokens);
    expect(() => decryptStravaTokens(encrypted, `${secret}-wrong`)).toThrow();
    expect(() => encryptStravaTokens(tokens, "short-key")).toThrow(/32 bytes/);
  });

  it("hashes OAuth state before it can be stored in the database", () => {
    const state = "d".repeat(64);
    expect(hashStravaOAuthState(state)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashStravaOAuthState(state)).not.toBe(state);
  });

  it("accepts only the callback path on the web origin that initiated OAuth", () => {
    const origin = "https://preview.example.test";
    const callback = `${origin}${STRAVA_CALLBACK_PATH}`;
    expect(validateStravaReturnUri(callback, "web", origin)).toBe(`${callback}`);
    expect(() => validateStravaReturnUri("https://attacker.example/strava/callback", "web", origin)).toThrow();
    expect(() => validateStravaReturnUri(`${origin}/another-page`, "web", origin)).toThrow();
    expect(() => validateStravaReturnUri(`${callback}?next=https://attacker.example`, "web", origin)).toThrow();
  });

  it("accepts the app's fixed native deep-link route and rejects arbitrary schemes", () => {
    const nativeReturn = `${RUN_CLUB_APP_SCHEME}://strava/callback`;
    expect(validateStravaReturnUri(nativeReturn, "native")).toBe(nativeReturn);
    expect(() => validateStravaReturnUri("https://attacker.example/strava/callback", "native")).toThrow();
    expect(() => validateStravaReturnUri("another-app://strava/callback", "native")).toThrow();
  });

  it("preserves large decimal activity IDs instead of rounding them as JavaScript numbers", () => {
    const parsed = parseStravaJsonText('{"id":12345678987654321,"name":"Treino"}') as { id: string; name: string };
    expect(parsed.id).toBe("12345678987654321");
    expect(parsed.name).toBe("Treino");
  });

  it("pseudonymizes the athlete ID with a keyed HMAC instead of a plain SHA-256", () => {
    const secret = "test-secret-that-is-only-used-in-this-test";
    const hash = hashStravaAthleteId("134815", secret);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).toBe(hashStravaAthleteId("134815", secret));
    expect(hash).not.toBe(createHash("sha256").update("134815", "utf8").digest("hex"));
    expect(hash).not.toBe(hashStravaAthleteId("134815", `${secret}-other`));
    expect(() => hashStravaAthleteId("134815", "short-key")).toThrow(/32 bytes/);
    expect(() => hashStravaAthleteId("not-a-number", secret)).toThrow();
  });

  it("allows details only when the Strava activity belongs to the linked athlete", () => {
    const secret = "test-secret-that-is-only-used-in-this-test";
    const ownAthleteHash = hashStravaAthleteId("134815", secret);
    expect(stravaActivityBelongsToAthleteHash({ athlete: { id: 134815 } }, ownAthleteHash, secret)).toBe(true);
    expect(stravaActivityBelongsToAthleteHash({ athlete: { id: 134816 } }, ownAthleteHash, secret)).toBe(false);
    expect(stravaActivityBelongsToAthleteHash({ athlete: { id: "12345678987654321" } }, hashStravaAthleteId("12345678987654321", secret), secret)).toBe(true);
    expect(stravaActivityBelongsToAthleteHash({ id: 123, athlete: null }, ownAthleteHash, secret)).toBe(false);
    expect(stravaActivityBelongsToAthleteHash({ athlete: { id: 134815 } }, ownAthleteHash, `${secret}-other`)).toBe(false);
  });
});
