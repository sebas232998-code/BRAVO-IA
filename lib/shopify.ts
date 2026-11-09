import { createHmac, timingSafeEqual } from "node:crypto";
import { normalizarTelefono } from "./telefono";
import type { Pedido } from "./tipos";

// Shopify firma cada webhook con la clave que aparece en
// Configuración → Notificaciones → Webhooks. Se aceptan varias (una por tienda),
// separadas por coma en la variable SHOPIFY_WEBHOOK_SECRETS.
export function firmaValida(cuerpo: string, firma: string | null, claves: string[]): boolean {
  if (!firma) return false;
  const recibida = Buffer.from(firma, "base64");
  return claves.some((clave) => {
    const esperada = createHmac("sha256", clave).update(cuerpo, "utf8").digest();
    return esperada.length === recibida.length && timingSafeEqual(esperada, recibida);
  });
}

interface DireccionShopify {
  first_name?: string | null;
  last_name?: string | null;
  name?: string | null;
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  province?: string | null;
  phone?: string | null;
}

// Forma del pedido que envía el webhook "orders/create" (solo los campos que usamos).
export interface PedidoShopify {
  id: number;
  name: string;
  created_at: string;
  total_price: string;
  currency: string;
  phone?: string | null;
  note?: string | null;
  customer?: { first_name?: string | null; last_name?: string | null; phone?: string | null } | null;
  shipping_address?: DireccionShopify | null;
  billing_address?: DireccionShopify | null;
  line_items: {
    product_id: number | null;
    variant_id: number | null;
    title: string;
    variant_title: string | null;
    quantity: number;
    price: string;
  }[];
}

const limpio = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

export function convertirPedido(o: PedidoShopify, tienda: string): Pedido {
  const dir = o.shipping_address ?? o.billing_address ?? {};
  const nombre =
    limpio(dir.name) ||
    limpio(`${dir.first_name ?? ""} ${dir.last_name ?? ""}`) ||
    limpio(`${o.customer?.first_name ?? ""} ${o.customer?.last_name ?? ""}`);
  const telefonoOriginal = limpio(dir.phone) || limpio(o.phone) || limpio(o.customer?.phone) || null;
  const direccion = [limpio(dir.address1), limpio(dir.address2)].filter(Boolean).join(", ");

  return {
    tienda_dominio: tienda,
    shopify_order_id: o.id,
    numero: o.name,
    nombre_clienta: nombre || "Sin nombre",
    telefono: normalizarTelefono(telefonoOriginal),
    telefono_original: telefonoOriginal,
    departamento: limpio(dir.province) || null,
    ciudad: limpio(dir.city) || null,
    direccion: direccion || null,
    notas: limpio(o.note) || null,
    total: Number(o.total_price),
    moneda: o.currency,
    estado: "por_confirmar",
    creado_en: o.created_at,
    items: o.line_items.map((li) => ({
      shopify_product_id: li.product_id,
      shopify_variant_id: li.variant_id,
      producto: limpio(li.title),
      variante: limpio(li.variant_title) || null,
      cantidad: li.quantity,
      precio_unitario: Number(li.price),
    })),
  };
}
