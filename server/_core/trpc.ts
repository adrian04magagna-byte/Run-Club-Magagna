import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from "../../shared/const.js";
import { initTRPC, TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import superjson from "superjson";
import { athleteAccounts } from "../../drizzle/schema";
import type { TrpcContext } from "./context";
import { getDb } from "../db";
import { isCoachEmail } from "./env";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
  // Unexpected failures can carry SQL or driver details; send clients a generic message instead.
  errorFormatter({ shape, error }) {
    if (error.code !== "INTERNAL_SERVER_ERROR" || error.cause instanceof TRPCError) return shape;
    return {
      ...shape,
      message: "Algo deu errado do nosso lado. Tente novamente em instantes.",
      data: { ...shape.data, stack: undefined },
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

export const athleteProcedure = t.procedure.use(requireUser).use(
  t.middleware(async ({ ctx, next }) => {
    if (!ctx.user || ctx.user.role === "admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Esta ação está disponível somente para alunos aprovados." });
    }
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Banco de dados indisponível." });
    const accounts = await db.select({ status: athleteAccounts.status })
      .from(athleteAccounts)
      .where(eq(athleteAccounts.userId, ctx.user.id))
      .limit(1);
    if (accounts[0]?.status !== "approved") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Apenas alunos aprovados podem consultar ou registrar treinos." });
    }
    return next({ ctx: { ...ctx, user: ctx.user } });
  }),
);

export const adminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;

    const configuredCoach = Boolean(ctx.user && isCoachEmail(ctx.user.email));
    if (!ctx.user || ctx.user.role !== "admin" || !configuredCoach) {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);
