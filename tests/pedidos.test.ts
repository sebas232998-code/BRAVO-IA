import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { normalizarTelefono } from "../lib/telefono";
import { convertirPedido, firmaValida, type PedidoShopify } from "../lib/shopify";
import { formatoPesos, mensajeConfirmacion } from "../lib/mensajes";

describe("normalizarTelefono", () => {
  it("acepta formatos comunes de Colombia", () => {
    expect(normalizarTelefono("300 123 4567")).toBe("573001234567");
    expect(normalizarTelefono("+57 300-123-4567")).toBe("573001234567");
    expect(normalizarTelefono("573001234567")).toBe("573001234567");
    expect(normalizarTelefono("0057 3001234567")).toBe("573001234567");
  });
  it("rechaza números incompletos o fijos", () => {
    expect(normalizarTelefono("31045")).toBeNull();
    expect(normalizarTelefono("6044441234")).toBeNull();
    expect(normalizarTelefono("")).toBeNull();
  });
});

const pedidoShopify: PedidoShopify = {
  id: 555,
  name: "#1041",
  created_at: "2026-11-09T09:20:00-05:00",
  total_price: "159800.00",
  currency: "COP",
  note: null,
  customer: { first_name: "Laura", last_name: "Gómez", phone: null },
  shipping_address: {
    first_name: "Laura",
    last_name: "Gómez",
    address1: "Cra 45 # 12-30",
    address2: "Barrio El Lido",
    city: "Cali",
    province: "Valle del Cauca",
    phone: "300 123 4567",
  },
  line_items: [
    { product_id: 1, variant_id: 2, title: "Forro de sofá", variant_title: "Gris / 3 puestos", quantity: 2, price: "79900.00" },
  ],
};

describe("convertirPedido", () => {
  it("toma los datos de envío de Shopify", () => {
    const p = convertirPedido(pedidoShopify, "petion.myshopify.com");
    expect(p.nombre_clienta).toBe("Laura Gómez");
    expect(p.telefono).toBe("573001234567");
    expect(p.direccion).toBe("Cra 45 # 12-30, Barrio El Lido");
    expect(p.total).toBe(159800);
    expect(p.estado).toBe("por_confirmar");
  });
});

describe("mensajeConfirmacion", () => {
  it("pone cada dato en su renglón y cierra con CONFIRMAR", () => {
    const m = mensajeConfirmacion(convertirPedido(pedidoShopify, "petion.myshopify.com"));
    expect(m).toBe(
      [
        "Producto: Forro de sofá",
        "Variante: Gris / 3 puestos",
        "Cantidad: 2",
        "Total a pagar: $159.800",
        "Ciudad: Cali",
        "Dirección: Cra 45 # 12-30, Barrio El Lido",
        "",
        "Si todo está correcto, envía la palabra *CONFIRMAR* y te lo despachamos lo más pronto posible 🚚",
      ].join("\n"),
    );
  });
  it("formatea pesos con punto", () => {
    expect(formatoPesos(1159800)).toBe("$1.159.800");
  });
});

describe("firmaValida", () => {
  it("acepta la firma correcta y rechaza las demás", () => {
    const cuerpo = JSON.stringify(pedidoShopify);
    const firma = createHmac("sha256", "clave-petion").update(cuerpo).digest("base64");
    expect(firmaValida(cuerpo, firma, ["clave-rumbo", "clave-petion"])).toBe(true);
    expect(firmaValida(cuerpo, firma, ["otra"])).toBe(false);
    expect(firmaValida(cuerpo, null, ["clave-petion"])).toBe(false);
  });
});
