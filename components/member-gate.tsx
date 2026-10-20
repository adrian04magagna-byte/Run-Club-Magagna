import { Redirect } from "expo-router";
import type { ReactNode } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { C } from "@/components/run-ui";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";

export function MemberGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const athleteStatus = trpc.account.status.useQuery(undefined, {
    enabled: Boolean(user) && user?.role !== "admin",
  });

  if (loading || (user && user.role !== "admin" && (athleteStatus.isLoading || athleteStatus.isFetching))) {
    return <View style={styles.loading}><ActivityIndicator size="large" color={C.ink} /></View>;
  }
  if (!user) return <Redirect href="/login" />;
  if (user.role !== "admin" && athleteStatus.data?.status !== "approved") {
    if (athleteStatus.data?.status === "pending") {
      return <Redirect href={{ pathname: "/pending", params: { email: user.email ?? "" } }} />;
    }
    const reason = athleteStatus.data?.status === "rejected" ? "rejected" : "not-athlete";
    return <Redirect href={{ pathname: "/login", params: { reason } }} />;
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.paper },
});
