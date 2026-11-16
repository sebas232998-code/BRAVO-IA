"use server";

import { revalidatePath } from "next/cache";
import { marcarNovedadEscrita } from "@/lib/db";

export async function marcarEscrita(f: FormData) {
  const id = Number(f.get("id"));
  if (!id) return;
  await marcarNovedadEscrita(id, f.get("escrita") === "1");
  revalidatePath("/novedades");
}
