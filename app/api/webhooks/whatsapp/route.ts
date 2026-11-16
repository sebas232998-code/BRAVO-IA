import { after, NextResponse } from "next/server";
import {
  actualizarPedido,
  configPorNumero,
  existeVerifyToken,
  guardarMensaje,
  pedidoAbiertoDe,
  registrarEvento,
} from "@/lib/db";
import { MENSAJE_CONFIRMADO } from "@/lib/mensajes";
import { decidirDescuento, mensajeDescuentoVencido } from "@/lib/seguimiento";
import { enviarYGuardar } from "@/lib/wa-servidor";
import {
  esConfirmacion,
  esCortesia,
  esCorregirDatos,
  espera,
  extraerMensajes,
  firmaMetaValida,
  MENSAJE_CORREGIR,
  mensajeTexto,
} from "@/lib/whatsapp";

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
    const nuevo = await guardarMensaje({
      wa_id: m.id,
      tienda_dominio: c.tienda_dominio,
      pedido_id: pedido?.id ?? null,
      telefono: m.de,
      direccion: "entrante",
      texto: m.texto,
      tipo: m.tipo,
      creado_en: m.fecha,
    });
    if (!nuevo || !pedido?.id) continue; // repetido, o mensaje sin pedido abierto: solo queda guardado

    const id = pedido.id;
    const confirma = esConfirmacion(m.texto);
    // Regla fija: solo un "sí" claro confirma. El pedido NO se sube a Dropi aquí:
    // arranca la espera de 5 minutos y el reloj de tareas lo sube después (si el piloto está prendido).

    // Si la clienta escribe, el seguimiento automático se detiene (ya respondió).
    if (!pedido.ultima_respuesta_en) await actualizarPedido(id, { ultima_respuesta_en: new Date().toISOString() });

    if (pedido.estado !== "confirmado" && confirma) {
      const d = decidirDescuento(pedido, new Date());

      // Se le ofreció descuento y ya venció: se le avisa con amabilidad y se le ofrece el precio normal.
      if (d.tipo === "avisar_vencido") {
        await actualizarPedido(id, { descuento_vencido_avisado: true });
        await registrarEvento(id, "descuento_vencido_avisado", { texto: m.texto });
        const aviso = mensajeDescuentoVencido(Number(pedido.total));
        after(async () => {
          await espera(4000);
          await enviarYGuardar(c, m.de, mensajeTexto(m.de, aviso), aviso, id);
        });
        continue;
      }

      await actualizarPedido(id, {
        estado: "confirmado",
        confirmado_en: new Date().toISOString(),
        dropi_en_pausa: null,
        // Confirmó a tiempo con descuento: el valor a recaudar en Dropi queda rebajado.
        ...(d.tipo === "aplicar"
          ? { total_original: Number(pedido.total), total: d.nuevoTotal, descuento_aplicado: true }
          : {}),
      });
      await registrarEvento(id, "confirmado_whatsapp", {
        texto: m.texto,
        ...(d.tipo === "aplicar" ? { descuento: Number(pedido.descuento_valor), total: d.nuevoTotal } : {}),
      });
      after(async () => {
        await espera(5000); // que no parezca un robot
        await enviarYGuardar(c, m.de, mensajeTexto(m.de, MENSAJE_CONFIRMADO), MENSAJE_CONFIRMADO, id);
      });
      continue;
    }

    // Ya confirmó y todavía no está en Dropi, pero volvió a escribir ("no, espera, faltó…"):
    // la subida automática se detiene hasta que el vendedor lo revise.
    // Un "gracias", un sticker, una reacción o un nuevo "sí" no la detienen.
    const noPideNada = m.tipo === "reaction" || m.tipo === "sticker" || esCortesia(m.texto);
    if (pedido.estado === "confirmado" && !confirma && !noPideNada) {
      const motivo = m.texto
        ? `La clienta escribió después de confirmar: “${m.texto.slice(0, 200)}”`
        : "La clienta mandó una foto, audio o archivo después de confirmar.";
      await actualizarPedido(id, { dropi_en_pausa: motivo });
      await registrarEvento(id, "pausa_dropi", { texto: m.texto });
    }

    if (esCorregirDatos(m.texto)) {
      await registrarEvento(id, "pide_corregir_datos");
      after(async () => {
        await espera(3000);
        await enviarYGuardar(c, m.de, mensajeTexto(m.de, MENSAJE_CORREGIR), MENSAJE_CORREGIR, id);
      });
    }
  }

  // Meta solo necesita un 200 rápido; si no lo recibe, reintenta.
  return NextResponse.json({ ok: true });
}
