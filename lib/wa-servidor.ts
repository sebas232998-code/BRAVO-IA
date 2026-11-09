import { guardarMensaje, registrarEvento } from "./db";
import { enviarMensaje, type ConfigWhatsApp, type RespuestaMeta } from "./whatsapp";

// Envía un mensaje por WhatsApp y lo deja guardado en el historial del pedido.
export async function enviarYGuardar(
  c: ConfigWhatsApp,
  telefono: string,
  cuerpo: unknown,
  textoHistorial: string,
  pedidoId: string | null,
): Promise<RespuestaMeta> {
  const r = await enviarMensaje(c, cuerpo);
  if (r.ok) {
    await guardarMensaje({
      wa_id: r.id,
      tienda_dominio: c.tienda_dominio,
      pedido_id: pedidoId,
      telefono,
      direccion: "saliente",
      texto: textoHistorial,
      tipo: "texto",
    });
  } else if (pedidoId) {
    await registrarEvento(pedidoId, "error_whatsapp", { mensaje: r.mensaje });
  }
  return r;
}
