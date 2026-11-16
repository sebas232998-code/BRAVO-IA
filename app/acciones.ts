"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  actualizarPedido,
  borrarPedido,
  configWhatsAppDe,
  guardarCorreccionCiudad,
  guardarVinculo,
  obtenerPedido,
  registrarEvento,
} from "@/lib/db";
import { enviarConfirmacion, subirPedido } from "@/lib/flujo";
import { normalizarTelefono } from "@/lib/telefono";
import { seParecen } from "@/lib/ciudades";
import { textoDropi } from "@/lib/textos";

const texto = (f: FormData, k: string) => String(f.get(k) ?? "").replace(/\s+/g, " ").trim();

// Mientras no esté conectado WhatsApp, Sebastián confirma con la clienta por su WhatsApp
// y aquí marca que ella confirmó. Solo un pedido confirmado se puede subir a Dropi.
export async function marcarConfirmado(f: FormData) {
  const id = texto(f, "id");
  const p = await obtenerPedido(id);
  if (!p || p.estado !== "por_confirmar") return;
  await actualizarPedido(id, { estado: "confirmado", confirmado_en: new Date().toISOString(), dropi_en_pausa: null });
  await registrarEvento(id, "confirmado_manual");
  revalidatePath("/");
}

export async function volverAPorConfirmar(f: FormData) {
  const id = texto(f, "id");
  const p = await obtenerPedido(id);
  if (!p || p.estado !== "confirmado" || p.dropi_order_id) return;
  await actualizarPedido(id, { estado: "por_confirmar", error_dropi: null, confirmado_en: null, dropi_en_pausa: null });
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
    error_whatsapp: null,
    // Si ya confirmó, la espera de 5 minutos arranca de nuevo con los datos corregidos.
    ...(p.estado === "confirmado" ? { confirmado_en: new Date().toISOString(), dropi_en_pausa: null } : {}),
    // Si tenía error de Dropi, ya estaba confirmado: queda listo para reintentar con el botón.
    // (No se reintenta solo: si Dropi no respondió, el pedido pudo quedar creado allá.)
    ...(p.estado === "error" ? { estado: "confirmado" as const, confirmado_en: null, dropi_en_pausa: null } : {}),
  };
  await actualizarPedido(id, cambios);

  // Dropi rechazó el pedido y el vendedor corrigió la ortografía de la ciudad: la app lo aprende.
  if (p.estado === "error" && p.error_dropi && p.ciudad && cambios.ciudad && seParecen(p.ciudad, cambios.ciudad)) {
    await guardarCorreccionCiudad(textoDropi(p.ciudad), cambios.ciudad, cambios.departamento);
    await registrarEvento(id, "correccion_aprendida", { original: p.ciudad, ciudad: cambios.ciudad });
  }
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
  await subirPedido(texto(f, "id"), false);
  revalidatePath("/");
}

// El vendedor revisó lo que escribió la clienta y quiere que el piloto automático siga.
export async function quitarPausaDropi(f: FormData) {
  const id = texto(f, "id");
  const p = await obtenerPedido(id);
  if (!p || p.estado !== "confirmado" || p.dropi_order_id) return;
  await actualizarPedido(id, { dropi_en_pausa: null });
  await registrarEvento(id, "pausa_dropi_quitada");
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
  const c = await configWhatsAppDe(p.tienda_dominio);
  if (!c) return;
  const r = await enviarConfirmacion(p, c, false);
  revalidatePath("/");
  redirect(r.ok ? `/?ok=${encodeURIComponent(`Confirmación enviada a ${p.nombre_clienta}.`)}` : `/?error=${encodeURIComponent(`WhatsApp: ${r.mensaje}`)}`);
}

// El vendedor ya atendió lo que la IA le dejó.
export async function atencionResuelta(f: FormData) {
  const id = texto(f, "id");
  await actualizarPedido(id, { atencion_vendedor: null });
  await registrarEvento(id, "atencion_resuelta");
  revalidatePath("/");
}
