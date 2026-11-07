import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState, type ComponentProps } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line, Path } from "react-native-svg";

import { BarChart, formatDuration, formatKm, formatPace } from "@/components/dashboard-ui";
import { tapProps } from "@/components/run-map";
import { C, SectionTitle } from "@/components/run-ui";
import { localToday } from "@/hooks/use-insights";
import { trpc } from "@/lib/trpc";
import { MIN_ANALYSIS_RUNS, type Correlation, type CorrelationKey, type LoadStatus, type RunAnalysis, type RunDiagnostic } from "@/shared/run-analysis";

const DATA = "#46600A";
const ZONES = ["#C4E04A", "#83A510", "#46600A"];
const POSITIVE = "#D9482B";
const NEGATIVE = "#0B8CB0";
const PLOT = { width: 320, height: 200, left: 8, right: 8, top: 10, bottom: 10 };

const FACTORS: Record<CorrelationKey, { label: string; axis: string; rising: string; format: (value: number) => string }> = {
  distance: { label: "Distância", axis: "Distância da corrida (km)", rising: "Quanto maior a distância", format: (value) => `${formatKm(value * 1000, 1)} km` },
  climb: { label: "Subida por km", axis: "Subida por km (m)", rising: "Quanto mais subida por km", format: (value) => `${value.toFixed(1).replace(".", ",")} m/km` },
  heartRate: { label: "Frequência cardíaca", axis: "Frequência cardíaca média (bpm)", rising: "Quanto mais alta a frequência cardíaca", format: (value) => `${Math.round(value)} bpm` },
  recentLoad: { label: "Km nos 7 dias anteriores", axis: "Km nos 7 dias anteriores", rising: "Quanto mais km nos 7 dias anteriores", format: (value) => `${formatKm(value * 1000, 1)} km` },
  rest: { label: "Dias de descanso antes", axis: "Dias desde a corrida anterior", rising: "Quanto mais descanso antes", format: (value) => `${Math.round(value)} ${Math.round(value) === 1 ? "dia" : "dias"}` },
};

const LOAD: Record<LoadStatus, { title: string; text: string; icon: ComponentProps<typeof Ionicons>["name"] }> = {
  low: { title: "Carga abaixo do habitual", text: "Os últimos 7 dias ficaram abaixo da sua média recente.", icon: "arrow-down-circle-outline" },
  ok: { title: "Carga dentro do habitual", text: "Os últimos 7 dias estão perto da sua média recente.", icon: "checkmark-circle-outline" },
  high: { title: "Carga subiu rápido", text: "Os últimos 7 dias passaram bem da sua média recente. Vale conversar com o treinador.", icon: "alert-circle-outline" },
};

const decimal = (value: number, digits = 2) => value.toFixed(digits).replace(".", ",");
const percent = (value: number) => `${Math.round(value * 100)}%`;
const signed = (value: number) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${decimal(Math.abs(value))}`;

function strength(r: number) {
  const size = Math.abs(r);
  return size < 0.2 ? "quase nenhuma" : size < 0.4 ? "fraca" : size < 0.6 ? "moderada" : "forte";
}

function reading({ key, r }: Correlation) {
  const factor = FACTORS[key];
  if (Math.abs(r) < 0.2) return `Sem relação clara entre ${factor.label.toLowerCase()} e ritmo.`;
  return `${factor.rising}, mais ${r > 0 ? "lento" : "rápido"} tende a ser o ritmo.`;
}

function scales(values: number[], from: number, to: number) {
  const low = Math.min(...values);
  const high = Math.max(...values);
  const span = high - low || 1;
  return (value: number) => from + ((value - low) / span) * (to - from);
}

function fitLine(points: { x: number; y: number }[]) {
  const n = points.length;
  const meanX = points.reduce((sum, point) => sum + point.x, 0) / n;
  const meanY = points.reduce((sum, point) => sum + point.y, 0) / n;
  const spread = points.reduce((sum, point) => sum + (point.x - meanX) ** 2, 0);
  const slope = spread ? points.reduce((sum, point) => sum + (point.x - meanX) * (point.y - meanY), 0) / spread : 0;
  return (x: number) => meanY + slope * (x - meanX);
}

function Scatter({ item }: { item: Correlation }) {
  const [picked, setPicked] = useState<number | null>(null);
  const factor = FACTORS[item.key];
  const xs = item.points.map((point) => point.x);
  const ys = item.points.map((point) => point.y);
  const x = scales(xs, PLOT.left, PLOT.width - PLOT.right);
  // Faster runs sit higher on the chart, so "up" always reads as better.
  const y = scales(ys, PLOT.top, PLOT.height - PLOT.bottom);
  const fit = fitLine(item.points);
  const [minX, maxX] = [Math.min(...xs), Math.max(...xs)];
  const point = picked === null ? null : item.points[picked];

  return <View>
    <Text style={styles.axisY}>Ritmo: mais rápido para cima</Text>
    <View style={styles.plot}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${PLOT.width} ${PLOT.height}`}>
        <Line x1={PLOT.left} y1={PLOT.height - 1} x2={PLOT.width - PLOT.right} y2={PLOT.height - 1} stroke={C.line} strokeWidth={1} />
        <Line x1={x(minX)} y1={y(fit(minX))} x2={x(maxX)} y2={y(fit(maxX))} stroke={C.muted} strokeWidth={1.5} strokeDasharray="5 4" />
        {item.points.map((entry, index) => <Circle key={`${entry.date}-${index}`} cx={x(entry.x)} cy={y(entry.y)} r={picked === index ? 6 : 4} fill={DATA} fillOpacity={picked === index ? 1 : 0.6} stroke={C.white} strokeWidth={1} />)}
        {item.points.map((entry, index) => <Circle key={`hit-${index}`} cx={x(entry.x)} cy={y(entry.y)} r={10} fill="transparent" {...tapProps(() => setPicked(index))} />)}
      </Svg>
    </View>
    <View style={styles.axisX}>
      <Text style={styles.axisText}>{factor.format(minX)}</Text>
      <Text style={styles.axisText}>{factor.axis}</Text>
      <Text style={styles.axisText}>{factor.format(maxX)}</Text>
    </View>
    <Text style={styles.readout}>{point ? `${point.date.split("-").reverse().join("/")}: ${factor.format(point.x)} a ${formatPace(point.y)} /km` : "Toque em um ponto para ver a corrida."}</Text>
  </View>;
}

function PaceLine({ weeks }: { weeks: RunAnalysis["weeklyPace"] }) {
  const known = weeks.flatMap((week, index) => (week.pace ? [{ index, pace: week.pace }] : []));
  if (known.length < 2) return null;
  const x = scales([0, weeks.length - 1], PLOT.left, PLOT.width - PLOT.right - 4);
  const y = scales(known.map((week) => week.pace), 8, 90);
  const path = known.map((week, order) => `${order ? "L" : "M"}${x(week.index).toFixed(1)} ${y(week.pace).toFixed(1)}`).join("");
  const last = known[known.length - 1];
  return <View>
    <View style={styles.lineChart}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${PLOT.width} 98`}>
        <Path d={path} fill="none" stroke={DATA} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        {known.map((week) => <Circle key={week.index} cx={x(week.index)} cy={y(week.pace)} r={4} fill={DATA} stroke={C.white} strokeWidth={2} />)}
      </Svg>
    </View>
    <View style={styles.axisX}>
      <Text style={styles.axisText}>{formatPace(known[0].pace)} /km há 12 semanas</Text>
      <Text style={styles.axisStrong}>{formatPace(last.pace)} /km agora</Text>
    </View>
  </View>;
}

function Tile({ value, label, note }: { value: string; label: string; note?: string }) {
  return <View style={styles.tile}>
    <Text style={styles.tileValue}>{value}</Text>
    <Text style={styles.tileLabel}>{label}</Text>
    {note ? <Text style={styles.tileNote}>{note}</Text> : null}
  </View>;
}

/** The computed analysis, shared by the Dados tab and the coach's athlete sheet. */
export function RunAnalysisPanel({ analysis, subject = "you" }: { analysis: RunAnalysis; subject?: "you" | "athlete" }) {
  const { load, trend, intensity, correlations, predictions, weeks, weeklyPace, runs } = analysis;
  const [picked, setPicked] = useState<CorrelationKey | null>(null);
  const selected = useMemo(() => correlations.find((item) => item.key === picked) ?? correlations[0], [correlations, picked]);
  const status = load.status ? LOAD[load.status] : null;
  const zones = [
    { label: "Leve", share: intensity.easy },
    { label: "Moderado", share: intensity.moderate },
    { label: "Forte", share: intensity.hard },
  ];
  const paceChange = trend.recentPace && trend.previousPace ? trend.recentPace - trend.previousPace : null;

  return <View>
    <SectionTitle title="Análises" />
    <Text style={styles.intro}>{runs} corridas dos últimos 6 meses. Estes números são calculados pelo app.</Text>

    {status ? <View style={styles.card}>
      <View style={styles.statusRow}>
        <Ionicons name={status.icon} size={22} color={C.ink} />
        <View style={styles.flex}>
          <Text style={styles.cardTitle}>{status.title}</Text>
          <Text style={styles.copy}>{subject === "you" ? status.text : status.text.replace(" Vale conversar com o treinador.", "")}</Text>
        </View>
      </View>
      <View style={styles.tiles}>
        <Tile value={`${decimal(load.acuteKm, 1)} km`} label="últimos 7 dias" />
        <Tile value={`${decimal(load.chronicWeeklyKm, 1)} km`} label="média por semana (28 dias)" />
      </View>
    </View> : null}

    <Text style={styles.chartTitle}>Volume das últimas 8 semanas</Text>
    <View style={styles.card}><BarChart buckets={weeks.slice(-8)} /></View>

    <Text style={styles.chartTitle}>Ritmo médio por semana</Text>
    <View style={styles.card}><Text style={styles.axisY}>Mais rápido para cima</Text><PaceLine weeks={weeklyPace} /></View>

    <View style={styles.tiles}>
      <Tile value={paceChange === null ? "—" : `${paceChange > 0 ? "+" : paceChange < 0 ? "−" : ""}${Math.abs(paceChange)} s/km`} label="ritmo em 28 dias" note={paceChange === null ? "sem comparação" : paceChange < 0 ? "mais rápido" : paceChange > 0 ? "mais lento" : "igual"} />
      {trend.recentEfficiency ? <Tile value={decimal(trend.recentEfficiency)} label="metros por batimento" note={trend.previousEfficiency ? `antes: ${decimal(trend.previousEfficiency)}` : undefined} /> : <Tile value={`${decimal(trend.recentKm, 1)} km`} label="km em 28 dias" note={`antes: ${decimal(trend.previousKm, 1)} km`} />}
    </View>

    <Text style={styles.chartTitle}>Base: tempo por intensidade</Text>
    <View style={styles.card}>
      <View style={styles.stack}>{zones.map((zone, index) => (zone.share ? <View key={zone.label} style={[styles.stackPart, { flex: zone.share, backgroundColor: ZONES[index] }]} /> : null))}</View>
      <View style={styles.legend}>{zones.map((zone, index) => <View key={zone.label} style={styles.legendItem}><View style={[styles.swatch, { backgroundColor: ZONES[index] }]} /><Text style={styles.legendText}>{zone.label} {percent(zone.share)}</Text></View>)}</View>
      <Text style={styles.copy}>{intensity.basis === "heartRate" ? "Calculado pela frequência cardíaca média de cada corrida." : "Estimado pelo ritmo, porque faltam dados de frequência cardíaca."} Uma referência comum é cerca de 80% do tempo em intensidade leve.</Text>
    </View>

    {correlations.length && selected ? <>
      <Text style={styles.chartTitle}>O que anda junto com o seu ritmo</Text>
      <View style={styles.card}>
        {correlations.map((item) => {
          const active = item.key === selected.key;
          const width = `${Math.round(Math.abs(item.r) * 50)}%` as const;
          return <Pressable key={item.key} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={() => setPicked(item.key)} style={[styles.corrRow, active && styles.corrRowOn]}>
            <View style={styles.corrTop}>
              <Text style={styles.corrLabel}>{FACTORS[item.key].label}</Text>
              <Text style={styles.corrValue}>{signed(item.r)} · {strength(item.r)}</Text>
            </View>
            <View style={styles.corrTrack}>
              <View style={styles.corrZero} />
              <View style={[styles.corrBar, { width, backgroundColor: item.r > 0 ? POSITIVE : NEGATIVE }, item.r > 0 ? styles.corrRight : styles.corrLeft]} />
            </View>
          </Pressable>;
        })}
        <View style={styles.corrScale}><Text style={styles.axisText}>−1 mais rápido</Text><Text style={styles.axisText}>+1 mais lento</Text></View>
        <View style={styles.divider} />
        <Text style={styles.cardTitle}>{reading(selected)}</Text>
        <Text style={styles.copy}>{selected.n} corridas. Correlação mostra o que anda junto, não o que causa.</Text>
        <Scatter key={selected.key} item={selected} />
      </View>
    </> : null}

    {predictions.length ? <>
      <Text style={styles.chartTitle}>Tempos estimados</Text>
      <View style={styles.tiles}>{predictions.map((item) => <Tile key={item.label} value={formatDuration(item.seconds)} label={item.label} />)}</View>
      <Text style={styles.copy}>Estimativa pelas melhores corridas dos últimos 90 dias, de 3 km para cima. Em distâncias bem maiores que as treinadas, ela costuma ser otimista.</Text>
    </> : null}
  </View>;
}

function DiagnosticResult({ result }: { result: RunDiagnostic }) {
  const parts: [string, string[]][] = [["Pontos fortes", result.strengths], ["Pontos de atenção", result.attention], ["Próximas semanas", result.nextWeeks]];
  return <View style={styles.result}>
    <Text style={styles.headline}>{result.headline}</Text>
    {parts.map(([title, items]) => (items.length ? <View key={title} style={styles.part}>
      <Text style={styles.partTitle}>{title}</Text>
      {items.map((item) => <Text key={item} style={styles.partItem}>• {item}</Text>)}
    </View> : null))}
    <Text style={styles.aiNote}>Gerado por IA a partir dos números acima. Pode errar: confira com o treinador.</Text>
  </View>;
}

/** The Dados tab's analysis, with the AI reading on top only when the member asks for it. */
export function RunAnalysisSection() {
  const input = { today: localToday(), tzOffsetMinutes: new Date().getTimezoneOffset() };
  const query = trpc.insights.analysis.useQuery(input, { staleTime: 60_000 });
  const diagnostic = trpc.insights.diagnostic.useMutation();

  if (query.isLoading) return <ActivityIndicator color={C.ink} />;
  if (!query.data?.analysis) {
    return <View>
      <SectionTitle title="Análises" />
      <View style={styles.card}><Text style={styles.copy}>As análises aparecem a partir de {MIN_ANALYSIS_RUNS} corridas nos últimos 6 meses.</Text></View>
    </View>;
  }

  return <View>
    {query.data.aiConfigured ? <View style={styles.aiCard}>
      <Text style={styles.aiEyebrow}>RUN BASE TO DATA</Text>
      <Text style={styles.aiTitle}>Diagnóstico da sua base</Text>
      {diagnostic.data ? <DiagnosticResult result={diagnostic.data} /> : <Text style={styles.aiCopy}>A IA lê seus números e aponta forças, cuidados e próximos passos. Enviamos ao Cohere só totais e médias, sem seu nome e sem lugares.</Text>}
      {diagnostic.error ? <Text style={styles.aiError}>{diagnostic.error.message}</Text> : null}
      <Pressable accessibilityRole="button" disabled={diagnostic.isPending} onPress={() => diagnostic.mutate(input)} style={({ pressed }) => [styles.aiButton, pressed && styles.pressed]}>
        {diagnostic.isPending ? <ActivityIndicator color={C.ink} /> : <Text style={styles.aiButtonText}>{diagnostic.data ? "Gerar de novo" : "Gerar diagnóstico"}</Text>}
      </Pressable>
    </View> : null}
    <RunAnalysisPanel analysis={query.data.analysis} />
  </View>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  intro: { color: C.inkSoft, fontSize: 12, fontWeight: "600", marginBottom: 12 },
  card: { gap: 10, padding: 14, borderRadius: 20, backgroundColor: C.white, borderWidth: 1, borderColor: C.line, marginBottom: 12 },
  cardTitle: { color: C.ink, fontSize: 14, fontWeight: "900" },
  chartTitle: { color: C.ink, fontSize: 14, fontWeight: "900", marginTop: 8, marginBottom: 8 },
  copy: { color: C.inkSoft, fontSize: 12, lineHeight: 18, fontWeight: "600" },
  statusRow: { flexDirection: "row", gap: 10 },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  tile: { flexGrow: 1, flexBasis: "30%", minWidth: 96, padding: 12, borderRadius: 16, backgroundColor: C.stone },
  tileValue: { color: C.ink, fontSize: 17, fontWeight: "900" },
  tileLabel: { color: C.inkSoft, fontSize: 11, fontWeight: "700", marginTop: 2 },
  tileNote: { color: C.muted, fontSize: 11, fontWeight: "700", marginTop: 1 },
  stack: { flexDirection: "row", gap: 2, height: 20 },
  stackPart: { borderRadius: 4 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  swatch: { width: 12, height: 12, borderRadius: 4 },
  legendText: { color: C.inkSoft, fontSize: 12, fontWeight: "700" },
  corrRow: { gap: 6, padding: 8, borderRadius: 12 },
  corrRowOn: { backgroundColor: C.stone },
  corrTop: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  corrLabel: { flex: 1, color: C.ink, fontSize: 12, fontWeight: "800" },
  corrValue: { color: C.inkSoft, fontSize: 12, fontWeight: "700" },
  corrTrack: { height: 8, justifyContent: "center" },
  corrZero: { position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, backgroundColor: C.muted },
  corrBar: { position: "absolute", top: 1, height: 6, borderRadius: 3 },
  corrRight: { left: "50%" },
  corrLeft: { right: "50%" },
  corrScale: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 8 },
  divider: { height: 1, backgroundColor: C.line },
  axisY: { color: C.muted, fontSize: 11, fontWeight: "700" },
  plot: { width: "100%", maxWidth: 560, aspectRatio: 1.6, alignSelf: "center" },
  lineChart: { width: "100%", maxWidth: 560, aspectRatio: 3.26, alignSelf: "center" },
  axisX: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  axisText: { color: C.muted, fontSize: 10, fontWeight: "700" },
  axisStrong: { color: C.ink, fontSize: 11, fontWeight: "800" },
  readout: { color: C.inkSoft, fontSize: 12, fontWeight: "700", marginTop: 6 },
  aiCard: { gap: 8, padding: 16, borderRadius: 22, backgroundColor: C.ink, marginBottom: 16 },
  aiEyebrow: { color: C.lime, fontSize: 10, fontWeight: "900", letterSpacing: 1.5 },
  aiTitle: { color: C.white, fontSize: 20, fontWeight: "900" },
  aiCopy: { color: "#D6DCDF", fontSize: 13, lineHeight: 19, fontWeight: "600" },
  aiError: { color: "#FFB4A6", fontSize: 12, fontWeight: "700" },
  aiButton: { minHeight: 46, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: C.lime, marginTop: 4 },
  aiButtonText: { color: C.ink, fontSize: 14, fontWeight: "900" },
  pressed: { opacity: 0.75 },
  result: { gap: 10 },
  headline: { color: C.white, fontSize: 15, lineHeight: 21, fontWeight: "800" },
  part: { gap: 3 },
  partTitle: { color: C.lime, fontSize: 12, fontWeight: "900" },
  partItem: { color: "#E6EAEC", fontSize: 13, lineHeight: 19, fontWeight: "600" },
  aiNote: { color: "#A9B4BA", fontSize: 11, fontWeight: "600" },
});
