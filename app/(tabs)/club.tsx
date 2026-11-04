import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { useRouter } from "expo-router";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { DateChips, EmptyState, Segmented, SourceBadge, STRAVA_ORANGE, formatDay, formatKm, formatPace } from "@/components/dashboard-ui";
import { AppHeader, C, CoachNote, Pill, Screen, SectionTitle } from "@/components/run-ui";
import { ProfileAvatar } from "@/components/profile-avatar";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";

type Effort = "easy" | "challenging" | "intense";
type CoachTab = "team" | "review" | "create";
type AthleteTab = "agenda" | "log" | "history";
type WorkoutStepDraft = {
  kind: "warmup" | "run" | "recovery" | "cooldown";
  label: string;
  durationMinutes: string;
  distanceKm: string;
  targetPace: string;
  instruction: string;
};
type ActivityDraft = { date: string; distance: string; minutes: string; note: string; effort: Effort };

const emptyStep = (): WorkoutStepDraft => ({ kind: "run", label: "Corrida leve", durationMinutes: "30", distanceKm: "", targetPace: "", instruction: "" });
const emptyActivityDraft = (): ActivityDraft => ({ date: localDate(), distance: "", minutes: "", note: "", effort: "easy" });
const stepKinds: { value: WorkoutStepDraft["kind"]; label: string }[] = [
  { value: "warmup", label: "Aquecimento" },
  { value: "run", label: "Corrida" },
  { value: "recovery", label: "Recuperação" },
  { value: "cooldown", label: "Desaquecimento" },
];

function parsePace(value: string): number | null {
  const match = /^(\d{1,2}):([0-5]\d)$/.exec(value.trim());
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

const effortLabels: Record<Effort, string> = {
  easy: "Leve",
  challenging: "Desafiador",
  intense: "Intenso",
};

function localDate(value = new Date()) {
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, "0");
  const d = String(value.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function LoadingState() {
  return <View style={styles.loading}><ActivityIndicator size="large" color={C.ink} /></View>;
}

export default function ClubScreen() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingState />;
  if (user?.role === "admin") return <CoachClub />;
  return <AthleteClub />;
}

function CoachClub() {
  const utils = trpc.useUtils();
  const pending = trpc.club.pendingAthletes.useQuery();
  const athletes = trpc.club.athletes.useQuery();
  const workouts = trpc.club.workouts.useQuery();
  const feed = trpc.club.coachActivityFeed.useQuery();
  const approve = trpc.club.approveAthlete.useMutation({ onSuccess: async () => { await Promise.all([utils.club.pendingAthletes.invalidate(), utils.club.athletes.invalidate()]); } });
  const reject = trpc.club.rejectAthlete.useMutation({ onSuccess: () => utils.club.pendingAthletes.invalidate() });
  const createWorkout = trpc.club.createWorkout.useMutation({ onSuccess: () => utils.club.workouts.invalidate() });
  const createAndAssignWorkout = trpc.club.createAndAssignWorkout.useMutation({ onSuccess: async () => { await Promise.all([utils.club.workouts.invalidate(), utils.club.athletes.invalidate()]); } });
  const assignWorkout = trpc.club.assignWorkout.useMutation({ onSuccess: () => utils.club.myAssignments.invalidate() });
  const reviewActivity = trpc.club.reviewActivity.useMutation({ onSuccess: () => utils.club.coachActivityFeed.invalidate() });

  const [title, setTitle] = useState("");
  const [objective, setObjective] = useState("");
  const [description, setDescription] = useState("");
  const [selectedAthlete, setSelectedAthlete] = useState<number | null>(null);
  const [selectedWorkout, setSelectedWorkout] = useState<number | null>(null);
  const [scheduledDate, setScheduledDate] = useState(localDate());
  const [stepDrafts, setStepDrafts] = useState<WorkoutStepDraft[]>([emptyStep()]);
  const [reviewDrafts, setReviewDrafts] = useState<Record<number, string>>({});
  const [reviewRatings, setReviewRatings] = useState<Record<number, number>>({});
  const [notice, setNotice] = useState("");
  const saving = createWorkout.isPending || createAndAssignWorkout.isPending || assignWorkout.isPending || reviewActivity.isPending;

  const makeAndAssign = async () => {
    setNotice("");
    if (title.trim().length < 2 || objective.trim().length < 2) {
      setNotice("Preencha o nome e o objetivo do treino.");
      return;
    }
    try {
      const steps = stepDrafts.map((step) => {
        const durationRaw = step.durationMinutes.trim();
        const distanceRaw = step.distanceKm.trim().replace(",", ".");
        const paceRaw = step.targetPace.trim();
        const durationSeconds = durationRaw ? Math.round(Number(durationRaw) * 60) : null;
        const distanceMeters = distanceRaw ? Math.round(Number(distanceRaw) * 1000) : null;
        const targetPaceSecondsPerKm = paceRaw ? parsePace(paceRaw) : null;
        if (!step.label.trim()) throw new Error("Dê um nome a cada etapa do treino.");
        if (durationRaw && (durationSeconds === null || !Number.isFinite(durationSeconds) || durationSeconds <= 0)) throw new Error("Confira a duração das etapas; use minutos maiores que zero.");
        if (distanceRaw && (distanceMeters === null || !Number.isFinite(distanceMeters) || distanceMeters <= 0)) throw new Error("Confira as distâncias; use quilômetros maiores que zero.");
        if (paceRaw && !targetPaceSecondsPerKm) throw new Error("Use o formato mm:ss no ritmo-alvo, por exemplo 06:30.");
        if (!durationSeconds && !distanceMeters) throw new Error("Cada etapa precisa ter duração ou distância.");
        return {
          kind: step.kind,
          label: step.label.trim(),
          durationSeconds,
          distanceMeters,
          targetPaceSecondsPerKm,
          instruction: step.instruction.trim() || null,
        };
      });
      const workoutInput = {
        title: title.trim(),
        objective: objective.trim(),
        description: description.trim() || undefined,
        level: "Todos",
        steps,
      };
      const created = selectedAthlete
        ? await createAndAssignWorkout.mutateAsync({ ...workoutInput, athleteId: selectedAthlete, scheduledDate })
        : await createWorkout.mutateAsync(workoutInput);
      if (selectedAthlete) {
        setNotice("Treino criado e atribuído para a data escolhida.");
      } else {
        setNotice("Treino salvo na biblioteca. Selecione um aluno e use a lista abaixo para atribuí-lo.");
      }
      setTitle("");
      setObjective("");
      setDescription("");
      setStepDrafts([emptyStep()]);
      setSelectedWorkout(created.workoutId);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Não foi possível salvar o treino.");
    }
  };

  const assignSelected = async () => {
    if (!selectedAthlete || !selectedWorkout) {
      setNotice("Escolha um aluno e um treino para fazer a atribuição.");
      return;
    }
    try {
      await assignWorkout.mutateAsync({ athleteId: selectedAthlete, workoutId: selectedWorkout, scheduledDate });
      setNotice("Treino atribuído para a data escolhida.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Não foi possível atribuir o treino.");
    }
  };

  const saveReview = async (activityId: number) => {
    const comment = reviewDrafts[activityId]?.trim();
    if (!comment) {
      setNotice("Escreva um comentário antes de salvar a avaliação.");
      return;
    }
    try {
      await reviewActivity.mutateAsync({ activityId, rating: reviewRatings[activityId] ?? 5, comment });
      setReviewDrafts((current) => ({ ...current, [activityId]: "" }));
      setNotice("Avaliação enviada ao aluno.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Não foi possível salvar a avaliação.");
    }
  };

  const pageError = pending.error || athletes.error || workouts.error || feed.error;
  const toReview = (feed.data ?? []).filter((entry) => !entry.review);
  const [tab, setTab] = useState<CoachTab | null>(null);
  if (pending.isLoading || athletes.isLoading || workouts.isLoading || feed.isLoading) return <LoadingState />;
  // Open where the coach is needed first: approvals, then reviews.
  const activeTab: CoachTab = tab ?? (pending.data?.length ? "team" : toReview.length ? "review" : "team");

  return (
    <Screen scroll>
      <AppHeader eyebrow="GESTÃO DO CLUBE" title="Sua turma" right={<View style={styles.countBadge}><Text style={styles.countNumber}>{athletes.data?.length ?? 0}</Text><Text style={styles.countLabel}>alunos</Text></View>} />
      <Segmented<CoachTab>
        value={activeTab}
        onChange={(value) => { setTab(value); setNotice(""); }}
        options={[
          { value: "team", label: "Turma", badge: pending.data?.length },
          { value: "review", label: "Avaliar", badge: toReview.length },
          { value: "create", label: "Criar treino" },
        ]}
      />
      <View style={styles.tabGap} />
      {pageError ? <View style={styles.errorCard}><Text style={styles.errorText}>Não foi possível carregar o clube agora. Tente novamente em instantes.</Text></View> : null}
      {notice ? <Text accessibilityRole="alert" style={styles.notice}>{notice}</Text> : null}

      {activeTab === "team" ? <>
        <SectionTitle title="Pedidos de acesso" />
        {pending.data?.length ? pending.data.map((item) => (
          <View key={item.userId} style={styles.requestCard}>
            <ProfileAvatar name={item.name} size={42} />
            <View style={styles.flexCopy}><Text style={styles.cardTitle}>{item.name}</Text><Text style={styles.cardDetail}>{item.email}</Text></View>
            <Pressable accessibilityLabel={`Rejeitar ${item.name}`} onPress={() => reject.mutate({ athleteId: item.userId })} style={({ pressed }) => [styles.rejectButton, pressed && styles.pressed]}><Ionicons name="close" size={19} color={C.ink} /></Pressable>
            <Pressable accessibilityLabel={`Aprovar ${item.name}`} onPress={() => approve.mutate({ athleteId: item.userId })} style={({ pressed }) => [styles.approveButton, pressed && styles.pressed]}><Ionicons name="checkmark" size={19} color={C.ink} /><Text style={styles.approveText}>Aprovar</Text></Pressable>
          </View>
        )) : <EmptyState icon="person-add-outline" title="Nenhum pedido pendente" text="Novos cadastros aparecem aqui para sua aprovação." />}

        <View style={styles.gap} />
        <SectionTitle title="Alunos aprovados" action="Criar treino" onPress={() => setTab("create")} />
        {athletes.data?.length ? <View style={styles.list}>{athletes.data.map((athlete) => (
          <Pressable key={athlete.userId} onPress={() => { setSelectedAthlete(athlete.userId); setTab("create"); }} style={({ pressed }) => [styles.athleteRow, pressed && styles.pressed]}>
            <ProfileAvatar uri={athlete.avatarUrl} name={athlete.name || athlete.email} size={42} />
            <View style={styles.flexCopy}><Text style={styles.cardTitle}>{athlete.name || athlete.email}</Text><Text style={styles.cardDetail}>{athlete.email}</Text></View>
            <View style={styles.rowAction}><Ionicons name="add" size={16} color={C.ink} /><Text style={styles.rowActionText}>Treino</Text></View>
          </Pressable>
        ))}</View> : <EmptyState icon="people-outline" title="Sua turma ainda está vazia" text="Aprove os pedidos de acesso para começar a enviar treinos." />}
      </> : null}

      {activeTab === "review" ? <>
        {feed.data?.length ? feed.data.map(({ activity, athleteName, athleteAvatarUrl, review }) => (
          <View key={activity.id} style={[styles.activityCard, !review && styles.activityOpen]}>
            <View style={styles.activityTop}>
              <View style={styles.athleteIdentity}><ProfileAvatar uri={athleteAvatarUrl} name={athleteName} size={34} /><View><Text style={styles.cardTitle}>{athleteName || "Aluno"}</Text><Text style={styles.cardDetail}>{new Date(activity.completedAt).toLocaleDateString("pt-BR", { day: "numeric", month: "short" })}</Text></View></View>
              <Pill label={review ? "AVALIADO" : "AGUARDA"} tone={review ? "lime" : "coral"} />
            </View>
            <Text style={styles.activityTitle}>{activity.title}</Text>
            <View style={styles.metricChips}>
              <MetricChip icon="map-outline" text={`${formatKm(activity.distanceMeters, 2)} km`} />
              <MetricChip icon="time-outline" text={`${Math.floor(activity.durationSeconds / 60)} min`} />
              <MetricChip icon="speedometer-outline" text={`${formatPace(activity.averagePaceSecondsPerKm)} /km`} />
              {activity.perceivedEffort ? <MetricChip icon="pulse-outline" text={effortLabels[activity.perceivedEffort]} /> : null}
            </View>
            {activity.athleteNote ? <Text style={styles.athleteNote}>“{activity.athleteNote}”</Text> : null}
            {review ? <View style={styles.reviewed}><Text style={styles.reviewedTitle}>Sua avaliação · {review.rating}/5</Text><Text style={styles.cardDetail}>{review.comment}</Text></View> : <>
              <View style={styles.ratingRow}>{[1, 2, 3, 4, 5].map((rating) => <Pressable key={rating} accessibilityLabel={`Avaliar com ${rating} de 5`} onPress={() => setReviewRatings((current) => ({ ...current, [activity.id]: rating }))} style={styles.starButton}><Ionicons name={rating <= (reviewRatings[activity.id] ?? 5) ? "star" : "star-outline"} size={24} color={C.limeDeep} /></Pressable>)}</View>
              <TextInput value={reviewDrafts[activity.id] ?? ""} onChangeText={(value) => setReviewDrafts((current) => ({ ...current, [activity.id]: value }))} placeholder="Deixe seu comentário para o aluno" placeholderTextColor={C.muted} multiline style={[styles.input, styles.reviewInput]} />
              <Pressable disabled={reviewActivity.isPending} onPress={() => saveReview(activity.id)} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}><Text style={styles.primaryButtonText}>Enviar avaliação</Text></Pressable>
            </>}
          </View>
        )) : <EmptyState icon="checkmark-done-outline" title="Tudo em dia" text="Os treinos registrados pelos alunos aparecem aqui para você avaliar." />}
        <View style={styles.gap} />
        <CoachNote label="STRAVA">O histórico Strava é particular de cada aluno e não aparece aqui. Esta área avalia os treinos que o aluno registra no clube.</CoachNote>
      </> : null}

      {activeTab === "create" ? <>
        <View style={styles.formCard}>
          <Text style={styles.formSection}>1 · O treino</Text>
          <Text style={styles.formLabel}>Nome do treino</Text>
          <TextInput value={title} onChangeText={setTitle} placeholder="Ex.: Corrida leve + educativos" placeholderTextColor={C.muted} style={styles.input} />
          <Text style={styles.formLabel}>Objetivo</Text>
          <TextInput value={objective} onChangeText={setObjective} placeholder="Ex.: Construir constância sem forçar" placeholderTextColor={C.muted} style={styles.input} />
          <Text style={styles.formLabel}>Descrição (opcional)</Text>
          <TextInput value={description} onChangeText={setDescription} placeholder="Contexto e orientações gerais do treino" placeholderTextColor={C.muted} multiline style={[styles.input, styles.stepInstruction]} />

          <View style={[styles.stepEditorHeader, styles.formSectionGap]}><Text style={styles.formSection}>2 · Etapas</Text><Text style={styles.cardDetail}>{stepDrafts.length}/12</Text></View>
          {stepDrafts.map((step, index) => <View key={index} style={styles.stepEditor}>
            <View style={styles.stepEditorHeader}><View style={styles.stepNumber}><Text style={styles.stepNumberText}>{index + 1}</Text></View>{stepDrafts.length > 1 ? <Pressable accessibilityLabel={`Remover etapa ${index + 1}`} onPress={() => setStepDrafts((current) => current.filter((_, position) => position !== index))}><Ionicons name="trash-outline" size={19} color={C.muted} /></Pressable> : null}</View>
            <View style={styles.choiceWrap}>{stepKinds.map((kind) => <Pressable key={kind.value} onPress={() => setStepDrafts((current) => current.map((item, position) => position === index ? { ...item, kind: kind.value } : item))} style={[styles.choice, step.kind === kind.value && styles.choiceSelected]}><Text style={[styles.choiceText, step.kind === kind.value && styles.choiceTextSelected]}>{kind.label}</Text></Pressable>)}</View>
            <TextInput value={step.label} onChangeText={(value) => setStepDrafts((current) => current.map((item, position) => position === index ? { ...item, label: value } : item))} placeholder="Nome da etapa" placeholderTextColor={C.muted} style={styles.input} accessibilityLabel={`Nome da etapa ${index + 1}`} />
            <View style={styles.metricsInputRow}><Text style={styles.inputCaption}>Minutos</Text><Text style={styles.inputCaption}>Km</Text><Text style={styles.inputCaption}>Ritmo /km</Text></View>
            <View style={styles.metricsInputRow}>
              <TextInput keyboardType="decimal-pad" value={step.durationMinutes} onChangeText={(value) => setStepDrafts((current) => current.map((item, position) => position === index ? { ...item, durationMinutes: value } : item))} placeholder="Duração (min)" placeholderTextColor={C.muted} style={[styles.input, styles.metricInput]} accessibilityLabel={`Duração da etapa ${index + 1} em minutos`} />
              <TextInput keyboardType="decimal-pad" value={step.distanceKm} onChangeText={(value) => setStepDrafts((current) => current.map((item, position) => position === index ? { ...item, distanceKm: value } : item))} placeholder="Distância (km)" placeholderTextColor={C.muted} style={[styles.input, styles.metricInput]} accessibilityLabel={`Distância da etapa ${index + 1} em quilômetros`} />
              <TextInput value={step.targetPace} onChangeText={(value) => setStepDrafts((current) => current.map((item, position) => position === index ? { ...item, targetPace: value } : item))} placeholder="Ritmo mm:ss" placeholderTextColor={C.muted} style={[styles.input, styles.metricInput]} accessibilityLabel={`Ritmo-alvo da etapa ${index + 1}`} />
            </View>
            <TextInput value={step.instruction} onChangeText={(value) => setStepDrafts((current) => current.map((item, position) => position === index ? { ...item, instruction: value } : item))} placeholder="Instrução para o aluno (opcional)" placeholderTextColor={C.muted} multiline style={[styles.input, styles.stepInstruction]} accessibilityLabel={`Instrução da etapa ${index + 1}`} />
          </View>)}
          {stepDrafts.length < 12 ? <Pressable onPress={() => setStepDrafts((current) => [...current, { ...emptyStep(), durationMinutes: "", label: "" }])} style={({ pressed }) => [styles.addStep, pressed && styles.pressed]}><Ionicons name="add-circle-outline" size={18} color={C.ink} /><Text style={styles.addStepText}>Adicionar etapa</Text></Pressable> : null}

          <Text style={[styles.formSection, styles.formSectionGap]}>3 · Para quem e quando</Text>
          <Text style={styles.formLabel}>Aluno (opcional — sem aluno, o treino vai para a biblioteca)</Text>
          <View style={styles.choiceWrap}>
            {athletes.data?.map((athlete) => <Pressable key={athlete.userId} onPress={() => setSelectedAthlete(selectedAthlete === athlete.userId ? null : athlete.userId)} style={[styles.choice, styles.athleteChoice, selectedAthlete === athlete.userId && styles.choiceSelected]}><ProfileAvatar uri={athlete.avatarUrl} name={athlete.name || athlete.email} size={23} /><Text style={[styles.choiceText, selectedAthlete === athlete.userId && styles.choiceTextSelected]}>{athlete.name || athlete.email}</Text></Pressable>)}
            {!athletes.data?.length ? <Text style={styles.cardDetail}>Aprove um aluno para começar a atribuir treinos.</Text> : null}
          </View>
          <Text style={styles.formLabel}>Data</Text>
          <DateChips value={scheduledDate} onChange={setScheduledDate} />
          <TextInput value={scheduledDate} onChangeText={setScheduledDate} placeholder="AAAA-MM-DD" placeholderTextColor={C.muted} style={styles.input} accessibilityLabel="Data de atribuição no formato ano-mês-dia" />
          <Pressable disabled={saving} onPress={makeAndAssign} style={({ pressed }) => [styles.primaryButton, saving && styles.disabled, pressed && styles.pressed]}><Text style={styles.primaryButtonText}>{createWorkout.isPending || createAndAssignWorkout.isPending ? "Salvando…" : selectedAthlete ? "Criar e enviar ao aluno" : "Salvar na biblioteca"}</Text></Pressable>
        </View>

        {workouts.data?.length ? <>
          <View style={styles.gap} />
          <SectionTitle title="Reenviar da biblioteca" />
          <Text style={styles.helper}>Escolha um treino salvo, um aluno acima e a data.</Text>
          {workouts.data.map((workout) => <Pressable key={workout.id} onPress={() => setSelectedWorkout(workout.id)} style={[styles.workoutCard, selectedWorkout === workout.id && styles.workoutSelected]}><View style={styles.flexCopy}><Text style={styles.cardTitle}>{workout.title}</Text><Text style={styles.cardDetail}>{workout.objective} · {workout.steps.length} etapa(s)</Text></View>{selectedWorkout === workout.id ? <Ionicons name="checkmark-circle" size={21} color={C.limeDeep} /> : <Ionicons name="radio-button-off" size={20} color={C.muted} />}</Pressable>)}
          <Pressable disabled={saving || !selectedAthlete || !selectedWorkout} onPress={assignSelected} style={({ pressed }) => [styles.secondaryButton, (!selectedAthlete || !selectedWorkout) && styles.disabled, pressed && styles.pressed]}><Text style={styles.secondaryText}>{selectedAthlete && selectedWorkout ? `Enviar treino selecionado · ${scheduledDate}` : "Selecione um aluno e um treino"}</Text></Pressable>
        </> : null}
      </> : null}
    </Screen>
  );
}

function AthleteClub() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const assignments = trpc.club.myAssignments.useQuery();
  const activities = trpc.club.myActivities.useQuery();
  const submit = trpc.club.submitActivity.useMutation({ onSuccess: async () => { await Promise.all([utils.club.myActivities.invalidate(), utils.club.myAssignments.invalidate()]); } });
  const [drafts, setDrafts] = useState<Record<number, ActivityDraft>>({});
  const [manualDraft, setManualDraft] = useState({ title: "Corrida livre", ...emptyActivityDraft() });
  const [notice, setNotice] = useState("");
  const pageError = assignments.error || activities.error;

  const onSubmit = async (assignmentId: number, title: string) => {
    const draft = drafts[assignmentId] ?? emptyActivityDraft();
    const distanceMeters = Math.round(Number(draft.distance.replace(",", ".")) * 1000);
    const durationSeconds = Math.round(Number(draft.minutes) * 60);
    if (!Number.isFinite(distanceMeters) || distanceMeters <= 0 || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      setNotice("Informe uma distância em quilômetros e um tempo em minutos válidos.");
      return false;
    }
    try {
      await submit.mutateAsync({ assignmentId, title, distanceMeters, durationSeconds, activityDate: draft.date, perceivedEffort: draft.effort, athleteNote: draft.note.trim() || undefined });
      setNotice("Treino registrado. Seu treinador poderá avaliar quando abrir o registro.");
      return true;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Não foi possível registrar o treino.");
      return false;
    }
  };

  const onManualSubmit = async () => {
    const distanceMeters = Math.round(Number(manualDraft.distance.replace(",", ".")) * 1000);
    const durationSeconds = Math.round(Number(manualDraft.minutes) * 60);
    if (manualDraft.title.trim().length < 2 || !Number.isFinite(distanceMeters) || distanceMeters <= 0 || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      setNotice("Informe o nome, uma distância em quilômetros e um tempo em minutos válidos.");
      return;
    }
    try {
      await submit.mutateAsync({ title: manualDraft.title.trim(), distanceMeters, durationSeconds, activityDate: manualDraft.date, perceivedEffort: manualDraft.effort, athleteNote: manualDraft.note.trim() || undefined });
      setNotice("Atividade registrada e compartilhada com seu treinador para acompanhamento.");
      setManualDraft({ title: "Corrida livre", ...emptyActivityDraft() });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Não foi possível registrar a atividade.");
    }
  };

  const [tab, setTab] = useState<AthleteTab>("agenda");
  const [openLog, setOpenLog] = useState<number | null>(null);
  if (assignments.isLoading || activities.isLoading) return <LoadingState />;
  const open = (assignments.data ?? []).filter((assignment) => assignment.status === "assigned");
  const done = (assignments.data ?? []).filter((assignment) => assignment.status !== "assigned");

  const effortPicker = (value: Effort, onChange: (effort: Effort) => void) => (
    <View style={styles.choiceWrap}>{(["easy", "challenging", "intense"] as Effort[]).map((effort) => <Pressable key={effort} onPress={() => onChange(effort)} style={[styles.choice, styles.effortChoice, value === effort && styles.choiceSelected]}><Text style={[styles.choiceText, value === effort && styles.choiceTextSelected]}>{effortLabels[effort]}</Text></Pressable>)}</View>
  );

  const workoutCard = (assignment: NonNullable<typeof assignments.data>[number]) => {
    const draft = drafts[assignment.id] ?? emptyActivityDraft();
    const setDraft = (patch: Partial<ActivityDraft>) => setDrafts((current) => ({ ...current, [assignment.id]: { ...draft, ...patch } }));
    const completed = assignment.status === "completed";
    return <View key={assignment.id} style={[styles.athleteWorkout, !completed && styles.workoutOpen]}>
      <View style={styles.activityTop}><Pill label={completed ? "CONCLUÍDO" : "PARA FAZER"} tone={completed ? "lime" : "dark"} /><Text style={styles.cardDetail}>{formatDay(String(assignment.scheduledDate))}</Text></View>
      <Text style={styles.activityTitle}>{assignment.title}</Text>
      <Text style={styles.cardDetail}>{assignment.objective}</Text>
      {assignment.description ? <Text style={styles.athleteNote}>{assignment.description}</Text> : null}
      {assignment.steps.length ? <View style={styles.stepsCard}>
        {assignment.steps.map((step, index) => <View key={step.id} style={styles.stepRow}>
          <View style={styles.stepTimeline}><View style={styles.stepDot} />{index < assignment.steps.length - 1 ? <View style={styles.stepLine} /> : null}</View>
          <View style={styles.flexCopy}>
            <Text style={styles.stepLabel}>{step.label}</Text>
            <Text style={styles.cardDetail}>{[step.durationSeconds ? `${Math.round(step.durationSeconds / 60)} min` : "", step.distanceMeters ? `${formatKm(step.distanceMeters)} km` : "", step.targetPaceSecondsPerKm ? `${formatPace(step.targetPaceSecondsPerKm)} /km` : ""].filter(Boolean).join(" · ")}</Text>
            {step.instruction ? <Text style={styles.athleteNote}>{step.instruction}</Text> : null}
          </View>
        </View>)}
      </View> : null}
      {!completed ? openLog === assignment.id ? <View style={styles.logBox}>
        <Text style={styles.formSection}>Como foi?</Text>
        <DateChips past value={draft.date} onChange={(date) => setDraft({ date })} />
        <View style={styles.metricsInputRow}>
          <TextInput keyboardType="decimal-pad" value={draft.distance} onChangeText={(distance) => setDraft({ distance })} placeholder="km" placeholderTextColor={C.muted} style={[styles.input, styles.metricInput]} accessibilityLabel="Distância em quilômetros" />
          <TextInput keyboardType="decimal-pad" value={draft.minutes} onChangeText={(minutes) => setDraft({ minutes })} placeholder="minutos" placeholderTextColor={C.muted} style={[styles.input, styles.metricInput]} accessibilityLabel="Tempo em minutos" />
        </View>
        {effortPicker(draft.effort, (effort) => setDraft({ effort }))}
        <TextInput value={draft.note} onChangeText={(note) => setDraft({ note })} placeholder="Algum comentário para o treinador? (opcional)" placeholderTextColor={C.muted} multiline style={[styles.input, styles.reviewInput]} />
        <Pressable disabled={submit.isPending} onPress={async () => { if (await onSubmit(assignment.id, assignment.title)) setOpenLog(null); }} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}><Text style={styles.primaryButtonText}>{submit.isPending ? "Salvando…" : "Registrar treino feito"}</Text></Pressable>
      </View> : <Pressable onPress={() => setOpenLog(assignment.id)} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}><Text style={styles.primaryButtonText}>Fiz este treino</Text></Pressable> : null}
    </View>;
  };

  return (
    <Screen scroll>
      <AppHeader eyebrow="SEU CLUBE" title="Meus treinos" />
      <Segmented<AthleteTab>
        value={tab}
        onChange={(value) => { setTab(value); setNotice(""); }}
        options={[
          { value: "agenda", label: "Agenda", badge: open.length },
          { value: "log", label: "Registrar" },
          { value: "history", label: "Histórico" },
        ]}
      />
      <View style={styles.tabGap} />
      {pageError ? <View style={styles.errorCard}><Text style={styles.errorText}>Não foi possível carregar seus treinos. Tente novamente.</Text></View> : null}
      {notice ? <Text accessibilityRole="alert" style={styles.notice}>{notice}</Text> : null}

      {tab === "agenda" ? <>
        {open.length ? <View style={styles.list}>{open.map(workoutCard)}</View> : <EmptyState icon="calendar-outline" title="Nada pendente na agenda" text="Quando o treinador enviar um treino, ele aparece aqui com as etapas." />}
        {done.length ? <>
          <View style={styles.gap} />
          <SectionTitle title="Já concluídos" />
          <View style={styles.list}>{done.map(workoutCard)}</View>
        </> : null}
      </> : null}

      {tab === "log" ? <View style={styles.formCard}>
        <Text style={styles.formSection}>Registrar uma corrida</Text>
        <Text style={styles.helper}>Para corridas fora do plano. Seu treinador vê o registro e pode comentar.</Text>
        <Text style={styles.formLabel}>Nome da atividade</Text>
        <TextInput value={manualDraft.title} onChangeText={(value) => setManualDraft((current) => ({ ...current, title: value }))} placeholder="Ex.: Corrida no parque" placeholderTextColor={C.muted} style={styles.input} />
        <Text style={styles.formLabel}>Quando</Text>
        <DateChips past value={manualDraft.date} onChange={(date) => setManualDraft((current) => ({ ...current, date }))} />
        <TextInput value={manualDraft.date} onChangeText={(value) => setManualDraft((current) => ({ ...current, date: value }))} placeholder="AAAA-MM-DD" placeholderTextColor={C.muted} style={styles.input} accessibilityLabel="Data da corrida no formato ano-mês-dia" />
        <Text style={styles.formLabel}>Distância e tempo</Text>
        <View style={styles.metricsInputRow}>
          <TextInput keyboardType="decimal-pad" value={manualDraft.distance} onChangeText={(value) => setManualDraft((current) => ({ ...current, distance: value }))} placeholder="km" placeholderTextColor={C.muted} style={[styles.input, styles.metricInput]} accessibilityLabel="Distância da corrida manual em quilômetros" />
          <TextInput keyboardType="decimal-pad" value={manualDraft.minutes} onChangeText={(value) => setManualDraft((current) => ({ ...current, minutes: value }))} placeholder="minutos" placeholderTextColor={C.muted} style={[styles.input, styles.metricInput]} accessibilityLabel="Tempo da corrida manual em minutos" />
        </View>
        <Text style={styles.formLabel}>Esforço</Text>
        {effortPicker(manualDraft.effort, (effort) => setManualDraft((current) => ({ ...current, effort })))}
        <TextInput value={manualDraft.note} onChangeText={(value) => setManualDraft((current) => ({ ...current, note: value }))} placeholder="Observações (opcional)" placeholderTextColor={C.muted} multiline style={[styles.input, styles.reviewInput]} />
        <Pressable disabled={submit.isPending} onPress={onManualSubmit} style={({ pressed }) => [styles.primaryButton, submit.isPending && styles.disabled, pressed && styles.pressed]}><Text style={styles.primaryButtonText}>{submit.isPending ? "Salvando…" : "Salvar corrida"}</Text></Pressable>
      </View> : null}

      {tab === "history" ? <>
        {activities.data?.length ? <View style={styles.list}>{activities.data.map((activity) => (
          <View key={activity.id} style={styles.activityCard}>
            <View style={styles.activityTop}><SourceBadge source={activity.source === "strava" ? "strava" : "club"} />{activity.review ? <Pill label={`AVALIADO · ${activity.review.rating}/5`} tone="lime" /> : <Pill label="AGUARDA RETORNO" tone="light" />}</View>
            <Text style={styles.activityTitle}>{activity.title}</Text>
            <View style={styles.metricChips}>
              <MetricChip icon="calendar-outline" text={new Date(activity.completedAt).toLocaleDateString("pt-BR", { day: "numeric", month: "short" })} />
              <MetricChip icon="map-outline" text={`${formatKm(activity.distanceMeters, 2)} km`} />
              <MetricChip icon="time-outline" text={`${Math.floor(activity.durationSeconds / 60)} min`} />
              {activity.perceivedEffort ? <MetricChip icon="pulse-outline" text={effortLabels[activity.perceivedEffort]} /> : null}
            </View>
            {activity.review ? <CoachNote label="TREINADOR">{activity.review.comment}</CoachNote> : null}
          </View>
        ))}</View> : <EmptyState icon="time-outline" title="Seu histórico começa aqui" text="Treinos registrados e comentários do treinador ficam guardados nesta aba." />}
        <View style={styles.gap} />
        <Pressable onPress={() => router.push("/strava")} style={({ pressed }) => [styles.athleteRow, pressed && styles.pressed]}>
          <View style={styles.stravaIcon}><Ionicons name="flash" size={16} color={C.white} /></View>
          <View style={styles.flexCopy}><Text style={styles.cardTitle}>Histórico do Strava</Text><Text style={styles.cardDetail}>Suas corridas do Strava, só para você.</Text></View>
          <Ionicons name="chevron-forward" size={18} color={C.muted} />
        </Pressable>
      </> : null}
    </Screen>
  );
}

function MetricChip({ icon, text }: { icon: "map-outline" | "time-outline" | "speedometer-outline" | "pulse-outline" | "calendar-outline"; text: string }) {
  return <View style={styles.metricChip}><Ionicons name={icon} size={13} color={C.inkSoft} /><Text style={styles.metricChipText}>{text}</Text></View>;
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.paper },
  countBadge: { minWidth: 58, minHeight: 48, borderRadius: 16, backgroundColor: C.lime, alignItems: "center", justifyContent: "center", paddingHorizontal: 10 },
  countNumber: { color: C.ink, fontSize: 17, fontWeight: "900" },
  countLabel: { color: C.ink, fontSize: 9, fontWeight: "800" },
  gap: { height: 27 },
  tabGap: { height: 18 },
  list: { gap: 10 },
  helper: { color: C.muted, fontSize: 12, lineHeight: 17, fontWeight: "600", marginBottom: 10 },
  formSection: { color: C.ink, fontSize: 15, fontWeight: "900" },
  formSectionGap: { marginTop: 14 },
  approveText: { color: C.ink, fontSize: 12, fontWeight: "900" },
  athleteRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 18, backgroundColor: C.white, boxShadow: "0px 6px 16px rgba(11, 23, 32, 0.06)" },
  rowAction: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 12, backgroundColor: C.lime },
  rowActionText: { color: C.ink, fontSize: 11, fontWeight: "900" },
  activityOpen: { borderColor: "#F6C4B5" },
  activityTitle: { color: C.ink, fontSize: 17, lineHeight: 22, fontWeight: "900", letterSpacing: -0.3 },
  metricChips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  metricChip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 10, backgroundColor: C.paper },
  metricChipText: { color: C.inkSoft, fontSize: 11, fontWeight: "800" },
  stepNumber: { width: 26, height: 26, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: C.ink },
  stepNumberText: { color: C.lime, fontSize: 12, fontWeight: "900" },
  effortChoice: { flexGrow: 1, alignItems: "center" },
  workoutOpen: { borderColor: C.ink },
  logBox: { gap: 10, padding: 12, borderRadius: 16, backgroundColor: C.paper },
  stepTimeline: { alignItems: "center", width: 10, alignSelf: "stretch" },
  stepLine: { flex: 1, width: 2, marginTop: 3, backgroundColor: C.line },
  stravaIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: STRAVA_ORANGE },
  requestCard: { minHeight: 71, flexDirection: "row", alignItems: "center", gap: 10, padding: 12, marginBottom: 9, borderRadius: 18, backgroundColor: C.white, boxShadow: "0px 6px 16px rgba(11, 23, 32, 0.06)" },
  avatar: { width: 39, height: 39, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: C.coral },
  avatarText: { color: C.white, fontSize: 15, fontWeight: "900" },
  flexCopy: { flex: 1, gap: 3 },
  cardTitle: { color: C.ink, fontSize: 15, lineHeight: 20, fontWeight: "900" },
  cardDetail: { color: C.muted, fontSize: 11, lineHeight: 16, fontWeight: "600" },
  approveButton: { height: 38, flexDirection: "row", gap: 4, paddingHorizontal: 12, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: C.lime },
  rejectButton: { width: 38, height: 38, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: C.stone },
  pressed: { opacity: 0.72 },
  emptyCard: { padding: 17, borderRadius: 18, backgroundColor: C.white, borderWidth: 1, borderColor: C.line, gap: 4 },
  emptyTitle: { color: C.ink, fontSize: 14, fontWeight: "900" },
  formCard: { padding: 18, borderRadius: 24, backgroundColor: C.white, gap: 9, boxShadow: "0px 10px 24px rgba(11, 23, 32, 0.08)" },
  formLabel: { color: C.ink, fontSize: 11, fontWeight: "900", marginTop: 9 },
  stepEditor: { gap: 9, padding: 12, borderRadius: 16, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line },
  stepEditorHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  stepEditorTitle: { color: C.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  stepInstruction: { minHeight: 61, textAlignVertical: "top" },
  addStep: { minHeight: 40, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderRadius: 13, borderWidth: 1, borderColor: C.line, backgroundColor: C.paper },
  addStepText: { color: C.ink, fontSize: 12, fontWeight: "800" },
  input: { minHeight: 46, borderWidth: 1, borderColor: C.line, borderRadius: 13, paddingHorizontal: 13, paddingVertical: 10, color: C.ink, backgroundColor: C.paper, fontSize: 13, fontWeight: "600" },
  choiceWrap: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 3 },
  choice: { minHeight: 35, justifyContent: "center", paddingHorizontal: 11, borderRadius: 999, borderWidth: 1, borderColor: C.line, backgroundColor: C.paper },
  athleteChoice: { flexDirection: "row", alignItems: "center", gap: 6, paddingLeft: 6 },
  choiceSelected: { borderColor: C.ink, backgroundColor: C.ink },
  choiceText: { color: C.ink, fontSize: 11, fontWeight: "800" },
  choiceTextSelected: { color: C.white },
  primaryButton: { minHeight: 49, borderRadius: 15, backgroundColor: C.lime, alignItems: "center", justifyContent: "center", marginTop: 8, paddingHorizontal: 12 },
  primaryButtonText: { color: C.ink, fontSize: 13, fontWeight: "900" },
  secondaryButton: { minHeight: 47, borderRadius: 15, borderWidth: 1, borderColor: C.line, backgroundColor: C.white, alignItems: "center", justifyContent: "center", marginTop: 9, paddingHorizontal: 10 },
  secondaryText: { color: C.ink, fontSize: 12, fontWeight: "800" },
  disabled: { opacity: 0.6 },
  subheading: { color: C.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1, marginTop: 15, marginBottom: 7 },
  workoutCard: { minHeight: 62, flexDirection: "row", alignItems: "center", gap: 10, padding: 13, marginBottom: 8, borderWidth: 1, borderColor: C.line, borderRadius: 17, backgroundColor: C.white },
  workoutSelected: { borderColor: C.limeDeep, backgroundColor: "#F5F9E4" },
  activityCard: { padding: 16, borderRadius: 22, backgroundColor: C.white, borderWidth: 1, borderColor: "#ECEDE6", marginBottom: 10, gap: 10 },
  activityTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  athleteIdentity: { flexDirection: "row", alignItems: "center", gap: 7, flexShrink: 1 },
  metricLine: { color: C.inkSoft, fontSize: 12, fontWeight: "800" },
  athleteNote: { color: C.muted, fontSize: 12, lineHeight: 18, fontWeight: "600" },
  reviewInput: { minHeight: 72, textAlignVertical: "top", marginTop: 4 },
  smallPrimary: { minHeight: 43, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: C.lime, paddingHorizontal: 12 },
  smallPrimaryText: { color: C.ink, fontSize: 12, fontWeight: "900" },
  reviewed: { padding: 12, borderRadius: 14, backgroundColor: C.sky, gap: 4 },
  reviewedTitle: { color: C.ink, fontSize: 11, fontWeight: "900" },
  ratingRow: { flexDirection: "row", gap: 6 },
  starButton: { padding: 3 },
  notice: { color: C.inkSoft, backgroundColor: C.sky, padding: 11, borderRadius: 13, marginBottom: 12, fontSize: 12, lineHeight: 17, fontWeight: "700" },
  errorCard: { padding: 13, backgroundColor: "#F9D5CC", borderRadius: 14, marginBottom: 13 },
  errorText: { color: "#762E21", fontSize: 12, lineHeight: 17, fontWeight: "700" },
  athleteWorkout: { padding: 16, borderRadius: 22, backgroundColor: C.white, borderWidth: 1, borderColor: "#ECEDE6", gap: 10 },
  stepsCard: { padding: 12, borderRadius: 15, backgroundColor: C.paper, gap: 9, marginTop: 3 },
  stepsTitle: { color: C.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  stepRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingBottom: 4 },
  stepDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5, backgroundColor: C.limeDeep },
  stepLabel: { color: C.ink, fontSize: 12, fontWeight: "900" },
  metricsInputRow: { flexDirection: "row", gap: 9 },
  metricInput: { flex: 1 },
  inputCaption: { flex: 1, color: C.muted, fontSize: 10, fontWeight: "800", marginBottom: -4 },
});
