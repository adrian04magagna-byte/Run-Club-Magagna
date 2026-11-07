import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { BarChart, DeltaChip, EmptyState, Explain, PeriodSelector, Skeleton, delta, formatDay, formatDuration, formatKm, formatPace } from "@/components/dashboard-ui";
import { RunAnalysisSection } from "@/components/run-analysis";
import { C, PrimaryButton, ProgressRing, Screen, SectionTitle } from "@/components/run-ui";
import { useAuth } from "@/hooks/use-auth";
import { useInsights } from "@/hooks/use-insights";
import { useIsDesktop } from "@/hooks/use-layout";
import { trpc } from "@/lib/trpc";
import { calendarWeeks, daysInRange } from "@/shared/insights";

type RecordIcon = "trophy-outline" | "flash-outline" | "trending-up-outline" | "time-outline";

export default function ProgressScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const isCoach = user?.role === "admin";
  const desktop = useIsDesktop();
  const insights = useInsights(Boolean(user));
  const assignments = trpc.club.myAssignments.useQuery(undefined, { enabled: Boolean(user) && !isCoach });
  const coachFeed = trpc.club.coachActivityFeed.useQuery(undefined, { enabled: isCoach });
  const data = insights.data;

  const header = (
    <View style={styles.header}>
      <Text style={styles.eyebrow}>{isCoach ? "SEU TREINO E A TURMA" : "SUA EVOLUÇÃO"}</Text>
      <Text style={styles.title}>Dados</Text>
    </View>
  );

  if (!data) {
    return <Screen scroll>{header}<View style={styles.stack}><Skeleton height={44} radius={16} /><Skeleton height={260} radius={28} /><Skeleton height={180} /></View></Screen>;
  }

  const { period } = data;
  const periodFrom = period.from ?? period.to;
  const periodDays = daysInRange(periodFrom, period.to);
  const periodWeeks = calendarWeeks(periodFrom, period.to);
  const consistency = Math.min(1, period.activeDays / periodDays);
  const runsPerWeek = period.runs / periodWeeks;
  const currentWeek = insights.period === "week";
  const compared = delta(period.distanceMeters, period.previousDistanceMeters);
  const inPeriod = (date: string) => date >= periodFrom && date <= period.to;
  const planned = (assignments.data ?? []).filter((assignment) => inPeriod(assignment.scheduledDate));
  const plannedDone = planned.filter((assignment) => assignment.status === "completed").length;
  const reviewed = (coachFeed.data ?? []).filter((item) => item.review).length;
  const feedTotal = coachFeed.data?.length ?? 0;

  return (
    <Screen scroll wide>
      {header}
      <View style={desktop && styles.selectorDesktop}><PeriodSelector value={insights.period} onChange={insights.setPeriod} /></View>
      <Text style={styles.weekNote}>As semanas vão de segunda a domingo. A semana atual entra até hoje.</Text>

      <View style={desktop && styles.split}>
      <View style={[styles.hero, desktop && styles.heroDesktop]}>
        <View style={styles.heroTop}>
          <View>
            <Text style={styles.heroEyebrow}>DISTÂNCIA NO PERÍODO</Text>
            <View style={styles.heroValueRow}>
              <Text style={styles.heroValue}>{formatKm(period.distanceMeters)}</Text>
              <Text style={styles.heroUnit}>km</Text>
              <DeltaChip value={compared} inverse />
            </View>
            <Text style={styles.heroRange}>
              {period.from ? `${formatDay(period.from)} – ${formatDay(currentWeek ? data.week.to : period.to)}` : "Sem corridas registradas ainda"}
              {insights.isFetching ? " · atualizando…" : ""}
            </Text>
            {compared !== null ? <Text style={styles.heroRange}>A porcentagem compara com {currentWeek ? "a semana passada" : "o período anterior"} até o mesmo dia.</Text> : null}
          </View>
        </View>
        <BarChart buckets={data.series} dark height={desktop ? 150 : 130} highlight={data.series.findIndex((bucket) => bucket.from <= period.to && period.to <= bucket.to)} />
        <View style={styles.heroMetrics}>
          <HeroMetric value={String(period.runs)} label="corridas" />
          <HeroMetric value={formatDuration(period.movingSeconds)} label="em movimento" />
          <HeroMetric value={formatPace(period.averagePaceSecondsPerKm)} label="ritmo médio por km" />
        </View>
      </View>

      <View style={desktop && styles.side}>
      {period.runs ? (
        <>
          <View style={desktop ? styles.gapNone : styles.gap} />
          <SectionTitle title="Destaques do período" />
          <View style={styles.records}>
            <RecordCard icon="trophy-outline" label="Maior corrida" hint="A corrida mais longa." value={`${formatKm(period.longestMeters, 2)} km`} tone={C.sand} />
            <RecordCard icon="flash-outline" label="Melhor ritmo" hint="Menor tempo por km em uma corrida de 1 km ou mais." value={`${formatPace(period.bestPaceSecondsPerKm)} /km`} tone={C.sky} />
            <RecordCard icon="trending-up-outline" label="Subida acumulada" hint="Soma de todas as subidas das corridas." value={`${period.elevationMeters} m`} tone={C.sky} />
            <RecordCard icon="time-outline" label="Média por corrida" hint="Distância típica de cada saída." value={`${formatKm(period.distanceMeters / Math.max(1, period.runs), 1)} km`} tone={C.sand} />
          </View>

          <View style={styles.gap} />
          <SectionTitle title="Consistência" />
          <View style={styles.consistency}>
            <ProgressRing value={consistency} label={`${Math.round(consistency * 100)}%`} sublabel="DIAS ATIVOS" size={112} />
            <View style={styles.consistencyCopy}>
              <Text style={styles.consistencyTitle}>
                {insights.period === "all" && period.from
                  ? `${period.activeDays} dias com corrida desde ${formatDay(period.from)}`
                  : `${period.activeDays} de ${periodDays} dias com corrida`}
              </Text>
              <Text style={styles.consistencyText}>
                {currentWeek
                  ? `${period.runs} ${period.runs === 1 ? "corrida" : "corridas"} nesta semana.`
                  : `Média de ${runsPerWeek.toFixed(1).replace(".", ",")} ${runsPerWeek >= 1.95 || runsPerWeek < 1 ? "corridas" : "corrida"} por semana.`}
                {data.week.streakDays > 1 ? ` Você está numa sequência de ${data.week.streakDays} dias.` : ""}
              </Text>
              <Explain more="Mostra em quantos dias do período você correu. Correr com regularidade, mesmo pouco, costuma render mais do que uma corrida grande de vez em quando." />
            </View>
          </View>
        </>
      ) : (
        <>
          <View style={desktop ? styles.gapNone : styles.gap} />
          <EmptyState
            icon="analytics-outline"
            title="Ainda não há corridas neste período"
            text={data.stravaConnected ? "Escolha um período maior ou corra com o Strava: os dados entram sozinhos." : "Conecte o Strava ou registre treinos no clube para acompanhar sua evolução."}
            action={!data.stravaConnected ? <PrimaryButton label="Conectar Strava" icon="flash" onPress={() => router.push("/strava")} style={styles.emptyButton} /> : undefined}
          />
        </>
      )}
      </View>
      </View>

      <View style={styles.gap} />
      <RunAnalysisSection />
      <View style={styles.gap} />
      {isCoach ? (
        <>
          <SectionTitle title="Retorno à turma" action="Abrir turma" onPress={() => router.push("/(tabs)/club")} />
          <View style={styles.planCard}>
            <View style={styles.planTop}>
              <Text style={styles.planValue}>{reviewed}/{feedTotal}</Text>
              <Text style={styles.planLabel}>atividades avaliadas</Text>
            </View>
            <View style={styles.track}><View style={[styles.trackFill, { width: feedTotal ? `${Math.round((reviewed / feedTotal) * 100)}%` : "0%" }]} /></View>
            <Text style={styles.planText}>{feedTotal - reviewed ? `${feedTotal - reviewed} ${feedTotal - reviewed === 1 ? "treino aguarda" : "treinos aguardam"} seu comentário.` : "Tudo em dia com a turma."}</Text>
          </View>
        </>
      ) : (
        <>
          <SectionTitle title="Plano do treinador" action="Clube" onPress={() => router.push("/(tabs)/club")} />
          <View style={styles.planCard}>
            <View style={styles.planTop}>
              <Text style={styles.planValue}>{plannedDone}/{planned.length}</Text>
              <Text style={styles.planLabel}>treinos do plano concluídos</Text>
            </View>
            <View style={styles.track}><View style={[styles.trackFill, { width: planned.length ? `${Math.round((plannedDone / planned.length) * 100)}%` : "0%" }]} /></View>
            <Text style={styles.planText}>{planned.length ? "Treinos atribuídos com data dentro do período escolhido." : "Nenhum treino do treinador com data neste período."}</Text>
          </View>
        </>
      )}
    </Screen>
  );
}

function HeroMetric({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.heroMetric}>
      <Text style={styles.heroMetricValue}>{value}</Text>
      <Text style={styles.heroMetricLabel}>{label}</Text>
    </View>
  );
}

function RecordCard({ icon, label, hint, value, tone }: { icon: RecordIcon; label: string; hint: string; value: string; tone: string }) {
  return (
    <View style={[styles.record, { backgroundColor: tone }]}>
      <View style={styles.recordIcon}><Ionicons name={icon} size={17} color={C.ink} /></View>
      <Text style={styles.recordValue}>{value}</Text>
      <Text style={styles.recordLabel}>{label}</Text>
      <Text style={styles.recordHint}>{hint}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 14 },
  gap: { height: 28 },
  gapNone: { height: 0 },
  selectorDesktop: { maxWidth: 440 },
  weekNote: { color: C.muted, fontSize: 11, fontWeight: "700", marginTop: 8 },
  split: { flexDirection: "row", alignItems: "flex-start", gap: 20 },
  side: { flex: 1, minWidth: 0, marginTop: 16 },
  heroDesktop: { flex: 1.35, minWidth: 0 },
  header: { paddingTop: 6, marginBottom: 18 },
  eyebrow: { color: C.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1.5, marginBottom: 5 },
  title: { color: C.ink, fontSize: 31, fontWeight: "900", letterSpacing: -1.1 },

  hero: { marginTop: 16, padding: 18, borderRadius: 24, backgroundColor: C.ink, boxShadow: "0px 16px 36px rgba(11, 23, 32, 0.22)" },
  heroTop: { marginBottom: 14 },
  heroEyebrow: { color: C.lime, fontSize: 10, fontWeight: "900", letterSpacing: 1.3, marginBottom: 6 },
  heroValueRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  heroValue: { color: C.white, fontSize: 34, lineHeight: 38, fontWeight: "900", letterSpacing: -1.2 },
  heroUnit: { color: "rgba(255,255,255,0.6)", fontSize: 16, fontWeight: "800", marginTop: 12, marginRight: 4 },
  heroRange: { color: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: "600", marginTop: 2 },
  heroMetrics: { flexDirection: "row", marginTop: 18, paddingTop: 16, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.1)" },
  heroMetric: { flex: 1, alignItems: "center", gap: 3 },
  heroMetricValue: { color: C.white, fontSize: 17, fontWeight: "900" },
  heroMetricLabel: { color: "rgba(255,255,255,0.55)", fontSize: 10, fontWeight: "700" },

  records: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  record: { flexBasis: "47%", flexGrow: 1, padding: 16, borderRadius: 22, gap: 4 },
  recordIcon: { width: 34, height: 34, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.7)", marginBottom: 10 },
  recordValue: { color: C.ink, fontSize: 20, fontWeight: "900", letterSpacing: -0.5 },
  recordLabel: { color: C.ink, fontSize: 12, fontWeight: "800" },
  recordHint: { color: C.inkSoft, fontSize: 11, lineHeight: 15, fontWeight: "600" },

  consistency: { flexDirection: "row", alignItems: "center", gap: 18, padding: 18, borderRadius: 24, backgroundColor: C.white, boxShadow: "0px 10px 24px rgba(11, 23, 32, 0.08)" },
  consistencyCopy: { flex: 1, gap: 6 },
  consistencyTitle: { color: C.ink, fontSize: 16, fontWeight: "900" },
  consistencyText: { color: C.inkSoft, fontSize: 13, lineHeight: 19, fontWeight: "600" },

  planCard: { padding: 18, borderRadius: 24, backgroundColor: C.sand, gap: 10 },
  planTop: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  planValue: { color: C.ink, fontSize: 26, fontWeight: "900", letterSpacing: -0.8 },
  planLabel: { color: C.inkSoft, fontSize: 13, fontWeight: "700" },
  planText: { color: C.inkSoft, fontSize: 12, lineHeight: 18, fontWeight: "600" },
  track: { height: 8, borderRadius: 8, overflow: "hidden", backgroundColor: "rgba(11,23,32,0.08)" },
  trackFill: { height: "100%", borderRadius: 8, backgroundColor: C.ink },

  emptyButton: { alignSelf: "stretch", marginTop: 8 },
});
