// Catálogo de variantes de cada tienda (para que la IA sepa qué tamaños/colores existen y a qué precio).
// Se llena con los avisos de Shopify "Creación de producto" y "Actualización de producto",
// y también con lo que traen los pedidos.

import type { Pedido } from "./tipos";

export interface Variante {
  tienda_dominio: string;
  shopify_product_id: number;
  shopify_variant_id: number;
  producto: string;
  variante: string | null; // "Gris / 3 puestos"; null si el producto no tiene variantes
  precio: number;
  disponible: boolean;
}

// Forma del aviso de producto de Shopify (solo lo que usamos).
export interface ProductoShopify {
  id: number;
  title: string;
  status?: string; // active | draft | archived
  variants: {
    id: number;
    title: string;
    price: string;
    inventory_quantity?: number | null;
    inventory_policy?: string | null; // "continue" = se vende sin stock
  }[];
}

export function variantesDeProducto(p: ProductoShopify, tienda: string): Variante[] {
  return p.variants.map((v) => ({
    tienda_dominio: tienda,
    shopify_product_id: p.id,
    shopify_variant_id: v.id,
    producto: p.title.trim(),
    variante: v.title && v.title !== "Default Title" ? v.title.trim() : null,
    precio: Number(v.price),
    // En dropshipping casi siempre se vende sin stock en Shopify; solo se marca agotado si Shopify lo niega.
    disponible: p.status !== "archived" && p.status !== "draft",
  }));
}

// Lo que se sabe del pedido mismo (por si el producto todavía no llegó por aviso de Shopify).
export function variantesDePedido(p: Pedido): Variante[] {
  return p.items
    .filter((i) => i.shopify_product_id && i.shopify_variant_id)
    .map((i) => ({
      tienda_dominio: p.tienda_dominio,
      shopify_product_id: i.shopify_product_id!,
      shopify_variant_id: i.shopify_variant_id!,
      producto: i.producto,
      variante: i.variante,
      precio: i.precio_unitario,
      disponible: true,
    }));
}
