import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PasswordHasher } from '../domain/ports';

const COSTO = 12;

@Injectable()
export class BcryptPasswordHasher implements PasswordHasher {
  hash(plano: string): Promise<string> {
    return bcrypt.hash(plano, COSTO);
  }

  comparar(plano: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plano, hash);
  }
}
