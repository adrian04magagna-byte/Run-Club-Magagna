/**
 * Fills the club with example athletes for trying the coach screens. They have no password, so
 * nobody can sign in with them. Run again to rebuild them; `--remove` deletes everything it made.
 *
 *   npx tsx scripts/seed-test-athletes.ts [--remove]
 */
import "./load-env.js";

import { asc, eq, like } from "drizzle-orm";

import { activities, activityReviews, athleteAccounts, coachAthletes, users, workoutAssignments, workoutSteps, workouts } from "../drizzle/schema";
import { getDb } from "../server/db";
import { addDays, startOfWeek } from "../shared/insights";

const OPEN_ID_PREFIX = "seed_";
const EMAIL_DOMAIN = "exemplo.runclub.test";
const WORKOUT_PREFIX = "[Teste] ";

type Run = { daysAgo: number; km: number; minutes: number; effort: "easy" | "challenging" | "intense"; note?: string; review?: { rating: number; comment: string } };
type Send = { weekday: number; status: "assigned" | "completed"; workout: number };
type Seed = { slug: string; name: string; status?: "pending"; coaches?: number[]; sends?: Send[]; runs?: Run[] };

const WORKOUTS = [
  { title: "Rodagem leve", objective: "Base aeróbica", steps: [["warmup", "Trote leve", 600], ["run", "Corrida leve", 1800], ["cooldown", "Trote solto", 300]] },
  { title: "Tiros curtos", objective: "Velocidade", steps: [["warmup", "Trote leve", 900], ["run", "6 tiros de 400 m", 1200], ["cooldown", "Trote solto", 600]] },
  { title: "Longão", objective: "Resistência", steps: [["warmup", "Trote leve", 600], ["run", "Corrida contínua", 3600], ["cooldown", "Caminhada", 300]] },
] as const;

const ATHLETES: Seed[] = [
  {
    slug: "marina", name: "Marina Costa", coaches: [0],
    sends: [{ weekday: 0, status: "completed", workout: 0 }, { weekday: 2, status: "completed", workout: 1 }, { weekday: 6, status: "assigned", workout: 2 }],
    runs: [
      { daysAgo: 1, km: 6.2, minutes: 34, effort: "challenging", note: "Os tiros foram puxados, mas terminei bem." },
      { daysAgo: 3, km: 5.1, minutes: 30, effort: "easy", review: { rating: 5, comment: "Ritmo controlado, ótimo." } },
      { daysAgo: 9, km: 8.4, minutes: 49, effort: "challenging", review: { rating: 4, comment: "Boa constância." } },
      { daysAgo: 16, km: 7, minutes: 41, effort: "easy" , review: { rating: 4, comment: "Continue assim." } },
      { daysAgo: 24, km: 6, minutes: 36, effort: "easy", review: { rating: 5, comment: "Muito bem." } },
    ],
  },
  {
    slug: "rafael", name: "Rafael Souza", coaches: [0, 1],
    sends: [{ weekday: -7, status: "assigned", workout: 0 }, { weekday: 0, status: "assigned", workout: 1 }, { weekday: 5, status: "assigned", workout: 2 }],
    runs: [{ daysAgo: 12, km: 4.3, minutes: 27, effort: "intense", note: "Senti dor na panturrilha no fim." }, { daysAgo: 20, km: 5, minutes: 30, effort: "challenging", review: { rating: 3, comment: "Vamos reduzir um pouco." } }],
  },
  {
    slug: "juliana", name: "Juliana Alves", coaches: [1],
    sends: [{ weekday: 1, status: "completed", workout: 0 }, { weekday: 4, status: "assigned", workout: 1 }],
    runs: [
      { daysAgo: 2, km: 10.1, minutes: 52, effort: "easy", review: { rating: 5, comment: "Excelente longão." } },
      { daysAgo: 6, km: 12, minutes: 63, effort: "challenging", review: { rating: 5, comment: "Forte até o fim." } },
      { daysAgo: 13, km: 15.2, minutes: 82, effort: "challenging", review: { rating: 4, comment: "Boa evolução." } },
      { daysAgo: 30, km: 11, minutes: 58, effort: "easy", review: { rating: 5, comment: "Perfeito." } },
    ],
  },
  { slug: "pedro", name: "Pedro Lima", runs: [{ daysAgo: 5, km: 3.2, minutes: 21, effort: "easy", note: "Primeira corrida do clube." }] },
  { slug: "camila", name: "Camila Rocha", coaches: [0], sends: [{ weekday: 3, status: "assigned", workout: 0 }, { weekday: 5, status: "assigned", workout: 0 }] },
  { slug: "lucas", name: "Lucas Ferreira", status: "pending" },
];

async function remove(db: NonNullable<Awaited<ReturnType<typeof getDb>>>) {
  await db.delete(workouts).where(like(workouts.title, `${WORKOUT_PREFIX}%`));
  const removed = await db.delete(users).where(like(users.openId, `${OPEN_ID_PREFIX}%`)).returning({ id: users.id });
  console.log(`Removidos ${removed.length} alunos de teste.`);
}

async function main() {
  const db = await getDb();
  if (!db) throw new Error("Sem banco: defina DATABASE_URL.");
  await remove(db);
  if (process.argv.includes("--remove")) return;

  const coaches = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin")).orderBy(asc(users.id));
  if (!coaches.length) throw new Error("Nenhum treinador no banco: entre como treinador uma vez antes.");
  const coachAt = (index: number) => coaches[index % coaches.length].id;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const monday = startOfWeek(today);

  const workoutIds = new Map<string, number>();
  const workoutFor = async (coachId: number, index: number) => {
    const key = `${coachId}:${index}`;
    const known = workoutIds.get(key);
    if (known) return known;
    const { title, objective, steps } = WORKOUTS[index];
    const [row] = await db.insert(workouts).values({ coachId, title: `${WORKOUT_PREFIX}${title}`, objective }).returning({ id: workouts.id });
    await db.insert(workoutSteps).values(steps.map(([kind, label, durationSeconds], position) => ({ workoutId: row.id, stepOrder: position + 1, kind, label, durationSeconds })));
    workoutIds.set(key, row.id);
    return row.id;
  };

  for (const seed of ATHLETES) {
    const email = `${seed.slug}@${EMAIL_DOMAIN}`;
    const [user] = await db.insert(users).values({ openId: `${OPEN_ID_PREFIX}${seed.slug}`, name: seed.name, email, loginMethod: "seed" }).returning({ id: users.id });
    await db.insert(athleteAccounts).values({ userId: user.id, normalizedEmail: email, status: seed.status ?? "approved" });
    const followers = [...new Set((seed.coaches ?? []).map(coachAt))];
    if (followers.length) await db.insert(coachAthletes).values(followers.map((coachId) => ({ coachId, athleteId: user.id })));

    const reviewer = followers[0] ?? coachAt(0);
    for (const send of seed.sends ?? []) {
      const scheduledDate = addDays(monday, send.weekday);
      await db.insert(workoutAssignments).values({
        coachId: reviewer,
        athleteId: user.id,
        workoutId: await workoutFor(reviewer, send.workout),
        scheduledDate,
        status: send.status,
        completedAt: send.status === "completed" ? new Date(`${scheduledDate}T12:00:00.000Z`) : null,
      });
    }
    for (const run of seed.runs ?? []) {
      const distanceMeters = Math.round(run.km * 1000);
      const durationSeconds = run.minutes * 60;
      const [activity] = await db.insert(activities).values({
        athleteId: user.id,
        source: "manual",
        title: run.km >= 10 ? "Longão" : "Corrida",
        distanceMeters,
        durationSeconds,
        averagePaceSecondsPerKm: Math.round((durationSeconds * 1000) / distanceMeters),
        completedAt: new Date(`${addDays(today, -run.daysAgo)}T12:00:00.000Z`),
        perceivedEffort: run.effort,
        athleteNote: run.note ?? null,
        shareWithCoach: true,
      }).returning({ id: activities.id });
      if (run.review) await db.insert(activityReviews).values({ activityId: activity.id, coachId: reviewer, ...run.review });
    }
  }
  console.log(`Criados ${ATHLETES.length} alunos de teste para ${coaches.length} treinador(es).`);
}

main().then(() => process.exit(0), (error) => { console.error(error); process.exit(1); });
