import { describe, expect, it } from "vitest";
import { appRouter } from "../server/routers";
import type { TrpcContext } from "../server/_core/context";

describe("auth.logout", () => {
  it("reports success; the app discards its bearer token", async () => {
    const caller = appRouter.createCaller({ user: null, req: { headers: {} }, res: {} } as unknown as TrpcContext);
    await expect(caller.auth.logout()).resolves.toEqual({ success: true });
  });
});
