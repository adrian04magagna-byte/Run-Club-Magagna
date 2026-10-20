import * as Linking from "expo-linking";
import Constants from "expo-constants";
import * as ReactNative from "react-native";
import * as SecureStore from "expo-secure-store";

// Extract scheme from bundle ID (last segment timestamp, prefixed with "manus")
// e.g., "space.manus.my.app.t20240115103045" -> "manus20240115103045"
const bundleId = "space.manus.correia.t083805477929675";
const timestamp = bundleId.split(".").pop()?.replace(/^t/, "") ?? "";
const schemeFromBundleId = `manus${timestamp}`;

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string | undefined>;

const env = {
  portal: extra.oauthPortalUrl ?? process.env.EXPO_PUBLIC_OAUTH_PORTAL_URL ?? "",
  server: extra.oauthServerUrl ?? process.env.EXPO_PUBLIC_OAUTH_SERVER_URL ?? "",
  appId: extra.appId ?? process.env.EXPO_PUBLIC_APP_ID ?? "",
  ownerId: process.env.EXPO_PUBLIC_OWNER_OPEN_ID ?? "",
  ownerName: process.env.EXPO_PUBLIC_OWNER_NAME ?? "",
  apiBaseUrl: extra.apiBaseUrl ?? process.env.EXPO_PUBLIC_API_BASE_URL ?? "",
  deepLinkScheme: schemeFromBundleId,
};

export const OAUTH_PORTAL_URL = env.portal;
export const OAUTH_SERVER_URL = env.server;
export const APP_ID = env.appId;
export const OWNER_OPEN_ID = env.ownerId;
export const OWNER_NAME = env.ownerName;
export const API_BASE_URL = env.apiBaseUrl;

/**
 * Get the API base URL, deriving from current hostname if not set.
 * Metro runs on 8081, API server runs on 3000.
 * URL pattern: https://PORT-sandboxid.region.domain
 */
export function getApiBaseUrl(): string {
  // If API_BASE_URL is set, use it
  if (API_BASE_URL) {
    return API_BASE_URL.replace(/\/$/, "");
  }

  // On web, the public mobile Preview may use the 8328 host while Metro uses 8081;
  // both route to the same sandbox whose API listener is 3000.
  if (ReactNative.Platform.OS === "web" && typeof window !== "undefined" && window.location) {
    const url = new URL(window.location.href);
    const apiHostname = url.hostname.replace(/^(?:8081|8328)-/, "3000-");
    if (apiHostname !== url.hostname) {
      url.hostname = apiHostname;
      url.port = "";
      return url.origin;
    }
    if (url.port === "8081") {
      url.port = "3000";
      return url.origin;
    }
  }

  // Fallback to empty (will use relative URL)
  return "";
}

export const SESSION_TOKEN_KEY = "app_session_token";
export const USER_INFO_KEY = "manus-runtime-user-info";

const OAUTH_NONCE_KEY = "runclub_oauth_nonce";

const encodeState = (value: string) => {
  let encoded: string;
  if (typeof globalThis.btoa === "function") {
    encoded = globalThis.btoa(value);
  } else {
    const BufferImpl = (globalThis as Record<string, any>).Buffer;
    if (!BufferImpl) throw new Error("Este dispositivo não oferece uma codificação segura para iniciar o login.");
    encoded = BufferImpl.from(value, "utf-8").toString("base64");
  }
  return encoded.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

/**
 * Get the redirect URI for OAuth callback.
 * - Web: returns to the application route, which validates state before exchanging the code
 * - Native: uses deep link scheme
 */
export const getRedirectUri = () => {
  if (ReactNative.Platform.OS === "web" && typeof window !== "undefined") {
    return `${window.location.origin}/oauth/callback`;
  } else {
    return Linking.createURL("/oauth/callback", {
      scheme: env.deepLinkScheme,
    });
  }
};

export const getLoginUrl = (state: string, redirectUri = getRedirectUri()) => {
  if (!OAUTH_PORTAL_URL || !APP_ID) {
    throw new Error("Manus login configuration is unavailable");
  }
  const url = new URL(`${OAUTH_PORTAL_URL}/app-auth`);
  url.searchParams.set("appId", APP_ID);
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("responseType", "code");

  return url.toString();
};

/**
 * Start OAuth login flow.
 *
 * On native platforms (iOS/Android), open the system browser directly so
 * the OAuth callback returns via deep link to the app.
 *
 * On web, this simply redirects to the login URL.
 *
 * @returns Always null, the callback is handled via deep link.
 */
export async function startOAuthLogin(): Promise<string | null> {
  const random = new Uint8Array(32);
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error("Não foi possível iniciar uma sessão segura neste dispositivo.");
  }
  globalThis.crypto.getRandomValues(random);
  const nonce = Array.from(random, (byte) => byte.toString(16).padStart(2, "0")).join("");
  const redirectUri = getRedirectUri();
  const state = encodeState(JSON.stringify({ redirectUri, nonce }));

  if (ReactNative.Platform.OS === "web") {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${OAUTH_NONCE_KEY}=${nonce}; Path=/; Max-Age=300; SameSite=Lax${secure}`;
  } else {
    await SecureStore.setItemAsync(OAUTH_NONCE_KEY, nonce);
  }
  const loginUrl = getLoginUrl(state, redirectUri);

  if (ReactNative.Platform.OS === "web") {
    // On web, just redirect
    if (typeof window !== "undefined") {
      window.location.href = loginUrl;
    }
    return null;
  }

  const supported = await Linking.canOpenURL(loginUrl);
  if (!supported) {
    console.warn("[OAuth] Cannot open login URL: URL scheme not supported");
    // 可考虑抛出错误或返回错误状态，让调用方处理
    return null;
  }

  try {
    await Linking.openURL(loginUrl);
  } catch {
    console.error("[OAuth] Failed to open login URL");
    // 可考虑抛出错误让调用方处理
  }

  // The OAuth callback will reopen the app via deep link.
  return null;
}

export async function consumeOAuthState(state: string): Promise<boolean> {
  try {
    const normalized = state.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const decoded = typeof globalThis.atob === "function"
      ? globalThis.atob(padded)
      : (globalThis as Record<string, any>).Buffer.from(padded, "base64").toString("utf-8");
    const payload = JSON.parse(decoded) as { redirectUri?: string; nonce?: string };
    if (!payload.redirectUri || !payload.nonce || payload.redirectUri !== getRedirectUri()) return false;

    let storedNonce: string | null = null;
    if (ReactNative.Platform.OS === "web") {
      const entry = document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${OAUTH_NONCE_KEY}=`));
      storedNonce = entry ? decodeURIComponent(entry.slice(OAUTH_NONCE_KEY.length + 1)) : null;
      const secure = window.location.protocol === "https:" ? "; Secure" : "";
      document.cookie = `${OAUTH_NONCE_KEY}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
    } else {
      storedNonce = await SecureStore.getItemAsync(OAUTH_NONCE_KEY);
      await SecureStore.deleteItemAsync(OAUTH_NONCE_KEY);
    }
    return Boolean(storedNonce && storedNonce === payload.nonce);
  } catch {
    return false;
  }
}
