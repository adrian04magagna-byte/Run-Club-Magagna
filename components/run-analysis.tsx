import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState, type ComponentProps } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line, Path } from "react-native-svg";

import { BarChart, Explain, formatDuration, formatKm, formatPace } from "@/components/dashboard-ui";
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
  recentLoad: { label: "Km da semana anterior", axis: "Km da semana anterior", rising: "Quanto mais km na semana anterior", format: (value) => `${formatKm(value * 1000, 1)} km` },
  rest: { label: "Dias de descanso antes", axis: "Dias desde a corrida anterior", rising: "Quanto mais descanso antes", format: (value) => `${Math.round(value)} ${Math.round(value) === 1 ? "dia" : "dias"}` },
};

const LOAD: Record<LoadStatus, { title: string; text: string; icon: ComponentProps<typeof Ionicons>["name"] }> = {
  low: { title: "Semana passada: menos km que o normal", text: "Ficou abaixo da média das 4 semanas anteriores. É normal em semanas de descanso.", icon: "arrow-down-circle-outline" },
  ok: { title: "Semana passada: km dentro do normal", text: "Ficou perto da média das 4 semanas anteriores.", icon: "checkmark-circle-outline" },
  high: { title: "Semana passada: bem mais km que o normal", text: "Passou bastante da média das 4 semanas anteriores. Vale conversar com o treinador.", icon: "alert-circle-outline" },
};

const decimal = (value: number, digits = 2) => value.toFixed(digits).replace(".", ",");
const percent = (value: number) => `${Math.round(value * 100)}%`;
const signed = (value: number) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${decimal(Math.abs(value))}`;

function relation(r: number) {
  const size = Math.abs(r);
  if (size < 0.2) return "sem relação clara";
  return `${r > 0 ? "mais lento" : "mais rápido"} · ${size < 0.4 ? "relação fraca" : size < 0.6 ? "relação moderada" : "relação forte"}`;
}

function reading({ key, r }: Correlation) {
  const factor = FACTORS[key];
  if (Math.abs(r) < 0.2) return `Sem relação clara entre ${factor.label.toLowerCase()} e ritmo.`;
  return `${factor.rising}, mais ${r > 0 ? "lento" : "rápido"} tende a ser o ritmo.`;
}

function intensityReading(easy: number) {
  if (easy >= 0.7) return "A maior parte do tempo foi em ritmo leve, o que ajuda a construir resistência.";
  if (easy >= 0.5) return "Pouco mais da metade do tempo foi em ritmo leve. Mais treinos leves ajudam a construir resistência.";
  return "Pouco tempo em ritmo leve. Correr leve parece fácil demais, mas é o que constrói resistência com menos desgaste.";
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
    <Text style={styles.axisY}>Cada ponto é uma corrida; quanto mais alto, mais rápida. A linha tracejada mostra a tendência.</Text>
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
      <Text style={styles.axisText}>{formatPace(known[0].pace)} /km no início</Text>
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
    <Text style={styles.intro}>{runs} corridas dos últimos 6 meses, em semanas de segunda a domingo. O app calcula estes números a partir das corridas.</Text>

    {status ? <View style={styles.card}>
      <View style={styles.statusRow}>
        <Ionicons name={status.icon} size={22} color={C.ink} />
        <View style={styles.flex}>
          <Text style={styles.cardTitle}>{status.title}</Text>
          <Text style={styles.copy}>{subject === "you" ? status.text : status.text.replace(" Vale conversar com o treinador.", "")}</Text>
        </View>
      </View>
      <View style={styles.tiles}>
        <Tile value={`${decimal(load.thisWeekKm, 1)} km`} label="esta semana até hoje" />
        <Tile value={`${decimal(load.lastWeekKm, 1)} km`} label="semana passada" />
        <Tile value={`${decimal(load.baselineWeeklyKm, 1)} km`} label="média das 4 semanas anteriores" />
      </View>
      <Explain more="Aumentar a distância de repente pode elevar o risco de lesão, então comparamos a semana passada com a média das 4 semanas antes dela. A semana atual fica fora da comparação porque ainda não terminou." />
    </View> : null}

    <Text style={styles.chartTitle}>Km por semana</Text>
    <View style={styles.card}>
      <Text style={styles.copy}>Cada barra é uma semana, de segunda a domingo, com a data da segunda-feira. A última é a semana atual, ainda em andamento.</Text>
      <BarChart buckets={weeks.slice(-8)} />
    </View>

    <Text style={styles.chartTitle}>Ritmo médio semana a semana</Text>
    <View style={styles.card}>
      <Explain lead="Ritmo é o tempo para correr 1 km: quanto menor, mais rápido. Se a linha sobe, as corridas ficaram mais rápidas." more="Semanas sem corrida ficam sem ponto. O ritmo muda com percurso, calor e tipo de treino, então vale olhar a direção da linha, não uma semana isolada." />
      <PaceLine weeks={weeklyPace} />
    </View>

    <View style={styles.tiles}>
      <Tile value={paceChange === null ? "—" : `${paceChange > 0 ? "+" : paceChange < 0 ? "−" : ""}${Math.abs(paceChange)} s/km`} label="mudança no ritmo" note={paceChange === null ? "sem comparação" : paceChange < 0 ? "mais rápido que nas 4 semanas anteriores" : paceChange > 0 ? "mais lento que nas 4 semanas anteriores" : "igual às 4 semanas anteriores"} />
      {trend.recentEfficiency ? <Tile value={decimal(trend.recentEfficiency)} label="metros por batimento" note={trend.previousEfficiency ? `antes: ${decimal(trend.previousEfficiency)}` : undefined} /> : <Tile value={`${decimal(trend.recentKm, 1)} km`} label="km nas últimas 4 semanas" note={`nas 4 anteriores: ${decimal(trend.previousKm, 1)} km`} />}
    </View>
    {trend.recentEfficiency ? <View style={styles.note}><Explain more="Metros por batimento mostram quanto cada batida do coração rende nas corridas. Se o número sobe, o coração trabalha menos para a mesma distância, um bom sinal de condicionamento. A comparação usa as últimas 4 semanas completas e as 4 anteriores." /></View> : null}

    <Text style={styles.chartTitle}>Quão fortes são os treinos</Text>
    <View style={styles.card}>
      <View style={styles.stack}>{zones.map((zone, index) => (zone.share ? <View key={zone.label} style={[styles.stackPart, { flex: zone.share, backgroundColor: ZONES[index] }]} /> : null))}</View>
      <View style={styles.legend}>{zones.map((zone, index) => <View key={zone.label} style={styles.legendItem}><View style={[styles.swatch, { backgroundColor: ZONES[index] }]} /><Text style={styles.legendText}>{zone.label} {percent(zone.share)}</Text></View>)}</View>
      <Explain lead={intensityReading(intensity.easy)} more={`Leve: dá para conversar correndo. Moderado: só frases curtas. Forte: poucas palavras. Uma referência comum é fazer cerca de 80% do tempo no leve. ${intensity.basis === "heartRate" ? "Calculado pelos batimentos médios de cada corrida, comparados com o maior valor registrado." : "Estimado pelo ritmo das corridas, porque faltam dados de batimentos."}`} />
    </View>

    {correlations.length && selected ? <>
      <Text style={styles.chartTitle}>O que anda junto com o ritmo</Text>
      <View style={styles.card}>
        <Explain lead="Mostra o que costuma mudar junto com o ritmo das corridas. Toque em um item para ver o gráfico." more="Barra para a esquerda: quando esse item aumenta, o ritmo tende a ficar mais rápido. Para a direita, mais lento. Quanto maior a barra, mais forte a relação. Isso não prova causa: duas coisas podem andar juntas por outro motivo, como o tipo de treino." />
        {correlations.map((item) => {
          const active = item.key === selected.key;
          const width = `${Math.round(Math.abs(item.r) * 50)}%` as const;
          return <Pressable key={item.key} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={() => setPicked(item.key)} style={[styles.corrRow, active && styles.corrRowOn]}>
            <View style={styles.corrTop}>
              <Text style={styles.corrLabel}>{FACTORS[item.key].label}</Text>
              <Text style={styles.corrValue}>{relation(item.r)}</Text>
            </View>
            <View style={styles.corrTrack}>
              <View style={styles.corrZero} />
              <View style={[styles.corrBar, { width, backgroundColor: item.r > 0 ? POSITIVE : NEGATIVE }, item.r > 0 ? styles.corrRight : styles.corrLeft]} />
            </View>
          </Pressable>;
        })}
        <View style={styles.corrScale}><Text style={styles.axisText}>← mais rápido</Text><Text style={styles.axisText}>mais lento →</Text></View>
        <View style={styles.divider} />
        <Text style={styles.cardTitle}>{reading(selected)}</Text>
        <Text style={styles.copy}>Baseado em {selected.n} corridas. Coeficiente de correlação: {signed(selected.r)}, numa escala de −1 a +1.</Text>
        <Scatter key={selected.key} item={selected} />
      </View>
    </> : null}

    {predictions.length ? <>
      <Text style={styles.chartTitle}>Tempos estimados por prova</Text>
      <View style={styles.races}>{predictions.map((item) => <View key={item.label} style={styles.race}><Tile value={formatDuration(item.seconds)} label={item.label} note={`${formatPace(Math.round((item.seconds * 1000) / item.meters))} /km`} />{item.trainedForIt ? null : <Text style={styles.raceNote}>Falta treino longo para essa distância</Text>}</View>)}</View>
      <Explain lead="Quanto tempo uma prova levaria hoje, projetado a partir das melhores corridas das últimas 12 semanas." more="É uma conta matemática, não uma promessa. Ela pega uma corrida de 3 km ou mais e projeta outras distâncias, considerando que o corpo desacelera conforme a prova fica longa. Quando a distância passa do dobro da maior corrida recente, a conta tende a ser otimista e vale só como referência. Na maratona, isso pesa ainda mais: ela depende de treinos longos e de alimentação durante a prova." />
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
  note: { marginTop: -4, marginBottom: 12 },
  races: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  race: { flexGrow: 1, flexBasis: "46%", minWidth: 130, gap: 4 },
  raceNote: { color: C.inkSoft, fontSize: 11, lineHeight: 15, fontWeight: "700" },
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
