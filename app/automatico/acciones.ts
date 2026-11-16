"use server";

import { redirect } from "next/navigation";
import { guardarInterruptores, tiendasConInterruptores } from "@/lib/db";

export async function guardarAutomatico(f: FormData) {
  const dominio = String(f.get("tienda") ?? "").trim();
  const t = (await tiendasConInterruptores()).find((x) => x.dominio === dominio);
  if (!t) redirect(`/automatico?error=${encodeURIComponent("No encontré esa tienda.")}`);

  const autoConfirmacion = f.get("auto_confirmacion") === "on";
  const autoDropi = f.get("auto_dropi") === "on";
  await guardarInterruptores(dominio, {
    auto_confirmacion: autoConfirmacion,
    auto_dropi: autoDropi,
    // Al prender el envío automático, solo cuentan los pedidos que entren desde ahora.
    ...(autoConfirmacion && !t.auto_confirmacion ? { auto_desde: new Date().toISOString() } : {}),
  });
  redirect(`/automatico?ok=${encodeURIComponent(`Listo, guardado para ${t.nombre}.`)}`);
}
