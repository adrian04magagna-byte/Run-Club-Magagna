import { getApiBaseUrl } from "@/constants/oauth";
import * as Auth from "./auth";

export type ApiUser = {
  id: number;
  openId: string;
  name: string | null;
  avatarUrl?: string | null;
  email: string | null;
  loginMethod: string | null;
  role: "user" | "admin";
  lastSignedIn: string;
};

export async function apiCall<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };
  const sessionToken = await Auth.getSessionToken();
  if (sessionToken) headers["Authorization"] = `Bearer ${sessionToken}`;

  const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const response = await fetch(`${getApiBaseUrl()}${cleanEndpoint}`, { ...options, headers });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = errorText;
    try {
      const errorJson = JSON.parse(errorText);
      errorMessage = errorJson.error || errorJson.message || errorText;
    } catch {
      // Not JSON, use text as is
    }
    const apiError = new Error(errorMessage || `API call failed: ${response.statusText}`) as Error & {
      status?: number;
    };
    apiError.status = response.status;
    throw apiError;
  }

  const text = await response.text();
  return (text ? JSON.parse(text) : {}) as T;
}

export async function logout(): Promise<void> {
  await apiCall<void>("/api/auth/logout", { method: "POST" });
}

/** Current user for the stored session token, or null when signed out or the token expired. */
export async function getMe(): Promise<ApiUser | null> {
  if (!(await Auth.getSessionToken())) return null;
  try {
    const result = await apiCall<{ user: ApiUser | null }>("/api/auth/me");
    return result.user || null;
  } catch (error) {
    const status = error instanceof Error ? (error as Error & { status?: number }).status : undefined;
    if (status === 401 || status === 403) {
      await Auth.removeSessionToken();
      await Auth.clearUserInfo();
    } else {
      console.error("[API] getMe failed");
    }
    return null;
  }
}

export function toAuthUser(user: ApiUser): Auth.User {
  return { ...user, avatarUrl: user.avatarUrl ?? null, lastSignedIn: new Date(user.lastSignedIn) };
}

/** Stores a fresh session token and the matching user, as returned by sign-in or Google. */
export async function completeSignIn(sessionToken: string): Promise<Auth.User | null> {
  await Auth.setSessionToken(sessionToken);
  const user = await getMe();
  if (!user) return null;
  const authUser = toAuthUser(user);
  await Auth.setUserInfo(authUser);
  return authUser;
}
