import { createHmac, timingSafeEqual } from "node:crypto";
import type { Pedido } from "./tipos";
import { formatoPesos } from "./mensajes";

// WhatsApp Business API (Cloud API de Meta).
// Las claves de cada tienda se guardan desde la pantalla /whatsapp (tabla whatsapp_config),
// nunca en el código.

export const GRAPH = "https://graph.facebook.com/v24.0";

export interface ConfigWhatsApp {
  tienda_dominio: string;
  phone_number_id: string;
  waba_id: string | null;
  access_token: string;
  app_secret: string | null;
  verify_token: string;
  plantilla_confirmacion: string | null;
  idioma_plantilla: string;
  token_vence_en?: string | null;
}

// ---------- Plantilla de confirmación (una sola para todos los productos) ----------

export const NOMBRE_PLANTILLA = "confirmacion_pedido";
export const IDIOMA_PLANTILLA = "es";
export const BOTON_CONFIRMAR = "Confirmar pedido"; // Meta no deja emojis en los botones
export const BOTON_CORREGIR = "Corregir datos";

// Meta no deja saltos de línea dentro de un espacio {{n}}: los renglones fijos van en la plantilla.
export const TEXTO_PLANTILLA =
  "Producto: {{1}}\nTotal a pagar: {{2}}\nCiudad: {{3}}\nDirección: {{4}}\n\n" +
  "Si todo está correcto, envía la palabra *CONFIRMAR* y te lo despachamos lo más pronto posible 🚚";

export function plantillaParaMeta() {
  return {
    name: NOMBRE_PLANTILLA,
    language: IDIOMA_PLANTILLA,
    category: "UTILITY",
    components: [
      {
        type: "BODY",
        text: TEXTO_PLANTILLA,
        example: { body_text: [["Forro de sofá · 3 puestos / Gris", "$89.900", "Medellín", "Cra 45 # 12-30"]] },
      },
      {
        type: "BUTTONS",
        buttons: [
          { type: "QUICK_REPLY", text: BOTON_CONFIRMAR },
          { type: "QUICK_REPLY", text: BOTON_CORREGIR },
        ],
      },
    ],
  };
}

// Limpia un valor para meterlo en un espacio de la plantilla (sin saltos de línea ni espacios largos).
export function valorEspacio(s: string | null | undefined, porDefecto = "-"): string {
  const limpio = (s ?? "").replace(/[\n\r\t]+/g, " ").replace(/ {2,}/g, " ").trim();
  return (limpio || porDefecto).slice(0, 300);
}

// "2 Forro de sofá · 3 puestos / Gris, Dispensador"
export function resumenProductos(p: Pedido): string {
  return p.items
    .map((i) => `${i.cantidad > 1 ? `${i.cantidad} ` : ""}${i.producto}${i.variante ? ` · ${i.variante}` : ""}`)
    .join(", ");
}

export function mensajePlantillaConfirmacion(p: Pedido, c: Pick<ConfigWhatsApp, "plantilla_confirmacion" | "idioma_plantilla">) {
  return {
    messaging_product: "whatsapp",
    to: p.telefono,
    type: "template",
    template: {
      name: c.plantilla_confirmacion || NOMBRE_PLANTILLA,
      language: { code: c.idioma_plantilla || IDIOMA_PLANTILLA },
      components: [
        {
          type: "body",
          parameters: [
            valorEspacio(resumenProductos(p)),
            valorEspacio(formatoPesos(p.total)),
            valorEspacio(p.ciudad),
            valorEspacio(p.direccion),
          ].map((text) => ({ type: "text", text })),
        },
      ],
    },
  };
}

// Plantilla de seguimiento con sus valores ({{1}}, {{2}}…). Llevan los mismos botones que la confirmación.
export function mensajePlantilla(para: string, nombre: string, idioma: string, valores: string[]) {
  return {
    messaging_product: "whatsapp",
    to: para,
    type: "template",
    template: {
      name: nombre,
      language: { code: idioma || IDIOMA_PLANTILLA },
      components: [{ type: "body", parameters: valores.map((v) => ({ type: "text", text: valorEspacio(v) })) }],
    },
  };
}

export function plantillaSeguimientoParaMeta(nombre: string, p: { categoria: string; texto: string; ejemplo: readonly string[] }) {
  return {
    name: nombre,
    language: IDIOMA_PLANTILLA,
    category: p.categoria,
    components: [
      { type: "BODY", text: p.texto, example: { body_text: [[...p.ejemplo]] } },
      {
        type: "BUTTONS",
        buttons: [
          { type: "QUICK_REPLY", text: BOTON_CONFIRMAR },
          { type: "QUICK_REPLY", text: BOTON_CORREGIR },
        ],
      },
    ],
  };
}

export function crearPlantillaSeguimientoEnMeta(
  c: Pick<ConfigWhatsApp, "waba_id" | "access_token">,
  nombre: string,
  p: { categoria: string; texto: string; ejemplo: readonly string[] },
) {
  if (!c.waba_id) return Promise.resolve({ ok: false, mensaje: "Falta el ID de la cuenta de WhatsApp Business." } as const);
  return llamarMeta(`${c.waba_id}/message_templates`, c.access_token, plantillaSeguimientoParaMeta(nombre, p));
}

export function mensajeTexto(para: string, texto: string) {
  return { messaging_product: "whatsapp", to: para, type: "text", text: { body: texto, preview_url: false } };
}

// Plantilla que Meta trae aprobada en todos los números de prueba.
export function mensajeHolaMundo(para: string) {
  return { messaging_product: "whatsapp", to: para, type: "template", template: { name: "hello_world", language: { code: "en_US" } } };
}

// ---------- Llamadas a Meta ----------

export type RespuestaMeta = { ok: true; id: string | null } | { ok: false; mensaje: string };

async function llamarMeta(ruta: string, token: string, cuerpo: unknown): Promise<RespuestaMeta> {
  try {
    const r = await fetch(`${GRAPH}/${ruta}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
    });
    const datos = (await r.json().catch(() => ({}))) as {
      id?: string;
      messages?: { id: string }[];
      error?: { message?: string; error_user_msg?: string; code?: number };
    };
    if (!r.ok || datos.error) return { ok: false, mensaje: explicarErrorMeta(datos.error) };
    return { ok: true, id: datos.messages?.[0]?.id ?? datos.id ?? null };
  } catch {
    return { ok: false, mensaje: "No se pudo conectar con Meta. Intenta otra vez en un momento." };
  }
}

// Traduce los errores más comunes de Meta a algo entendible.
export function explicarErrorMeta(e?: { message?: string; error_user_msg?: string; code?: number }): string {
  if (!e) return "Meta respondió con un error sin detalle.";
  if (e.code === 190) return "El token de WhatsApp venció o no es válido. Entra a Configurar WhatsApp y pega uno nuevo.";
  if (e.code === 131030) return "Ese número no está en la lista de números permitidos del número de prueba. Agrégalo en Meta → Paso 1. Probar → Destinatario.";
  if (e.code === 131047) return "Pasaron más de 24 horas desde el último mensaje de la clienta: hay que usar la plantilla aprobada.";
  if (e.code === 131026) return "Este número no tiene WhatsApp (o no se le pudo entregar). Llama a la clienta o corrige el número.";
  if (e.code === 131021) return "No se le puede escribir a ese número (es el mismo número de la tienda).";
  if (e.code === 131049) return "Meta no entregó el mensaje para cuidar la experiencia de la clienta (recibió muchos mensajes de empresas). Intenta más tarde o llámala.";
  if (e.code === 132001) return "La plantilla no existe o todavía no está aprobada por Meta.";
  if (e.code === 100) return `Meta dice que falta o sobra un dato: ${e.error_user_msg ?? e.message ?? ""}`.trim();
  return e.error_user_msg ?? e.message ?? "Error de Meta.";
}

export function enviarMensaje(c: Pick<ConfigWhatsApp, "phone_number_id" | "access_token">, cuerpo: unknown) {
  return llamarMeta(`${c.phone_number_id}/messages`, c.access_token, cuerpo);
}

export function crearPlantillaEnMeta(c: Pick<ConfigWhatsApp, "waba_id" | "access_token">) {
  if (!c.waba_id) return Promise.resolve({ ok: false, mensaje: "Falta el ID de la cuenta de WhatsApp Business." } as const);
  return llamarMeta(`${c.waba_id}/message_templates`, c.access_token, plantillaParaMeta());
}

// Suscribe la cuenta de WhatsApp Business a la app, para que Meta mande los mensajes al webhook.
export function suscribirCuentaAApp(c: Pick<ConfigWhatsApp, "waba_id" | "access_token">) {
  if (!c.waba_id) return Promise.resolve({ ok: false, mensaje: "Falta el ID de la cuenta de WhatsApp Business." } as const);
  return llamarMeta(`${c.waba_id}/subscribed_apps`, c.access_token, {});
}

// ---------- Alargar el token ----------

// El token que da la página de prueba de Meta dura 24 horas. Con la clave secreta de la app
// se cambia por uno de unos 60 días. Si el token ya es permanente (usuario del sistema), se deja igual.

export type TokenAlargado =
  | { ok: true; token: string; venceEn: string | null; cambiado: boolean }
  | { ok: false; mensaje: string };

async function leerGraph(url: string): Promise<Record<string, unknown> & { error?: { message?: string; error_user_msg?: string; code?: number } }> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
    return (await r.json().catch(() => ({}))) as Record<string, unknown>;
  } catch {
    return { error: { message: "No se pudo conectar con Meta. Intenta otra vez en un momento." } };
  }
}

export async function alargarToken(token: string, appSecret: string, ahora = new Date()): Promise<TokenAlargado> {
  const t = encodeURIComponent(token);

  // 1. ¿De qué app es este token?
  const app = await leerGraph(`${GRAPH}/app?access_token=${t}`);
  if (app.error || typeof app.id !== "string") return { ok: false, mensaje: explicarErrorMeta(app.error) };
  const appToken = encodeURIComponent(`${app.id}|${appSecret}`);

  // 2. ¿Cuándo vence? (expires_at = 0 quiere decir que no vence)
  const info = await leerGraph(`${GRAPH}/debug_token?input_token=${t}&access_token=${appToken}`);
  if (info.error) {
    const e = info.error;
    if (e.code === 190 || /secret/i.test(e.message ?? "")) {
      return { ok: false, mensaje: "La clave secreta de la app (App secret) no coincide con la app del token. Revísala en Meta → tu app → Configuración → Básica." };
    }
    return { ok: false, mensaje: explicarErrorMeta(e) };
  }
  const datos = (info.data ?? {}) as { expires_at?: number; is_valid?: boolean };
  if (datos.is_valid === false) return { ok: false, mensaje: "Ese token ya venció. Genera uno nuevo en Meta y pégalo otra vez." };
  if (!datos.expires_at) return { ok: true, token, venceEn: null, cambiado: false }; // permanente

  // 3. Cambiarlo por uno largo.
  const largo = await leerGraph(
    `${GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${app.id}` +
      `&client_secret=${encodeURIComponent(appSecret)}&fb_exchange_token=${t}`,
  );
  if (largo.error || typeof largo.access_token !== "string") return { ok: false, mensaje: explicarErrorMeta(largo.error) };
  const segundos = typeof largo.expires_in === "number" ? largo.expires_in : null;
  return {
    ok: true,
    token: largo.access_token,
    venceEn: segundos ? new Date(ahora.getTime() + segundos * 1000).toISOString() : null,
    cambiado: true,
  };
}

// ---------- Mensajes que llegan (webhook) ----------

// Meta firma cada aviso con la clave secreta de la app (encabezado x-hub-signature-256).
export function firmaMetaValida(cuerpo: string, firma: string | null, appSecret: string | null): boolean {
  if (!appSecret) return true; // sin clave secreta configurada no se puede revisar (solo pruebas)
  if (!firma?.startsWith("sha256=")) return false;
  const esperada = createHmac("sha256", appSecret).update(cuerpo, "utf8").digest("hex");
  const a = Buffer.from(firma.slice(7), "utf8");
  const b = Buffer.from(esperada, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface MensajeEntrante {
  phone_number_id: string;
  de: string; // 57XXXXXXXXXX
  id: string;
  texto: string;
  tipo: string;
  fecha: string;
}

interface AvisoMeta {
  entry?: {
    changes?: {
      value?: {
        metadata?: { phone_number_id?: string };
        statuses?: {
          id: string;
          status: string;
          recipient_id?: string;
          errors?: { code?: number; title?: string; message?: string; error_data?: { details?: string } }[];
        }[];
        messages?: {
          from: string;
          id: string;
          timestamp?: string;
          type: string;
          text?: { body?: string };
          button?: { text?: string; payload?: string };
          interactive?: { button_reply?: { title?: string } };
        }[];
      };
    }[];
  }[];
}

export function extraerMensajes(aviso: AvisoMeta): MensajeEntrante[] {
  const salida: MensajeEntrante[] = [];
  for (const entry of aviso.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const v = change.value;
      const numero = v?.metadata?.phone_number_id;
      if (!numero) continue;
      for (const m of v.messages ?? []) {
        const texto = m.text?.body ?? m.button?.text ?? m.button?.payload ?? m.interactive?.button_reply?.title ?? "";
        salida.push({
          phone_number_id: numero,
          de: m.from,
          id: m.id,
          texto,
          tipo: m.type,
          fecha: m.timestamp ? new Date(Number(m.timestamp) * 1000).toISOString() : new Date().toISOString(),
        });
      }
    }
  }
  return salida;
}

// Avisos de Meta sobre los mensajes que enviamos: entregado, leído o falló.
export interface EstadoMensaje {
  phone_number_id: string;
  wa_id: string;
  estado: string; // sent | delivered | read | failed
  error: string | null;
}

export function extraerEstados(aviso: AvisoMeta): EstadoMensaje[] {
  const salida: EstadoMensaje[] = [];
  for (const entry of aviso.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const v = change.value;
      const numero = v?.metadata?.phone_number_id;
      if (!numero) continue;
      for (const st of v.statuses ?? []) {
        const e = st.errors?.[0];
        salida.push({
          phone_number_id: numero,
          wa_id: st.id,
          estado: st.status,
          error: st.status === "failed" ? explicarErrorMeta({ code: e?.code, message: e?.error_data?.details ?? e?.title ?? e?.message }) : null,
        });
      }
    }
  }
  return salida;
}

// ¿La clienta confirmó? Solo respuestas claras; lo dudoso ("sí pero cambien la dirección") NO cuenta
// y queda para revisar (más adelante lo clasifica la IA).
const PALABRAS_SI = [
  "confirmar", "confirmo", "confirmado", "confirmada", "confirmar pedido", "si", "sii", "siii", "si señor",
  "si señora", "si claro", "claro", "claro que si", "ok", "okay", "listo", "perfecto", "dale", "de una",
  "correcto", "todo correcto", "esta bien", "si esta bien", "si todo bien", "todo bien", "si confirmo",
  "si confirmar", "si correcto", "si perfecto", "si listo", "listo confirmo", "confirmo gracias",
  "si gracias", "ok gracias", "listo gracias", "perfecto gracias", "si por favor", "👍", "✅",
];

export function normalizarRespuesta(t: string): string {
  return t
    .toLowerCase()
    .replace(/ñ/g, "\u0000")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\u0000/g, "ñ")
    .replace(/[¡!¿?.,;:*"'()]/g, " ")
    .replace(/✅\s*/g, "✅ ")
    .replace(/\s+/g, " ")
    .trim();
}

export function esConfirmacion(texto: string): boolean {
  if (texto.trim() === BOTON_CONFIRMAR) return true;
  const t = normalizarRespuesta(texto).replace(/^✅ /, "");
  if (!t) return false;
  if (PALABRAS_SI.includes(t)) return true;
  // "👍👍", "si si", "confirmo 👍"
  const sinEmojis = t.replace(/[👍✅🙌👌]/gu, "").replace(/\s+/g, " ").trim();
  if (!sinEmojis) return /[👍✅👌]/u.test(t);
  if (/^(si ?)+$/.test(sinEmojis)) return true;
  return PALABRAS_SI.includes(sinEmojis);
}

export function esCorregirDatos(texto: string): boolean {
  return normalizarRespuesta(texto) === normalizarRespuesta(BOTON_CORREGIR);
}

// Mensajes que no piden nada ("gracias", "ok gracias", "🙌"): no detienen la subida a Dropi.
const CORTESIAS = [
  "gracias", "muchas gracias", "mil gracias", "gracias a ti", "gracias a usted", "bueno gracias", "vale gracias",
  "listo gracias", "ok gracias", "perfecto gracias", "super", "excelente", "genial", "bueno", "vale", "bendiciones",
  "dios le pague", "quedo atenta", "quedo atento", "estare pendiente", "a la orden", "con gusto",
];

export function esCortesia(texto: string): boolean {
  const t = normalizarRespuesta(texto)
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{1F3FB}-\u{1F3FF}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return texto.trim().length > 0; // solo emojis o stickers
  return CORTESIAS.includes(t);
}

export const MENSAJE_CORREGIR = "Ok, no hay ningún problema. Envía los datos que deseas editar directamente aquí.";

export const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
