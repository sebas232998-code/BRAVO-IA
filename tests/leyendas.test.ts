import { describe, expect, it } from "vitest";
import { contarLeyendas, inicioSemana, semanas } from "../lib/leyendas";
import type { OrdenDropiLeida } from "../lib/dropi-estados";

const o = (estado: string, fecha: string, es_prueba = false) =>
  ({ id: Math.random(), estado, creado_en: fecha, es_prueba }) as unknown as OrdenDropiLeida;
const muchos = (n: number, estado: string, fecha: string) => Array.from({ length: n }, () => o(estado, fecha));

describe("leyendas", () => {
  it("la semana empieza el lunes en Colombia", () => {
    expect(new Date(inicioSemana(new Date("2026-11-18T15:00:00Z"))).toISOString()).toBe("2026-11-16T05:00:00.000Z");
  });
  it("cuenta semanas cerradas con 90 % o más y al menos 5 terminados", () => {
    const ahora = new Date("2026-11-18T15:00:00Z"); // semana actual: 16 nov
    const lista = semanas(
      [
        ...muchos(9, "ENTREGADO", "2026-11-10T15:00:00Z"), o("DEVOLUCION", "2026-11-10T15:00:00Z"), // 90 % → Leyenda
        ...muchos(4, "ENTREGADO", "2026-11-03T15:00:00Z"), // 100 % pero solo 4 → no
        ...muchos(8, "ENTREGADO", "2026-10-27T15:00:00Z"), ...muchos(2, "DEVOLUCION", "2026-10-27T15:00:00Z"), // 80 % → no
        ...muchos(6, "ENTREGADO", "2026-11-17T15:00:00Z"), // semana actual: no cuenta todavía
        ...muchos(5, "DEVOLUCION", "2026-11-10T15:00:00Z").map((x) => ({ ...x, es_prueba: true })), // pruebas: no cuentan
      ],
      ahora,
    );
    expect(lista.map((s) => [s.tasa, s.leyenda])).toEqual([[90, true], [100, false], [80, false]]);
    const c = contarLeyendas(lista, ahora);
    expect(c).toMatchObject({ esteMes: 1, total: 1 });
    expect(c.ultimaSemana?.leyenda).toBe(true);
  });
});
