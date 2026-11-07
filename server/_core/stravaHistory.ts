import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, isNotNull, isNull, max, sql } from "drizzle-orm";

import { stravaActivityRecords, stravaConnections } from "../../drizzle/schema";
import type { RunPlace } from "../../shared/brazil-map";
import { getDb } from "../db";
import { placesOnRoute } from "./municipalities";
import { getStravaActivityStreams, listStravaRoutedActivities } from "./stravaOAuth";

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

async function storeRuns(userId: number, withPlaces: boolean) {
  const db = await requireDb();
  const { items, truncated } = await listStravaRoutedActivities(userId, 0, HISTORY_PAGES);
  const runs = items.filter((item) => RUN_TYPES.has(item.sportType) && !Number.isNaN(Date.parse(item.startDate)));
  if (runs.length) {
    await db
      .insert(stravaActivityRecords)
      .values(runs.map(({ routePolyline, ...summary }) => ({
        userId,
        stravaActivityId: summary.id,
        startDate: new Date(summary.startDate),
        summary,
        places: withPlaces && routePolyline ? placesOnRoute(routePolyline, summary.distanceMeters) : null,
      })))
      .onConflictDoUpdate({
        target: [stravaActivityRecords.userId, stravaActivityRecords.stravaActivityId],
        set: { summary: sql`excluded."summary"`, startDate: sql`excluded."startDate"`, places: sql`excluded."places"`, savedAt: new Date() },
      });
  }
  return { truncated };
}

export async function saveStravaHistory(userId: number, consentAccepted = false) {
  const db = await requireDb();
  const [connection] = await db
    .select({ consentAt: stravaConnections.historyConsentAt, mapConsentAt: stravaConnections.mapConsentAt })
    .from(stravaConnections)
    .where(eq(stravaConnections.userId, userId))
    .limit(1);
  if (!connection) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Conecte sua conta Strava primeiro." });
  if (!connection.consentAt) {
    if (!consentAccepted) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Autorize guardar suas corridas antes de continuar." });
    await db.update(stravaConnections).set({ historyConsentAt: new Date() }).where(eq(stravaConnections.userId, userId));
  }
  const { truncated } = await storeRuns(userId, Boolean(connection.mapConsentAt));

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
  await db.update(stravaConnections).set({ historyConsentAt: null, mapConsentAt: null, coachShareAt: null }).where(eq(stravaConnections.userId, userId));
  return { deleted: true as const };
}

export async function getRunMap(userId: number) {
  const db = await requireDb();
  const [connection] = await db
    .select({ consentAt: stravaConnections.mapConsentAt, coachShareAt: stravaConnections.coachShareAt })
    .from(stravaConnections)
    .where(eq(stravaConnections.userId, userId))
    .limit(1);
  const rows = await db
    .select({ places: stravaActivityRecords.places, startDate: stravaActivityRecords.startDate })
    .from(stravaActivityRecords)
    .where(and(eq(stravaActivityRecords.userId, userId), isNotNull(stravaActivityRecords.places)));
  const totals = new Map<string, RunPlace>();
  for (const { places, startDate } of rows) {
    const date = startDate.toISOString().slice(0, 10);
    for (const [code, meters] of Object.entries(places ?? {})) {
      const place = totals.get(code) ?? { code, meters: 0, runs: 0, lastDate: date };
      place.meters += meters;
      place.runs += 1;
      if (date > place.lastDate) place.lastDate = date;
      totals.set(code, place);
    }
  }
  return {
    connected: Boolean(connection),
    consented: Boolean(connection?.consentAt),
    sharedWithCoach: Boolean(connection?.coachShareAt),
    places: [...totals.values()],
  };
}

export async function updateCoachShare(userId: number, share: boolean) {
  const db = await requireDb();
  const updated = await db.update(stravaConnections).set({ coachShareAt: share ? new Date() : null })
    .where(eq(stravaConnections.userId, userId)).returning({ id: stravaConnections.id });
  if (!updated.length) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Conecte sua conta Strava primeiro." });
  return getRunMap(userId);
}

export async function updateRunMap(userId: number, consentAccepted: boolean) {
  const db = await requireDb();
  const [connection] = await db
    .select({ consentAt: stravaConnections.mapConsentAt })
    .from(stravaConnections)
    .where(eq(stravaConnections.userId, userId))
    .limit(1);
  if (!connection) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Conecte sua conta Strava primeiro." });
  if (!connection.consentAt) {
    if (!consentAccepted) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Autorize o mapa antes de continuar." });
    const now = new Date();
    await db.update(stravaConnections).set({ mapConsentAt: now, historyConsentAt: now }).where(eq(stravaConnections.userId, userId));
  }
  const { truncated } = await storeRuns(userId, true);
  return { ...(await getRunMap(userId)), truncated };
}
