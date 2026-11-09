import type { Pedido } from "./tipos";

// API de Integraciones de Dropi.
// Autenticación: encabezado "dropi-integration-key" con el token de la integración
// (Dropi → Integraciones → Bravo IA). El token va en la variable DROPI_INTEGRATION_KEY.

export interface VinculoDropi {
  shopify_variant_id: number;
  dropi_product_id: number;
  dropi_variation_id: number | null;
}

export interface OrdenDropi {
  calculate_costs_and_shiping: boolean;
  state: string;
  city: string;
  name: string;
  surname: string;
  dir: string;
  notes: string;
  payment_method_id: number;
  phone: string;
  rate_type: "CON RECAUDO";
  type: "FINAL_ORDER";
  total_order: number;
  shop_order_id: string;
  shop_order_number: string;
  products: { id: number; price: number; quantity: number; variation_id?: number }[];
}

// Mayúsculas y sin tildes, como Dropi guarda ciudades y departamentos (MEDELLIN, BOGOTA).
// La Ñ se respeta (NARIÑO).
export function textoDropi(s: string): string {
  return s
    .toUpperCase()
    .replace(/Ñ/g, "\u0000")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\u0000/g, "Ñ")
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Shopify escribe los departamentos distinto a Dropi en algunos casos.
const DEPARTAMENTOS_ESPECIALES: [RegExp, string][] = [
  [/BOGOTA/, "CUNDINAMARCA"],
  [/^VALLE/, "VALLE"],
  [/SAN ANDRES/, "ARCHIPIELAGO DE SAN ANDRES"],
  [/^GUAJIRA$/, "LA GUAJIRA"],
  [/NARINO/, "NARIÑO"],
];

export function departamentoDropi(departamento: string | null, ciudad: string | null): string | null {
  const d = textoDropi(departamento ?? "");
  if (!d) return /BOGOTA/.test(textoDropi(ciudad ?? "")) ? "CUNDINAMARCA" : null;
  for (const [patron, nombre] of DEPARTAMENTOS_ESPECIALES) if (patron.test(d)) return nombre;
  return d;
}

export function ciudadDropi(ciudad: string | null): string | null {
  const c = textoDropi(ciudad ?? "");
  if (!c) return null;
  if (/^BOGOTA\b/.test(c)) return "BOGOTA";
  return c;
}

export class FaltaDato extends Error {}

// Arma el pedido tal como lo pide Dropi. Lanza FaltaDato si algo impide subirlo.
export function armarOrdenDropi(p: Pedido, vinculos: VinculoDropi[]): OrdenDropi {
  if (!p.telefono) throw new FaltaDato("El número de la clienta no es válido.");
  const state = departamentoDropi(p.departamento, p.ciudad);
  const city = ciudadDropi(p.ciudad);
  if (!city) throw new FaltaDato("Falta la ciudad.");
  if (!state) throw new FaltaDato("Falta el departamento.");
  if (!p.direccion) throw new FaltaDato("Falta la dirección.");

  const sinVincular = p.items.filter(
    (i) => !vinculos.some((v) => v.shopify_variant_id === i.shopify_variant_id),
  );
  if (sinVincular.length > 0) {
    throw new FaltaDato(`Falta escoger el producto de Dropi para: ${sinVincular.map((i) => i.producto).join(", ")}.`);
  }

  // El valor a recaudar es el total que pagó la clienta en Shopify (incluye el envío si se le cobró).
  // Lo que sobra sobre la suma de productos se le suma al primero, para que cuadre exacto.
  const productos = p.items.map((i) => {
    const v = vinculos.find((x) => x.shopify_variant_id === i.shopify_variant_id)!;
    return {
      id: Number(v.dropi_product_id),
      price: i.precio_unitario,
      quantity: i.cantidad,
      ...(v.dropi_variation_id ? { variation_id: Number(v.dropi_variation_id) } : {}),
    };
  });
  const suma = productos.reduce((s, x) => s + x.price * x.quantity, 0);
  const diferencia = Number(p.total) - suma;
  if (diferencia !== 0) productos[0].price = Math.round(productos[0].price + diferencia / productos[0].quantity);

  const [nombre, ...apellidos] = p.nombre_clienta.split(" ");
  return {
    calculate_costs_and_shiping: true,
    state,
    city,
    name: nombre,
    surname: apellidos.join(" ") || nombre,
    dir: p.direccion,
    notes: p.notas ?? "",
    payment_method_id: 1,
    phone: p.telefono.slice(2), // Dropi lo quiere sin el 57
    rate_type: "CON RECAUDO",
    type: "FINAL_ORDER",
    total_order: Math.round(Number(p.total)),
    shop_order_id: String(p.shopify_order_id),
    shop_order_number: p.numero,
    products: productos,
  };
}

export function dropiConfigurado(): boolean {
  return Boolean(process.env.DROPI_INTEGRATION_KEY);
}

export type ResultadoDropi = { ok: true; id: string } | { ok: false; mensaje: string; quizasCreado?: boolean };

// Crea el pedido en Dropi.
export async function crearOrdenDropi(orden: OrdenDropi): Promise<ResultadoDropi> {
  const base = (process.env.DROPI_API_URL ?? "https://api.dropi.co/integrations").replace(/\/$/, "");
  let res: Response;
  try {
    res = await fetch(`${base}/orders/myorders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "dropi-integration-key": process.env.DROPI_INTEGRATION_KEY ?? "",
      },
      body: JSON.stringify(orden),
      signal: AbortSignal.timeout(25000),
    });
  } catch {
    return {
      ok: false,
      quizasCreado: true,
      mensaje: "Dropi no respondió a tiempo. Antes de reintentar, revisa en Dropi si el pedido quedó creado.",
    };
  }

  const texto = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(texto);
  } catch {
    /* Dropi respondió algo que no es JSON */
  }

  const objeto = (json.objects ?? json.object ?? json.data) as Record<string, unknown> | undefined;
  const id = objeto?.id ?? objeto?.order_id;
  if (res.ok && json.isSuccess !== false && id) return { ok: true, id: String(id) };

  if (res.status === 401 || res.status === 403) {
    return { ok: false, mensaje: "Dropi no aceptó el token. Revisa DROPI_INTEGRATION_KEY en Vercel." };
  }
  const mensaje =
    (typeof json.message === "string" && json.message) ||
    (typeof json.error === "string" && json.error) ||
    texto.slice(0, 300) ||
    `Dropi respondió con error ${res.status}`;
  return { ok: false, mensaje };
}
