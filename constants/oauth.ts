import Constants from "expo-constants";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";

import { RUN_CLUB_APP_SCHEME } from "@/shared/strava";

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string | undefined>;
const API_BASE_URL = extra.apiBaseUrl ?? process.env.EXPO_PUBLIC_API_BASE_URL ?? "";

export const SESSION_TOKEN_KEY = "app_session_token";
export const USER_INFO_KEY = "runclub-user-info";

/**
 * API base URL. Uses EXPO_PUBLIC_API_BASE_URL when set; during local web development
 * (Metro on 8081) it falls back to the API on port 3000 of the same host.
 */
export function getApiBaseUrl(): string {
  if (API_BASE_URL) return API_BASE_URL.replace(/\/$/, "");
  if (Platform.OS === "web" && typeof window !== "undefined" && window.location.port === "8081") {
    const url = new URL(window.location.href);
    url.port = "3000";
    return url.origin;
  }
  return "";
}

/** Absolute web URL for an app route, honouring the GitHub Pages sub-path (experiments.baseUrl). */
export function appWebUrl(path: string): string {
  const basePath = (Constants.expoConfig?.experiments?.baseUrl ?? "").replace(/\/$/, "");
  return `${window.location.origin}${basePath}${path}`;
}

/** Where the API sends people back after Google sign-in. Must be listed in the API's APP_RETURN_URLS. */
export function getOAuthReturnUrl(): string {
  return Platform.OS === "web"
    ? appWebUrl("/oauth/callback")
    : Linking.createURL("/oauth/callback", { scheme: RUN_CLUB_APP_SCHEME });
}

export type OAuthResult =
  | { kind: "token"; token: string }
  | { kind: "status"; status: "pending" | "rejected"; email: string }
  | { kind: "error"; error: string };

/** Reads the fragment the API appends to the return URL (#token=… / #status=… / #error=…). */
export function parseOAuthFragment(url: string): OAuthResult | null {
  const hash = url.split("#")[1];
  if (!hash) return null;
  const params = new URLSearchParams(hash);
  const token = params.get("token");
  if (token) return { kind: "token", token };
  const status = params.get("status");
  if (status === "pending" || status === "rejected") return { kind: "status", status, email: params.get("email") ?? "" };
  const error = params.get("error");
  if (error) return { kind: "error", error };
  return null;
}

export function oauthErrorMessage(error: string): string {
  switch (error) {
    case "google_not_configured":
      return "O login com Google ainda não foi configurado no servidor.";
    case "cancelled":
      return "O login com Google foi cancelado.";
    case "expired":
      return "O login expirou. Tente novamente.";
    default:
      return "Não foi possível entrar com o Google agora. Tente novamente.";
  }
}

/**
 * Starts Google sign-in through the API.
 * Web: navigates away and comes back to /oauth/callback. Native: uses an auth session and
 * returns the result directly.
 */
export async function startGoogleLogin(): Promise<OAuthResult | null> {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl) return { kind: "error", error: "google_failed" };
  const returnTo = getOAuthReturnUrl();
  const startUrl = `${apiBaseUrl}/api/auth/google/start?returnTo=${encodeURIComponent(returnTo)}`;

  if (Platform.OS === "web") {
    window.location.assign(startUrl);
    return null;
  }

  const result = await WebBrowser.openAuthSessionAsync(startUrl, returnTo);
  if (result.type !== "success") return { kind: "error", error: "cancelled" };
  return parseOAuthFragment(result.url) ?? { kind: "error", error: "google_failed" };
}
