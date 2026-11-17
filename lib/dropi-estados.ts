// Estados de los pedidos en Dropi (solo lectura). Ver supabase/migrations/011_dropi_ordenes.sql.

export interface OrdenDropiLeida {
  id: number;
  tienda: string | null;
  estado: string;
  novedad: string | null;
  ciudad: string | null;
  departamento: string | null;
  transportadora: string | null;
  producto: string | null;
  dropi_product_id: number | null;
  total: number | null;
  flete: number | null;
  costo_producto: number | null;
  shop_order_id: string | null;
  creado_en: string;
  actualizado_en: string | null;
  es_prueba?: boolean;
}

// Dropi manda las fechas sin zona horaria (hora de Colombia).
export function fechaDropi(s: unknown): string | null {
  if (typeof s !== "string" || !s) return null;
  return /[zZ]|[+-]\d\d:?\d\d$/.test(s) ? new Date(s).toISOString() : new Date(`${s.replace(" ", "T")}-05:00`).toISOString();
}

const nombre = (x: unknown): string | null => {
  if (!x) return null;
  if (typeof x === "string") return x.trim() || null;
  if (typeof x === "object" && typeof (x as { name?: unknown }).name === "string") return ((x as { name: string }).name).trim() || null;
  return null;
};
const num = (x: unknown): number | null => (x === null || x === undefined || x === "" || isNaN(Number(x)) ? null : Number(x));

const simple = (s: string) => s.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();

// ¿Es un pedido de prueba del vendedor? (por su nombre o porque dice "prueba"/"test")
export function esPrueba(o: Record<string, unknown>, nombresPrueba: string[] = []): boolean {
  const nombre = simple(`${o.name ?? ""} ${o.surname ?? ""}`);
  const notas = simple(`${o.notes ?? ""} ${nombre}`);
  if (/\b(PRUEBA|PRUEBAS|TEST)\b/.test(notas)) return true;
  return nombresPrueba.map(simple).filter(Boolean).some((n) => nombre.includes(n));
}

// Convierte un pedido de la API de Dropi, dejando por fuera los datos personales.
export function leerOrden(o: Record<string, unknown>, nombresPrueba: string[] = []): OrdenDropiLeida | null {
  const id = num(o.id);
  const creado = fechaDropi(o.created_at);
  if (!id || !creado) return null;
  const detalles = (Array.isArray(o.orderdetails) ? o.orderdetails : []) as Record<string, unknown>[];
  const primero = detalles[0] ?? {};
  const producto = (primero.product ?? {}) as Record<string, unknown>;
  const costo = detalles.reduce((s, d) => {
    const p = num(((d.product ?? {}) as Record<string, unknown>).sale_price);
    return p === null ? s : s + p * (num(d.quantity) ?? 1);
  }, 0);
  const novedad = typeof o.novedad_servientrega === "string" && o.novedad_servientrega.trim() ? o.novedad_servientrega.trim() : null;
  return {
    id,
    tienda: nombre(o.shop)?.toUpperCase() ?? null, // "toreva" y "TOREVA" son la misma
    estado: String(o.status ?? "").trim().toUpperCase() || "DESCONOCIDO",
    novedad,
    ciudad: nombre(o.city),
    departamento: nombre(o.state),
    transportadora: nombre(o.distribution_company) ?? nombre(o.shipping_company),
    producto: nombre(producto.name),
    dropi_product_id: num(producto.id ?? primero.product_id),
    total: num(o.total_order),
    flete: num(o.shipping_amount),
    costo_producto: costo > 0 ? Math.round(costo) : null,
    shop_order_id: o.shop_order_id ? String(o.shop_order_id) : null,
    creado_en: creado,
    actualizado_en: fechaDropi(o.updated_at),
    es_prueba: esPrueba(o, nombresPrueba),
  };
}

// En qué etapa va el pedido.
export type Etapa = "entregado" | "devuelto" | "en_camino" | "preparando" | "sin_despachar";

export function etapa(estado: string): Etapa {
  const e = estado.toUpperCase();
  if (e === "ENTREGADO" || e.startsWith("ENTREGADO")) return "entregado";
  if (e.includes("DEVOLU")) return "devuelto";
  if (/CANCELAD|PENDIENTE|RECHAZAD|ANULAD/.test(e)) return "sin_despachar";
  if (/GUIA_GENERADA|GUIA GENERADA|PREPARADO/.test(e)) return "preparando";
  return "en_camino";
}

export function tieneNovedad(o: Pick<OrdenDropiLeida, "estado" | "novedad">): boolean {
  return Boolean(o.novedad) || /NOVEDAD|RECLAME EN OFICINA/.test(o.estado.toUpperCase());
}

export interface TasasDropi {
  total: number;
  despachados: number;
  entregados: number;
  devueltos: number;
  enCamino: number;
  conNovedad: number; // novedades abiertas (todavía en camino)
  cancelados: number;
  entrega: number | null;
  novedad: number | null;
  rescate: number | null;
  realVenta: number | null;
  fletePromedio: number | null;
}

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null);

export function tasasDropi(ordenes: OrdenDropiLeida[]): TasasDropi {
  const et = ordenes.map((o) => ({ o, e: etapa(o.estado), n: tieneNovedad(o) }));
  const entregados = et.filter((x) => x.e === "entregado").length;
  const devueltos = et.filter((x) => x.e === "devuelto").length;
  const enCamino = et.filter((x) => x.e === "en_camino").length;
  const despachados = entregados + devueltos + enCamino;
  const conNov = et.filter((x) => x.n && x.e !== "sin_despachar" && x.e !== "preparando");
  const novTerminadas = conNov.filter((x) => x.e === "entregado" || x.e === "devuelto");
  const fletes = et.filter((x) => (x.e === "entregado" || x.e === "devuelto") && x.o.flete).map((x) => x.o.flete!);
  return {
    total: ordenes.length,
    despachados,
    entregados,
    devueltos,
    enCamino,
    conNovedad: conNov.filter((x) => x.e === "en_camino").length,
    cancelados: et.filter((x) => x.e === "sin_despachar" && /CANCEL|RECHAZ|ANULAD/.test(x.o.estado)).length,
    entrega: pct(entregados, entregados + devueltos),
    novedad: pct(conNov.length, despachados),
    rescate: pct(novTerminadas.filter((x) => x.e === "entregado").length, novTerminadas.length),
    realVenta: entregados + devueltos > 0 ? pct(entregados, ordenes.length) : null,
    fletePromedio: fletes.length ? Math.round(fletes.reduce((a, b) => a + b, 0) / fletes.length) : null,
  };
}

// "¿Dónde se pierden?": tasa de entrega por ciudad, transportadora o producto (mínimo 3 pedidos terminados).
export function porGrupo(ordenes: OrdenDropiLeida[], campo: "ciudad" | "transportadora" | "producto" | "tienda", minimo = 3) {
  const grupos = new Map<string, { entregados: number; devueltos: number }>();
  for (const o of ordenes) {
    const e = etapa(o.estado);
    if (e !== "entregado" && e !== "devuelto") continue;
    const k = o[campo] ?? "Sin dato";
    const g = grupos.get(k) ?? { entregados: 0, devueltos: 0 };
    if (e === "entregado") g.entregados++;
    else g.devueltos++;
    grupos.set(k, g);
  }
  return [...grupos.entries()]
    .map(([nombre, g]) => ({ nombre, ...g, terminados: g.entregados + g.devueltos, tasa: Math.round((g.entregados / (g.entregados + g.devueltos)) * 100) }))
    .filter((g) => g.terminados >= minimo)
    .sort((a, b) => a.tasa - b.tasa || b.terminados - a.terminados);
}

// Trae de Dropi las páginas de pedidos (las más nuevas primero) hasta llegar a la fecha límite.
export async function traerOrdenesDropi(hastaFecha: Date, maxPaginas = 12, nombresPrueba: string[] = []): Promise<{ ordenes: OrdenDropiLeida[]; error: string | null }> {
  const base = (process.env.DROPI_API_URL ?? "https://api.dropi.co/integrations").replace(/\/$/, "");
  const ordenes: OrdenDropiLeida[] = [];
  const POR_PAGINA = 100;
  for (let pagina = 0; pagina < maxPaginas; pagina++) {
    let json: { isSuccess?: boolean; objects?: Record<string, unknown>[]; message?: string };
    try {
      const res = await fetch(`${base}/orders/myorders?result_number=${POR_PAGINA}&start=${pagina * POR_PAGINA}`, {
        headers: { Accept: "application/json", "dropi-integration-key": process.env.DROPI_INTEGRATION_KEY ?? "" },
        signal: AbortSignal.timeout(20000),
      });
      if (res.status === 401 || res.status === 403) return { ordenes, error: "Dropi no aceptó el token." };
      json = await res.json();
    } catch {
      return { ordenes, error: "Dropi no respondió a tiempo." };
    }
    const lista = json.objects ?? [];
    for (const o of lista) {
      const leida = leerOrden(o, nombresPrueba);
      if (leida) ordenes.push(leida);
    }
    const masViejo = ordenes.at(-1)?.creado_en;
    if (lista.length < POR_PAGINA || (masViejo && new Date(masViejo) < hastaFecha)) break;
  }
  return { ordenes, error: null };
}

// Promedios por pedido (de los entregados y devueltos) para el punto de equilibrio.
export function promediosDropi(ordenes: OrdenDropiLeida[]): { venta: number; costo: number | null; flete: number | null; pedidos: number } | null {
  const t = ordenes.filter((o) => ["entregado", "devuelto"].includes(etapa(o.estado)) && o.total);
  if (t.length < 3) return null;
  const prom = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  return {
    venta: prom(t.map((o) => o.total!))!,
    costo: prom(t.filter((o) => o.costo_producto).map((o) => o.costo_producto!)),
    flete: prom(t.filter((o) => o.flete).map((o) => o.flete!)),
    pedidos: t.length,
  };
}

// "EN REPARTO" → "En reparto", "GUIA_GENERADA" → "Guía generada"
export function estadoBonito(estado: string): string {
  const t = estado.replace(/_/g, " ").toLowerCase().replace(/guia/g, "guía").replace(/devolucion/g, "devolución").replace(/transito/g, "tránsito").replace(/confirmacion/g, "confirmación");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// El día en que el pedido terminó (se entregó o se devolvió). Dropi no manda esa fecha aparte:
// se usa la última actualización.
export const fechaFin = (o: Pick<OrdenDropiLeida, "actualizado_en" | "creado_en">) => o.actualizado_en ?? o.creado_en;

const entre = (f: string, desde: Date, hasta: Date) => new Date(f) >= desde && new Date(f) < hasta;

// Tasas de la operación en unas fechas:
// - entregados, devueltos, tasa de entrega y de rescate: por el día en que TERMINARON (si un pedido de octubre
//   se devolvió en noviembre, cuenta en noviembre);
// - en camino, novedades abiertas y tasa de novedad: de los pedidos que ENTRARON en esas fechas.
export function tasasOperacion(todas: OrdenDropiLeida[], desde: Date, hasta: Date): TasasDropi {
  const creados = todas.filter((o) => entre(o.creado_en, desde, hasta));
  const terminados = todas.filter((o) => ["entregado", "devuelto"].includes(etapa(o.estado)) && entre(fechaFin(o), desde, hasta));
  const base = tasasDropi(creados);
  const t = tasasDropi(terminados);
  return {
    ...base,
    entregados: t.entregados,
    devueltos: t.devueltos,
    despachados: t.entregados + t.devueltos + base.enCamino,
    entrega: t.entrega,
    rescate: t.rescate,
    fletePromedio: t.fletePromedio,
  };
}

// Los que terminaron en esas fechas (para "¿Dónde se pierden?").
export const terminadosEntre = (todas: OrdenDropiLeida[], desde: Date, hasta: Date) =>
  todas.filter((o) => ["entregado", "devuelto"].includes(etapa(o.estado)) && entre(fechaFin(o), desde, hasta));
