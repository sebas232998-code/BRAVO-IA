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

// ---------- Qué decirle según la novedad ----------
// Reglas de la especificación: la novedad es de la transportadora o del repartidor, nunca de la clienta;
// se le cuenta que el paquete ya está en su ciudad y se le pide confirmar o corregir la dirección,
// o dar un lugar alterno. Sin 🙏 ni 😊. Nada que contradiga lo que dice la novedad.

export type TipoNovedad = "no_estaba" | "direccion" | "oficina" | "reprogramada" | "telefono" | "pago" | "no_interesa" | "otra";

export function tipoNovedad(n: Pick<Novedad, "novedad" | "estado">): TipoNovedad {
  const t = `${n.novedad ?? ""} ${n.estado}`.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (/RECLAME EN OFICINA|RECLAMA EN OFICINA|DISPONIBLE EN OFICINA/.test(t)) return "oficina";
  if (/MANANA|REPROGRAM|NUEVA FECHA|OTRO DIA|PROXIMO DIA|SOLICITA ENTREGA|APLAZ/.test(t)) return "reprogramada";
  if (/NO SE ENCUENTRA|AUSENTE|CERRADO|NADIE|NO ESTA|NO HAY QUIEN/.test(t)) return "no_estaba";
  if (/INCOMPLETA|ERRADA|DIRECCION|NO EXISTE|BARRIO|NOMENCLATURA|NO UBICA/.test(t)) return "direccion";
  if (/TELEFONO|NO CONTESTA|CELULAR|APAGADO|NO RESPONDE/.test(t)) return "telefono";
  if (/DINERO|PAGO|NO TIENE PLATA|SIN DINERO|RECURSOS/.test(t)) return "pago";
  if (/NO LE INTERESA|CANCELA|RECHAZ|NO ACEPTA|DEVUELVE/.test(t)) return "no_interesa";
  return "otra";
}

// La parte del mensaje que cambia según la novedad: qué pasó (sin culparla) y qué se le pide. Va en una sola línea
// (así cabe en el espacio {{3}} de la plantilla de Meta).
export function explicacionNovedad(n: Pick<Novedad, "novedad" | "estado" | "transportadora">): string {
  const empresa = n.transportadora ? capitalizar(n.transportadora) : "la transportadora";
  switch (tipoNovedad(n)) {
    case "no_estaba":
      return "Hubo un intento de entrega, pero al parecer no había nadie en casa. ¿A qué hora te queda mejor recibirlo, o hay alguien que lo pueda recibir por ti?";
    case "direccion":
      return "El repartidor no logró ubicar la dirección de entrega. ¿Nos la envías completa, con el barrio y alguna referencia? Si prefieres, también te lo pueden llevar a otro lugar.";
    case "oficina":
      return `Quedó disponible en la oficina de ${empresa} para que lo reclames. ¿Te queda fácil pasar por él, o prefieres que intentemos entregarlo en otra dirección?`;
    case "reprogramada":
      return "La transportadora nos indicó que la entrega quedó para otro día. ¿Nos confirmas que te queda bien, o si prefieres que te lo lleven a otra dirección?";
    case "telefono":
      return "El repartidor intentó comunicarse contigo para entregártelo, pero no logró contactarte. ¿Nos confirmas un número donde te puedan llamar y la dirección de entrega?";
    case "pago":
      return "Al parecer no fue posible completar el pago en el momento de la entrega. ¿Te queda bien que lo intenten de nuevo? Cuéntanos qué día te sirve.";
    case "no_interesa":
      return "La transportadora nos reportó que no fue posible hacer la entrega. ¿Todo bien con tu pedido? Si pasó algo, cuéntanos y lo solucionamos.";
    default:
      return "La transportadora reportó una novedad con la entrega. ¿Nos confirmas tu dirección o un lugar alterno donde te lo puedan entregar?";
  }
}

export function mensajeNovedad(n: Novedad): string {
  const hola = n.primerNombre ? `Hola, ${n.primerNombre}, ¿cómo estás?` : "Hola, ¿cómo estás?";
  const paquete = n.producto ? `tu pedido de ${n.producto}` : "tu pedido";
  return `${hola} Te cuento que ${paquete} ya está en tu ciudad 📦\n\n${explicacionNovedad(n)}`;
}

// Recordatorio si no responde: el pedido está a punto de devolverse (sin culparla).
export function mensajeRecordatorioNovedad(n: Pick<Novedad, "primerNombre" | "producto">): string {
  const hola = n.primerNombre ? `Hola, ${n.primerNombre}.` : "Hola.";
  const paquete = n.producto ? `Tu pedido de ${n.producto}` : "Tu pedido";
  return `${hola} ${paquete} está a punto de ser devuelto 📦\n\nPor favor respóndenos lo antes posible para que te lo puedan entregar 🚚`;
}

// Plantillas de Meta (para escribirle fuera de la ventana de 24 horas).
export const PLANTILLAS_NOVEDAD = {
  novedad_entrega: {
    categoria: "UTILITY",
    texto: "Hola, {{1}}, ¿cómo estás? Te cuento que tu pedido de {{2}} ya está en tu ciudad 📦\n\n{{3}}\n\nResponde este mensaje y te ayudamos a recibirlo lo más pronto posible 🚚",
    ejemplo: ["María", "Cubresofá Doble Faz", "Hubo un intento de entrega, pero al parecer no había nadie en casa. ¿A qué hora te queda mejor recibirlo?"],
  },
  novedad_recordatorio: {
    categoria: "UTILITY",
    texto: "Hola, {{1}}. Tu pedido de {{2}} está a punto de ser devuelto 📦\n\nPor favor respóndenos lo antes posible para que te lo puedan entregar 🚚",
    ejemplo: ["María", "Cubresofá Doble Faz"],
  },
} as const;

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
