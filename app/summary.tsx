import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { AppMark, C, CoachNote, Pill, PrimaryButton, Screen, SectionTitle } from "@/components/run-ui";
import { MemberGate } from "@/components/member-gate";

export default function SummaryScreen() {
  const router = useRouter();
  return <MemberGate><Screen scroll edges={["top", "left", "right", "bottom"]}>
    <View style={styles.top}><AppMark inverse size={42} /><Pill label="DEMO VISUAL" tone="lime" /></View>
    <View style={styles.demoNotice}><Text style={styles.demoNoticeText}>Exemplo de interface: estes números e avaliações não correspondem a uma atividade registrada. Para guardar sua corrida, use o formulário em Meu clube.</Text></View>
    <View style={styles.hero}><Text style={styles.eyebrow}>MAIS UM PASSO</Text><Text style={styles.title}>Visual de um{`\n`}resumo de treino.</Text><Text style={styles.subtitle}>Este resumo é ilustrativo; ainda não está conectado ao GPS ou ao registro de atividades.</Text></View>
    <View style={styles.results}><Result icon="timer-outline" value="35:18" label="tempo total" /><Result icon="footsteps-outline" value="4,82" label="quilômetros" /><Result icon="speedometer-outline" value="6:43" label="ritmo médio" /></View>
    <View style={styles.badge}><View style={styles.badgeIcon}><Ionicons name="ribbon" size={20} color={C.ink} /></View><View><Text style={styles.badgeTitle}>Semana no caminho</Text><Text style={styles.badgeText}>Você completou 3 de 3 treinos.</Text></View></View>

    <View style={styles.gap} />
    <SectionTitle title="Como esse treino pareceu?" />
    <View style={styles.feelings}><Feeling icon="happy-outline" label="Leve" selected /><Feeling icon="pulse-outline" label="Desafiador" /><Feeling icon="flame-outline" label="Intenso" /></View>

    <View style={styles.gap} />
    <CoachNote label="PARA GUARDAR">Seu ritmo ficou estável do início ao fim. Esse é um ótimo sinal de que sua base está ficando mais forte.</CoachNote>

    <View style={styles.gap} />
    <View style={styles.next}><Text style={styles.nextEyebrow}>PRÓXIMO TREINO</Text><Text style={styles.nextTitle}>Descanso ativo</Text><Text style={styles.nextText}>20 minutos de caminhada leve ou mobilidade. Seu plano já considera a recuperação.</Text></View>
    <PrimaryButton label="Voltar para hoje" icon="home" onPress={() => router.replace("/(tabs)")} style={styles.button} />
  </Screen></MemberGate>;
}

function Result({ icon, value, label }: { icon: "timer-outline" | "footsteps-outline" | "speedometer-outline"; value: string; label: string }) {
  return <View style={styles.result}><Ionicons name={icon} size={18} color={C.ink} /><Text style={styles.resultValue}>{value}</Text><Text style={styles.resultLabel}>{label}</Text></View>;
}

function Feeling({ icon, label, selected = false }: { icon: "happy-outline" | "pulse-outline" | "flame-outline"; label: string; selected?: boolean }) {
  return <View style={[styles.feeling, selected && styles.feelingSelected]}><Ionicons name={icon} size={21} color={C.ink} /><Text style={styles.feelingLabel}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 4 },
  hero: { marginTop: 32 },
  eyebrow: { color: C.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1.5, marginBottom: 8 },
  title: { color: C.ink, fontSize: 31, lineHeight: 35, fontWeight: "900", letterSpacing: -1.1 },
  subtitle: { color: C.inkSoft, fontSize: 14, lineHeight: 20, fontWeight: "600", marginTop: 9, maxWidth: 320 },
  results: { flexDirection: "row", gap: 8, marginTop: 27 },
  result: { flex: 1, minHeight: 116, alignItems: "flex-start", justifyContent: "center", padding: 13, borderRadius: 20, backgroundColor: C.white, borderWidth: 1, borderColor: C.line },
  resultValue: { color: C.ink, fontSize: 19, fontWeight: "900", letterSpacing: -0.6, marginTop: 12 },
  resultLabel: { color: C.muted, fontSize: 10, fontWeight: "700", marginTop: 3 },
  badge: { flexDirection: "row", alignItems: "center", gap: 12, padding: 15, borderRadius: 20, backgroundColor: C.sand, marginTop: 13 },
  badgeIcon: { width: 38, height: 38, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: C.lime },
  badgeTitle: { color: C.ink, fontSize: 14, fontWeight: "900" },
  badgeText: { color: C.inkSoft, fontSize: 12, fontWeight: "600", marginTop: 3 },
  gap: { height: 30 },
  feelings: { flexDirection: "row", gap: 9 },
  feeling: { flex: 1, alignItems: "center", gap: 7, paddingVertical: 13, borderRadius: 19, backgroundColor: C.white, borderWidth: 1, borderColor: C.line },
  feelingSelected: { backgroundColor: C.lime, borderColor: C.lime },
  feelingLabel: { color: C.ink, fontSize: 10, fontWeight: "800", textAlign: "center" },
  next: { padding: 18, borderRadius: 23, backgroundColor: C.sky },
  nextEyebrow: { color: C.ink, fontSize: 10, fontWeight: "900", letterSpacing: 1.25, marginBottom: 8 },
  nextTitle: { color: C.ink, fontSize: 19, fontWeight: "900" },
  nextText: { color: C.inkSoft, fontSize: 12, lineHeight: 18, fontWeight: "600", marginTop: 5 },
  button: { marginTop: 22 },
  demoNotice: { padding: 12, borderRadius: 14, backgroundColor: C.sand, marginTop: 15 },
  demoNoticeText: { color: C.ink, fontSize: 11, lineHeight: 16, fontWeight: "700" },
});
