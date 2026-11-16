"use server";

import { redirect } from "next/navigation";
import { guardarCerebro } from "@/lib/db";

export async function guardarCerebroTienda(f: FormData) {
  const dominio = String(f.get("tienda") ?? "").trim();
  const texto = String(f.get("cerebro") ?? "").replace(/\r\n/g, "\n").trim().slice(0, 8000);
  if (!dominio) return;
  await guardarCerebro(dominio, texto);
  redirect(`/cerebro?tienda=${encodeURIComponent(dominio)}&ok=${encodeURIComponent("Guardado. La IA ya responde con esto.")}`);
}
