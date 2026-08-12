import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { pool } from '../db/pool';
import { AppError } from '../utils/http';

export const ROL_ADMIN = 'admin';
export const ROL_CLIENTE = 'cliente';

const SECRETO = process.env.AUTH_SECRET || 'beka-clave-local-desarrollo-2026';

export interface Claim {
  rol: string;
  id: number;
  usuario: string;
}

export function firmarToken(claim: Claim): string {
  return jwt.sign(claim, SECRETO, { expiresIn: '12h' });
}

export function leerToken(req: Request): Claim | null {
  const encabezado = req.headers.authorization;
  const crudo =
    encabezado && encabezado.startsWith('Bearer ')
      ? encabezado.slice(7)
      : typeof req.query.token === 'string'
        ? req.query.token
        : null;
  if (!crudo) return null;
  try {
    return jwt.verify(crudo, SECRETO) as Claim;
  } catch {
    return null;
  }
}

export function hashPassword(plana: string): Promise<string> {
  return bcrypt.hash(plana, 10);
}

export function verificarPassword(plana: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plana, hash);
}

export function necesitaAuth(req: Request, res: Response, next: NextFunction): void {
  const claim = leerToken(req);
  if (!claim) throw new AppError(401, 'No has iniciado sesión');
  (res.locals as { claim: Claim }).claim = claim;
  next();
}

export function necesitaRol(rol: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const claim = (res.locals as { claim?: Claim }).claim;
    if (!claim || claim.rol !== rol) {
      throw new AppError(403, 'No tienes permiso para esta acción');
    }
    next();
  };
}

export async function asegurarUsuarioAdmin(): Promise<void> {
  const { rows } = await pool.query('SELECT id FROM usuarios WHERE usuario = $1', ['admin']);
  if (rows.length) return;
  const hash = await hashPassword('Admin123!');
  await pool.query(
    'INSERT INTO usuarios (usuario, password_hash, nombre) VALUES ($1, $2, $3)',
    ['admin', hash, 'Administrador']
  );
  console.log('[auth] Usuario admin creado. Usuario: admin | Contraseña inicial: Admin123!');
}