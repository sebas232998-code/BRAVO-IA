// Limpieza de ciudades antes de subir a Dropi (bandeja de errores: "Ciudad mal escrita").
// Todo en MAYÚSCULAS y sin tildes, como las guarda Dropi.

import { mayusSinTildes, textoDropi } from "./textos";

// Departamentos (y la forma corta con que la gente los escribe).
const DEPARTAMENTOS: Record<string, string[]> = {
  AMAZONAS: [], ANTIOQUIA: ["ANT"], ARAUCA: [], ATLANTICO: [], BOLIVAR: [], BOYACA: [], CALDAS: [], CAQUETA: [],
  CASANARE: [], CAUCA: [], CESAR: [], CHOCO: [], CORDOBA: [], CUNDINAMARCA: ["CUND"], GUAINIA: [], GUAVIARE: [],
  HUILA: [], "LA GUAJIRA": ["GUAJIRA"], MAGDALENA: [], META: [], "NARIÑO": [], "NORTE DE SANTANDER": [],
  PUTUMAYO: [], QUINDIO: [], RISARALDA: [], "SAN ANDRES": [], SANTANDER: [], SUCRE: [], TOLIMA: [],
  "VALLE DEL CAUCA": ["VALLE"], VAUPES: [], VICHADA: [],
};

// Municipios cuyo nombre termina igual que su departamento: no se recortan.
const NO_RECORTAR = new Set(["SAN JOSE DEL GUAVIARE", "PUERTO BOYACA", "EL CARMEN DE BOLIVAR", "PUERTO SANTANDER"]);

// Formas de hablar que no son el nombre oficial.
const APODOS: Record<string, string> = {
  MEDALLO: "MEDELLIN",
  BQUILLA: "BARRANQUILLA",
  "B QUILLA": "BARRANQUILLA",
  "B/QUILLA": "BARRANQUILLA",
  BMANGA: "BUCARAMANGA",
  "B MANGA": "BUCARAMANGA",
  "B/MANGA": "BUCARAMANGA",
  VILLAVO: "VILLAVICENCIO",
};

function formasDe(departamento: string): string[] {
  const d = textoDropi(departamento);
  for (const [nombre, cortos] of Object.entries(DEPARTAMENTOS)) {
    if (d === nombre || cortos.includes(d)) return [nombre, ...cortos];
  }
  return d ? [d] : [];
}

// "Cali, Valle del Cauca" → CALI · "Medellín - Antioquia" → MEDELLIN · "Medallo" → MEDELLIN
export function limpiarCiudad(ciudad: string | null, departamento: string | null): string | null {
  // 1. Lo que viene después de una coma o un guion, si es un departamento, sobra.
  const partes = mayusSinTildes(ciudad ?? "").split(/\s*-\s*|\s*,\s*/).map(textoDropi).filter(Boolean);
  if (partes.length === 0) return null;
  let c = partes.join(" ");
  const despues = partes.slice(1).join(" ");
  if (despues && Object.entries(DEPARTAMENTOS).some(([n, cortos]) => n === despues || cortos.includes(despues))) {
    c = partes[0];
  }

  // 2. "CALI VALLE": la ciudad termina con el nombre de su propio departamento.
  if (!NO_RECORTAR.has(c)) {
    for (const forma of formasDe(departamento ?? "")) {
      if (c.endsWith(` ${forma}`) && c.length > forma.length + 1) {
        c = c.slice(0, -forma.length - 1).trim();
        break;
      }
    }
  }

  // 3. Apodos.
  return APODOS[c] ?? c;
}

// ¿Dos nombres de ciudad son el mismo mal escrito? (para aprender solo correcciones de ortografía,
// no cambios de ciudad de verdad, por ejemplo "Cali" → "Palmira").
export function seParecen(a: string, b: string): boolean {
  const x = textoDropi(a);
  const y = textoDropi(b);
  if (!x || !y || x === y) return false;
  if (x.includes(y) || y.includes(x)) return true;
  return 1 - distancia(x, y) / Math.max(x.length, y.length) >= 0.5;
}

function distancia(a: string, b: string): number {
  const fila = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let anterior = fila[0];
    fila[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = fila[j];
      fila[j] = Math.min(fila[j] + 1, fila[j - 1] + 1, anterior + (a[i - 1] === b[j - 1] ? 0 : 1));
      anterior = tmp;
    }
  }
  return fila[b.length];
}
