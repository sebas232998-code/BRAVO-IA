import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import type { Variante } from "../lib/catalogo";
import { atenderMensaje, HERRAMIENTAS, REGLAS, type LlamarClaude } from "../lib/ia/agente";
import { cambiarEnvio, cambiarProducto, completarRespuesta } from "../lib/ia/cambios";
import type { Pedido } from "../lib/tipos";

const T = "petion.myshopify.com";
const catalogo: Variante[] = [
  { tienda_dominio: T, shopify_product_id: 1, shopify_variant_id: 11, producto: "Forro de sofá", variante: "Gris / 3 puestos", precio: 89900, disponible: true },
  { tienda_dominio: T, shopify_product_id: 1, shopify_variant_id: 12, producto: "Forro de sofá", variante: "Gris / 2 puestos", precio: 79900, disponible: true },
  { tienda_dominio: T, shopify_product_id: 1, shopify_variant_id: 13, producto: "Forro de sofá", variante: "Beige / 3 puestos", precio: 89900, disponible: true },
  { tienda_dominio: T, shopify_product_id: 2, shopify_variant_id: 21, producto: "Dispensador", variante: null, precio: 49900, disponible: true },
];

const pedido: Pedido = {
  id: "p1", tienda_dominio: T, shopify_order_id: 1, numero: "#1001", nombre_clienta: "Laura Gómez",
  telefono: "573001234567", telefono_original: "3001234567", departamento: "Valle del Cauca", ciudad: "Cali",
  direccion: "Cra 45 # 12-30", notas: null, total: 99900, moneda: "COP", estado: "por_confirmar",
  creado_en: "2026-11-16T10:00:00Z",
  // 89.900 del forro + 10.000 de envío
  items: [{ shopify_product_id: 1, shopify_variant_id: 11, producto: "Forro de sofá", variante: "Gris / 3 puestos", cantidad: 1, precio_unitario: 89900 }],
};

describe("cambiarProducto", () => {
  it("cambia de variante con el precio de Shopify y respeta el envío", () => {
    const r = cambiarProducto(pedido, catalogo, 1, "12", null);
    expect(r.ok && r.pedido.items[0]).toMatchObject({ shopify_variant_id: 12, variante: "Gris / 2 puestos", precio_unitario: 79900 });
    expect(r.ok && r.pedido.total).toBe(89900); // 79.900 + 10.000 de envío
  });
  it("cambia la cantidad", () => {
    const r = cambiarProducto(pedido, catalogo, 1, null, 3);
    expect(r.ok && r.pedido.total).toBe(279700); // 3 × 89.900 + 10.000
  });
  it("no deja inventar variantes ni pasar a otro producto", () => {
    expect(cambiarProducto(pedido, catalogo, 1, "999", null).ok).toBe(false);
    expect(cambiarProducto(pedido, catalogo, 1, "21", null).ok).toBe(false); // el dispensador es otro producto
    expect(cambiarProducto(pedido, catalogo, 2, null, 2).ok).toBe(false); // no hay línea 2
    expect(cambiarProducto(pedido, catalogo, 1, null, 0).ok).toBe(false);
    expect(cambiarProducto(pedido, catalogo, 1, null, 50).ok).toBe(false);
  });
});

describe("cambiarEnvio", () => {
  it("cambia solo lo que se pidió y valida el celular", () => {
    const r = cambiarEnvio(pedido, { nombre: null, telefono: null, departamento: null, ciudad: null, direccion: "Cra 50 # 10-20, apto 301" });
    expect(r.ok && r.pedido.direccion).toBe("Cra 50 # 10-20, apto 301");
    expect(r.ok && r.pedido.ciudad).toBe("Cali");
    expect(cambiarEnvio(pedido, { nombre: null, telefono: "31045", departamento: null, ciudad: null, direccion: null }).ok).toBe(false);
  });
});

describe("completarRespuesta", () => {
  it("agrega el total si cambió y la IA no lo dijo", () => {
    const despues = { ...pedido, total: 279700 };
    expect(completarRespuesta("Listo, tu pedido quedó actualizado a 3 forros ✅", pedido, despues)).toBe(
      "Listo, tu pedido quedó actualizado a 3 forros ✅ El total ahora es $279.700",
    );
    expect(completarRespuesta("Listo ✅ El total ahora es $279.700", pedido, despues)).toBe("Listo ✅ El total ahora es $279.700");
  });
  it("si no cambió el total, no lo menciona", () => {
    expect(completarRespuesta("Listo, ya actualicé la dirección ✅", pedido, { ...pedido, direccion: "x" })).toBe(
      "Listo, ya actualicé la dirección ✅",
    );
  });
});

// Claude simulado: devuelve las respuestas en orden y guarda lo que se le pidió.
function claudeSimulado(respuestas: Anthropic.Beta.BetaContentBlock[][]) {
  const pedidos: Anthropic.Beta.MessageCreateParamsNonStreaming[] = [];
  const llamar: LlamarClaude = async (params) => {
    pedidos.push(structuredClone(params));
    const content = respuestas.shift()!;
    return {
      id: "msg", type: "message", role: "assistant", model: params.model, content,
      stop_reason: content.some((b) => b.type === "tool_use") ? "tool_use" : "end_turn",
      stop_sequence: null, usage: {} as Anthropic.Beta.BetaUsage, container: null, context_management: null,
    } as unknown as Anthropic.Beta.BetaMessage;
  };
  return { llamar, pedidos };
}
const usar = (name: string, input: unknown, id = "t1") => ({ type: "tool_use", id, name, input }) as Anthropic.Beta.BetaToolUseBlock;
const texto = (t: string) => ({ type: "text", text: t, citations: null }) as Anthropic.Beta.BetaTextBlock;
const chat = (t: string) => [
  { direccion: "saliente" as const, texto: "Producto: Forro de sofá · Gris / 3 puestos\nTotal a pagar: $99.900" },
  { direccion: "entrante" as const, texto: t },
];

describe("atenderMensaje (conversaciones de ejemplo)", () => {
  it("“es el beige”: cambia la variante y responde una frase", async () => {
    const { llamar, pedidos } = claudeSimulado([
      [usar("cambiar_producto", { linea: 1, variante_id: "13", cantidad: null })],
      [texto("Listo, tu pedido quedó actualizado a 1 forro de 3 puestos color beige ✅")],
    ]);
    const r = await atenderMensaje(llamar, pedido, catalogo, chat("ay no, es el beige"), "por confirmar");
    expect(r.cambio).toBe(true);
    expect(r.pedido.items[0].shopify_variant_id).toBe(13);
    expect(r.texto).toBe("Listo, tu pedido quedó actualizado a 1 forro de 3 puestos color beige ✅");
    // La IA recibió el catálogo y el resultado del cambio
    expect(JSON.stringify(pedidos[0].messages)).toContain("ID 13: Beige / 3 puestos");
    expect(JSON.stringify(pedidos[1].messages)).toContain("Total a pagar: $99.900");
    expect(pedidos[0].model).toBe("claude-sonnet-5-5");
  });

  it("si la IA intenta una variante que no existe, recibe el error y no cambia nada", async () => {
    const { llamar, pedidos } = claudeSimulado([
      [usar("cambiar_producto", { linea: 1, variante_id: "777", cantidad: null })],
      [texto("Mira, en este forro tenemos gris y beige. ¿Cuál deseas?")],
    ]);
    const r = await atenderMensaje(llamar, pedido, catalogo, chat("lo quiero rojo"), "por confirmar");
    expect(r.cambio).toBe(false);
    expect(r.pedido).toEqual(pedido);
    expect(JSON.stringify(pedidos[1].messages)).toContain('"is_error":true');
  });

  it("pregunta que no sabe: escala al vendedor", async () => {
    const { llamar } = claudeSimulado([
      [usar("escalar_al_vendedor", { motivo: "Pregunta si tiene garantía" })],
      [texto("Claro, ya lo consulto y te confirmo en un momento.")],
    ]);
    const r = await atenderMensaje(llamar, pedido, catalogo, chat("¿tiene garantía?"), "por confirmar");
    expect(r.escalar).toBe("Pregunta si tiene garantía");
    expect(r.cambio).toBe(false);
  });

  it("“(sin respuesta)” no se envía", async () => {
    const { llamar } = claudeSimulado([[usar("confirmar_pedido", {})], [texto("(sin respuesta)")]]);
    const r = await atenderMensaje(llamar, pedido, catalogo, chat("sí señora, así está perfecto"), "por confirmar");
    expect(r.confirmar).toBe(true);
    expect(r.texto).toBeNull();
  });

  it("si un filtro de seguridad rechaza, no cambia nada y escala", async () => {
    const llamar: LlamarClaude = async () =>
      ({ content: [], stop_reason: "refusal" }) as unknown as Anthropic.Beta.BetaMessage;
    const r = await atenderMensaje(llamar, pedido, catalogo, chat("..."), "por confirmar");
    expect(r.escalar).toBeTruthy();
    expect(r.cambio).toBe(false);
  });
});

describe("reglas de la IA", () => {
  it("siguen el tono de la especificación", () => {
    expect(REGLAS).toContain("deseas");
    expect(REGLAS).toContain("No uses 🙏 ni 😊");
    expect(REGLAS).toContain("no le pidas que confirme otra vez");
    expect(HERRAMIENTAS.map((h) => h.name)).toEqual(["cambiar_producto", "cambiar_datos_envio", "confirmar_pedido", "escalar_al_vendedor"]);
  });
});

describe("cerebro de la tienda", () => {
  it("la IA recibe lo que escribió el vendedor", async () => {
    const { llamar, pedidos } = claudeSimulado([[texto("Te llega en 2 a 4 días hábiles 🚚")]]);
    await atenderMensaje(llamar, pedido, catalogo, chat("¿cuánto se demora?"), "por confirmar", "Envíos: 2 a 4 días hábiles.");
    expect(JSON.stringify(pedidos[0].messages)).toContain("Envíos: 2 a 4 días hábiles.");
    expect(REGLAS).toContain("responde solo con lo que diga <tienda>");
  });
});

describe("errores de la IA en español", () => {
  it("sin saldo", async () => {
    const { explicarErrorIA } = await import("../lib/ia/agente");
    expect(explicarErrorIA(new Error('400 {"message":"Your credit balance is too low to access the Anthropic API."}'))).toMatch(/no tiene saldo/);
  });
});
