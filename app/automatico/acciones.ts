"use server";

import { redirect } from "next/navigation";
import { guardarInterruptores, tiendasConInterruptores } from "@/lib/db";

const numero = (f: FormData, k: string): number | null => {
  const n = Number(String(f.get(k) ?? "").replace(",", ".").trim());
  return Number.isFinite(n) && String(f.get(k) ?? "").trim() !== "" ? Math.round(n) : null;
};

export async function guardarAutomatico(f: FormData) {
  const dominio = String(f.get("tienda") ?? "").trim();
  const t = (await tiendasConInterruptores()).find((x) => x.dominio === dominio);
  if (!t) redirect(`/automatico?error=${encodeURIComponent("No encontré esa tienda.")}`);

  const autoConfirmacion = f.get("auto_confirmacion") === "on";
  const autoDropi = f.get("auto_dropi") === "on";
  const autoSeguimiento = f.get("auto_seguimiento") === "on";

  const horas = [1, 2, 3].map((n) => numero(f, `horas_${n}`));
  if (horas.some((h) => h === null || h < 1) || !(horas[0]! < horas[1]! && horas[1]! < horas[2]!)) {
    redirect(`/automatico?error=${encodeURIComponent("Las horas del seguimiento deben ir de menor a mayor, por ejemplo 2, 24 y 48.")}`);
  }
  const porcentaje = numero(f, "descuento_porcentaje");
  const horasDescuento = numero(f, "descuento_horas");
  if (porcentaje === null || porcentaje < 1 || porcentaje > 50) {
    redirect(`/automatico?error=${encodeURIComponent("El descuento debe estar entre 1 % y 50 %.")}`);
  }
  if (horasDescuento === null || horasDescuento < 1 || horasDescuento > 72) {
    redirect(`/automatico?error=${encodeURIComponent("La vigencia del descuento debe estar entre 1 y 72 horas.")}`);
  }

  const ahora = new Date().toISOString();
  await guardarInterruptores(dominio, {
    auto_confirmacion: autoConfirmacion,
    auto_dropi: autoDropi,
    auto_seguimiento: autoSeguimiento,
    ia_activa: f.get("ia_activa") === "on",
    auto_novedades: f.get("auto_novedades") === "on",
    seguimiento_horas: horas as number[],
    descuento_activo: f.get("descuento_activo") === "on",
    descuento_porcentaje: porcentaje,
    descuento_horas: horasDescuento,
    // Al prender algo, solo cuentan los pedidos desde ahora (los viejos no reciben mensajes de golpe).
    ...(autoConfirmacion && !t.auto_confirmacion ? { auto_desde: ahora } : {}),
    ...(autoSeguimiento && !t.auto_seguimiento ? { seguimiento_desde: ahora } : {}),
  });
  redirect(`/automatico?ok=${encodeURIComponent(`Listo, guardado para ${t.nombre}.`)}`);
}
