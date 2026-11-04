import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  BarChart,
  DeltaChip,
  EmptyState,
  FloatingStats,
  PeriodSelector,
  Skeleton,
  STRAVA_ORANGE,
  TrainingRow,
  delta,
  formatDuration,
  formatKm,
  formatPace,
} from "@/components/dashboard-ui";
import { C, SectionTitle } from "@/components/run-ui";
import { localToday, useInsights } from "@/hooks/use-insights";
import { useIsDesktop } from "@/hooks/use-layout";
import { paceSecondsPerKm } from "@/shared/insights";

const PERIOD_NAMES = { "7d": "nos últimos 7 dias", "30d": "nos últimos 30 dias", "90d": "nos últimos 90 dias", all: "em todo o histórico" } as const;

/**
 * The member's own running dashboard: period stats floating at the top, then the last seven days
 * in focus, then the runs of the week. Data comes from club logs plus the connected Strava account.
 * On phones `aside` (the screen's own cards) and the week focus come first, then the rest stacks; on desktop the week
 * focus and its runs take the left column, while `aside` and the period numbers take the right.
 */
export function TrainingDashboard({ enabled = true, showRecent = true, aside, title }: { enabled?: boolean; showRecent?: boolean; aside?: ReactNode; title: string }) {
  const router = useRouter();
  const desktop = useIsDesktop();
  const insights = useInsights(enabled);
  const data = insights.data;

  if (insights.isLoading || !data) {
    return (
      <View>
        {aside}
        {aside ? <View style={styles.gap} /> : null}
        <View style={styles.stack}>
          <Skeleton height={44} radius={16} />
          <View style={styles.skeletonRow}><Skeleton height={120} /><Skeleton height={120} /></View>
          <Skeleton height={300} radius={28} />
        </View>
      </View>
    );
  }

  const { period, week } = data;
  const weekDelta = delta(week.distanceMeters, week.previousDistanceMeters);
  const hasAnyRun = period.runs > 0 || week.runs > 0;

  const banners = (
    <>
      {!data.stravaConnected ? (
        <Pressable onPress={() => router.push("/strava")} style={({ pressed }) => [styles.stravaBanner, pressed && styles.pressed]}>
          <View style={styles.stravaDot}><Ionicons name="flash" size={15} color={C.white} /></View>
          <View style={styles.bannerCopy}>
            <Text style={styles.bannerTitle}>Conecte seu Strava</Text>
            <Text style={styles.bannerText}>Suas corridas entram no painel automaticamente.</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={C.ink} />
        </Pressable>
      ) : null}
      {data.stravaError ? <Text style={styles.warning}>Strava indisponível agora: {data.stravaError}</Text> : null}
    </>
  );

  const periodBlock = (
    <>
      <PeriodSelector value={insights.period} onChange={insights.setPeriod} />
      <Text style={styles.periodCaption}>
        {period.runs ? `${period.runs} ${period.runs === 1 ? "corrida" : "corridas"} ${PERIOD_NAMES[insights.period]}` : `Sem corridas ${PERIOD_NAMES[insights.period]}`}
        {insights.isFetching ? " · atualizando…" : ""}
      </Text>
      <FloatingStats
        grid
        stats={[
          { icon: "map-outline", label: "distância", value: formatKm(period.distanceMeters), unit: "km", delta: delta(period.distanceMeters, period.previousDistanceMeters) },
          { icon: "speedometer-outline", label: "ritmo médio", value: formatPace(period.averagePaceSecondsPerKm), unit: "/km", accent: C.sky },
          { icon: "time-outline", label: "tempo em movimento", value: formatDuration(period.movingSeconds), accent: C.sand },
          { icon: "trophy-outline", label: "maior corrida", value: formatKm(period.longestMeters), unit: "km", accent: "#FBD9CF" },
          { icon: "flash-outline", label: "melhor ritmo (1 km+)", value: formatPace(period.bestPaceSecondsPerKm), unit: "/km", accent: C.sky },
          { icon: "trending-up-outline", label: "elevação", value: String(period.elevationMeters), unit: "m", accent: C.sand },
          { icon: "calendar-outline", label: "dias ativos", value: String(period.activeDays), accent: C.lime },
        ]}
      />
      {insights.period !== "7d" ? (
        <View style={styles.periodChart}>
          <Text style={styles.periodChartTitle}>Volume {insights.period === "90d" ? "por semana" : insights.period === "all" ? "por mês" : "por dia"}</Text>
          <BarChart buckets={data.series} height={72} />
        </View>
      ) : null}
    </>
  );

  const weekCard = (
    <View style={styles.weekCard}>
      <View style={styles.weekGlow} />
      <View style={styles.weekHeader}>
        <View>
          <Text style={styles.weekEyebrow}>FOCO · ESTA SEMANA · {shortDay(week.from)} – {shortDay(week.to)}</Text>
          <View style={styles.weekValueRow}>
            <Text style={styles.weekValue}>{formatKm(week.distanceMeters)}</Text>
            <Text style={styles.weekUnit}>km</Text>
            <DeltaChip value={weekDelta} inverse />
          </View>
          <Text style={styles.weekCompare}>
            {weekDelta === null ? "Sem corridas na semana passada até hoje" : `vs. ${formatKm(week.previousDistanceMeters)} km na semana passada até este dia`}
          </Text>
        </View>
        <View style={styles.streak}>
          <Ionicons name="flame" size={16} color={C.ink} />
          <Text style={styles.streakValue}>{week.streakDays}</Text>
          <Text style={styles.streakLabel}>{week.streakDays === 1 ? "dia" : "dias"}</Text>
        </View>
      </View>
      <BarChart buckets={week.days} dark height={96} highlight={week.days.findIndex((day) => day.from === localToday())} />
      <View style={styles.weekMetrics}>
        <WeekMetric label="corridas" value={String(week.runs)} />
        <View style={styles.weekDivider} />
        <WeekMetric label="tempo" value={formatDuration(week.movingSeconds)} />
        <View style={styles.weekDivider} />
        <WeekMetric label="ritmo /km" value={formatPace(week.averagePaceSecondsPerKm)} />
        <View style={styles.weekDivider} />
        <WeekMetric label="dias ativos" value={`${week.activeDays}/7`} />
      </View>
    </View>
  );

  const recentBlock = showRecent ? (
    <>
      <View style={desktop ? styles.gapDesktop : styles.gap} />
      <SectionTitle title="Treinos da semana" action={data.stravaConnected ? "Strava" : undefined} onPress={() => router.push("/strava")} />
      {data.recent.length ? (
        <View style={styles.list}>
          {data.recent.map((entry) => (
            <TrainingRow
              key={entry.id}
              title={entry.title}
              date={entry.date}
              source={entry.source}
              distanceMeters={entry.distanceMeters}
              movingSeconds={entry.movingSeconds}
              paceSecondsPerKm={paceSecondsPerKm(entry.distanceMeters, entry.movingSeconds)}
            />
          ))}
        </View>
      ) : (
        <EmptyState
          icon="footsteps-outline"
          title={hasAnyRun ? "Nenhuma corrida nesta semana" : "Seu painel começa na primeira corrida"}
          text={data.stravaConnected ? "Assim que você correr com o Strava, o treino aparece aqui sozinho." : "Registre um treino no clube ou conecte o Strava para preencher o painel."}
        />
      )}
    </>
  ) : null;

  const footnote = data.truncated ? <Text style={styles.footnote}>Mostrando as 2.000 atividades mais recentes do Strava.</Text> : null;

  if (desktop) {
    return (
      <View>
        {banners}
        <View style={styles.split}>
          <View style={styles.main}>
            {weekCard}
            {recentBlock}
            {footnote}
          </View>
          <View style={styles.side}>
            {aside}
            {aside ? <View style={styles.gapDesktop} /> : null}
            <SectionTitle title={title} />
            {periodBlock}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View>
      {aside}
      {aside ? <View style={styles.gapPhone} /> : null}
      {weekCard}
      <View style={styles.gap} />
      <SectionTitle title={title} />
      {banners}
      {periodBlock}
      {recentBlock}
      {footnote}
    </View>
  );
}

/** "2026-11-02" → "02/11". */
function shortDay(date: string) {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}`;
}

function WeekMetric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.weekMetric}>
      <Text style={styles.weekMetricValue}>{value}</Text>
      <Text style={styles.weekMetricLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.75, transform: [{ scale: 0.99 }] },
  stack: { gap: 14 },
  skeletonRow: { flexDirection: "row", gap: 10 },
  gap: { height: 28 },
  gapDesktop: { height: 20 },
  gapPhone: { height: 14 },
  list: { gap: 8 },
  split: { flexDirection: "row", alignItems: "flex-start", gap: 20 },
  main: { flex: 1.35, minWidth: 0 },
  side: { flex: 1, minWidth: 0 },

  stravaBanner: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, marginBottom: 16, borderRadius: 18, backgroundColor: "#FFF1EA", borderWidth: 1, borderColor: "#FFD6C2" },
  stravaDot: { width: 34, height: 34, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: STRAVA_ORANGE },
  bannerCopy: { flex: 1, gap: 2 },
  bannerTitle: { color: C.ink, fontSize: 14, fontWeight: "900" },
  bannerText: { color: C.inkSoft, fontSize: 12, fontWeight: "600" },
  warning: { color: "#8A2A12", fontSize: 12, fontWeight: "700", marginBottom: 12 },

  periodCaption: { color: C.muted, fontSize: 12, fontWeight: "700", marginTop: 10, marginBottom: 12 },
  periodChart: { padding: 16, marginBottom: 16, borderRadius: 22, backgroundColor: C.white, borderWidth: 1, borderColor: "#ECEDE6" },
  periodChartTitle: { color: C.ink, fontSize: 13, fontWeight: "900", marginBottom: 6 },

  weekCard: { overflow: "hidden", padding: 18, borderRadius: 24, backgroundColor: C.ink, boxShadow: "0px 16px 36px rgba(11, 23, 32, 0.22)" },
  weekGlow: { position: "absolute", width: 240, height: 240, borderRadius: 120, right: -90, top: -110, backgroundColor: "#1C3B47" },
  weekHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 },
  weekEyebrow: { color: C.lime, fontSize: 10, fontWeight: "900", letterSpacing: 1.3, marginBottom: 6 },
  weekValueRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  weekValue: { color: C.white, fontSize: 34, lineHeight: 38, fontWeight: "900", letterSpacing: -1.2 },
  weekUnit: { color: "rgba(255,255,255,0.6)", fontSize: 16, fontWeight: "800", marginTop: 12, marginRight: 4 },
  weekCompare: { color: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: "600", marginTop: 2 },
  streak: { alignItems: "center", paddingHorizontal: 12, paddingVertical: 10, borderRadius: 18, backgroundColor: C.lime },
  streakValue: { color: C.ink, fontSize: 20, lineHeight: 22, fontWeight: "900", marginTop: 2 },
  streakLabel: { color: C.ink, fontSize: 9, fontWeight: "900", letterSpacing: 0.4 },
  weekMetrics: { flexDirection: "row", alignItems: "center", marginTop: 18, paddingTop: 16, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.1)" },
  weekMetric: { flex: 1, alignItems: "center", gap: 3 },
  weekMetricValue: { color: C.white, fontSize: 16, fontWeight: "900" },
  weekMetricLabel: { color: "rgba(255,255,255,0.55)", fontSize: 10, fontWeight: "700" },
  weekDivider: { width: 1, height: 28, backgroundColor: "rgba(255,255,255,0.12)" },

  footnote: { color: C.muted, fontSize: 11, fontWeight: "600", marginTop: 12 },
});
