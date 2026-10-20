import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { C, Pill, PrimaryButton, Row, Screen, SectionTitle } from "@/components/run-ui";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";

export default function PlansScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const isCoach = user?.role === "admin";
  const workouts = trpc.club.workouts.useQuery(undefined, { enabled: isCoach });
  const assignments = trpc.club.myAssignments.useQuery(undefined, { enabled: !isCoach });
  const loading = isCoach ? workouts.isLoading : assignments.isLoading;
  const nextAssignment = assignments.data?.find((assignment) => assignment.status === "assigned");
  if (loading) return <Screen><View style={styles.empty}><Text style={styles.currentText}>Carregando seu plano…</Text></View></Screen>;

  return <Screen scroll>
    <View style={styles.header}><View><Text style={styles.eyebrow}>{isCoach ? "TREINADOR" : "SEU CAMINHO"}</Text><Text style={styles.title}>{isCoach ? "Biblioteca" : "Planos"}</Text></View><View style={styles.compass}><Ionicons name="compass" size={21} color={C.ink} /></View></View>

    <View style={styles.currentPlan}><View style={styles.currentTop}><Pill label={isCoach ? "TREINOS CRIADOS" : nextAssignment ? "PRÓXIMO TREINO" : "AGUARDANDO"} tone="lime" /><Text style={styles.week}>{isCoach ? `${workouts.data?.length ?? 0} NA BIBLIOTECA` : nextAssignment?.scheduledDate || "SEU CLUBE"}</Text></View><Text style={styles.currentTitle}>{isCoach ? "Planos feitos por você" : nextAssignment?.title || "Aguardando seu treinador"}</Text><Text style={styles.currentText}>{isCoach ? "Monte uma sessão por etapas e atribua a um aluno aprovado." : nextAssignment?.objective || "Os treinos atribuídos aparecerão aqui, com as etapas e orientações do seu treinador."}</Text><View style={styles.currentStats}><View><Text style={styles.statValue}>{isCoach ? workouts.data?.length ?? 0 : nextAssignment?.steps.length ?? 0}</Text><Text style={styles.statLabel}>{isCoach ? "treinos" : "etapas"}</Text></View><View><Text style={styles.statValue}>{isCoach ? "Alunos" : nextAssignment?.status === "completed" ? "Feito" : nextAssignment ? "Aberto" : "—"}</Text><Text style={styles.statLabel}>{isCoach ? "aprovados" : "estado"}</Text></View><View><Text style={styles.statValue}>{isCoach ? "Clube" : "Agenda"}</Text><Text style={styles.statLabel}>{isCoach ? "atribuições" : "pessoal"}</Text></View></View><PrimaryButton label={isCoach ? "Criar ou atribuir treino" : "Abrir Meu clube"} icon="arrow-forward" onPress={() => router.push("/(tabs)/club")} style={styles.currentButton} /></View>

    <View style={styles.gap} />
    <SectionTitle title={isCoach ? "Treinos criados" : "Treinos atribuídos"} />
    {isCoach ? workouts.data?.length ? <View style={styles.planList}>{workouts.data.map((workout, index) => <PlanCard key={workout.id} color={index % 2 ? C.sand : C.sky} icon={index % 2 ? "flag" : "walk"} title={workout.title} detail={workout.objective} meta={`${workout.steps.length} etapa(s) · ${workout.level}`} onPress={() => router.push("/(tabs)/club")} />)}</View> : <View style={styles.empty}><Text style={styles.emptyTitle}>Sua biblioteca está vazia</Text><Text style={styles.currentText}>Crie o primeiro treino e envie para um aluno aprovado.</Text></View> : assignments.data?.length ? <View style={styles.planList}>{assignments.data.map((assignment, index) => <PlanCard key={assignment.id} color={index % 2 ? C.sand : C.sky} icon={assignment.status === "completed" ? "flag" : "walk"} title={assignment.title} detail={assignment.objective} meta={`${assignment.scheduledDate} · ${assignment.status === "completed" ? "concluído" : "atribuído"}`} onPress={() => router.push("/(tabs)/club")} />)}</View> : <View style={styles.empty}><Text style={styles.emptyTitle}>Nenhum treino enviado ainda</Text><Text style={styles.currentText}>Quando seu treinador atribuir uma sessão, ela aparecerá aqui.</Text></View>}

    <View style={styles.gap} />
    <SectionTitle title="O que guia cada plano" />
    <View style={styles.guideCard}><Row icon="heart-outline" title="Esforço sustentável" detail="Intensidade ajustada ao seu momento." /><Row icon="calendar-outline" title="Rotina que cabe" detail="Treinos adaptáveis à sua semana." /><Row icon="sparkles-outline" title="Orientação clara" detail="Cada passo tem um porquê, sem jargão." /></View>
  </Screen>;
}

function PlanCard({ color, icon, title, detail, meta, onPress }: { color: string; icon: "walk" | "flag" | "pulse"; title: string; detail: string; meta: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.planCard, { backgroundColor: color }, pressed && styles.pressed]}><View style={styles.planIcon}><Ionicons name={icon} size={21} color={C.ink} /></View><View style={styles.planCopy}><Text style={styles.planTitle}>{title}</Text><Text style={styles.planDetail}>{detail}</Text><Text style={styles.planMeta}>{meta}</Text></View><Ionicons name="arrow-forward" size={19} color={C.ink} /></Pressable>;
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 4, marginBottom: 22 },
  eyebrow: { color: C.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1.5, marginBottom: 5 },
  title: { color: C.ink, fontSize: 31, fontWeight: "900", letterSpacing: -1.1 },
  compass: { width: 43, height: 43, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: C.lime },
  currentPlan: { padding: 20, borderRadius: 28, backgroundColor: C.ink },
  currentTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  week: { color: "rgba(255,255,255,0.62)", fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
  currentTitle: { color: C.white, fontSize: 26, lineHeight: 30, fontWeight: "900", letterSpacing: -0.8, marginTop: 22 },
  currentText: { color: "rgba(255,255,255,0.72)", fontSize: 13, lineHeight: 19, fontWeight: "600", marginTop: 6 },
  currentStats: { flexDirection: "row", justifyContent: "space-between", marginTop: 22 },
  statValue: { color: C.white, fontSize: 16, fontWeight: "900" },
  statLabel: { color: "rgba(255,255,255,0.58)", fontSize: 10, fontWeight: "700", marginTop: 3 },
  currentButton: { marginTop: 22 },
  gap: { height: 30 },
  planList: { gap: 12 },
  planCard: { minHeight: 128, flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 16, borderRadius: 23 },
  planIcon: { width: 39, height: 39, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: C.white },
  planCopy: { flex: 1, gap: 3 },
  planTitle: { color: C.ink, fontSize: 16, fontWeight: "900" },
  planDetail: { color: C.inkSoft, fontSize: 12, lineHeight: 17, fontWeight: "600" },
  planMeta: { color: C.ink, fontSize: 10, fontWeight: "900", letterSpacing: 0.25, marginTop: 5 },
  guideCard: { paddingHorizontal: 16, borderRadius: 22, backgroundColor: C.white, borderWidth: 1, borderColor: C.line },
  empty: { padding: 18, borderRadius: 20, backgroundColor: C.white, borderWidth: 1, borderColor: C.line, gap: 6 },
  emptyTitle: { color: C.ink, fontSize: 15, fontWeight: "900" },
  pressed: { opacity: 0.75 },
});
