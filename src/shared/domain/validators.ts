/** Reglas de validación reutilizables (formatos de El Salvador). */

const DUI_REGEX = /^\d{8}-\d$/;
const TELEFONO_REGEX = /^\+?\d{8,15}$/;

export function normalizarCorreo(correo: string): string {
  return correo.trim().toLowerCase();
}

/** Quita espacios, guiones y paréntesis: "+503 7000-1234" -> "+50370001234". */
export function normalizarTelefono(telefono: string): string {
  return telefono.replace(/[\s\-().]/g, '');
}

export function esTelefonoValido(telefono: string | null | undefined): boolean {
  if (!telefono) return false;
  return TELEFONO_REGEX.test(normalizarTelefono(telefono));
}

/** Formato DUI salvadoreño: 8 dígitos, guion, 1 dígito verificador (00000000-0). */
export function esDuiValido(dui: string | null | undefined): boolean {
  if (!dui) return false;
  return DUI_REGEX.test(dui);
}

/**
 * Convierte un teléfono al formato que exige wa.me (solo dígitos con código de país).
 * Un número local de 8 dígitos se asume de El Salvador (+503). Devuelve null si no es utilizable.
 */
export function aNumeroWhatsApp(telefono: string | null | undefined): string | null {
  if (!telefono) return null;
  const digitos = telefono.replace(/\D/g, '');
  const completo = digitos.length === 8 ? `503${digitos}` : digitos;
  return completo.length >= 10 && completo.length <= 15 ? completo : null;
}
