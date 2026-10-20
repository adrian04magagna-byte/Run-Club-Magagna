import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { activityBelongsToAthleteHash, hmacStravaAthleteId } from "../server/_core/stravaCrypto";

const secret = "test-secret-that-is-only-used-in-this-test";

describe("Strava athlete pseudonymization (HMAC)", () => {
  it("is keyed, stable and different from a plain SHA-256 of the ID", () => {
    const hash = hmacStravaAthleteId("134815", secret);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).toBe(hmacStravaAthleteId("134815", secret));
    expect(hash).not.toBe(createHash("sha256").update("134815", "utf8").digest("hex"));
    expect(hash).not.toBe(hmacStravaAthleteId("134815", `${secret}-other`));
  });

  it("rejects short keys and malformed IDs", () => {
    expect(() => hmacStravaAthleteId("134815", "short-key")).toThrow(/32 bytes/);
    expect(() => hmacStravaAthleteId("not-a-number", secret)).toThrow();
  });

  it("confirms ownership only for the linked athlete and the same key", () => {
    const own = hmacStravaAthleteId("134815", secret);
    expect(activityBelongsToAthleteHash({ athlete: { id: 134815 } }, own, secret)).toBe(true);
    expect(activityBelongsToAthleteHash({ athlete: { id: "134815" } }, own, secret)).toBe(true);
    expect(activityBelongsToAthleteHash({ athlete: { id: 134816 } }, own, secret)).toBe(false);
    expect(activityBelongsToAthleteHash({ athlete: { id: 134815 } }, own, `${secret}-other`)).toBe(false);
    expect(activityBelongsToAthleteHash({ id: 1, athlete: null }, own, secret)).toBe(false);
    expect(activityBelongsToAthleteHash({ athlete: { id: 134815 } }, "legacy-or-invalid", secret)).toBe(false);
  });
});
