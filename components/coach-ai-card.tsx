import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { formatDay } from "@/components/dashboard-ui";
import { C } from "@/components/run-ui";
import { trpc } from "@/lib/trpc";
import type { AiWeekDay, AiWorkout } from "@/shared/coach-ai";

/**
 * The coach's AI helper on "Criar treino": drafts the next workout or a Monday-to-Sunday week from
 * the athlete's club history. Nothing is sent to the athlete here; a draft only fills the form.
 */
export function CoachAiCard({ athleteId, athleteName, date, onApply }: {
  athleteId: number | null;
  athleteName: string | null;
  date: string;
  onApply: (workout: AiWorkout, date: string) => void;
}) {
  const status = trpc.ai.status.useQuery();
  const suggestWorkout = trpc.ai.suggestWorkout.useMutation();
  const suggestWeek = trpc.ai.suggestWeek.useMutation();
  const [focus, setFocus] = useState("");
  const [week, setWeek] = useState<{ summary: string; days: AiWeekDay[] } | null>(null);
  const [message, setMessage] = useState("");
  const busy = suggestWorkout.isPending || suggestWeek.isPending;
  const request = { athleteId: athleteId ?? undefined, date, focus: focus.trim() || undefined };

  const draftWorkout = async () => {
    setMessage("");
    try {
      const workout = await suggestWorkout.mutateAsync(request);
      onApply(workout, date);
      setMessage("Rascunho preenchido no formulário abaixo. Revise antes de enviar.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A IA não respondeu agora.");
    }
  };

  const draftWeek = async () => {
    setMessage("");
    try {
      setWeek(await suggestWeek.mutateAsync(request));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A IA não respondeu agora.");
    }
  };

  if (status.data && !status.data.configured) {
    return (
      <View style={styles.card}>
        <Header />
        <Text style={styles.textMuted}>A IA está desligada: falta configurar a chave do Cohere no servidor.</Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Header />
      <Text style={styles.text}>
        {athleteName ? `Usa o histórico de ${athleteName} no clube e a sua biblioteca como estilo.` : "Sem aluno escolhido: a IA monta um treino genérico. Escolha o aluno no passo 3 para personalizar."}
      </Text>
      <TextInput
        value={focus}
        onChangeText={setFocus}
        placeholder="Foco (opcional): tiros curtos, longão leve, volta de lesão…"
        placeholderTextColor="rgba(255,255,255,0.45)"
        style={styles.input}
        accessibilityLabel="Foco do treino para a IA"
      />
      <View style={styles.actions}>
        <Pressable disabled={busy} onPress={draftWorkout} style={({ pressed }) => [styles.primary, busy && styles.disabled, pressed && styles.pressed]}>
          {suggestWorkout.isPending ? <ActivityIndicator color={C.ink} /> : <Ionicons name="flash" size={16} color={C.ink} />}
          <Text style={styles.primaryText}>Treino de {formatDay(date)}</Text>
        </Pressable>
        <Pressable disabled={busy} onPress={draftWeek} style={({ pressed }) => [styles.secondary, busy && styles.disabled, pressed && styles.pressed]}>
          {suggestWeek.isPending ? <ActivityIndicator color={C.lime} /> : <Ionicons name="calendar-outline" size={16} color={C.lime} />}
          <Text style={styles.secondaryText}>Plano da semana</Text>
        </Pressable>
      </View>
      {busy ? <Text style={styles.textMuted}>A IA está montando o rascunho… leva alguns segundos.</Text> : null}
      {message ? <Text accessibilityRole="alert" style={styles.message}>{message}</Text> : null}

      {week ? (
        <View style={styles.week}>
          {week.summary ? <Text style={styles.text}>{week.summary}</Text> : null}
          {week.days.map((day) => (
            <View key={day.date} style={styles.day}>
              <View style={styles.dayCopy}>
                <Text style={styles.dayDate}>{formatDay(day.date)}</Text>
                <Text style={styles.dayTitle} numberOfLines={1}>{day.workout?.title ?? "Descanso"}</Text>
                {day.workout ? <Text style={styles.textMuted} numberOfLines={2}>{day.workout.steps.map((step) => step.label).join(" → ")}</Text> : null}
              </View>
              {day.workout ? (
                <Pressable
                  onPress={() => { onApply(day.workout!, day.date); setMessage(`Treino de ${formatDay(day.date)} no formulário. Revise e envie; depois use o próximo dia.`); }}
                  style={({ pressed }) => [styles.use, pressed && styles.pressed]}
                  accessibilityLabel={`Usar o treino de ${formatDay(day.date)}`}
                >
                  <Text style={styles.useText}>Usar</Text>
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Header() {
  return (
    <View style={styles.header}>
      <View style={styles.badge}><Ionicons name="sparkles" size={15} color={C.ink} /></View>
      <Text style={styles.title}>Rascunho com IA</Text>
      <Text style={styles.hint}>você revisa e envia</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.6 },
  card: { padding: 18, borderRadius: 24, backgroundColor: C.ink, gap: 10, marginBottom: 14 },
  header: { flexDirection: "row", alignItems: "center", gap: 8 },
  badge: { width: 28, height: 28, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: C.lime },
  title: { color: C.white, fontSize: 15, fontWeight: "900" },
  hint: { marginLeft: "auto", color: "rgba(255,255,255,0.5)", fontSize: 11, fontWeight: "700" },
  text: { color: "rgba(255,255,255,0.8)", fontSize: 12, lineHeight: 18, fontWeight: "600" },
  textMuted: { color: "rgba(255,255,255,0.55)", fontSize: 11, lineHeight: 16, fontWeight: "600" },
  message: { color: C.lime, fontSize: 12, lineHeight: 18, fontWeight: "800" },
  input: { minHeight: 44, borderRadius: 13, paddingHorizontal: 13, color: C.white, backgroundColor: "rgba(255,255,255,0.08)", fontSize: 13, fontWeight: "600" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  primary: { flexGrow: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, minHeight: 46, paddingHorizontal: 14, borderRadius: 14, backgroundColor: C.lime },
  primaryText: { color: C.ink, fontSize: 13, fontWeight: "900" },
  secondary: { flexGrow: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, minHeight: 46, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: "rgba(215,247,82,0.5)" },
  secondaryText: { color: C.lime, fontSize: 13, fontWeight: "900" },
  week: { gap: 8, marginTop: 4 },
  day: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.06)" },
  dayCopy: { flex: 1, gap: 2 },
  dayDate: { color: C.lime, fontSize: 10, fontWeight: "900", letterSpacing: 0.4 },
  dayTitle: { color: C.white, fontSize: 14, fontWeight: "900" },
  use: { paddingHorizontal: 14, height: 34, borderRadius: 999, alignItems: "center", justifyContent: "center", backgroundColor: C.lime },
  useText: { color: C.ink, fontSize: 12, fontWeight: "900" },
});
