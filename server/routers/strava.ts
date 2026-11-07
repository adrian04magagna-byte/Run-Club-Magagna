import { z } from "zod";

import { STRAVA_REQUIRED_SCOPE } from "../../shared/strava";
import { deleteStravaHistory, getRunMap, getStravaHistoryStatus, saveStravaHistory, updateRunMap } from "../_core/stravaHistory";
import { memberProcedure, router } from "../_core/trpc";
import {
  beginStravaAuthorization,
  cancelStravaAuthorization,
  completeStravaAuthorization,
  disconnectStrava,
  getStravaActivityDetail,
  getStravaActivityStreams,
  getStravaConnectionStatus,
  listStravaActivities,
  type StravaOAuthPlatform,
} from "../_core/stravaOAuth";

function disableCaching(res: { setHeader: (name: string, value: string) => unknown }) {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
}

const stateSchema = z.string().regex(/^[a-f0-9]{64}$/);
const activityIdSchema = z.string().regex(/^\d{1,32}$/);

export const stravaRouter = router({
  status: memberProcedure.query(async ({ ctx }) => {
    disableCaching(ctx.res);
    const status = await getStravaConnectionStatus(ctx.user.id);
    return { ...status, requiredScope: STRAVA_REQUIRED_SCOPE };
  }),

  start: memberProcedure
    .input(z.object({
      platform: z.enum(["web", "native"]),
      returnUri: z.string().min(8).max(2048),
      consentAccepted: z.literal(true),
    }))
    .mutation(async ({ ctx, input }) => {
      disableCaching(ctx.res);
      return beginStravaAuthorization(
        ctx.user.id,
        input.platform as StravaOAuthPlatform,
        input.returnUri,
        typeof ctx.req.headers.origin === "string" ? ctx.req.headers.origin : undefined,
      );
    }),

  complete: memberProcedure
    .input(z.object({ code: z.string().trim().min(1).max(512), state: stateSchema }))
    .mutation(async ({ ctx, input }) => {
      disableCaching(ctx.res);
      return completeStravaAuthorization(ctx.user.id, input.code, input.state);
    }),

  cancel: memberProcedure
    .input(z.object({ state: stateSchema }))
    .mutation(async ({ ctx, input }) => {
      disableCaching(ctx.res);
      return cancelStravaAuthorization(ctx.user.id, input.state);
    }),

  activities: memberProcedure
    .input(z.object({ page: z.number().int().min(1).max(100).default(1) }))
    .query(async ({ ctx, input }) => {
      disableCaching(ctx.res);
      return listStravaActivities(ctx.user.id, input.page);
    }),

  activityDetail: memberProcedure
    .input(z.object({ activityId: activityIdSchema }))
    .query(async ({ ctx, input }) => {
      disableCaching(ctx.res);
      return getStravaActivityDetail(ctx.user.id, input.activityId);
    }),

  activityStreams: memberProcedure
    .input(z.object({ activityId: activityIdSchema }))
    .query(async ({ ctx, input }) => {
      disableCaching(ctx.res);
      return getStravaActivityStreams(ctx.user.id, input.activityId);
    }),

  historyStatus: memberProcedure.query(async ({ ctx }) => {
    disableCaching(ctx.res);
    return getStravaHistoryStatus(ctx.user.id);
  }),

  saveHistory: memberProcedure
    .input(z.object({ consentAccepted: z.boolean().default(false) }))
    .mutation(async ({ ctx, input }) => {
      disableCaching(ctx.res);
      return saveStravaHistory(ctx.user.id, input.consentAccepted);
    }),

  deleteHistory: memberProcedure.mutation(async ({ ctx }) => {
    disableCaching(ctx.res);
    return deleteStravaHistory(ctx.user.id);
  }),

  runMap: memberProcedure.query(async ({ ctx }) => {
    disableCaching(ctx.res);
    return getRunMap(ctx.user.id);
  }),

  updateRunMap: memberProcedure
    .input(z.object({ consentAccepted: z.boolean().default(false) }))
    .mutation(async ({ ctx, input }) => {
      disableCaching(ctx.res);
      return updateRunMap(ctx.user.id, input.consentAccepted);
    }),

  disconnect: memberProcedure.mutation(async ({ ctx }) => {
    disableCaching(ctx.res);
    return disconnectStrava(ctx.user.id);
  }),
});
