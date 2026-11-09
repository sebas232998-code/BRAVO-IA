import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Pedido } from "./tipos";
import type { VinculoDropi } from "./dropi";
import type { ConfigWhatsApp } from "./whatsapp";

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

// ---------- WhatsApp ----------

export async function listarTiendas(): Promise<{ dominio: string; nombre: string }[]> {
  const { data, error } = await db().from("tiendas").select("dominio, nombre").order("nombre");
  if (error) return [];
  return data ?? [];
}

export async function configsWhatsApp(): Promise<ConfigWhatsApp[]> {
  const { data, error } = await db().from("whatsapp_config").select("*");
  if (error) return []; // si aún no se corrió la migración 003
  return (data ?? []) as ConfigWhatsApp[];
}

export async function configWhatsAppDe(tienda: string): Promise<ConfigWhatsApp | null> {
  const { data, error } = await db().from("whatsapp_config").select("*").eq("tienda_dominio", tienda).maybeSingle();
  if (error) return null;
  return data as ConfigWhatsApp | null;
}

export async function configPorNumero(phoneNumberId: string): Promise<ConfigWhatsApp | null> {
  const { data, error } = await db()
    .from("whatsapp_config")
    .select("*")
    .eq("phone_number_id", phoneNumberId)
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return data as ConfigWhatsApp | null;
}

export async function existeVerifyToken(token: string): Promise<boolean> {
  const { data, error } = await db().from("whatsapp_config").select("tienda_dominio").eq("verify_token", token).limit(1);
  return !error && (data?.length ?? 0) > 0;
}

export async function guardarConfigWhatsApp(c: ConfigWhatsApp) {
  const { error } = await db()
    .from("whatsapp_config")
    .upsert({ ...c, actualizado_en: new Date().toISOString() }, { onConflict: "tienda_dominio" });
  if (error) throw error;
}

// El pedido más reciente de ese número que esté esperando respuesta.
export async function pedidoAbiertoDe(tienda: string, telefono: string): Promise<Pedido | null> {
  const { data, error } = await db()
    .from("pedidos")
    .select("*")
    .eq("tienda_dominio", tienda)
    .eq("telefono", telefono)
    .in("estado", ["por_confirmar", "confirmado", "sin_respuesta"])
    .order("creado_en", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as Pedido | null;
}

export interface MensajeGuardado {
  pedido_id: string | null;
  direccion: "entrante" | "saliente";
  texto: string;
  creado_en: string;
}

// Devuelve false si el mensaje ya estaba guardado (Meta a veces reenvía el mismo aviso).
export async function guardarMensaje(m: {
  wa_id: string | null;
  tienda_dominio: string | null;
  pedido_id: string | null;
  telefono: string;
  direccion: "entrante" | "saliente";
  texto: string;
  tipo: string;
  creado_en?: string;
}): Promise<boolean> {
  if (m.wa_id) {
    const { data, error } = await db()
      .from("mensajes_whatsapp")
      .upsert(m, { onConflict: "wa_id", ignoreDuplicates: true })
      .select("id");
    if (error) throw error;
    return (data?.length ?? 0) > 0;
  }
  const { error } = await db().from("mensajes_whatsapp").insert(m);
  if (error) throw error;
  return true;
}

export async function mensajesDePedidos(ids: string[]): Promise<Record<string, MensajeGuardado[]>> {
  if (ids.length === 0) return {};
  const { data, error } = await db()
    .from("mensajes_whatsapp")
    .select("pedido_id, direccion, texto, creado_en")
    .in("pedido_id", ids)
    .order("creado_en", { ascending: true });
  if (error) return {};
  const salida: Record<string, MensajeGuardado[]> = {};
  for (const m of (data ?? []) as MensajeGuardado[]) (salida[m.pedido_id!] ??= []).push(m);
  return salida;
}
