import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, G, Path } from "react-native-svg";

import { C, PrimaryButton, Screen, SectionTitle } from "@/components/run-ui";
import { getApiBaseUrl } from "@/constants/oauth";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";
import { paintLevel, summarizeMap, type BrazilMap, type MapMunicipality, type RunPlace } from "@/shared/brazil-map";

const LAND = "#E8E9E1";
const PAINT = ["#C4E04A", "#83A510", "#46600A"];
const PAINT_LABELS = ["Até 10 km", "10 a 50 km", "Mais de 50 km"];
const number = new Intl.NumberFormat("pt-BR");
const km = (meters: number) => `${number.format(Math.round(meters / 100) / 10)} km`;

// react-native-svg's onPress does not reach paths on the web, where they are plain DOM nodes.
const tapProps = (onTap: () => void): object => ({ onPress: onTap, ...(Platform.OS === "web" ? { style: { cursor: "pointer" } } : {}) });

async function loadMap(): Promise<BrazilMap> {
  const base = Platform.OS === "web" ? "" : getApiBaseUrl();
  const response = await fetch(`${base}/mapa/brasil.json`);
  if (!response.ok) throw new Error("Mapa indisponível");
  return response.json();
}

function viewBox([x0, y0, x1, y1]: number[]) {
  const pad = Math.max(x1 - x0, y1 - y0) * 0.04;
  return `${x0 - pad} ${y0 - pad} ${x1 - x0 + pad * 2} ${y1 - y0 + pad * 2}`;
}

function BrazilCanvas({ map, places, state, selected, onState, onSelect }: {
  map: BrazilMap;
  places: Map<string, RunPlace>;
  state: string | null;
  selected: MapMunicipality | null;
  onState: (sigla: string) => void;
  onSelect: (municipality: MapMunicipality) => void;
}) {
  const allPaths = useMemo(() => map.municipios.map((item) => item.d).join(""), [map]);
  const painted = useMemo(() => {
    const levels: string[] = ["", "", ""];
    for (const item of map.municipios) {
      const place = places.get(item.c);
      if (place) levels[paintLevel(place.meters)] += item.d;
    }
    return levels;
  }, [map, places]);
  const markers = useMemo(() => map.municipios.flatMap((item) => {
    const place = places.get(item.c);
    return place ? [{ item, level: paintLevel(place.meters) }] : [];
  }), [map, places]);
  const current = map.estados.find((item) => item.sigla === state);
  const stateMunicipalities = useMemo(() => map.municipios.filter((item) => item.u === state), [map, state]);
  const box = current?.box ?? map.box;
  const line = Math.max(box[2] - box[0], box[3] - box[1]) / 400;

  return <View style={styles.canvas}>
    <Svg width="100%" height="100%" viewBox={viewBox(box)} preserveAspectRatio="xMidYMid meet">
      {current
        ? <G>{stateMunicipalities.map((item) => {
          const place = places.get(item.c);
          return <Path key={item.c} d={item.d} fill={place ? PAINT[paintLevel(place.meters)] : LAND} stroke={C.white} strokeWidth={line * 0.6} {...tapProps(() => onSelect(item))} />;
        })}</G>
        : <>
          <Path d={allPaths} fill={LAND} stroke={C.white} strokeWidth={line * 0.12} />
          {painted.map((d, level) => (d ? <Path key={level} d={d} fill={PAINT[level]} /> : null))}
          {map.estados.map((item) => <Path key={item.sigla} d={item.d} fill="transparent" stroke={C.muted} strokeWidth={line * 0.45} {...tapProps(() => onState(item.sigla))} />)}
          {markers.map(({ item, level }) => <Circle key={item.c} cx={item.o[0]} cy={item.o[1]} r={line * 3.2} fill={PAINT[level]} stroke={C.white} strokeWidth={line * 0.7} pointerEvents="none" />)}
        </>}
      {selected ? <Path d={selected.d} fill="none" stroke={C.coral} strokeWidth={line * 1.6} /> : null}
    </Svg>
  </View>;
}

export function RunMapScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const mapFile = useQuery({ queryKey: ["brazil-map"], queryFn: loadMap, staleTime: Infinity });
  const runMap = trpc.strava.runMap.useQuery(undefined, { enabled: Boolean(user) });
  const update = trpc.strava.updateRunMap.useMutation({ onSuccess: (data) => utils.strava.runMap.setData(undefined, data) });
  const erase = trpc.strava.deleteHistory.useMutation({ onSuccess: () => { setAccepted(false); return utils.strava.runMap.invalidate(); } });
  const [accepted, setAccepted] = useState(false);
  const [state, setState] = useState<string | null>(null);
  const [selected, setSelected] = useState<MapMunicipality | null>(null);

  const placeList = runMap.data?.places;
  const places = useMemo(() => new Map((placeList ?? []).map((place) => [place.code, place])), [placeList]);
  const summary = useMemo(() => (mapFile.data ? summarizeMap(mapFile.data, placeList ?? []) : null), [mapFile.data, placeList]);
  const chooseState = (sigla: string | null) => { setState(sigla); setSelected(null); };
  const selectedPlace = selected ? places.get(selected.c) : undefined;
  const current = mapFile.data?.estados.find((item) => item.sigla === state);
  const shown = summary?.visited.filter((item) => !state || item.municipality.u === state).slice(0, 12) ?? [];
  const busy = update.isPending || erase.isPending;

  return <Screen scroll wide>
    <View style={styles.header}>
      <Text style={styles.eyebrow}>SEU BRASIL CORRIDO</Text>
      <Text style={styles.title}>Mapa</Text>
      <Text style={styles.subtitle}>Cada município ganha cor quando sua corrida do Strava passa por ele.</Text>
    </View>

    {summary ? <View style={styles.stats}>
      <Stat value={number.format(summary.municipalities)} label={`de ${number.format(summary.totalMunicipalities)} municípios`} />
      <Stat value={km(summary.meters)} label="em municípios mapeados" />
      <Stat value={String(summary.states)} label="estados" />
      <Stat value={number.format(summary.population)} label="habitantes nesses municípios" />
    </View> : null}

    <View style={styles.mapCard}>
      {mapFile.data
        ? <>
          <View style={styles.mapTop}>
            <Text style={styles.mapTitle}>{current?.nome ?? "Brasil"}</Text>
            {state ? <Pressable onPress={() => chooseState(null)} accessibilityRole="button" style={styles.backChip}><Ionicons name="arrow-back" size={13} color={C.ink} /><Text style={styles.backText}>Brasil</Text></Pressable> : <Text style={styles.hint}>Toque em um estado</Text>}
          </View>
          <BrazilCanvas map={mapFile.data} places={places} state={state} selected={selected} onState={chooseState} onSelect={setSelected} />
          <View style={styles.legend}>{PAINT.map((color, index) => <View key={color} style={styles.legendItem}><View style={[styles.swatch, { backgroundColor: color }]} /><Text style={styles.legendText}>{PAINT_LABELS[index]}</Text></View>)}</View>
        </>
        : mapFile.isError
          ? <Pressable onPress={() => mapFile.refetch()} style={styles.loading}><Text style={styles.error}>Não foi possível abrir o mapa. Toque para tentar de novo.</Text></Pressable>
          : <View style={styles.loading}><ActivityIndicator color={C.ink} /></View>}
    </View>

    {selected ? <View style={styles.detail}>
      <Text style={styles.detailTitle}>{selected.n} · {selected.u}</Text>
      <Text style={styles.detailSub}>Região imediata de {selected.i}</Text>
      <View style={styles.detailGrid}>
        <Stat value={number.format(selected.p)} label="habitantes" />
        <Stat value={`${number.format(Math.round(selected.a))} km²`} label="área" />
        <Stat value={number.format(selected.k)} label="hab. por km²" />
        <Stat value={selectedPlace ? km(selectedPlace.meters) : "0 km"} label={selectedPlace ? `em ${selectedPlace.runs} ${selectedPlace.runs === 1 ? "corrida" : "corridas"}` : "ainda sem corrida"} />
      </View>
    </View> : null}

    {mapFile.data ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.states}>
      {mapFile.data.estados.map((item) => <Pressable key={item.sigla} accessibilityRole="button" onPress={() => chooseState(item.sigla)} style={[styles.stateChip, state === item.sigla && styles.stateChipOn]}><Text style={[styles.stateText, state === item.sigla && styles.stateTextOn]}>{item.sigla}</Text></Pressable>)}
    </ScrollView> : null}

    <View style={styles.action}>
      {!runMap.data?.connected
        ? <><Text style={styles.actionTitle}>Conecte o Strava para pintar seu mapa</Text><PrimaryButton label="Conectar Strava" icon="flash" onPress={() => router.push("/strava")} /></>
        : !runMap.data.consented
          ? <>
            <Text style={styles.actionTitle}>Pintar meu mapa</Text>
            <Text style={styles.copy}>O app lê a rota de cada corrida no Strava só para descobrir os municípios. Guardamos os municípios, os quilômetros e os dados da corrida (data, distância, tempo e ritmo). A rota não fica guardada, e você pode apagar tudo quando quiser.</Text>
            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: accepted }} onPress={() => setAccepted((value) => !value)} style={styles.consent}>
              <View style={[styles.checkbox, accepted && styles.checkboxOn]}>{accepted ? <Ionicons name="checkmark" size={15} color={C.ink} /> : null}</View>
              <Text style={styles.consentText}>Autorizo usar minhas corridas para pintar meu mapa.</Text>
            </Pressable>
            <ActionButton label="Pintar meu mapa" disabled={busy || !accepted} loading={update.isPending} onPress={() => update.mutate({ consentAccepted: true })} />
          </>
          : <>
            <ActionButton label="Atualizar meu mapa" disabled={busy} loading={update.isPending} onPress={() => update.mutate({ consentAccepted: false })} />
            {update.data?.truncated ? <Text style={styles.copy}>Mostrando até 1.000 atividades mais recentes.</Text> : null}
            <Pressable disabled={busy} onPress={() => erase.mutate()} accessibilityRole="button"><Text style={styles.eraseText}>Apagar mapa e corridas guardadas</Text></Pressable>
          </>}
      {update.error ? <Text style={styles.error}>{update.error.message}</Text> : null}
    </View>

    {shown.length ? <><SectionTitle title="Onde você mais correu" />
      <View style={styles.list}>{shown.map((item) => <Pressable key={item.code} onPress={() => { setState(item.municipality.u); setSelected(item.municipality); }} style={styles.row}>
        <View style={styles.rowCopy}><Text style={styles.rowTitle}>{item.municipality.n} · {item.municipality.u}</Text><Text style={styles.rowSub}>{number.format(item.municipality.p)} habitantes</Text></View>
        <Text style={styles.rowValue}>{km(item.meters)}</Text>
      </Pressable>)}</View></> : null}

    {summary ? <><SectionTitle title="Por região" />
      <View style={styles.list}>{summary.regions.map((region) => <View key={region.nome} style={styles.row}>
        <Text style={styles.rowTitle}>{region.nome}</Text>
        <Text style={styles.rowValue}>{number.format(region.visited)} de {number.format(region.total)}</Text>
      </View>)}</View></> : null}

    <Text style={styles.source}>Fonte: IBGE, malha municipal, localidades e Censo Demográfico 2022. Os quilômetros por município são estimados pela rota.</Text>
  </Screen>;
}

function Stat({ value, label }: { value: string; label: string }) {
  return <View style={styles.stat}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>;
}

function ActionButton({ label, disabled, loading, onPress }: { label: string; disabled: boolean; loading: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.button, disabled && styles.disabled, pressed && styles.pressed]}>
    {loading ? <ActivityIndicator color={C.lime} /> : <Text style={styles.buttonText}>{label}</Text>}
  </Pressable>;
}

const styles = StyleSheet.create({
  header: { paddingTop: 4, marginBottom: 16 },
  eyebrow: { color: C.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1.5, marginBottom: 5 },
  title: { color: C.ink, fontSize: 31, fontWeight: "900", letterSpacing: -1.1 },
  subtitle: { color: C.inkSoft, fontSize: 13, lineHeight: 19, fontWeight: "600", marginTop: 5 },
  stats: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  stat: { flexGrow: 1, flexBasis: "45%", padding: 12, borderRadius: 16, backgroundColor: C.white, borderWidth: 1, borderColor: C.line },
  statValue: { color: C.ink, fontSize: 18, fontWeight: "900" },
  statLabel: { color: C.muted, fontSize: 11, fontWeight: "700", marginTop: 2 },
  mapCard: { padding: 14, borderRadius: 22, backgroundColor: C.white, borderWidth: 1, borderColor: C.line },
  mapTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  mapTitle: { color: C.ink, fontSize: 16, fontWeight: "900" },
  hint: { color: C.muted, fontSize: 11, fontWeight: "700" },
  backChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, backgroundColor: C.stone },
  backText: { color: C.ink, fontSize: 11, fontWeight: "800" },
  canvas: { width: "100%", maxWidth: 620, aspectRatio: 1, alignSelf: "center" },
  loading: { minHeight: 300, alignItems: "center", justifyContent: "center" },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 8 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  swatch: { width: 12, height: 12, borderRadius: 4 },
  legendText: { color: C.inkSoft, fontSize: 11, fontWeight: "700" },
  detail: { marginTop: 12, padding: 14, borderRadius: 20, backgroundColor: C.sky },
  detailTitle: { color: C.ink, fontSize: 17, fontWeight: "900" },
  detailSub: { color: C.inkSoft, fontSize: 12, fontWeight: "600", marginTop: 2, marginBottom: 10 },
  detailGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  states: { gap: 6, paddingVertical: 12 },
  stateChip: { paddingHorizontal: 11, paddingVertical: 8, borderRadius: 12, backgroundColor: C.stone },
  stateChipOn: { backgroundColor: C.ink },
  stateText: { color: C.ink, fontSize: 12, fontWeight: "800" },
  stateTextOn: { color: C.lime },
  action: { gap: 10, padding: 14, borderRadius: 20, backgroundColor: C.white, borderWidth: 1, borderColor: C.line, marginBottom: 18 },
  actionTitle: { color: C.ink, fontSize: 15, fontWeight: "900" },
  copy: { color: C.inkSoft, fontSize: 12, lineHeight: 18, fontWeight: "600" },
  consent: { flexDirection: "row", alignItems: "center", gap: 10 },
  checkbox: { width: 22, height: 22, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: C.muted, borderRadius: 6 },
  checkboxOn: { backgroundColor: C.lime, borderColor: C.ink },
  consentText: { flex: 1, color: C.ink, fontSize: 12, lineHeight: 17, fontWeight: "700" },
  button: { minHeight: 46, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: C.ink },
  buttonText: { color: C.lime, fontSize: 13, fontWeight: "900" },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.75 },
  eraseText: { color: C.muted, fontSize: 12, fontWeight: "700", textAlign: "center", paddingVertical: 4 },
  error: { color: "#B3392A", fontSize: 12, fontWeight: "700", textAlign: "center" },
  list: { borderRadius: 18, backgroundColor: C.white, borderWidth: 1, borderColor: C.line, marginBottom: 18, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: C.stone },
  rowCopy: { flex: 1 },
  rowTitle: { flex: 1, color: C.ink, fontSize: 13, fontWeight: "800" },
  rowSub: { color: C.muted, fontSize: 11, fontWeight: "600", marginTop: 1 },
  rowValue: { color: C.ink, fontSize: 13, fontWeight: "900" },
  source: { color: C.muted, fontSize: 10, lineHeight: 15, fontWeight: "600", marginBottom: 20 },
});
