import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState, type ComponentProps } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { DayPicker } from "@/components/coach-plans";
import { BarChart, EmptyState, Segmented, formatDay, formatDuration, formatKm, formatPace } from "@/components/dashboard-ui";
import { ProfileAvatar } from "@/components/profile-avatar";
import { ReviewForm } from "@/components/review-form";
import { BackButton, C, CoachNote, SectionTitle } from "@/components/run-ui";
import { localToday } from "@/hooks/use-insights";
import { trpc } from "@/lib/trpc";
import { startOfWeek } from "@/shared/insights";

type Filter = "all" | "mine" | "none" | "overdue" | "review";
type SheetTab = "overview" | "workouts" | "runs";
type IconName = ComponentProps<typeof Ionicons>["name"];

const EFFORT_LABELS = { easy: "Leve", challenging: "Desafiador", intense: "Intenso" } as const;
const errorText = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);
const shortDate = (value: Date | string) => new Date(value).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

function lastRunText(days: number | null) {
  if (days === null) return "Nenhuma corrida registrada";
  if (days <= 0) return "Última corrida hoje";
  return days === 1 ? "Última corrida ontem" : `Última corrida há ${days} dias`;
}

function lastAccessText(value: Date | string) {
  const days = Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000);
  if (days <= 0) return "acessou hoje";
  return days === 1 ? "acessou ontem" : `acessou há ${days} dias`;
}

function coachesText(coaches: { name: string; isMe: boolean }[]) {
  if (!coaches.length) return "Sem treinador";
  const names = coaches.map((coach) => (coach.isMe ? "você" : coach.name.split(" ")[0]));
  const text = names.length > 1 ? `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}` : names[0];
  return `Acompanhado por ${text}`;
}

function stravaNote(isMe: boolean, status: "ok" | "off" | "failed") {
  if (!isMe) return "O histórico Strava é particular de cada aluno e não aparece aqui. Estes números vêm dos treinos registrados no clube.";
  if (status === "ok") return "Estes números incluem as suas corridas do Strava. Só você vê esse histórico.";
  if (status === "failed") return "Não foi possível consultar o Strava agora, então estes números mostram só os treinos do clube.";
  return "Conecte seu Strava no Perfil para suas corridas aparecerem aqui.";
}

/** Every athlete in the club, whichever coach follows them, with their week at a glance. */
export function CoachAthletes({ onOpen, onNotice }: { onOpen: (athleteId: number) => void; onNotice: (text: string) => void }) {
  const today = localToday();
  const utils = trpc.useUtils();
  const athletes = trpc.club.clubAthletes.useQuery({ today });
  const follow = trpc.club.followAthlete.useMutation({ onSuccess: () => Promise.all([utils.club.clubAthletes.invalidate(), utils.club.athletes.invalidate(), utils.club.coachActivityFeed.invalidate()]) });
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  if (athletes.isLoading) return <ActivityIndicator color={C.ink} style={styles.loading} />;
  const all = athletes.data ?? [];
  if (!all.length) return <EmptyState icon="people-outline" title="Nenhum aluno aprovado ainda" text="Aprove os pedidos de acesso para começar a turma." />;

  const matches: Record<Filter, (athlete: (typeof all)[number]) => boolean> = {
    all: () => true,
    mine: (athlete) => athlete.followedByMe,
    none: (athlete) => !athlete.coaches.length && !athlete.isCoachAccount,
    overdue: (athlete) => athlete.summary.overdue > 0,
    review: (athlete) => athlete.summary.toReview > 0,
  };
  const filters: { value: Filter; label: string }[] = [
    { value: "all", label: "Todos" },
    { value: "mine", label: "Meus alunos" },
    { value: "none", label: "Sem treinador" },
    { value: "overdue", label: "Atrasados" },
    { value: "review", label: "Para avaliar" },
  ];
  const query = search.trim().toLowerCase();
  const list = all
    .filter(matches[filter])
    .filter((athlete) => !query || `${athlete.name} ${athlete.email}`.toLowerCase().includes(query))
    .sort((a, b) => Number(b.isMe) - Number(a.isMe)
      || Number(b.followedByMe) - Number(a.followedByMe)
      || (b.summary.overdue + b.summary.toReview) - (a.summary.overdue + a.summary.toReview)
      || (a.name ?? "").localeCompare(b.name ?? ""));

  return (
    <View style={styles.listWrap}>
      <TextInput value={search} onChangeText={setSearch} placeholder="Buscar por nome ou e-mail" placeholderTextColor={C.muted} style={styles.search} accessibilityLabel="Buscar aluno" />
      <View style={styles.chips}>
        {filters.map((item) => {
          const active = filter === item.value;
          return (
            <Pressable key={item.value} onPress={() => setFilter(item.value)} style={[styles.chip, active && styles.chipOn]}>
              <Text style={[styles.chipText, active && styles.chipTextOn]}>{item.label} · {all.filter(matches[item.value]).length}</Text>
            </Pressable>
          );
        })}
      </View>

      {list.map((athlete) => {
        const { summary } = athlete;
        return (
          <Pressable key={athlete.userId} onPress={() => onOpen(athlete.userId)} accessibilityLabel={`Abrir ficha de ${athlete.name || athlete.email}`} style={({ pressed }) => [styles.row, athlete.followedByMe && styles.rowMine, pressed && styles.pressed]}>
            <View style={styles.rowTop}>
              <ProfileAvatar uri={athlete.avatarUrl} name={athlete.name || athlete.email} size={44} />
              <View style={styles.flex}>
                <Text style={styles.rowName} numberOfLines={1}>{athlete.name || athlete.email}{athlete.isMe ? " (você)" : ""}</Text>
                {athlete.isCoachAccount
                  ? <Text style={styles.muted} numberOfLines={1}>Seus dados de aluno</Text>
                  : <Text style={[styles.muted, !athlete.coaches.length && styles.noCoach]} numberOfLines={1}>{coachesText(athlete.coaches)}</Text>}
              </View>
              {athlete.followedByMe || athlete.isCoachAccount ? <Ionicons name="chevron-forward" size={18} color={C.muted} /> : (
                <Pressable
                  disabled={follow.isPending}
                  onPress={(event) => {
                    event.stopPropagation();
                    follow.mutate({ athleteId: athlete.userId }, {
                      onSuccess: () => onNotice(`Você agora acompanha ${athlete.name || "este aluno"}.`),
                      onError: (error) => onNotice(errorText(error, "Não foi possível acompanhar.")),
                    });
                  }}
                  accessibilityLabel={`Acompanhar ${athlete.name || athlete.email}`}
                  style={({ pressed }) => [styles.follow, pressed && styles.pressed]}
                >
                  <Ionicons name="add" size={14} color={C.ink} />
                  <Text style={styles.followText}>Acompanhar</Text>
                </Pressable>
              )}
            </View>
            <View style={styles.tags}>
              <Tag text={summary.weekPlanned ? `${summary.weekDone} de ${summary.weekPlanned} treinos` : "Sem treino na semana"} />
              <Tag text={`${formatKm(summary.weekDistanceMeters)} km na semana`} />
              {summary.overdue ? <Tag hot text={`${summary.overdue} atrasado${summary.overdue > 1 ? "s" : ""}`} /> : null}
              {summary.toReview ? <Tag lime text={`${summary.toReview} para avaliar`} /> : null}
            </View>
            <Text style={styles.muted}>{lastRunText(summary.daysSinceLastRun)}</Text>
          </Pressable>
        );
      })}
      {!list.length ? <Text style={styles.helper}>Nenhum aluno neste filtro.</Text> : null}
    </View>
  );
}

/** Everything about one athlete: who follows them, how the training is going, sends and runs. */
export function AthleteSheet({ athleteId, onBack }: { athleteId: number; onBack: () => void }) {
  const today = localToday();
  const router = useRouter();
  const utils = trpc.useUtils();
  const detail = trpc.club.athleteDetail.useQuery({ athleteId, today });
  const refresh = () => Promise.all([
    utils.club.athleteDetail.invalidate(),
    utils.club.clubAthletes.invalidate(),
    utils.club.athletes.invalidate(),
    utils.club.coachActivityFeed.invalidate(),
    utils.club.coachAssignments.invalidate(),
    utils.club.workouts.invalidate(),
  ]);
  const follow = trpc.club.followAthlete.useMutation({ onSuccess: refresh });
  const unfollow = trpc.club.unfollowAthlete.useMutation({ onSuccess: refresh });
  const [tab, setTab] = useState<SheetTab>("overview");
  const [notice, setNotice] = useState("");
  const [sending, setSending] = useState(false);
  const [leaving, setLeaving] = useState(false);

  if (detail.isLoading) return <ActivityIndicator color={C.ink} style={styles.loading} />;
  if (!detail.data) {
    return (
      <View>
        <BackButton onPress={onBack} label="Alunos" />
        <EmptyState icon="alert-circle-outline" title="Não foi possível abrir a ficha" text="Volte para a lista e tente de novo." />
      </View>
    );
  }

  const { athlete, summary, totals, weeks, assignments, activities, strava } = detail.data;
  const firstName = (athlete.name || "Aluno").split(" ")[0];
  const open = assignments.filter((item) => item.status === "assigned").sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
  const done = assignments.filter((item) => item.status !== "assigned");
  const myOpen = open.filter((item) => item.mine).length;
  const unreviewed = activities.filter((item) => !item.review).length;

  const toggleFollow = async () => {
    setNotice("");
    try {
      if (athlete.followedByMe) {
        if (!leaving) {
          setLeaving(true);
          return;
        }
        await unfollow.mutateAsync({ athleteId });
        setLeaving(false);
        setNotice(`Você deixou de acompanhar ${firstName}.`);
      } else {
        await follow.mutateAsync({ athleteId });
        setNotice(`Você agora acompanha ${firstName}.`);
      }
    } catch (error) {
      setNotice(errorText(error, "Não foi possível alterar o acompanhamento."));
    }
  };

  return (
    <View>
      <BackButton onPress={onBack} label="Alunos" />
      <View style={styles.identity}>
        <ProfileAvatar uri={athlete.avatarUrl} name={athlete.name || athlete.email} size={64} />
        <View style={styles.flex}>
          <Text style={styles.sheetName}>{athlete.name || athlete.email}</Text>
          <Text style={styles.muted} numberOfLines={1}>{athlete.email}</Text>
          <Text style={styles.muted}>No clube desde {shortDate(athlete.createdAt)} · {lastAccessText(athlete.lastSignedIn)}</Text>
        </View>
      </View>

      {athlete.isCoachAccount ? null : <View style={styles.followCard}>
        <Text style={styles.cardLabel}>TREINADORES</Text>
        {athlete.coaches.length ? athlete.coaches.map((coach) => (
          <View key={coach.id} style={styles.coachRow}>
            <Ionicons name="person-circle-outline" size={20} color={C.inkSoft} />
            <Text style={styles.coachName}>{coach.isMe ? `${coach.name} (você)` : coach.name}</Text>
            <Text style={styles.muted}>desde {shortDate(coach.since)}</Text>
          </View>
        )) : <Text style={styles.noCoach}>Ninguém acompanha {firstName} ainda.</Text>}
        <Pressable
          disabled={follow.isPending || unfollow.isPending}
          onPress={toggleFollow}
          style={({ pressed }) => [styles.followButton, athlete.followedByMe && styles.followButtonOff, leaving && styles.followButtonDanger, pressed && styles.pressed]}
        >
          <Text style={[styles.followButtonText, leaving && styles.followButtonTextDanger]}>
            {!athlete.followedByMe ? `Acompanhar ${firstName}` : leaving ? "Toque de novo para deixar de acompanhar" : "Deixar de acompanhar"}
          </Text>
        </Pressable>
        {leaving ? (
          <Text style={styles.danger}>
            {firstName} continua no clube e o histórico é mantido.{myOpen ? ` ${myOpen} treino${myOpen > 1 ? "s" : ""} seu${myOpen > 1 ? "s" : ""} pendente${myOpen > 1 ? "s" : ""} continua${myOpen > 1 ? "m" : ""} na agenda.` : ""}
          </Text>
        ) : null}
      </View>}

      {notice ? <Text accessibilityRole="alert" style={styles.notice}>{notice}</Text> : null}

      {athlete.isCoachAccount ? null : athlete.followedByMe ? (
        <View style={styles.actions}>
          <Pressable onPress={() => setSending(!sending)} style={({ pressed }) => [styles.action, styles.actionPrimary, pressed && styles.pressed]}>
            <Ionicons name="send-outline" size={15} color={C.ink} />
            <Text style={styles.actionText}>Enviar treino</Text>
          </Pressable>
          <Pressable onPress={() => router.push({ pathname: "/(tabs)/plans", params: { novoPara: String(athleteId) } })} style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
            <Ionicons name="sparkles-outline" size={15} color={C.ink} />
            <Text style={styles.actionText}>Criar treino com IA</Text>
          </Pressable>
        </View>
      ) : <Text style={styles.helper}>Acompanhe {firstName} para enviar treinos e avaliar corridas.</Text>}
      {sending ? <SendPanel athleteId={athleteId} firstName={firstName} onDone={(text) => { setSending(false); setNotice(text); refresh(); }} /> : null}

      <Segmented<SheetTab>
        value={tab}
        onChange={setTab}
        options={[
          { value: "overview", label: "Resumo" },
          { value: "workouts", label: "Treinos", badge: summary.overdue || undefined },
          { value: "runs", label: "Corridas", badge: unreviewed || undefined },
        ]}
      />
      <View style={styles.gap} />

      {tab === "overview" ? (
        <View>
          <SectionTitle title="Esta semana" />
          <View style={styles.stats}>
            <Stat icon="checkmark-done-outline" label="Treinos feitos" value={summary.weekPlanned ? `${summary.weekDone} de ${summary.weekPlanned}` : "—"} />
            <Stat icon="map-outline" label="Distância" value={`${formatKm(summary.weekDistanceMeters)} km`} />
            <Stat icon="alert-circle-outline" label="Atrasados" value={String(summary.overdue)} hot={summary.overdue > 0} />
            <Stat icon="star-outline" label="Para avaliar" value={String(summary.toReview)} hot={summary.toReview > 0} />
          </View>
          <SectionTitle title="Últimas 8 semanas" />
          <View style={styles.chart}><BarChart buckets={weeks} /></View>
          <View style={styles.stats}>
            <Stat icon="trending-up-outline" label="Adesão aos treinos" value={summary.adherencePercent === null ? "—" : `${summary.adherencePercent}%`} />
            <Stat icon="calendar-outline" label="Km em 4 semanas" value={`${formatKm(summary.last4WeeksDistanceMeters)} km`} />
          </View>
          <SectionTitle title="Desde que entrou" />
          <View style={styles.stats}>
            <Stat icon="footsteps-outline" label="Corridas" value={String(totals.runs)} />
            <Stat icon="map-outline" label="Distância total" value={`${formatKm(totals.distanceMeters)} km`} />
            <Stat icon="time-outline" label="Tempo total" value={formatDuration(totals.durationSeconds)} />
            <Stat icon="speedometer-outline" label="Ritmo médio" value={`${formatPace(totals.paceSecondsPerKm)} /km`} />
            <Stat icon="flag-outline" label="Maior corrida" value={`${formatKm(totals.longestRunMeters)} km`} />
            <Stat icon="star-outline" label="Nota média" value={totals.averageRating === null ? "—" : `${totals.averageRating.toFixed(1).replace(".", ",")} de 5`} />
          </View>
          {athlete.isCoachAccount ? null : <>
            <SectionTitle title="Esforço que o aluno relatou" />
            <View style={styles.tags}>
              <Tag text={`Leve: ${totals.efforts.easy}`} />
              <Tag text={`Desafiador: ${totals.efforts.challenging}`} />
              <Tag text={`Intenso: ${totals.efforts.intense}`} />
            </View>
          </>}
          <Text style={styles.helper}>{lastRunText(summary.daysSinceLastRun)}.</Text>
          <View style={styles.gap} />
          <CoachNote label="STRAVA">{stravaNote(athlete.isMe, strava.status)}</CoachNote>
        </View>
      ) : null}

      {tab === "workouts" ? (
        <View>
          <SectionTitle title={`Pendentes · ${open.length}`} />
          {open.length ? open.map((item) => <OpenSend key={item.id} item={item} today={today} onNotice={setNotice} onChanged={refresh} />) : <Text style={styles.helper}>Nenhum treino pendente.</Text>}
          <View style={styles.gap} />
          <SectionTitle title={`Concluídos · ${done.length}`} />
          {done.length ? done.map((item) => (
            <View key={item.id} style={styles.send}>
              <View style={styles.sendTop}>
                <View style={styles.flex}>
                  <Text style={styles.sendTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={styles.muted} numberOfLines={1}>{formatDay(item.scheduledDate)} · {item.mine ? "você enviou" : `enviado por ${item.coachName}`}</Text>
                </View>
                <View style={[styles.status, styles.statusDone]}><Text style={styles.statusText}>{item.status === "completed" ? "Feito" : "Pulado"}</Text></View>
              </View>
            </View>
          )) : <Text style={styles.helper}>Nenhum treino concluído ainda.</Text>}
        </View>
      ) : null}

      {tab === "runs" && strava.runs.length ? (
        <View>
          <SectionTitle title={`Strava · ${strava.runs.length}`} />
          {strava.runs.map((run) => (
            <View key={run.id} style={styles.run}>
              <Text style={styles.sendTitle}>{run.title}</Text>
              <Text style={styles.muted}>{formatDay(run.date)}</Text>
              <View style={styles.tags}>
                <Tag text={`${formatKm(run.distanceMeters, 2)} km`} />
                <Tag text={formatDuration(run.movingSeconds)} />
                <Tag text={`${formatPace(run.distanceMeters ? (run.movingSeconds * 1000) / run.distanceMeters : null)} /km`} />
              </View>
            </View>
          ))}
          <View style={styles.gap} />
        </View>
      ) : null}

      {tab === "runs" ? (
        activities.length ? activities.map(({ activity, review }) => (
          <View key={activity.id} style={[styles.run, !review && styles.runOpen]}>
            <View style={styles.sendTop}>
              <View style={styles.flex}>
                <Text style={styles.sendTitle}>{activity.title}</Text>
                <Text style={styles.muted}>{shortDate(activity.completedAt)}{activity.assignmentId ? " · treino enviado" : " · corrida livre"}</Text>
              </View>
              <View style={[styles.status, review ? styles.statusDone : styles.statusOpen]}><Text style={styles.statusText}>{review ? `${review.rating} de 5` : "Aguarda"}</Text></View>
            </View>
            <View style={styles.tags}>
              <Tag text={`${formatKm(activity.distanceMeters, 2)} km`} />
              <Tag text={formatDuration(activity.durationSeconds)} />
              <Tag text={`${formatPace(activity.averagePaceSecondsPerKm)} /km`} />
              {activity.perceivedEffort ? <Tag text={EFFORT_LABELS[activity.perceivedEffort]} /> : null}
            </View>
            {activity.athleteNote ? <Text style={styles.note}>“{activity.athleteNote}”</Text> : null}
            {review ? (
              <View style={styles.reviewed}>
                <Text style={styles.reviewedTitle}>{review.mine ? "Sua avaliação" : `Avaliação de ${review.coachName}`}</Text>
                <Text style={styles.muted}>{review.comment}</Text>
              </View>
            ) : athlete.followedByMe && !athlete.isCoachAccount ? <ReviewForm activityId={activity.id} onNotice={setNotice} /> : null}
          </View>
        )) : strava.runs.length ? null : <EmptyState icon="footsteps-outline" title="Nenhuma corrida no clube" text={`As corridas que ${firstName} registrar no clube aparecem aqui.`} />
      ) : null}
    </View>
  );
}

function OpenSend({ item, today, onNotice, onChanged }: {
  item: { id: number; title: string; scheduledDate: string; coachName: string; mine: boolean };
  today: string;
  onNotice: (text: string) => void;
  onChanged: () => void;
}) {
  const reschedule = trpc.club.rescheduleAssignment.useMutation();
  const remove = trpc.club.removeAssignment.useMutation();
  const [moving, setMoving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const late = item.scheduledDate < today;

  const moveTo = async (date: string) => {
    try {
      await reschedule.mutateAsync({ assignmentId: item.id, scheduledDate: date });
      setMoving(false);
      onChanged();
      onNotice(`Treino remarcado para ${formatDay(date)}.`);
    } catch (error) {
      onNotice(errorText(error, "Não foi possível remarcar."));
    }
  };

  const drop = async () => {
    try {
      await remove.mutateAsync({ assignmentId: item.id });
      onChanged();
      onNotice("Envio removido. O aluno não verá mais este treino.");
    } catch (error) {
      onNotice(errorText(error, "Não foi possível remover."));
    }
  };

  return (
    <View style={styles.send}>
      <View style={styles.sendTop}>
        <View style={styles.flex}>
          <Text style={styles.sendTitle} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.muted} numberOfLines={1}>{formatDay(item.scheduledDate)} · {item.mine ? "você enviou" : `enviado por ${item.coachName}`}</Text>
        </View>
        <View style={[styles.status, styles.statusOpen]}><Text style={styles.statusText}>{late ? "Atrasado" : "Pendente"}</Text></View>
      </View>
      {item.mine ? (
        <View style={styles.actions}>
          <Pressable onPress={() => { setConfirming(false); setMoving(!moving); }} style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
            <Ionicons name="calendar-outline" size={15} color={C.ink} />
            <Text style={styles.actionText}>{moving ? "Fechar" : "Mudar dia"}</Text>
          </Pressable>
          <Pressable onPress={() => (confirming ? drop() : (setMoving(false), setConfirming(true)))} style={({ pressed }) => [styles.action, confirming && styles.actionDanger, pressed && styles.pressed]}>
            <Ionicons name="trash-outline" size={15} color={confirming ? C.white : C.ink} />
            <Text style={[styles.actionText, confirming && styles.actionTextDanger]}>{confirming ? "Toque de novo para remover" : "Remover"}</Text>
          </Pressable>
        </View>
      ) : null}
      {moving ? <DayPicker today={today} initialWeek={startOfWeek(item.scheduledDate < today ? today : item.scheduledDate)} value={item.scheduledDate} onPick={moveTo} /> : null}
    </View>
  );
}

function SendPanel({ athleteId, firstName, onDone }: { athleteId: number; firstName: string; onDone: (text: string) => void }) {
  const today = localToday();
  const workouts = trpc.club.workouts.useQuery();
  const assign = trpc.club.assignWorkout.useMutation();
  const [workoutId, setWorkoutId] = useState<number | null>(null);
  const [date, setDate] = useState(today);
  const [error, setError] = useState("");

  const send = async () => {
    if (!workoutId) {
      setError("Escolha um treino da biblioteca.");
      return;
    }
    try {
      await assign.mutateAsync({ athleteId, workoutId, scheduledDate: date });
      onDone(`Treino enviado para ${firstName} em ${formatDay(date)}.`);
    } catch (failure) {
      setError(errorText(failure, "Não foi possível enviar."));
    }
  };

  return (
    <View style={styles.panel}>
      <Text style={styles.label}>Qual treino</Text>
      {workouts.isLoading ? <ActivityIndicator color={C.ink} /> : null}
      {workouts.data?.length ? workouts.data.map((workout) => (
        <Pressable key={workout.id} onPress={() => setWorkoutId(workout.id)} style={[styles.pick, workoutId === workout.id && styles.pickOn]}>
          <View style={styles.flex}>
            <Text style={styles.sendTitle} numberOfLines={1}>{workout.title}</Text>
            <Text style={styles.muted} numberOfLines={1}>{workout.objective} · {workout.steps.length} etapa(s)</Text>
          </View>
          <Ionicons name={workoutId === workout.id ? "checkmark-circle" : "radio-button-off"} size={20} color={workoutId === workout.id ? C.limeDeep : C.muted} />
        </Pressable>
      )) : !workouts.isLoading ? <Text style={styles.muted}>Sua biblioteca está vazia. Use Criar treino com IA.</Text> : null}
      <Text style={styles.label}>Quando</Text>
      <DayPicker today={today} initialWeek={startOfWeek(today)} value={date} onPick={setDate} />
      {error ? <Text accessibilityRole="alert" style={styles.danger}>{error}</Text> : null}
      <Pressable disabled={assign.isPending} onPress={send} style={({ pressed }) => [styles.primary, assign.isPending && styles.disabled, pressed && styles.pressed]}>
        {assign.isPending ? <ActivityIndicator color={C.ink} /> : <Ionicons name="send" size={16} color={C.ink} />}
        <Text style={styles.primaryText}>Enviar para {formatDay(date)}</Text>
      </Pressable>
    </View>
  );
}

function Tag({ text, hot = false, lime = false }: { text: string; hot?: boolean; lime?: boolean }) {
  return <View style={[styles.tag, hot && styles.tagHot, lime && styles.tagLime]}><Text style={styles.tagText}>{text}</Text></View>;
}

function Stat({ icon, label, value, hot = false }: { icon: IconName; label: string; value: string; hot?: boolean }) {
  return (
    <View style={[styles.stat, hot && styles.statHot]}>
      <Ionicons name={icon} size={16} color={C.inkSoft} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.6 },
  flex: { flex: 1, minWidth: 0 },
  gap: { height: 16 },
  loading: { marginVertical: 24 },
  muted: { color: C.muted, fontSize: 12, lineHeight: 17, fontWeight: "600" },
  helper: { color: C.muted, fontSize: 12, lineHeight: 18, fontWeight: "600", marginTop: 6, marginBottom: 10 },
  notice: { color: C.ink, backgroundColor: C.lime, padding: 12, borderRadius: 14, fontSize: 13, fontWeight: "800", marginBottom: 12, overflow: "hidden" },
  danger: { color: "#8A2A12", fontSize: 12, lineHeight: 17, fontWeight: "700" },
  noCoach: { color: "#B4361C", fontSize: 12, fontWeight: "700" },
  label: { color: C.ink, fontSize: 11, fontWeight: "900", marginTop: 4 },

  listWrap: { gap: 10 },
  search: { minHeight: 44, borderWidth: 1, borderColor: C.line, borderRadius: 13, paddingHorizontal: 13, color: C.ink, backgroundColor: C.white, fontSize: 13, fontWeight: "600" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { minHeight: 32, justifyContent: "center", paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: C.line, backgroundColor: C.white },
  chipOn: { backgroundColor: C.ink, borderColor: C.ink },
  chipText: { color: C.ink, fontSize: 12, fontWeight: "800" },
  chipTextOn: { color: C.white },
  row: { gap: 9, padding: 13, borderRadius: 20, backgroundColor: C.white, borderWidth: 1, borderColor: "#ECEDE6" },
  rowMine: { borderColor: C.limeDeep },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 11 },
  rowName: { color: C.ink, fontSize: 15, lineHeight: 20, fontWeight: "900" },
  follow: { flexDirection: "row", alignItems: "center", gap: 3, height: 32, paddingHorizontal: 10, borderRadius: 999, backgroundColor: C.lime },
  followText: { color: C.ink, fontSize: 11, fontWeight: "900" },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  tag: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: C.paper },
  tagHot: { backgroundColor: "#F9D5CC" },
  tagLime: { backgroundColor: C.lime },
  tagText: { color: C.inkSoft, fontSize: 11, fontWeight: "800" },

  identity: { flexDirection: "row", alignItems: "center", gap: 13, marginTop: 8, marginBottom: 14 },
  sheetName: { color: C.ink, fontSize: 24, lineHeight: 29, fontWeight: "900", letterSpacing: -0.6 },
  followCard: { gap: 8, padding: 14, borderRadius: 20, backgroundColor: C.white, borderWidth: 1, borderColor: "#ECEDE6", marginBottom: 12 },
  cardLabel: { color: C.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  coachRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  coachName: { flex: 1, color: C.ink, fontSize: 14, fontWeight: "800" },
  followButton: { minHeight: 42, borderRadius: 13, alignItems: "center", justifyContent: "center", paddingHorizontal: 12, backgroundColor: C.lime, marginTop: 2 },
  followButtonOff: { backgroundColor: C.paper },
  followButtonDanger: { backgroundColor: "#B4361C" },
  followButtonText: { color: C.ink, fontSize: 13, fontWeight: "900" },
  followButtonTextDanger: { color: C.white },

  actions: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 12 },
  action: { flexDirection: "row", alignItems: "center", gap: 5, minHeight: 38, paddingHorizontal: 13, borderRadius: 999, backgroundColor: C.white, borderWidth: 1, borderColor: C.line },
  actionPrimary: { backgroundColor: C.lime, borderColor: C.lime },
  actionDanger: { backgroundColor: "#B4361C", borderColor: "#B4361C" },
  actionText: { color: C.ink, fontSize: 12, fontWeight: "800" },
  actionTextDanger: { color: C.white },
  panel: { gap: 8, padding: 12, borderRadius: 16, backgroundColor: C.white, borderWidth: 1, borderColor: "#ECEDE6", marginBottom: 12 },
  pick: { flexDirection: "row", alignItems: "center", gap: 10, padding: 11, borderRadius: 13, borderWidth: 1, borderColor: C.line, backgroundColor: C.white },
  pickOn: { borderColor: C.limeDeep, backgroundColor: "#F5F9E4" },
  primary: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 48, borderRadius: 15, backgroundColor: C.lime, marginTop: 6, paddingHorizontal: 14 },
  primaryText: { color: C.ink, fontSize: 14, fontWeight: "900" },

  stats: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  stat: { flexGrow: 1, flexBasis: "46%", gap: 3, padding: 12, borderRadius: 16, backgroundColor: C.white, borderWidth: 1, borderColor: "#ECEDE6" },
  statHot: { backgroundColor: "#FBE7E1", borderColor: "#F6C4B5" },
  statValue: { color: C.ink, fontSize: 18, fontWeight: "900", letterSpacing: -0.4 },
  statLabel: { color: C.muted, fontSize: 11, fontWeight: "700" },
  chart: { padding: 12, borderRadius: 18, backgroundColor: C.white, borderWidth: 1, borderColor: "#ECEDE6", marginBottom: 8 },

  send: { gap: 8, padding: 12, borderRadius: 16, backgroundColor: C.white, borderWidth: 1, borderColor: "#ECEDE6", marginBottom: 8 },
  sendTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  sendTitle: { color: C.ink, fontSize: 14, fontWeight: "900" },
  status: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
  statusDone: { backgroundColor: C.lime },
  statusOpen: { backgroundColor: "#F9D5CC" },
  statusText: { color: C.ink, fontSize: 10, fontWeight: "900" },

  run: { gap: 10, padding: 14, borderRadius: 20, backgroundColor: C.white, borderWidth: 1, borderColor: "#ECEDE6", marginBottom: 10 },
  runOpen: { borderColor: "#F6C4B5" },
  note: { color: C.muted, fontSize: 12, lineHeight: 18, fontWeight: "600" },
  reviewed: { padding: 12, borderRadius: 14, backgroundColor: C.sky, gap: 4 },
  reviewedTitle: { color: C.ink, fontSize: 11, fontWeight: "900" },
});
