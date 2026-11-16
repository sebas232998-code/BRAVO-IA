import { NextResponse } from "next/server";
import { firmaValida, convertirPedido, type PedidoShopify } from "@/lib/shopify";
import { guardarPedido, guardarVariantes } from "@/lib/db";
import { variantesDePedido, variantesDeProducto, type ProductoShopify } from "@/lib/catalogo";
import { ciudadAprendida } from "@/lib/flujo";

// Shopify llama aquí cada vez que entra un pedido (webhook "Creación de pedido")
// y cada vez que se crea o edita un producto ("Creación de producto" / "Actualización de producto").
export async function POST(req: Request) {
  const cuerpo = await req.text();
  const claves = (process.env.SHOPIFY_WEBHOOK_SECRETS ?? "").split(",").map((c) => c.trim()).filter(Boolean);

  if (!firmaValida(cuerpo, req.headers.get("x-shopify-hmac-sha256"), claves)) {
    return NextResponse.json({ error: "firma inválida" }, { status: 401 });
  }

  const tema = req.headers.get("x-shopify-topic");
  const tienda = req.headers.get("x-shopify-shop-domain") ?? "desconocida";

  // Productos nuevos o editados: se guardan sus variantes y precios (para que la IA sepa qué existe).
  if (tema === "products/create" || tema === "products/update") {
    const variantes = variantesDeProducto(JSON.parse(cuerpo) as ProductoShopify, tienda);
    await guardarVariantes(variantes);
    return NextResponse.json({ ok: true, variantes: variantes.length });
  }
  if (tema !== "orders/create") return NextResponse.json({ ignorado: tema });

  const pedido = convertirPedido(JSON.parse(cuerpo) as PedidoShopify, tienda);
  // Ciudad mal escrita que el vendedor ya corrigió antes: se arregla de una vez (también en el mensaje a la clienta).
  const corregida = await ciudadAprendida(pedido);
  if (corregida) Object.assign(pedido, corregida);
  const nuevo = await guardarPedido(pedido);
  await guardarVariantes(variantesDePedido(pedido));

  // Shopify solo necesita un 200 rápido; si no lo recibe, reintenta.
  return NextResponse.json({ ok: true, nuevo });
}
