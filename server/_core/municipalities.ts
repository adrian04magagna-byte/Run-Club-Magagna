import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { decodePolyline } from "../../shared/brazil-map";

type Municipality = { code: string; rings: Int32Array[]; box: [number, number, number, number] };
type Index = { items: Municipality[]; grid: Map<number, Municipality[]> };

const CELL = 5_000; // half a degree, in the file's 1/10000 degree units
const MAX_ROUTE_POINTS = 400;
const FILE = "municipios-geo.json";
let index: Index | null = null;

const cellKey = (x: number, y: number) => Math.floor(x / CELL) * 100_000 + Math.floor(y / CELL);

function load(): Index {
  if (index) return index;
  const file = [path.join(process.cwd(), "data", FILE), path.join(process.cwd(), "server", "data", FILE)].find(existsSync);
  if (!file) throw new Error("Malha de municípios não encontrada.");
  const raw = JSON.parse(readFileSync(file, "utf8")) as { c: string; r: number[][] }[];
  const grid = new Map<number, Municipality[]>();
  const items = raw.map(({ c, r }) => {
    const box: Municipality["box"] = [Infinity, Infinity, -Infinity, -Infinity];
    const rings = r.map((deltas) => {
      const ring = new Int32Array(deltas.length);
      let x = 0;
      let y = 0;
      for (let i = 0; i < deltas.length; i += 2) {
        x += deltas[i];
        y += deltas[i + 1];
        ring[i] = x;
        ring[i + 1] = y;
        box[0] = Math.min(box[0], x); box[1] = Math.min(box[1], y);
        box[2] = Math.max(box[2], x); box[3] = Math.max(box[3], y);
      }
      return ring;
    });
    const municipality = { code: c, rings, box };
    for (let x = Math.floor(box[0] / CELL); x <= Math.floor(box[2] / CELL); x += 1) {
      for (let y = Math.floor(box[1] / CELL); y <= Math.floor(box[3] / CELL); y += 1) {
        const key = cellKey(x * CELL, y * CELL);
        grid.set(key, [...(grid.get(key) ?? []), municipality]);
      }
    }
    return municipality;
  });
  index = { items, grid };
  return index;
}

function contains({ rings, box }: Municipality, x: number, y: number) {
  if (x < box[0] || x > box[2] || y < box[1] || y > box[3]) return false;
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
      const crosses = ring[i + 1] > y !== ring[j + 1] > y;
      if (crosses && x < ((ring[j] - ring[i]) * (y - ring[i + 1])) / (ring[j + 1] - ring[i + 1]) + ring[i]) inside = !inside;
    }
  }
  return inside;
}

/** IBGE code of the municipality at a point, or null outside Brazil. */
export function findMunicipality(lat: number, lng: number): string | null {
  const x = Math.round(lng * 10_000);
  const y = Math.round(lat * 10_000);
  return load().grid.get(cellKey(x, y))?.find((item) => contains(item, x, y))?.code ?? null;
}

/** Splits a run's distance among the municipalities its route crosses. The route itself is not kept. */
export function placesOnRoute(polyline: string, distanceMeters: number): Record<string, number> {
  const points = decodePolyline(polyline);
  const step = Math.max(1, Math.ceil(points.length / MAX_ROUTE_POINTS));
  const counts = new Map<string, number>();
  let total = 0;
  for (let i = 0; i < points.length; i += step) {
    const code = findMunicipality(points[i][0], points[i][1]);
    if (!code) continue;
    counts.set(code, (counts.get(code) ?? 0) + 1);
    total += 1;
  }
  return Object.fromEntries([...counts].map(([code, count]) => [code, Math.round((distanceMeters * count) / total)]));
}
