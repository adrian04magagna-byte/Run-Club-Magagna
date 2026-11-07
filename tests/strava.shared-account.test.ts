import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

process.env.DATABASE_URL = "pglite:memory";
process.env.STRAVA_CLIENT_ID = "1234";
process.env.STRAVA_CLIENT_SECRET = "test-secret";
process.env.STRAVA_TOKEN_ENCRYPTION_KEY = "a".repeat(64);
process.env.EXPO_PUBLIC_API_BASE_URL = "https://api.example.com";

const { eq, inArray } = await import("drizzle-orm");
const { stravaActivityRecords, stravaConnections, stravaOAuthStates, users } = await import("../drizzle/schema");
const { getDb } = await import("../server/db");
const oauth = await import("../server/_core/stravaOAuth");

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const inHours = (hours: number) => Math.floor(Date.now() / 1000) + hours * 3600;

describe("one Strava login on the coach and student profiles", () => {
  let coachId = 0;
  let studentId = 0;

  async function connect(userId: number, tokens: { access: string; refresh: string }, expiresAt = inHours(6)) {
    const state = String(userId).padStart(64, "a");
    const db = (await getDb())!;
    await db.insert(stravaOAuthStates).values({
      stateHash: oauth.hashStravaOAuthState(state), userId, platform: "web", returnUri: "https://app.example.com/strava",
      consentedAt: new Date(), consentVersion: "test", expiresAt: new Date(Date.now() + 60_000),
    });
    vi.stubGlobal("fetch", vi.fn(async () => json({
      access_token: tokens.access, refresh_token: tokens.refresh, expires_at: expiresAt, scope: "activity:read", athlete: { id: 134815 },
    })));
    await oauth.completeStravaAuthorization(userId, "code", state);
  }

  beforeEach(async () => {
    const db = (await getDb())!;
    await db.delete(users).where(inArray(users.openId, ["shared-coach", "shared-student"]));
    [{ id: coachId }] = await db.insert(users).values({ openId: "shared-coach" }).returning({ id: users.id });
    [{ id: studentId }] = await db.insert(users).values({ openId: "shared-student" }).returning({ id: users.id });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("connects both profiles and gives the older one the newest grant", async () => {
    await connect(studentId, { access: "old", refresh: "old-refresh" });
    await connect(coachId, { access: "new", refresh: "new-refresh" });
    const db = (await getDb())!;
    const rows = await db.select().from(stravaConnections).where(inArray(stravaConnections.userId, [coachId, studentId]));
    expect(rows).toHaveLength(2);
    expect(oauth.decryptStravaTokens(rows[0].encryptedTokenEnvelope)).toEqual(oauth.decryptStravaTokens(rows[1].encryptedTokenEnvelope));
    expect(oauth.decryptStravaTokens(rows[0].encryptedTokenEnvelope).refreshToken).toBe("new-refresh");
  });

  it("keeps both profiles working after a token refresh", async () => {
    await connect(studentId, { access: "a1", refresh: "r1" }, inHours(-1));
    await connect(coachId, { access: "a1", refresh: "r1" }, inHours(-1));
    const fetchMock = vi.fn(async (url: string | URL) => String(url).includes("/oauth/token")
      ? json({ access_token: "a2", refresh_token: "r2", expires_at: inHours(6) })
      : json([]));
    vi.stubGlobal("fetch", fetchMock);
    await oauth.listStravaActivities(coachId, 1);
    await oauth.listStravaActivities(studentId, 1);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/oauth/token"))).toHaveLength(1);
  });

  it("clears both profiles on disconnect, because Strava revokes the login", async () => {
    await connect(studentId, { access: "a", refresh: "r" });
    await connect(coachId, { access: "a", refresh: "r" });
    const db = (await getDb())!;
    await db.insert(stravaActivityRecords).values({ userId: studentId, stravaActivityId: "1", startDate: new Date(), summary: {} as never });
    vi.stubGlobal("fetch", vi.fn(async () => json({})));
    await oauth.disconnectStrava(coachId);
    await expect(db.select().from(stravaConnections).where(inArray(stravaConnections.userId, [coachId, studentId]))).resolves.toHaveLength(0);
    await expect(db.select().from(stravaActivityRecords).where(eq(stravaActivityRecords.userId, studentId))).resolves.toHaveLength(0);
  });
});
