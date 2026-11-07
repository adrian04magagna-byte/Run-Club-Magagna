import { describe, expect, it } from "vitest";

import { findMunicipality, placesOnRoute } from "../server/_core/municipalities";
import { decodePolyline, paintLevel, summarizeMap, type BrazilMap } from "../shared/brazil-map";

function encode(points: [number, number][]) {
  let out = "";
  let last = [0, 0];
  const value = (n: number) => {
    let v = n < 0 ? ~(n << 1) : n << 1;
    while (v >= 32) { out += String.fromCharCode((32 | (v & 31)) + 63); v >>= 5; }
    out += String.fromCharCode(v + 63);
  };
  for (const point of points) {
    const now = [Math.round(point[0] * 1e5), Math.round(point[1] * 1e5)];
    value(now[0] - last[0]);
    value(now[1] - last[1]);
    last = now;
  }
  return out;
}

describe("Brazil run map", () => {
  it("decodes a route", () => {
    expect(decodePolyline("_p~iF~ps|U_ulLnnqC")).toEqual([[38.5, -120.2], [40.7, -120.95]]);
  });

  it("finds municipalities and ignores the ocean", () => {
    expect(findMunicipality(-23.5505, -46.6333)).toBe("3550308");
    expect(findMunicipality(-30.0346, -51.2177)).toBe("4314902");
    expect(findMunicipality(-15.7939, -47.8828)).toBe("5300108");
    expect(findMunicipality(-25, -30)).toBeNull();
  });

  it("splits a run's distance between the municipalities it crosses", () => {
    const route = Array.from({ length: 21 }, (_, i) => [-30.03 + (i * 0.11) / 20, -51.2] as [number, number]);
    const places = placesOnRoute(encode(route), 15_000);
    expect(Object.keys(places)).toEqual(expect.arrayContaining(["4314902", "4304606"]));
    expect(Object.values(places).reduce((a, b) => a + b, 0)).toBeGreaterThan(14_990);
  });

  it("summarizes kilometres, population and regions", () => {
    const map: BrazilMap = {
      fonte: "", box: [0, 0, 1, 1],
      estados: [{ sigla: "RS", nome: "Rio Grande do Sul", regiao: "Sul", box: [], d: "" }, { sigla: "SP", nome: "São Paulo", regiao: "Sudeste", box: [], d: "" }],
      municipios: [{ c: "1", n: "A", u: "RS", i: "", p: 10, a: 1, k: 10, d: "", o: [0, 0] }, { c: "2", n: "B", u: "SP", i: "", p: 20, a: 1, k: 20, d: "", o: [0, 0] }, { c: "3", n: "C", u: "SP", i: "", p: 30, a: 1, k: 30, d: "", o: [0, 0] }],
    };
    const out = summarizeMap(map, [{ code: "1", meters: 500, runs: 1, lastDate: "" }, { code: "3", meters: 900, runs: 2, lastDate: "" }, { code: "x", meters: 1, runs: 1, lastDate: "" }]);
    expect(out).toMatchObject({ municipalities: 2, totalMunicipalities: 3, states: 2, meters: 1400, population: 40 });
    expect(out.visited[0].municipality.n).toBe("C");
    expect(out.regions).toEqual([{ nome: "Sul", total: 1, visited: 1 }, { nome: "Sudeste", total: 2, visited: 1 }]);
    expect([paintLevel(9_999), paintLevel(10_000), paintLevel(50_000)]).toEqual([0, 1, 2]);
  });
});
