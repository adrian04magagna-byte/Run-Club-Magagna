import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps, ReactNode } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import Svg, { Circle, Path } from "react-native-svg";

export const C = {
  ink: "#0B1720",
  inkSoft: "#263744",
  navy: "#10232D",
  paper: "#F7F7F2",
  white: "#FFFFFF",
  stone: "#E8E9E1",
  line: "#D9DDD3",
  muted: "#69747B",
  lime: "#D7F752",
  limeDeep: "#A8C92B",
  coral: "#F1785B",
  sky: "#CFEAF1",
  skyDeep: "#90C7D3",
  sand: "#F1E6CE",
} as const;

type IconName = ComponentProps<typeof Ionicons>["name"];

export function Screen({ children, scroll = false, edges = ["top", "left", "right"] }: { children: ReactNode; scroll?: boolean; edges?: Edge[] }) {
  const body = scroll ? <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>{children}</ScrollView> : children;
  return <SafeAreaView edges={edges} style={styles.screen}>{body}</SafeAreaView>;
}

export function AppMark({ inverse = false, size = 42 }: { inverse?: boolean; size?: number }) {
  const scale = size / 42;
  return (
    <View style={[styles.mark, { width: size, height: size, borderRadius: size * 0.32, backgroundColor: inverse ? C.lime : C.ink }]}>
      <View style={[styles.markArc, { width: 24 * scale, height: 24 * scale, borderRadius: 12 * scale, borderWidth: 5 * scale, borderColor: inverse ? C.ink : C.lime }]} />
      <View style={[styles.markDash, { width: 12 * scale, height: 5 * scale, right: 5 * scale, top: 12 * scale, backgroundColor: inverse ? C.ink : C.lime }]} />
    </View>
  );
}

export function AppHeader({ eyebrow, title, right }: { eyebrow?: string; title: string; right?: ReactNode }) {
  return (
    <View style={styles.header}>
      <View style={styles.headerCopy}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.headerTitle}>{title}</Text>
      </View>
      {right}
    </View>
  );
}

export function IconCircle({ name, onPress, dark = false, size = 42 }: { name: IconName; onPress?: () => void; dark?: boolean; size?: number }) {
  const inner = <Ionicons name={name} size={20} color={dark ? C.white : C.ink} />;
  if (!onPress) return <View style={[styles.iconCircle, { width: size, height: size, borderRadius: size / 2 }, dark && styles.iconCircleDark]}>{inner}</View>;
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.iconCircle, { width: size, height: size, borderRadius: size / 2 }, dark && styles.iconCircleDark, pressed && styles.pressed]}>{inner}</Pressable>;
}

export function PrimaryButton({ label, icon, onPress, dark = false, style }: { label: string; icon?: IconName; onPress: () => void; dark?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.primaryButton, dark ? styles.primaryButtonDark : styles.primaryButtonLime, style, pressed && styles.pressed]}>
      <Text style={[styles.primaryButtonText, dark && styles.primaryButtonTextDark]}>{label}</Text>
      {icon ? <Ionicons name={icon} size={19} color={dark ? C.lime : C.ink} /> : null}
    </Pressable>
  );
}

export function SecondaryButton({ label, icon, onPress }: { label: string; icon?: IconName; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
      {icon ? <Ionicons name={icon} size={18} color={C.ink} /> : null}
      <Text style={styles.secondaryButtonText}>{label}</Text>
    </Pressable>
  );
}

export function Pill({ label, tone = "light", icon }: { label: string; tone?: "light" | "lime" | "dark" | "coral"; icon?: IconName }) {
  const toneStyle = tone === "lime" ? styles.pillLime : tone === "dark" ? styles.pillDark : tone === "coral" ? styles.pillCoral : styles.pillLight;
  const textStyle = tone === "dark" ? styles.pillTextDark : styles.pillText;
  return <View style={[styles.pill, toneStyle]}>{icon ? <Ionicons name={icon} size={13} color={tone === "dark" ? C.white : C.ink} /> : null}<Text style={textStyle}>{label}</Text></View>;
}

export function SectionTitle({ title, action, onPress }: { title: string; action?: string; onPress?: () => void }) {
  return <View style={styles.sectionTitleRow}><Text style={styles.sectionTitle}>{title}</Text>{action ? <Pressable onPress={onPress} style={({ pressed }) => [styles.textAction, pressed && styles.pressed]}><Text style={styles.textActionLabel}>{action}</Text><Ionicons name="arrow-forward" size={15} color={C.ink} /></Pressable> : null}</View>;
}

export function Metric({ value, label, reverse = false, valueStyle }: { value: string; label: string; reverse?: boolean; valueStyle?: StyleProp<TextStyle> }) {
  return <View style={styles.metric}><Text style={[styles.metricValue, reverse && styles.metricValueReverse, valueStyle]}>{value}</Text><Text style={[styles.metricLabel, reverse && styles.metricLabelReverse]}>{label}</Text></View>;
}

export function MiniBarChart({ values, highlightIndex = values.length - 1 }: { values: number[]; highlightIndex?: number }) {
  return <View style={styles.bars}>{values.map((value, index) => <View key={`${value}-${index}`} style={styles.barSlot}><View style={[styles.bar, { height: value }, index === highlightIndex ? styles.barHighlight : styles.barMuted]} /></View>)}</View>;
}

export function ProgressRing({ value, label, sublabel, size = 128 }: { value: number; label: string; sublabel: string; size?: number }) {
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - value);
  return <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}><Svg width={size} height={size} style={StyleSheet.absoluteFill}><Circle cx={size / 2} cy={size / 2} r={radius} stroke={C.stone} strokeWidth={stroke} fill="none" /><Circle cx={size / 2} cy={size / 2} r={radius} stroke={C.lime} strokeWidth={stroke} strokeLinecap="round" fill="none" strokeDasharray={`${circumference} ${circumference}`} strokeDashoffset={offset} transform={`rotate(-90 ${size / 2} ${size / 2})`} /></Svg><Text style={styles.ringLabel}>{label}</Text><Text style={styles.ringSubLabel}>{sublabel}</Text></View>;
}

export function RouteSpark({ light = false, height = 92 }: { light?: boolean; height?: number }) {
  const stroke = light ? C.lime : C.ink;
  const dot = light ? C.white : C.lime;
  return <Svg width="100%" height={height} viewBox="0 0 320 92" preserveAspectRatio="none"><Path d="M 8 72 C 48 70, 49 22, 91 26 S 130 81, 171 64 S 195 10, 230 25 S 276 80, 314 19" fill="none" stroke={stroke} strokeWidth="5" strokeLinecap="round" strokeDasharray="1 12" /><Circle cx="9" cy="72" r="7" fill={dot} /><Circle cx="314" cy="19" r="7" fill={dot} /></Svg>;
}

export function CoachNote({ children, label = "TREINADOR" }: { children: ReactNode; label?: string }) {
  return <View style={styles.coachNote}><View style={styles.coachBadge}><Ionicons name="sparkles" size={16} color={C.ink} /></View><View style={styles.coachCopy}><Text style={styles.coachLabel}>{label}</Text><Text style={styles.coachText}>{children}</Text></View></View>;
}

export function Row({ icon, title, detail, accessory, onPress }: { icon: IconName; title: string; detail?: string; accessory?: ReactNode; onPress?: () => void }) {
  const content = <><View style={styles.rowIcon}><Ionicons name={icon} size={18} color={C.ink} /></View><View style={styles.rowCopy}><Text style={styles.rowTitle}>{title}</Text>{detail ? <Text style={styles.rowDetail}>{detail}</Text> : null}</View>{accessory ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={C.muted} /> : null)}</>;
  if (!onPress) return <View style={styles.row}>{content}</View>;
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>{content}</Pressable>;
}

export function BackButton({ onPress, label = "Voltar" }: { onPress: () => void; label?: string }) {
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}><Ionicons name="arrow-back" size={19} color={C.ink} /><Text style={styles.backLabel}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.paper },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 34 },
  mark: { alignItems: "center", justifyContent: "center", overflow: "hidden" },
  markArc: { position: "absolute", left: 7, top: 9 },
  markDash: { position: "absolute", borderRadius: 12, transform: [{ rotate: "-35deg" }] },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 4, marginBottom: 22 },
  headerCopy: { flexShrink: 1 },
  eyebrow: { color: C.muted, fontSize: 11, fontWeight: "800", letterSpacing: 1.45, marginBottom: 4 },
  headerTitle: { color: C.ink, fontSize: 28, lineHeight: 33, fontWeight: "800", letterSpacing: -0.8 },
  iconCircle: { alignItems: "center", justifyContent: "center", backgroundColor: C.white, borderWidth: 1, borderColor: C.line },
  iconCircleDark: { backgroundColor: "rgba(255,255,255,0.12)", borderColor: "rgba(255,255,255,0.2)" },
  pressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
  primaryButton: { minHeight: 56, paddingHorizontal: 19, borderRadius: 18, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 10 },
  primaryButtonLime: { backgroundColor: C.lime },
  primaryButtonDark: { backgroundColor: C.ink },
  primaryButtonText: { color: C.ink, fontSize: 16, fontWeight: "800", letterSpacing: -0.2 },
  primaryButtonTextDark: { color: C.white },
  secondaryButton: { minHeight: 52, paddingHorizontal: 18, borderRadius: 17, borderWidth: 1, borderColor: C.line, backgroundColor: C.white, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  secondaryButtonText: { color: C.ink, fontSize: 15, fontWeight: "800" },
  pill: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  pillLight: { backgroundColor: C.white, borderWidth: 1, borderColor: C.line },
  pillLime: { backgroundColor: C.lime },
  pillDark: { backgroundColor: C.ink },
  pillCoral: { backgroundColor: "#F9D5CC" },
  pillText: { color: C.ink, fontSize: 11, fontWeight: "800", letterSpacing: 0.2 },
  pillTextDark: { color: C.white, fontSize: 11, fontWeight: "800", letterSpacing: 0.2 },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 13 },
  sectionTitle: { color: C.ink, fontSize: 19, fontWeight: "800", letterSpacing: -0.4 },
  textAction: { flexDirection: "row", alignItems: "center", gap: 4, padding: 4 },
  textActionLabel: { color: C.ink, fontSize: 13, fontWeight: "800" },
  metric: { gap: 3 },
  metricValue: { color: C.ink, fontSize: 25, lineHeight: 29, fontWeight: "800", letterSpacing: -0.8 },
  metricValueReverse: { color: C.white },
  metricLabel: { color: C.muted, fontSize: 11, fontWeight: "700" },
  metricLabelReverse: { color: "rgba(255,255,255,0.68)" },
  bars: { height: 58, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 7 },
  barSlot: { flex: 1, alignItems: "center", justifyContent: "flex-end" },
  bar: { width: "100%", maxWidth: 18, borderRadius: 9 },
  barHighlight: { backgroundColor: C.lime },
  barMuted: { backgroundColor: C.stone },
  ringLabel: { color: C.ink, fontSize: 23, lineHeight: 26, fontWeight: "900", letterSpacing: -0.8 },
  ringSubLabel: { color: C.muted, fontSize: 10, fontWeight: "800", marginTop: 1 },
  coachNote: { flexDirection: "row", alignItems: "flex-start", gap: 12, backgroundColor: C.sky, borderRadius: 20, padding: 16 },
  coachBadge: { width: 32, height: 32, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: C.lime, marginTop: 1 },
  coachCopy: { flex: 1, gap: 3 },
  coachLabel: { color: C.ink, fontSize: 10, fontWeight: "900", letterSpacing: 1.2 },
  coachText: { color: C.inkSoft, fontSize: 13, lineHeight: 19, fontWeight: "600" },
  row: { minHeight: 66, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line },
  rowIcon: { width: 38, height: 38, borderRadius: 14, backgroundColor: C.sand, alignItems: "center", justifyContent: "center" },
  rowCopy: { flex: 1, gap: 2 },
  rowTitle: { color: C.ink, fontSize: 14, fontWeight: "800" },
  rowDetail: { color: C.muted, fontSize: 12, fontWeight: "600" },
  backButton: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8, paddingRight: 10, marginBottom: 14 },
  backLabel: { color: C.ink, fontSize: 14, fontWeight: "800" },
});
