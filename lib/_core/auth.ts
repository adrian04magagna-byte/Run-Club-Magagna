import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { SESSION_TOKEN_KEY, USER_INFO_KEY } from "@/constants/oauth";

export type User = {
  id: number;
  openId: string;
  name: string | null;
  avatarUrl?: string | null;
  email: string | null;
  loginMethod: string | null;
  role?: "user" | "admin";
  lastSignedIn: Date;
};

// The session is a bearer token. On web it lives in localStorage because the app (GitHub Pages)
// and the API (Vercel) are on different sites, where browsers block third-party cookies.
async function readItem(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(key);
}

async function writeItem(key: string, value: string | null): Promise<void> {
  if (Platform.OS === "web") {
    try {
      if (value === null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, value);
    } catch {
      // Private browsing can block storage; the session then lasts only for this page.
    }
    return;
  }
  if (value === null) await SecureStore.deleteItemAsync(key);
  else await SecureStore.setItemAsync(key, value);
}

export async function getSessionToken(): Promise<string | null> {
  try {
    return await readItem(SESSION_TOKEN_KEY);
  } catch {
    console.error("[Auth] Failed to get session token");
    return null;
  }
}

export async function setSessionToken(token: string): Promise<void> {
  await writeItem(SESSION_TOKEN_KEY, token);
}

export async function removeSessionToken(): Promise<void> {
  try {
    await writeItem(SESSION_TOKEN_KEY, null);
  } catch {
    console.error("[Auth] Failed to remove session token");
  }
}

export async function getUserInfo(): Promise<User | null> {
  try {
    const info = await readItem(USER_INFO_KEY);
    return info ? (JSON.parse(info) as User) : null;
  } catch {
    console.error("[Auth] Failed to get user info");
    return null;
  }
}

export async function setUserInfo(user: User): Promise<void> {
  try {
    await writeItem(USER_INFO_KEY, JSON.stringify(user));
  } catch {
    console.error("[Auth] Failed to set user info");
  }
}

export async function clearUserInfo(): Promise<void> {
  try {
    await writeItem(USER_INFO_KEY, null);
  } catch {
    console.error("[Auth] Failed to clear user info");
  }
}
