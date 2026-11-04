import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { formatDay, formatKm, formatPace } from "@/components/dashboard-ui";
import { C, Pill, PrimaryButton, Screen, SectionTitle } from "@/components/run-ui";
import { TrainingDashboard } from "@/components/training-dashboard";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";

function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
}

/** Date and greeting; the photo and brand live in the dark top bar. */
function Header() {
  const { user } = useAuth();
  const profile = trpc.account.profile.useQuery(undefined, { enabled: Boolean(user) });
  const name = profile.data?.name || user?.name || "";
  const firstName = name.split(" ")[0] || "corredor";
  const rawDate = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  const dateLabel = rawDate.charAt(0).toUpperCase() + rawDate.slice(1);
  return (
    <View style={styles.header}>
      <Text style={styles.headerDate}>{dateLabel}</Text>
      <Text style={styles.headerHello} numberOfLines={1}>{greeting()}, {firstName}</Text>
    </View>
  );
}

export default function TodayScreen() {
  const { user } = useAuth();
  return (
    <Screen scroll wide>
      <Header />
      {user?.role === "admin" ? <CoachToday /> : <AthleteToday />}
    </Screen>
  );
}

function AthleteToday() {
  const router = useRouter();
  const assignments = trpc.club.myAssignments.useQuery();
  const upcoming = assignments.data?.find((assignment) => assignment.status === "assigned");
  const weekStart = new Date();
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - 6);
  const weekAssignments = (assignments.data ?? []).filter((assignment) => new Date(`${assignment.scheduledDate}T00:00:00`) >= weekStart);
  const weekCompleted = weekAssignments.filter((assignment) => assignment.status === "completed").length;
  const stepMinutes = (upcoming?.steps ?? []).reduce((total, step) => total + (step.durationSeconds ?? 0), 0) / 60;
  const stepDistance = (upcoming?.steps ?? []).reduce((total, step) => total + (step.distanceMeters ?? 0), 0);
  const pace = upcoming?.steps.find((step) => step.targetPaceSecondsPerKm)?.targetPaceSecondsPerKm ?? null;

  const nextCard = (
    <>
      <View style={styles.nextCard}>
        <View style={styles.nextTop}>
          <Pill label={upcoming ? "PRÓXIMO TREINO" : "SUA AGENDA"} tone="lime" icon="flash" />
          {upcoming ? <Text style={styles.nextDate}>{formatDay(upcoming.scheduledDate)}</Text> : null}
        </View>
        <Text style={styles.nextTitle}>{upcoming?.title || "Aguardando o próximo treino"}</Text>
        <Text style={styles.nextText}>{upcoming?.objective || "Quando o treinador enviar um treino, os detalhes aparecem aqui."}</Text>
        {upcoming ? (
          <View style={styles.nextMetrics}>
            <NextMetric icon="time-outline" value={stepMinutes ? `${Math.round(stepMinutes)} min` : "—"} />
            <NextMetric icon="map-outline" value={stepDistance ? `${formatKm(stepDistance)} km` : "—"} />
            <NextMetric icon="speedometer-outline" value={pace ? `${formatPace(pace)} /km` : "livre"} />
            <NextMetric icon="list-outline" value={`${upcoming.steps.length} etapas`} />
          </View>
        ) : null}
        {weekAssignments.length ? (
          <View style={styles.planProgress}>
            <View style={styles.planProgressTop}>
              <Text style={styles.planProgressLabel}>Plano da semana</Text>
              <Text style={styles.planProgressValue}>{weekCompleted}/{weekAssignments.length} feitos</Text>
            </View>
            <View style={styles.track}><View style={[styles.trackFill, { width: `${Math.round((weekCompleted / weekAssignments.length) * 100)}%` }]} /></View>
          </View>
        ) : null}
        <PrimaryButton label={upcoming ? "Abrir meu treino" : "Ver meu clube"} icon="arrow-forward" onPress={() => router.push("/(tabs)/club")} style={styles.nextButton} />
      </View>
    </>
  );

  return <TrainingDashboard title="Seu painel" aside={nextCard} />;
}

function NextMetric({ icon, value }: { icon: "time-outline" | "map-outline" | "speedometer-outline" | "list-outline"; value: string }) {
  return (
    <View style={styles.nextMetric}>
      <Ionicons name={icon} size={14} color={C.lime} />
      <Text style={styles.nextMetricText}>{value}</Text>
    </View>
  );
}

function CoachToday() {
  const router = useRouter();
  const pending = trpc.club.pendingAthletes.useQuery();
  const athletes = trpc.club.athletes.useQuery();
  const feed = trpc.club.coachActivityFeed.useQuery();
  const workouts = trpc.club.workouts.useQuery();
  const toReview = (feed.data ?? []).filter((entry) => !entry.review);
  const nextAction = pending.data?.length
    ? { icon: "person-add" as const, title: "Aprovar novos alunos", text: `${pending.data.length} ${pending.data.length === 1 ? "pedido aguarda" : "pedidos aguardam"} sua revisão.` }
    : toReview.length
      ? { icon: "chatbubble-ellipses" as const, title: "Dar retorno aos alunos", text: `${toReview.length} ${toReview.length === 1 ? "treino aguarda" : "treinos aguardam"} sua avaliação.` }
      : { icon: "add-circle" as const, title: "Enviar o próximo treino", text: "Monte uma sessão por etapas e atribua a um aluno." };

  const classBlock = (
    <>
      <View style={styles.coachGrid}>
        <CoachTile icon="people" value={athletes.data?.length ?? 0} label="alunos" onPress={() => router.push("/(tabs)/club")} />
        <CoachTile icon="hourglass" value={pending.data?.length ?? 0} label="pedidos" hot={Boolean(pending.data?.length)} onPress={() => router.push("/(tabs)/club")} />
        <CoachTile icon="star" value={toReview.length} label="para avaliar" hot={toReview.length > 0} onPress={() => router.push("/(tabs)/club")} />
        <CoachTile icon="library" value={workouts.data?.length ?? 0} label="treinos" onPress={() => router.push("/(tabs)/plans")} />
      </View>

      <Pressable onPress={() => router.push("/(tabs)/club")} style={({ pressed }) => [styles.actionCard, pressed && styles.pressed]}>
        <View style={styles.actionIcon}><Ionicons name={nextAction.icon} size={20} color={C.ink} /></View>
        <View style={styles.actionCopy}>
          <Text style={styles.actionEyebrow}>PRÓXIMA AÇÃO</Text>
          <Text style={styles.actionTitle}>{nextAction.title}</Text>
          <Text style={styles.actionText}>{nextAction.text}</Text>
        </View>
        <Ionicons name="arrow-forward" size={20} color={C.ink} />
      </Pressable>

      {feed.data?.length ? (
        <>
          <View style={styles.gap} />
          <SectionTitle title="Atividade da turma" action="Ver turma" onPress={() => router.push("/(tabs)/club")} />
          <View style={styles.feed}>
            {feed.data.slice(0, 3).map(({ activity, athleteName, review }) => (
              <View key={activity.id} style={styles.feedRow}>
                <View style={[styles.feedDot, review ? styles.feedDotDone : styles.feedDotOpen]} />
                <View style={styles.actionCopy}>
                  <Text style={styles.feedTitle} numberOfLines={1}>{athleteName || "Aluno"} · {activity.title}</Text>
                  <Text style={styles.feedText}>{formatKm(activity.distanceMeters, 2)} km · {formatPace(activity.averagePaceSecondsPerKm)} /km · {review ? "avaliado" : "aguarda avaliação"}</Text>
                </View>
              </View>
            ))}
          </View>
        </>
      ) : null}
    </>
  );

  return <TrainingDashboard title="Seu treino" aside={classBlock} />;
}

function CoachTile({ icon, value, label, hot = false, onPress }: { icon: "people" | "hourglass" | "star" | "library"; value: number; label: string; hot?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.coachTile, hot && styles.coachTileHot, pressed && styles.pressed]}>
      <Ionicons name={icon} size={16} color={C.ink} />
      <Text style={styles.coachValue}>{value}</Text>
      <Text style={styles.coachLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
  gap: { height: 28 },

  header: { paddingTop: 4, marginBottom: 18 },
  headerDate: { color: C.muted, fontSize: 12, fontWeight: "700" },
  headerHello: { color: C.ink, fontSize: 22, lineHeight: 27, fontWeight: "900", letterSpacing: -0.6 },

  nextCard: { padding: 18, borderRadius: 24, backgroundColor: C.navy, boxShadow: "0px 16px 36px rgba(11, 23, 32, 0.2)" },
  nextTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  nextDate: { color: "rgba(255,255,255,0.65)", fontSize: 11, fontWeight: "800" },
  nextTitle: { color: C.white, fontSize: 22, lineHeight: 27, fontWeight: "900", letterSpacing: -0.6, marginTop: 14 },
  nextText: { color: "rgba(255,255,255,0.7)", fontSize: 13, lineHeight: 19, fontWeight: "600", marginTop: 6 },
  nextMetrics: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 16 },
  nextMetric: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.08)" },
  nextMetricText: { color: C.white, fontSize: 12, fontWeight: "800" },
  planProgress: { marginTop: 18, gap: 8 },
  planProgressTop: { flexDirection: "row", justifyContent: "space-between" },
  planProgressLabel: { color: "rgba(255,255,255,0.65)", fontSize: 12, fontWeight: "700" },
  planProgressValue: { color: C.white, fontSize: 12, fontWeight: "900" },
  track: { height: 8, borderRadius: 8, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.1)" },
  trackFill: { height: "100%", borderRadius: 8, backgroundColor: C.lime },
  nextButton: { marginTop: 16, minHeight: 48 },

  coachGrid: { flexDirection: "row", gap: 8, marginBottom: 12 },
  coachTile: { flex: 1, gap: 4, padding: 12, borderRadius: 18, backgroundColor: C.white, boxShadow: "0px 8px 20px rgba(11, 23, 32, 0.07)" },
  coachTileHot: { backgroundColor: C.lime },
  coachValue: { color: C.ink, fontSize: 24, lineHeight: 28, fontWeight: "900", letterSpacing: -0.6, marginTop: 4 },
  coachLabel: { color: C.inkSoft, fontSize: 10, fontWeight: "800" },

  actionCard: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16, borderRadius: 22, backgroundColor: C.sand },
  actionIcon: { width: 42, height: 42, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: C.lime },
  actionCopy: { flex: 1, gap: 2 },
  actionEyebrow: { color: C.inkSoft, fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  actionTitle: { color: C.ink, fontSize: 16, fontWeight: "900" },
  actionText: { color: C.inkSoft, fontSize: 12, fontWeight: "600" },

  feed: { gap: 8 },
  feedRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 18, backgroundColor: C.white, borderWidth: 1, borderColor: "#ECEDE6" },
  feedDot: { width: 10, height: 10, borderRadius: 5 },
  feedDotDone: { backgroundColor: C.limeDeep },
  feedDotOpen: { backgroundColor: C.coral },
  feedTitle: { color: C.ink, fontSize: 14, fontWeight: "800" },
  feedText: { color: C.muted, fontSize: 12, fontWeight: "600" },
});
