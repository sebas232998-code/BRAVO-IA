// Celulares de Colombia en el formato que usa WhatsApp: 57 + 10 dígitos (empieza por 3).

function soloCelular(d: string): string | null {
  if (d.startsWith("0057")) d = d.slice(4);
  else if (d.startsWith("057")) d = d.slice(3);
  if (d.length === 14 && d.startsWith("5757")) d = d.slice(4); // "+57 57 300…" (el 57 puesto dos veces)
  if (d.length === 12 && d.startsWith("57")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("03")) d = d.slice(1); // "0300…"
  if (d.length === 10 && d.startsWith("3")) return "57" + d;
  return null;
}

// Normaliza el celular. Devuelve null si no logra dejarlo válido; ese pedido va a la bandeja de errores.
export function normalizarTelefono(original: string | null | undefined): string | null {
  if (!original) return null;
  const directo = soloCelular(original.replace(/\D/g, ""));
  if (directo) return directo;
  // Escribieron dos números ("300 123 4567 / 310 987 6543") o texto de más: se toma el primero válido.
  for (const pedazo of original.split(/[\/,;|]| o | y |-{2,}/i)) {
    const n = soloCelular(pedazo.replace(/\D/g, ""));
    if (n) return n;
  }
  return null;
}

// El primer celular válido entre varios (dirección de envío, pedido, clienta, facturación).
export function primerTelefonoValido(candidatos: (string | null | undefined)[]): string | null {
  for (const c of candidatos) {
    const n = normalizarTelefono(c);
    if (n) return n;
  }
  return null;
}

// Explica en palabras sencillas por qué un número no sirvió.
export function problemaTelefono(original: string | null | undefined): string {
  const d = (original ?? "").replace(/\D/g, "").replace(/^(00)?57(?=\d{9,})/, "");
  if (!d) return "La clienta no escribió número.";
  if (d.startsWith("3") && d.length === 9) return "Le falta un dígito (tiene 9 y un celular tiene 10).";
  if (d.startsWith("3") && d.length === 11) return "Le sobra un dígito (tiene 11 y un celular tiene 10).";
  if (/^[1-8]/.test(d) && d.length >= 7 && d.length <= 10) return "Parece un teléfono fijo: WhatsApp necesita un celular.";
  return `No parece un celular de Colombia (${d.length} dígitos).`;
}
