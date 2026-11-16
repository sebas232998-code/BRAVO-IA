// Bandeja de novedades: pedidos en camino con un problema reportado por la transportadora.
// Los datos de contacto se leen de Dropi en el momento y NO se guardan.

import { etapa, fechaDropi, tieneNovedad } from "./dropi-estados";
import { normalizarTelefono } from "./telefono";

export interface Novedad {
  id: number;
  tienda: string | null;
  estado: string;
  novedad: string | null;
  transportadora: string | null;
  guia: string | null;
  ciudad: string | null;
  producto: string | null;
  primerNombre: string;
  telefono: string | null; // 57XXXXXXXXXX
  direccion: string | null;
  desde: string | null; // última actualización
}

const nombre = (x: unknown) =>
  typeof x === "string" ? x : x && typeof x === "object" && typeof (x as { name?: unknown }).name === "string" ? (x as { name: string }).name : null;

const capitalizar = (s: string) => s.toLowerCase().replace(/(^|\s)\p{L}/gu, (m) => m.toUpperCase());

export function leerNovedad(o: Record<string, unknown>): Novedad | null {
  const estado = String(o.status ?? "").toUpperCase();
  const novedad = typeof o.novedad_servientrega === "string" && o.novedad_servientrega.trim() ? o.novedad_servientrega.trim() : null;
  if (etapa(estado) !== "en_camino" || !tieneNovedad({ estado, novedad })) return null;
  const detalles = (Array.isArray(o.orderdetails) ? o.orderdetails : []) as Record<string, unknown>[];
  const producto = nombre((detalles[0] ?? {}).product);
  const primer = String(o.name ?? "").trim().split(/\s+/)[0] ?? "";
  return {
    id: Number(o.id),
    tienda: nombre(o.shop)?.toUpperCase() ?? null,
    estado,
    novedad,
    transportadora: nombre(o.distribution_company) ?? nombre(o.shipping_company),
    guia: o.shipping_guide ? String(o.shipping_guide) : null,
    ciudad: nombre(o.city),
    producto: producto ? capitalizar(producto) : null,
    primerNombre: primer ? capitalizar(primer) : "",
    telefono: normalizarTelefono(String(o.phone ?? "")),
    direccion: typeof o.dir === "string" ? o.dir : null,
    desde: fechaDropi(o.updated_at),
  };
}

// Mensaje para la clienta según la novedad. Reglas de la especificación:
// la novedad es de la transportadora o del repartidor, nunca de la clienta; se le cuenta que el paquete
// ya está en su ciudad y se le pide confirmar o corregir la dirección, o dar un lugar alterno. Sin 🙏 ni 😊.
export function mensajeNovedad(n: Novedad): string {
  const hola = n.primerNombre ? `Hola, ${n.primerNombre}, ¿cómo estás?` : "Hola, ¿cómo estás?";
  const paquete = n.producto ? `tu pedido de ${n.producto}` : "tu pedido";
  const texto = `${n.novedad ?? ""} ${n.estado}`.toUpperCase();
  const empresa = n.transportadora ? capitalizar(n.transportadora) : "la transportadora";

  if (/RECLAME EN OFICINA/.test(texto)) {
    return `${hola} Te cuento que ${paquete} ya está en tu ciudad y quedó disponible en la oficina de ${empresa} para que lo reclames 📦\n\n¿Te queda fácil pasar por él, o prefieres que intentemos entregarlo en otra dirección?`;
  }
  if (/NO SE ENCUENTRA|AUSENTE|CERRADO|NO HAY QUIEN/.test(texto)) {
    return `${hola} Te cuento que ${paquete} ya está en tu ciudad. El repartidor pasó, pero no logró hacer la entrega 📦\n\n¿A qué hora te queda mejor recibirlo, o hay alguien que lo pueda recibir por ti?`;
  }
  if (/INCOMPLETA|ERRADA|DIRECCI|NO EXISTE|BARRIO/.test(texto)) {
    return `${hola} Te cuento que ${paquete} ya está en tu ciudad, pero la transportadora necesita confirmar la dirección para entregártelo 📦\n\n¿Nos la envías completa, con el barrio y alguna referencia? Si prefieres, también te lo pueden llevar a otro lugar.`;
  }
  if (/NO LE INTERESA|CANCELA|RECHAZ/.test(texto)) {
    return `${hola} Te cuento que ${paquete} ya está en tu ciudad, y la transportadora nos reportó una novedad con la entrega 📦\n\n¿Todo bien con tu pedido? Si pasó algo, cuéntanos y lo solucionamos.`;
  }
  return `${hola} Te cuento que ${paquete} ya está en tu ciudad, pero la transportadora reportó una novedad con la entrega 📦\n\n¿Nos confirmas tu dirección o un lugar alterno donde te lo puedan entregar?`;
}

export function enlaceWhatsApp(n: Novedad): string | null {
  if (!n.telefono) return null;
  return `https://wa.me/${n.telefono}?text=${encodeURIComponent(mensajeNovedad(n))}`;
}

// Trae de Dropi (solo lectura) los pedidos de los últimos días y deja solo los que tienen novedad abierta.
export async function novedadesAbiertas(dias = 30, maxPaginas = 6): Promise<{ novedades: Novedad[]; error: string | null }> {
  const base = (process.env.DROPI_API_URL ?? "https://api.dropi.co/integrations").replace(/\/$/, "");
  const limite = Date.now() - dias * 86_400_000;
  const novedades: Novedad[] = [];
  for (let pagina = 0; pagina < maxPaginas; pagina++) {
    let lista: Record<string, unknown>[];
    try {
      const res = await fetch(`${base}/orders/myorders?result_number=100&start=${pagina * 100}`, {
        headers: { Accept: "application/json", "dropi-integration-key": process.env.DROPI_INTEGRATION_KEY ?? "" },
        signal: AbortSignal.timeout(20000),
        cache: "no-store",
      });
      if (!res.ok) return { novedades, error: `Dropi respondió con error ${res.status}.` };
      lista = ((await res.json()) as { objects?: Record<string, unknown>[] }).objects ?? [];
    } catch {
      return { novedades, error: "Dropi no respondió a tiempo. Intenta otra vez en un momento." };
    }
    for (const o of lista) {
      const n = leerNovedad(o);
      if (n) novedades.push(n);
    }
    const ultima = fechaDropi(lista.at(-1)?.created_at);
    if (lista.length < 100 || (ultima && new Date(ultima).getTime() < limite)) break;
  }
  return { novedades, error: null };
}
