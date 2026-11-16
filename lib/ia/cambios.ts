// Cambios que la IA puede hacerle a un pedido antes de que llegue a Dropi.
// Todo aquí es sin base de datos ni IA, para poder probarlo: la IA solo escoge, la app valida y calcula.

import type { Variante } from "../catalogo";
import { formatoPesos } from "../mensajes";
import { normalizarTelefono } from "../telefono";
import type { ItemPedido, Pedido } from "../tipos";

export type ResultadoCambio = { ok: true; pedido: Pedido; resumen: string } | { ok: false; error: string };

const MAX_UNIDADES = 20;

// Cambia la variante y/o la cantidad de una línea del pedido.
// - Solo variantes del mismo producto que existan en el catálogo, con su precio de Shopify.
// - El total sube o baja en la diferencia (así se respeta el envío o el descuento que ya tenía).
export function cambiarProducto(
  p: Pedido,
  catalogo: Variante[],
  linea: number,
  varianteId: string | number | null,
  cantidad: number | null,
): ResultadoCambio {
  const i = linea - 1;
  const actual = p.items[i];
  if (!actual) return { ok: false, error: `El pedido no tiene línea ${linea}. Tiene ${p.items.length}.` };
  if (varianteId === null && cantidad === null) return { ok: false, error: "No se pidió ningún cambio." };

  let nueva: ItemPedido = { ...actual };
  if (varianteId !== null && String(varianteId) !== String(actual.shopify_variant_id)) {
    const v = catalogo.find(
      (x) => String(x.shopify_variant_id) === String(varianteId) && x.shopify_product_id === actual.shopify_product_id,
    );
    if (!v) return { ok: false, error: "Esa variante no existe para este producto. Usa solo los IDs del catálogo." };
    if (!v.disponible) return { ok: false, error: "Esa variante no está disponible. Escala al vendedor." };
    nueva = { ...nueva, shopify_variant_id: v.shopify_variant_id, variante: v.variante, precio_unitario: v.precio };
  }
  if (cantidad !== null) {
    if (!Number.isInteger(cantidad) || cantidad < 1) return { ok: false, error: "La cantidad debe ser 1 o más." };
    if (cantidad > MAX_UNIDADES) return { ok: false, error: `Más de ${MAX_UNIDADES} unidades: escala al vendedor.` };
    nueva = { ...nueva, cantidad };
  }

  const items = p.items.map((x, j) => (j === i ? nueva : x));
  const suma = (lista: ItemPedido[]) => lista.reduce((s, x) => s + x.precio_unitario * x.cantidad, 0);
  const total = Math.round(Number(p.total) + suma(items) - suma(p.items));
  const pedido = { ...p, items, total };
  return { ok: true, pedido, resumen: estadoParaIA(pedido) };
}

export interface CambiosEnvio {
  nombre: string | null;
  telefono: string | null;
  departamento: string | null;
  ciudad: string | null;
  direccion: string | null;
}

export function cambiarEnvio(p: Pedido, c: CambiosEnvio): ResultadoCambio {
  const limpio = (s: string | null) => (s ?? "").replace(/\s+/g, " ").trim();
  const cambios: Partial<Pedido> = {};
  if (limpio(c.nombre)) cambios.nombre_clienta = limpio(c.nombre);
  if (limpio(c.departamento)) cambios.departamento = limpio(c.departamento);
  if (limpio(c.ciudad)) cambios.ciudad = limpio(c.ciudad);
  if (limpio(c.direccion)) cambios.direccion = limpio(c.direccion);
  if (limpio(c.telefono)) {
    const t = normalizarTelefono(c.telefono);
    if (!t) return { ok: false, error: "Ese celular no es válido (debe tener 10 dígitos y empezar por 3). Pídeselo de nuevo." };
    cambios.telefono = t;
    cambios.telefono_original = limpio(c.telefono);
  }
  if (Object.keys(cambios).length === 0) return { ok: false, error: "No se pidió ningún cambio." };
  const pedido = { ...p, ...cambios };
  return { ok: true, pedido, resumen: estadoParaIA(pedido) };
}

// Cómo ve la IA el pedido (corto y claro).
export function estadoParaIA(p: Pedido): string {
  const lineas = p.items.map(
    (x, i) =>
      `Línea ${i + 1}: ${x.cantidad} × ${x.producto}${x.variante ? ` · ${x.variante}` : ""} (variante ${x.shopify_variant_id}, ${formatoPesos(x.precio_unitario)} c/u)`,
  );
  return [
    ...lineas,
    `Total a pagar: ${formatoPesos(Number(p.total))}`,
    `Nombre: ${p.nombre_clienta}`,
    `Celular: ${p.telefono_original ?? "-"}`,
    `Departamento: ${p.departamento ?? "-"}`,
    `Ciudad: ${p.ciudad ?? "-"}`,
    `Dirección: ${p.direccion ?? "-"}`,
  ].join("\n");
}

// Si la IA no escribió nada (o se le olvidó el total), la app arma o completa la frase.
export function completarRespuesta(texto: string | null, antes: Pedido, despues: Pedido): string {
  const totalNuevo = formatoPesos(Number(despues.total));
  const cambioTotal = Math.round(Number(antes.total)) !== Math.round(Number(despues.total));
  let r = (texto ?? "").trim();
  if (!r) {
    const productos = despues.items
      .map((x) => `${x.cantidad} ${x.producto}${x.variante ? ` · ${x.variante}` : ""}`)
      .join(", ");
    const cambioProductos = JSON.stringify(antes.items) !== JSON.stringify(despues.items);
    r = cambioProductos ? `Listo, tu pedido quedó actualizado a ${productos} ✅` : "Listo, ya actualicé tus datos ✅";
  }
  if (cambioTotal && !r.includes(totalNuevo)) r += ` El total ahora es ${totalNuevo}`;
  return r;
}
