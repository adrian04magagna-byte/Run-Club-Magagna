import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { C, CoachNote, Metric, MiniBarChart, Pill, ProgressRing, Screen, SectionTitle } from "@/components/run-ui";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";

export default function ProgressScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const isCoach = user?.role === "admin";
  const ownActivities = trpc.club.myActivities.useQuery(undefined, { enabled: !isCoach });
  const assignments = trpc.club.myAssignments.useQuery(undefined, { enabled: !isCoach });
  const coachFeed = trpc.club.coachActivityFeed.useQuery(undefined, { enabled: isCoach });
  const allActivities = isCoach ? (coachFeed.data ?? []).map((item) => item.activity) : (ownActivities.data ?? []);
  const weekStart = new Date();
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - 6);
  const weekActivities = allActivities.filter((activity) => new Date(activity.completedAt) >= weekStart);
  const weekMeters = weekActivities.reduce((total, activity) => total + activity.distanceMeters, 0);
  const weekSeconds = weekActivities.reduce((total, activity) => total + activity.durationSeconds, 0);
  const averagePace = weekMeters ? Math.round((weekSeconds * 1000) / weekMeters) : null;
  const paceLabel = averagePace ? `${Math.floor(averagePace / 60)}:${String(averagePace % 60).padStart(2, "0")} / km` : "—";
  const weekAssignments = (assignments.data ?? []).filter((assignment) => new Date(`${assignment.scheduledDate}T00:00:00`) >= weekStart);
  const completedAssignments = weekAssignments.filter((assignment) => assignment.status === "completed").length;
  const coachReviewed = (coachFeed.data ?? []).filter((item) => item.review).length;
  const completion = isCoach
    ? coachFeed.data?.length ? coachReviewed / coachFeed.data.length : 0
    : weekAssignments.length ? completedAssignments / weekAssignments.length : 0;
  const chartValues = Array.from({ length: 7 }, (_, index) => {
    const day = new Date();
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - (6 - index));
    const meters = weekActivities.filter((activity) => new Date(activity.completedAt).toDateString() === day.toDateString()).reduce((total, activity) => total + activity.distanceMeters, 0);
    return Math.min(100, Math.round(meters / 1000 * 20));
  });
  const dayLabels = Array.from({ length: 7 }, (_, index) => {
    const day = new Date();
    day.setDate(day.getDate() - (6 - index));
    return day.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "").slice(0, 3).toUpperCase();
  });
  const loading = isCoach ? coachFeed.isLoading : ownActivities.isLoading || assignments.isLoading;
  if (loading) return <Screen><View style={styles.emptyProgress}><Text style={styles.paceText}>Carregando suas atividades…</Text></View></Screen>;

  return <Screen scroll>
    <View style={styles.header}><View><Text style={styles.eyebrow}>{isCoach ? "MOVIMENTO DA TURMA" : "SEU RITMO"}</Text><Text style={styles.title}>Progresso</Text></View><Pill label="7 DIAS" tone="dark" /></View>

    <View style={styles.hero}><View style={styles.heroTop}><View><Text style={styles.heroEyebrow}>{isCoach ? "ATIVIDADES COMPARTILHADAS" : "SEUS REGISTROS"}</Text><Text style={styles.heroTitle}>{isCoach ? "Acompanhamento\ncom contexto." : "Cada treino\nconta."}</Text></View><ProgressRing value={completion} label={`${Math.round(completion * 100)}%`} sublabel={isCoach ? "AVALIADO" : "CONCLUÍDO"} size={118} /></View><View style={styles.heroMetrics}><Metric value={`${(weekMeters / 1000).toFixed(1)} km`} label="em 7 dias" reverse /><View style={styles.divider} /><Metric value={`${isCoach ? coachReviewed : completedAssignments}`} label={isCoach ? "avaliados" : "concluídos"} reverse /><View style={styles.divider} /><Metric value={`${weekActivities.length}`} label="atividades" reverse /></View></View>

    <View style={styles.gap} />
    <SectionTitle title="Movimento dos últimos 7 dias" />
    <View style={styles.chartCard}><View style={styles.chartTop}><View><Text style={styles.chartValue}>{(weekMeters / 1000).toFixed(1)} km</Text><Text style={styles.chartLabel}>distância registrada</Text></View><Pill label={`${weekActivities.length} ${weekActivities.length === 1 ? "atividade" : "atividades"}`} tone="lime" icon="footsteps" /></View><MiniBarChart values={chartValues} highlightIndex={6} /><View style={styles.days}>{dayLabels.map((day, index) => <Text key={`${day}-${index}`} style={styles.day}>{day}</Text>)}</View></View>

    <View style={styles.gap} />
    <SectionTitle title={isCoach ? "Ritmo médio compartilhado" : "Ritmo médio registrado"} />
    <View style={styles.paceCard}><View style={styles.paceOrb}><Ionicons name="speedometer-outline" size={25} color={C.ink} /></View><View style={styles.paceCopy}><Text style={styles.paceValue}>{paceLabel}</Text><Text style={styles.paceText}>{weekActivities.length ? "Cálculo com as atividades registradas nos últimos sete dias; use a percepção de esforço junto com o ritmo." : "Quando você registrar sua primeira atividade, o ritmo médio aparecerá aqui."}</Text></View></View>

    <View style={styles.gap} />
    <CoachNote label={isCoach ? "LEITURA DA TURMA" : "LEITURA DA SEMANA"}>{isCoach ? `${(coachFeed.data ?? []).filter((item) => !item.review).length} atividade(s) compartilhada(s) aguardam sua avaliação.` : weekAssignments.length ? `Você concluiu ${completedAssignments} de ${weekAssignments.length} treino(s) atribuído(s) nesta semana.` : "Quando seu treinador atribuir sessões e você registrar as corridas, o resumo semanal será calculado aqui."}</CoachNote>

    <View style={styles.gap} />
    <View style={styles.milestone}><View style={styles.milestoneTop}><Text style={styles.milestoneEyebrow}>{isCoach ? "REVISÃO" : "PRÓXIMO PASSO"}</Text><Pill label={isCoach ? `${(coachFeed.data ?? []).filter((item) => !item.review).length} PENDENTES` : "SEU PLANO"} tone="coral" /></View><Text style={styles.milestoneTitle}>{isCoach ? "Dar retorno aos alunos" : "Acompanhar o plano atribuído"}</Text><Text style={styles.milestoneText}>{isCoach ? "Avaliações e comentários ficam associados à atividade de cada atleta." : "A agenda mostra o treino, as etapas e as avaliações do treinador."}</Text><View style={styles.milestoneFooter}><Text style={styles.milestoneProgress}>{isCoach ? `${coachReviewed} avaliadas` : `${(weekMeters / 1000).toFixed(1)} km registrados`}</Text><Text onPress={() => router.push("/(tabs)/club")} style={styles.planLink}>{isCoach ? "Abrir turma" : "Meu clube"}</Text></View></View>
  </Screen>;
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 4, marginBottom: 22 },
  eyebrow: { color: C.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1.5, marginBottom: 5 },
  title: { color: C.ink, fontSize: 31, fontWeight: "900", letterSpacing: -1.1 },
  hero: { padding: 20, borderRadius: 28, backgroundColor: C.ink },
  heroTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  heroEyebrow: { color: C.lime, fontSize: 10, fontWeight: "900", letterSpacing: 1.25, marginBottom: 8 },
  heroTitle: { color: C.white, fontSize: 23, lineHeight: 27, fontWeight: "900", letterSpacing: -0.7 },
  heroMetrics: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 24 },
  divider: { height: 31, width: 1, backgroundColor: "rgba(255,255,255,0.17)" },
  gap: { height: 29 },
  chartCard: { padding: 18, borderRadius: 23, backgroundColor: C.white, borderWidth: 1, borderColor: C.line },
  chartTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 },
  chartValue: { color: C.ink, fontSize: 27, fontWeight: "900", letterSpacing: -0.8 },
  chartLabel: { color: C.muted, fontSize: 12, fontWeight: "700", marginTop: 2 },
  days: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  day: { color: C.muted, fontSize: 9, fontWeight: "800", width: "14.28%", textAlign: "center" },
  paceCard: { flexDirection: "row", gap: 14, padding: 17, borderRadius: 22, backgroundColor: C.sand },
  paceOrb: { width: 44, height: 44, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: C.lime },
  paceCopy: { flex: 1, gap: 4 },
  paceValue: { color: C.ink, fontSize: 17, fontWeight: "900" },
  paceText: { color: C.inkSoft, fontSize: 12, lineHeight: 17, fontWeight: "600" },
  milestone: { padding: 20, borderRadius: 25, backgroundColor: C.sky },
  milestoneTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  milestoneEyebrow: { color: C.ink, fontSize: 10, fontWeight: "900", letterSpacing: 1.25 },
  milestoneTitle: { color: C.ink, fontSize: 23, fontWeight: "900", letterSpacing: -0.6 },
  milestoneText: { color: C.inkSoft, fontSize: 13, lineHeight: 19, fontWeight: "600", marginTop: 5 },
  milestoneFooter: { flexDirection: "row", justifyContent: "space-between", marginTop: 18 },
  milestoneProgress: { color: C.ink, fontSize: 12, fontWeight: "800" },
  planLink: { color: C.ink, fontSize: 12, fontWeight: "900", textDecorationLine: "underline" },
  emptyProgress: { flex: 1, alignItems: "center", justifyContent: "center", minHeight: 220 },
});
