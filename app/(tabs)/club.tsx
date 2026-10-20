import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { AppHeader, C, CoachNote, Pill, Screen, SectionTitle } from "@/components/run-ui";
import { ProfileAvatar } from "@/components/profile-avatar";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";

type Effort = "easy" | "challenging" | "intense";
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
  if (pending.isLoading || athletes.isLoading || workouts.isLoading || feed.isLoading) return <LoadingState />;

  return (
    <Screen scroll>
      <AppHeader eyebrow="GESTÃO DO CLUBE" title="Sua turma" right={<View style={styles.countBadge}><Text style={styles.countNumber}>{athletes.data?.length ?? 0}</Text><Text style={styles.countLabel}>alunos</Text></View>} />
      {pageError ? <View style={styles.errorCard}><Text style={styles.errorText}>Não foi possível carregar o clube agora. Tente novamente em instantes.</Text></View> : null}
      {notice ? <Text accessibilityRole="alert" style={styles.notice}>{notice}</Text> : null}

      <SectionTitle title="Pedidos de acesso" />
      {pending.data?.length ? pending.data.map((item) => (
        <View key={item.userId} style={styles.requestCard}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{(item.name || "A").slice(0, 1).toUpperCase()}</Text></View>
          <View style={styles.flexCopy}><Text style={styles.cardTitle}>{item.name}</Text><Text style={styles.cardDetail}>{item.email}</Text></View>
          <Pressable accessibilityLabel={`Aprovar ${item.name}`} onPress={() => approve.mutate({ athleteId: item.userId })} style={({ pressed }) => [styles.approveButton, pressed && styles.pressed]}><Ionicons name="checkmark" size={19} color={C.ink} /></Pressable>
          <Pressable accessibilityLabel={`Rejeitar ${item.name}`} onPress={() => reject.mutate({ athleteId: item.userId })} style={({ pressed }) => [styles.rejectButton, pressed && styles.pressed]}><Ionicons name="close" size={19} color={C.ink} /></Pressable>
        </View>
      )) : <View style={styles.emptyCard}><Text style={styles.emptyTitle}>Nenhum pedido pendente</Text><Text style={styles.cardDetail}>Novos cadastros aparecerão aqui para sua aprovação.</Text></View>}

      <View style={styles.gap} />
      <SectionTitle title="Montar e atribuir" />
      <View style={styles.formCard}>
        <Text style={styles.formLabel}>Nome do treino</Text>
        <TextInput value={title} onChangeText={setTitle} placeholder="Ex.: Corrida leve + educativos" placeholderTextColor={C.muted} style={styles.input} />
        <Text style={styles.formLabel}>Objetivo</Text>
        <TextInput value={objective} onChangeText={setObjective} placeholder="Ex.: Construir constância sem forçar" placeholderTextColor={C.muted} style={styles.input} />
        <Text style={styles.formLabel}>Descrição (opcional)</Text>
        <TextInput value={description} onChangeText={setDescription} placeholder="Contexto e orientações gerais do treino" placeholderTextColor={C.muted} multiline style={[styles.input, styles.stepInstruction]} />
        <View style={styles.stepEditorHeader}><Text style={styles.formLabel}>Etapas do treino</Text><Text style={styles.cardDetail}>{stepDrafts.length}/12</Text></View>
        {stepDrafts.map((step, index) => <View key={index} style={styles.stepEditor}>
          <View style={styles.stepEditorHeader}><Text style={styles.stepEditorTitle}>ETAPA {index + 1}</Text>{stepDrafts.length > 1 ? <Pressable accessibilityLabel={`Remover etapa ${index + 1}`} onPress={() => setStepDrafts((current) => current.filter((_, position) => position !== index))}><Ionicons name="close-circle" size={21} color={C.muted} /></Pressable> : null}</View>
          <View style={styles.choiceWrap}>{stepKinds.map((kind) => <Pressable key={kind.value} onPress={() => setStepDrafts((current) => current.map((item, position) => position === index ? { ...item, kind: kind.value } : item))} style={[styles.choice, step.kind === kind.value && styles.choiceSelected]}><Text style={[styles.choiceText, step.kind === kind.value && styles.choiceTextSelected]}>{kind.label}</Text></Pressable>)}</View>
          <TextInput value={step.label} onChangeText={(value) => setStepDrafts((current) => current.map((item, position) => position === index ? { ...item, label: value } : item))} placeholder="Nome da etapa" placeholderTextColor={C.muted} style={styles.input} accessibilityLabel={`Nome da etapa ${index + 1}`} />
          <View style={styles.metricsInputRow}>
            <TextInput keyboardType="decimal-pad" value={step.durationMinutes} onChangeText={(value) => setStepDrafts((current) => current.map((item, position) => position === index ? { ...item, durationMinutes: value } : item))} placeholder="Duração (min)" placeholderTextColor={C.muted} style={[styles.input, styles.metricInput]} accessibilityLabel={`Duração da etapa ${index + 1} em minutos`} />
            <TextInput keyboardType="decimal-pad" value={step.distanceKm} onChangeText={(value) => setStepDrafts((current) => current.map((item, position) => position === index ? { ...item, distanceKm: value } : item))} placeholder="Distância (km)" placeholderTextColor={C.muted} style={[styles.input, styles.metricInput]} accessibilityLabel={`Distância da etapa ${index + 1} em quilômetros`} />
          </View>
          <TextInput value={step.targetPace} onChangeText={(value) => setStepDrafts((current) => current.map((item, position) => position === index ? { ...item, targetPace: value } : item))} placeholder="Ritmo-alvo mm:ss/km (opcional)" placeholderTextColor={C.muted} style={styles.input} accessibilityLabel={`Ritmo-alvo da etapa ${index + 1}`} />
          <TextInput value={step.instruction} onChangeText={(value) => setStepDrafts((current) => current.map((item, position) => position === index ? { ...item, instruction: value } : item))} placeholder="Instrução para o aluno (opcional)" placeholderTextColor={C.muted} multiline style={[styles.input, styles.stepInstruction]} accessibilityLabel={`Instrução da etapa ${index + 1}`} />
        </View>)}
        {stepDrafts.length < 12 ? <Pressable onPress={() => setStepDrafts((current) => [...current, { ...emptyStep(), durationMinutes: "", label: "" }])} style={({ pressed }) => [styles.addStep, pressed && styles.pressed]}><Ionicons name="add-circle-outline" size={18} color={C.ink} /><Text style={styles.addStepText}>Adicionar etapa</Text></Pressable> : null}
        <Text style={styles.formLabel}>Agendar para</Text>
        <TextInput value={scheduledDate} onChangeText={setScheduledDate} placeholder="AAAA-MM-DD" placeholderTextColor={C.muted} style={styles.input} accessibilityLabel="Data de atribuição no formato ano-mês-dia" />
        <Text style={styles.formLabel}>Aluno (opcional)</Text>
        <View style={styles.choiceWrap}>
          {athletes.data?.map((athlete) => <Pressable key={athlete.userId} onPress={() => setSelectedAthlete(athlete.userId)} style={[styles.choice, styles.athleteChoice, selectedAthlete === athlete.userId && styles.choiceSelected]}><ProfileAvatar uri={athlete.avatarUrl} name={athlete.name || athlete.email} size={23} /><Text style={[styles.choiceText, selectedAthlete === athlete.userId && styles.choiceTextSelected]}>{athlete.name || athlete.email}</Text></Pressable>)}
          {!athletes.data?.length ? <Text style={styles.cardDetail}>Aprove um aluno para começar a atribuir treinos.</Text> : null}
        </View>
        <Pressable disabled={saving} onPress={makeAndAssign} style={({ pressed }) => [styles.primaryButton, saving && styles.disabled, pressed && styles.pressed]}><Text style={styles.primaryButtonText}>{createWorkout.isPending ? "Salvando…" : selectedAthlete ? "Criar e atribuir" : "Salvar treino"}</Text></Pressable>
      </View>

      {workouts.data?.length ? <>
        <Text style={styles.subheading}>Treinos salvos</Text>
        {workouts.data.map((workout) => <Pressable key={workout.id} onPress={() => setSelectedWorkout(workout.id)} style={[styles.workoutCard, selectedWorkout === workout.id && styles.workoutSelected]}><View style={styles.flexCopy}><Text style={styles.cardTitle}>{workout.title}</Text><Text style={styles.cardDetail}>{workout.objective} · {workout.steps.length} etapa(s)</Text></View>{selectedWorkout === workout.id ? <Ionicons name="checkmark-circle" size={21} color={C.limeDeep} /> : <Ionicons name="radio-button-off" size={20} color={C.muted} />}</Pressable>)}
        {selectedAthlete && selectedWorkout ? <Pressable disabled={saving} onPress={assignSelected} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}><Text style={styles.secondaryText}>Atribuir treino selecionado · {scheduledDate}</Text></Pressable> : null}
      </> : null}

      <View style={styles.gap} />
      <SectionTitle title="Atividades para avaliar" />
      {feed.data?.length ? feed.data.map(({ activity, athleteName, athleteAvatarUrl, review }) => (
        <View key={activity.id} style={styles.activityCard}>
          <View style={styles.activityTop}><Pill label="REGISTRO MANUAL" tone="light" /><View style={styles.athleteIdentity}><ProfileAvatar uri={athleteAvatarUrl} name={athleteName} size={28} /><Text style={styles.cardDetail}>{athleteName || "Aluno"}</Text></View></View>
          <Text style={styles.cardTitle}>{activity.title}</Text>
          <Text style={styles.metricLine}>{new Date(activity.completedAt).toLocaleDateString("pt-BR")} · {(activity.distanceMeters / 1000).toFixed(2)} km  ·  {Math.floor(activity.durationSeconds / 60)} min  ·  {activity.perceivedEffort ? effortLabels[activity.perceivedEffort] : "sem percepção"}</Text>
          {activity.athleteNote ? <Text style={styles.athleteNote}>“{activity.athleteNote}”</Text> : null}
          {review ? <View style={styles.reviewed}><Text style={styles.reviewedTitle}>Avaliado · {review.rating}/5</Text><Text style={styles.cardDetail}>{review.comment}</Text></View> : <>
            <View style={styles.ratingRow}>{[1, 2, 3, 4, 5].map((rating) => <Pressable key={rating} accessibilityLabel={`Avaliar com ${rating} de 5`} onPress={() => setReviewRatings((current) => ({ ...current, [activity.id]: rating }))} style={styles.starButton}><Ionicons name={rating <= (reviewRatings[activity.id] ?? 5) ? "star" : "star-outline"} size={22} color={C.limeDeep} /></Pressable>)}</View>
            <TextInput value={reviewDrafts[activity.id] ?? ""} onChangeText={(value) => setReviewDrafts((current) => ({ ...current, [activity.id]: value }))} placeholder="Deixe seu comentário para o aluno" placeholderTextColor={C.muted} multiline style={[styles.input, styles.reviewInput]} />
            <Pressable disabled={reviewActivity.isPending} onPress={() => saveReview(activity.id)} style={({ pressed }) => [styles.smallPrimary, pressed && styles.pressed]}><Text style={styles.smallPrimaryText}>Enviar avaliação</Text></Pressable>
          </>}
        </View>
      )) : <View style={styles.emptyCard}><Text style={styles.emptyTitle}>Tudo em dia</Text><Text style={styles.cardDetail}>Os registros manuais dos alunos aparecerão aqui para avaliação.</Text></View>}
      <View style={styles.gap} />
      <CoachNote label="STRAVA">O histórico Strava é particular do aluno: não aparece neste feed nem pode receber avaliação do Treinador. Esta área avalia apenas registros manuais enviados pelo aluno.</CoachNote>
    </Screen>
  );
}

function AthleteClub() {
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
      return;
    }
    try {
      await submit.mutateAsync({ assignmentId, title, distanceMeters, durationSeconds, activityDate: draft.date, perceivedEffort: draft.effort, athleteNote: draft.note.trim() || undefined });
      setNotice("Treino registrado. Seu treinador poderá avaliar quando abrir o registro.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Não foi possível registrar o treino.");
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

  if (assignments.isLoading || activities.isLoading) return <LoadingState />;

  return (
    <Screen scroll>
      <AppHeader eyebrow="SEU CLUBE" title="Meus treinos" />
      {pageError ? <View style={styles.errorCard}><Text style={styles.errorText}>Não foi possível carregar seus treinos. Tente novamente.</Text></View> : null}
      {notice ? <Text accessibilityRole="alert" style={styles.notice}>{notice}</Text> : null}
      <SectionTitle title="Agenda" />
      {assignments.data?.length ? assignments.data.map((assignment) => {
        const draft = drafts[assignment.id] ?? emptyActivityDraft();
        return <View key={assignment.id} style={styles.athleteWorkout}>
          <View style={styles.activityTop}><Pill label={assignment.status === "completed" ? "CONCLUÍDO" : "ATRIBUÍDO"} tone={assignment.status === "completed" ? "lime" : "light"} /><Text style={styles.cardDetail}>{String(assignment.scheduledDate)}</Text></View>
          <Text style={styles.cardTitle}>{assignment.title}</Text>
          <Text style={styles.cardDetail}>{assignment.objective}</Text>
          {assignment.description ? <Text style={styles.athleteNote}>{assignment.description}</Text> : null}
          {assignment.steps.length ? <View style={styles.stepsCard}>
            <Text style={styles.stepsTitle}>ETAPAS DO TREINO</Text>
            {assignment.steps.map((step) => <View key={step.id} style={styles.stepRow}>
              <View style={styles.stepDot} />
              <View style={styles.flexCopy}>
                <Text style={styles.stepLabel}>{step.stepOrder}. {step.label}</Text>
                <Text style={styles.cardDetail}>{step.durationSeconds ? `${Math.round(step.durationSeconds / 60)} min` : ""}{step.distanceMeters ? ` · ${(step.distanceMeters / 1000).toFixed(1)} km` : ""}{step.targetPaceSecondsPerKm ? ` · ${Math.floor(step.targetPaceSecondsPerKm / 60)}:${String(step.targetPaceSecondsPerKm % 60).padStart(2, "0")}/km` : ""}</Text>
                {step.instruction ? <Text style={styles.athleteNote}>{step.instruction}</Text> : null}
              </View>
            </View>)}
          </View> : null}
          {assignment.status === "assigned" ? <>
            <Text style={styles.formLabel}>Depois do treino</Text>
            <TextInput value={draft.date} onChangeText={(value) => setDrafts((current) => ({ ...current, [assignment.id]: { ...draft, date: value } }))} placeholder="AAAA-MM-DD" placeholderTextColor={C.muted} style={styles.input} accessibilityLabel="Data em que realizou o treino no formato ano-mês-dia" />
            <View style={styles.metricsInputRow}>
              <TextInput keyboardType="decimal-pad" value={draft.distance} onChangeText={(value) => setDrafts((current) => ({ ...current, [assignment.id]: { ...draft, distance: value } }))} placeholder="km" placeholderTextColor={C.muted} style={[styles.input, styles.metricInput]} accessibilityLabel="Distância em quilômetros" />
              <TextInput keyboardType="decimal-pad" value={draft.minutes} onChangeText={(value) => setDrafts((current) => ({ ...current, [assignment.id]: { ...draft, minutes: value } }))} placeholder="minutos" placeholderTextColor={C.muted} style={[styles.input, styles.metricInput]} accessibilityLabel="Tempo em minutos" />
            </View>
            <View style={styles.choiceWrap}>{(["easy", "challenging", "intense"] as Effort[]).map((effort) => <Pressable key={effort} onPress={() => setDrafts((current) => ({ ...current, [assignment.id]: { ...draft, effort } }))} style={[styles.choice, draft.effort === effort && styles.choiceSelected]}><Text style={[styles.choiceText, draft.effort === effort && styles.choiceTextSelected]}>{effortLabels[effort]}</Text></Pressable>)}</View>
            <TextInput value={draft.note} onChangeText={(value) => setDrafts((current) => ({ ...current, [assignment.id]: { ...draft, note: value } }))} placeholder="Como foi? (opcional)" placeholderTextColor={C.muted} multiline style={[styles.input, styles.reviewInput]} />
            <Pressable disabled={submit.isPending} onPress={() => onSubmit(assignment.id, assignment.title)} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}><Text style={styles.primaryButtonText}>{submit.isPending ? "Salvando…" : "Registrar treino feito"}</Text></Pressable>
          </> : null}
        </View>;
      }) : <View style={styles.emptyCard}><Text style={styles.emptyTitle}>Sua agenda começa aqui</Text><Text style={styles.cardDetail}>Quando o treinador atribuir um treino, ele aparece nesta lista.</Text></View>}

      <View style={styles.gap} />
      <SectionTitle title="Registrar outra corrida" />
      <View style={styles.formCard}>
        <Text style={styles.cardDetail}>Atividade manual sem treino atribuído. Ao salvar, ela ficará visível ao seu treinador para acompanhamento.</Text>
        <Text style={styles.formLabel}>Nome da atividade</Text>
        <TextInput value={manualDraft.title} onChangeText={(value) => setManualDraft((current) => ({ ...current, title: value }))} placeholder="Ex.: Corrida no parque" placeholderTextColor={C.muted} style={styles.input} />
        <Text style={styles.formLabel}>Data em que correu</Text>
        <TextInput value={manualDraft.date} onChangeText={(value) => setManualDraft((current) => ({ ...current, date: value }))} placeholder="AAAA-MM-DD" placeholderTextColor={C.muted} style={styles.input} accessibilityLabel="Data da corrida no formato ano-mês-dia" />
        <View style={styles.metricsInputRow}>
          <TextInput keyboardType="decimal-pad" value={manualDraft.distance} onChangeText={(value) => setManualDraft((current) => ({ ...current, distance: value }))} placeholder="km" placeholderTextColor={C.muted} style={[styles.input, styles.metricInput]} accessibilityLabel="Distância da corrida manual em quilômetros" />
          <TextInput keyboardType="decimal-pad" value={manualDraft.minutes} onChangeText={(value) => setManualDraft((current) => ({ ...current, minutes: value }))} placeholder="minutos" placeholderTextColor={C.muted} style={[styles.input, styles.metricInput]} accessibilityLabel="Tempo da corrida manual em minutos" />
        </View>
        <View style={styles.choiceWrap}>{(["easy", "challenging", "intense"] as Effort[]).map((effort) => <Pressable key={effort} onPress={() => setManualDraft((current) => ({ ...current, effort }))} style={[styles.choice, manualDraft.effort === effort && styles.choiceSelected]}><Text style={[styles.choiceText, manualDraft.effort === effort && styles.choiceTextSelected]}>{effortLabels[effort]}</Text></Pressable>)}</View>
        <TextInput value={manualDraft.note} onChangeText={(value) => setManualDraft((current) => ({ ...current, note: value }))} placeholder="Observações (opcional)" placeholderTextColor={C.muted} multiline style={[styles.input, styles.reviewInput]} />
        <Pressable disabled={submit.isPending} onPress={onManualSubmit} style={({ pressed }) => [styles.primaryButton, submit.isPending && styles.disabled, pressed && styles.pressed]}><Text style={styles.primaryButtonText}>{submit.isPending ? "Salvando…" : "Salvar atividade manual"}</Text></Pressable>
      </View>

      <View style={styles.gap} />
      <SectionTitle title="Histórico e avaliações" />
      {activities.data?.length ? activities.data.map((activity) => (
        <View key={activity.id} style={styles.activityCard}>
          <View style={styles.activityTop}><Pill label={activity.source === "strava" ? "STRAVA" : "REGISTRO MANUAL"} tone={activity.source === "strava" ? "coral" : "light"} />{activity.review ? <Pill label="AVALIADO" tone="lime" /> : null}</View>
          <Text style={styles.cardTitle}>{activity.title}</Text>
          <Text style={styles.metricLine}>{new Date(activity.completedAt).toLocaleDateString("pt-BR")} · {(activity.distanceMeters / 1000).toFixed(2)} km  ·  {Math.floor(activity.durationSeconds / 60)} min · {activity.perceivedEffort ? effortLabels[activity.perceivedEffort] : ""}</Text>
          {activity.review ? <CoachNote label={`AVALIAÇÃO · ${activity.review.rating}/5`}>{activity.review.comment}</CoachNote> : <Text style={styles.cardDetail}>Aguardando avaliação do treinador.</Text>}
        </View>
      )) : <View style={styles.emptyCard}><Text style={styles.cardDetail}>Seus treinos concluídos e comentários do treinador ficam guardados aqui.</Text></View>}
      <View style={styles.gap} />
      <CoachNote label="STRAVA">Conectaremos o Strava depois que o app de desenvolvedor for criado. Nenhuma atividade foi sincronizada ainda.</CoachNote>
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.paper },
  countBadge: { minWidth: 58, minHeight: 48, borderRadius: 16, backgroundColor: C.lime, alignItems: "center", justifyContent: "center", paddingHorizontal: 10 },
  countNumber: { color: C.ink, fontSize: 17, fontWeight: "900" },
  countLabel: { color: C.ink, fontSize: 9, fontWeight: "800" },
  gap: { height: 27 },
  requestCard: { minHeight: 71, flexDirection: "row", alignItems: "center", gap: 10, padding: 12, marginBottom: 9, borderWidth: 1, borderColor: C.line, borderRadius: 18, backgroundColor: C.white },
  avatar: { width: 39, height: 39, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: C.coral },
  avatarText: { color: C.white, fontSize: 15, fontWeight: "900" },
  flexCopy: { flex: 1, gap: 3 },
  cardTitle: { color: C.ink, fontSize: 15, lineHeight: 20, fontWeight: "900" },
  cardDetail: { color: C.muted, fontSize: 11, lineHeight: 16, fontWeight: "600" },
  approveButton: { width: 38, height: 38, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: C.lime },
  rejectButton: { width: 38, height: 38, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: C.stone },
  pressed: { opacity: 0.72 },
  emptyCard: { padding: 17, borderRadius: 18, backgroundColor: C.white, borderWidth: 1, borderColor: C.line, gap: 4 },
  emptyTitle: { color: C.ink, fontSize: 14, fontWeight: "900" },
  formCard: { padding: 16, borderRadius: 21, backgroundColor: C.white, borderWidth: 1, borderColor: C.line, gap: 9 },
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
  activityCard: { padding: 15, borderRadius: 19, backgroundColor: C.white, borderWidth: 1, borderColor: C.line, marginBottom: 10, gap: 9 },
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
  athleteWorkout: { padding: 15, borderRadius: 20, backgroundColor: C.white, borderWidth: 1, borderColor: C.line, marginBottom: 11, gap: 9 },
  stepsCard: { padding: 12, borderRadius: 15, backgroundColor: C.paper, gap: 9, marginTop: 3 },
  stepsTitle: { color: C.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  stepRow: { flexDirection: "row", alignItems: "flex-start", gap: 9 },
  stepDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5, backgroundColor: C.limeDeep },
  stepLabel: { color: C.ink, fontSize: 12, fontWeight: "900" },
  metricsInputRow: { flexDirection: "row", gap: 9 },
  metricInput: { flex: 1 },
});
