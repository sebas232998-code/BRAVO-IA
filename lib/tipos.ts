// Estados del recorrido de cada pedido (ver especificacion.md → "Recorrido de cada pedido").
export const ESTADOS = [
  "por_confirmar",
  "confirmado",
  "enviado_dropi",
  "sin_respuesta",
  "error",
  "novedad",
  "entregado",
  "devuelto",
  "cancelado",
] as const;

export type Estado = (typeof ESTADOS)[number];

export const NOMBRE_ESTADO: Record<Estado, string> = {
  por_confirmar: "Por confirmar",
  confirmado: "Confirmado",
  enviado_dropi: "Enviado a Dropi",
  sin_respuesta: "Sin respuesta",
  error: "Con error",
  novedad: "En novedad",
  entregado: "Entregado",
  devuelto: "Devuelto",
  cancelado: "Cancelado",
};

export interface ItemPedido {
  shopify_product_id: number | null;
  shopify_variant_id: number | null;
  producto: string;
  variante: string | null;
  cantidad: number;
  precio_unitario: number;
}

// Pedido tal como lo guarda la app (tabla "pedidos").
export interface Pedido {
  id?: string;
  tienda_dominio: string;
  shopify_order_id: number;
  numero: string;
  nombre_clienta: string;
  telefono: string | null; // normalizado: 57XXXXXXXXXX
  telefono_original: string | null;
  departamento: string | null;
  ciudad: string | null;
  direccion: string | null;
  notas: string | null;
  total: number;
  moneda: string;
  estado: Estado;
  creado_en: string;
  items: ItemPedido[];
  dropi_order_id?: string | null;
  error_dropi?: string | null;
}
