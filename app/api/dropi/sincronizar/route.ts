import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { baseConfigurada, guardarOrdenesDropi, hayOrdenesDropi, registrarLatido } from "@/lib/db";
import { traerOrdenesDropi } from "@/lib/dropi-estados";

// Trae de Dropi (solo lectura) los estados de los pedidos y los guarda para las tasas.
// Supabase (pg_cron) llama aquí cada 30 minutos. Protegido con CRON_SECRET.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function autorizado(req: Request): boolean {
  const clave = process.env.CRON_SECRET;
  if (!clave) return false;
  const llega = Buffer.from(req.headers.get("authorization") ?? "");
  const esperada = Buffer.from(`Bearer ${clave}`);
  return llega.length === esperada.length && timingSafeEqual(llega, esperada);
}

export async function GET(req: Request) {
  if (!autorizado(req)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  if (!baseConfigurada() || !process.env.DROPI_INTEGRATION_KEY) return NextResponse.json({ error: "falta configuración" }, { status: 500 });

  // La primera vez se traen 4 meses; después, los últimos 45 días (los estados de los recientes cambian).
  const dias = (await hayOrdenesDropi()) ? 45 : 120;
  const { ordenes, error } = await traerOrdenesDropi(new Date(Date.now() - dias * 86_400_000), dias > 45 ? 25 : 12);
  await guardarOrdenesDropi(ordenes);
  const resumen = { ordenes: ordenes.length, dias, error };
  await registrarLatido("dropi", resumen);
  return NextResponse.json({ ok: !error, ...resumen });
}
