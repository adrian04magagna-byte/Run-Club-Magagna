import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

process.env.DATABASE_URL = "pglite:memory";
process.env.SESSION_SECRET = "test-session-secret-with-at-least-32-chars";
process.env.COACH_EMAIL = "coach@example.com";
process.env.COACH_SIGNUP_CODE = "coach-code";
process.env.EXPO_PUBLIC_API_BASE_URL = "https://api.example.com";

const strava = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("../server/_core/stravaOAuth", async (original) => ({
  ...(await original<typeof import("../server/_core/stravaOAuth")>()),
  listStravaActivitiesSince: strava.list,
}));

const { eq } = await import("drizzle-orm");
const { stravaConnections, users } = await import("../drizzle/schema");
const { getDb } = await import("../server/db");
const { appRouter } = await import("../server/routers");
const { createContext } = await import("../server/_core/context");

async function callerFor(token?: string) {
  const req = { headers: token ? { authorization: `Bearer ${token}` } : {} } as Request;
  const ctx = await createContext({ req, res: { setHeader() {} } as unknown as Response, info: {} as never });
  return appRouter.createCaller(ctx);
}

const today = "2026-11-12";
const run = { id: "1", name: "Rodagem", sportType: "Run", type: "Run", startDate: "2026-11-10T09:00:00Z", startDateLocal: "2026-11-10T06:00:00", distanceMeters: 8000, movingTimeSeconds: 2400, elevationGainMeters: 20, averageHeartRate: null };

describe("a coach's own Strava runs in the athlete list", () => {
  let coach: Awaited<ReturnType<typeof callerFor>>;
  let twinId = 0;
  let otherId = 0;

  beforeAll(async () => {
    strava.list.mockResolvedValue({ items: [run], truncated: false });
    const anonymous = await callerFor();
    const registered = await anonymous.account.register({ name: "Coach", email: "coach@example.com", password: "senha-do-coach-1", coachCode: "coach-code" });
    coach = await callerFor(registered.sessionToken);
    await anonymous.account.register({ name: "Coach Aluno", email: "gemeo@example.com", password: "senha-forte-123" });
    await anonymous.account.register({ name: "Outra", email: "outra@example.com", password: "senha-forte-123" });
    const pending = await coach.club.pendingAthletes();
    for (const item of pending) await coach.club.approveAthlete({ athleteId: item.userId });
    twinId = pending.find((item) => item.email === "gemeo@example.com")!.userId;
    otherId = pending.find((item) => item.email === "outra@example.com")!.userId;
  });

  it("counts the coach's runs on the coach account while there is no student profile", async () => {
    const db = (await getDb())!;
    const [me] = await db.select({ id: users.id }).from(users).where(eq(users.email, "coach@example.com"));
    const values = { stravaAthleteHash: "same-person", encryptedTokenEnvelope: "x", scopes: "read", tokenExpiresAt: new Date(), consentedAt: new Date(), consentVersion: "1" };
    await db.insert(stravaConnections).values({ ...values, userId: me.id });

    const list = await coach.club.clubAthletes({ today });
    expect(list.find((item) => item.isMe)).toMatchObject({ userId: me.id, isCoachAccount: true, summary: { weekDistanceMeters: 8000, toReview: 0 } });
    await expect(coach.club.athleteDetail({ athleteId: me.id, today })).resolves.toMatchObject({
      totals: { runs: 1, distanceMeters: 8000, durationSeconds: 2400 },
      strava: { status: "ok", runs: [{ title: "Rodagem" }] },
    });

    await db.insert(stravaConnections).values({ ...values, userId: twinId });
    const merged = await coach.club.clubAthletes({ today });
    expect(merged.filter((item) => item.isMe)).toEqual([expect.objectContaining({ userId: twinId, isCoachAccount: false })]);
    expect(merged.some((item) => item.userId === me.id)).toBe(false);
  });

  it("never shows those runs on someone else's sheet", async () => {
    const detail = await coach.club.athleteDetail({ athleteId: otherId, today });
    expect(detail.athlete.isMe).toBe(false);
    expect(detail.strava.runs).toEqual([]);
    expect(detail.totals.runs).toBe(0);
  });
});
