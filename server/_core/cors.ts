import type { RequestHandler } from "express";
import { BlockList, isIP } from "node:net";

const LOOPBACK_IPS = new BlockList();
LOOPBACK_IPS.addSubnet("127.0.0.0", 8, "ipv4");
LOOPBACK_IPS.addAddress("::1", "ipv6");
LOOPBACK_IPS.addSubnet("::ffff:127.0.0.0", 104, "ipv6");

export function isLoopbackApiHost(hostname: string): boolean {
  const normalized = hostname
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.+$/, "");
  if (normalized === "localhost" || normalized.endsWith(".localhost")) {
    return true;
  }
  const family = isIP(normalized);
  if (family === 0) return false;
  return LOOPBACK_IPS.check(normalized, family === 4 ? "ipv4" : "ipv6");
}

function originHasLoopbackHostname(origin: string): boolean {
  try {
    return isLoopbackApiHost(new URL(origin).hostname);
  } catch {
    return false;
  }
}

/** Exact web origins from ALLOWED_ORIGINS (comma separated), e.g. https://user.github.io. */
export function configuredOrigins(value = process.env.ALLOWED_ORIGINS): Set<string> {
  const origins = new Set<string>();
  for (const item of (value ?? "").split(",")) {
    const candidate = item.trim();
    if (!candidate) continue;
    try {
      const url = new URL(candidate);
      if ((url.protocol === "https:" || url.protocol === "http:") && url.origin === candidate) origins.add(candidate);
    } catch {
      // Ignore malformed entries instead of widening access.
    }
  }
  return origins;
}

/**
 * Web clients must come from a configured origin. A localhost origin is honoured only when the
 * API itself is being reached on localhost, so a deployed API never trusts a developer machine.
 */
export function createCorsMiddleware(
  allowedOrigins = configuredOrigins(),
  localApiRequest = (hostname: string) => isLoopbackApiHost(hostname),
): RequestHandler {
  return (req, res, next) => {
    const origin = req.headers.origin;
    res.vary("Origin");

    // Native apps and server-to-server redirects do not carry Origin; they authenticate with a Bearer token.
    if (!origin) {
      next();
      return;
    }
    const allowed = allowedOrigins.has(origin) &&
      (!originHasLoopbackHostname(origin) || localApiRequest(req.hostname));
    if (!allowed) {
      res.status(403).json({ error: "origin_not_allowed" });
      return;
    }

    res.header("Access-Control-Allow-Origin", origin);
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header(
      "Access-Control-Allow-Headers",
      "Content-Type, Accept, Authorization, X-Requested-With, X-RunClub-Platform",
    );
    res.header("Access-Control-Max-Age", "600");
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  };
}
