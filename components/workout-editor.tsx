import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { C } from "@/components/run-ui";
import type { AiWorkout, StepKind } from "@/shared/coach-ai";

export type WorkoutStepDraft = {
  kind: StepKind;
  label: string;
  durationMinutes: string;
  distanceKm: string;
  targetPace: string;
  instruction: string;
};
export type WorkoutDraft = { title: string; objective: string; description: string; steps: WorkoutStepDraft[] };

type SavedStep = { kind: StepKind; label: string; durationSeconds: number | null; distanceMeters: number | null; targetPaceSecondsPerKm: number | null; instruction: string | null };

const KINDS: { value: StepKind; label: string }[] = [
  { value: "warmup", label: "Aquecimento" },
  { value: "run", label: "Corrida" },
  { value: "recovery", label: "Recuperação" },
  { value: "cooldown", label: "Desaquecimento" },
];

// One tap adds a ready step the coach then tweaks, instead of filling every field from scratch.
const QUICK_STEPS: { label: string; step: WorkoutStepDraft }[] = [
  { label: "Aquecimento", step: { kind: "warmup", label: "Trote leve", durationMinutes: "10", distanceKm: "", targetPace: "", instruction: "" } },
  { label: "Corrida", step: { kind: "run", label: "Corrida leve", durationMinutes: "30", distanceKm: "", targetPace: "", instruction: "" } },
  { label: "Tiro", step: { kind: "run", label: "Tiro", durationMinutes: "", distanceKm: "0,4", targetPace: "", instruction: "" } },
  { label: "Recuperação", step: { kind: "recovery", label: "Caminhada", durationMinutes: "2", distanceKm: "", targetPace: "", instruction: "" } },
  { label: "Desaquecimento", step: { kind: "cooldown", label: "Trote solto", durationMinutes: "5", distanceKm: "", targetPace: "", instruction: "" } },
];

export const MAX_STEPS = 12;

export function emptyWorkoutDraft(): WorkoutDraft {
  return { title: "", objective: "", description: "", steps: [QUICK_STEPS[0].step, QUICK_STEPS[1].step, QUICK_STEPS[4].step].map((step) => ({ ...step })) };
}

function formatPace(seconds: number | null) {
  return seconds ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}` : "";
}

/** Saved steps (or an AI draft) as the editor's text fields. */
export function draftFromWorkout(workout: { title: string; objective: string; description?: string | null; steps: SavedStep[] }): WorkoutDraft {
  return {
    title: workout.title,
    objective: workout.objective,
    description: workout.description ?? "",
    steps: workout.steps.map((step) => ({
      kind: step.kind,
      label: step.label,
      durationMinutes: step.durationSeconds ? String(Math.round((step.durationSeconds / 60) * 10) / 10).replace(".", ",") : "",
      distanceKm: step.distanceMeters ? String(Math.round(step.distanceMeters / 100) / 10).replace(".", ",") : "",
      targetPace: formatPace(step.targetPaceSecondsPerKm),
      instruction: step.instruction ?? "",
    })),
  };
}

export const draftFromAi = (workout: AiWorkout) => draftFromWorkout(workout);

function parsePace(value: string): number | null {
  const match = /^(\d{1,2}):([0-5]\d)$/.exec(value.trim());
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** Validates the draft and converts it to the API's units. Throws an Error with a message for the coach. */
export function workoutInputFrom(draft: WorkoutDraft) {
  if (draft.title.trim().length < 2 || draft.objective.trim().length < 2) throw new Error("Preencha o nome e o objetivo do treino.");
  if (!draft.steps.length) throw new Error("Adicione pelo menos uma etapa.");
  const steps = draft.steps.map((step, index) => {
    const durationRaw = step.durationMinutes.trim().replace(",", ".");
    const distanceRaw = step.distanceKm.trim().replace(",", ".");
    const paceRaw = step.targetPace.trim();
    const durationSeconds = durationRaw ? Math.round(Number(durationRaw) * 60) : null;
    const distanceMeters = distanceRaw ? Math.round(Number(distanceRaw) * 1000) : null;
    const targetPaceSecondsPerKm = paceRaw ? parsePace(paceRaw) : null;
    const where = `Etapa ${index + 1}`;
    if (!step.label.trim()) throw new Error(`${where}: dê um nome à etapa.`);
    if (durationRaw && (!Number.isFinite(durationSeconds) || !durationSeconds || durationSeconds <= 0)) throw new Error(`${where}: use minutos maiores que zero.`);
    if (distanceRaw && (!Number.isFinite(distanceMeters) || !distanceMeters || distanceMeters <= 0)) throw new Error(`${where}: use quilômetros maiores que zero.`);
    if (paceRaw && !targetPaceSecondsPerKm) throw new Error(`${where}: escreva o ritmo como mm:ss, por exemplo 6:30.`);
    if (!durationSeconds && !distanceMeters) throw new Error(`${where}: informe minutos ou km.`);
    return { kind: step.kind, label: step.label.trim(), durationSeconds, distanceMeters, targetPaceSecondsPerKm, instruction: step.instruction.trim() || null };
  });
  return { title: draft.title.trim(), objective: draft.objective.trim(), description: draft.description.trim() || undefined, level: "Todos", steps };
}

/** New steps go before a trailing cooldown, so the workout still ends with it. */
function insertStep(steps: WorkoutStepDraft[], step: WorkoutStepDraft) {
  const at = step.kind !== "cooldown" && steps.at(-1)?.kind === "cooldown" ? steps.length - 1 : steps.length;
  return [...steps.slice(0, at), { ...step }, ...steps.slice(at)];
}

/** Name, goal and the steps of a workout, with quick-add, reorder, copy and remove for each step. */
export function WorkoutEditor({ value, onChange }: { value: WorkoutDraft; onChange: (draft: WorkoutDraft) => void }) {
  const setSteps = (steps: WorkoutStepDraft[]) => onChange({ ...value, steps });
  const patchStep = (index: number, patch: Partial<WorkoutStepDraft>) => setSteps(value.steps.map((step, position) => (position === index ? { ...step, ...patch } : step)));
  const move = (index: number, by: number) => {
    const target = index + by;
    if (target < 0 || target >= value.steps.length) return;
    const steps = [...value.steps];
    [steps[index], steps[target]] = [steps[target], steps[index]];
    setSteps(steps);
  };
  const full = value.steps.length >= MAX_STEPS;

  return (
    <View style={styles.editor}>
      <Text style={styles.label}>Nome do treino</Text>
      <TextInput value={value.title} onChangeText={(title) => onChange({ ...value, title })} placeholder="Ex.: Rodagem leve + educativos" placeholderTextColor={C.muted} style={styles.input} />
      <Text style={styles.label}>Objetivo</Text>
      <TextInput value={value.objective} onChangeText={(objective) => onChange({ ...value, objective })} placeholder="Ex.: Construir constância sem forçar" placeholderTextColor={C.muted} style={styles.input} />
      <Text style={styles.label}>Orientações gerais (opcional)</Text>
      <TextInput value={value.description} onChangeText={(description) => onChange({ ...value, description })} placeholder="Contexto e dicas para o aluno" placeholderTextColor={C.muted} multiline style={[styles.input, styles.multiline]} />

      <View style={styles.stepsHeader}>
        <Text style={styles.section}>Etapas</Text>
        <Text style={styles.muted}>{value.steps.length}/{MAX_STEPS}</Text>
      </View>

      {value.steps.map((step, index) => (
        <View key={index} style={styles.step}>
          <View style={styles.stepTop}>
            <View style={styles.stepNumber}><Text style={styles.stepNumberText}>{index + 1}</Text></View>
            <View style={styles.stepTools}>
              <IconButton icon="arrow-up" label={`Subir etapa ${index + 1}`} disabled={index === 0} onPress={() => move(index, -1)} />
              <IconButton icon="arrow-down" label={`Descer etapa ${index + 1}`} disabled={index === value.steps.length - 1} onPress={() => move(index, 1)} />
              <IconButton icon="copy-outline" label={`Duplicar etapa ${index + 1}`} disabled={full} onPress={() => setSteps([...value.steps.slice(0, index + 1), { ...step }, ...value.steps.slice(index + 1)])} />
              <IconButton icon="trash-outline" label={`Remover etapa ${index + 1}`} disabled={value.steps.length === 1} onPress={() => setSteps(value.steps.filter((_, position) => position !== index))} />
            </View>
          </View>
          <View style={styles.kinds}>
            {KINDS.map((kind) => (
              <Pressable key={kind.value} onPress={() => patchStep(index, { kind: kind.value })} style={[styles.kind, step.kind === kind.value && styles.kindOn]}>
                <Text style={[styles.kindText, step.kind === kind.value && styles.kindTextOn]}>{kind.label}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput value={step.label} onChangeText={(label) => patchStep(index, { label })} placeholder="Nome da etapa" placeholderTextColor={C.muted} style={styles.input} accessibilityLabel={`Nome da etapa ${index + 1}`} />
          <View style={styles.row}>
            <Field label="Minutos" value={step.durationMinutes} onChange={(durationMinutes) => patchStep(index, { durationMinutes })} placeholder="min" numeric />
            <Field label="Km" value={step.distanceKm} onChange={(distanceKm) => patchStep(index, { distanceKm })} placeholder="km" numeric />
            <Field label="Ritmo /km" value={step.targetPace} onChange={(targetPace) => patchStep(index, { targetPace })} placeholder="livre" />
          </View>
          <TextInput value={step.instruction} onChangeText={(instruction) => patchStep(index, { instruction })} placeholder="Instrução para o aluno (opcional)" placeholderTextColor={C.muted} multiline style={[styles.input, styles.multiline]} accessibilityLabel={`Instrução da etapa ${index + 1}`} />
        </View>
      ))}

      {!full ? (
        <View style={styles.quick}>
          <Text style={styles.muted}>Adicionar etapa:</Text>
          <View style={styles.kinds}>
            {QUICK_STEPS.map((quick) => (
              <Pressable key={quick.label} onPress={() => setSteps(insertStep(value.steps, quick.step))} style={({ pressed }) => [styles.quickButton, pressed && styles.pressed]}>
                <Ionicons name="add" size={14} color={C.ink} />
                <Text style={styles.kindText}>{quick.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function Field({ label, value, onChange, placeholder, numeric = false }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; numeric?: boolean }) {
  return (
    <View style={styles.field}>
      <Text style={styles.caption}>{label}</Text>
      <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={C.muted} keyboardType={numeric ? "decimal-pad" : "default"} style={styles.input} accessibilityLabel={label} />
    </View>
  );
}

function IconButton({ icon, label, disabled, onPress }: { icon: "arrow-up" | "arrow-down" | "copy-outline" | "trash-outline"; label: string; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable disabled={disabled} onPress={onPress} accessibilityLabel={label} style={({ pressed }) => [styles.iconButton, disabled && styles.disabled, pressed && styles.pressed]}>
      <Ionicons name={icon} size={16} color={C.ink} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.3 },
  editor: { gap: 8 },
  label: { color: C.ink, fontSize: 11, fontWeight: "900", marginTop: 6 },
  section: { color: C.ink, fontSize: 15, fontWeight: "900" },
  muted: { color: C.muted, fontSize: 11, fontWeight: "700" },
  input: { minHeight: 44, borderWidth: 1, borderColor: C.line, borderRadius: 13, paddingHorizontal: 12, paddingVertical: 9, color: C.ink, backgroundColor: C.white, fontSize: 13, fontWeight: "600" },
  multiline: { minHeight: 58, textAlignVertical: "top" },
  stepsHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12 },
  step: { gap: 8, padding: 12, borderRadius: 16, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line },
  stepTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  stepNumber: { width: 26, height: 26, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: C.ink },
  stepNumberText: { color: C.lime, fontSize: 12, fontWeight: "900" },
  stepTools: { flexDirection: "row", gap: 4 },
  iconButton: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: C.white, borderWidth: 1, borderColor: C.line },
  kinds: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  kind: { minHeight: 32, justifyContent: "center", paddingHorizontal: 11, borderRadius: 999, borderWidth: 1, borderColor: C.line, backgroundColor: C.white },
  kindOn: { borderColor: C.ink, backgroundColor: C.ink },
  kindText: { color: C.ink, fontSize: 11, fontWeight: "800" },
  kindTextOn: { color: C.white },
  row: { flexDirection: "row", gap: 8 },
  field: { flex: 1, gap: 3 },
  caption: { color: C.muted, fontSize: 10, fontWeight: "800" },
  quick: { gap: 6, marginTop: 4 },
  quickButton: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 34, paddingHorizontal: 11, borderRadius: 999, backgroundColor: C.lime },
});
