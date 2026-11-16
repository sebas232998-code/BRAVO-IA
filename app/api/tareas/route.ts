import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import {
  baseConfigurada,
  confirmadosSinSubir,
  configWhatsAppDe,
  pedidosConAvisoVencido,
  pedidosEnSeguimiento,
  pedidosSinConfirmacion,
  registrarLatido,
  tiendasConInterruptores,
} from "@/lib/db";
import { tocaEnviarConfirmacion, tocaSubirADropi } from "@/lib/automatico";
import { enviarConfirmacion, enviarSeguimiento, marcarSinRespuesta, subirPedido } from "@/lib/flujo";
import { siguientePaso } from "@/lib/seguimiento";
import { enviarAvisoConfirmado } from "@/lib/conversacion";
import { atenderNovedades } from "@/lib/novedades-auto";

// Reloj de tareas del piloto automático. Supabase (pg_cron) llama aquí cada minuto.
// 1. Envía la confirmación por WhatsApp a los pedidos nuevos.
// 2. Sube a Dropi los pedidos confirmados hace 5 minutos o más.
// 3. Seguimiento a quien no responde (3 mensajes; el tercero con descuento) y cierre como "sin respuesta".
// Se protege con la clave CRON_SECRET (variable de entorno en Vercel).

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_DROPI_POR_VUELTA = 5; // cada subida puede tardar hasta 25 s

function autorizado(req: Request): boolean {
  const clave = process.env.CRON_SECRET;
  if (!clave) return false;
  const llega = Buffer.from(req.headers.get("authorization") ?? "");
  const esperada = Buffer.from(`Bearer ${clave}`);
  return llega.length === esperada.length && timingSafeEqual(llega, esperada);
}

async function vuelta() {
  const ahora = new Date();
  const resumen = { confirmaciones: 0, errores_whatsapp: 0, subidos_dropi: 0, errores_dropi: 0, seguimientos: 0, sin_respuesta: 0, avisos_confirmado: 0 };

  const tiendas = await tiendasConInterruptores();
  for (const t of tiendas) {
    if (t.auto_confirmacion) {
      const c = await configWhatsAppDe(t.dominio);
      if (c) {
        for (const p of await pedidosSinConfirmacion(t.dominio, t.auto_desde)) {
          if (!tocaEnviarConfirmacion(p, t.auto_desde, ahora)) continue;
          const r = await enviarConfirmacion(p, c, true);
          if (r.ok) resumen.confirmaciones++;
          else resumen.errores_whatsapp++;
        }
      }
    }

    if (t.auto_seguimiento) {
      const c = await configWhatsAppDe(t.dominio);
      if (c) {
        for (const p of await pedidosEnSeguimiento(t.dominio)) {
          const paso = siguientePaso(p, t, ahora);
          if (!paso) continue;
          if (paso.tipo === "sin_respuesta") {
            await marcarSinRespuesta(p);
            resumen.sin_respuesta++;
            continue;
          }
          const r = await enviarSeguimiento(p, c, paso.numero, t, ahora);
          if (r.ok) resumen.seguimientos++;
          else resumen.errores_whatsapp++;
        }
      }
    }

    if (t.auto_dropi) {
      for (const p of await confirmadosSinSubir(t.dominio)) {
        if (resumen.subidos_dropi + resumen.errores_dropi >= MAX_DROPI_POR_VUELTA) break; // el resto, en la próxima vuelta
        if (!tocaSubirADropi(p, ahora)) continue;
        const r = await subirPedido(p.id!, true);
        if (r.ok) resumen.subidos_dropi++;
        else resumen.errores_dropi++;
      }
    }
  }

  // Mensaje de "pedido confirmado" que quedó pendiente después de que la IA actualizó el pedido
  // y la clienta no volvió a escribir.
  for (const p of await pedidosConAvisoVencido()) {
    if (!p.telefono) continue;
    const c = await configWhatsAppDe(p.tienda_dominio);
    if (c) {
      await enviarAvisoConfirmado(c, p.telefono, p.id!, true);
      resumen.avisos_confirmado++;
    }
  }

  // Novedades: escribirle a la clienta según la novedad y recordarle si no responde.
  try {
    Object.assign(resumen, await atenderNovedades(tiendas, ahora));
  } catch (e) {
    console.log("[tareas] novedades", e);
  }

  await registrarLatido("tareas", resumen);
  return resumen;
}

async function atender(req: Request) {
  if (!autorizado(req)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  if (!baseConfigurada()) return NextResponse.json({ error: "falta la base de datos" }, { status: 500 });
  const resumen = await vuelta();
  console.log("[tareas]", resumen);
  return NextResponse.json({ ok: true, ...resumen });
}

export const GET = atender;
export const POST = atender;
