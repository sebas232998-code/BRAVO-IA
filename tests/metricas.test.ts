import { describe, expect, it } from "vitest";
import { calcularMetricas, inicioPeriodo, semaforo } from "../lib/metricas";
import type { Pedido } from "../lib/tipos";

const base = { tienda_dominio: "t", shopify_order_id: 1, numero: "#1", nombre_clienta: "A", telefono: null, telefono_original: null,
  departamento: null, ciudad: null, direccion: null, notas: null, moneda: "COP", items: [], creado_en: "2026-11-16T15:00:00Z" };
const p = (estado: Pedido["estado"], extra: Partial<Pedido> = {}): Pedido => ({ ...base, id: Math.random().toString(), estado, total: 99900, ...extra }) as Pedido;

describe("panel", () => {
  it("la semana empieza el lunes (hora de Colombia)", () => {
    expect(inicioPeriodo("semana", new Date("2026-11-18T15:00:00Z")).toISOString()).toBe("2026-11-16T05:00:00.000Z");
    expect(inicioPeriodo("hoy", new Date("2026-11-17T03:00:00Z")).toISOString()).toBe("2026-11-16T05:00:00.000Z"); // 10 p. m. del 16
    expect(inicioPeriodo("mes", new Date("2026-11-18T15:00:00Z")).toISOString()).toBe("2026-11-01T05:00:00.000Z");
  });
  it("cuenta confirmados, tasa y ventas rescatadas; los archivados no cuentan", () => {
    const m = calcularMetricas(
      [p("confirmado"), p("enviado_dropi", { seguimientos_enviados: 2, dropi_order_id: "9" }), p("sin_respuesta"), p("por_confirmar"), p("archivado")],
      new Date("2026-11-16T05:00:00Z"),
    );
    expect(m).toMatchObject({ recibidos: 4, confirmados: 2, porConfirmar: 1, sinRespuesta: 1, enDropi: 1, tasaConfirmacion: 67, rescatadas: 1, plataRescatada: 99900 });
  });
  it("semáforo", () => {
    expect(semaforo(92).frase).toContain("Leyenda");
    expect(semaforo(50).frase).toBe("Hay que revisar");
  });
});

import { comparacion, consejoConfirmacion, consejoEntrega, rango } from "../lib/metricas";

describe("rango de fechas, comparación y consejos", () => {
  it("por defecto, los últimos 30 días; el anterior es del mismo tamaño", () => {
    const ahora = new Date("2026-11-16T15:00:00Z");
    const r = rango(undefined, undefined, undefined, ahora);
    expect(r.nombre).toBe("Últimos 30 días");
    expect(Math.round((r.hasta.getTime() - r.desde.getTime()) / 86_400_000)).toBe(30);
    expect(r.anterior.hasta.getTime()).toBe(r.desde.getTime());
    expect(rango("7d", undefined, undefined, ahora).nombre).toBe("Últimos 7 días");
  });
  it("fechas escogidas (hora de Colombia, el último día incluido)", () => {
    const r = rango("fechas", "2026-10-01", "2026-10-31");
    expect(r.desde.toISOString()).toBe("2026-10-01T05:00:00.000Z");
    expect(r.hasta.toISOString()).toBe("2026-11-01T05:00:00.000Z");
    expect(r.anterior.nombre).toBe("los 31 días anteriores");
    expect(rango("fechas", "2026-10-31", "2026-10-01").clave).toBe("30d"); // al revés: no vale
  });
  it("compara con el rango anterior", () => {
    expect(comparacion(91, 88, "los 30 días anteriores")).toEqual({ texto: "▲ 3 puntos vs los 30 días anteriores", bueno: true });
    expect(comparacion(12, 15, "x", true)?.bueno).toBe(true);
    expect(comparacion(80, null, "x")).toBeNull();
  });
  it("consejos según la zona", () => {
    expect(consejoEntrega(92, 44, 0)).toContain("Leyenda");
    expect(consejoEntrega(48, 44, 12)).toContain("las 12 novedades abiertas");
    expect(consejoConfirmacion(60, 5, false)).toContain("Prende el seguimiento");
  });
});
