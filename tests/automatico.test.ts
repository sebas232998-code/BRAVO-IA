import { describe, expect, it } from "vitest";
import { enHorarioDeMensajes, minutosParaSubir, tocaEnviarConfirmacion, tocaSubirADropi } from "../lib/automatico";
import { esCortesia } from "../lib/whatsapp";

// 10:00 a. m. en Colombia = 15:00 UTC
const manana = new Date("2026-11-16T15:00:00Z");
const haceMin = (n: number, desde = manana) => new Date(desde.getTime() - n * 60_000).toISOString();

describe("horario de mensajes (hora de Colombia)", () => {
  it("de 7 a. m. a 8:59 p. m. sí, de noche no", () => {
    expect(enHorarioDeMensajes(new Date("2026-11-16T12:00:00Z"))).toBe(true); // 7:00 a. m.
    expect(enHorarioDeMensajes(new Date("2026-11-17T01:59:00Z"))).toBe(true); // 8:59 p. m.
    expect(enHorarioDeMensajes(new Date("2026-11-17T02:00:00Z"))).toBe(false); // 9:00 p. m.
    expect(enHorarioDeMensajes(new Date("2026-11-16T07:00:00Z"))).toBe(false); // 2:00 a. m.
  });
});

describe("tocaEnviarConfirmacion", () => {
  const base = { estado: "por_confirmar", telefono: "573001234567", confirmacion_enviada_en: null };
  it("espera un minuto después de que entra el pedido", () => {
    expect(tocaEnviarConfirmacion({ ...base, recibido_en: haceMin(0.5) }, null, manana)).toBe(false);
    expect(tocaEnviarConfirmacion({ ...base, recibido_en: haceMin(2) }, null, manana)).toBe(true);
  });
  it("no toca pedidos de antes de prender el piloto", () => {
    expect(tocaEnviarConfirmacion({ ...base, recibido_en: haceMin(30) }, haceMin(10), manana)).toBe(false);
  });
  it("no repite, no escribe sin número ni a pedidos ya confirmados", () => {
    expect(tocaEnviarConfirmacion({ ...base, recibido_en: haceMin(5), confirmacion_enviada_en: haceMin(4) }, null, manana)).toBe(false);
    expect(tocaEnviarConfirmacion({ ...base, telefono: null, recibido_en: haceMin(5) }, null, manana)).toBe(false);
    expect(tocaEnviarConfirmacion({ ...base, estado: "confirmado", recibido_en: haceMin(5) }, null, manana)).toBe(false);
  });
  it("de noche espera a la mañana", () => {
    const noche = new Date("2026-11-17T04:00:00Z"); // 11 p. m.
    expect(tocaEnviarConfirmacion({ ...base, recibido_en: haceMin(5, noche) }, null, noche)).toBe(false);
  });
});

describe("tocaSubirADropi", () => {
  const base = { estado: "confirmado", dropi_order_id: null, dropi_en_pausa: null };
  it("sube solo después de 5 minutos", () => {
    expect(tocaSubirADropi({ ...base, confirmado_en: haceMin(4) }, manana)).toBe(false);
    expect(tocaSubirADropi({ ...base, confirmado_en: haceMin(5) }, manana)).toBe(true);
  });
  it("no sube si está en pausa, sin confirmar, o ya está en Dropi", () => {
    expect(tocaSubirADropi({ ...base, confirmado_en: haceMin(9), dropi_en_pausa: "escribió" }, manana)).toBe(false);
    expect(tocaSubirADropi({ ...base, estado: "por_confirmar", confirmado_en: haceMin(9) }, manana)).toBe(false);
    expect(tocaSubirADropi({ ...base, confirmado_en: haceMin(9), dropi_order_id: "123" }, manana)).toBe(false);
    expect(tocaSubirADropi({ ...base, confirmado_en: null }, manana)).toBe(false);
  });
  it("cuenta los minutos que faltan", () => {
    expect(minutosParaSubir(haceMin(1.5), manana)).toBe(4);
    expect(minutosParaSubir(haceMin(7), manana)).toBe(0);
  });
});

describe("esCortesia", () => {
  it("un gracias o un emoji no detienen la subida", () => {
    for (const t of ["Gracias", "muchas gracias!!", "ok gracias", "🙌", "❤️", "Bendiciones 🙏"]) expect(esCortesia(t)).toBe(true);
  });
  it("una corrección sí la detiene", () => {
    for (const t of ["no espera, faltó el apto 301", "mejor envíenlo a Bello", "gracias, pero cambien el barrio", ""]) {
      expect(esCortesia(t)).toBe(false);
    }
  });
});
