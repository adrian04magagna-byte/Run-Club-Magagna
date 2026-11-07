import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers";
import { registerAvatarRoute } from "../storage/profile-avatars";
import { registerAuthRoutes } from "./authRoutes";
import { createContext } from "./context";
import { createCorsMiddleware } from "./cors";
import { registerStravaOAuthCallback } from "./stravaOAuth";

/** Builds the API. Used by the local server (index.ts) and by the Vercel function (api/index.ts). */
export function createApp() {
  const app = express();
  app.set("trust proxy", 1);

  registerStravaOAuthCallback(app);
  app.use(createCorsMiddleware());

  app.use(express.json({ limit: "512kb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  registerAvatarRoute(app);
  registerAuthRoutes(app);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, timestamp: Date.now() });
  });

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
      onError({ error, path }) {
        if (error.code !== "INTERNAL_SERVER_ERROR") return;
        // Log the underlying cause (driver error code/message) server-side only; never the query params.
        const cause = error.cause as { code?: unknown; message?: unknown; cause?: { code?: unknown; message?: unknown } } | undefined;
        const root = cause?.cause ?? cause;
        console.error(`[tRPC] ${path ?? "?"} failed:`, root?.code ?? "", String(root?.message ?? error.message).split("\nparams:")[0]);
      },
    }),
  );

  return app;
}
