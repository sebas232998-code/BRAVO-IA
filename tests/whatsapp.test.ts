import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  esConfirmacion,
  esCorregirDatos,
  extraerMensajes,
  firmaMetaValida,
  mensajePlantillaConfirmacion,
  plantillaParaMeta,
  resumenProductos,
  valorEspacio,
} from "../lib/whatsapp";
import type { Pedido } from "../lib/tipos";

const pedido: Pedido = {
  id: "abc",
  tienda_dominio: "x.myshopify.com",
  shopify_order_id: 1,
  numero: "#1001",
  nombre_clienta: "Laura",
  telefono: "573001234567",
  telefono_original: "3001234567",
  departamento: "Antioquia",
  ciudad: "Medellín",
  direccion: "Cra 45 # 12-30\nApto 201",
  notas: null,
  total: 159800,
  moneda: "COP",
  estado: "por_confirmar",
  creado_en: "2026-11-09T10:00:00Z",
  items: [
    { shopify_product_id: 1, shopify_variant_id: 2, producto: "Forro de sofá", variante: "3 puestos / Gris", cantidad: 2, precio_unitario: 79900 },
    { shopify_product_id: 3, shopify_variant_id: null, producto: "Dispensador", variante: null, cantidad: 1, precio_unitario: 0 },
  ],
};

describe("esConfirmacion", () => {
  it("acepta cualquier sí claro", () => {
    for (const t of ["CONFIRMAR", "Confirmo", "sí", "Si señor", "ok", "Listo!", "perfecto", "Dale", "de una", "👍", "✅ Confirmar pedido", "si si", "Sí, confirmo", "confirmo 👍"])
      expect(esConfirmacion(t), t).toBe(true);
  });
  it("no confirma respuestas dudosas o negativas", () => {
    for (const t of ["no", "sí pero cámbienme la dirección", "cuánto se demora?", "ya no lo quiero", "", "Corregir datos"])
      expect(esConfirmacion(t), t).toBe(false);
  });
  it("reconoce el botón de corregir", () => {
    expect(esCorregirDatos("Corregir datos")).toBe(true);
    expect(esCorregirDatos("corregir")).toBe(false);
  });
});

describe("plantilla de confirmación", () => {
  it("resume los productos en un solo renglón", () => {
    expect(resumenProductos(pedido)).toBe("2 Forro de sofá · 3 puestos / Gris, Dispensador");
  });
  it("los espacios no llevan saltos de línea", () => {
    expect(valorEspacio("Cra 45\n# 12-30   apto")).toBe("Cra 45 # 12-30 apto");
    expect(valorEspacio(null)).toBe("-");
  });
  it("arma el mensaje para Meta", () => {
    const m = mensajePlantillaConfirmacion(pedido, { plantilla_confirmacion: null, idioma_plantilla: "es" });
    expect(m.to).toBe("573001234567");
    expect(m.template.name).toBe("confirmacion_pedido");
    expect(m.template.components[0].parameters.map((x) => x.text)).toEqual([
      "2 Forro de sofá · 3 puestos / Gris, Dispensador",
      "$159.800",
      "Medellín",
      "Cra 45 # 12-30 Apto 201",
    ]);
  });
  it("la plantilla tiene 4 espacios con ejemplo y 2 botones", () => {
    const p = plantillaParaMeta();
    const cuerpo = p.components[0] as { text: string; example: { body_text: string[][] } };
    expect(cuerpo.text.match(/\{\{\d\}\}/g)).toHaveLength(4);
    expect(cuerpo.example.body_text[0]).toHaveLength(4);
    expect(cuerpo.text).not.toMatch(/🙏|😊/);
  });
});

describe("webhook de WhatsApp", () => {
  it("revisa la firma de Meta", () => {
    const cuerpo = '{"a":1}';
    const firma = "sha256=" + createHmac("sha256", "secreto").update(cuerpo).digest("hex");
    expect(firmaMetaValida(cuerpo, firma, "secreto")).toBe(true);
    expect(firmaMetaValida(cuerpo, firma, "otra")).toBe(false);
    expect(firmaMetaValida(cuerpo, null, "secreto")).toBe(false);
  });
  it("saca texto y botones de los avisos", () => {
    const aviso = {
      entry: [{ changes: [{ value: {
        metadata: { phone_number_id: "111" },
        messages: [
          { from: "573001234567", id: "w1", timestamp: "1762700000", type: "text", text: { body: "Confirmo" } },
          { from: "573001234567", id: "w2", type: "button", button: { text: "✅ Confirmar pedido", payload: "✅ Confirmar pedido" } },
        ],
      } }] }],
    };
    const m = extraerMensajes(aviso);
    expect(m.map((x) => x.texto)).toEqual(["Confirmo", "✅ Confirmar pedido"]);
    expect(m[0].phone_number_id).toBe("111");
    expect(extraerMensajes({ entry: [{ changes: [{ value: { metadata: { phone_number_id: "1" }, statuses: [] } as never }] }] })).toEqual([]);
  });
});
