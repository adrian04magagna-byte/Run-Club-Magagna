import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { athleteAccounts, users } from "../../drizzle/schema";
import { hashPassword, verifyPassword } from "../security/passwords";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { createSessionToken, touchLastSignedIn } from "../_core/session";
import { getDb, getUserByOpenId, isUniqueViolation } from "../db";
import { ENV, isCoachEmail } from "../_core/env";
import { getProfileAvatarUrl, uploadProfileAvatar } from "../storage/profile-avatars";

const emailSchema = z.string().trim().email().max(320).transform((email) => email.toLowerCase());

export async function accountUser(user: { id: number; openId: string; name: string | null; profileName?: string | null; avatarKey?: string | null; email: string | null; loginMethod: string | null; lastSignedIn: Date; role: "user" | "admin" }) {
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
      coachCode: z.string().trim().max(128).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "O serviço de cadastro está temporariamente indisponível." });
      const isCoach = isCoachEmail(input.email);
      if (isCoach && (!ENV.coachSignupCode || input.coachCode !== ENV.coachSignupCode)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Esse e-mail é reservado para o treinador. Informe o código de acesso do treinador ou entre com o Google." });
      }

      const existing = await db.select({ id: athleteAccounts.id }).from(athleteAccounts)
        .where(eq(athleteAccounts.normalizedEmail, input.email)).limit(1);
      if (existing.length) throw new TRPCError({ code: "CONFLICT", message: "Já existe uma conta com esse e-mail. Entre com ela." });

      const passwordHash = await hashPassword(input.password);
      let openId = "";
      try {
        openId = await db.transaction(async (tx) => {
          // A coach who first signed in with Google already has a user row; attach the password to it.
          const existingUser = await tx.select({ id: users.id, openId: users.openId }).from(users)
            .where(eq(users.email, input.email)).limit(1);
          if (existingUser.length && !isCoach) {
            throw new TRPCError({ code: "CONFLICT", message: "Esse e-mail já está associado a uma conta. Entre com ela ou fale com o treinador." });
          }
          let userId = existingUser[0]?.id;
          let userOpenId = existingUser[0]?.openId;
          if (!userId) {
            const inserted = await tx.insert(users).values({
              openId: `email_${randomUUID()}`,
              name: input.name,
              email: input.email,
              loginMethod: "email_password",
              role: isCoach ? "admin" : "user",
            }).returning({ id: users.id, openId: users.openId });
            userId = inserted[0]?.id;
            userOpenId = inserted[0]?.openId;
          }
          if (!userId || !userOpenId) throw new Error("Não foi possível criar a conta.");
          await tx.insert(athleteAccounts).values({
            userId,
            normalizedEmail: input.email,
            passwordHash,
            status: isCoach ? "approved" : "pending",
          });
          return userOpenId;
        });
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (isUniqueViolation(error)) {
          throw new TRPCError({ code: "CONFLICT", message: "Já existe uma conta com esse e-mail." });
        }
        console.error("[Account] Registration failed");
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível concluir o cadastro agora." });
      }

      if (!isCoach) return { status: "pending" as const };
      const user = await getUserByOpenId(openId);
      if (!user) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível concluir o cadastro agora." });
      return {
        status: "authenticated" as const,
        user: await accountUser(user),
        sessionToken: await createSessionToken(openId),
      };
    }),

  signIn: publicProcedure
    .input(z.object({ email: emailSchema, password: z.string().min(1).max(128) }))
    .mutation(async ({ input }) => {
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
      // Use one message for unknown email, wrong password and Google-only accounts.
      if (!account || !account.passwordHash || !(await verifyPassword(input.password, account.passwordHash))) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "E-mail ou senha incorretos." });
      }
      if (account.role !== "admin") {
        if (account.status === "pending") return { status: "pending" as const };
        if (account.status === "rejected") return { status: "rejected" as const };
      }

      await touchLastSignedIn(account.id);
      return {
        status: "authenticated" as const,
        user: await accountUser({ ...account, lastSignedIn: new Date() }),
        sessionToken: await createSessionToken(account.openId),
      };
    }),
});
