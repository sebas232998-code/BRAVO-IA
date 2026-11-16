// MAYÚSCULAS y sin tildes, respetando la Ñ (NARIÑO).
export function mayusSinTildes(s: string): string {
  return s.toUpperCase().replace(/Ñ/g, "\u0000").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\u0000/g, "Ñ");
}

// Como Dropi guarda ciudades y departamentos (MEDELLIN, BOGOTA): sin tildes, sin puntos ni comas.
export function textoDropi(s: string): string {
  return mayusSinTildes(s).replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();
}
