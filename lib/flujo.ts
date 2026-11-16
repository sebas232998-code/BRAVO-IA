import {
  correccionCiudad,
  actualizarPedido,
  apartarConfirmacion,
  apartarSeguimiento,
  apartarParaSubir,
  obtenerPedido,
  registrarEvento,
  vinculosDe,
} from "./db";
import { armarOrdenDropi, crearOrdenDropi, dropiConfigurado, FaltaDato } from "./dropi";
import { mensajeConfirmacion } from "./mensajes";
import type { Pedido } from "./tipos";
import { textoDropi } from "./textos";
import { enviarYGuardar } from "./wa-servidor";
import { mensajePlantilla, mensajePlantillaConfirmacion, resumenProductos, type ConfigWhatsApp } from "./whatsapp";
import { llenarPlantilla, mensajeSeguimiento, PLANTILLAS_SEGUIMIENTO, type ConfigSeguimiento } from "./seguimiento";

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

  const corregida = await ciudadAprendida(p);
  if (corregida) {
    await actualizarPedido(id, corregida);
    await registrarEvento(id, "ciudad_corregida", { antes: { ciudad: p.ciudad, departamento: p.departamento }, despues: corregida });
    Object.assign(p, corregida);
  }

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

// Manda el mensaje N del seguimiento (1, 2 o 3). El 3 lleva el descuento de rescate si está activo.
export async function enviarSeguimiento(
  p: Pedido,
  c: ConfigWhatsApp,
  numero: 1 | 2 | 3,
  cfg: ConfigSeguimiento,
  ahora = new Date(),
): Promise<Resultado> {
  if (!p.id || !p.telefono) return { ok: false, mensaje: "Sin número." };
  const m = mensajeSeguimiento(numero, resumenProductos(p), Number(p.total), cfg);
  const descuento = m.descuento
    ? {
        descuento_valor: m.descuento.ahorro,
        descuento_vence_en: new Date(ahora.getTime() + cfg.descuento_horas * 3_600_000).toISOString(),
      }
    : {};
  if (!(await apartarSeguimiento(p.id, numero, descuento))) return { ok: false, mensaje: "Ya se estaba enviando." };

  const texto = llenarPlantilla(PLANTILLAS_SEGUIMIENTO[m.plantilla].texto, m.valores);
  const r = await enviarYGuardar(c, p.telefono, mensajePlantilla(p.telefono, m.plantilla, c.idioma_plantilla, m.valores), texto, p.id);
  if (!r.ok) {
    // No se reintenta solo (para no escribirle varias veces); queda el error a la vista.
    // Si el mensaje del descuento no salió, el descuento no cuenta (la clienta nunca lo vio).
    await actualizarPedido(p.id, {
      error_whatsapp: `Seguimiento ${numero}: ${r.mensaje}`,
      ...(m.descuento ? { descuento_valor: null, descuento_vence_en: null } : {}),
    });
    return { ok: false, mensaje: r.mensaje };
  }
  await registrarEvento(p.id, "seguimiento_enviado", { numero, ...(m.descuento ? { descuento: m.descuento } : {}) });
  return { ok: true };
}

export async function marcarSinRespuesta(p: Pedido): Promise<void> {
  if (!p.id) return;
  await actualizarPedido(p.id, { estado: "sin_respuesta" });
  await registrarEvento(p.id, "sin_respuesta", { seguimientos: p.seguimientos_enviados ?? 0 });
}

// Si el vendedor ya corrigió antes esta misma ciudad mal escrita, se aplica sola.
// Devuelve los cambios a guardar (o null si no hay corrección conocida).
export async function ciudadAprendida(p: Pick<Pedido, "ciudad" | "departamento">) {
  const c = await correccionCiudad(textoDropi(p.ciudad ?? ""));
  if (!c || textoDropi(c.ciudad) === textoDropi(p.ciudad ?? "")) return null;
  return { ciudad: c.ciudad, departamento: c.departamento ?? p.departamento };
}
