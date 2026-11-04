import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { accountRouter } from "./routers/account";
import { clubRouter } from "./routers/club";
import { stravaRouter } from "./routers/strava";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    // Sessions are bearer tokens kept by the app; logging out only needs the app to forget it.
    logout: publicProcedure.mutation(() => ({ success: true }) as const),
  }),
  account: accountRouter,
  club: clubRouter,
  strava: stravaRouter,
});

export type AppRouter = typeof appRouter;
