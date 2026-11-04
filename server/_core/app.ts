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
    }),
  );

  return app;
}
