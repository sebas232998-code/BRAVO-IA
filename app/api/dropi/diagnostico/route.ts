import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

// Diagnóstico de SOLO LECTURA: pregunta a la API de Dropi si deja leer los pedidos y cómo vienen los estados.
// No crea, no cambia ni cancela nada. Devuelve solo nombres de campos y valores de estado (sin datos de clientas).
// Protegido con CRON_SECRET.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function autorizado(req: Request): boolean {
  const clave = process.env.CRON_SECRET;
  if (!clave) return false;
  const llega = Buffer.from(req.headers.get("authorization") ?? "");
  const esperada = Buffer.from(`Bearer ${clave}`);
  return llega.length === esperada.length && timingSafeEqual(llega, esperada);
}

const CAMPOS_ESTADO = /status|estado|state_order|novelty|novedad|transport|distribution|carrier|guia|guide/i;

// Resume una respuesta sin exponer datos personales.
function resumir(json: unknown) {
  const o = (json ?? {}) as Record<string, unknown>;
  const lista = [o.objects, o.data, o.orders, o.result, json].find(Array.isArray) as Record<string, unknown>[] | undefined;
  const salida: Record<string, unknown> = { claves: Object.keys(o).slice(0, 30) };
  if (typeof o.message === "string") salida.mensaje = o.message.slice(0, 200);
  if (typeof o.count === "number" || typeof o.total === "number") salida.total = o.count ?? o.total;
  if (!lista) return salida;
  salida.cantidad = lista.length;
  salida.camposPedido = Object.keys(lista[0] ?? {}).slice(0, 80);
  const valores: Record<string, string[]> = {};
  for (const p of lista) {
    for (const [k, v] of Object.entries(p ?? {})) {
      if (!CAMPOS_ESTADO.test(k)) continue;
      const texto = typeof v === "string" || typeof v === "number" ? String(v) : v && typeof v === "object" ? `{${Object.keys(v).slice(0, 12).join(",")}}` : String(v);
      (valores[k] ??= []);
      if (!valores[k].includes(texto) && valores[k].length < 15) valores[k].push(texto.slice(0, 80));
    }
  }
  salida.valoresEstado = valores;
  return salida;
}

export async function GET(req: Request) {
  if (!autorizado(req)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  const base = (process.env.DROPI_API_URL ?? "https://api.dropi.co/integrations").replace(/\/$/, "");
  const rutas = ["/orders/myorders?result_number=50&start=0", "/orders/myorders?result_number=50", "/orders/myorders"];
  const pruebas = [];
  for (const r of rutas) {
    try {
      const res = await fetch(`${base}${r}`, {
        method: "GET",
        headers: { Accept: "application/json", "dropi-integration-key": process.env.DROPI_INTEGRATION_KEY ?? "" },
        signal: AbortSignal.timeout(20000),
      });
      const texto = await res.text();
      let json: unknown = null;
      try {
        json = JSON.parse(texto);
      } catch {
        /* no es JSON */
      }
      pruebas.push({ ruta: r, http: res.status, ...(json ? resumir(json) : { noEsJson: texto.slice(0, 120) }) });
      if (res.ok && json) break;
    } catch (e) {
      pruebas.push({ ruta: r, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return NextResponse.json({ hayToken: Boolean(process.env.DROPI_INTEGRATION_KEY), pruebas });
}
