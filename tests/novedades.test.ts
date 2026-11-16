import { describe, expect, it } from "vitest";
import {
  enlaceWhatsApp,
  explicacionNovedad,
  leerNovedad,
  mensajeNovedad,
  mensajeRecordatorioNovedad,
  PLANTILLAS_NOVEDAD,
  tipoNovedad,
} from "../lib/novedades";

const pedido = (extra: Record<string, unknown>) => ({
  id: 123, status: "EN REPARTO", name: "MARÍA JOSÉ", surname: "Pérez", phone: "3001234567", dir: "Cra 1 # 2-3",
  city: "CALI", shop: { name: "Petion" }, distribution_company: { name: "SERVIENTREGA" }, shipping_guide: "024035750424",
  novedad_servientrega: "DESTINATARIO NO SE ENCUENTRA", updated_at: "2026-11-15T10:00:00",
  orderdetails: [{ product: { name: "PROTECTOR DE SOFA" } }], ...extra,
});

describe("bandeja de novedades", () => {
  it("solo los que van en camino con novedad", () => {
    expect(leerNovedad(pedido({}))).toMatchObject({ primerNombre: "María", telefono: "573001234567", tienda: "PETION", producto: "Protector De Sofa" });
    expect(leerNovedad(pedido({ status: "ENTREGADO" }))).toBeNull();
    expect(leerNovedad(pedido({ novedad_servientrega: null }))).toBeNull();
    expect(leerNovedad(pedido({ novedad_servientrega: null, status: "RECLAME EN OFICINA" }))).not.toBeNull();
  });

  it("el mensaje depende de la novedad y nunca culpa a la clienta", () => {
    const n = leerNovedad(pedido({}))!;
    expect(mensajeNovedad(n)).toBe(
      "Hola, María, ¿cómo estás? Te cuento que tu pedido de Protector De Sofa ya está en tu ciudad 📦\n\n" +
        "Hubo un intento de entrega, pero al parecer no había nadie en casa. ¿A qué hora te queda mejor recibirlo, o hay alguien que lo pueda recibir por ti?",
    );
    expect(tipoNovedad({ ...n, novedad: "INFORMACIÓN INCOMPLETA O ERRADA DEL DESTINATARIO" })).toBe("direccion");
    expect(tipoNovedad({ ...n, novedad: null, estado: "RECLAME EN OFICINA" })).toBe("oficina");
    expect(explicacionNovedad({ ...n, novedad: null, estado: "RECLAME EN OFICINA" })).toContain("oficina de Servientrega");
    // Si la novedad dice que la entrega quedó para mañana, no se le dice que no había nadie.
    expect(tipoNovedad({ ...n, novedad: "CLIENTE SOLICITA ENTREGA MAÑANA" })).toBe("reprogramada");
    expect(explicacionNovedad({ ...n, novedad: "CLIENTE SOLICITA ENTREGA MAÑANA" })).not.toMatch(/nadie en casa/);
    for (const nov of ["DESTINATARIO NO SE ENCUENTRA", "NO LE INTERESA LA MERCANCÍA", "INFORMACIÓN INCOMPLETA", "TELEFONO APAGADO", "NO TIENE DINERO", "OTRA COSA"]) {
      const m = mensajeNovedad({ ...n, novedad: nov });
      expect(m).toContain("ya está en tu ciudad");
      expect(m).not.toMatch(/🙏|😊|no estabas|tu culpa|no contestaste|no pagaste/i);
      expect(explicacionNovedad({ ...n, novedad: nov })).not.toMatch(/\n/); // cabe en un espacio de la plantilla
    }
  });

  it("recordatorio: a punto de ser devuelto", () => {
    expect(mensajeRecordatorioNovedad({ primerNombre: "María", producto: "Cubresofá" })).toBe(
      "Hola, María. Tu pedido de Cubresofá está a punto de ser devuelto 📦\n\nPor favor respóndenos lo antes posible para que te lo puedan entregar 🚚",
    );
  });

  it("las plantillas de Meta no empiezan ni terminan con un espacio {{n}}", () => {
    for (const p of Object.values(PLANTILLAS_NOVEDAD)) {
      expect(p.texto.trim()).not.toMatch(/^\{\{|\}\}$/);
      expect(p.ejemplo.length).toBe((p.texto.match(/\{\{\d+\}\}/g) ?? []).length);
    }
  });

  it("enlace de WhatsApp con el mensaje", () => {
    const n = leerNovedad(pedido({}))!;
    expect(enlaceWhatsApp(n)).toMatch(/^https:\/\/wa\.me\/573001234567\?text=Hola%2C%20Mar%C3%ADa/);
    expect(enlaceWhatsApp({ ...n, telefono: null })).toBeNull();
  });
});

import type Anthropic from "@anthropic-ai/sdk";
import { atenderRespuestaNovedad, REGLAS_NOVEDAD } from "../lib/ia/novedad";
import { pasoNovedad } from "../lib/novedades-auto";

describe("novedad atendida sola", () => {
  const ahora = new Date("2026-11-16T15:00:00Z");
  const hace = (h: number) => new Date(ahora.getTime() - h * 3_600_000).toISOString();
  const g = (x: object) => ({ mensaje_enviado_en: null, recordatorio_en: null, respuesta_en: null, escrito_en: null, ...x });

  it("primer mensaje, espera, y un solo recordatorio a las 12 horas si no responde", () => {
    expect(pasoNovedad(undefined, ahora)).toBe("primer_mensaje");
    expect(pasoNovedad(g({ mensaje_enviado_en: hace(5) }), ahora)).toBeNull();
    expect(pasoNovedad(g({ mensaje_enviado_en: hace(12) }), ahora)).toBe("recordatorio");
    expect(pasoNovedad(g({ mensaje_enviado_en: hace(30), recordatorio_en: hace(10) }), ahora)).toBeNull();
    expect(pasoNovedad(g({ mensaje_enviado_en: hace(30), respuesta_en: hace(20) }), ahora)).toBeNull();
    expect(pasoNovedad(g({ escrito_en: hace(2) }), ahora)).toBeNull(); // el vendedor ya le escribió a mano
  });

  it("la IA guarda la solución que dio la clienta", async () => {
    const respuestas: Anthropic.Beta.BetaContentBlock[][] = [
      [{ type: "tool_use", id: "t1", name: "registrar_solucion", input: { tipo: "nueva_direccion", detalle: "Cra 50 # 10-20, barrio Centro, casa azul" } } as Anthropic.Beta.BetaToolUseBlock],
      [{ type: "text", text: "Listo, ya le pasamos la dirección a la transportadora para que te lo entreguen 🚚", citations: null } as Anthropic.Beta.BetaTextBlock],
    ];
    const llamar = async () => {
      const content = respuestas.shift()!;
      return { content, stop_reason: content[0].type === "tool_use" ? "tool_use" : "end_turn" } as unknown as Anthropic.Beta.BetaMessage;
    };
    const r = await atenderRespuestaNovedad(llamar, { novedad: "INFORMACIÓN INCOMPLETA", producto: "Cubresofá" }, [
      { direccion: "saliente", texto: "El repartidor no logró ubicar la dirección…" },
      { direccion: "entrante", texto: "es en la Cra 50 # 10-20, barrio Centro, casa azul" },
    ]);
    expect(r.solucion).toBe("Nueva dirección: Cra 50 # 10-20, barrio Centro, casa azul");
    expect(r.texto).toContain("transportadora");
    expect(REGLAS_NOVEDAD).toContain("NUNCA de la clienta");
  });
});
