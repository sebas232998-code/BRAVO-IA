"use server";

import { catalogoDe } from "@/lib/db";
import { variantesDePedido } from "@/lib/catalogo";
import { iaConfigurada } from "@/lib/conversacion";
import { atenderMensaje, llamarClaudeReal, type MensajeChat } from "@/lib/ia/agente";
import { completarRespuesta } from "@/lib/ia/cambios";
import { clasificarReal } from "@/lib/ia/clasificar";
import { MENSAJE_CONFIRMADO } from "@/lib/mensajes";
import type { Pedido } from "@/lib/tipos";
import { esConfirmacion, esCortesia } from "@/lib/whatsapp";

export interface Burbuja extends MensajeChat {
  nota?: boolean; // explicación para el vendedor (no la ve la clienta)
}

export interface EstadoSimulador {
  pedido: Pedido;
  chat: Burbuja[];
  error?: string;
}

// Simulador: corre la IA de verdad sobre una COPIA del pedido. No envía WhatsApp ni guarda nada.
export async function probarMensaje(previo: EstadoSimulador, f: FormData): Promise<EstadoSimulador> {
  const texto = String(f.get("texto") ?? "").trim();
  if (!texto) return previo;
  const chat: Burbuja[] = [...previo.chat, { direccion: "entrante", texto }];
  const nota = (t: string): Burbuja => ({ direccion: "saliente", texto: t, nota: true });
  const p = previo.pedido;
  const confirmado = p.estado === "confirmado";

  if (esConfirmacion(texto)) {
    if (confirmado) return { pedido: p, chat: [...chat, nota("Ya estaba confirmado: no se responde nada.")] };
    return {
      pedido: { ...p, estado: "confirmado" },
      chat: [...chat, nota("“Sí” claro: se confirma sin IA (gratis)."), { direccion: "saliente", texto: MENSAJE_CONFIRMADO }],
    };
  }
  if (esCortesia(texto)) return { pedido: p, chat: [...chat, nota("Solo agradece: no se responde (gratis).")] };
  if (!iaConfigurada()) return { ...previo, error: "Falta la clave de Anthropic (ANTHROPIC_API_KEY) en Vercel." };

  try {
    const tipo = await clasificarReal()(texto);
    if (tipo === "confirma" && !confirmado) {
      return {
        pedido: { ...p, estado: "confirmado" },
        chat: [...chat, nota("Haiku entendió que confirma."), { direccion: "saliente", texto: MENSAJE_CONFIRMADO }],
      };
    }
    if (tipo === "cortesia" || tipo === "confirma") {
      return { pedido: p, chat: [...chat, nota(`Haiku: “${tipo}”. No se responde.`)] };
    }

    const productos = [...new Set(p.items.map((i) => i.shopify_product_id!).filter(Boolean))];
    const catalogo = await catalogoDe(p.tienda_dominio, productos);
    const conocidas = new Set(catalogo.map((v) => v.shopify_variant_id));
    const completo = [...catalogo, ...variantesDePedido(p).filter((v) => !conocidas.has(v.shopify_variant_id))];
    const r = await atenderMensaje(
      llamarClaudeReal(),
      p,
      completo,
      chat.filter((m) => !m.nota),
      confirmado ? "confirmado, todavía no ha salido" : "por confirmar",
    );

    const salida: Burbuja[] = [...chat];
    let pedido = p;
    if (r.escalar) salida.push(nota(`🤖 Te avisaría a ti: ${r.escalar}`));
    if (r.cambio) {
      pedido = { ...r.pedido, estado: "confirmado" };
      salida.push({ direccion: "saliente", texto: completarRespuesta(r.texto, p, r.pedido) });
      if (!confirmado) salida.push(nota("Queda confirmado. Si ella responde o en 2 minutos, sale:"), { direccion: "saliente", texto: MENSAJE_CONFIRMADO });
    } else if (r.confirmar && !confirmado) {
      pedido = { ...p, estado: "confirmado" };
      if (r.texto) salida.push({ direccion: "saliente", texto: r.texto });
      salida.push({ direccion: "saliente", texto: MENSAJE_CONFIRMADO });
    } else if (r.texto) {
      salida.push({ direccion: "saliente", texto: r.texto });
    } else if (!r.escalar) {
      salida.push(nota("La IA decidió no responder."));
    }
    return { pedido, chat: salida };
  } catch (e) {
    return { ...previo, error: `La IA falló: ${e instanceof Error ? e.message : String(e)}` };
  }
}
