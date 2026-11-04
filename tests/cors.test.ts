import { afterEach, describe, expect, it } from "vitest";
import express from "express";
import type { Server } from "node:http";
import { configuredOrigins, createCorsMiddleware, isLoopbackApiHost } from "../server/_core/cors";

let server: Server | null = null;

afterEach(async () => {
  if (!server) return;
  await new Promise<void>((resolve, reject) => server?.close((error) => (error ? reject(error) : resolve())));
  server = null;
});

async function testServer(allowed: string, localApi: boolean) {
  const app = express();
  app.use(createCorsMiddleware(configuredOrigins(allowed), () => localApi));
  app.get("/api/ping", (_req, res) => res.json({ ok: true }));
  server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no port");
  return `http://127.0.0.1:${address.port}`;
}

describe("API CORS", () => {
  it("parses only exact origins", () => {
    const origins = configuredOrigins(" https://a.github.io ,https://b.dev/path, nonsense ,http://localhost:8081");
    expect([...origins]).toEqual(["https://a.github.io", "http://localhost:8081"]);
  });

  it("allows a configured origin and answers preflight", async () => {
    const base = await testServer("https://a.github.io", false);
    const preflight = await fetch(`${base}/api/ping`, { method: "OPTIONS", headers: { Origin: "https://a.github.io" } });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe("https://a.github.io");
    expect(preflight.headers.get("access-control-allow-headers")).toContain("Authorization");
  });

  it("rejects unknown origins", async () => {
    const base = await testServer("https://a.github.io", false);
    const response = await fetch(`${base}/api/ping`, { headers: { Origin: "https://evil.example" } });
    expect(response.status).toBe(403);
  });

  it("trusts a localhost origin only when the API itself is local", async () => {
    const remote = await testServer("http://localhost:8081", false);
    expect((await fetch(`${remote}/api/ping`, { headers: { Origin: "http://localhost:8081" } })).status).toBe(403);
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    server = null;
    const local = await testServer("http://localhost:8081", true);
    expect((await fetch(`${local}/api/ping`, { headers: { Origin: "http://localhost:8081" } })).status).toBe(200);
  });

  it("lets native requests without Origin through", async () => {
    const base = await testServer("", false);
    expect((await fetch(`${base}/api/ping`)).status).toBe(200);
  });

  it("recognises loopback hosts", () => {
    for (const host of ["localhost", "app.localhost", "127.0.0.1", "[::1]"]) expect(isLoopbackApiHost(host)).toBe(true);
    for (const host of ["example.com", "10.0.0.1", "localhost.example.com"]) expect(isLoopbackApiHost(host)).toBe(false);
  });
});
