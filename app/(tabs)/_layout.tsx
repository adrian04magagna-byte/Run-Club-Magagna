import { Ionicons } from "@expo/vector-icons";
import { Redirect, Tabs } from "expo-router";
import { ActivityIndicator, Platform, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { C } from "@/components/run-ui";
import { TopBar } from "@/components/top-bar";
import { HapticTab } from "@/components/haptic-tab";
import { useAuth } from "@/hooks/use-auth";
import { useIsDesktop } from "@/hooks/use-layout";
import { trpc } from "@/lib/trpc";

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const { user, loading } = useAuth();
  const desktop = useIsDesktop();
  const athleteStatus = trpc.account.status.useQuery(undefined, { enabled: Boolean(user) && user?.role !== "admin" });
  const bottomPadding = Platform.OS === "web" ? 11 : Math.max(insets.bottom, 8);
  const tabBarHeight = 61 + bottomPadding;

  if (loading || (user && user.role !== "admin" && (athleteStatus.isLoading || athleteStatus.isFetching))) return <View style={styles.loading}><ActivityIndicator size="large" color={C.ink} /></View>;
  if (!user) return <Redirect href="/login" />;
  if (user.role !== "admin" && athleteStatus.data?.status !== "approved") {
    if (athleteStatus.data?.status === "pending") return <Redirect href={{ pathname: "/pending", params: { email: user.email ?? "" } }} />;
    const reason = athleteStatus.data?.status === "rejected" ? "rejected" : "not-athlete";
    return <Redirect href={{ pathname: "/login", params: { reason } }} />;
  }

  return (
    <Tabs
      tabBar={desktop ? (props) => <TopBar tabs={props} /> : undefined}
      screenOptions={{
        // Phones keep the tabs at the bottom and show the same dark bar as the screen header.
        headerShown: !desktop,
        header: () => <TopBar />,
        tabBarPosition: desktop ? "top" : "bottom",
        tabBarButton: HapticTab,
        tabBarActiveTintColor: C.lime,
        tabBarInactiveTintColor: "#8A969E",
        tabBarStyle: [styles.tabBar, { height: tabBarHeight, paddingBottom: bottomPadding }],
        tabBarLabelStyle: styles.tabLabel,
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Hoje", tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "home" : "home-outline"} size={21} color={color} /> }} />
      <Tabs.Screen name="progress" options={{ title: "Dados", tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "analytics" : "analytics-outline"} size={21} color={color} /> }} />
      <Tabs.Screen name="map" options={{ title: "Mapa", tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "earth" : "earth-outline"} size={21} color={color} /> }} />
      <Tabs.Screen name="plans" options={{ title: "Planos", tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "map" : "map-outline"} size={21} color={color} /> }} />
      <Tabs.Screen name="club" options={{ title: user.role === "admin" ? "Alunos" : "Clube", tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "people" : "people-outline"} size={21} color={color} /> }} />
      <Tabs.Screen name="profile" options={{ title: "Perfil", tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "person" : "person-outline"} size={21} color={color} /> }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.paper },
  tabBar: { paddingTop: 9, backgroundColor: C.ink, borderTopColor: "#1C3B47", borderTopWidth: 1, elevation: 0 },
  tabLabel: { fontSize: 10, fontWeight: "800", marginTop: 1 },
});
