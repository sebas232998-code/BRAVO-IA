"use server";

import { revalidatePath } from "next/cache";
import { guardarNumerosProducto } from "@/lib/db";

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
