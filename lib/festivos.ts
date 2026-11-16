// Días hábiles con los festivos de Colombia (Fase 2: "consultar_dias_habiles").
// Incluye los que se corren al lunes (Ley Emiliani) y los que dependen de la Semana Santa.
// Fechas como "AAAA-MM-DD" en hora de Colombia.

const iso = (d: Date) => d.toISOString().slice(0, 10);
const dia = (anio: number, mes: number, d: number) => new Date(Date.UTC(anio, mes - 1, d));
const sumar = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

// Domingo de Pascua (algoritmo de Meeus/Jones/Butcher).
export function domingoDePascua(anio: number): Date {
  const a = anio % 19;
  const b = Math.floor(anio / 100);
  const c = anio % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const diaMes = ((h + l - 7 * m + 114) % 31) + 1;
  return dia(anio, mes, diaMes);
}

// Si no cae lunes, se pasa al lunes siguiente.
const alLunes = (d: Date) => sumar(d, (8 - d.getUTCDay()) % 7);

export function festivosDe(anio: number): Map<string, string> {
  const f = new Map<string, string>();
  const poner = (d: Date, nombre: string) => f.set(iso(d), nombre);
  const pascua = domingoDePascua(anio);

  poner(dia(anio, 1, 1), "Año Nuevo");
  poner(alLunes(dia(anio, 1, 6)), "Reyes Magos");
  poner(alLunes(dia(anio, 3, 19)), "San José");
  poner(sumar(pascua, -3), "Jueves Santo");
  poner(sumar(pascua, -2), "Viernes Santo");
  poner(dia(anio, 5, 1), "Día del Trabajo");
  poner(sumar(pascua, 43), "Ascensión del Señor");
  poner(sumar(pascua, 64), "Corpus Christi");
  poner(sumar(pascua, 71), "Sagrado Corazón");
  poner(alLunes(dia(anio, 6, 29)), "San Pedro y San Pablo");
  poner(dia(anio, 7, 20), "Día de la Independencia");
  poner(dia(anio, 8, 7), "Batalla de Boyacá");
  poner(alLunes(dia(anio, 8, 15)), "Asunción de la Virgen");
  poner(alLunes(dia(anio, 10, 12)), "Día de la Raza");
  poner(alLunes(dia(anio, 11, 1)), "Todos los Santos");
  poner(alLunes(dia(anio, 11, 11)), "Independencia de Cartagena");
  poner(dia(anio, 12, 8), "Inmaculada Concepción");
  poner(dia(anio, 12, 25), "Navidad");
  return f;
}

export function esFestivo(fecha: string): string | null {
  return festivosDe(Number(fecha.slice(0, 4))).get(fecha) ?? null;
}

// Lunes a viernes que no sea festivo.
export function esDiaHabil(fecha: string): boolean {
  const d = new Date(`${fecha}T12:00:00Z`).getUTCDay();
  return d !== 0 && d !== 6 && !esFestivo(fecha);
}

// Fecha después de N días hábiles (sin contar el día de inicio).
export function sumarDiasHabiles(desde: string, n: number): string {
  let d = new Date(`${desde}T12:00:00Z`);
  let faltan = n;
  while (faltan > 0) {
    d = sumar(d, 1);
    if (esDiaHabil(iso(d))) faltan--;
  }
  return iso(d);
}

// Hoy en Colombia ("AAAA-MM-DD").
export function hoyColombia(ahora = new Date()): string {
  return iso(new Date(ahora.getTime() - 5 * 3_600_000));
}
