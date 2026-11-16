import { NextResponse } from "next/server";
import { firmaValida, convertirPedido, type PedidoShopify } from "@/lib/shopify";
import { guardarPedido } from "@/lib/db";
import { ciudadAprendida } from "@/lib/flujo";

// Shopify llama aquí cada vez que entra un pedido (webhook "Creación de pedido").
export async function POST(req: Request) {
  const cuerpo = await req.text();
  const claves = (process.env.SHOPIFY_WEBHOOK_SECRETS ?? "").split(",").map((c) => c.trim()).filter(Boolean);

  if (!firmaValida(cuerpo, req.headers.get("x-shopify-hmac-sha256"), claves)) {
    return NextResponse.json({ error: "firma inválida" }, { status: 401 });
  }

  const tema = req.headers.get("x-shopify-topic");
  if (tema !== "orders/create") return NextResponse.json({ ignorado: tema });

  const tienda = req.headers.get("x-shopify-shop-domain") ?? "desconocida";
  const pedido = convertirPedido(JSON.parse(cuerpo) as PedidoShopify, tienda);
  // Ciudad mal escrita que el vendedor ya corrigió antes: se arregla de una vez (también en el mensaje a la clienta).
  const corregida = await ciudadAprendida(pedido);
  if (corregida) Object.assign(pedido, corregida);
  const nuevo = await guardarPedido(pedido);

  // Shopify solo necesita un 200 rápido; si no lo recibe, reintenta.
  return NextResponse.json({ ok: true, nuevo });
}
