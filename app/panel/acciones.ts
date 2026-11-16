"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { guardarTasaMinimaTienda } from "@/lib/db";

// Tu tasa mínima de efectividad para no perder dinero, por tienda (vacío = quitarla).
export async function guardarTasaMinima(f: FormData) {
  const tienda = String(f.get("tienda") ?? "").trim().toUpperCase();
  if (!tienda) return;
  const t = String(f.get("tasa_minima") ?? "").replace(/[%\s]/g, "").replace(",", ".");
  const n = t === "" ? null : Number(t);
  await guardarTasaMinimaTienda(tienda, n === null || !isFinite(n) ? null : Math.min(100, Math.max(0, Math.round(n))));
  revalidatePath("/panel");
  redirect(String(f.get("volver") ?? "/panel"));
}
