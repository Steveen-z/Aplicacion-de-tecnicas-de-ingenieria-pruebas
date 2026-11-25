/**
 * Crea (o actualiza) el usuario administrador a partir de las variables
 * ADMIN_EMAIL, ADMIN_PASSWORD y ADMIN_NAME del .env.
 * Uso: npm run db:seed
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const correo = (process.env.ADMIN_EMAIL ?? '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? '';
  const nombre = process.env.ADMIN_NAME ?? 'Administrador InmobiSV';

  if (!correo || password.length < 10) {
    throw new Error('Define ADMIN_EMAIL y un ADMIN_PASSWORD de al menos 10 caracteres en el .env');
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await prisma.usuario.upsert({
    where: { correo },
    update: { rol: 'ADMIN', passwordHash, estadoCuenta: 'ACTIVA', nombreCompleto: nombre },
    create: {
      nombreCompleto: nombre,
      correo,
      passwordHash,
      rol: 'ADMIN',
      cliente: { create: {} },
    },
  });

  console.log(`Administrador listo: ${admin.correo} (id ${admin.id})`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
