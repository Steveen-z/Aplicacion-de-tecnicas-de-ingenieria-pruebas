/**
 * Valida las variables de entorno al arrancar. Si falta algo crítico la
 * aplicación no inicia (falla rápido en lugar de fallar en producción).
 */
export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const errors: string[] = [];
  const read = (key: string): string | undefined => {
    const value = config[key];
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
  };

  if (!read('DATABASE_URL')) {
    errors.push('DATABASE_URL es obligatoria');
  }

  const secret = read('JWT_SECRET');
  if (!secret || secret.length < 32) {
    errors.push('JWT_SECRET es obligatoria y debe tener al menos 32 caracteres');
  }

  const ttl = Number(read('JWT_EXPIRES_IN') ?? '86400');
  if (!Number.isInteger(ttl) || ttl < 60) {
    errors.push('JWT_EXPIRES_IN debe ser un entero en segundos (mínimo 60)');
  }

  const port = Number(read('PORT') ?? '3000');
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    errors.push('PORT debe ser un número de puerto válido');
  }

  const sameSite = (read('COOKIE_SAMESITE') ?? 'lax').toLowerCase();
  if (!['lax', 'strict', 'none'].includes(sameSite)) {
    errors.push('COOKIE_SAMESITE debe ser lax, strict o none');
  }
  const cookieSecure = read('COOKIE_SECURE');
  if (cookieSecure !== undefined && !['true', 'false'].includes(cookieSecure)) {
    errors.push('COOKIE_SECURE debe ser true o false');
  }
  const segura = cookieSecure === 'true' || (cookieSecure === undefined && read('NODE_ENV') === 'production');
  if (sameSite === 'none' && !segura) {
    errors.push('COOKIE_SAMESITE=none exige COOKIE_SECURE=true (los navegadores rechazan la cookie)');
  }
  if ((read('CORS_ORIGINS') ?? '').split(',').some((o) => o.trim() === '*')) {
    errors.push("CORS_ORIGINS no puede ser '*' porque la API acepta credenciales (cookie de sesión)");
  }

  if (errors.length > 0) {
    throw new Error(`Configuración inválida:\n - ${errors.join('\n - ')}`);
  }
  return config;
}
