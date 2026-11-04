import { Ionicons } from "@expo/vector-icons";
import type { BottomTabBarProps } from "expo-router/js-tabs";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { formatKm } from "@/components/dashboard-ui";
import { ProfileAvatar } from "@/components/profile-avatar";
import { AppMark, C } from "@/components/run-ui";
import { useAuth } from "@/hooks/use-auth";
import { useInsights } from "@/hooks/use-insights";
import { trpc } from "@/lib/trpc";

/**
 * Desktop navigation: brand, the tabs as pills and a seven-day summary. It shares the dashboard's
 * insights query (same period and day), so it adds no extra Strava reads.
 */
export function DesktopTopBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { user } = useAuth();
  const profile = trpc.account.profile.useQuery(undefined, { enabled: Boolean(user) });
  const insights = useInsights(Boolean(user));
  const last7 = insights.data?.last7;
  const name = profile.data?.name || user?.name || "";

  return (
    <View style={styles.bar}>
      <View style={styles.inner}>
        <Pressable onPress={() => navigation.navigate("index")} style={styles.brand} accessibilityRole="link" accessibilityLabel="Run Club Magagna, início">
          <AppMark inverse size={32} />
          <Text style={styles.brandText}>Run Club <Text style={styles.brandAccent}>Magagna</Text></Text>
        </Pressable>

        <View style={styles.nav}>
          {state.routes.map((route, index) => {
            const { options } = descriptors[route.key];
            const focused = state.index === index;
            const color = focused ? C.ink : "#B9C2C9";
            const onPress = () => {
              const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
              if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
            };
            return (
              <Pressable
                key={route.key}
                onPress={onPress}
                accessibilityRole="tab"
                accessibilityState={{ selected: focused }}
                style={({ hovered }) => [styles.tab, focused ? styles.tabActive : hovered && styles.tabHover]}
              >
                {options.tabBarIcon?.({ focused, color, size: 16 })}
                <Text style={[styles.tabLabel, { color }]}>{options.title ?? route.name}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.right}>
          {last7 ? (
            <>
              <View style={styles.chip}>
                <Text style={styles.chipMuted}>7 dias</Text>
                <Text style={styles.chipStrong}>{formatKm(last7.distanceMeters)} km</Text>
              </View>
              <View style={styles.chip}>
                <Ionicons name="flame" size={14} color={C.lime} />
                <Text style={[styles.chipStrong, styles.chipLime]}>{last7.streakDays}</Text>
              </View>
            </>
          ) : null}
          <Pressable onPress={() => navigation.navigate("profile")} accessibilityLabel="Abrir perfil" style={({ pressed }) => pressed && styles.pressed}>
            <ProfileAvatar uri={profile.data?.avatarUrl} name={name} size={34} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.75 },
  bar: { backgroundColor: C.ink, borderBottomWidth: 1, borderBottomColor: "#1C3B47" },
  inner: { width: "100%", maxWidth: 1160, alignSelf: "center", height: 64, paddingHorizontal: 24, flexDirection: "row", alignItems: "center", gap: 28 },
  brand: { flexDirection: "row", alignItems: "center", gap: 10 },
  brandText: { color: C.white, fontSize: 15, fontWeight: "900", letterSpacing: -0.3 },
  brandAccent: { color: C.lime },
  nav: { flexDirection: "row", alignItems: "center", gap: 4 },
  tab: { flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 14, height: 36, borderRadius: 999 },
  tabActive: { backgroundColor: C.lime },
  tabHover: { backgroundColor: "rgba(255,255,255,0.08)" },
  tabLabel: { fontSize: 13, fontWeight: "800" },
  right: { marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 8 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, height: 34, borderRadius: 999, backgroundColor: "#1C3B47" },
  chipMuted: { color: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: "700" },
  chipStrong: { color: C.white, fontSize: 13, fontWeight: "900" },
  chipLime: { color: C.lime },
});
