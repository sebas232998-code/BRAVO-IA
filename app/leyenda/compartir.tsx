"use client";

import { useState } from "react";

// Compartir la imagen (en el celular abre Instagram, TikTok, WhatsApp...). Si no se puede, se descarga.
export function Compartir({ url }: { url: string }) {
  const [estado, setEstado] = useState<string | null>(null);
  async function compartir() {
    try {
      setEstado("Preparando la imagen…");
      const blob = await (await fetch(url)).blob();
      const archivo = new File([blob], "mi-leyenda-bravo-ia.png", { type: "image/png" });
      if (navigator.canShare?.({ files: [archivo] })) {
        await navigator.share({ files: [archivo], title: "Mi Leyenda en Bravo IA" });
        setEstado(null);
        return;
      }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "mi-leyenda-bravo-ia.png";
      a.click();
      setEstado("Imagen descargada.");
    } catch {
      setEstado(null);
    }
  }
  return (
    <>
      <button type="button" className="principal" onClick={compartir}>Compartir mi Leyenda 🔥</button>
      {estado && <p className="pedido-meta">{estado}</p>}
    </>
  );
}
