// Qué hace la app con cada mensaje de la clienta (se usa desde el webhook de WhatsApp, dentro de after()).

import {
  actualizarPedido,
  apartarAvisoConfirmado,
  catalogoDe,
  chatDe,
  guardarVariantes,
  obtenerPedido,
  registrarEvento,
  tiendaDe,
} from "./db";
import { variantesDePedido } from "./catalogo";
import { atenderMensaje, llamarClaudeReal, type LlamarClaude } from "./ia/agente";
import { completarRespuesta } from "./ia/cambios";
import { clasificarReal, type Clasificar } from "./ia/clasificar";
import { MENSAJE_CONFIRMADO } from "./mensajes";
import { decidirDescuento, mensajeDescuentoVencido } from "./seguimiento";
import type { Pedido } from "./tipos";
import { enviarYGuardar } from "./wa-servidor";
import { espera, mensajeTexto, type ConfigWhatsApp } from "./whatsapp";

export const iaConfigurada = () => Boolean(process.env.ANTHROPIC_API_KEY);

// Que no parezca un robot: más espera si el mensaje es largo.
const esperaEscribiendo = (texto: string) => espera(Math.min(2500 + texto.length * 40, 12000));

async function responder(c: ConfigWhatsApp, telefono: string, texto: string, pedidoId: string) {
  await esperaEscribiendo(texto);
  await enviarYGuardar(c, telefono, mensajeTexto(telefono, texto), texto, pedidoId);
}

// El mensaje de "pedido confirmado" pendiente (después de que la IA actualizó el pedido).
export async function enviarAvisoConfirmado(c: ConfigWhatsApp, telefono: string, pedidoId: string, soloSiVencio: boolean) {
  if (!(await apartarAvisoConfirmado(pedidoId, soloSiVencio))) return;
  await responder(c, telefono, MENSAJE_CONFIRMADO, pedidoId);
}

// La clienta dijo que sí (por palabras, botón, Haiku o la IA). Aplica el descuento si está vigente.
export async function confirmarPorWhatsApp(p: Pedido, c: ConfigWhatsApp, telefono: string, texto: string) {
  if (!p.id || p.estado === "confirmado") return;
  const d = decidirDescuento(p, new Date());

  // Se le ofreció descuento y ya venció: se le avisa con amabilidad y se le ofrece el precio normal.
  if (d.tipo === "avisar_vencido") {
    await actualizarPedido(p.id, { descuento_vencido_avisado: true });
    await registrarEvento(p.id, "descuento_vencido_avisado", { texto });
    await responder(c, telefono, mensajeDescuentoVencido(Number(p.total)), p.id);
    return;
  }

  await actualizarPedido(p.id, {
    estado: "confirmado",
    confirmado_en: new Date().toISOString(),
    dropi_en_pausa: null,
    atencion_vendedor: null,
    ...(d.tipo === "aplicar" ? { total_original: Number(p.total), total: d.nuevoTotal, descuento_aplicado: true } : {}),
  });
  await registrarEvento(p.id, "confirmado_whatsapp", {
    texto,
    ...(d.tipo === "aplicar" ? { descuento: Number(p.descuento_valor), total: d.nuevoTotal } : {}),
  });
  await espera(5000);
  await enviarYGuardar(c, telefono, mensajeTexto(telefono, MENSAJE_CONFIRMADO), MENSAJE_CONFIRMADO, p.id);
}

const ESTADOS_ABIERTOS = new Set(["por_confirmar", "sin_respuesta", "confirmado"]);
const NOMBRE_ESTADO_IA: Record<string, string> = {
  por_confirmar: "por confirmar",
  sin_respuesta: "por confirmar (no había respondido)",
  confirmado: "confirmado, todavía no ha salido",
};

// La IA atiende un mensaje que no fue un "sí" ni un "gracias" claros.
export async function atenderConIA(
  pedidoId: string,
  c: ConfigWhatsApp,
  telefono: string,
  waId: string | null,
  deps: { llamar?: LlamarClaude; clasificar?: Clasificar } = {},
) {
  // Si escribe varios mensajes seguidos ("es el de 2 puestos" … "y quiero 2"), se responde una sola vez, al último.
  await espera(4000);
  const chat = await chatDe(pedidoId);
  const entrantes = chat.filter((m) => m.direccion === "entrante");
  if (waId && entrantes.at(-1)?.wa_id !== waId) return;

  const p = await obtenerPedido(pedidoId);
  if (!p?.id || !ESTADOS_ABIERTOS.has(p.estado) || p.dropi_order_id) return;
  const ultimo = entrantes.at(-1)?.texto ?? "";

  // 1. Haiku (barato): ¿es un "sí" o un "gracias" dicho de otra forma?
  try {
    const tipo = await (deps.clasificar ?? clasificarReal())(ultimo);
    if (tipo === "confirma" && p.estado !== "confirmado") return confirmarPorWhatsApp(p, c, telefono, ultimo);
    if (tipo === "cortesia" || (tipo === "confirma" && p.estado === "confirmado")) {
      return enviarAvisoConfirmado(c, telefono, p.id, false);
    }
  } catch (e) {
    console.log("[ia] no se pudo clasificar, sigue con Sonnet", e);
  }

  // 2. Sonnet: conversa, cambia el pedido o escala.
  const catalogo = await catalogoDe(p.tienda_dominio, [...new Set(p.items.map((i) => i.shopify_product_id!).filter(Boolean))]);
  const conocidas = new Set(catalogo.map((v) => v.shopify_variant_id));
  const completo = [...catalogo, ...variantesDePedido(p).filter((v) => !conocidas.has(v.shopify_variant_id))];

  let r;
  try {
    const tienda = await tiendaDe(p.tienda_dominio);
    r = await atenderMensaje(
      deps.llamar ?? llamarClaudeReal(),
      p,
      completo,
      chat,
      NOMBRE_ESTADO_IA[p.estado] ?? p.estado,
      tienda?.cerebro ?? null,
    );
  } catch (e) {
    console.log("[ia] error", e);
    await actualizarPedido(p.id, {
      atencion_vendedor: "La IA no pudo responder (error de conexión). Revisa el chat.",
      ...(p.estado === "confirmado" ? { dropi_en_pausa: "La clienta escribió y la IA no pudo responder." } : {}),
    });
    return;
  }
  await aplicarResultado(p, r, c, telefono);
}

async function aplicarResultado(
  antes: Pedido,
  r: Awaited<ReturnType<typeof atenderMensaje>>,
  c: ConfigWhatsApp,
  telefono: string,
) {
  const id = antes.id!;
  const ahora = new Date();

  if (r.escalar) {
    await actualizarPedido(id, {
      atencion_vendedor: r.escalar,
      ...(antes.estado === "confirmado" ? { dropi_en_pausa: `La IA te dejó esto: ${r.escalar}` } : {}),
    });
    await registrarEvento(id, "ia_escalo", { motivo: r.escalar });
  }

  if (r.cambio) {
    const d = r.pedido;
    let total = Number(d.total);
    let extra: Partial<Pedido> = {};
    // Si tenía descuento de rescate vigente, se respeta sobre el total nuevo (mismo porcentaje).
    if (antes.estado !== "confirmado" && decidirDescuento(antes, ahora).tipo === "aplicar") {
      const proporcion = Number(antes.descuento_valor) / Number(antes.total);
      extra = { total_original: total, descuento_aplicado: true };
      total = Math.round(total * (1 - proporcion));
    }
    const yaEstaba = antes.estado === "confirmado";
    await actualizarPedido(id, {
      items: d.items,
      total,
      nombre_clienta: d.nombre_clienta,
      telefono: d.telefono,
      telefono_original: d.telefono_original,
      departamento: d.departamento,
      ciudad: d.ciudad,
      direccion: d.direccion,
      ...extra,
      // Pidió un cambio: desea el producto. Queda confirmado y la espera de 5 minutos arranca de nuevo.
      estado: "confirmado",
      confirmado_en: ahora.toISOString(),
      error_dropi: null,
      error_whatsapp: null,
      ...(r.escalar ? {} : { dropi_en_pausa: null, atencion_vendedor: null }),
      // El "pedido confirmado" sale cuando ella responda o en 2 minutos (si no se le había mandado ya).
      ...(yaEstaba ? {} : { aviso_confirmado_en: new Date(ahora.getTime() + 2 * 60_000).toISOString() }),
    });
    await registrarEvento(id, "ia_cambio", {
      antes: { items: antes.items, total: antes.total, ciudad: antes.ciudad, direccion: antes.direccion, telefono: antes.telefono },
      despues: { items: d.items, total, ciudad: d.ciudad, direccion: d.direccion, telefono: d.telefono },
    });
    await guardarVariantes(variantesDePedido({ ...d, total }));
    const despues = { ...d, total };
    await responder(c, telefono, completarRespuesta(r.texto, antes, despues), id);
    return;
  }

  if (r.confirmar && antes.estado !== "confirmado") {
    if (r.texto) await responder(c, telefono, r.texto, id);
    return confirmarPorWhatsApp({ ...antes, estado: antes.estado }, c, telefono, "(confirmó según la IA)");
  }

  if (r.texto) await responder(c, telefono, r.texto, id);
}
