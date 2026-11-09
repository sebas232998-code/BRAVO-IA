import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Pedido } from "./tipos";
import type { VinculoDropi } from "./dropi";

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

export async function registrarEvento(pedidoId: string, tipo: string, detalle: unknown = null) {
  await db().from("eventos_pedido").insert({ pedido_id: pedidoId, tipo, detalle });
}

export async function obtenerPedido(id: string): Promise<Pedido | null> {
  const { data, error } = await db().from("pedidos").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as Pedido | null;
}

export async function actualizarPedido(id: string, cambios: Partial<Pedido> & Record<string, unknown>) {
  const { error } = await db().from("pedidos").update(cambios).eq("id", id);
  if (error) throw error;
}

export async function borrarPedido(id: string) {
  const { error } = await db().from("pedidos").delete().eq("id", id);
  if (error) throw error;
}

// Marca el pedido como "subiendo" para que dos toques seguidos no lo suban dos veces.
// Devuelve false si ya se subió o si otra subida empezó hace menos de 2 minutos.
export async function apartarParaSubir(id: string): Promise<boolean> {
  const hace2min = new Date(Date.now() - 120_000).toISOString();
  const { data, error } = await db()
    .from("pedidos")
    .update({ subiendo_desde: new Date().toISOString() })
    .eq("id", id)
    .is("dropi_order_id", null)
    .or(`subiendo_desde.is.null,subiendo_desde.lt.${hace2min}`)
    .select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

export async function nombresTiendas(): Promise<Record<string, string>> {
  const { data, error } = await db().from("tiendas").select("dominio, nombre");
  if (error) return {}; // si aún no se corrió la migración 002, se muestra el dominio
  return Object.fromEntries((data ?? []).map((t) => [t.dominio, t.nombre]));
}

export async function vinculosDe(tienda: string): Promise<VinculoDropi[]> {
  const { data, error } = await db()
    .from("vinculos_dropi")
    .select("shopify_variant_id, dropi_product_id, dropi_variation_id")
    .eq("tienda_dominio", tienda);
  if (error) return [];
  return (data ?? []).map((v) => ({
    shopify_variant_id: Number(v.shopify_variant_id),
    dropi_product_id: Number(v.dropi_product_id),
    dropi_variation_id: v.dropi_variation_id === null ? null : Number(v.dropi_variation_id),
  }));
}

export async function guardarVinculo(tienda: string, v: VinculoDropi) {
  const { error } = await db()
    .from("vinculos_dropi")
    .upsert({ tienda_dominio: tienda, ...v }, { onConflict: "tienda_dominio,shopify_variant_id" });
  if (error) throw error;
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
