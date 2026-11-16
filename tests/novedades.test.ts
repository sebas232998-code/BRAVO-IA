import { describe, expect, it } from "vitest";
import { enlaceWhatsApp, leerNovedad, mensajeNovedad } from "../lib/novedades";

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
    expect(mensajeNovedad(n)).toContain("El repartidor pasó, pero no logró hacer la entrega");
    expect(mensajeNovedad({ ...n, novedad: "INFORMACIÓN INCOMPLETA O ERRADA DEL DESTINATARIO" })).toContain("confirmar la dirección");
    expect(mensajeNovedad({ ...n, novedad: null, estado: "RECLAME EN OFICINA" })).toContain("oficina de Servientrega");
    for (const nov of ["DESTINATARIO NO SE ENCUENTRA", "NO LE INTERESA LA MERCANCÍA", "INFORMACIÓN INCOMPLETA", "OTRA"]) {
      const m = mensajeNovedad({ ...n, novedad: nov });
      expect(m).toContain("ya está en tu ciudad");
      expect(m).not.toMatch(/🙏|😊|no estabas|tu culpa|no contestaste/i);
    }
  });

  it("enlace de WhatsApp con el mensaje", () => {
    const n = leerNovedad(pedido({}))!;
    expect(enlaceWhatsApp(n)).toMatch(/^https:\/\/wa\.me\/573001234567\?text=Hola%2C%20Mar%C3%ADa/);
    expect(enlaceWhatsApp({ ...n, telefono: null })).toBeNull();
  });
});
