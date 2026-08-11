import { Router } from 'express';
import { pool } from '../db/pool';
import { AppError, envolver } from '../utils/http';
import {
  firmarToken,
  hashPassword,
  necesitaAuth,
  necesitaRol,
  ROL_ADMIN,
  verificarPassword,
} from '../services/auth.service';

const router = Router();

router.post(
  '/login',
  envolver(async (req, res) => {
    const { usuario, password } = req.body as { usuario?: string; password?: string };
    if (!usuario || !password) throw new AppError(400, 'Usuario y contraseña son obligatorios');
    const { rows } = await pool.query(
      'SELECT id, usuario, password_hash, nombre, activo FROM usuarios WHERE usuario = $1',
      [String(usuario).trim().toLowerCase()]
    );
    const admin = rows[0] as { id: number; usuario: string; password_hash: string; nombre: string | null; activo: boolean } | undefined;
    if (!admin || !admin.activo || !(await verificarPassword(password, admin.password_hash))) {
      throw new AppError(401, 'Usuario o contraseña incorrectos');
    }
    const token = firmarToken({ rol: ROL_ADMIN, id: admin.id, usuario: admin.usuario });
    res.json({ token, rol: ROL_ADMIN, usuario: admin.usuario, nombre: admin.nombre });
  })
);

router.get(
  '/yo',
  necesitaAuth,
  envolver(async (_req, res) => {
    const claim = (res.locals as { claim: { id: number } }).claim;
    const { rows } = await pool.query('SELECT id, usuario, nombre FROM usuarios WHERE id = $1', [claim.id]);
    res.json(rows[0] ?? null);
  })
);

router.put(
  '/cambiar-pass',
  necesitaAuth,
  necesitaRol(ROL_ADMIN),
  envolver(async (req, res) => {
    const { passwordActual, passwordNueva } = req.body as { passwordActual?: string; passwordNueva?: string };
    if (!passwordActual || !passwordNueva) throw new AppError(400, 'Faltan contraseñas');
    if (String(passwordNueva).length < 8) throw new AppError(400, 'La contraseña debe tener al menos 8 caracteres');
    const claim = (res.locals as { claim: { id: number } }).claim;
    const { rows } = await pool.query('SELECT password_hash FROM usuarios WHERE id = $1', [claim.id]);
    const admin = rows[0] as { password_hash: string } | undefined;
    if (!admin || !(await verificarPassword(passwordActual, admin.password_hash))) {
      throw new AppError(401, 'La contraseña actual no es correcta');
    }
    const hash = await hashPassword(String(passwordNueva));
    await pool.query('UPDATE usuarios SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hash, claim.id]);
    res.json({ ok: true });
  })
);

export default router;

