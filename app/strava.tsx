import { useMemo, useState } from "react";
import { ActivityIndicator, Alert, Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import * as ExpoLinking from "expo-linking";
import Svg, { Polyline } from "react-native-svg";
import { Redirect, useRouter } from "expo-router";

import { BackButton, C, CoachNote, Pill, PrimaryButton, Screen, SectionTitle } from "@/components/run-ui";
import { MemberGate } from "@/components/member-gate";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";
import {
  RUN_CLUB_APP_SCHEME,
  STRAVA_CALLBACK_PATH,
  cadenceDisplay,
  downsampleSeries,
  type StravaActivityDetail,
  type StravaActivityStreams,
  type StravaActivitySummary,
} from "@/shared/strava";

const PAGE_SIZE = 20;

function getStravaRedirectUri(): string {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    return `${window.location.origin}${STRAVA_CALLBACK_PATH}`;
  }
  return ExpoLinking.createURL(STRAVA_CALLBACK_PATH, { scheme: RUN_CLUB_APP_SCHEME });
}

function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "—";
  const total = Math.round(totalSeconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatPace(speedMps: number | null | undefined): string {
  if (typeof speedMps !== "number" || !Number.isFinite(speedMps) || speedMps <= 0) return "—";
  const totalSeconds = Math.round(1000 / speedMps);
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}/km`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Data não informada";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function optionalNumber(value: number | null, suffix = "", digits = 0): string | null {
  if (value === null || !Number.isFinite(value)) return null;
  return `${value.toFixed(digits)}${suffix}`;
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricTile}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const points = useMemo(() => {
    const finite = values.filter((value) => Number.isFinite(value));
    if (finite.length < 2) return "";
    const sampled = downsampleSeries(finite, 100);
    const low = Math.min(...sampled);
    const high = Math.max(...sampled);
    const range = high - low || 1;
    return sampled.map((value, index) => {
      const x = (index / Math.max(sampled.length - 1, 1)) * 316 + 2;
      const y = 42 - ((value - low) / range) * 36;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
  }, [values]);
  if (!points) return null;
  return <Svg width="100%" height={48} viewBox="0 0 320 48" preserveAspectRatio="none"><Polyline points={points} fill="none" stroke={C.limeDeep} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" /></Svg>;
}

function StreamCard({
  label,
  unit,
  values,
  multiplier = 1,
  digits = 0,
}: {
  label: string;
  unit: string;
  values: number[];
  multiplier?: number;
  digits?: number;
}) {
  const numbers = values.map((value) => value * multiplier).filter(Number.isFinite);
  if (!numbers.length) return null;
  const average = numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
  const min = Math.min(...numbers);
  const max = Math.max(...numbers);
  return (
    <View style={styles.streamCard}>
      <View style={styles.streamHeader}>
        <Text style={styles.streamTitle}>{label}</Text>
        <Text style={styles.streamAverage}>média {average.toFixed(digits)} {unit}</Text>
      </View>
      <Sparkline values={numbers} />
      <Text style={styles.streamRange}>mín. {min.toFixed(digits)} · máx. {max.toFixed(digits)} {unit}</Text>
    </View>
  );
}

function metricRows(activity: StravaActivityDetail): { label: string; value: string }[] {
  const cadence = cadenceDisplay(activity.sportType || activity.type);
  const rows: { label: string; value: string | null }[] = [
    { label: "Distância", value: optionalNumber(activity.distanceMeters / 1000, " km", 2) },
    { label: "Tempo em movimento", value: formatDuration(activity.movingTimeSeconds) },
    { label: "Tempo total", value: formatDuration(activity.elapsedTimeSeconds) },
    { label: "Ritmo médio", value: formatPace(activity.averageSpeedMps) },
    { label: "Velocidade máxima", value: optionalNumber(activity.maxSpeedMps === null ? null : activity.maxSpeedMps * 3.6, " km/h", 1) },
    { label: "Elevação acumulada", value: optionalNumber(activity.elevationGainMeters, " m", 0) },
    { label: "FC média", value: optionalNumber(activity.averageHeartRate, " bpm") },
    { label: "FC máxima", value: optionalNumber(activity.maxHeartRate, " bpm") },
    { label: "Cadência média", value: optionalNumber(activity.averageCadence === null ? null : activity.averageCadence * cadence.multiplier, ` ${cadence.unit}`, 0) },
    { label: "Potência média", value: optionalNumber(activity.averageWatts, " W") },
    { label: "Potência ponderada", value: optionalNumber(activity.weightedAverageWatts, " W") },
    { label: "Trabalho", value: optionalNumber(activity.kilojoules, " kJ", 0) },
    { label: "Calorias", value: optionalNumber(activity.calories, " kcal", 0) },
    { label: "Temperatura média", value: optionalNumber(activity.averageTempC, " °C", 1) },
    { label: "Esforço Strava", value: optionalNumber(activity.sufferScore, " pontos") },
    { label: "Inclinação média", value: optionalNumber(activity.averageGradePercent, "%", 1) },
    { label: "Inclinação máxima", value: optionalNumber(activity.maxGradePercent, "%", 1) },
  ];
  return rows.filter((row): row is { label: string; value: string } => row.value !== null);
}

function ActivityDetails({
  activity,
  streams,
  streamsLoading,
  streamsError,
  onLoadStreams,
}: {
  activity: StravaActivityDetail;
  streams?: StravaActivityStreams;
  streamsLoading: boolean;
  streamsError: boolean;
  onLoadStreams: () => void;
}) {
  const cadence = cadenceDisplay(activity.sportType || activity.type);
  const streamRows = [
    { key: "heartrate", label: "Frequência cardíaca", unit: "bpm", digits: 0 },
    { key: "cadence", label: "Cadência", unit: cadence.unit, multiplier: cadence.multiplier, digits: 0 },
    { key: "watts", label: "Potência", unit: "W", digits: 0 },
    { key: "altitude", label: "Altitude", unit: "m", digits: 0 },
    { key: "velocity_smooth", label: "Velocidade", unit: "km/h", multiplier: 3.6, digits: 1 },
    { key: "temp", label: "Temperatura", unit: "°C", digits: 1 },
    { key: "grade_smooth", label: "Inclinação", unit: "%", digits: 1 },
  ] as const;

  return (
    <View style={styles.detailCard}>
      <View style={styles.detailHeading}>
        <View style={styles.detailHeadingCopy}>
          <Text style={styles.detailTitle}>Métricas da atividade</Text>
          <Text style={styles.detailHint}>Dados retornados pelo Strava para esta corrida.</Text>
        </View>
        <Pill label={activity.sportType || activity.type} tone="lime" />
      </View>
      <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(`https://www.strava.com/activities/${activity.id}`)}>
        <Text style={styles.stravaLink}>View on Strava</Text>
      </Pressable>
      <View style={styles.metricGrid}>
        {metricRows(activity).map((item) => <MetricTile key={item.label} label={item.label} value={item.value} />)}
      </View>
      {activity.splitsMetric.length ? (
        <View style={styles.splitsBlock}>
          <Text style={styles.subheading}>Parciais por quilômetro</Text>
          {activity.splitsMetric.map((split, index) => (
            <View key={`split-${index}`} style={styles.splitRow}>
              <Text style={styles.splitLabel}>{split.split ?? index + 1} km</Text>
              <Text style={styles.splitValue}>{formatPace(split.averageSpeedMps)} · {formatDuration(split.movingTimeSeconds ?? split.elapsedTimeSeconds ?? 0)}</Text>
              {split.averageHeartRate !== null ? <Text style={styles.splitExtra}>{Math.round(split.averageHeartRate)} bpm</Text> : null}
            </View>
          ))}
        </View>
      ) : null}
      {activity.bestEfforts.length ? (
        <View style={styles.splitsBlock}>
          <Text style={styles.subheading}>Melhores esforços registrados</Text>
          {activity.bestEfforts.map((effort, index) => (
            <View key={`effort-${index}`} style={styles.splitRow}>
              <Text style={styles.splitLabel}>{effort.distanceMeters ? `${(effort.distanceMeters / 1000).toFixed(2)} km` : `Esforço ${index + 1}`}</Text>
              <Text style={styles.splitValue}>{formatDuration(effort.movingTimeSeconds ?? effort.elapsedTimeSeconds ?? 0)} · {formatPace(effort.averageSpeedMps)}</Text>
            </View>
          ))}
        </View>
      ) : null}
      <View style={styles.streamsBlock}>
        <View style={styles.streamIntro}>
          <View style={styles.detailHeadingCopy}>
            <Text style={styles.subheading}>Métricas ao longo da corrida</Text>
            <Text style={styles.detailHint}>Séries disponíveis no Strava, consultadas somente quando você pede.</Text>
          </View>
        </View>
        {!streams && !streamsLoading ? <Pressable onPress={onLoadStreams} style={({ pressed }) => [styles.streamButton, pressed && styles.pressed]}><Text style={styles.streamButtonText}>Carregar métricas avançadas</Text></Pressable> : null}
        {streamsLoading ? <ActivityIndicator color={C.ink} style={styles.streamSpinner} /> : null}
        {streamsError ? <Text style={styles.errorText}>Não foi possível carregar as séries agora. Tente novamente.</Text> : null}
        {streams ? (
          <View style={styles.streamList}>
            {streamRows.map((row) => (
              <StreamCard
                key={row.key}
                label={row.label}
                unit={row.unit}
                values={streams[row.key] ?? []}
                multiplier={"multiplier" in row ? row.multiplier : 1}
                digits={row.digits}
              />
            ))}
            {!Object.values(streams).some((values) => values.length) ? <Text style={styles.detailHint}>O Strava não disponibilizou séries de sensores para esta atividade.</Text> : null}
          </View>
        ) : null}
      </View>
      <Text style={styles.disclaimer}>Frequência cardíaca, cadência, potência e temperatura dependem dos sensores e dos dados registrados no Strava. O Run Club não salva estas métricas no histórico do Clube.</Text>
    </View>
  );
}

function StravaHome() {
  const router = useRouter();
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState<Record<number, StravaActivitySummary[]>>({});
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const [showStreams, setShowStreams] = useState(false);
  const [notice, setNotice] = useState("");
  const status = trpc.strava.status.useQuery(undefined, {
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });
  const activitiesQuery = trpc.strava.activities.useQuery({ page }, {
    enabled: status.data?.connected === true,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });
  const detailQuery = trpc.strava.activityDetail.useQuery(
    { activityId: selectedActivityId ?? "1" },
    { enabled: status.data?.connected === true && selectedActivityId !== null, staleTime: 0, gcTime: 0, retry: false, refetchOnReconnect: false, refetchOnWindowFocus: false },
  );
  const streamsQuery = trpc.strava.activityStreams.useQuery(
    { activityId: selectedActivityId ?? "1" },
    { enabled: status.data?.connected === true && selectedActivityId !== null && showStreams, staleTime: 0, gcTime: 0, retry: false, refetchOnReconnect: false, refetchOnWindowFocus: false },
  );
  const start = trpc.strava.start.useMutation();
  const disconnect = trpc.strava.disconnect.useMutation({
    onSuccess: async (result) => {
      setPages({});
      setPage(1);
      setSelectedActivityId(null);
      setShowStreams(false);
      await status.refetch();
      setNotice(result.remoteRevoked
        ? "A conexão foi removida e o Strava confirmou a revogação."
        : "O vínculo e os tokens foram removidos deste app, mas o Strava não confirmou a revogação. Para garantir a retirada, remova Run Club Magagna em strava.com/settings/apps.");
    },
    onError: (error) => setNotice(error.message),
  });

  const activities = useMemo(() => {
    const saved = Object.keys(pages)
      .map(Number)
      .sort((a, b) => a - b)
      .flatMap((number) => pages[number] ?? []);
    const current = activitiesQuery.data && !pages[page] ? activitiesQuery.data : [];
    return Array.from(new Map([...saved, ...current].map((item) => [item.id, item])).values());
  }, [activitiesQuery.data, page, pages]);
  const authorizationInvalid = [
    activitiesQuery.error?.data?.code,
    detailQuery.error?.data?.code,
    streamsQuery.error?.data?.code,
  ].includes("PRECONDITION_FAILED");
  const visibleActivities = authorizationInvalid ? [] : activities;
  const refreshConnectionStatus = () => {
    setPages({});
    setPage(1);
    setSelectedActivityId(null);
    setShowStreams(false);
    void status.refetch();
  };
  const loadNextPage = () => {
    const currentPage = activitiesQuery.data;
    if (!currentPage || currentPage.length < PAGE_SIZE || activitiesQuery.isFetching || page >= 100) return;
    setPages((current) => ({ ...current, [page]: currentPage }));
    setPage((current) => Math.min(current + 1, 100));
  };
  const redirectUri = getStravaRedirectUri();

  const connect = async () => {
    setNotice("");
    if (!consentAccepted) {
      setNotice("Leia e aceite o aviso de privacidade antes de conectar sua conta Strava.");
      return;
    }
    try {
      const { authorizationUrl } = await start.mutateAsync({
        platform: Platform.OS === "web" ? "web" : "native",
        returnUri: redirectUri,
        consentAccepted: true,
      });
      if (Platform.OS === "web") {
        window.location.assign(authorizationUrl);
      } else {
        await Linking.openURL(authorizationUrl);
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Não foi possível iniciar a conexão Strava.");
    }
  };

  const refresh = async () => {
    setNotice("");
    setPages({});
    setSelectedActivityId(null);
    setShowStreams(false);
    if (page !== 1) setPage(1);
    else await activitiesQuery.refetch();
  };

  const disconnectAccount = () => {
    const run = () => disconnect.mutate();
    const message = "O Run Club Magagna removerá o vínculo e os tokens locais, e tentará revogar o acesso no Strava. Se a revogação não for confirmada, remova o app em strava.com/settings/apps. Suas atividades não foram salvas no Clube.";
    if (Platform.OS === "web" && typeof window !== "undefined") {
      if (window.confirm(message)) run();
    } else {
      Alert.alert("Desconectar Strava?", message, [
        { text: "Cancelar", style: "cancel" },
        { text: "Desconectar", style: "destructive", onPress: run },
      ]);
    }
  };

  const selectActivity = (activityId: string) => {
    setSelectedActivityId((current) => current === activityId ? null : activityId);
    setShowStreams(false);
  };

  const selectedActivity = visibleActivities.find((activity) => activity.id === selectedActivityId);

  return (
    <Screen scroll>
      <BackButton onPress={() => router.back()} />
      <View style={styles.header}>
        <Text style={styles.eyebrow}>HISTÓRICO PESSOAL</Text>
        <Text style={styles.title}>Seu Strava</Text>
        <Text style={styles.headerText}>Conecte sua conta para consultar suas próprias corridas e métricas, direto da fonte.</Text>
      </View>

      <CoachNote label="PRIVACIDADE" >
        Este espaço é só seu. O Treinador e os outros alunos não podem ver atividades importadas do Strava. Elas também não entram no histórico avaliável do Clube.
      </CoachNote>

      {status.isLoading ? <ActivityIndicator size="large" color={C.ink} style={styles.statusSpinner} /> : null}
      {status.error ? <Text style={styles.errorText}>Não foi possível verificar a conexão Strava. Tente novamente.</Text> : null}

      {status.data?.connected ? (
        <View style={styles.connectionCard}>
          <View style={styles.connectionTop}>
            <Pill label="CONECTADO" tone="lime" />
            <Text style={styles.connectedDate}>{status.data.connectedAt ? `Desde ${formatDate(status.data.connectedAt)}` : "Conta vinculada"}</Text>
          </View>
          <Text style={styles.connectionTitle}>Sua conta está conectada</Text>
          <Text style={styles.connectionCopy}>Cada atualização consulta o Strava ao vivo. O app não grava as atividades nem as métricas no banco do Clube. Para excluir os dados da integração no Run Club, use “Desconectar e revogar acesso”; isso remove tokens, hash, escopos e estados OAuth locais. Para também retirar a autorização na Strava, remova Run Club Magagna em strava.com/settings/apps.</Text>
          <Pressable disabled={disconnect.isPending} onPress={disconnectAccount} style={({ pressed }) => [styles.disconnectButton, disconnect.isPending && styles.disabled, pressed && styles.pressed]}>
            {disconnect.isPending ? <ActivityIndicator color={C.ink} /> : <Text style={styles.disconnectText}>Desconectar e revogar acesso</Text>}
          </Pressable>
        </View>
      ) : status.data?.configured ? (
        <View style={styles.connectionCard}>
          <View style={styles.connectionTop}><Pill label="NÃO CONECTADO" tone="light" /></View>
          <Text style={styles.connectionTitle}>Seu histórico, na sua conta</Text>
          <Text style={styles.connectionCopy}>O app consulta nome e data das corridas, distância, tempos, ritmo, elevação e, quando disponíveis, frequência cardíaca, cadência, potência, temperatura, parciais e séries de sensores. A finalidade é mostrar seu histórico somente a você; activity:read não inclui atividades “Somente você”. Enquanto conectado, guardamos tokens OAuth criptografados, escopos e um hash do identificador Strava para manter o vínculo; o ID legível e as atividades/métricas não são salvos. Ao desconectar, removemos token, hash, escopos e estados OAuth locais; atividades removidas no Strava deixam de aparecer na próxima atualização.</Text>
          <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: consentAccepted }} onPress={() => setConsentAccepted((checked) => !checked)} style={styles.consentRow}>
            <View style={[styles.checkbox, consentAccepted && styles.checkboxChecked]}>{consentAccepted ? <Text style={styles.checkmark}>✓</Text> : null}</View>
            <Text style={styles.consentText}>Entendi que o Run Club consultará minhas atividades sob demanda, que só eu as verei e que os tokens ficam criptografados no servidor enquanto conectado. Posso desconectar no app e revogar o acesso na Strava a qualquer momento.</Text>
          </Pressable>
          <PrimaryButton label={start.isPending ? "Abrindo Strava…" : "Conectar minha conta Strava"} icon="arrow-forward" onPress={() => void connect()} />
          <Text style={styles.scopeNote}>Permissão solicitada: activity:read. O app não pede acesso a atividades privadas nesta etapa.</Text>
          <Text style={styles.scopeNote}>A capacidade é controlada no painel Strava: app novo aceita 1 atleta; para alunos adicionais, o responsável deve elevar para 10. Acima disso, a Strava exige revisão do app.</Text>
        </View>
      ) : status.data ? (
        <View style={styles.setupCard}>
          <Pill label="AGUARDANDO CONFIGURAÇÃO" tone="light" />
          <Text style={styles.connectionTitle}>Integração Strava ainda não ativada</Text>
          <Text style={styles.connectionCopy}>O responsável pelo app precisa cadastrar o app de desenvolvedor Strava e inserir o Client ID, o Client Secret e uma chave de criptografia dedicada por configuração protegida. Seus dados não são simulados.</Text>
          <Text style={styles.setupLabel}>Callback HTTPS para cadastrar no painel Strava</Text>
          {status.data.callbackUri ? <Text selectable style={styles.callbackUri}>{status.data.callbackUri}</Text> : <Text style={styles.callbackUri}>Aguardando o endereço público da API.</Text>}
          <Text style={styles.setupLabel}>Domínio de callback</Text>
          <Text selectable style={styles.callbackUri}>{status.data.callbackUri ? new URL(status.data.callbackUri).hostname : "Indisponível"}</Text>
          <Text style={styles.scopeNote}>Apps novos do Strava começam com capacidade para um atleta; para liberar alunos adicionais, o responsável precisa elevar a capacidade no painel do Strava.</Text>
        </View>
      ) : null}

      {notice ? <Text accessibilityRole="alert" style={styles.notice}>{notice}</Text> : null}

      {status.data?.connected ? (
        <>
          <View style={styles.sectionGap} />
          {authorizationInvalid ? (
            <View style={styles.connectionCard}>
              <Text style={styles.errorText}>A autorização não está mais ativa. Por privacidade, o histórico exibido foi ocultado.</Text>
              <Pressable accessibilityRole="button" onPress={refreshConnectionStatus} style={({ pressed }) => [styles.refreshConnectionButton, pressed && styles.pressed]}>
                <Text style={styles.loadMoreText}>Atualizar estado da conexão</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View style={styles.listHeader}>
                <SectionTitle title="Suas atividades" action={activitiesQuery.isFetching ? "Atualizando" : "Atualizar"} onPress={() => void refresh()} />
              </View>
              {activitiesQuery.error ? <Text style={styles.errorText}>{activitiesQuery.error.message}</Text> : null}
              {activitiesQuery.isLoading ? <ActivityIndicator size="large" color={C.ink} style={styles.statusSpinner} /> : null}
              {!activitiesQuery.isLoading && !activitiesQuery.error && visibleActivities.length === 0 ? (
                <View style={styles.emptyCard}><Text style={styles.emptyTitle}>Nenhuma atividade disponível</Text><Text style={styles.emptyText}>Quando houver atividades visíveis para sua conta no Strava, elas aparecerão aqui.</Text></View>
              ) : null}
              <View style={styles.activityList}>
            {visibleActivities.map((activity) => {
              const selected = selectedActivityId === activity.id;
              return (
                <View key={activity.id} style={styles.activityCard}>
                  <Pressable accessibilityRole="button" onPress={() => selectActivity(activity.id)} style={({ pressed }) => [styles.activityPress, pressed && styles.pressed]}>
                    <View style={styles.activityTitleRow}>
                      <View style={styles.activityTitleCopy}>
                        <Text style={styles.activityName} numberOfLines={2}>{activity.name}</Text>
                        <Text style={styles.activitySub}>{formatDate(activity.startDateLocal || activity.startDate)} · {activity.sportType || activity.type}</Text>
                      </View>
                      <Text style={styles.activityChevron}>{selected ? "−" : "+"}</Text>
                    </View>
                    <View style={styles.activityMetrics}>
                      <Text style={styles.activityMetric}>{(activity.distanceMeters / 1000).toFixed(2)} km</Text>
                      <Text style={styles.activityDot}>·</Text>
                      <Text style={styles.activityMetric}>{formatDuration(activity.movingTimeSeconds)}</Text>
                      <Text style={styles.activityDot}>·</Text>
                      <Text style={styles.activityMetric}>{formatPace(activity.averageSpeedMps)}</Text>
                    </View>
                    {activity.averageHeartRate !== null ? <Text style={styles.activityHeartrate}>FC média {Math.round(activity.averageHeartRate)} bpm</Text> : null}
                  </Pressable>
                  {selected ? (
                    <View style={styles.detailContainer}>
                      {detailQuery.isLoading ? <ActivityIndicator color={C.ink} /> : null}
                      {detailQuery.error ? <Text style={styles.errorText}>{detailQuery.error.message}</Text> : null}
                      {detailQuery.data && selectedActivity ? (
                        <ActivityDetails
                          activity={detailQuery.data}
                          streams={streamsQuery.data}
                          streamsLoading={streamsQuery.isLoading}
                          streamsError={Boolean(streamsQuery.error)}
                          onLoadStreams={() => {
                            if (showStreams) void streamsQuery.refetch();
                            else setShowStreams(true);
                          }}
                        />
                      ) : null}
                    </View>
                  ) : null}
                </View>
              );
            })}
              </View>
              {activitiesQuery.data?.length === PAGE_SIZE && page < 100 ? (
            <Pressable disabled={activitiesQuery.isFetching} onPress={loadNextPage} style={({ pressed }) => [styles.loadMore, activitiesQuery.isFetching && styles.disabled, pressed && styles.pressed]}>
              {activitiesQuery.isFetching ? <ActivityIndicator color={C.ink} /> : <Text style={styles.loadMoreText}>Carregar atividades anteriores</Text>}
            </Pressable>
          ) : null}
              <Text style={styles.footerPrivacy}>Compatible with Strava. Dados fornecidos pelo Strava. Atualizações são feitas somente quando você abre/atualiza a tela ou pede métricas; não há sincronização em segundo plano.</Text>
            </>
          )}
        </>
      ) : null}
    </Screen>
  );
}

export default function StravaScreen() {
  const { user } = useAuth();
  if (user?.role === "admin") return <Redirect href="/(tabs)/profile" />;
  return <MemberGate><StravaHome /></MemberGate>;
}

const styles = StyleSheet.create({
  header: { marginBottom: 20 },
  eyebrow: { color: C.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1.55, marginBottom: 6 },
  title: { color: C.ink, fontSize: 32, fontWeight: "900", letterSpacing: -1.1 },
  headerText: { color: C.muted, fontSize: 13, lineHeight: 19, fontWeight: "600", marginTop: 8 },
  statusSpinner: { marginVertical: 26 },
  connectionCard: { marginTop: 18, backgroundColor: C.white, borderRadius: 22, borderWidth: 1, borderColor: C.line, padding: 17, gap: 12 },
  connectionTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  connectedDate: { flex: 1, textAlign: "right", color: C.muted, fontSize: 10, fontWeight: "700" },
  connectionTitle: { color: C.ink, fontSize: 19, fontWeight: "900", letterSpacing: -0.35, marginTop: 2 },
  connectionCopy: { color: C.inkSoft, fontSize: 12, lineHeight: 18, fontWeight: "600" },
  consentRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 6 },
  checkbox: { width: 22, height: 22, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: C.muted, borderRadius: 6, marginTop: 1 },
  checkboxChecked: { backgroundColor: C.lime, borderColor: C.ink },
  checkmark: { color: C.ink, fontSize: 15, lineHeight: 19, fontWeight: "900" },
  consentText: { flex: 1, color: C.inkSoft, fontSize: 11, lineHeight: 17, fontWeight: "600" },
  scopeNote: { color: C.muted, fontSize: 10, lineHeight: 15, fontWeight: "600" },
  disconnectButton: { minHeight: 46, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: C.line, borderRadius: 14, backgroundColor: C.paper, marginTop: 3 },
  disconnectText: { color: C.ink, fontSize: 12, fontWeight: "800" },
  setupCard: { marginTop: 18, backgroundColor: C.white, borderRadius: 22, borderWidth: 1, borderColor: C.line, padding: 17, gap: 11 },
  setupLabel: { color: C.ink, fontSize: 11, fontWeight: "900", marginTop: 4 },
  callbackUri: { color: C.inkSoft, fontSize: 11, lineHeight: 16, padding: 10, borderRadius: 11, backgroundColor: C.paper, overflow: "hidden" },
  sectionGap: { height: 30 },
  listHeader: { marginBottom: 1 },
  emptyCard: { padding: 18, borderRadius: 18, backgroundColor: C.white, borderWidth: 1, borderColor: C.line },
  emptyTitle: { color: C.ink, fontSize: 15, fontWeight: "900" },
  emptyText: { color: C.muted, fontSize: 12, lineHeight: 17, fontWeight: "600", marginTop: 5 },
  activityList: { gap: 10 },
  activityCard: { overflow: "hidden", borderRadius: 18, backgroundColor: C.white, borderWidth: 1, borderColor: C.line },
  activityPress: { padding: 15 },
  activityTitleRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  activityTitleCopy: { flex: 1 },
  activityName: { color: C.ink, fontSize: 15, lineHeight: 20, fontWeight: "900" },
  activitySub: { color: C.muted, fontSize: 10, lineHeight: 15, fontWeight: "700", marginTop: 3 },
  activityChevron: { width: 27, height: 27, borderRadius: 10, backgroundColor: C.lime, color: C.ink, textAlign: "center", textAlignVertical: "center", fontSize: 20, lineHeight: 27, fontWeight: "800" },
  activityMetrics: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 13 },
  activityMetric: { color: C.ink, fontSize: 12, fontWeight: "900" },
  activityDot: { color: C.muted, fontSize: 13, fontWeight: "900" },
  activityHeartrate: { color: C.muted, fontSize: 10, fontWeight: "700", marginTop: 5 },
  detailContainer: { borderTopWidth: 1, borderTopColor: C.line, padding: 13, backgroundColor: "#FCFCF8" },
  detailCard: { gap: 14 },
  detailHeading: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 },
  detailHeadingCopy: { flex: 1, gap: 3 },
  stravaLink: { color: "#FC5200", fontSize: 11, fontWeight: "800", textDecorationLine: "underline", paddingVertical: 4 },
  detailTitle: { color: C.ink, fontSize: 16, fontWeight: "900" },
  detailHint: { color: C.muted, fontSize: 10, lineHeight: 15, fontWeight: "600" },
  metricGrid: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  metricTile: { width: "48%", minHeight: 59, justifyContent: "center", padding: 9, borderRadius: 12, backgroundColor: C.white, borderWidth: 1, borderColor: C.line },
  metricValue: { color: C.ink, fontSize: 14, fontWeight: "900" },
  metricLabel: { color: C.muted, fontSize: 9, fontWeight: "700", marginTop: 2 },
  splitsBlock: { gap: 7 },
  subheading: { color: C.ink, fontSize: 12, fontWeight: "900" },
  splitRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: C.line },
  splitLabel: { minWidth: 50, color: C.ink, fontSize: 10, fontWeight: "900" },
  splitValue: { flex: 1, color: C.inkSoft, fontSize: 10, fontWeight: "700" },
  splitExtra: { color: C.muted, fontSize: 9, fontWeight: "700" },
  streamsBlock: { gap: 10, paddingTop: 6, borderTopWidth: 1, borderTopColor: C.line },
  streamIntro: { flexDirection: "row", alignItems: "center" },
  streamButton: { minHeight: 42, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: C.sand },
  streamButtonText: { color: C.ink, fontSize: 11, fontWeight: "900" },
  streamSpinner: { margin: 14 },
  streamList: { gap: 8 },
  streamCard: { padding: 9, borderRadius: 12, backgroundColor: C.white, borderWidth: 1, borderColor: C.line },
  streamHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  streamTitle: { color: C.ink, fontSize: 10, fontWeight: "900" },
  streamAverage: { color: C.inkSoft, fontSize: 9, fontWeight: "700" },
  streamRange: { color: C.muted, fontSize: 9, fontWeight: "600" },
  refreshConnectionButton: { minHeight: 42, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: C.sand },
  disclaimer: { color: C.muted, fontSize: 9, lineHeight: 14, fontWeight: "600" },
  footerPrivacy: { color: C.muted, fontSize: 10, lineHeight: 15, fontWeight: "600", textAlign: "center", marginTop: 14 },
  notice: { color: C.inkSoft, backgroundColor: C.sky, padding: 11, borderRadius: 12, fontSize: 11, lineHeight: 16, fontWeight: "700", marginTop: 14 },
  errorText: { color: "#A74736", fontSize: 11, lineHeight: 16, fontWeight: "700", marginVertical: 6 },
  loadMore: { minHeight: 47, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: C.sand, marginTop: 13 },
  loadMoreText: { color: C.ink, fontSize: 12, fontWeight: "900" },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.72 },
});
