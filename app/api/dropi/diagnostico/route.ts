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
  // Estructura (solo nombres de campos) de las partes anidadas, y conteo por estado.
  const p0 = lista[0] ?? {};
  const det = Array.isArray(p0.orderdetails) ? (p0.orderdetails as Record<string, unknown>[])[0] ?? {} : {};
  salida.camposDetalle = Object.keys(det).slice(0, 60);
  salida.camposProducto = Object.keys((det.product ?? {}) as object).slice(0, 60);
  salida.camposVariacion = Object.keys((det.variation ?? {}) as object).slice(0, 40);
  salida.camposTienda = Object.keys((p0.shop ?? {}) as object).slice(0, 30);
  salida.camposTransportadora = Object.keys((p0.distribution_company ?? {}) as object);
  salida.transportadoras = [...new Set(lista.map((p) => (p.distribution_company as { name?: string } | null)?.name).filter(Boolean))];
  salida.tiendas = [...new Set(lista.map((p) => (p.shop as { name?: string } | null)?.name).filter(Boolean))];
  salida.productos = [...new Set(lista.flatMap((p) => ((p.orderdetails as { product?: { name?: string } }[]) ?? []).map((d) => d.product?.name)).filter(Boolean))].slice(0, 10);
  const porEstado: Record<string, number> = {};
  for (const p of lista) porEstado[String(p.status)] = (porEstado[String(p.status)] ?? 0) + 1;
  salida.porEstado = porEstado;
  salida.ejemploNumeros = lista.slice(0, 3).map((p) => ({
    total_order: p.total_order,
    shipping_amount: p.shipping_amount,
    detalle: ((p.orderdetails as Record<string, unknown>[]) ?? []).slice(0, 1).map((d) => ({ price: d.price, quantity: d.quantity, supplier_price: d.supplier_price })),
  }));
  salida.fechas = { mas_nuevo: lista[0]?.created_at, mas_viejo: lista.at(-1)?.created_at };
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
