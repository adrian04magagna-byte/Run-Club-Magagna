import { beforeAll, describe, expect, it } from "vitest";
import type { Request, Response } from "express";

// End-to-end flow against an embedded Postgres (PGlite) running the real migrations.
process.env.DATABASE_URL = "pglite:memory";
process.env.SESSION_SECRET = "test-session-secret-with-at-least-32-chars";
process.env.COACH_EMAIL = "coach@example.com, Second.Coach@example.com";
process.env.COACH_SIGNUP_CODE = "coach-code";
process.env.EXPO_PUBLIC_API_BASE_URL = "https://api.example.com";

const { appRouter } = await import("../server/routers");
const { createContext } = await import("../server/_core/context");

async function callerFor(token?: string) {
  const req = { headers: token ? { authorization: `Bearer ${token}` } : {} } as Request;
  const ctx = await createContext({ req, res: { setHeader() {} } as unknown as Response, info: {} as never });
  return appRouter.createCaller(ctx);
}

const tinyJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...new Array(20).fill(0), 0xff, 0xd9]).toString("base64");

describe("coach and athlete flow", () => {
  let coachToken = "";
  let athleteToken = "";
  let secondCoachToken = "";
  let athleteId = 0;

  beforeAll(async () => {
    const anonymous = await callerFor();
    await expect(anonymous.account.register({ name: "Ana", email: "Ana@Example.com", password: "senha-forte-123" }))
      .resolves.toEqual({ status: "pending" });
  });

  it("keeps a new athlete pending and rejects duplicates", async () => {
    const anonymous = await callerFor();
    await expect(anonymous.account.signIn({ email: "ana@example.com", password: "senha-forte-123" }))
      .resolves.toEqual({ status: "pending" });
    await expect(anonymous.account.register({ name: "Ana 2", email: "ana@example.com", password: "senha-forte-123" }))
      .rejects.toThrow(/Já existe/);
    await expect(anonymous.account.signIn({ email: "ana@example.com", password: "errada-errada" }))
      .rejects.toThrow(/incorretos/);
  });

  it("protects the coach email with the signup code", async () => {
    const anonymous = await callerFor();
    await expect(anonymous.account.register({ name: "Coach", email: "coach@example.com", password: "senha-do-coach-1" }))
      .rejects.toThrow(/reservado/);
    const result = await anonymous.account.register({
      name: "Coach", email: "coach@example.com", password: "senha-do-coach-1", coachCode: "coach-code",
    });
    expect(result.status).toBe("authenticated");
    if (result.status !== "authenticated") return;
    expect(result.user.role).toBe("admin");
    coachToken = result.sessionToken;
    const coach = await callerFor(coachToken);
    await expect(coach.account.status()).resolves.toEqual({ status: "coach" });
  });

  it("accepts every configured coach email", async () => {
    const result = await (await callerFor()).account.register({
      name: "Coach 2", email: "second.coach@example.com", password: "senha-do-coach-2", coachCode: "coach-code",
    });
    expect(result.status).toBe("authenticated");
    if (result.status !== "authenticated") return;
    expect(result.user.role).toBe("admin");
    secondCoachToken = result.sessionToken;
  });

  it("lets the coach approve, plan, and review", async () => {
    const coach = await callerFor(coachToken);
    const pending = await coach.club.pendingAthletes();
    expect(pending.map((athlete) => athlete.email)).toEqual(["ana@example.com"]);
    athleteId = pending[0].userId;
    await coach.club.approveAthlete({ athleteId });

    const signIn = await (await callerFor()).account.signIn({ email: "ana@example.com", password: "senha-forte-123" });
    expect(signIn.status).toBe("authenticated");
    if (signIn.status !== "authenticated") return;
    athleteToken = signIn.sessionToken;

    const { assignmentId } = await coach.club.createAndAssignWorkout({
      athleteId,
      scheduledDate: "2026-11-10",
      title: "Rodagem leve",
      objective: "Base aeróbica",
      level: "Todos",
      steps: [{ kind: "run", label: "Corrida contínua", durationSeconds: 1800 }],
    });

    const athlete = await callerFor(athleteToken);
    const assignments = await athlete.club.myAssignments();
    expect(assignments).toHaveLength(1);
    expect(assignments[0].steps[0].label).toBe("Corrida contínua");

    const { activityId } = await athlete.club.submitActivity({
      assignmentId, title: "Rodagem leve", distanceMeters: 5000, durationSeconds: 1800, perceivedEffort: "easy",
    });
    await expect(athlete.club.submitActivity({
      assignmentId, title: "De novo", distanceMeters: 5000, durationSeconds: 1800, perceivedEffort: "easy",
    })).rejects.toThrow(/já concluído|já foi registrado/);

    const feed = await coach.club.coachActivityFeed();
    expect(feed).toHaveLength(1);
    await coach.club.reviewActivity({ activityId: activityId!, rating: 5, comment: "Ótimo ritmo!" });
    await coach.club.reviewActivity({ activityId: activityId!, rating: 4, comment: "Revisado" });

    const activities = await athlete.club.myActivities();
    expect(activities[0].averagePaceSecondsPerKm).toBe(360);
    expect(activities[0].review?.rating).toBe(4);
  });

  it("shows every athlete to every coach and tracks who follows them", async () => {
    const today = "2026-11-12";
    const coach = await callerFor(coachToken);
    const second = await callerFor(secondCoachToken);

    const [seen] = await second.club.clubAthletes({ today });
    expect(seen).toMatchObject({ userId: athleteId, followedByMe: false });
    expect(seen.coaches.map((item) => item.name)).toEqual(["Coach"]);
    expect(seen.summary).toMatchObject({ weekPlanned: 1, weekDone: 1, weekDistanceMeters: 0, toReview: 0 });

    await expect(second.club.athleteDetail({ athleteId, today })).resolves.toMatchObject({
      athlete: { followedByMe: false },
      totals: { runs: 1, distanceMeters: 5000 },
    });
    await expect(second.club.createAndAssignWorkout({
      athleteId, scheduledDate: "2026-11-13", title: "Fora da lista", objective: "Teste", level: "Todos",
      steps: [{ kind: "run", label: "Corrida", durationSeconds: 600 }],
    })).rejects.toThrow(/lista aprovada/);

    await second.club.followAthlete({ athleteId });
    await second.club.followAthlete({ athleteId });
    const following = await second.club.clubAthletes({ today });
    expect(following[0].followedByMe).toBe(true);
    expect(following[0].coaches.map((item) => [item.name, item.isMe])).toEqual([["Coach 2", true], ["Coach", false]]);

    await second.club.unfollowAthlete({ athleteId });
    const after = await coach.club.clubAthletes({ today });
    expect(after[0].coaches.map((item) => item.name)).toEqual(["Coach"]);
    expect(after.some((item) => item.email?.includes("coach"))).toBe(false);
  });

  it("keeps athletes out of coach routes", async () => {
    const athlete = await callerFor(athleteToken);
    await expect(athlete.club.pendingAthletes()).rejects.toThrow();
    await expect(athlete.club.clubAthletes({ today: "2026-11-12" })).rejects.toThrow();
    await expect(athlete.club.followAthlete({ athleteId })).rejects.toThrow();
    const anonymous = await callerFor("not-a-token");
    await expect(anonymous.club.myAssignments()).rejects.toThrow();
  });

  it("stores profile photos and returns a signed URL", async () => {
    const athlete = await callerFor(athleteToken);
    const saved = await athlete.account.saveProfile({ displayName: "Ana Corredora", avatarBase64: tinyJpeg });
    expect(saved.name).toBe("Ana Corredora");
    expect(saved.avatarUrl).toMatch(/^https:\/\/api\.example\.com\/api\/avatars\/profile-avatars\/\d+\/.+\.jpg\?expires=\d+&sig=[a-f0-9]{64}$/);
  });
});
