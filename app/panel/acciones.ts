"use server";

import { revalidatePath } from "next/cache";
import { guardarNumerosProducto, numerosProductos } from "@/lib/db";

const numero = (f: FormData, k: string): number | null => {
  const t = String(f.get(k) ?? "").replace(/[$.\s]/g, "").replace(",", ".").replace("%", "").trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export async function guardarNumeros(f: FormData) {
  const tienda = String(f.get("tienda") ?? "");
  const producto = Number(f.get("producto"));
  if (!tienda || !producto) return;
  const minima = numero(f, "tasa_minima");
  await guardarNumerosProducto({
    tienda_dominio: tienda,
    shopify_product_id: producto,
    costo: numero(f, "costo"),
    flete: numero(f, "flete"),
    cpa: numero(f, "cpa"),
    tasa_minima: minima === null ? null : Math.min(100, minima),
  });
  revalidatePath("/panel");
}

// Cambiar solo la tasa mínima desde la tarjeta de la tasa de entrega (vacío = la calcula la app).
export async function guardarTasaMinima(f: FormData) {
  const tienda = String(f.get("tienda") ?? "");
  const producto = Number(f.get("producto"));
  if (!tienda || !producto) return;
  const actual = (await numerosProductos()).find((x) => x.tienda_dominio === tienda && x.shopify_product_id === producto);
  const minima = numero(f, "tasa_minima");
  // Si viene el costo o el CPA desde la misma tarjeta, también se guardan (la app calcula el mínimo con ellos).
  await guardarNumerosProducto({
    tienda_dominio: tienda,
    shopify_product_id: producto,
    costo: f.has("costo") ? numero(f, "costo") : actual?.costo ?? null,
    flete: actual?.flete ?? null,
    cpa: f.has("cpa") ? numero(f, "cpa") : actual?.cpa ?? null,
    tasa_minima: minima === null ? null : Math.min(100, minima),
  });
  revalidatePath("/panel");
}
