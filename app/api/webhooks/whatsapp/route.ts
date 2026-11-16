import { after, NextResponse } from "next/server";
import {
  actualizarPedido,
  configPorNumero,
  existeVerifyToken,
  guardarMensaje,
  marcarEstadoMensaje,
  pedidoAbiertoDe,
  registrarEvento,
  guardarGestionNovedad,
  novedadPorTelefono,
  tiendaDe,
} from "@/lib/db";
import { atenderConIA, atenderNovedadConIA, confirmarPorWhatsApp, enviarAvisoConfirmado, iaConfigurada } from "@/lib/conversacion";
import { enviarYGuardar } from "@/lib/wa-servidor";
import {
  esConfirmacion,
  esCortesia,
  esCorregirDatos,
  espera,
  extraerEstados,
  extraerMensajes,
  firmaMetaValida,
  MENSAJE_CORREGIR,
  mensajeTexto,
} from "@/lib/whatsapp";

// La IA puede tardar unos segundos en responder (corre después de contestarle a Meta).
export const maxDuration = 60;

// Meta llama aquí una vez para comprobar que la dirección es nuestra (botón "Verificar y guardar").
export async function GET(req: Request) {
  const u = new URL(req.url);
  const token = u.searchParams.get("hub.verify_token") ?? "";
  if (u.searchParams.get("hub.mode") === "subscribe" && token && (await existeVerifyToken(token))) {
    return new NextResponse(u.searchParams.get("hub.challenge") ?? "", { status: 200 });
  }
  return new NextResponse("token no válido", { status: 403 });
}

// Meta llama aquí cada vez que una clienta escribe o toca un botón.
export async function POST(req: Request) {
  const cuerpo = await req.text();
  let aviso;
  try {
    aviso = JSON.parse(cuerpo);
  } catch {
    return NextResponse.json({ error: "json inválido" }, { status: 400 });
  }

  // Avisos de entrega: si un mensaje nuestro falló (por ejemplo, número sin WhatsApp), el pedido lo muestra.
  for (const st of extraerEstados(aviso)) {
    const c = await configPorNumero(st.phone_number_id);
    if (!c) continue;
    if (!firmaMetaValida(cuerpo, req.headers.get("x-hub-signature-256"), c.app_secret)) {
      return NextResponse.json({ error: "firma inválida" }, { status: 401 });
    }
    const pedidoId = await marcarEstadoMensaje(st.wa_id, st.estado);
    if (pedidoId && st.estado === "failed") {
      await actualizarPedido(pedidoId, { error_whatsapp: st.error });
      await registrarEvento(pedidoId, "whatsapp_no_entregado", { mensaje: st.error });
    }
  }

  const mensajes = extraerMensajes(aviso);
  console.log("[whatsapp] aviso recibido", { mensajes: mensajes.length });
  for (const m of mensajes) {
    const c = await configPorNumero(m.phone_number_id);
    if (!c) {
      console.log("[whatsapp] número sin configurar", m.phone_number_id);
      continue;
    }
    if (!firmaMetaValida(cuerpo, req.headers.get("x-hub-signature-256"), c.app_secret)) {
      console.log("[whatsapp] firma inválida");
      return NextResponse.json({ error: "firma inválida" }, { status: 401 });
    }

    const pedido = await pedidoAbiertoDe(c.tienda_dominio, m.de);
    // Si no tiene pedido abierto en la app, puede estar respondiendo a un mensaje de novedad.
    const novedad = pedido ? null : await novedadPorTelefono(c.tienda_dominio, m.de);
    const nuevo = await guardarMensaje({
      wa_id: m.id,
      tienda_dominio: c.tienda_dominio,
      pedido_id: pedido?.id ?? null,
      telefono: m.de,
      direccion: "entrante",
      texto: m.texto,
      tipo: m.tipo,
      creado_en: m.fecha,
      ...(novedad ? { dropi_id: novedad.dropi_id } : {}),
    });
    if (nuevo && novedad) {
      await guardarGestionNovedad(novedad.dropi_id, {
        respuesta_en: new Date().toISOString(),
        respuesta: [novedad.respuesta, m.texto || `(${m.tipo})`].filter(Boolean).join(" · ").slice(-1000),
      });
      const tiendaN = await tiendaDe(c.tienda_dominio);
      if (tiendaN?.ia_activa && iaConfigurada() && m.texto && !esCortesia(m.texto)) {
        after(() => atenderNovedadConIA(novedad.dropi_id, c, m.de, m.id));
      }
      continue;
    }
    if (!nuevo || !pedido?.id) continue; // repetido, o mensaje sin pedido abierto: solo queda guardado

    const id = pedido.id;
    const confirma = esConfirmacion(m.texto);
    const noPideNada = m.tipo === "reaction" || m.tipo === "sticker" || esCortesia(m.texto);

    // Si la clienta escribe, el seguimiento automático se detiene (ya respondió).
    if (!pedido.ultima_respuesta_en) await actualizarPedido(id, { ultima_respuesta_en: new Date().toISOString() });

    // Regla fija: solo un "sí" claro confirma. El pedido NO se sube a Dropi aquí:
    // arranca la espera de 5 minutos y el reloj de tareas lo sube después (si el piloto está prendido).
    if (pedido.estado !== "confirmado" && confirma) {
      after(() => confirmarPorWhatsApp(pedido, c, m.de, m.texto));
      continue;
    }

    // La IA actualizó el pedido y ella responde "ok, gracias": sale ya el mensaje de pedido confirmado.
    if (pedido.estado === "confirmado" && (confirma || noPideNada)) {
      if (pedido.aviso_confirmado_en) after(() => enviarAvisoConfirmado(c, m.de, id, false));
      continue;
    }

    if (esCorregirDatos(m.texto)) {
      await registrarEvento(id, "pide_corregir_datos");
      after(async () => {
        await espera(3000);
        await enviarYGuardar(c, m.de, mensajeTexto(m.de, MENSAJE_CORREGIR), MENSAJE_CORREGIR, id);
      });
      continue;
    }
    if (noPideNada) continue;

    // Todo lo demás lo atiende la IA (si está prendida para la tienda y hay clave de Anthropic).
    const tienda = await tiendaDe(c.tienda_dominio);
    if (tienda?.ia_activa && iaConfigurada() && m.texto) {
      after(() => atenderConIA(id, c, m.de, m.id));
      continue;
    }

    // Sin IA: lo dudoso solo se guarda. Si ya había confirmado y volvió a escribir ("no, espera, faltó…"),
    // la subida automática a Dropi se detiene hasta que el vendedor lo revise.
    if (pedido.estado === "confirmado") {
      const motivo = m.texto
        ? `La clienta escribió después de confirmar: “${m.texto.slice(0, 200)}”`
        : "La clienta mandó una foto, audio o archivo después de confirmar.";
      await actualizarPedido(id, { dropi_en_pausa: motivo });
      await registrarEvento(id, "pausa_dropi", { texto: m.texto });
    }
  }

  // Meta solo necesita un 200 rápido; si no lo recibe, reintenta.
  return NextResponse.json({ ok: true });
}
