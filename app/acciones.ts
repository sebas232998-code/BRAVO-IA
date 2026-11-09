"use server";

import { revalidatePath } from "next/cache";
import {
  actualizarPedido,
  apartarParaSubir,
  borrarPedido,
  guardarVinculo,
  obtenerPedido,
  registrarEvento,
  vinculosDe,
} from "@/lib/db";
import { armarOrdenDropi, crearOrdenDropi, dropiConfigurado, FaltaDato } from "@/lib/dropi";
import { normalizarTelefono } from "@/lib/telefono";
import { configWhatsAppDe } from "@/lib/db";
import { enviarYGuardar } from "@/lib/wa-servidor";
import { mensajePlantillaConfirmacion } from "@/lib/whatsapp";
import { mensajeConfirmacion } from "@/lib/mensajes";

const texto = (f: FormData, k: string) => String(f.get(k) ?? "").replace(/\s+/g, " ").trim();

// Mientras no esté conectado WhatsApp, Sebastián confirma con la clienta por su WhatsApp
// y aquí marca que ella confirmó. Solo un pedido confirmado se puede subir a Dropi.
export async function marcarConfirmado(f: FormData) {
  const id = texto(f, "id");
  const p = await obtenerPedido(id);
  if (!p || p.estado !== "por_confirmar") return;
  await actualizarPedido(id, { estado: "confirmado" });
  await registrarEvento(id, "confirmado_manual");
  revalidatePath("/");
}

export async function volverAPorConfirmar(f: FormData) {
  const id = texto(f, "id");
  const p = await obtenerPedido(id);
  if (!p || p.estado !== "confirmado" || p.dropi_order_id) return;
  await actualizarPedido(id, { estado: "por_confirmar", error_dropi: null });
  await registrarEvento(id, "confirmacion_deshecha");
  revalidatePath("/");
}

export async function editarDatos(f: FormData) {
  const id = texto(f, "id");
  const p = await obtenerPedido(id);
  if (!p || p.dropi_order_id) return; // ya en Dropi: se cambia allá
  const telefonoOriginal = texto(f, "telefono");
  const cambios = {
    nombre_clienta: texto(f, "nombre") || p.nombre_clienta,
    telefono_original: telefonoOriginal || null,
    telefono: normalizarTelefono(telefonoOriginal),
    departamento: texto(f, "departamento") || null,
    ciudad: texto(f, "ciudad") || null,
    direccion: texto(f, "direccion") || null,
    error_dropi: null,
    // Si tenía error de Dropi, ya estaba confirmado: queda listo para reintentar.
    ...(p.estado === "error" ? { estado: "confirmado" as const } : {}),
  };
  await actualizarPedido(id, cambios);
  await registrarEvento(id, "datos_editados", { antes: { telefono: p.telefono_original, ciudad: p.ciudad, direccion: p.direccion } });
  revalidatePath("/");
}

export async function vincularProducto(f: FormData) {
  const tienda = texto(f, "tienda");
  const variante = Number(texto(f, "variante"));
  const producto = Number(texto(f, "dropi_producto").replace(/\D/g, ""));
  const variacion = Number(texto(f, "dropi_variacion").replace(/\D/g, "")) || null;
  if (!tienda || !variante || !producto) return;
  await guardarVinculo(tienda, { shopify_variant_id: variante, dropi_product_id: producto, dropi_variation_id: variacion });
  revalidatePath("/");
}

export async function subirADropi(f: FormData) {
  const id = texto(f, "id");
  const p = await obtenerPedido(id);
  if (!p) return;

  // Regla fija: el pedido no llega a Dropi hasta que la clienta confirme.
  if (p.estado !== "confirmado" && !(p.estado === "error" && p.error_dropi)) return;
  if (p.dropi_order_id) return;

  const fallo = async (mensaje: string) => {
    await actualizarPedido(id, { estado: "error", error_dropi: mensaje, subiendo_desde: null });
    await registrarEvento(id, "error_dropi", { mensaje });
    revalidatePath("/");
  };

  if (!dropiConfigurado()) return fallo("Falta poner el token de Dropi (DROPI_INTEGRATION_KEY) en Vercel.");

  let orden;
  try {
    orden = armarOrdenDropi(p, await vinculosDe(p.tienda_dominio));
  } catch (e) {
    if (e instanceof FaltaDato) return fallo(e.message);
    throw e;
  }

  if (!(await apartarParaSubir(id))) return; // ya se está subiendo o ya subió

  const r = await crearOrdenDropi(orden);
  if (!r.ok) return fallo(r.mensaje);

  await actualizarPedido(id, { estado: "enviado_dropi", dropi_order_id: r.id, error_dropi: null, subiendo_desde: null });
  await registrarEvento(id, "enviado_dropi", { dropi_order_id: r.id });
  revalidatePath("/");
}

export async function eliminarPedido(f: FormData) {
  const id = texto(f, "id");
  const p = await obtenerPedido(id);
  if (!p || p.dropi_order_id) return; // los que ya están en Dropi no se borran desde aquí
  await borrarPedido(id);
  revalidatePath("/");
}

// Manda a la clienta el resumen del pedido con la plantilla aprobada por Meta.
export async function enviarConfirmacionWhatsApp(f: FormData) {
  const id = texto(f, "id");
  const p = await obtenerPedido(id);
  if (!p || p.estado !== "por_confirmar") return;
  if (!p.telefono) {
    await registrarEvento(id, "error_whatsapp", { mensaje: "Número no válido" });
    return revalidatePath("/");
  }
  const c = await configWhatsAppDe(p.tienda_dominio);
  if (!c) return;
  const r = await enviarYGuardar(c, p.telefono, mensajePlantillaConfirmacion(p, c), mensajeConfirmacion(p), id);
  if (r.ok) await registrarEvento(id, "confirmacion_enviada");
  revalidatePath("/");
}
