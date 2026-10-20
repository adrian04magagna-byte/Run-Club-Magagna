import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { BackButton, C, CoachNote, Metric, Pill, PrimaryButton, RouteSpark, Screen, SectionTitle } from "@/components/run-ui";
import { MemberGate } from "@/components/member-gate";

export default function WorkoutDetailsScreen() {
  const router = useRouter();
  return <MemberGate><Screen scroll edges={["top", "left", "right", "bottom"]}>
    <BackButton onPress={() => router.back()} />
    <View style={styles.prototypeNotice}><Text style={styles.prototypeNoticeText}>DEMONSTRAÇÃO VISUAL · treino de exemplo; os treinos atribuídos ficam em Meu clube.</Text></View>
    <View style={styles.hero}><View style={styles.heroTop}><Pill label="SEMANA 3 · TREINO 2" tone="lime" /><Ionicons name="headset-outline" size={22} color={C.white} /></View><Text style={styles.heroTitle}>Base em{`\n`}movimento</Text><Text style={styles.heroText}>Uma corrida leve para desenvolver confiança e deixar o corpo pedindo mais.</Text><RouteSpark light height={85} /><View style={styles.metrics}><Metric value="35 min" label="duração" reverse /><Metric value="4,8 km" label="estimado" reverse /><Metric value="6:55" label="ritmo alvo" reverse /></View></View>

    <View style={styles.gap} />
    <SectionTitle title="Como vamos correr" />
    <View style={styles.steps}>
      <Step number="01" title="Aqueça com calma" detail="5 min de caminhada acelerada. Ombros soltos e respiração confortável." tone="sky" />
      <Step number="02" title="Encontre o seu leve" detail="25 min de corrida contínua. Você deve conseguir falar frases curtas." tone="lime" />
      <Step number="03" title="Desacelere" detail="5 min caminhando para encerrar com sensação de energia sobrando." tone="sand" last />
    </View>

    <View style={styles.gap} />
    <CoachNote>Não persiga um número no relógio hoje. Se o ritmo parecer pesado, diminua um pouco e preserve a leveza.</CoachNote>

    <View style={styles.gap} />
    <View style={styles.infoCard}><View style={styles.infoRow}><Ionicons name="musical-notes-outline" size={18} color={C.ink} /><Text style={styles.infoTitle}>Áudio do treinador</Text><Text style={styles.infoDetail}>Ativado</Text></View><View style={styles.infoRow}><Ionicons name="location-outline" size={18} color={C.ink} /><Text style={styles.infoTitle}>Distância guiada</Text><Text style={styles.infoDetail}>Opcional</Text></View></View>

    <PrimaryButton label="Começar treino" icon="play" onPress={() => router.replace("/activity")} style={styles.start} />
    <Text style={styles.footerNote}>Você pode pausar ou encerrar quando precisar.</Text>
  </Screen></MemberGate>;
}

function Step({ number, title, detail, tone, last = false }: { number: string; title: string; detail: string; tone: "sky" | "lime" | "sand"; last?: boolean }) {
  const backgroundColor = tone === "sky" ? C.sky : tone === "lime" ? C.lime : C.sand;
  return <View style={styles.stepRow}><View style={styles.stepRail}><View style={[styles.stepNumber, { backgroundColor }]}><Text style={styles.stepNumberText}>{number}</Text></View>{!last ? <View style={styles.rail} /> : null}</View><View style={styles.stepCopy}><Text style={styles.stepTitle}>{title}</Text><Text style={styles.stepDetail}>{detail}</Text></View></View>;
}

const styles = StyleSheet.create({
  hero: { padding: 21, overflow: "hidden", borderRadius: 29, backgroundColor: C.ink },
  heroTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heroTitle: { color: C.white, fontSize: 31, lineHeight: 34, fontWeight: "900", letterSpacing: -1, marginTop: 24 },
  heroText: { color: "rgba(255,255,255,0.7)", fontSize: 13, lineHeight: 19, fontWeight: "600", marginTop: 7, maxWidth: 290 },
  metrics: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  gap: { height: 29 },
  steps: { gap: 0 },
  stepRow: { minHeight: 99, flexDirection: "row", gap: 14 },
  stepRail: { alignItems: "center", width: 37 },
  stepNumber: { width: 37, height: 37, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  stepNumberText: { color: C.ink, fontSize: 11, fontWeight: "900" },
  rail: { flex: 1, width: 1, backgroundColor: C.line, marginVertical: 7 },
  stepCopy: { flex: 1, paddingTop: 7, gap: 4 },
  stepTitle: { color: C.ink, fontSize: 16, fontWeight: "900" },
  stepDetail: { color: C.muted, fontSize: 12, lineHeight: 18, fontWeight: "600" },
  infoCard: { paddingHorizontal: 16, borderRadius: 22, backgroundColor: C.white, borderWidth: 1, borderColor: C.line },
  infoRow: { minHeight: 55, flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: 1, borderBottomColor: C.line },
  infoTitle: { flex: 1, color: C.ink, fontSize: 13, fontWeight: "800" },
  infoDetail: { color: C.muted, fontSize: 12, fontWeight: "700" },
  start: { marginTop: 28 },
  footerNote: { color: C.muted, textAlign: "center", fontSize: 11, fontWeight: "600", marginTop: 11 },
  prototypeNotice: { padding: 11, borderRadius: 13, backgroundColor: C.sand, marginBottom: 12 },
  prototypeNoticeText: { color: C.ink, fontSize: 10, lineHeight: 15, fontWeight: "800" },
});
