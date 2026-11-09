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
  if (e.code === 190) return "El token de acceso venció o no es válido. Genera uno nuevo en Meta y pégalo aquí.";
  if (e.code === 131030) return "Ese número no está en la lista de números permitidos del número de prueba. Agrégalo en Meta → Paso 1. Probar → Destinatario.";
  if (e.code === 131047) return "Pasaron más de 24 horas desde el último mensaje de la clienta: hay que usar la plantilla aprobada.";
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

export const MENSAJE_CORREGIR = "Ok, no hay ningún problema. Envía los datos que deseas editar directamente aquí.";

export const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
