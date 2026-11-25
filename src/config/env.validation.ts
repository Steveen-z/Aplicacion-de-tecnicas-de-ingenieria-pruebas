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

  if (errors.length > 0) {
    throw new Error(`Configuración inválida:\n - ${errors.join('\n - ')}`);
  }
  return config;
}
