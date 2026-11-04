import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../drizzle/schema";
import { users } from "../drizzle/schema";

export type Database = ReturnType<typeof drizzle<typeof schema>>;

let _db: Database | null = null;
let _connecting: Promise<Database | null> | null = null;

/**
 * DATABASE_URL accepts a regular Postgres URL (Supabase pooler in production) or
 * `pglite:<dir>` / `pglite:memory` for an embedded database during local development and tests.
 */
async function connect(url: string): Promise<Database | null> {
  try {
    if (url.startsWith("pglite:")) {
      const { PGlite } = await import("@electric-sql/pglite");
      const { drizzle: drizzlePglite } = await import("drizzle-orm/pglite");
      const { migrate } = await import("drizzle-orm/pglite/migrator");
      const target = url.slice("pglite:".length);
      const client = new PGlite(target === "memory" ? undefined : target);
      const db = drizzlePglite(client, { schema });
      await migrate(db, { migrationsFolder: "./drizzle" });
      // Both drivers expose the same query builder surface used by the routers.
      return db as unknown as Database;
    }
    // prepare: false keeps the client compatible with Supabase's transaction pooler (serverless).
    const client = postgres(url, { prepare: false, max: 5 });
    return drizzle(client, { schema });
  } catch {
    console.warn("[Database] Failed to connect");
    return null;
  }
}

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb(): Promise<Database | null> {
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  _connecting ??= connect(url).then((db) => {
    _db = db;
    _connecting = null;
    return db;
  });
  return _connecting;
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

/** Postgres unique_violation, raised by both postgres-js and PGlite. */
export function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; current && depth < 4; depth += 1) {
    if (typeof current === "object" && (current as { code?: unknown }).code === "23505") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}
