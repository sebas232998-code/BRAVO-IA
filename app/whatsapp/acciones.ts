"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { configWhatsAppDe, guardarConfigWhatsApp } from "@/lib/db";
import { normalizarTelefono } from "@/lib/telefono";
import { fechaCorta } from "@/lib/mensajes";
import { alargarToken, suscribirCuentaAApp, crearPlantillaEnMeta, enviarMensaje, IDIOMA_PLANTILLA, mensajeHolaMundo, NOMBRE_PLANTILLA } from "@/lib/whatsapp";

const texto = (f: FormData, k: string) => String(f.get(k) ?? "").replace(/\s+/g, "").trim();

function volver(tienda: string, tipo: "ok" | "error", mensaje: string): never {
  redirect(`/whatsapp?tienda=${encodeURIComponent(tienda)}&${tipo}=${encodeURIComponent(mensaje)}`);
}

export async function guardarWhatsApp(f: FormData) {
  const tienda = String(f.get("tienda") ?? "").trim();
  if (!tienda) return;
  const antes = await configWhatsAppDe(tienda);

  const phone = texto(f, "phone_number_id").replace(/\D/g, "");
  const tokenNuevo = texto(f, "access_token");
  let token = tokenNuevo || antes?.access_token || "";
  const appSecret = texto(f, "app_secret") || antes?.app_secret || null;
  if (!phone) volver(tienda, "error", "Falta el identificador del número de teléfono.");
  if (!token) volver(tienda, "error", "Falta el token de acceso.");

  // Token nuevo: si es el de 24 horas, se cambia solo por uno de ~60 días.
  let venceEn = antes?.token_vence_en ?? null;
  let avisoToken = "";
  if (tokenNuevo) {
    venceEn = null;
    if (!appSecret) {
      avisoToken = " Ojo: sin la clave secreta de la app (App secret) no puedo alargar el token; si es el de prueba, vence en 24 horas.";
    } else {
      const largo = await alargarToken(tokenNuevo, appSecret);
      if (!largo.ok) volver(tienda, "error", `No guardé el token: ${largo.mensaje}`);
      token = largo.token;
      venceEn = largo.venceEn;
      avisoToken = largo.cambiado
        ? ` El token quedó alargado: vence el ${fechaCorta(venceEn)}.`
        : " El token es permanente: no vence.";
    }
  }

  await guardarConfigWhatsApp({
    tienda_dominio: tienda,
    phone_number_id: phone,
    waba_id: texto(f, "waba_id").replace(/\D/g, "") || null,
    access_token: token,
    token_vence_en: venceEn,
    // Los campos secretos en blanco conservan lo que ya estaba guardado.
    app_secret: appSecret,
    verify_token: antes?.verify_token ?? `bravo-${randomBytes(12).toString("hex")}`,
    plantilla_confirmacion: texto(f, "plantilla") || antes?.plantilla_confirmacion || NOMBRE_PLANTILLA,
    idioma_plantilla: texto(f, "idioma") || antes?.idioma_plantilla || IDIOMA_PLANTILLA,
  });
  const nueva = await configWhatsAppDe(tienda);
  const sus = nueva ? await suscribirCuentaAApp(nueva) : null;
  if (sus && !sus.ok) volver(tienda, "error", `Datos guardados, pero no se pudo activar la recepción de mensajes: ${sus.mensaje}${avisoToken}`);
  volver(tienda, "ok", `Datos guardados y recepción de mensajes activada.${avisoToken}`);
}

export async function probarWhatsApp(f: FormData) {
  const tienda = String(f.get("tienda") ?? "").trim();
  const c = await configWhatsAppDe(tienda);
  if (!c) volver(tienda, "error", "Primero guarda los datos de WhatsApp.");
  const numero = normalizarTelefono(String(f.get("numero") ?? ""));
  if (!numero) volver(tienda, "error", "Ese celular no parece válido. Escríbelo con sus 10 dígitos, por ejemplo 3001234567.");

  const r = await enviarMensaje(c, mensajeHolaMundo(numero));
  if (!r.ok) volver(tienda, "error", r.mensaje);
  volver(tienda, "ok", "¡Mensaje enviado! Revisa tu WhatsApp: debe llegarte un “Hello World”.");
}

export async function crearPlantilla(f: FormData) {
  const tienda = String(f.get("tienda") ?? "").trim();
  const c = await configWhatsAppDe(tienda);
  if (!c) volver(tienda, "error", "Primero guarda los datos de WhatsApp.");
  const r = await crearPlantillaEnMeta(c);
  if (!r.ok) volver(tienda, "error", r.mensaje);
  volver(tienda, "ok", "Plantilla enviada a Meta para revisión. Normalmente la aprueban en unos minutos.");
}
