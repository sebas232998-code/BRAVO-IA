"use client";

import { useEffect, useState } from "react";

// Celebración: máximo una vez por semana (se recuerda en este celular).
export function Confeti({ clave, mensaje }: { clave: string; mensaje: string }) {
  const [ver, setVer] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem("bravo-confeti") === clave) return;
      localStorage.setItem("bravo-confeti", clave);
    } catch {
      /* sin memoria del navegador: se muestra igual */
    }
    setVer(true);
    const t = setTimeout(() => setVer(false), 6000);
    return () => clearTimeout(t);
  }, [clave]);
  if (!ver) return null;
  const colores = ["#00E676", "#f0b90b", "#4cd18a", "#ffffff", "#ff8c42"];
  return (
    <div className="confeti" onClick={() => setVer(false)} role="status">
      {Array.from({ length: 60 }, (_, i) => (
        <span
          key={i}
          style={{
            left: `${(i * 37) % 100}%`,
            background: colores[i % colores.length],
            animationDelay: `${(i % 12) * 0.12}s`,
            animationDuration: `${2.4 + (i % 5) * 0.35}s`,
          }}
        />
      ))}
      <div className="confeti-mensaje">{mensaje}</div>
    </div>
  );
}
