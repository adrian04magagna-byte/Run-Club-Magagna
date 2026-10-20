import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { athleteAccounts, users } from "../../drizzle/schema";
import { hashPassword, verifyPassword } from "../security/passwords";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { getSessionCookieName, getSessionCookieOptions } from "../_core/cookies";
import { sdk } from "../_core/sdk";
import { getDb } from "../db";
import { ENV } from "../_core/env";
import { getProfileAvatarUrl, uploadProfileAvatar } from "../storage/profile-avatars";

const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const emailSchema = z.string().trim().email().max(320).transform((email) => email.toLowerCase());

async function accountUser(user: { id: number; openId: string; name: string | null; profileName?: string | null; avatarKey?: string | null; email: string | null; loginMethod: string | null; lastSignedIn: Date; role: "user" | "admin" }) {
  return {
    id: user.id,
    openId: user.openId,
    name: user.profileName || user.name,
    avatarUrl: await getProfileAvatarUrl(user.id, user.avatarKey),
    email: user.email,
    loginMethod: user.loginMethod,
    lastSignedIn: user.lastSignedIn.toISOString(),
    role: user.role,
  };
}

export const accountRouter = router({
  profile: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Banco de dados indisponível." });
    const rows = await db.select({
      id: users.id,
      name: users.name,
      profileName: users.profileName,
      avatarKey: users.avatarKey,
      email: users.email,
      role: users.role,
    }).from(users).where(eq(users.id, ctx.user.id)).limit(1);
    const user = rows[0];
    if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "Perfil não encontrado." });
    return {
      name: user.profileName || user.name || user.email || "Sua conta",
      email: user.email,
      role: user.role,
      avatarUrl: await getProfileAvatarUrl(user.id, user.avatarKey),
    };
  }),

  saveProfile: protectedProcedure
    .input(z.object({
      displayName: z.string().trim().min(2).max(120),
      avatarBase64: z.string().min(16).max(400_000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Banco de dados indisponível." });
      const current = await db.select({ avatarKey: users.avatarKey }).from(users)
        .where(eq(users.id, ctx.user.id)).limit(1);
      if (!current.length) throw new TRPCError({ code: "NOT_FOUND", message: "Perfil não encontrado." });

      const avatarKey = input.avatarBase64
        ? await uploadProfileAvatar(ctx.user.id, input.avatarBase64)
        : current[0].avatarKey;
      await db.update(users).set({
        profileName: input.displayName,
        ...(input.avatarBase64 ? { avatarKey } : {}),
      }).where(eq(users.id, ctx.user.id));

      return {
        name: input.displayName,
        avatarUrl: await getProfileAvatarUrl(ctx.user.id, avatarKey),
      };
    }),

  status: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role === "admin") return { status: "coach" as const };
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Banco de dados indisponível." });
    const rows = await db.select({ status: athleteAccounts.status })
      .from(athleteAccounts)
      .where(eq(athleteAccounts.userId, ctx.user.id))
      .limit(1);
    return { status: rows[0]?.status ?? "none" as const };
  }),

  register: publicProcedure
    .input(z.object({
      name: z.string().trim().min(2).max(120),
      email: emailSchema,
      password: z.string().min(10).max(128),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "O serviço de cadastro está temporariamente indisponível." });
      if (ENV.coachEmail && input.email === ENV.coachEmail.trim().toLowerCase()) {
        throw new TRPCError({ code: "CONFLICT", message: "Esse e-mail é reservado para a conta do treinador. Use o botão de acesso Manus." });
      }

      const existing = await db.select({ id: athleteAccounts.id }).from(athleteAccounts)
        .where(eq(athleteAccounts.normalizedEmail, input.email)).limit(1);
      if (existing.length) throw new TRPCError({ code: "CONFLICT", message: "Já existe uma conta de aluno com esse e-mail." });
      const existingUser = await db.select({ id: users.id }).from(users)
        .where(eq(users.email, input.email)).limit(1);
      if (existingUser.length) throw new TRPCError({ code: "CONFLICT", message: "Esse e-mail já está associado a uma conta. Entre com ela ou fale com o treinador." });

      const passwordHash = await hashPassword(input.password);
      try {
        await db.transaction(async (tx) => {
          const inserted = await tx.insert(users).values({
            openId: `student_${randomUUID()}`,
            name: input.name,
            email: input.email,
            loginMethod: "email_password",
            role: "user",
          }).$returningId();
          const userId = inserted[0]?.id;
          if (!userId) throw new Error("Não foi possível criar a conta.");
          await tx.insert(athleteAccounts).values({
            userId,
            normalizedEmail: input.email,
            passwordHash,
            status: "pending",
          });
        });
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (String(error).includes("Duplicate entry")) {
          throw new TRPCError({ code: "CONFLICT", message: "Já existe uma conta com esse e-mail." });
        }
        console.error("[Account] Registration failed");
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível concluir o cadastro agora." });
      }

      return { status: "pending" as const };
    }),

  signIn: publicProcedure
    .input(z.object({ email: emailSchema, password: z.string().min(1).max(128) }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "O serviço de login está temporariamente indisponível." });

      const rows = await db.select({
        id: users.id,
        openId: users.openId,
        name: users.name,
        profileName: users.profileName,
        avatarKey: users.avatarKey,
        email: users.email,
        loginMethod: users.loginMethod,
        role: users.role,
        lastSignedIn: users.lastSignedIn,
        passwordHash: athleteAccounts.passwordHash,
        status: athleteAccounts.status,
      })
        .from(athleteAccounts)
        .innerJoin(users, eq(athleteAccounts.userId, users.id))
        .where(eq(athleteAccounts.normalizedEmail, input.email))
        .limit(1);

      const account = rows[0];
      // Use one message for unknown email, wrong password and non-approved accounts.
      if (!account || !(await verifyPassword(input.password, account.passwordHash))) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "E-mail ou senha incorretos." });
      }
      if (account.status === "pending") return { status: "pending" as const };
      if (account.status === "rejected") return { status: "rejected" as const };

      const sessionToken = await sdk.createSessionToken(account.openId, {
        name: account.name || "Aluno",
        expiresInMs: SESSION_LIFETIME_MS,
      });
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(getSessionCookieName(ctx.req), sessionToken, {
        ...cookieOptions,
        maxAge: SESSION_LIFETIME_MS,
      });
      await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, account.id));

      return {
        status: "authenticated" as const,
        user: await accountUser({ ...account, lastSignedIn: new Date() }),
        sessionToken: ctx.req.headers["x-runclub-platform"] === "native" ? sessionToken : null,
      };
    }),
});
