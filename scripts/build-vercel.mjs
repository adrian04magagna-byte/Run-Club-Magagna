// Bundles the API into one ESM function using Vercel's Build Output API (v3).
// Bundling sidesteps CommonJS/ESM mismatches (e.g. `jose` is ESM-only) in the Vercel runtime.
import { build } from "esbuild";
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";

const out = ".vercel/output";
const fn = `${out}/functions/api.func`;
rmSync(out, { recursive: true, force: true });
mkdirSync(fn, { recursive: true });

await build({
  entryPoints: ["server/_core/vercel.ts"],
  outfile: `${fn}/index.mjs`,
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

writeFileSync(`${fn}/.vc-config.json`, JSON.stringify({
  runtime: "nodejs22.x",
  handler: "index.mjs",
  launcherType: "Nodejs",
  shouldAddHelpers: false,
  maxDuration: 15,
}, null, 2));

mkdirSync(`${out}/static`, { recursive: true });
cpSync("vercel-public", `${out}/static`, { recursive: true });

writeFileSync(`${out}/config.json`, JSON.stringify({
  version: 3,
  routes: [
    { src: "^/api(?:/.*)?$", dest: "/api" },
    { handle: "filesystem" },
  ],
}, null, 2));
