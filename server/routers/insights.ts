import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { activities } from "../../drizzle/schema";
import {
  INSIGHT_PERIODS,
  PERIOD_DAYS,
  addDays,
  currentStreak,
  dailyBuckets,
  inRange,
  periodSeries,
  totals,
  type TrainingEntry,
} from "../../shared/insights";
import type { StravaActivitySummary } from "../../shared/strava";
import { getStravaConnectionStatus, listStravaActivitiesSince } from "../_core/stravaOAuth";
import { memberProcedure, router } from "../_core/trpc";
import { getDb } from "../db";

const RUN_SPORTS = new Set(["Run", "TrailRun", "VirtualRun"]);
const STRAVA_CACHE_MS = 5 * 60 * 1000;
const ALL_TIME_MAX_PAGES = 10;
const RECENT_LIMIT = 20;
const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// Strava allows few reads per 15 minutes for the whole app, so a dashboard refresh reuses recent pulls.
const stravaCache = new Map<string, { at: number; items: StravaActivitySummary[]; truncated: boolean }>();

async function cachedStravaActivities(userId: number, afterEpochSeconds: number, maxPages: number) {
  const key = `${userId}:${afterEpochSeconds}`;
  const hit = stravaCache.get(key);
  if (hit && Date.now() - hit.at < STRAVA_CACHE_MS) return hit;
  const fresh = { at: Date.now(), ...(await listStravaActivitiesSince(userId, afterEpochSeconds, maxPages)) };
  stravaCache.set(key, fresh);
  return fresh;
}

/** Shifts a UTC instant into the runner's calendar day using the offset the app reports. */
function localDay(value: Date, tzOffsetMinutes: number) {
  return new Date(value.getTime() - tzOffsetMinutes * 60_000).toISOString().slice(0, 10);
}

export const insightsRouter = router({
  overview: memberProcedure
    .input(z.object({
      period: z.enum(INSIGHT_PERIODS),
      today: localDateSchema,
      tzOffsetMinutes: z.number().int().min(-14 * 60).max(14 * 60),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Banco de dados indisponível." });
      const { period, today, tzOffsetMinutes } = input;
      const days = period === "all" ? null : PERIOD_DAYS[period];
      const periodFrom = days ? addDays(today, -(days - 1)) : "0000-01-01";
      // Pull twice the window so the previous period can be compared; seven days are always needed.
      const fetchFrom = days ? addDays(today, -(2 * days - 1) - 1) : null;

      const clubRows = await db.select().from(activities).where(eq(activities.athleteId, ctx.user.id)).orderBy(desc(activities.completedAt));
      const importedStravaIds = new Set(clubRows.filter((row) => row.source === "strava" && row.externalActivityId).map((row) => row.externalActivityId));
      const entries: TrainingEntry[] = clubRows.map((row) => ({
        id: `club-${row.id}`,
        source: "club",
        title: row.title,
        date: localDay(row.completedAt, tzOffsetMinutes),
        startLocal: null,
        distanceMeters: row.distanceMeters,
        movingSeconds: row.durationSeconds,
        elevationMeters: 0,
        averageHeartRate: null,
      }));

      const strava = await getStravaConnectionStatus(ctx.user.id);
      let stravaError: string | null = null;
      let truncated = false;
      if (strava.connected) {
        try {
          const after = fetchFrom ? Date.parse(`${fetchFrom}T00:00:00.000Z`) / 1000 : 0;
          const result = await cachedStravaActivities(ctx.user.id, after, days ? 3 : ALL_TIME_MAX_PAGES);
          truncated = result.truncated;
          for (const item of result.items) {
            if (!RUN_SPORTS.has(item.sportType) && !RUN_SPORTS.has(item.type)) continue;
            if (importedStravaIds.has(item.id)) continue;
            const date = (item.startDateLocal || item.startDate).slice(0, 10);
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
            entries.push({
              id: `strava-${item.id}`,
              source: "strava",
              title: item.name,
              date,
              startLocal: item.startDateLocal || null,
              distanceMeters: Math.round(item.distanceMeters),
              movingSeconds: Math.round(item.movingTimeSeconds),
              elevationMeters: Math.round(item.elevationGainMeters),
              averageHeartRate: item.averageHeartRate,
            });
          }
        } catch (error) {
          stravaError = error instanceof TRPCError ? error.message : "Não foi possível consultar o Strava agora.";
        }
      }

      const last7From = addDays(today, -6);
      const last7 = inRange(entries, last7From, today);
      const previous7 = inRange(entries, addDays(today, -13), addDays(today, -7));
      const periodEntries = inRange(entries, periodFrom, today);
      const previousPeriod = days ? inRange(entries, addDays(periodFrom, -days), addDays(periodFrom, -1)) : null;

      return {
        stravaConnected: strava.connected,
        stravaError,
        truncated,
        period: {
          key: period,
          from: days ? periodFrom : entries.reduce<string | null>((min, entry) => (min === null || entry.date < min ? entry.date : min), null),
          to: today,
          ...totals(periodEntries),
          previousDistanceMeters: previousPeriod ? totals(previousPeriod).distanceMeters : null,
        },
        series: periodSeries(periodEntries, period, today),
        last7: {
          from: last7From,
          to: today,
          days: dailyBuckets(last7, today, 7),
          ...totals(last7),
          previousDistanceMeters: totals(previous7).distanceMeters,
          streakDays: currentStreak(entries, today),
        },
        recent: [...last7]
          .sort((a, b) => (b.startLocal ?? b.date).localeCompare(a.startLocal ?? a.date))
          .slice(0, RECENT_LIMIT),
      };
    }),
});
