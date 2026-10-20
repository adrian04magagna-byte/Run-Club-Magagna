import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";

import { C, IconCircle, Pill, RouteSpark, Screen } from "@/components/run-ui";
import { MemberGate } from "@/components/member-gate";

export default function ActivityScreen() {
  const router = useRouter();
  const [isRunning, setIsRunning] = useState(true);
  const [seconds, setSeconds] = useState(15 * 60 + 42);

  useEffect(() => {
    if (!isRunning) return;
    const timer = setInterval(() => setSeconds((current) => current + 1), 1000);
    return () => clearInterval(timer);
  }, [isRunning]);

  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const remainder = (seconds % 60).toString().padStart(2, "0");

  return <MemberGate><Screen edges={["top", "left", "right", "bottom"]}>
    <StatusBar style="light" />
    <View style={styles.shell}>
      <View style={styles.top}><IconCircle name="chevron-down" dark onPress={() => router.back()} /><Pill label="DEMO VISUAL" tone="lime" icon="information-circle-outline" /><IconCircle name="volume-high-outline" dark /></View>
      <View style={styles.demoNotice}><Text style={styles.demoNoticeText}>Simulação visual: o cronômetro fica nesta tela; distância, ritmo e frequência são ilustrativos. Não há GPS nem gravação real aqui. Registre atividades em Meu clube.</Text></View>
      <View style={styles.phase}><Text style={styles.phaseLabel}>ETAPA ATUAL</Text><Text style={styles.phaseTitle}>Corrida leve</Text><Text style={styles.phaseSub}>Mantenha uma conversa possível.</Text></View>
      <View style={styles.timerBlock}><Text style={styles.timer}>{minutes}:{remainder}</Text><Text style={styles.timerLabel}>TEMPO DE ATIVIDADE</Text></View>
      <View style={styles.route}><RouteSpark light height={106} /></View>
      <View style={styles.metrics}><MetricCell value="2,34" unit="km" label="DISTÂNCIA" /><View style={styles.metricLine} /><MetricCell value="6:43" unit="/km" label="RITMO" /><View style={styles.metricLine} /><MetricCell value="142" unit="bpm" label="FREQUÊNCIA" /></View>
      <View style={styles.controls}><Pressable onPress={() => router.replace("/summary")} style={({ pressed }) => [styles.stopButton, pressed && styles.pressed]}><Ionicons name="stop" size={20} color={C.white} /></Pressable><Pressable onPress={() => setIsRunning((current) => !current)} style={({ pressed }) => [styles.pauseButton, pressed && styles.pressed]}><Ionicons name={isRunning ? "pause" : "play"} size={30} color={C.ink} /></Pressable><Pressable style={({ pressed }) => [styles.controlSide, pressed && styles.pressed]}><Ionicons name="flag-outline" size={21} color={C.white} /></Pressable></View>
      <Text style={styles.controlHint}>{isRunning ? "Toque no centro para pausar" : "Retome quando estiver pronto"}</Text>
    </View>
  </Screen></MemberGate>;
}

function MetricCell({ value, unit, label }: { value: string; unit: string; label: string }) {
  return <View style={styles.metricCell}><View style={styles.metricValueRow}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricUnit}>{unit}</Text></View><Text style={styles.metricLabel}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: C.ink, paddingHorizontal: 20, paddingTop: 5, paddingBottom: 22 },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  phase: { alignItems: "center", marginTop: 36 },
  phaseLabel: { color: C.lime, fontSize: 10, fontWeight: "900", letterSpacing: 1.6 },
  phaseTitle: { color: C.white, fontSize: 27, fontWeight: "900", letterSpacing: -0.8, marginTop: 8 },
  phaseSub: { color: "rgba(255,255,255,0.63)", fontSize: 13, fontWeight: "600", marginTop: 4 },
  timerBlock: { alignItems: "center", marginTop: 31 },
  timer: { color: C.white, fontSize: 62, lineHeight: 68, fontWeight: "900", letterSpacing: -2.8, fontVariant: ["tabular-nums"] },
  timerLabel: { color: "rgba(255,255,255,0.53)", fontSize: 10, fontWeight: "900", letterSpacing: 1.4, marginTop: 4 },
  route: { height: 119, justifyContent: "center", marginTop: 5 },
  metrics: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 18, borderTopWidth: 1, borderBottomWidth: 1, borderColor: "rgba(255,255,255,0.14)" },
  metricCell: { flex: 1, gap: 4 },
  metricValueRow: { flexDirection: "row", alignItems: "baseline", gap: 2 },
  metricValue: { color: C.white, fontSize: 22, lineHeight: 26, fontWeight: "900", letterSpacing: -0.8, fontVariant: ["tabular-nums"] },
  metricUnit: { color: C.lime, fontSize: 10, fontWeight: "800" },
  metricLabel: { color: "rgba(255,255,255,0.53)", fontSize: 8, fontWeight: "900", letterSpacing: 0.6 },
  metricLine: { height: 32, width: 1, backgroundColor: "rgba(255,255,255,0.14)" },
  controls: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 27, marginTop: "auto" },
  stopButton: { width: 53, height: 53, alignItems: "center", justifyContent: "center", borderRadius: 20, borderWidth: 1, borderColor: "rgba(255,255,255,0.24)" },
  pauseButton: { width: 88, height: 88, alignItems: "center", justifyContent: "center", borderRadius: 33, backgroundColor: C.lime },
  controlSide: { width: 53, height: 53, alignItems: "center", justifyContent: "center", borderRadius: 20, borderWidth: 1, borderColor: "rgba(255,255,255,0.24)" },
  controlHint: { color: "rgba(255,255,255,0.55)", textAlign: "center", fontSize: 11, fontWeight: "700", marginTop: 14 },
  demoNotice: { padding: 10, borderRadius: 13, backgroundColor: "rgba(215,247,82,0.14)", borderWidth: 1, borderColor: "rgba(215,247,82,0.35)", marginTop: 15 },
  demoNoticeText: { color: "rgba(255,255,255,0.82)", fontSize: 10, lineHeight: 15, fontWeight: "700", textAlign: "center" },
  pressed: { opacity: 0.72, transform: [{ scale: 0.96 }] },
});
