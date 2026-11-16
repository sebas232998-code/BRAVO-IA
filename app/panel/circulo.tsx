import { colorTasa } from "@/lib/tasas";

// Círculo de porcentaje con color de semáforo y la rayita del punto de equilibrio.
// "invertida": para tasas donde menos es mejor (novedad), el color se calcula al revés.
export function CirculoTasa({ tasa, minimo = null, leyenda = false, tamano = 120, invertida = false }: {
  tasa: number | null;
  minimo?: number | null;
  leyenda?: boolean;
  tamano?: number;
  invertida?: boolean;
}) {
  const r = 50;
  const largo = 2 * Math.PI * r;
  const color = tasa === null ? "var(--linea)" : colorTasa(invertida ? 100 - tasa : tasa, minimo);
  const angulo = minimo === null ? null : (minimo / 100) * 360 - 90;
  const rad = angulo === null ? 0 : (angulo * Math.PI) / 180;
  return (
    <svg viewBox="0 0 120 120" width={tamano} height={tamano} className="circulo" role="img" aria-label={tasa === null ? "Sin datos" : `${tasa} %`}
      style={leyenda ? { filter: `drop-shadow(0 0 8px ${color})` } : undefined}>
      <circle cx="60" cy="60" r={r} fill="none" stroke="var(--linea)" strokeWidth="11" />
      {tasa !== null && (
        <circle cx="60" cy="60" r={r} fill="none" stroke={color} strokeWidth="11" strokeLinecap="round"
          strokeDasharray={`${(largo * tasa) / 100} ${largo}`} transform="rotate(-90 60 60)" />
      )}
      {angulo !== null && (
        <line x1={60 + 41 * Math.cos(rad)} y1={60 + 41 * Math.sin(rad)} x2={60 + 59 * Math.cos(rad)} y2={60 + 59 * Math.sin(rad)}
          stroke="var(--texto)" strokeWidth="3" strokeLinecap="round" />
      )}
      <text x="60" y="67" textAnchor="middle" fontSize="22" fontWeight="700" fill="var(--texto)">
        {tasa === null ? "—" : `${tasa}%`}
      </text>
    </svg>
  );
}
