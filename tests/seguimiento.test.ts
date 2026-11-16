import { describe, expect, it } from "vitest";
import {
  calcularDescuento,
  decidirDescuento,
  llenarPlantilla,
  mensajeDescuentoVencido,
  mensajeSeguimiento,
  PLANTILLAS_SEGUIMIENTO,
  SEGUIMIENTO_POR_DEFECTO as cfg,
  siguientePaso,
} from "../lib/seguimiento";

// 10:00 a. m. en Colombia = 15:00 UTC
const ahora = new Date("2026-11-16T15:00:00Z");
const haceHoras = (h: number) => new Date(ahora.getTime() - h * 3_600_000).toISOString();
const base = { estado: "por_confirmar" as const, telefono: "573001234567", ultima_respuesta_en: null };

describe("siguientePaso", () => {
  it("manda el 1 a las 2 horas, el 2 a las 24 y el 3 a las 48", () => {
    expect(siguientePaso({ ...base, confirmacion_enviada_en: haceHoras(1.5) }, cfg, ahora)).toBeNull();
    expect(siguientePaso({ ...base, confirmacion_enviada_en: haceHoras(2) }, cfg, ahora)).toEqual({ tipo: "mensaje", numero: 1 });
    expect(siguientePaso({ ...base, confirmacion_enviada_en: haceHoras(10), seguimientos_enviados: 1 }, cfg, ahora)).toBeNull();
    expect(siguientePaso({ ...base, confirmacion_enviada_en: haceHoras(24), seguimientos_enviados: 1 }, cfg, ahora)).toEqual({ tipo: "mensaje", numero: 2 });
    expect(siguientePaso({ ...base, confirmacion_enviada_en: haceHoras(48), seguimientos_enviados: 2 }, cfg, ahora)).toEqual({ tipo: "mensaje", numero: 3 });
  });

  it("no manda dos seguidos si el anterior salió tarde", () => {
    expect(siguientePaso({ ...base, confirmacion_enviada_en: haceHoras(60) }, cfg, ahora)).toEqual({ tipo: "mensaje", numero: 1 });
    // El 1 salió hace un minuto (tarde): el 2 espera 22 horas desde ahí, no desde la confirmación.
    const tarde = { ...base, confirmacion_enviada_en: haceHoras(60), seguimientos_enviados: 1, ultimo_seguimiento_en: haceHoras(0.02) };
    expect(siguientePaso(tarde, cfg, ahora)).toBeNull();
    expect(siguientePaso({ ...tarde, ultimo_seguimiento_en: haceHoras(22) }, cfg, ahora)).toEqual({ tipo: "mensaje", numero: 2 });
  });

  it("después del tercero espera lo que dura el descuento y cierra como sin respuesta", () => {
    const tres = { ...base, confirmacion_enviada_en: haceHoras(70), seguimientos_enviados: 3 };
    expect(siguientePaso({ ...tres, ultimo_seguimiento_en: haceHoras(23) }, cfg, ahora)).toBeNull();
    expect(siguientePaso({ ...tres, ultimo_seguimiento_en: haceHoras(24) }, cfg, ahora)).toEqual({ tipo: "sin_respuesta" });
  });

  it("si la clienta respondió, ya confirmó o no hay número, no hace nada", () => {
    const p = { ...base, confirmacion_enviada_en: haceHoras(30) };
    expect(siguientePaso({ ...p, ultima_respuesta_en: haceHoras(1) }, cfg, ahora)).toBeNull();
    expect(siguientePaso({ ...p, estado: "confirmado" }, cfg, ahora)).toBeNull();
    expect(siguientePaso({ ...p, telefono: null }, cfg, ahora)).toBeNull();
    expect(siguientePaso({ ...p, confirmacion_enviada_en: null }, cfg, ahora)).toBeNull();
  });

  it("no toca pedidos de antes de prender el seguimiento", () => {
    const p = { ...base, confirmacion_enviada_en: haceHoras(30) };
    expect(siguientePaso(p, { ...cfg, seguimiento_desde: haceHoras(5) }, ahora)).toBeNull();
  });

  it("de noche no escribe", () => {
    const noche = new Date("2026-11-17T04:00:00Z"); // 11 p. m.
    const p = { ...base, confirmacion_enviada_en: new Date(noche.getTime() - 3 * 3_600_000).toISOString() };
    expect(siguientePaso(p, cfg, noche)).toBeNull();
  });
});

describe("descuento de rescate", () => {
  it("calcula como el ejemplo de la especificación", () => {
    expect(calcularDescuento(89900, 10)).toEqual({ normal: 89900, conDescuento: 80910, ahorro: 8990 });
  });

  it("el mensaje 3 queda igual al ejemplo", () => {
    const m = mensajeSeguimiento(3, "Forro de sofá", 89900, cfg);
    expect(m.plantilla).toBe("seguimiento_descuento");
    expect(llenarPlantilla(PLANTILLAS_SEGUIMIENTO[m.plantilla].texto, m.valores)).toBe(
      [
        "Hola, ¿cómo estás? Te cuento que no queremos que te quedes sin tu producto, así que tenemos un descuento especial para ti 🛍",
        "",
        "Precio normal: $89.900",
        "Con tu descuento: $80.910",
        "Te ahorras: $8.990",
        "",
        "Este descuento es válido solo por 24 horas.",
        "",
        "Si todo está correcto, envía la palabra *CONFIRMAR* y te lo despachamos lo más pronto posible 🚚",
      ].join("\n"),
    );
  });

  it("sin descuento activo, el tercero es otro recordatorio", () => {
    const m = mensajeSeguimiento(3, "Forro de sofá", 89900, { ...cfg, descuento_activo: false });
    expect(m.plantilla).toBe("seguimiento_1");
    expect(m.descuento).toBeNull();
  });

  it("confirma a tiempo: rebaja el total", () => {
    const p = { total: 89900, descuento_valor: 8990, descuento_vence_en: haceHoras(-2) };
    expect(decidirDescuento(p, ahora)).toEqual({ tipo: "aplicar", nuevoTotal: 80910 });
  });

  it("confirma tarde: primero avisa, después confirma a precio normal", () => {
    const p = { total: 89900, descuento_valor: 8990, descuento_vence_en: haceHoras(1) };
    expect(decidirDescuento(p, ahora)).toEqual({ tipo: "avisar_vencido" });
    expect(decidirDescuento({ ...p, descuento_vencido_avisado: true }, ahora)).toEqual({ tipo: "precio_normal" });
    expect(mensajeDescuentoVencido(89900)).toContain("precio normal de $89.900");
  });

  it("sin descuento ofrecido, confirma normal", () => {
    expect(decidirDescuento({ total: 89900 }, ahora)).toEqual({ tipo: "sin_descuento" });
  });
});

describe("plantillas", () => {
  it("no tienen 🙏 ni 😊 y ninguna empieza o termina con un espacio {{n}} (Meta lo rechaza)", () => {
    for (const p of Object.values(PLANTILLAS_SEGUIMIENTO)) {
      expect(p.texto).not.toMatch(/🙏|😊/);
      expect(p.texto.trim()).not.toMatch(/^\{\{|\}\}$/);
      expect(p.ejemplo.length).toBe((p.texto.match(/\{\{\d+\}\}/g) ?? []).length);
    }
  });
});
