import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.DATABASE_URL = "pglite:memory";

const strava = vi.hoisted(() => ({ list: vi.fn(), streams: vi.fn() }));
vi.mock("../server/_core/stravaOAuth", () => ({ listStravaActivitiesSince: strava.list, getStravaActivityStreams: strava.streams }));

const { TRPCError } = await import("@trpc/server");
const { eq } = await import("drizzle-orm");
const { stravaActivityRecords, stravaConnections, users } = await import("../drizzle/schema");
const { getDb } = await import("../server/db");
const { deleteStravaHistory, getStravaHistoryStatus, saveStravaHistory } = await import("../server/_core/stravaHistory");

const run = (id: number, sportType = "Run") => ({ id: String(id), name: "Treino", sportType, startDate: `2026-10-${String((id % 28) + 1).padStart(2, "0")}T10:00:00Z`, distanceMeters: 5000 });

describe("Strava test history", () => {
  let coachId = 0;
  let otherId = 0;

  beforeEach(async () => {
    const db = (await getDb())!;
    await db.delete(users).where(eq(users.openId, "history-coach"));
    await db.delete(users).where(eq(users.openId, "history-other"));
    [{ id: coachId }] = await db.insert(users).values({ openId: "history-coach" }).returning({ id: users.id });
    [{ id: otherId }] = await db.insert(users).values({ openId: "history-other" }).returning({ id: users.id });
    await db.insert(stravaConnections).values([coachId, otherId].map((userId) => ({
      userId, stravaAthleteHash: `hash-${userId}`, encryptedTokenEnvelope: "x", scopes: "activity:read",
      tokenExpiresAt: new Date(), consentedAt: new Date(), consentVersion: "test",
    })));
    strava.list.mockReset();
    strava.streams.mockReset();
    strava.streams.mockResolvedValue({ heartrate: [150] });
  });

  it("saves only runs, fills streams in batches and does not duplicate", async () => {
    strava.list.mockResolvedValue({ items: [...Array.from({ length: 12 }, (_, i) => run(i + 1)), run(99, "Ride")], truncated: false });
    await expect(saveStravaHistory(coachId, true)).resolves.toMatchObject({ saved: 12, withStreams: 10, truncated: false, consented: true });
    await expect(saveStravaHistory(coachId)).resolves.toMatchObject({ saved: 12, withStreams: 12 });
    expect(strava.streams).toHaveBeenCalledTimes(12);
  });

  it("refuses to save without the member's consent or a connection", async () => {
    await expect(saveStravaHistory(coachId)).rejects.toThrow(/Autorize/);
    expect(strava.list).not.toHaveBeenCalled();
    const db = (await getDb())!;
    await db.delete(stravaConnections).where(eq(stravaConnections.userId, coachId));
    await expect(saveStravaHistory(coachId, true)).rejects.toThrow(/Conecte/);
  });

  it("keeps each account apart and deletes only its own rows", async () => {
    strava.list.mockResolvedValue({ items: [run(1)], truncated: false });
    await saveStravaHistory(coachId, true);
    await saveStravaHistory(otherId, true);
    await deleteStravaHistory(coachId);
    await expect(getStravaHistoryStatus(coachId)).resolves.toMatchObject({ saved: 0, consented: false });
    await expect(getStravaHistoryStatus(otherId)).resolves.toMatchObject({ saved: 1 });
  });

  it("stops the batch at the rate limit and skips an activity gone from Strava", async () => {
    strava.list.mockResolvedValue({ items: [run(1), run(2), run(3)], truncated: false });
    strava.streams
      .mockRejectedValueOnce(new TRPCError({ code: "NOT_FOUND" }))
      .mockRejectedValueOnce(new TRPCError({ code: "TOO_MANY_REQUESTS" }));
    await expect(saveStravaHistory(coachId, true)).resolves.toMatchObject({ saved: 3, withStreams: 1 });
    expect(strava.streams).toHaveBeenCalledTimes(2);
    const db = (await getDb())!;
    await expect(db.select().from(stravaActivityRecords).where(eq(stravaActivityRecords.userId, coachId))).resolves.toHaveLength(3);
  });
});
