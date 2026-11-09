import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Pedido } from "./tipos";

let cliente: SupabaseClient | null = null;

export function baseConfigurada(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function db(): SupabaseClient {
  if (!cliente) {
    if (!baseConfigurada()) throw new Error("Falta configurar SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY");
    cliente = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    });
  }
  return cliente;
}

// Guarda el pedido. Si Shopify reenvía el mismo webhook, no se duplica.
// Devuelve true si el pedido es nuevo.
export async function guardarPedido(p: Pedido): Promise<boolean> {
  const { data, error } = await db()
    .from("pedidos")
    .upsert(p, { onConflict: "tienda_dominio,shopify_order_id", ignoreDuplicates: true })
    .select("id");
  if (error) throw error;
  const nuevo = data?.[0];
  if (nuevo) {
    await db().from("eventos_pedido").insert({
      pedido_id: nuevo.id,
      tipo: "recibido_shopify",
      detalle: p.telefono ? null : { problema: "telefono_invalido", original: p.telefono_original },
    });
  }
  return Boolean(nuevo);
}

export async function listarPedidos(limite = 100): Promise<Pedido[]> {
  const { data, error } = await db()
    .from("pedidos")
    .select("*")
    .order("creado_en", { ascending: false })
    .limit(limite);
  if (error) throw error;
  return data as Pedido[];
}
