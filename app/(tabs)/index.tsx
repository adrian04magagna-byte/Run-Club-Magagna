import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { AppMark, C, CoachNote, IconCircle, Metric, MiniBarChart, Pill, PrimaryButton, RouteSpark, Screen, SectionTitle } from "@/components/run-ui";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";

export default function TodayScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const isCoach = user?.role === "admin";
  const assignments = trpc.club.myAssignments.useQuery(undefined, { enabled: !isCoach });
  const activities = trpc.club.myActivities.useQuery(undefined, { enabled: !isCoach });
  const pending = trpc.club.pendingAthletes.useQuery(undefined, { enabled: isCoach });
  const athletes = trpc.club.athletes.useQuery(undefined, { enabled: isCoach });
  const feed = trpc.club.coachActivityFeed.useQuery(undefined, { enabled: isCoach });

  if (isCoach) {
    return <Screen scroll>
      <View style={styles.topbar}><View style={styles.brandRow}><AppMark size={38} /><Text style={styles.brand}>Run Club Magagna</Text></View><IconCircle name="person-outline" onPress={() => router.push("/(tabs)/profile")} /></View>
      <View style={styles.welcome}><View><Text style={styles.eyebrow}>PAINEL DO TREINADOR</Text><Text style={styles.title}>Bom ter você{ "\n" }por aqui.</Text></View><View style={styles.avatar}><Text style={styles.avatarText}>{(user?.name || "R").slice(0, 1).toUpperCase()}</Text></View></View>
      <View style={styles.coachStats}><View style={styles.coachStat}><Text style={styles.coachStatValue}>{athletes.data?.length ?? 0}</Text><Text style={styles.coachStatLabel}>alunos</Text></View><View style={styles.coachStat}><Text style={styles.coachStatValue}>{pending.data?.length ?? 0}</Text><Text style={styles.coachStatLabel}>pedidos</Text></View><View style={styles.coachStat}><Text style={styles.coachStatValue}>{feed.data?.filter((entry) => !entry.review).length ?? 0}</Text><Text style={styles.coachStatLabel}>para avaliar</Text></View></View>
      <View style={styles.spacing} />
      <SectionTitle title="Próxima ação" />
      <View style={styles.coachActionCard}><View style={styles.goalIcon}><Ionicons name="people" size={21} color={C.ink} /></View><View style={styles.goalCopy}><Text style={styles.goalTitle}>{pending.data?.length ? "Aprovar novos alunos" : "Acompanhar sua turma"}</Text><Text style={styles.goalDetail}>{pending.data?.length ? `${pending.data.length} pedido(s) aguardando sua revisão.` : "Crie e envie o próximo treino pelo Clube."}</Text></View></View>
      <PrimaryButton label="Abrir gestão da turma" icon="arrow-forward" onPress={() => router.push("/(tabs)/club")} style={styles.openWorkout} />
      <View style={styles.spacing} />
      <SectionTitle title="Atividade recente" action="Ver turma" onPress={() => router.push("/(tabs)/club")} />
      {feed.data?.slice(0, 3).length ? feed.data.slice(0, 3).map(({ activity, athleteName, review }) => <View key={activity.id} style={styles.recentCard}><Pill label={review ? "AVALIADO" : "AGUARDA AVALIAÇÃO"} tone={review ? "lime" : "coral"} /><View style={styles.recentCopy}><Text style={styles.goalTitle}>{athleteName || "Aluno"} · {activity.title}</Text><Text style={styles.goalDetail}>{(activity.distanceMeters / 1000).toFixed(2)} km · {Math.floor(activity.durationSeconds / 60)} min</Text></View></View>) : <CoachNote label="TURMA">Quando seus alunos registrarem uma atividade, ela aparecerá aqui para você avaliar.</CoachNote>}
    </Screen>;
  }

  const upcoming = assignments.data?.find((assignment) => assignment.status === "assigned");
  const weekStart = new Date();
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - 6);
  const recentActivities = (activities.data ?? []).filter((activity) => new Date(activity.completedAt) >= weekStart);
  const weekAssignments = (assignments.data ?? []).filter((assignment) => new Date(`${assignment.scheduledDate}T00:00:00`) >= weekStart);
  const weekCompleted = weekAssignments.filter((assignment) => assignment.status === "completed").length;
  const weekDistance = recentActivities.reduce((total, activity) => total + activity.distanceMeters, 0) / 1000;
  const stepMinutes = (upcoming?.steps ?? []).reduce((total, step) => total + (step.durationSeconds ?? 0), 0) / 60;
  const stepDistance = (upcoming?.steps ?? []).reduce((total, step) => total + (step.distanceMeters ?? 0), 0) / 1000;
  const paceSeconds = upcoming?.steps.find((step) => step.targetPaceSecondsPerKm)?.targetPaceSecondsPerKm;
  const paceLabel = paceSeconds ? `${Math.floor(paceSeconds / 60)}:${String(paceSeconds % 60).padStart(2, "0")}` : "—";
  const chartValues = Array.from({ length: 7 }, (_, offset) => {
    const day = new Date();
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - (6 - offset));
    const km = recentActivities.filter((activity) => new Date(activity.completedAt).toDateString() === day.toDateString()).reduce((total, activity) => total + activity.distanceMeters, 0) / 1000;
    return Math.round(Math.min(100, km * 18));
  });
  const dateLabel = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" }).toLocaleUpperCase("pt-BR");

  return (
    <Screen scroll>
      <View style={styles.topbar}>
        <View style={styles.brandRow}><AppMark size={38} /><Text style={styles.brand}>Run Club Magagna</Text></View>
        <IconCircle name="notifications-outline" onPress={() => router.push("/(tabs)/profile")} />
      </View>

      <View style={styles.welcome}><View><Text style={styles.eyebrow}>{dateLabel}</Text><Text style={styles.title}>Seu ritmo,{"\n"}seu momento.</Text></View><View style={styles.avatar}><Text style={styles.avatarText}>{(user?.name || "R").slice(0, 1).toUpperCase()}</Text></View></View>

      <View style={styles.todayCard}>
        <View style={styles.cardGlow} />
        <View style={styles.todayHeader}><Pill label={upcoming ? "PRÓXIMO TREINO" : "SUA AGENDA"} tone="lime" icon="flash" /><Text style={styles.level}>{upcoming ? upcoming.scheduledDate : "CLUBE"}</Text></View>
        <View style={styles.todayCopy}><Text style={styles.todayName}>{upcoming?.title || "Seu plano começa com o treinador"}</Text><Text style={styles.todayDescription}>{upcoming?.objective || "Quando ele atribuir seu primeiro treino, os detalhes vão aparecer aqui."}</Text></View>
        <RouteSpark light height={74} />
        <View style={styles.todayFooter}><View style={styles.metrics}><Metric value={stepMinutes ? `${Math.round(stepMinutes)} min` : "—"} label="duração" reverse /><Metric value={stepDistance ? `${stepDistance.toFixed(1)} km` : "—"} label="distância" reverse /><Metric value={paceLabel} label="ritmo alvo" reverse /></View><View style={styles.play}><Ionicons name="play" size={20} color={C.ink} /></View></View>
        <PrimaryButton label={upcoming ? "Abrir meu treino" : "Abrir meu clube"} icon="arrow-forward" onPress={() => router.push("/(tabs)/club")} style={styles.openWorkout} />
      </View>

      <View style={styles.spacing} />
      <SectionTitle title="Sua semana" action="Detalhes" onPress={() => router.push("/(tabs)/progress")} />
      <View style={styles.weekCard}><View style={styles.weekCopy}><Text style={styles.weekValue}>{weekCompleted}</Text><Text style={styles.weekText}>treinos concluídos · 7 dias</Text><View style={styles.progressTrack}><View style={[styles.progressFill, { width: weekAssignments.length ? `${Math.round((weekCompleted / weekAssignments.length) * 100)}%` : "0%" }]} /></View><Text style={styles.weekCaption}>{weekDistance.toFixed(1)} km registrados nesta semana</Text></View><MiniBarChart values={chartValues} highlightIndex={6} /></View>

      <View style={styles.spacing} />
      <CoachNote>{upcoming ? "Siga as etapas e instruções que seu treinador preparou. Depois, registre como foi para receber um retorno." : "Seu treinador ainda não atribuiu um treino. Abra Meu clube para acompanhar sua agenda e histórico."}</CoachNote>

      <View style={styles.spacing} />
      <SectionTitle title="Próxima conquista" />
      <View style={styles.goalCard}><View style={styles.goalIcon}><Ionicons name="flag" size={21} color={C.ink} /></View><View style={styles.goalCopy}><Text style={styles.goalTitle}>{upcoming ? "Seu próximo passo" : "Um plano feito para você"}</Text><Text style={styles.goalDetail}>{upcoming ? upcoming.objective : "O treinador vai definir a próxima etapa do seu percurso."}</Text></View><Ionicons name="chevron-forward" size={19} color={C.muted} /></View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 4, marginBottom: 27 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  brand: { color: C.ink, fontSize: 20, fontWeight: "900", letterSpacing: -0.9 },
  welcome: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 23 },
  eyebrow: { color: C.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1.45, marginBottom: 7 },
  title: { color: C.ink, fontSize: 31, lineHeight: 35, fontWeight: "900", letterSpacing: -1.1 },
  avatar: { width: 42, height: 42, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: C.coral, marginTop: 4 },
  avatarText: { color: C.white, fontSize: 16, fontWeight: "900" },
  todayCard: { minHeight: 375, overflow: "hidden", borderRadius: 29, padding: 20, backgroundColor: C.ink },
  cardGlow: { position: "absolute", width: 260, height: 260, borderRadius: 150, right: -92, top: 65, backgroundColor: "#1A3946" },
  todayHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  level: { color: "rgba(255,255,255,0.6)", fontSize: 9, fontWeight: "900", letterSpacing: 0.85 },
  todayCopy: { marginTop: 23, gap: 7 },
  todayName: { color: C.white, fontSize: 30, lineHeight: 32, fontWeight: "900", letterSpacing: -1 },
  todayDescription: { color: "rgba(255,255,255,0.69)", maxWidth: 245, fontSize: 13, lineHeight: 18, fontWeight: "600" },
  todayFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
  metrics: { flex: 1, flexDirection: "row", justifyContent: "space-between", paddingRight: 16 },
  play: { width: 48, height: 48, borderRadius: 18, backgroundColor: C.lime, alignItems: "center", justifyContent: "center", paddingLeft: 2 },
  openWorkout: { marginTop: 18 },
  spacing: { height: 29 },
  weekCard: { minHeight: 147, flexDirection: "row", alignItems: "flex-end", gap: 14, padding: 18, borderRadius: 23, backgroundColor: C.white, borderWidth: 1, borderColor: C.line },
  weekCopy: { width: "58%", gap: 3 },
  weekValue: { color: C.ink, fontSize: 27, fontWeight: "900", letterSpacing: -0.9 },
  weekText: { color: C.muted, fontSize: 12, fontWeight: "700" },
  progressTrack: { height: 7, borderRadius: 9, overflow: "hidden", backgroundColor: C.stone, marginTop: 12, marginBottom: 3 },
  progressFill: { width: "67%", height: "100%", borderRadius: 9, backgroundColor: C.limeDeep },
  weekCaption: { color: C.inkSoft, fontSize: 11, lineHeight: 15, fontWeight: "700" },
  goalCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderRadius: 20, backgroundColor: C.sand },
  goalIcon: { width: 38, height: 38, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: C.lime },
  goalCopy: { flex: 1, gap: 3 },
  goalTitle: { color: C.ink, fontSize: 14, fontWeight: "900" },
  goalDetail: { color: C.muted, fontSize: 12, fontWeight: "600" },
  coachStats: { flexDirection: "row", gap: 9 },
  coachStat: { flex: 1, minHeight: 92, justifyContent: "center", paddingHorizontal: 14, borderRadius: 19, backgroundColor: C.white, borderWidth: 1, borderColor: C.line },
  coachStatValue: { color: C.ink, fontSize: 25, fontWeight: "900" },
  coachStatLabel: { color: C.muted, fontSize: 11, fontWeight: "700", marginTop: 3 },
  coachActionCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderRadius: 20, backgroundColor: C.sand },
  recentCard: { minHeight: 66, flexDirection: "row", alignItems: "center", gap: 10, padding: 13, marginBottom: 8, borderRadius: 17, backgroundColor: C.white, borderWidth: 1, borderColor: C.line },
  recentCopy: { flex: 1, gap: 4 },
});
