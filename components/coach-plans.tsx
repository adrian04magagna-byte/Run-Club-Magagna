import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { CoachAiCard } from "@/components/coach-ai-card";
import { EmptyState, Segmented, formatDay } from "@/components/dashboard-ui";
import { ProfileAvatar } from "@/components/profile-avatar";
import { AppHeader, C, Screen } from "@/components/run-ui";
import { WorkoutEditor, draftFromAi, draftFromWorkout, emptyWorkoutDraft, workoutInputFrom, type WorkoutDraft } from "@/components/workout-editor";
import { localToday } from "@/hooks/use-insights";
import { trpc } from "@/lib/trpc";
import { addDays, startOfWeek } from "@/shared/insights";

type Tab = "agenda" | "library";
type Editing = { mode: "new" } | { mode: "edit"; workoutId: number; pendingCount: number };
const WEEKDAYS = ["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"];

const shortDay = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;
const errorText = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);

/**
 * The coach's plan hub: a Monday-to-Sunday agenda of what was sent to each athlete (move or remove a
 * send) and the workout library (create, edit, copy, send, delete). Every action is one or two taps.
 */
export function CoachPlans() {
  const utils = trpc.useUtils();
  const today = localToday();
  const [tab, setTab] = useState<Tab>("agenda");
  const [weekFrom, setWeekFrom] = useState(startOfWeek(today));
  const [athleteFilter, setAthleteFilter] = useState<number | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [draft, setDraft] = useState<WorkoutDraft>(emptyWorkoutDraft());
  const [sendDate, setSendDate] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [target, setTarget] = useState<number | null>(null);
  const [targetDate, setTargetDate] = useState(today);
  const { novoPara } = useLocalSearchParams<{ novoPara?: string }>();
  const [handledRequest, setHandledRequest] = useState<string | undefined>();
  const router = useRouter();

  const athletes = trpc.club.athletes.useQuery();
  const workouts = trpc.club.workouts.useQuery();
  const agenda = trpc.club.coachAssignments.useQuery({ from: weekFrom, to: addDays(weekFrom, 6) });
  const refresh = () => Promise.all([utils.club.workouts.invalidate(), utils.club.coachAssignments.invalidate(), utils.club.athletes.invalidate(), utils.club.clubAthletes.invalidate(), utils.club.athleteDetail.invalidate()]);
  const createWorkout = trpc.club.createWorkout.useMutation({ onSuccess: refresh });
  const createAndAssign = trpc.club.createAndAssignWorkout.useMutation({ onSuccess: refresh });
  const updateWorkout = trpc.club.updateWorkout.useMutation({ onSuccess: refresh });

  const openEditor = (next: Editing, value: WorkoutDraft, athleteId: number | null = null) => {
    setNotice("");
    setDraft(value);
    setTarget(athleteId);
    setTargetDate(today);
    setEditing(next);
  };

  // The athlete sheet opens the editor already aimed at that athlete; the link is then cleared so it can be used again.
  if (novoPara !== handledRequest) {
    setHandledRequest(novoPara);
    if (novoPara) openEditor({ mode: "new" }, emptyWorkoutDraft(), Number(novoPara));
  }
  useEffect(() => {
    if (novoPara) router.setParams({ novoPara: undefined });
  }, [novoPara, router]);

  const save = async () => {
    setNotice("");
    try {
      const input = workoutInputFrom(draft);
      if (editing?.mode === "edit") await updateWorkout.mutateAsync({ ...input, workoutId: editing.workoutId });
      else if (target) await createAndAssign.mutateAsync({ ...input, athleteId: target, scheduledDate: targetDate });
      else await createWorkout.mutateAsync(input);
      setEditing(null);
      setTab(target && editing?.mode === "new" ? "agenda" : "library");
      if (target && editing?.mode === "new") setWeekFrom(startOfWeek(targetDate));
      setNotice(editing?.mode === "edit" ? "Treino atualizado." : target ? `Treino salvo e enviado para ${formatDay(targetDate)}.` : "Treino salvo na biblioteca.");
    } catch (error) {
      setNotice(errorText(error, "Não foi possível salvar o treino."));
    }
  };

  if (editing) {
    const saving = createWorkout.isPending || createAndAssign.isPending || updateWorkout.isPending;
    const chosen = athletes.data?.find((athlete) => athlete.userId === target) ?? null;
    return (
      <Screen scroll>
        <Pressable onPress={() => { setEditing(null); setNotice(""); }} style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
          <Ionicons name="arrow-back" size={18} color={C.ink} />
          <Text style={styles.backText}>Voltar sem salvar</Text>
        </Pressable>
        <AppHeader eyebrow="BIBLIOTECA" title={editing.mode === "edit" ? "Editar treino" : "Novo treino"} />
        {editing.mode === "new" ? <CoachAiCard athleteId={target} athleteName={chosen ? chosen.name || chosen.email : null} date={targetDate} onApply={(workout, date) => { setDraft(draftFromAi(workout)); setTargetDate(date); }} /> : null}
        {editing.mode === "edit" && editing.pendingCount ? (
          <View style={styles.warning}>
            <Ionicons name="information-circle" size={18} color={C.ink} />
            <Text style={styles.warningText}>{editing.pendingCount} {editing.pendingCount === 1 ? "envio pendente usa" : "envios pendentes usam"} este treino: a mudança vale para eles também.</Text>
          </View>
        ) : null}
        <View style={styles.card}><WorkoutEditor value={draft} onChange={setDraft} /></View>
        {editing.mode === "new" && athletes.data?.length ? (
          <View style={[styles.card, styles.target]}>
            <Text style={styles.label}>Enviar para (opcional)</Text>
            <Text style={styles.muted}>Sem aluno, o treino fica só na biblioteca.</Text>
            <View style={styles.chips}>
              {athletes.data.map((athlete) => (
                <Pressable key={athlete.userId} onPress={() => setTarget(target === athlete.userId ? null : athlete.userId)} style={[styles.athleteChip, target === athlete.userId && styles.chipOn]}>
                  <ProfileAvatar uri={athlete.avatarUrl} name={athlete.name || athlete.email} size={22} />
                  <Text style={[styles.chipText, target === athlete.userId && styles.chipTextOn]}>{athlete.name || athlete.email}</Text>
                </Pressable>
              ))}
            </View>
            {target ? <>
              <Text style={styles.label}>Quando</Text>
              <DayPicker key={targetDate} today={today} initialWeek={startOfWeek(targetDate)} value={targetDate} onPick={setTargetDate} />
            </> : null}
          </View>
        ) : null}
        {notice ? <Text accessibilityRole="alert" style={styles.notice}>{notice}</Text> : null}
        <Pressable disabled={saving} onPress={save} style={({ pressed }) => [styles.primary, saving && styles.disabled, pressed && styles.pressed]}>
          {saving ? <ActivityIndicator color={C.ink} /> : <Ionicons name="checkmark" size={18} color={C.ink} />}
          <Text style={styles.primaryText}>{editing.mode === "edit" ? "Salvar alterações" : chosen ? `Salvar e enviar para ${formatDay(targetDate)}` : "Salvar na biblioteca"}</Text>
        </Pressable>
      </Screen>
    );
  }

  const pendingThisWeek = (agenda.data ?? []).filter((item) => item.status === "assigned").length;

  return (
    <Screen scroll>
      <AppHeader
        eyebrow="TREINADOR"
        title="Planos"
        right={
          <Pressable onPress={() => openEditor({ mode: "new" }, emptyWorkoutDraft())} style={({ pressed }) => [styles.newButton, pressed && styles.pressed]}>
            <Ionicons name="add" size={18} color={C.ink} />
            <Text style={styles.newText}>Novo treino</Text>
          </Pressable>
        }
      />
      <Segmented<Tab>
        value={tab}
        onChange={(value) => { setTab(value); setNotice(""); }}
        options={[
          { value: "agenda", label: "Agenda", badge: pendingThisWeek || undefined },
          { value: "library", label: `Biblioteca · ${workouts.data?.length ?? 0}` },
        ]}
      />
      <View style={styles.gapSmall} />
      {notice ? <Text accessibilityRole="alert" style={styles.notice}>{notice}</Text> : null}

      {tab === "agenda" ? (
        <Agenda
          today={today}
          weekFrom={weekFrom}
          setWeekFrom={setWeekFrom}
          athletes={athletes.data ?? []}
          athleteFilter={athleteFilter}
          setAthleteFilter={setAthleteFilter}
          items={agenda.data}
          loading={agenda.isLoading}
          onPlan={(date) => { setSendDate(date); setTab("library"); setNotice(`Escolha um treino e toque em Enviar para ${formatDay(date)}.`); }}
          onNotice={setNotice}
        />
      ) : (
        <Library
          today={today}
          sendDate={sendDate}
          athletes={athletes.data ?? []}
          workouts={workouts.data}
          loading={workouts.isLoading}
          onEdit={(workout) => openEditor({ mode: "edit", workoutId: workout.id, pendingCount: workout.pendingCount }, draftFromWorkout(workout))}
          onNotice={setNotice}
        />
      )}
    </Screen>
  );
}

type Athlete = { userId: number; name: string | null; email: string | null; avatarUrl?: string | null };
type AgendaItem = { id: number; scheduledDate: string; status: string; title: string; athleteId: number; athleteName: string; athleteAvatarUrl: string | null };

function Agenda({ today, weekFrom, setWeekFrom, athletes, athleteFilter, setAthleteFilter, items, loading, onPlan, onNotice }: {
  today: string;
  weekFrom: string;
  setWeekFrom: (date: string) => void;
  athletes: Athlete[];
  athleteFilter: number | null;
  setAthleteFilter: (id: number | null) => void;
  items: AgendaItem[] | undefined;
  loading: boolean;
  onPlan: (date: string) => void;
  onNotice: (text: string) => void;
}) {
  const utils = trpc.useUtils();
  const refresh = () => Promise.all([utils.club.coachAssignments.invalidate(), utils.club.workouts.invalidate()]);
  const reschedule = trpc.club.rescheduleAssignment.useMutation({ onSuccess: refresh });
  const remove = trpc.club.removeAssignment.useMutation({ onSuccess: refresh });
  const [moving, setMoving] = useState<number | null>(null);
  const [confirming, setConfirming] = useState<number | null>(null);
  const visible = (items ?? []).filter((item) => athleteFilter === null || item.athleteId === athleteFilter);

  const moveTo = async (id: number, date: string) => {
    try {
      await reschedule.mutateAsync({ assignmentId: id, scheduledDate: date });
      setMoving(null);
      onNotice(`Treino remarcado para ${formatDay(date)}.`);
    } catch (error) {
      onNotice(errorText(error, "Não foi possível remarcar."));
    }
  };

  const removeSend = async (id: number) => {
    try {
      await remove.mutateAsync({ assignmentId: id });
      setConfirming(null);
      onNotice("Envio removido. O aluno não verá mais este treino.");
    } catch (error) {
      onNotice(errorText(error, "Não foi possível remover."));
    }
  };

  return (
    <View>
      <WeekNav weekFrom={weekFrom} today={today} onChange={setWeekFrom} />
      {athletes.length > 1 ? (
        <View style={styles.chips}>
          <Chip label="Todos" active={athleteFilter === null} onPress={() => setAthleteFilter(null)} />
          {athletes.map((athlete) => <Chip key={athlete.userId} label={(athlete.name || athlete.email || "Aluno").split(" ")[0]} active={athleteFilter === athlete.userId} onPress={() => setAthleteFilter(athlete.userId)} />)}
        </View>
      ) : null}
      {loading ? <ActivityIndicator color={C.ink} style={styles.loading} /> : null}

      {WEEKDAYS.map((weekday, index) => {
        const date = addDays(weekFrom, index);
        const dayItems = visible.filter((item) => item.scheduledDate === date);
        const past = date < today;
        return (
          <View key={date} style={[styles.day, date === today && styles.dayToday]}>
            <View style={styles.dayHeader}>
              <Text style={styles.dayName}>{weekday} {shortDay(date)}</Text>
              {date === today ? <Text style={styles.todayTag}>HOJE</Text> : null}
              {!past ? (
                <Pressable onPress={() => onPlan(date)} accessibilityLabel={`Enviar treino para ${formatDay(date)}`} style={({ pressed }) => [styles.dayAdd, pressed && styles.pressed]}>
                  <Ionicons name="add" size={15} color={C.ink} />
                  <Text style={styles.dayAddText}>Treino</Text>
                </Pressable>
              ) : null}
            </View>
            {dayItems.length ? dayItems.map((item) => {
              const done = item.status === "completed";
              return (
                <View key={item.id} style={styles.send}>
                  <View style={styles.sendTop}>
                    <ProfileAvatar uri={item.athleteAvatarUrl} name={item.athleteName} size={30} />
                    <View style={styles.flex}>
                      <Text style={styles.sendTitle} numberOfLines={1}>{item.title}</Text>
                      <Text style={styles.muted} numberOfLines={1}>{item.athleteName}</Text>
                    </View>
                    <View style={[styles.status, done ? styles.statusDone : styles.statusOpen]}><Text style={styles.statusText}>{done ? "Feito" : "Pendente"}</Text></View>
                  </View>
                  {!done ? (
                    <View style={styles.actions}>
                      <Action icon="calendar-outline" label={moving === item.id ? "Fechar" : "Mudar dia"} onPress={() => { setConfirming(null); setMoving(moving === item.id ? null : item.id); }} />
                      <Action icon="trash-outline" label={confirming === item.id ? "Toque de novo para remover" : "Remover"} danger={confirming === item.id} onPress={() => (confirming === item.id ? removeSend(item.id) : (setMoving(null), setConfirming(item.id)))} />
                    </View>
                  ) : null}
                  {moving === item.id ? <DayPicker today={today} initialWeek={weekFrom} value={item.scheduledDate} onPick={(day) => moveTo(item.id, day)} /> : null}
                </View>
              );
            }) : <Text style={styles.emptyDay}>{past ? "—" : "Livre"}</Text>}
          </View>
        );
      })}
      {!loading && !visible.length ? <Text style={styles.helper}>Nenhum treino enviado nesta semana. Toque em “+ Treino” num dia para planejar.</Text> : null}
    </View>
  );
}

type LibraryWorkout = {
  id: number;
  title: string;
  objective: string;
  description: string | null;
  pendingCount: number;
  completedCount: number;
  steps: { kind: "warmup" | "run" | "recovery" | "cooldown"; label: string; durationSeconds: number | null; distanceMeters: number | null; targetPaceSecondsPerKm: number | null; instruction: string | null }[];
};

function Library({ today, sendDate, athletes, workouts, loading, onEdit, onNotice }: {
  today: string;
  sendDate: string | null;
  athletes: Athlete[];
  workouts: LibraryWorkout[] | undefined;
  loading: boolean;
  onEdit: (workout: LibraryWorkout) => void;
  onNotice: (text: string) => void;
}) {
  const utils = trpc.useUtils();
  const refresh = () => Promise.all([utils.club.workouts.invalidate(), utils.club.coachAssignments.invalidate()]);
  const duplicate = trpc.club.duplicateWorkout.useMutation({ onSuccess: refresh });
  const remove = trpc.club.deleteWorkout.useMutation({ onSuccess: refresh });
  const assign = trpc.club.assignWorkout.useMutation({ onSuccess: refresh });
  const [search, setSearch] = useState("");
  const [sending, setSending] = useState<number | null>(null);
  const [confirming, setConfirming] = useState<number | null>(null);
  const [athleteId, setAthleteId] = useState<number | null>(athletes.length === 1 ? athletes[0].userId : null);
  const [date, setDate] = useState(sendDate ?? today);
  const query = search.trim().toLowerCase();
  const list = (workouts ?? []).filter((workout) => !query || `${workout.title} ${workout.objective}`.toLowerCase().includes(query));

  const send = async (workoutId: number) => {
    if (!athleteId) {
      onNotice("Escolha o aluno que vai receber o treino.");
      return;
    }
    try {
      await assign.mutateAsync({ athleteId, workoutId, scheduledDate: date });
      setSending(null);
      onNotice(`Treino enviado para ${formatDay(date)}.`);
    } catch (error) {
      onNotice(errorText(error, "Não foi possível enviar."));
    }
  };

  const copy = async (workoutId: number) => {
    try {
      await duplicate.mutateAsync({ workoutId });
      onNotice("Cópia criada no topo da biblioteca. Toque em Editar para ajustar.");
    } catch (error) {
      onNotice(errorText(error, "Não foi possível duplicar."));
    }
  };

  const destroy = async (workoutId: number) => {
    try {
      await remove.mutateAsync({ workoutId });
      setConfirming(null);
      onNotice("Treino excluído.");
    } catch (error) {
      onNotice(errorText(error, "Não foi possível excluir."));
    }
  };

  if (loading) return <ActivityIndicator color={C.ink} style={styles.loading} />;
  if (!workouts?.length) return <EmptyState icon="library-outline" title="Sua biblioteca está vazia" text="Toque em Novo treino para criar o primeiro. A IA pode montar um rascunho." />;

  return (
    <View style={styles.library}>
      <TextInput value={search} onChangeText={setSearch} placeholder="Buscar treino" placeholderTextColor={C.muted} style={styles.search} accessibilityLabel="Buscar treino" />
      {list.map((workout) => {
        const minutes = Math.round(workout.steps.reduce((sum, step) => sum + (step.durationSeconds ?? 0), 0) / 60);
        const km = workout.steps.reduce((sum, step) => sum + (step.distanceMeters ?? 0), 0) / 1000;
        const deleting = confirming === workout.id;
        return (
          <View key={workout.id} style={styles.workout}>
            <Pressable onPress={() => onEdit(workout)} style={({ pressed }) => pressed && styles.pressed}>
              <Text style={styles.workoutTitle}>{workout.title}</Text>
              <Text style={styles.muted}>{workout.objective}</Text>
              <View style={styles.meta}>
                <Meta text={`${workout.steps.length} ${workout.steps.length === 1 ? "etapa" : "etapas"}`} />
                {minutes ? <Meta text={`${minutes} min`} /> : null}
                {km ? <Meta text={`${km.toFixed(1).replace(".", ",")} km`} /> : null}
                {workout.pendingCount ? <Meta text={`${workout.pendingCount} pendente${workout.pendingCount > 1 ? "s" : ""}`} hot /> : null}
                {workout.completedCount ? <Meta text={`${workout.completedCount} feito${workout.completedCount > 1 ? "s" : ""}`} /> : null}
              </View>
              <Text style={styles.steps} numberOfLines={1}>{workout.steps.map((step) => step.label).join(" → ")}</Text>
            </Pressable>
            <View style={styles.actions}>
              <Action icon="send-outline" label="Enviar" primary onPress={() => { setConfirming(null); setDate(sendDate ?? today); setSending(sending === workout.id ? null : workout.id); }} />
              <Action icon="create-outline" label="Editar" onPress={() => onEdit(workout)} />
              <Action icon="copy-outline" label="Duplicar" onPress={() => copy(workout.id)} />
              <Action icon="trash-outline" label={deleting ? "Excluir mesmo?" : "Excluir"} danger={deleting} onPress={() => (deleting ? destroy(workout.id) : (setSending(null), setConfirming(workout.id)))} />
            </View>
            {deleting ? (
              <Text style={styles.dangerText}>
                {workout.pendingCount ? `Remove também ${workout.pendingCount} envio(s) pendente(s). ` : ""}As corridas que os alunos já registraram continuam no histórico. Toque em “Excluir mesmo?” para confirmar.
              </Text>
            ) : null}
            {sending === workout.id ? (
              <View style={styles.sendPanel}>
                <Text style={styles.label}>Para quem</Text>
                {athletes.length ? (
                  <View style={styles.chips}>
                    {athletes.map((athlete) => (
                      <Pressable key={athlete.userId} onPress={() => setAthleteId(athlete.userId)} style={[styles.athleteChip, athleteId === athlete.userId && styles.chipOn]}>
                        <ProfileAvatar uri={athlete.avatarUrl} name={athlete.name || athlete.email} size={22} />
                        <Text style={[styles.chipText, athleteId === athlete.userId && styles.chipTextOn]}>{athlete.name || athlete.email}</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : <Text style={styles.muted}>Acompanhe um aluno na aba Alunos para enviar treinos.</Text>}
                <Text style={styles.label}>Quando</Text>
                <DayPicker today={today} initialWeek={startOfWeek(date)} value={date} onPick={setDate} />
                <Pressable disabled={assign.isPending || !athletes.length} onPress={() => send(workout.id)} style={({ pressed }) => [styles.primary, (assign.isPending || !athletes.length) && styles.disabled, pressed && styles.pressed]}>
                  {assign.isPending ? <ActivityIndicator color={C.ink} /> : <Ionicons name="send" size={16} color={C.ink} />}
                  <Text style={styles.primaryText}>Enviar para {formatDay(date)}</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        );
      })}
      {!list.length ? <Text style={styles.helper}>Nenhum treino com “{search}”.</Text> : null}
    </View>
  );
}

function WeekNav({ weekFrom, today, onChange }: { weekFrom: string; today: string; onChange: (date: string) => void }) {
  const current = weekFrom === startOfWeek(today);
  return (
    <View style={styles.weekNav}>
      <Pressable onPress={() => onChange(addDays(weekFrom, -7))} accessibilityLabel="Semana anterior" style={({ pressed }) => [styles.navButton, pressed && styles.pressed]}><Ionicons name="chevron-back" size={18} color={C.ink} /></Pressable>
      <View style={styles.weekLabel}>
        <Text style={styles.weekTitle}>{current ? "Esta semana" : `Semana de ${shortDay(weekFrom)}`}</Text>
        <Text style={styles.muted}>{shortDay(weekFrom)} – {shortDay(addDays(weekFrom, 6))}</Text>
      </View>
      {!current ? <Pressable onPress={() => onChange(startOfWeek(today))} style={({ pressed }) => [styles.todayButton, pressed && styles.pressed]}><Text style={styles.chipText}>Hoje</Text></Pressable> : null}
      <Pressable onPress={() => onChange(addDays(weekFrom, 7))} accessibilityLabel="Próxima semana" style={({ pressed }) => [styles.navButton, pressed && styles.pressed]}><Ionicons name="chevron-forward" size={18} color={C.ink} /></Pressable>
    </View>
  );
}

/** Pick a day by tapping it in a Monday-to-Sunday strip; arrows walk weeks. Past days are off. */
export function DayPicker({ today, initialWeek, value, onPick }: { today: string; initialWeek: string; value: string; onPick: (date: string) => void }) {
  const [week, setWeek] = useState(initialWeek);
  return (
    <View style={styles.picker}>
      <Pressable onPress={() => setWeek(addDays(week, -7))} disabled={week <= startOfWeek(today)} accessibilityLabel="Semana anterior" style={({ pressed }) => [styles.pickerArrow, week <= startOfWeek(today) && styles.disabled, pressed && styles.pressed]}><Ionicons name="chevron-back" size={16} color={C.ink} /></Pressable>
      {WEEKDAYS.map((weekday, index) => {
        const date = addDays(week, index);
        const past = date < today;
        const active = date === value;
        return (
          <Pressable key={date} disabled={past} onPress={() => onPick(date)} accessibilityLabel={formatDay(date)} style={[styles.pickerDay, active && styles.pickerDayOn, past && styles.disabled]}>
            <Text style={[styles.pickerWeekday, active && styles.chipTextOn]}>{weekday}</Text>
            <Text style={[styles.pickerDate, active && styles.chipTextOn]}>{date.slice(8, 10)}</Text>
          </Pressable>
        );
      })}
      <Pressable onPress={() => setWeek(addDays(week, 7))} accessibilityLabel="Próxima semana" style={({ pressed }) => [styles.pickerArrow, pressed && styles.pressed]}><Ionicons name="chevron-forward" size={16} color={C.ink} /></Pressable>
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} style={[styles.chip, active && styles.chipOn]}><Text style={[styles.chipText, active && styles.chipTextOn]}>{label}</Text></Pressable>;
}

function Meta({ text, hot = false }: { text: string; hot?: boolean }) {
  return <View style={[styles.metaChip, hot && styles.metaHot]}><Text style={styles.metaText}>{text}</Text></View>;
}

function Action({ icon, label, onPress, primary = false, danger = false }: { icon: "send-outline" | "create-outline" | "copy-outline" | "trash-outline" | "calendar-outline"; label: string; onPress: () => void; primary?: boolean; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.action, primary && styles.actionPrimary, danger && styles.actionDanger, pressed && styles.pressed]}>
      <Ionicons name={icon} size={15} color={danger ? C.white : C.ink} />
      <Text style={[styles.actionText, danger && styles.actionTextDanger]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.35 },
  flex: { flex: 1, minWidth: 0 },
  gapSmall: { height: 14 },
  loading: { marginVertical: 20 },
  muted: { color: C.muted, fontSize: 12, fontWeight: "600" },
  helper: { color: C.muted, fontSize: 12, lineHeight: 18, fontWeight: "600", marginTop: 6 },
  notice: { color: C.ink, backgroundColor: C.lime, padding: 12, borderRadius: 14, fontSize: 13, fontWeight: "800", marginBottom: 12, overflow: "hidden" },
  label: { color: C.ink, fontSize: 11, fontWeight: "900", marginTop: 4 },

  newButton: { flexDirection: "row", alignItems: "center", gap: 5, height: 40, paddingHorizontal: 14, borderRadius: 999, backgroundColor: C.lime },
  newText: { color: C.ink, fontSize: 13, fontWeight: "900" },
  back: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingVertical: 8, marginBottom: 6 },
  backText: { color: C.ink, fontSize: 13, fontWeight: "800" },
  target: { gap: 8, marginTop: 12 },
  card: { padding: 16, borderRadius: 22, backgroundColor: C.white, borderWidth: 1, borderColor: "#ECEDE6" },
  warning: { flexDirection: "row", gap: 8, alignItems: "center", padding: 12, borderRadius: 14, backgroundColor: C.sand, marginBottom: 12 },
  warningText: { flex: 1, color: C.ink, fontSize: 12, fontWeight: "700", lineHeight: 17 },
  primary: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 50, borderRadius: 15, backgroundColor: C.lime, marginTop: 12, paddingHorizontal: 14 },
  primaryText: { color: C.ink, fontSize: 14, fontWeight: "900" },

  weekNav: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  navButton: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: C.white, borderWidth: 1, borderColor: C.line },
  weekLabel: { flex: 1, alignItems: "center" },
  weekTitle: { color: C.ink, fontSize: 15, fontWeight: "900" },
  todayButton: { paddingHorizontal: 12, height: 32, borderRadius: 999, justifyContent: "center", backgroundColor: C.white, borderWidth: 1, borderColor: C.line },

  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 12 },
  chip: { minHeight: 32, justifyContent: "center", paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: C.line, backgroundColor: C.white },
  chipOn: { backgroundColor: C.ink, borderColor: C.ink },
  chipText: { color: C.ink, fontSize: 12, fontWeight: "800" },
  chipTextOn: { color: C.white },
  athleteChip: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 34, paddingLeft: 5, paddingRight: 12, borderRadius: 999, borderWidth: 1, borderColor: C.line, backgroundColor: C.white },

  day: { padding: 12, borderRadius: 18, backgroundColor: C.white, borderWidth: 1, borderColor: "#ECEDE6", marginBottom: 8, gap: 8 },
  dayToday: { borderColor: C.ink, borderWidth: 1.5 },
  dayHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  dayName: { color: C.ink, fontSize: 12, fontWeight: "900", letterSpacing: 0.4 },
  todayTag: { color: C.ink, backgroundColor: C.lime, fontSize: 9, fontWeight: "900", paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, overflow: "hidden" },
  dayAdd: { marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 10, height: 28, borderRadius: 999, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line },
  dayAddText: { color: C.ink, fontSize: 11, fontWeight: "800" },
  emptyDay: { color: C.muted, fontSize: 12, fontWeight: "600" },
  send: { gap: 8, padding: 10, borderRadius: 14, backgroundColor: C.paper },
  sendTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  sendTitle: { color: C.ink, fontSize: 14, fontWeight: "900" },
  status: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
  statusDone: { backgroundColor: C.lime },
  statusOpen: { backgroundColor: "#F9D5CC" },
  statusText: { color: C.ink, fontSize: 10, fontWeight: "900" },

  actions: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  action: { flexDirection: "row", alignItems: "center", gap: 5, minHeight: 34, paddingHorizontal: 12, borderRadius: 999, backgroundColor: C.white, borderWidth: 1, borderColor: C.line },
  actionPrimary: { backgroundColor: C.lime, borderColor: C.lime },
  actionDanger: { backgroundColor: "#B4361C", borderColor: "#B4361C" },
  actionText: { color: C.ink, fontSize: 12, fontWeight: "800" },
  actionTextDanger: { color: C.white },
  dangerText: { color: "#8A2A12", fontSize: 12, lineHeight: 17, fontWeight: "700" },

  picker: { flexDirection: "row", alignItems: "center", gap: 4 },
  pickerArrow: { width: 28, height: 44, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  pickerDay: { flex: 1, height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: C.white, borderWidth: 1, borderColor: C.line },
  pickerDayOn: { backgroundColor: C.ink, borderColor: C.ink },
  pickerWeekday: { color: C.muted, fontSize: 9, fontWeight: "900" },
  pickerDate: { color: C.ink, fontSize: 14, fontWeight: "900" },

  library: { gap: 10 },
  search: { minHeight: 44, borderWidth: 1, borderColor: C.line, borderRadius: 13, paddingHorizontal: 13, color: C.ink, backgroundColor: C.white, fontSize: 13, fontWeight: "600" },
  workout: { gap: 10, padding: 14, borderRadius: 20, backgroundColor: C.white, borderWidth: 1, borderColor: "#ECEDE6" },
  workoutTitle: { color: C.ink, fontSize: 16, fontWeight: "900" },
  meta: { flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 8 },
  metaChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: C.paper },
  metaHot: { backgroundColor: "#F9D5CC" },
  metaText: { color: C.inkSoft, fontSize: 10, fontWeight: "800" },
  steps: { color: C.muted, fontSize: 11, fontWeight: "600", marginTop: 6 },
  sendPanel: { gap: 8, padding: 12, borderRadius: 16, backgroundColor: C.paper },
});
