/** One line of public/mapa/brasil.json: IBGE municipality with its Census 2022 numbers. */
export type MapMunicipality = {
  /** IBGE code. */ c: string;
  /** Name. */ n: string;
  /** State abbreviation. */ u: string;
  /** Immediate region. */ i: string;
  /** Population. */ p: number;
  /** Area in km². */ a: number;
  /** People per km². */ k: number;
  /** SVG path. */ d: string;
  /** Centre on the map, for the marker that keeps small cities visible. */ o: [number, number];
};

export type MapState = { sigla: string; nome: string; regiao: string; box: number[]; d: string };
export type BrazilMap = { fonte: string; box: number[]; estados: MapState[]; municipios: MapMunicipality[] };
export type RunPlace = { code: string; meters: number; runs: number; lastDate: string };

/** Google encoded polyline to [latitude, longitude] points. */
export function decodePolyline(encoded: string): [number, number][] {
  const points: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  const next = () => {
    let shift = 0;
    let result = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 31) << shift;
      shift += 5;
    } while (byte >= 32 && index < encoded.length);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (index < encoded.length) {
    lat += next();
    lng += next();
    points.push([lat / 1e5, lng / 1e5]);
  }
  return points;
}

/** Paint step of a municipality: the more kilometres run there, the stronger the colour. */
export function paintLevel(meters: number): 0 | 1 | 2 {
  if (meters >= 50_000) return 2;
  return meters >= 10_000 ? 1 : 0;
}

export function summarizeMap(map: BrazilMap, places: RunPlace[]) {
  const byCode = new Map(map.municipios.map((item) => [item.c, item]));
  const visited = places.flatMap((place) => {
    const municipality = byCode.get(place.code);
    return municipality ? [{ ...place, municipality }] : [];
  }).sort((a, b) => b.meters - a.meters);
  const visitedStates = new Set(visited.map((item) => item.municipality.u));
  const regions = [...new Set(map.estados.map((state) => state.regiao))].map((nome) => {
    const siglas = new Set(map.estados.filter((state) => state.regiao === nome).map((state) => state.sigla));
    return {
      nome,
      total: map.municipios.filter((item) => siglas.has(item.u)).length,
      visited: visited.filter((item) => siglas.has(item.municipality.u)).length,
    };
  });
  return {
    visited,
    municipalities: visited.length,
    totalMunicipalities: map.municipios.length,
    states: visitedStates.size,
    meters: visited.reduce((sum, item) => sum + item.meters, 0),
    population: visited.reduce((sum, item) => sum + item.municipality.p, 0),
    regions,
  };
}
