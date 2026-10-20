import {
  createCipheriv,
  createDecipheriv,
  createHash,
  hkdfSync,
  randomBytes,
} from "node:crypto";
import { and, eq, lt } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import type { Express, Request, Response as ExpressResponse } from "express";

import { stravaConnections, stravaOAuthStates } from "../../drizzle/schema";
import {
  RUN_CLUB_APP_SCHEME,
  STRAVA_CALLBACK_PATH as STRAVA_CLIENT_CALLBACK_PATH,
  STRAVA_CONSENT_VERSION,
  STRAVA_REQUIRED_SCOPE,
  downsampleSeries,
  type StravaActivityDetail,
  type StravaActivityStreams,
  type StravaActivitySummary,
  type StravaSplitMetric,
} from "../../shared/strava";
import { getDb } from "../db";
import { ENV } from "./env";
import { activityBelongsToAthleteHash, hmacStravaAthleteId } from "./stravaCrypto";

const STRAVA_API_BASE = "https://www.strava.com/api/v3";
const STRAVA_TOKEN_ENDPOINT = "https://www.strava.com/oauth/token";
const STRAVA_REVOKE_ENDPOINT = "https://www.strava.com/oauth/revoke";
const STRAVA_CALLBACK_PATH = "/api/strava/oauth/callback";
const ACCESS_TOKEN_REFRESH_WINDOW_MS = 60 * 60 * 1000;
const STATE_LIFETIME_MS = 10 * 60 * 1000;
const ACTIVITY_PAGE_SIZE = 20;
const STREAM_KEYS = ["heartrate", "cadence", "watts", "altitude", "velocity_smooth", "temp", "grade_smooth"] as const;

export type StravaOAuthPlatform = "web" | "native";
type OAuthPlatform = StravaOAuthPlatform;
type TokenPair = { accessToken: string; refreshToken: string };
type StravaTokenResponse = {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_at?: unknown;
  athlete?: { id?: unknown };
  scope?: unknown;
};
type Numeric = number | null;

function getEncryptionKey(secret: string): Buffer {
  if (Buffer.byteLength(secret, "utf8") < 32) throw new Error("A dedicated Strava token encryption key of at least 32 bytes is required.");
  return Buffer.from(
    hkdfSync("sha256", Buffer.from(secret, "utf8"), Buffer.from("run-club-magagna"), Buffer.from("strava-token-v1"), 32),
  );
}

export function encryptStravaTokens(tokens: TokenPair, secret = ENV.stravaTokenEncryptionKey): string {
  if (!tokens.accessToken || !tokens.refreshToken) throw new Error("Both Strava tokens are required.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(tokens), "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), authTag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptStravaTokens(envelope: string, secret = ENV.stravaTokenEncryptionKey): TokenPair {
  const [version, ivText, authTagText, ciphertextText, extra] = envelope.split(".");
  if (version !== "v1" || !ivText || !authTagText || !ciphertextText || extra !== undefined) {
    throw new Error("Invalid encrypted Strava token envelope.");
  }
  const iv = Buffer.from(ivText, "base64url");
  const authTag = Buffer.from(authTagText, "base64url");
  const ciphertext = Buffer.from(ciphertextText, "base64url");
  if (iv.length !== 12 || authTag.length !== 16 || ciphertext.length === 0) {
    throw new Error("Invalid encrypted Strava token envelope.");
  }
  const decipher = createDecipheriv("aes-256-gcm", getEncryptionKey(secret), iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  const parsed = JSON.parse(plaintext) as Partial<TokenPair>;
  if (typeof parsed.accessToken !== "string" || typeof parsed.refreshToken !== "string") {
    throw new Error("Invalid encrypted Strava token payload.");
  }
  return { accessToken: parsed.accessToken, refreshToken: parsed.refreshToken };
}

export function hashStravaOAuthState(state: string): string {
  return createHash("sha256").update(state, "utf8").digest("hex");
}

export function hashStravaAthleteId(athleteId: string, secret = ENV.stravaTokenEncryptionKey): string {
  return hmacStravaAthleteId(athleteId, secret);
}

export function stravaActivityBelongsToAthleteHash(activity: unknown, expectedHash: string, secret = ENV.stravaTokenEncryptionKey): boolean {
  return activityBelongsToAthleteHash(activity, expectedHash, secret);
}

function trpcError(code: ConstructorParameters<typeof TRPCError>[0]["code"], message: string): TRPCError {
  return new TRPCError({ code, message });
}

function isLoopback(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

/** The Strava portal sees one HTTPS server callback; the app return URI is separate and state-bound. */
export function getStravaOAuthCallbackUri(): string | null {
  if (!ENV.apiBaseUrl) return null;
  try {
    const base = new URL(ENV.apiBaseUrl);
    const secure = base.protocol === "https:" || (base.protocol === "http:" && isLoopback(base.hostname));
    if (!secure || base.username || base.password || base.search || base.hash || (base.pathname !== "" && base.pathname !== "/")) return null;
    return `${base.origin}${STRAVA_CALLBACK_PATH}`;
  } catch {
    return null;
  }
}

/** Only accept the fixed callback path on the initiating web origin or this app's native scheme. */
export function validateStravaReturnUri(input: string, platform: OAuthPlatform, requestOrigin?: string): string {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw trpcError("BAD_REQUEST", "Não foi possível validar o retorno seguro do Strava.");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw trpcError("BAD_REQUEST", "Não foi possível validar o retorno seguro do Strava.");
  }

  if (platform === "web") {
    if (!requestOrigin) throw trpcError("BAD_REQUEST", "Não foi possível validar o retorno seguro do Strava.");
    let origin: URL;
    try {
      origin = new URL(requestOrigin);
    } catch {
      throw trpcError("BAD_REQUEST", "Não foi possível validar o retorno seguro do Strava.");
    }
    const secureOrigin = origin.protocol === "https:" || (origin.protocol === "http:" && isLoopback(origin.hostname));
    if (!secureOrigin || url.origin !== origin.origin || url.pathname !== STRAVA_CLIENT_CALLBACK_PATH) {
      throw trpcError("BAD_REQUEST", "Não foi possível validar o retorno seguro do Strava.");
    }
    return url.toString();
  }

  const validNativePath =
    (url.hostname === "strava" && url.pathname === "/callback") ||
    (url.hostname === "" && url.pathname === STRAVA_CLIENT_CALLBACK_PATH);
  if (url.protocol !== `${RUN_CLUB_APP_SCHEME}:` || !validNativePath) {
    throw trpcError("BAD_REQUEST", "Não foi possível validar o retorno seguro do Strava.");
  }
  return url.toString();
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw trpcError("SERVICE_UNAVAILABLE", "Banco de dados indisponível.");
  return db;
}

function requireStravaCredentials(): { clientId: string; clientSecret: string } {
  if (!/^\d{1,16}$/.test(ENV.stravaClientId) || !ENV.stravaClientSecret) {
    throw trpcError("PRECONDITION_FAILED", "A integração Strava ainda não foi configurada pelo responsável do app.");
  }
  if (Buffer.byteLength(ENV.stravaTokenEncryptionKey, "utf8") < 32) {
    throw trpcError("PRECONDITION_FAILED", "A chave dedicada de criptografia Strava ainda não foi configurada.");
  }
  return { clientId: ENV.stravaClientId, clientSecret: ENV.stravaClientSecret };
}

export function isStravaConfigured(): boolean {
  return /^\d{1,16}$/.test(ENV.stravaClientId) && Boolean(ENV.stravaClientSecret) && Buffer.byteLength(ENV.stravaTokenEncryptionKey, "utf8") >= 32 && Boolean(getStravaOAuthCallbackUri());
}

export async function beginStravaAuthorization(
  userId: number,
  platform: OAuthPlatform,
  requestedReturnUri: string,
  requestOrigin?: string,
) {
  const { clientId } = requireStravaCredentials();
  const redirectUri = getStravaOAuthCallbackUri();
  if (!redirectUri) {
    throw trpcError("PRECONDITION_FAILED", "O endereço público do callback Strava ainda não está disponível.");
  }
  const returnUri = validateStravaReturnUri(requestedReturnUri, platform, requestOrigin);
  const db = await requireDb();
  const currentConnection = await db.select({ id: stravaConnections.id })
    .from(stravaConnections).where(eq(stravaConnections.userId, userId)).limit(1);
  if (currentConnection.length) {
    throw trpcError("CONFLICT", "Desconecte a conta Strava atual antes de vincular outra.");
  }

  const now = new Date();
  await db.delete(stravaOAuthStates).where(lt(stravaOAuthStates.expiresAt, now));
  const state = randomBytes(32).toString("hex");
  await db.insert(stravaOAuthStates).values({
    stateHash: hashStravaOAuthState(state),
    userId,
    platform,
    returnUri,
    consentedAt: now,
    consentVersion: STRAVA_CONSENT_VERSION,
    expiresAt: new Date(now.getTime() + STATE_LIFETIME_MS),
  });

  const authorizationUrl = new URL(
    platform === "native"
      ? "https://www.strava.com/oauth/mobile/authorize"
      : "https://www.strava.com/oauth/authorize",
  );
  authorizationUrl.searchParams.set("client_id", clientId);
  authorizationUrl.searchParams.set("redirect_uri", redirectUri);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("approval_prompt", "auto");
  authorizationUrl.searchParams.set("scope", STRAVA_REQUIRED_SCOPE);
  authorizationUrl.searchParams.set("state", state);
  return { authorizationUrl: authorizationUrl.toString() };
}

function queryString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function callbackFailure(res: ExpressResponse, status: number, message: string) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.status(status).type("text/plain; charset=utf-8").send(message);
}

/** Public HTTPS callback only validates the random state, then returns to its fixed initiating app URI. */
export function registerStravaOAuthCallback(app: Express) {
  app.get(STRAVA_CALLBACK_PATH, async (req: Request, res: ExpressResponse) => {
    const state = queryString(req.query.state);
    if (!state || !/^[a-f0-9]{64}$/.test(state)) {
      callbackFailure(res, 400, "Retorno de autorização inválido. Volte ao Run Club Magagna e tente novamente.");
      return;
    }
    try {
      const db = await requireDb();
      const rows = await db.select().from(stravaOAuthStates)
        .where(eq(stravaOAuthStates.stateHash, hashStravaOAuthState(state))).limit(1);
      const record = rows[0];
      if (!record || record.expiresAt.getTime() <= Date.now()) {
        if (record) await db.delete(stravaOAuthStates).where(eq(stravaOAuthStates.stateHash, record.stateHash));
        callbackFailure(res, 400, "A autorização Strava expirou. Volte ao app e inicie novamente.");
        return;
      }

      const target = new URL(record.returnUri);
      const providerError = queryString(req.query.error);
      const code = queryString(req.query.code);
      if (providerError) {
        target.searchParams.set("error", providerError === "access_denied" ? "access_denied" : "authorization_error");
      } else if (code && code.length <= 512) {
        target.searchParams.set("code", code);
      } else {
        target.searchParams.set("error", "invalid_response");
      }
      target.searchParams.set("state", state);
      res.setHeader("Cache-Control", "no-store, max-age=0");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Referrer-Policy", "no-referrer");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.redirect(303, target.toString());
    } catch {
      callbackFailure(res, 503, "Não foi possível processar o retorno do Strava. Tente novamente.");
    }
  });
}

async function consumeOAuthState(userId: number, state: string) {
  const db = await requireDb();
  const stateHash = hashStravaOAuthState(state);
  const rows = await db.select().from(stravaOAuthStates)
    .where(and(eq(stravaOAuthStates.stateHash, stateHash), eq(stravaOAuthStates.userId, userId)))
    .limit(1);
  const record = rows[0];
  if (!record || record.expiresAt.getTime() <= Date.now()) {
    await db.delete(stravaOAuthStates).where(eq(stravaOAuthStates.stateHash, stateHash));
    throw trpcError("PRECONDITION_FAILED", "A autorização Strava expirou ou não pertence a esta conta. Inicie a conexão novamente.");
  }
  const removed = await db.delete(stravaOAuthStates)
    .where(and(eq(stravaOAuthStates.stateHash, stateHash), eq(stravaOAuthStates.userId, userId)));
  if (!removed[0].affectedRows) {
    throw trpcError("PRECONDITION_FAILED", "Esta autorização Strava já foi utilizada.");
  }
  return record;
}

export function parseStravaJsonText(text: string): unknown {
  // Strava activity IDs may exceed JavaScript's safe integer range. Preserve those decimal IDs.
  const losslessIds = text.replace(/("id"\s*:\s*)(\d{16,})(?=\s*[,}])/g, (_match, prefix: string, digits: string) => `${prefix}"${digits}"`);
  return JSON.parse(losslessIds) as unknown;
}

async function parseProviderJson(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text) return null;
  try {
    return parseStravaJsonText(text);
  } catch {
    return null;
  }
}

async function exchangeAuthorizationCode(code: string): Promise<StravaTokenResponse> {
  const { clientId, clientSecret } = requireStravaCredentials();
  let response: Response;
  try {
    response = await fetch(STRAVA_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Cache-Control": "no-store" },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code, grant_type: "authorization_code" }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw trpcError("SERVICE_UNAVAILABLE", "O Strava não respondeu à conexão. Tente novamente.");
  }
  const payload = await parseProviderJson(response) as StravaTokenResponse | null;
  if (!response.ok || !payload) {
    throw trpcError(
      response.status >= 500 ? "SERVICE_UNAVAILABLE" : "BAD_REQUEST",
      response.status >= 500 ? "O Strava está temporariamente indisponível. Tente novamente." : "O Strava não concluiu a autorização. Inicie a conexão novamente.",
    );
  }
  return payload;
}

function requiredTokenFields(payload: StravaTokenResponse): {
  tokens: TokenPair;
  expiresAt: Date;
  athleteId: string;
  scopes: string;
} {
  const accessToken = payload.access_token;
  const refreshToken = payload.refresh_token;
  const expiresAtSeconds = payload.expires_at;
  const athleteId = payload.athlete?.id;
  const scope = payload.scope;
  if (
    typeof accessToken !== "string" || !accessToken ||
    typeof refreshToken !== "string" || !refreshToken ||
    typeof expiresAtSeconds !== "number" || !Number.isFinite(expiresAtSeconds) ||
    (typeof athleteId !== "number" && typeof athleteId !== "string") ||
    (typeof scope !== "string" && scope !== undefined)
  ) {
    throw trpcError("BAD_REQUEST", "A resposta do Strava não continha os dados necessários. Tente conectar novamente.");
  }
  const id = String(athleteId);
  if (!/^\d{1,32}$/.test(id)) throw trpcError("BAD_REQUEST", "O Strava retornou um identificador de atleta inválido.");
  const scopes = typeof scope === "string" ? scope.trim() : "";
  if (!scopes.split(/[\s,]+/).filter(Boolean).includes(STRAVA_REQUIRED_SCOPE)) {
    throw trpcError("FORBIDDEN", "A permissão para ler atividades não foi concedida. Conecte novamente e aceite activity:read.");
  }
  return { tokens: { accessToken, refreshToken }, expiresAt: new Date(expiresAtSeconds * 1000), athleteId: id, scopes };
}

export async function completeStravaAuthorization(userId: number, code: string, state: string) {
  const stateRecord = await consumeOAuthState(userId, state);
  const tokenResponse = await exchangeAuthorizationCode(code);
  const tokenData = requiredTokenFields(tokenResponse);
  const db = await requireDb();
  const encryptedTokenEnvelope = encryptStravaTokens(tokenData.tokens);
  const stravaAthleteHash = hashStravaAthleteId(tokenData.athleteId);

  await db.transaction(async (tx) => {
    const linkedAthlete = await tx.select({ userId: stravaConnections.userId })
      .from(stravaConnections).where(eq(stravaConnections.stravaAthleteHash, stravaAthleteHash)).limit(1);
    if (linkedAthlete[0] && linkedAthlete[0].userId !== userId) {
      throw trpcError("CONFLICT", "Esta conta Strava já está vinculada a outro perfil do Run Club.");
    }
    const existing = await tx.select({ id: stravaConnections.id })
      .from(stravaConnections).where(eq(stravaConnections.userId, userId)).limit(1);
    if (existing.length) {
      throw trpcError("CONFLICT", "Este perfil já possui uma conta Strava conectada. Desconecte-a antes de tentar novamente.");
    }
    await tx.insert(stravaConnections).values({
      userId,
      stravaAthleteHash,
      encryptedTokenEnvelope,
      scopes: tokenData.scopes,
      tokenExpiresAt: tokenData.expiresAt,
      consentedAt: stateRecord.consentedAt,
      consentVersion: stateRecord.consentVersion,
    });
  });

  return { connected: true as const };
}

export async function cancelStravaAuthorization(userId: number, state: string) {
  const db = await requireDb();
  await db.delete(stravaOAuthStates).where(and(
    eq(stravaOAuthStates.stateHash, hashStravaOAuthState(state)),
    eq(stravaOAuthStates.userId, userId),
  ));
  return { cancelled: true as const };
}

export async function getStravaConnectionStatus(userId: number) {
  const db = await requireDb();
  const rows = await db.select({ scopes: stravaConnections.scopes, connectedAt: stravaConnections.connectedAt })
    .from(stravaConnections).where(eq(stravaConnections.userId, userId)).limit(1);
  const connection = rows[0];
  return {
    configured: isStravaConfigured(),
    callbackUri: getStravaOAuthCallbackUri(),
    connected: Boolean(connection),
    scopes: connection?.scopes ?? null,
    connectedAt: connection?.connectedAt.toISOString() ?? null,
  };
}

const refreshInFlight = new Map<number, Promise<string>>();

async function refreshAccessToken(userId: number): Promise<string> {
  const db = await requireDb();
  const rows = await db.select().from(stravaConnections).where(eq(stravaConnections.userId, userId)).limit(1);
  const connection = rows[0];
  if (!connection) throw trpcError("PRECONDITION_FAILED", "Conecte sua conta Strava para consultar as atividades.");

  let tokens: TokenPair;
  try {
    tokens = decryptStravaTokens(connection.encryptedTokenEnvelope);
  } catch {
    throw trpcError("INTERNAL_SERVER_ERROR", "Não foi possível abrir a conexão Strava com segurança. Desconecte e conecte novamente.");
  }
  if (connection.tokenExpiresAt.getTime() > Date.now() + ACCESS_TOKEN_REFRESH_WINDOW_MS) return tokens.accessToken;

  const { clientId, clientSecret } = requireStravaCredentials();
  let response: Response;
  try {
    response = await fetch(STRAVA_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Cache-Control": "no-store" },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: "refresh_token", refresh_token: tokens.refreshToken }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw trpcError("SERVICE_UNAVAILABLE", "Não foi possível renovar a conexão com o Strava agora.");
  }
  const payload = await parseProviderJson(response) as StravaTokenResponse | null;
  if (!response.ok || !payload || typeof payload.access_token !== "string" || typeof payload.expires_at !== "number") {
    if (response.status === 401 || response.status === 400) {
      await db.delete(stravaConnections).where(eq(stravaConnections.userId, userId));
      throw trpcError("PRECONDITION_FAILED", "A autorização Strava não está mais ativa. Conecte novamente para continuar.");
    }
    throw trpcError("SERVICE_UNAVAILABLE", "O Strava não renovou a conexão. Tente novamente.");
  }
  const nextTokens: TokenPair = {
    accessToken: payload.access_token,
    refreshToken: typeof payload.refresh_token === "string" && payload.refresh_token ? payload.refresh_token : tokens.refreshToken,
  };
  await db.update(stravaConnections).set({
    encryptedTokenEnvelope: encryptStravaTokens(nextTokens),
    tokenExpiresAt: new Date(payload.expires_at * 1000),
    ...(typeof payload.scope === "string" ? { scopes: payload.scope } : {}),
  }).where(eq(stravaConnections.userId, userId));
  return nextTokens.accessToken;
}

async function getValidAccessToken(userId: number): Promise<string> {
  let pending = refreshInFlight.get(userId);
  if (!pending) {
    pending = refreshAccessToken(userId);
    refreshInFlight.set(userId, pending);
  }
  try {
    return await pending;
  } finally {
    if (refreshInFlight.get(userId) === pending) refreshInFlight.delete(userId);
  }
}

async function getConnectedAthleteHash(userId: number): Promise<string> {
  const db = await requireDb();
  const rows = await db.select({ athleteHash: stravaConnections.stravaAthleteHash })
    .from(stravaConnections).where(eq(stravaConnections.userId, userId)).limit(1);
  if (!rows[0]) throw trpcError("PRECONDITION_FAILED", "Conecte sua conta Strava para consultar as atividades.");
  return rows[0].athleteHash;
}

async function requestStravaApi(userId: number, path: string, query?: URLSearchParams): Promise<unknown> {
  const accessToken = await getValidAccessToken(userId);
  const url = new URL(`${STRAVA_API_BASE}${path}`);
  if (query) query.forEach((value, key) => url.searchParams.set(key, value));
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}`, "Cache-Control": "no-store", Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw trpcError("SERVICE_UNAVAILABLE", "O Strava não respondeu. Tente novamente.");
  }
  if (response.status === 401) {
    const db = await requireDb();
    await db.delete(stravaConnections).where(eq(stravaConnections.userId, userId));
    throw trpcError("PRECONDITION_FAILED", "A autorização Strava foi revogada ou expirou. Conecte novamente para consultar suas atividades.");
  }
  if (response.status === 429) throw trpcError("TOO_MANY_REQUESTS", "O limite de consultas do Strava foi atingido. Aguarde um pouco e tente novamente.");
  if (response.status === 404) throw trpcError("NOT_FOUND", "Esta atividade não está mais disponível no Strava.");
  if (!response.ok) throw trpcError("SERVICE_UNAVAILABLE", "Não foi possível consultar o Strava agora.");
  return parseProviderJson(response);
}

function getNumber(value: unknown): Numeric {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getText(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function toSummary(value: unknown): StravaActivitySummary | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const id = typeof raw.id === "string"
    ? raw.id
    : typeof raw.id === "number" && Number.isSafeInteger(raw.id) && raw.id > 0
      ? String(raw.id)
      : null;
  if (!id || !/^\d{1,32}$/.test(id)) return null;
  return {
    id,
    name: getText(raw.name, "Atividade Strava"),
    type: getText(raw.type, "Activity"),
    sportType: getText(raw.sport_type, getText(raw.type, "Activity")),
    startDate: getText(raw.start_date),
    startDateLocal: getText(raw.start_date_local),
    distanceMeters: getNumber(raw.distance) ?? 0,
    movingTimeSeconds: getNumber(raw.moving_time) ?? 0,
    elapsedTimeSeconds: getNumber(raw.elapsed_time) ?? 0,
    elevationGainMeters: getNumber(raw.total_elevation_gain) ?? 0,
    averageSpeedMps: getNumber(raw.average_speed) ?? 0,
    maxSpeedMps: getNumber(raw.max_speed),
    averageHeartRate: getNumber(raw.average_heartrate),
    maxHeartRate: getNumber(raw.max_heartrate),
    averageCadence: getNumber(raw.average_cadence),
    averageWatts: getNumber(raw.average_watts),
    weightedAverageWatts: getNumber(raw.weighted_average_watts),
    kilojoules: getNumber(raw.kilojoules),
    calories: getNumber(raw.calories),
    averageTempC: getNumber(raw.average_temp),
    sufferScore: getNumber(raw.suffer_score),
  };
}

function toSplit(value: unknown): StravaSplitMetric | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  return {
    split: getNumber(raw.split),
    distanceMeters: getNumber(raw.distance),
    elapsedTimeSeconds: getNumber(raw.elapsed_time),
    movingTimeSeconds: getNumber(raw.moving_time),
    elevationDifferenceMeters: getNumber(raw.elevation_difference),
    averageSpeedMps: getNumber(raw.average_speed),
    averageHeartRate: getNumber(raw.average_heartrate),
    averageCadence: getNumber(raw.average_cadence),
    averageWatts: getNumber(raw.average_watts),
  };
}

export async function listStravaActivities(userId: number, page: number) {
  const query = new URLSearchParams({ page: String(page), per_page: String(ACTIVITY_PAGE_SIZE) });
  const payload = await requestStravaApi(userId, "/athlete/activities", query);
  if (!Array.isArray(payload)) throw trpcError("SERVICE_UNAVAILABLE", "O Strava retornou uma lista de atividades inválida.");
  return payload.map(toSummary).filter((item): item is StravaActivitySummary => item !== null);
}

export async function getStravaActivityDetail(userId: number, activityId: string): Promise<StravaActivityDetail> {
  const expectedAthleteHash = await getConnectedAthleteHash(userId);
  const payload = await requestStravaApi(userId, `/activities/${activityId}`);
  if (!stravaActivityBelongsToAthleteHash(payload, expectedAthleteHash)) {
    throw trpcError("NOT_FOUND", "Esta atividade não está disponível na conta Strava conectada.");
  }
  const summary = toSummary(payload);
  if (!summary) throw trpcError("NOT_FOUND", "Esta atividade não está mais disponível no Strava.");
  const raw = payload as Record<string, unknown>;
  const splitsMetric = Array.isArray(raw.splits_metric)
    ? raw.splits_metric.map(toSplit).filter((item): item is StravaSplitMetric => item !== null)
    : [];
  const bestEfforts = Array.isArray(raw.best_efforts)
    ? raw.best_efforts.map(toSplit).filter((item): item is StravaSplitMetric => item !== null)
    : [];
  return {
    ...summary,
    averageGradePercent: getNumber(raw.average_grade),
    maxGradePercent: getNumber(raw.max_grade),
    splitsMetric,
    bestEfforts,
  };
}

export async function getStravaActivityStreams(userId: number, activityId: string): Promise<StravaActivityStreams> {
  await getStravaActivityDetail(userId, activityId);
  const query = new URLSearchParams({ keys: STREAM_KEYS.join(","), key_by_type: "true", resolution: "medium" });
  const payload = await requestStravaApi(userId, `/activities/${activityId}/streams`, query);
  if (!payload || typeof payload !== "object") throw trpcError("SERVICE_UNAVAILABLE", "O Strava não retornou métricas detalhadas para esta atividade.");
  const raw = payload as Record<string, unknown>;
  const streams: StravaActivityStreams = {};
  for (const key of STREAM_KEYS) {
    const stream = raw[key];
    if (!stream || typeof stream !== "object") continue;
    const data = (stream as { data?: unknown }).data;
    if (!Array.isArray(data)) continue;
    const numeric = data.filter((item): item is number => typeof item === "number" && Number.isFinite(item));
    if (numeric.length) streams[key] = downsampleSeries(numeric, 300);
  }
  return streams;
}

export async function disconnectStrava(userId: number) {
  const db = await requireDb();
  const rows = await db.select().from(stravaConnections).where(eq(stravaConnections.userId, userId)).limit(1);
  const connection = rows[0];
  if (!connection) return { disconnected: true as const, remoteRevoked: true };

  let tokens: TokenPair | null = null;
  try {
    tokens = decryptStravaTokens(connection.encryptedTokenEnvelope);
  } catch { /* Remove the local connection even if its encrypted tokens are unreadable. */ }
  await db.delete(stravaConnections).where(eq(stravaConnections.userId, userId));
  await db.delete(stravaOAuthStates).where(eq(stravaOAuthStates.userId, userId));
  if (!tokens) return { disconnected: true as const, remoteRevoked: false };

  let clientId: string;
  let clientSecret: string;
  try {
    ({ clientId, clientSecret } = requireStravaCredentials());
  } catch {
    return { disconnected: true as const, remoteRevoked: false };
  }
  const basic = Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64");
  let response: Response;
  try {
    response = await fetch(STRAVA_REVOKE_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Cache-Control": "no-store",
      },
      body: new URLSearchParams({ token: tokens.refreshToken, token_type_hint: "refresh_token" }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return { disconnected: true as const, remoteRevoked: false };
  }
  return { disconnected: true as const, remoteRevoked: response.ok };
}
