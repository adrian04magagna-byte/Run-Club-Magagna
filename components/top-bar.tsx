import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import type { BottomTabBarProps } from "expo-router/js-tabs";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { formatKm } from "@/components/dashboard-ui";
import { ProfileAvatar } from "@/components/profile-avatar";
import { AppMark, C } from "@/components/run-ui";
import { useAuth } from "@/hooks/use-auth";
import { useInsights } from "@/hooks/use-insights";
import { trpc } from "@/lib/trpc";

/**
 * The dark app bar: brand, this week's summary and the profile photo. On desktop it is the tab bar
 * (pass the tab props and the tabs show as pills); on phones it is the screen header and the tabs stay
 * at the bottom. It shares the dashboard's insights query (same period and day), so it adds no Strava reads.
 */
export function TopBar({ tabs }: { tabs?: BottomTabBarProps }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { user } = useAuth();
  const profile = trpc.account.profile.useQuery(undefined, { enabled: Boolean(user) });
  const insights = useInsights(Boolean(user));
  const week = insights.data?.week;
  const name = profile.data?.name || user?.name || "";

  return (
    <View style={[styles.bar, { paddingTop: insets.top }]}>
      <View style={[styles.inner, !tabs && styles.innerPhone]}>
        <Pressable onPress={() => router.navigate("/(tabs)")} style={styles.brand} accessibilityRole="link" accessibilityLabel="Run Club Magagna, início">
          <AppMark inverse size={tabs ? 32 : 30} />
          {tabs || width >= 430 ? <Text style={styles.brandText}>Run Club <Text style={styles.brandAccent}>Magagna</Text></Text> : null}
        </Pressable>

        {tabs ? <TabPills {...tabs} /> : null}

        <View style={styles.right}>
          {week ? (
            <>
              <View style={styles.chip}>
                <Text style={styles.chipMuted}>Semana</Text>
                <Text style={styles.chipStrong}>{formatKm(week.distanceMeters)} km</Text>
              </View>
              <View style={styles.chip}>
                <Ionicons name="flame" size={14} color={C.lime} />
                <Text style={[styles.chipStrong, styles.chipLime]}>{week.streakDays}</Text>
              </View>
            </>
          ) : null}
          <Pressable onPress={() => router.navigate("/(tabs)/profile")} accessibilityLabel="Abrir perfil" style={({ pressed }) => pressed && styles.pressed}>
            <ProfileAvatar uri={profile.data?.avatarUrl} name={name} size={34} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function TabPills({ state, descriptors, navigation }: BottomTabBarProps) {
  return (
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
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.75 },
  bar: { backgroundColor: C.ink, borderBottomWidth: 1, borderBottomColor: "#1C3B47" },
  inner: { width: "100%", maxWidth: 1160, alignSelf: "center", height: 64, paddingHorizontal: 24, flexDirection: "row", alignItems: "center", gap: 28 },
  innerPhone: { height: 58, paddingHorizontal: 16, gap: 10 },
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
