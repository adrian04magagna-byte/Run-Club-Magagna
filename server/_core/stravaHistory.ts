import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, isNull, max, sql } from "drizzle-orm";

import { stravaActivityRecords, stravaConnections } from "../../drizzle/schema";
import { getDb } from "../db";
import { getStravaActivityStreams, listStravaActivitiesSince } from "./stravaOAuth";

const HISTORY_PAGES = 5;
// Each stream costs two Strava reads, so one save fills only a small batch.
const STREAMS_PER_SAVE = 10;
const RUN_TYPES = new Set(["Run", "TrailRun", "VirtualRun"]);

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Banco de dados indisponível." });
  return db;
}

export async function getStravaHistoryStatus(userId: number) {
  const db = await requireDb();
  const [row] = await db
    .select({
      saved: count(),
      withStreams: count(stravaActivityRecords.streams),
      lastSavedAt: max(stravaActivityRecords.savedAt),
    })
    .from(stravaActivityRecords)
    .where(eq(stravaActivityRecords.userId, userId));
  const [connection] = await db
    .select({ consentAt: stravaConnections.historyConsentAt })
    .from(stravaConnections)
    .where(eq(stravaConnections.userId, userId))
    .limit(1);
  return {
    consented: Boolean(connection?.consentAt),
    saved: row?.saved ?? 0,
    withStreams: row?.withStreams ?? 0,
    lastSavedAt: row?.lastSavedAt ?? null,
  };
}

export async function saveStravaHistory(userId: number, consentAccepted = false) {
  const db = await requireDb();
  const [connection] = await db
    .select({ consentAt: stravaConnections.historyConsentAt })
    .from(stravaConnections)
    .where(eq(stravaConnections.userId, userId))
    .limit(1);
  if (!connection) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Conecte sua conta Strava primeiro." });
  if (!connection.consentAt) {
    if (!consentAccepted) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Autorize guardar suas corridas antes de continuar." });
    await db.update(stravaConnections).set({ historyConsentAt: new Date() }).where(eq(stravaConnections.userId, userId));
  }
  const { items, truncated } = await listStravaActivitiesSince(userId, 0, HISTORY_PAGES);
  const runs = items.filter((item) => RUN_TYPES.has(item.sportType) && !Number.isNaN(Date.parse(item.startDate)));
  if (runs.length) {
    await db
      .insert(stravaActivityRecords)
      .values(runs.map((run) => ({ userId, stravaActivityId: run.id, startDate: new Date(run.startDate), summary: run })))
      .onConflictDoUpdate({
        target: [stravaActivityRecords.userId, stravaActivityRecords.stravaActivityId],
        set: { summary: sql`excluded."summary"`, startDate: sql`excluded."startDate"`, savedAt: new Date() },
      });
  }

  const pending = await db
    .select({ activityId: stravaActivityRecords.stravaActivityId })
    .from(stravaActivityRecords)
    .where(and(eq(stravaActivityRecords.userId, userId), isNull(stravaActivityRecords.streams)))
    .orderBy(desc(stravaActivityRecords.startDate))
    .limit(STREAMS_PER_SAVE);
  for (const { activityId } of pending) {
    let streams: Record<string, number[]>;
    try {
      streams = await getStravaActivityStreams(userId, activityId);
    } catch (error) {
      if (!(error instanceof TRPCError) || error.code !== "NOT_FOUND") break;
      streams = {};
    }
    await db
      .update(stravaActivityRecords)
      .set({ streams })
      .where(and(eq(stravaActivityRecords.userId, userId), eq(stravaActivityRecords.stravaActivityId, activityId)));
  }
  return { ...(await getStravaHistoryStatus(userId)), truncated };
}

export async function deleteStravaHistory(userId: number) {
  const db = await requireDb();
  await db.delete(stravaActivityRecords).where(eq(stravaActivityRecords.userId, userId));
  await db.update(stravaConnections).set({ historyConsentAt: null }).where(eq(stravaConnections.userId, userId));
  return { deleted: true as const };
}
