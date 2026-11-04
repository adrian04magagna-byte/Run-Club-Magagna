// Bundles the API into a single file for a plain Node server (e.g. the VM, run by pm2).
// Everything is bundled, so the server needs only Node and a .env file next to it.
import { build } from "esbuild";

await build({
  entryPoints: ["server/_core/index.ts"],
  outfile: "dist-server/index.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  // PGlite is only used for local development and tests.
  external: ["@electric-sql/pglite", "drizzle-orm/pglite", "drizzle-orm/pglite/migrator"],
  // Some CommonJS dependencies (express) still call require() for Node built-ins.
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  logLevel: "info",
});
