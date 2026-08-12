import { Router } from 'express';
import { pool } from '../db/pool';
import { AppError, envolver } from '../utils/http';
import { firmarToken, necesitaAuth, necesitaRol, ROL_CLIENTE, verificarPassword } from '../services/auth.service';

const router = Router();

interface ClientePortal {
  id: number;
  nombre: string;
  telefono: string | null;
  pass_hash_portal: string | null;
}

router.post(
  '/login',
  envolver(async (req, res) => {
    const { usuario, password, cliente_id } = req.body as {
      usuario?: string;
      password?: string;
      cliente_id?: number;
    };
    if (!usuario || !password) throw new AppError(400, 'Usuario y contraseña son obligatorios');
    const telefono = String(usuario).replace(/\D/g, '');
    if (!telefono) throw new AppError(400, 'Escribe tu número de teléfono como usuario');

    const coincide = async (id: number) => {
      const { rows } = await pool.query(
        `SELECT id, nombre, telefono, pass_hash_portal
           FROM clientes
          WHERE id = $1 AND activo = TRUE
            AND telefono IS NOT NULL AND REGEXP_REPLACE(telefono, $3, '', 'g') = $2`,
        [id, telefono, '\\D']
      );
      const candidato = rows[0] as ClientePortal | undefined;
      if (!candidato?.pass_hash_portal) return null;
      if (!(await verificarPassword(password, candidato.pass_hash_portal))) return null;
      return candidato;
    };

    if (cliente_id) {
      const elegido = await coincide(Number(cliente_id));
      if (!elegido) throw new AppError(401, 'Usuario o contraseña incorrectos');
      const token = firmarToken({ rol: ROL_CLIENTE, id: elegido.id, usuario: telefono });
      res.json({ token, rol: ROL_CLIENTE, nombre: elegido.nombre });
      return;
    }

    const { rows } = await pool.query(
      `SELECT id, nombre, telefono, pass_hash_portal
         FROM clientes
        WHERE activo = TRUE AND telefono IS NOT NULL
          AND REGEXP_REPLACE(telefono, $2, '', 'g') = $1
        ORDER BY nombre ASC`,
      [telefono, '\\D']
    );
    const candidatos = rows as ClientePortal[];

    let coincidencia: ClientePortal | null = null;
    for (const candidato of candidatos) {
      if (
        candidato.pass_hash_portal &&
        (await verificarPassword(password, candidato.pass_hash_portal))
      ) {
        coincidencia = candidato;
        break;
      }
    }
    if (!coincidencia) throw new AppError(401, 'Usuario o contraseña incorrectos');

    if (candidatos.length > 1) {
      res.json({
        requiere_seleccion: true,
        clientes: candidatos.map((c) => ({ id: c.id, nombre: c.nombre })),
      });
      return;
    }

    const token = firmarToken({ rol: ROL_CLIENTE, id: coincidencia.id, usuario: telefono });
    res.json({ token, rol: ROL_CLIENTE, nombre: coincidencia.nombre });
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

