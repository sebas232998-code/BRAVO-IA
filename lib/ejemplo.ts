import type { Pedido } from "./tipos";

// Pedidos de ejemplo para ver la app antes de conectar la base de datos.
export const PEDIDOS_EJEMPLO: Pedido[] = [
  {
    tienda_dominio: "petion.myshopify.com",
    shopify_order_id: 1,
    numero: "#1041",
    nombre_clienta: "Laura Gómez",
    telefono: "573001234567",
    telefono_original: "300 123 4567",
    departamento: "Valle del Cauca",
    ciudad: "Cali",
    direccion: "Cra 45 # 12-30, Barrio El Lido",
    notas: null,
    total: 159800,
    moneda: "COP",
    estado: "por_confirmar",
    creado_en: "2026-11-09T14:20:00Z",
    items: [
      { shopify_product_id: 1, shopify_variant_id: 1, producto: "Forro de sofá", variante: "Gris con negro / 3 puestos", cantidad: 2, precio_unitario: 79900 },
    ],
  },
  {
    tienda_dominio: "rumbo.myshopify.com",
    shopify_order_id: 2,
    numero: "#2210",
    nombre_clienta: "Marta Ruiz",
    telefono: null,
    telefono_original: "31045",
    departamento: "Antioquia",
    ciudad: "Medellín",
    direccion: "Calle 10 # 43-21, apto 302",
    notas: null,
    total: 69900,
    moneda: "COP",
    estado: "error",
    creado_en: "2026-11-09T13:05:00Z",
    items: [
      { shopify_product_id: 2, shopify_variant_id: 2, producto: "Dispensador de viaje 4 en 1", variante: null, cantidad: 1, precio_unitario: 69900 },
    ],
  },
];
