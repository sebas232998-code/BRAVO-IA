import { describe, expect, it } from "vitest";
import { armarOrdenDropi, ciudadDropi, departamentoDropi, FaltaDato } from "../lib/dropi";
import type { Pedido } from "../lib/tipos";

const base: Pedido = {
  id: "x",
  tienda_dominio: "7hvike-y1.myshopify.com",
  shopify_order_id: 9001,
  numero: "#1050",
  nombre_clienta: "Laura Gómez Ruiz",
  telefono: "573001234567",
  telefono_original: "300 123 4567",
  departamento: "Antioquia",
  ciudad: "Medellín",
  direccion: "Cra 45 # 12-30",
  notas: null,
  total: 169900,
  moneda: "COP",
  estado: "confirmado",
  creado_en: "2026-11-09T10:00:00-05:00",
  items: [
    { shopify_product_id: 1, shopify_variant_id: 11, producto: "Forro de sofá", variante: "Gris", cantidad: 1, precio_unitario: 159900 },
  ],
};

const vinculos = [{ shopify_variant_id: 11, dropi_product_id: 777, dropi_variation_id: 55 }];

describe("departamento y ciudad para Dropi", () => {
  it("convierte los nombres de Shopify a los de Dropi", () => {
    expect(departamentoDropi("Valle del Cauca", "Cali")).toBe("VALLE");
    expect(departamentoDropi("Bogotá, D.C.", "Bogotá")).toBe("CUNDINAMARCA");
    expect(departamentoDropi("Nariño", "Pasto")).toBe("NARIÑO");
    expect(departamentoDropi(null, "bogota d.c.")).toBe("CUNDINAMARCA");
    expect(ciudadDropi("Medellín")).toBe("MEDELLIN");
    expect(ciudadDropi("Bogotá D.C.")).toBe("BOGOTA");
  });
});

describe("armarOrdenDropi", () => {
  it("arma el pedido con recaudo igual al total de Shopify", () => {
    const o = armarOrdenDropi(base, vinculos);
    expect(o).toMatchObject({
      state: "ANTIOQUIA",
      city: "MEDELLIN",
      name: "Laura",
      surname: "Gómez Ruiz",
      phone: "3001234567",
      rate_type: "CON RECAUDO",
      type: "FINAL_ORDER",
      total_order: 169900,
      products: [{ id: 777, variation_id: 55, quantity: 1, price: 169900 }],
    });
  });

  it("no deja subir sin producto vinculado ni con número malo", () => {
    expect(() => armarOrdenDropi(base, [])).toThrow(FaltaDato);
    expect(() => armarOrdenDropi({ ...base, telefono: null }, vinculos)).toThrow(FaltaDato);
  });
});
