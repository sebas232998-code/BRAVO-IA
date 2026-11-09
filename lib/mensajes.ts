import type { Pedido } from "./tipos";

// $159.800 (pesos colombianos, sin decimales)
export function formatoPesos(valor: number): string {
  return "$" + Math.round(valor).toLocaleString("es-CO").replace(/,/g, ".");
}

const CIERRE_CONFIRMACION =
  "Si todo está correcto, envía la palabra *CONFIRMAR* y te lo despachamos lo más pronto posible 🚚";

// Mensaje de confirmación: cada dato en su propio renglón corto.
export function mensajeConfirmacion(p: Pedido): string {
  const lineas: string[] = [];
  for (const item of p.items) {
    lineas.push(`Producto: ${item.producto}`);
    if (item.variante) lineas.push(`Variante: ${item.variante}`);
    lineas.push(`Cantidad: ${item.cantidad}`);
  }
  lineas.push(`Total a pagar: ${formatoPesos(p.total)}`);
  if (p.ciudad) lineas.push(`Ciudad: ${p.ciudad}`);
  if (p.direccion) lineas.push(`Dirección: ${p.direccion}`);
  return `${lineas.join("\n")}\n\n${CIERRE_CONFIRMACION}`;
}

// Respuesta cuando la clienta escribe CONFIRMAR (se envía unos 5 segundos después).
export const MENSAJE_CONFIRMADO =
  "✅ ¡Listo! Tu pedido ha sido confirmado.\n\nTu pedido está siendo procesado y será despachado lo más pronto posible 🚚";
