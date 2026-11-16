// Bandeja de errores: qué pedidos necesitan que el vendedor haga algo.
import type { VinculoDropi } from "./dropi";
import { problemaTelefono } from "./telefono";
import type { Pedido } from "./tipos";

const CERRADOS = new Set(["enviado_dropi", "entregado", "devuelto", "cancelado", "sin_respuesta", "archivado"]);

export function problemasDe(p: Pedido, vinculos: VinculoDropi[]): string[] {
  if (CERRADOS.has(p.estado) || p.dropi_order_id) return [];
  const lista: string[] = [];
  if (!p.telefono) lista.push(`Número: ${problemaTelefono(p.telefono_original)}`);
  if (p.error_whatsapp) lista.push("WhatsApp no le llegó");
  if (p.error_dropi) lista.push("Dropi lo rechazó");
  if (p.atencion_vendedor) lista.push("La IA te necesita");
  if (p.dropi_en_pausa && p.estado === "confirmado") lista.push("Escribió después de confirmar");
  const sinVincular = p.items.filter(
    (i) => i.shopify_variant_id && !vinculos.some((v) => v.shopify_variant_id === i.shopify_variant_id),
  );
  if (sinVincular.length) lista.push("Producto sin escoger en Dropi");
  if (!p.ciudad) lista.push("Falta la ciudad");
  if (!p.direccion) lista.push("Falta la dirección");
  return lista;
}
