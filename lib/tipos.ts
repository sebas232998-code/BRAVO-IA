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
  "archivado",
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
  archivado: "Atendido por fuera",
};

// Pestañas del panel de pedidos.
export const PESTANAS = {
  pendientes: { nombre: "Por atender", estados: ["por_confirmar", "confirmado", "error", "novedad"] },
  cerrados: { nombre: "Enviados y cerrados", estados: ["enviado_dropi", "entregado", "devuelto", "cancelado", "sin_respuesta"] },
  archivados: { nombre: "Archivados", estados: ["archivado"] },
} as const satisfies Record<string, { nombre: string; estados: readonly Estado[] }>;
export type Pestana = keyof typeof PESTANAS;

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
  confirmacion_enviada_en?: string | null;
  confirmado_en?: string | null; // arranca la espera de 5 minutos antes de subir a Dropi
  error_whatsapp?: string | null;
  dropi_en_pausa?: string | null; // motivo por el que la subida automática quedó detenida
  recibido_en?: string;
  // Seguimiento a quien no responde
  seguimientos_enviados?: number;
  ultimo_seguimiento_en?: string | null;
  ultima_respuesta_en?: string | null;
  descuento_valor?: number | null;
  descuento_vence_en?: string | null;
  descuento_aplicado?: boolean;
  descuento_vencido_avisado?: boolean;
  total_original?: number | null;
  // IA
  aviso_confirmado_en?: string | null;
  atencion_vendedor?: string | null;
}

// Interruptores del piloto automático de cada tienda.
export interface Tienda {
  dominio: string;
  nombre: string;
  auto_confirmacion: boolean;
  auto_dropi: boolean;
  auto_desde: string | null;
  auto_seguimiento: boolean;
  seguimiento_desde: string | null;
  seguimiento_horas: number[];
  descuento_activo: boolean;
  descuento_porcentaje: number;
  descuento_horas: number;
  ia_activa: boolean;
}
