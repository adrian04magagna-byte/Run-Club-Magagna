// Rebuilds the Brazil map from IBGE open data: `node scripts/build-ibge-map.mjs`.
// public/mapa/brasil.json draws the map; server/data/municipios-geo.json finds a run's municipality.
import { mkdir, writeFile } from "node:fs/promises";

const API = "https://servicodados.ibge.gov.br/api";
const X_SCALE = Math.cos((15 * Math.PI) / 180);
const project = ([lng, lat]) => [(lng + 74) * 10 * X_SCALE, (6 - lat) * 10];
const round = (value) => Math.round(value * 100) / 100;
const compact = (value) => String(round(value)).replace(/^(-?)0\./, "$1.");

async function getJson(path) {
  const response = await fetch(`${API}${path}`);
  if (!response.ok) throw new Error(`IBGE ${response.status}: ${path}`);
  return response.json();
}

const malha = (nivel, qualidade) =>
  getJson(`/v3/malhas/paises/BR?intrarregiao=${nivel}&formato=application/vnd.geo%2Bjson&qualidade=${qualidade}`);
const polygons = (geometry) => (geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates);

function svgPath(geometry) {
  let d = "";
  const box = [Infinity, Infinity, -Infinity, -Infinity];
  for (const polygon of polygons(geometry)) {
    for (const ring of polygon) {
      let last = null;
      ring.slice(0, -1).forEach((point) => {
        const [x, y] = project(point).map(round);
        box[0] = Math.min(box[0], x); box[1] = Math.min(box[1], y);
        box[2] = Math.max(box[2], x); box[3] = Math.max(box[3], y);
        if (!last) d += `M${x} ${y}l`;
        else if (x !== last[0] || y !== last[1]) d += `${compact(x - last[0])} ${compact(y - last[1])} `;
        last = [x, y];
      });
      d = `${d.trimEnd()}z`;
    }
  }
  return { d, box };
}

const [municipios, ufs, shapes, ufShapes, detailed, censo] = await Promise.all([
  getJson("/v1/localidades/municipios?view=nivelado"),
  getJson("/v1/localidades/estados"),
  malha("municipio", "minima"),
  malha("UF", "minima"),
  malha("municipio", "intermediaria"),
  getJson("/v3/agregados/4714/periodos/2022/variaveis/93%7C6318%7C614?localidades=N6%5Ball%5D"),
]);

const census = new Map();
for (const variable of censo) {
  for (const { localidade, serie } of variable.resultados[0].series) {
    const entry = census.get(localidade.id) ?? {};
    entry[variable.id] = Number(serie["2022"]);
    census.set(localidade.id, entry);
  }
}

const places = new Map(municipios.map((item) => [String(item["municipio-id"]), item]));
const mapped = shapes.features.map((feature) => {
  const code = feature.properties.codarea;
  const place = places.get(code);
  const data = census.get(code);
  if (!place || !data) throw new Error(`Município sem dados: ${code}`);
  const { d, box } = svgPath(feature.geometry);
  return {
    c: code, n: place["municipio-nome"], u: place["UF-sigla"], i: place["regiao-imediata-nome"],
    p: data["93"], a: data["6318"], k: data["614"], d, box,
  };
});

const stateBoxes = new Map();
for (const { u, box } of mapped) {
  const current = stateBoxes.get(u) ?? [Infinity, Infinity, -Infinity, -Infinity];
  stateBoxes.set(u, [Math.min(current[0], box[0]), Math.min(current[1], box[1]), Math.max(current[2], box[2]), Math.max(current[3], box[3])]);
}
const states = ufShapes.features.map((feature) => {
  const state = ufs.find((item) => String(item.id) === feature.properties.codarea);
  return { sigla: state.sigla, nome: state.nome, regiao: state.regiao.nome, box: stateBoxes.get(state.sigla), d: svgPath(feature.geometry).d };
}).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
const all = [...stateBoxes.values()];
const box = [Math.min(...all.map((b) => b[0])), Math.min(...all.map((b) => b[1])), Math.max(...all.map((b) => b[2])), Math.max(...all.map((b) => b[3]))];

await mkdir("public/mapa", { recursive: true });
await writeFile("public/mapa/brasil.json", JSON.stringify({
  fonte: "IBGE: malha municipal, localidades e Censo 2022",
  box,
  estados: states,
  municipios: mapped.map(({ box: b, ...rest }) => ({ ...rest, o: [round((b[0] + b[2]) / 2), round((b[1] + b[3]) / 2)] })),
}));

// Whole numbers of 1/10000 degree, stored as deltas, keep this file small and exact enough for routes.
const encodeRing = (ring) => {
  const out = [];
  let lastX = 0;
  let lastY = 0;
  for (const [lng, lat] of ring) {
    const x = Math.round(lng * 10000);
    const y = Math.round(lat * 10000);
    out.push(x - lastX, y - lastY);
    lastX = x;
    lastY = y;
  }
  return out;
};
await mkdir("server/data", { recursive: true });
await writeFile("server/data/municipios-geo.json", JSON.stringify(detailed.features.map((feature) => ({
  c: feature.properties.codarea,
  r: polygons(feature.geometry).flat().map(encodeRing),
}))));
console.log(`${mapped.length} municípios, ${states.length} estados`);
