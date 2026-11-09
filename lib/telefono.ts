// Normaliza celulares de Colombia al formato que usa WhatsApp: 57 + 10 dígitos (empieza por 3).
// Devuelve null si no logra dejarlo válido; ese pedido va a la bandeja de errores.
export function normalizarTelefono(original: string | null | undefined): string | null {
  if (!original) return null;
  let d = original.replace(/\D/g, "");
  if (d.startsWith("0057")) d = d.slice(4);
  else if (d.startsWith("057")) d = d.slice(3);
  if (d.length === 12 && d.startsWith("57")) d = d.slice(2);
  if (d.length === 10 && d.startsWith("3")) return "57" + d;
  return null;
}
