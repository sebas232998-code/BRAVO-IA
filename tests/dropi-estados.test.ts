import { describe, expect, it } from "vitest";
import { etapa, fechaDropi, leerOrden, porGrupo, promediosDropi, tasasDropi, type OrdenDropiLeida } from "../lib/dropi-estados";

const o = (estado: string, extra: Partial<OrdenDropiLeida> = {}): OrdenDropiLeida => ({
  id: Math.floor(Math.random() * 1e9), tienda: "PETION", estado, novedad: null, ciudad: "CALI", departamento: "VALLE",
  transportadora: "SERVIENTREGA", producto: "PROTECTOR DE SOFA", dropi_product_id: 2286474, total: 99900, flete: 15000,
  costo_producto: 36000, shop_order_id: "1", creado_en: "2026-11-10T15:00:00.000Z", actualizado_en: null, ...extra,
});

describe("estados de Dropi", () => {
  it("clasifica cada estado en su etapa", () => {
    expect(etapa("ENTREGADO")).toBe("entregado");
    expect(etapa("DEVOLUCION")).toBe("devuelto");
    expect(etapa("CANCELADO")).toBe("sin_despachar");
    expect(etapa("PENDIENTE CONFIRMACION")).toBe("sin_despachar");
    expect(etapa("GUIA_GENERADA")).toBe("preparando");
    expect(etapa("EN REPARTO")).toBe("en_camino");
    expect(etapa("RECLAME EN OFICINA")).toBe("en_camino");
  });

  it("lee un pedido sin guardar datos personales", () => {
    const r = leerOrden({
      id: 96850798, status: "ENTREGADO", name: "Laura", phone: "3001234567", dir: "Cra 1", city: "CALI", state: "VALLE",
      shop: { id: 1, name: "Petion" }, distribution_company: { id: 3, name: "SERVIENTREGA" }, total_order: 99900,
      shipping_amount: 15420.5, created_at: "2026-11-14T14:08:38", novedad_servientrega: null,
      orderdetails: [{ quantity: 2, product: { id: 2286474, name: "PROTECTOR DE SOFA", sale_price: "36000.00" } }],
    })!;
    expect(r).toMatchObject({ id: 96850798, tienda: "PETION", estado: "ENTREGADO", transportadora: "SERVIENTREGA", costo_producto: 72000, flete: 15420.5 });
    expect(r.creado_en).toBe("2026-11-14T19:08:38.000Z"); // hora de Colombia
    expect(JSON.stringify(r)).not.toMatch(/Laura|3001234567|Cra 1/);
  });

  it("fechas con o sin zona", () => {
    expect(fechaDropi("2026-11-14 14:08:38")).toBe("2026-11-14T19:08:38.000Z");
    expect(fechaDropi("2026-11-14T14:08:38Z")).toBe("2026-11-14T14:08:38.000Z");
  });

  it("calcula las tasas", () => {
    const t = tasasDropi([
      o("ENTREGADO"), o("ENTREGADO"), o("ENTREGADO", { novedad: "DESTINATARIO NO SE ENCUENTRA" }), o("DEVOLUCION", { novedad: "NO LE INTERESA" }),
      o("EN REPARTO", { novedad: "INFORMACIÓN INCOMPLETA" }), o("CANCELADO"), o("PENDIENTE CONFIRMACION"),
    ]);
    expect(t).toMatchObject({ entregados: 3, devueltos: 1, enCamino: 1, despachados: 5, conNovedad: 1, entrega: 75, rescate: 50, novedad: 60, realVenta: 43 });
  });

  it("dónde se pierden: de peor a mejor", () => {
    const g = porGrupo([o("ENTREGADO", { ciudad: "CALI" }), o("ENTREGADO", { ciudad: "CALI" }), o("ENTREGADO", { ciudad: "CALI" }),
      o("DEVOLUCION", { ciudad: "PASTO" }), o("DEVOLUCION", { ciudad: "PASTO" }), o("ENTREGADO", { ciudad: "PASTO" })], "ciudad");
    expect(g.map((x) => [x.nombre, x.tasa])).toEqual([["PASTO", 33], ["CALI", 100]]);
  });

  it("promedios para el punto de equilibrio", () => {
    expect(promediosDropi([o("ENTREGADO"), o("DEVOLUCION"), o("ENTREGADO", { flete: 18000 })])).toEqual({ venta: 99900, costo: 36000, flete: 16000, pedidos: 3 });
    expect(promediosDropi([o("ENTREGADO")])).toBeNull();
  });
});

import { esPrueba } from "../lib/dropi-estados";
describe("pedidos de prueba", () => {
  it("reconoce los del vendedor y los que dicen prueba", () => {
    expect(esPrueba({ name: "Sebastián", surname: "Toro" }, ["Sebastian Toro"])).toBe(true);
    expect(esPrueba({ name: "Pedido", surname: "de prueba" })).toBe(true);
    expect(esPrueba({ name: "Laura", surname: "Gómez", notes: "TEST" })).toBe(true);
    expect(esPrueba({ name: "Laura", surname: "Gómez", notes: "casa azul" }, ["Sebastian Toro"])).toBe(false);
    expect(esPrueba({ name: "Ernestina", surname: "Contreras" })).toBe(false); // "TEST" dentro de otra palabra no cuenta
  });
});

import { estadoBonito } from "../lib/dropi-estados";
describe("estado bonito", () => {
  it("se lee fácil", () => {
    expect(estadoBonito("GUIA_GENERADA")).toBe("Guía generada");
    expect(estadoBonito("EN TRANSITO")).toBe("En tránsito");
    expect(estadoBonito("DEVOLUCION")).toBe("Devolución");
  });
});

import { tasasOperacion } from "../lib/dropi-estados";
describe("tasas por el día en que terminó el pedido", () => {
  it("un pedido de octubre devuelto en noviembre cuenta en noviembre", () => {
    const desde = new Date("2026-11-01T05:00:00Z");
    const hasta = new Date("2026-12-01T05:00:00Z");
    const t = tasasOperacion(
      [
        o("DEVOLUCION", { creado_en: "2026-10-12T15:00:00Z", actualizado_en: "2026-11-05T15:00:00Z" }),
        o("ENTREGADO", { creado_en: "2026-11-07T15:00:00Z", actualizado_en: "2026-11-14T15:00:00Z" }),
        o("ENTREGADO", { creado_en: "2026-10-10T15:00:00Z", actualizado_en: "2026-10-20T15:00:00Z" }), // terminó en octubre: no cuenta
        o("EN REPARTO", { creado_en: "2026-11-10T15:00:00Z" }),
      ],
      desde,
      hasta,
    );
    expect(t).toMatchObject({ entregados: 1, devueltos: 1, enCamino: 1, despachados: 3, entrega: 50 });
  });
});
