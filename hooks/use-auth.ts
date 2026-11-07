import * as Api from "@/lib/_core/api";
import * as Auth from "@/lib/_core/auth";
import { useCallback, useEffect, useMemo, useState } from "react";

type UseAuthOptions = {
  autoFetch?: boolean;
};

export function useAuth(options?: UseAuthOptions) {
  const { autoFetch = true } = options ?? {};
  const [user, setUser] = useState<Auth.User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Validates the stored token with the API; a revoked or expired token signs the person out.
  const fetchUser = useCallback(async () => {
    try {
      setError(null);
      const apiUser = await Api.getMe();
      if (apiUser) {
        const userInfo = Api.toAuthUser(apiUser);
        setUser(userInfo);
        await Auth.setUserInfo(userInfo);
      } else if (!(await Auth.getSessionToken())) {
        setUser(null);
        await Auth.clearUserInfo();
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to fetch user"));
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await Api.logout();
    } catch {
      // Continue with logout even if the API call fails.
    } finally {
      await Auth.removeSessionToken();
      await Auth.clearUserInfo();
      setUser(null);
      setError(null);
    }
  }, []);

  const updateUser = useCallback(async (updates: Partial<Auth.User>) => {
    if (!user) return;
    const updatedUser = { ...user, ...updates };
    setUser(updatedUser);
    await Auth.setUserInfo(updatedUser);
  }, [user]);

  const isAuthenticated = useMemo(() => Boolean(user), [user]);

  useEffect(() => {
    if (!autoFetch) {
      setLoading(false);
      return;
    }
    let active = true;
    (async () => {
      // Show the cached profile immediately (also offline), then confirm the session.
      const [cachedUser, token] = await Promise.all([Auth.getUserInfo(), Auth.getSessionToken()]);
      if (!active) return;
      if (cachedUser && token) {
        setUser(cachedUser);
        setLoading(false);
      }
      if (!token) {
        setUser(null);
        setLoading(false);
        return;
      }
      await fetchUser();
    })();
    return () => {
      active = false;
    };
  }, [autoFetch, fetchUser]);

  return {
    user,
    loading,
    error,
    isAuthenticated,
    refresh: fetchUser,
    logout,
    updateUser,
  };
}
