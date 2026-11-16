import {
  actualizarPedido,
  apartarConfirmacion,
  apartarParaSubir,
  obtenerPedido,
  registrarEvento,
  vinculosDe,
} from "./db";
import { armarOrdenDropi, crearOrdenDropi, dropiConfigurado, FaltaDato } from "./dropi";
import { mensajeConfirmacion } from "./mensajes";
import type { Pedido } from "./tipos";
import { enviarYGuardar } from "./wa-servidor";
import { mensajePlantillaConfirmacion, type ConfigWhatsApp } from "./whatsapp";

// Pasos del recorrido del pedido que se usan igual desde un botón o desde el piloto automático.

export type Resultado = { ok: true } | { ok: false; mensaje: string };

// Manda a la clienta el resumen del pedido con la plantilla aprobada por Meta.
export async function enviarConfirmacion(p: Pedido, c: ConfigWhatsApp, automatico: boolean): Promise<Resultado> {
  if (!p.id || p.estado !== "por_confirmar") return { ok: false, mensaje: "El pedido ya no está por confirmar." };
  if (!p.telefono) {
    await registrarEvento(p.id, "error_whatsapp", { mensaje: "Número no válido" });
    return { ok: false, mensaje: "El número de la clienta no es válido." };
  }
  // El piloto automático aparta el pedido antes, para no mandarlo dos veces.
  if (automatico && !(await apartarConfirmacion(p.id))) return { ok: false, mensaje: "Ya se estaba enviando." };

  const r = await enviarYGuardar(c, p.telefono, mensajePlantillaConfirmacion(p, c), mensajeConfirmacion(p), p.id);
  if (!r.ok) {
    await actualizarPedido(p.id, { error_whatsapp: r.mensaje });
    return { ok: false, mensaje: r.mensaje };
  }
  await actualizarPedido(p.id, {
    error_whatsapp: null,
    confirmacion_enviada_en: p.confirmacion_enviada_en ?? new Date().toISOString(),
  });
  await registrarEvento(p.id, "confirmacion_enviada", automatico ? { automatico: true } : null);
  return { ok: true };
}

// Sube el pedido a Dropi. Regla fija: solo si la clienta ya confirmó.
export async function subirPedido(id: string, automatico: boolean): Promise<Resultado> {
  const p = await obtenerPedido(id);
  if (!p) return { ok: false, mensaje: "No existe el pedido." };
  if (p.dropi_order_id) return { ok: false, mensaje: "Ya está en Dropi." };
  if (p.estado !== "confirmado" && !(p.estado === "error" && p.error_dropi)) {
    return { ok: false, mensaje: "La clienta todavía no ha confirmado." };
  }
  if (automatico && p.dropi_en_pausa) return { ok: false, mensaje: p.dropi_en_pausa };

  const fallo = async (mensaje: string): Promise<Resultado> => {
    await actualizarPedido(id, { estado: "error", error_dropi: mensaje, subiendo_desde: null });
    await registrarEvento(id, "error_dropi", { mensaje, ...(automatico ? { automatico: true } : {}) });
    return { ok: false, mensaje };
  };

  if (!dropiConfigurado()) return fallo("Falta poner el token de Dropi (DROPI_INTEGRATION_KEY) en Vercel.");

  let orden;
  try {
    orden = armarOrdenDropi(p, await vinculosDe(p.tienda_dominio));
  } catch (e) {
    if (e instanceof FaltaDato) return fallo(e.message);
    throw e;
  }

  if (!(await apartarParaSubir(id))) return { ok: false, mensaje: "Ya se está subiendo." };

  const r = await crearOrdenDropi(orden);
  if (!r.ok) return fallo(r.mensaje);

  await actualizarPedido(id, {
    estado: "enviado_dropi",
    dropi_order_id: r.id,
    error_dropi: null,
    dropi_en_pausa: null,
    subiendo_desde: null,
  });
  await registrarEvento(id, "enviado_dropi", { dropi_order_id: r.id, ...(automatico ? { automatico: true } : {}) });
  return { ok: true };
}
