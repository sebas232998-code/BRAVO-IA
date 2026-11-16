import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Pedido, Tienda } from "./tipos";
import type { VinculoDropi } from "./dropi";
import type { ConfigWhatsApp } from "./whatsapp";
import type { Variante } from "./catalogo";

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

// ---------- Piloto automático ----------

export async function tiendasConInterruptores(): Promise<Tienda[]> {
  const { data, error } = await db()
    .from("tiendas")
    .select("*")
    .order("nombre");
  if (error) return []; // si aún no se corrió la migración 004
  return (data ?? []) as Tienda[];
}

export async function guardarInterruptores(
  dominio: string,
  cambios: Partial<Omit<Tienda, "dominio" | "nombre">>,
) {
  const { error } = await db().from("tiendas").update(cambios).eq("dominio", dominio);
  if (error) throw error;
}

// Pedidos de la tienda que esperan su mensaje de confirmación.
export async function pedidosSinConfirmacion(tienda: string, desde: string | null): Promise<Pedido[]> {
  let q = db()
    .from("pedidos")
    .select("*")
    .eq("tienda_dominio", tienda)
    .eq("estado", "por_confirmar")
    .is("confirmacion_enviada_en", null)
    .not("telefono", "is", null)
    .order("recibido_en", { ascending: true })
    .limit(20);
  if (desde) q = q.gte("recibido_en", desde);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Pedido[];
}

// Pedidos confirmados de la tienda que todavía no están en Dropi.
export async function confirmadosSinSubir(tienda: string): Promise<Pedido[]> {
  const { data, error } = await db()
    .from("pedidos")
    .select("*")
    .eq("tienda_dominio", tienda)
    .eq("estado", "confirmado")
    .is("dropi_order_id", null)
    .is("dropi_en_pausa", null)
    .not("confirmado_en", "is", null)
    .order("confirmado_en", { ascending: true })
    .limit(20);
  if (error) throw error;
  return (data ?? []) as Pedido[];
}

// Marca que la confirmación ya salió, para que dos vueltas del reloj no la manden dos veces.
// Devuelve false si otra vuelta ya la apartó.
export async function apartarConfirmacion(id: string): Promise<boolean> {
  const { data, error } = await db()
    .from("pedidos")
    .update({ confirmacion_enviada_en: new Date().toISOString() })
    .eq("id", id)
    .is("confirmacion_enviada_en", null)
    .select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

export async function registrarLatido(nombre: string, detalle: unknown) {
  await db().from("latidos").upsert({ nombre, ultima_vez: new Date().toISOString(), detalle });
}

export async function ultimoLatido(nombre: string): Promise<{ ultima_vez: string; detalle: unknown } | null> {
  const { data, error } = await db().from("latidos").select("ultima_vez, detalle").eq("nombre", nombre).maybeSingle();
  if (error) return null;
  return data;
}

// Pedidos a los que se les mandó la confirmación y la clienta no ha escrito.
export async function pedidosEnSeguimiento(tienda: string): Promise<Pedido[]> {
  const { data, error } = await db()
    .from("pedidos")
    .select("*")
    .eq("tienda_dominio", tienda)
    .eq("estado", "por_confirmar")
    .not("confirmacion_enviada_en", "is", null)
    .is("ultima_respuesta_en", null)
    .lte("seguimientos_enviados", 3)
    .order("confirmacion_enviada_en", { ascending: true })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as Pedido[];
}

// Aparta el mensaje N del seguimiento para que dos vueltas del reloj no lo manden dos veces.
export async function apartarSeguimiento(id: string, numero: number, extra: Record<string, unknown> = {}): Promise<boolean> {
  const { data, error } = await db()
    .from("pedidos")
    .update({ seguimientos_enviados: numero, ultimo_seguimiento_en: new Date().toISOString(), ...extra })
    .eq("id", id)
    .eq("seguimientos_enviados", numero - 1)
    .eq("estado", "por_confirmar")
    .is("ultima_respuesta_en", null)
    .select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

// Guarda si el mensaje se entregó, se leyó o falló. Devuelve el pedido del mensaje (si tiene).
const ORDEN_ESTADO: Record<string, number> = { sent: 1, delivered: 2, read: 3, failed: 4 };
export async function marcarEstadoMensaje(waId: string, estado: string): Promise<string | null> {
  const { data, error } = await db().from("mensajes_whatsapp").select("pedido_id, estado").eq("wa_id", waId).maybeSingle();
  if (error || !data) return null; // mensaje que no es nuestro, o aún no se corrió la migración 007
  // Meta a veces manda los avisos en desorden: no se devuelve de "leído" a "entregado".
  if ((ORDEN_ESTADO[estado] ?? 0) > (ORDEN_ESTADO[data.estado ?? ""] ?? 0)) {
    await db().from("mensajes_whatsapp").update({ estado }).eq("wa_id", waId);
  }
  return data.pedido_id;
}

// ---------- Correcciones de ciudad aprendidas ----------

export async function correccionCiudad(original: string): Promise<{ ciudad: string; departamento: string | null } | null> {
  if (!original) return null;
  const { data, error } = await db()
    .from("correcciones_ciudad")
    .select("ciudad, departamento")
    .eq("original", original)
    .maybeSingle();
  if (error) return null; // si aún no se corrió la migración 007
  return data;
}

export async function guardarCorreccionCiudad(original: string, ciudad: string, departamento: string | null) {
  await db()
    .from("correcciones_ciudad")
    .upsert({ original, ciudad, departamento, actualizado_en: new Date().toISOString() });
}

// ---------- IA ----------

export async function tiendaDe(dominio: string): Promise<Tienda | null> {
  const { data, error } = await db().from("tiendas").select("*").eq("dominio", dominio).maybeSingle();
  if (error) return null;
  return data as Tienda | null;
}

export async function guardarVariantes(vs: Variante[]) {
  if (vs.length === 0) return;
  const { error } = await db()
    .from("catalogo_variantes")
    .upsert(vs.map((v) => ({ ...v, actualizado_en: new Date().toISOString() })), {
      onConflict: "tienda_dominio,shopify_variant_id",
    });
  if (error) console.log("[catalogo] no se pudo guardar", error.message);
}

export async function catalogoDe(tienda: string, productos: number[]): Promise<Variante[]> {
  if (productos.length === 0) return [];
  const { data, error } = await db()
    .from("catalogo_variantes")
    .select("*")
    .eq("tienda_dominio", tienda)
    .in("shopify_product_id", productos);
  if (error) return [];
  return (data ?? []).map((v) => ({
    ...v,
    shopify_product_id: Number(v.shopify_product_id),
    shopify_variant_id: Number(v.shopify_variant_id),
    precio: Number(v.precio),
  })) as Variante[];
}

export async function chatDe(pedidoId: string): Promise<{ wa_id: string | null; direccion: "entrante" | "saliente"; texto: string }[]> {
  const { data, error } = await db()
    .from("mensajes_whatsapp")
    .select("wa_id, direccion, texto")
    .eq("pedido_id", pedidoId)
    .order("creado_en", { ascending: true })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as { wa_id: string | null; direccion: "entrante" | "saliente"; texto: string }[];
}

// Toma el aviso de "pedido confirmado" pendiente para que salga una sola vez.
export async function apartarAvisoConfirmado(id: string, soloSiVencio: boolean): Promise<boolean> {
  let q = db().from("pedidos").update({ aviso_confirmado_en: null }).eq("id", id).not("aviso_confirmado_en", "is", null);
  if (soloSiVencio) q = q.lte("aviso_confirmado_en", new Date().toISOString());
  const { data, error } = await q.select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

export async function pedidosConAvisoVencido(): Promise<Pedido[]> {
  const { data, error } = await db()
    .from("pedidos")
    .select("*")
    .not("aviso_confirmado_en", "is", null)
    .lte("aviso_confirmado_en", new Date().toISOString())
    .limit(50);
  if (error) return []; // si aún no se corrió la migración 008
  return (data ?? []) as Pedido[];
}

export async function guardarCerebro(dominio: string, cerebro: string) {
  const { error } = await db().from("tiendas").update({ cerebro }).eq("dominio", dominio);
  if (error) throw error;
}

// Pedidos en los que la IA hizo algo (para contar las ventas rescatadas).
export async function pedidosConIA(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const { data, error } = await db()
    .from("eventos_pedido")
    .select("pedido_id")
    .in("tipo", ["ia_cambio"])
    .in("pedido_id", ids.slice(0, 500));
  if (error) return new Set();
  return new Set((data ?? []).map((e) => e.pedido_id as string));
}
