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
import { enviarYGuardar } from "@/lib/wa-servidor";
import {
  esConfirmacion,
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

  for (const m of extraerMensajes(aviso)) {
    const c = await configPorNumero(m.phone_number_id);
    if (!c) continue;
    if (!firmaMetaValida(cuerpo, req.headers.get("x-hub-signature-256"), c.app_secret)) {
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

    // Regla fija: solo un "sí" claro confirma. El pedido NO se sube a Dropi aquí.
    if (pedido.estado !== "confirmado" && esConfirmacion(m.texto)) {
      await actualizarPedido(pedido.id, { estado: "confirmado" });
      await registrarEvento(pedido.id, "confirmado_whatsapp", { texto: m.texto });
      const id = pedido.id;
      after(async () => {
        await espera(5000); // que no parezca un robot
        await enviarYGuardar(c, m.de, mensajeTexto(m.de, MENSAJE_CONFIRMADO), MENSAJE_CONFIRMADO, id);
      });
    } else if (esCorregirDatos(m.texto)) {
      await registrarEvento(pedido.id, "pide_corregir_datos");
      const id = pedido.id;
      after(async () => {
        await espera(3000);
        await enviarYGuardar(c, m.de, mensajeTexto(m.de, MENSAJE_CORREGIR), MENSAJE_CORREGIR, id);
      });
    }
  }

  // Meta solo necesita un 200 rápido; si no lo recibe, reintenta.
  return NextResponse.json({ ok: true });
}
