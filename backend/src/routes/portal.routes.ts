import { Router } from 'express';
import { pool } from '../db/pool';
import { AppError, envolver } from '../utils/http';
import { firmarToken, necesitaAuth, necesitaRol, ROL_CLIENTE, verificarPassword } from '../services/auth.service';

const router = Router();

interface ClientePortal {
  id: number;
  nombre: string;
  telefono: string | null;
  usuario_portal: string | null;
  pass_hash_portal: string | null;
}

router.post(
  '/login',
  envolver(async (req, res) => {
    const { usuario, password } = req.body as { usuario?: string; password?: string };
    if (!usuario || !password) throw new AppError(400, 'Usuario y contraseña son obligatorios');
    const { rows } = await pool.query(
      `SELECT id, nombre, telefono, usuario_portal, pass_hash_portal
         FROM clientes
        WHERE usuario_portal = $1 AND activo = TRUE`,
      [String(usuario).trim().toLowerCase()]
    );
    const cliente = rows[0] as ClientePortal | undefined;
    if (!cliente || !cliente.pass_hash_portal || !(await verificarPassword(password, cliente.pass_hash_portal))) {
      throw new AppError(401, 'Usuario o contraseña incorrectos');
    }
    const token = firmarToken({ rol: ROL_CLIENTE, id: cliente.id, usuario: cliente.usuario_portal ?? 'cliente' });
    res.json({ token, rol: ROL_CLIENTE, nombre: cliente.nombre });
  })
);

router.get(
  '/mi-cuenta',
  necesitaAuth,
  necesitaRol(ROL_CLIENTE),
  envolver(async (_req, res) => {
    const claim = (res.locals as { claim: { id: number } }).claim;
    const { rows: clientes } = await pool.query(
      'SELECT id, nombre, telefono FROM clientes WHERE id = $1 AND activo = TRUE',
      [claim.id]
    );
    if (!clientes.length) throw new AppError(401, 'Cliente no encontrado');
    const cliente = clientes[0];

    const pendientes = await pool.query(
      `SELECT 'venta' AS tipo, v.id, v.total, v.saldo_pendiente, v.fecha, v.recargo_pct,
              COALESCE(json_agg(
                json_build_object('id', a.id, 'monto', a.monto, 'metodo', a.metodo, 'fecha', a.created_at)
                ORDER BY a.id
              ) FILTER (WHERE a.id IS NOT NULL), '[]') AS abonos
         FROM ventas v
         LEFT JOIN abonos a ON a.venta_id = v.id
        WHERE v.cliente_id = $1 AND v.saldo_pendiente > 0
        GROUP BY v.id
        UNION ALL
       SELECT 'viaje' AS tipo, j.id, j.total, j.saldo_pendiente, j.fecha_salida::TIMESTAMPTZ, NULL AS recargo_pct,
              COALESCE(json_agg(
                json_build_object('id', a.id, 'monto', a.monto, 'metodo', a.metodo, 'fecha', a.created_at)
                ORDER BY a.id
              ) FILTER (WHERE a.id IS NOT NULL), '[]') AS abonos
         FROM viajes j
         LEFT JOIN abonos a ON a.viaje_id = j.id
        WHERE j.cliente_id = $1 AND j.saldo_pendiente > 0
        GROUP BY j.id
        ORDER BY tipo, id`,
      [claim.id]
    );

    const cualquiera = pendientes.rows as { tipo: string; total: number; saldo_pendiente: number }[];
    const totalAdeudado = cualquiera.reduce((s, c) => s + Number(c.saldo_pendiente), 0);

    res.json({ cliente, cuentas: pendientes.rows, total_adeudado: Math.round(totalAdeudado * 100) / 100 });
  })
);

export default router;

