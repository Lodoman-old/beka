import { pool } from '../db/pool';
import { AppError } from '../utils/http';
import { FilaPasajero, FilaViaje } from '../types';

export interface DatosViaje {
  cliente_id?: number | null;
  destino: string;
  fecha_salida: string;
  fecha_regreso?: string | null;
  costo_fijo: number;
  precio_por_pasajero: number;
  notas?: string | null;
}

export async function crearViaje(datos: DatosViaje, registradoPor = 'SISTEMA'): Promise<FilaViaje> {
  if (datos.cliente_id) {
    const existe = await pool.query(
      'SELECT id FROM clientes WHERE id = $1 AND activo = TRUE',
      [datos.cliente_id]
    );
    if (!existe.rowCount) throw new AppError(404, 'Cliente no encontrado');
  }

  const { rows } = await pool.query(
    `INSERT INTO viajes (cliente_id, destino, fecha_salida, fecha_regreso, costo_fijo, precio_por_pasajero, notas, registrado_por)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [
      datos.cliente_id || null,
      datos.destino,
      datos.fecha_salida,
      datos.fecha_regreso || null,
      datos.costo_fijo,
      datos.precio_por_pasajero,
      datos.notas || null,
      registradoPor,
    ]
  );
  return rows[0];
}

export async function listarViajes(opts: {
  estado?: 'PENDIENTE' | 'LIQUIDADO';
  busqueda?: string;
  limite: number;
  offset: number;
}): Promise<{ total: number; filas: FilaViaje[] }> {
  const params: unknown[] = [];
  const condiciones: string[] = [];

  if (opts.estado) {
    params.push(opts.estado);
    condiciones.push(`v.estado = $${params.length}`);
  }
  if (opts.busqueda) {
    params.push(`%${opts.busqueda}%`);
    condiciones.push(
      `(v.destino ILIKE $${params.length} OR COALESCE(c.nombre,'') ILIKE $${params.length})`
    );
  }

  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  params.push(opts.limite, opts.offset);

  const consulta = `
    SELECT v.*, c.nombre AS cliente_nombre,
           (SELECT count(*)::int FROM pasajeros p WHERE p.viaje_id = v.id) AS pasajeros_count
      FROM viajes v
      LEFT JOIN clientes c ON c.id = v.cliente_id
      ${where}
     ORDER BY v.fecha_salida DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`;

  const [{ rows: total }, { rows }] = await Promise.all([
    pool.query(
      `SELECT count(*)::int AS total
         FROM viajes v LEFT JOIN clientes c ON c.id = v.cliente_id ${where}`,
      params.slice(0, -2)
    ),
    pool.query(consulta, params),
  ]);

  return { total: total[0]?.total ?? 0, filas: rows };
}

export async function obtenerViaje(id: number): Promise<FilaViaje | null> {
  const { rows } = await pool.query(
    `SELECT v.*, c.nombre AS cliente_nombre
       FROM viajes v
       LEFT JOIN clientes c ON c.id = v.cliente_id
      WHERE v.id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function listarPasajeros(viajeId: number): Promise<FilaPasajero[]> {
  const { rows } = await pool.query(
    `SELECT p.id, p.viaje_id, p.nombre, p.telefono, p.asiento,
            v.precio_por_pasajero AS precio,
            COALESCE(a.abonado, 0) AS abonado,
            GREATEST(v.precio_por_pasajero - COALESCE(a.abonado, 0), 0) AS saldo
       FROM pasajeros p
       JOIN viajes v ON v.id = p.viaje_id
       LEFT JOIN (
         SELECT pasajero_id, SUM(monto) AS abonado
           FROM abonos
          WHERE pasajero_id IS NOT NULL
          GROUP BY pasajero_id
       ) a ON a.pasajero_id = p.id
      WHERE p.viaje_id = $1
      ORDER BY COALESCE(p.asiento, 'zzz') ASC, p.id ASC`,
    [viajeId]
  );
  return rows;
}

export async function agregarPasajero(
  viajeId: number,
  datos: { nombre: string; telefono?: string | null; asiento?: string | null }
): Promise<{ id: number; viaje_id: number; nombre: string; telefono: string | null; asiento: string | null }> {
  const viaje = await obtenerViaje(viajeId);
  if (!viaje) throw new AppError(404, 'Viaje no encontrado');

  try {
    const { rows } = await pool.query(
      `INSERT INTO pasajeros (viaje_id, nombre, telefono, asiento)
       VALUES ($1, $2, $3, $4) RETURNING id, viaje_id, nombre, telefono, asiento`,
      [viajeId, datos.nombre, datos.telefono || null, datos.asiento || null]
    );
    return rows[0];
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new AppError(409, 'Ese numero de asiento ya esta ocupado en este viaje');
    }
    throw error;
  }
}

export async function eliminarPasajero(pasajeroId: number): Promise<void> {
  const abonos = await pool.query(
    'SELECT count(*)::int AS n FROM abonos WHERE pasajero_id = $1',
    [pasajeroId]
  );
  if (abonos.rows[0].n > 0) {
    throw new AppError(409, 'El pasajero tiene abonos registrados y no puede eliminarse');
  }
  const resultado = await pool.query('DELETE FROM pasajeros WHERE id = $1', [pasajeroId]);
  if (!resultado.rowCount) throw new AppError(404, 'Pasajero no encontrado');
}

export async function actualizarViaje(id: number, datos: Partial<DatosViaje>): Promise<FilaViaje> {
  const existe = await obtenerViaje(id);
  if (!existe) throw new AppError(404, 'Viaje no encontrado');

  const { rows } = await pool.query(
    `UPDATE viajes
        SET cliente_id = $1, destino = $2, fecha_salida = $3, fecha_regreso = $4,
            costo_fijo = $5, precio_por_pasajero = $6, notas = $7, updated_at = now()
      WHERE id = $8 RETURNING *`,
    [
      datos.cliente_id ?? existe.cliente_id,
      datos.destino ?? existe.destino,
      datos.fecha_salida ?? existe.fecha_salida,
      datos.fecha_regreso !== undefined ? datos.fecha_regreso : existe.fecha_regreso,
      datos.costo_fijo ?? existe.costo_fijo,
      datos.precio_por_pasajero ?? existe.precio_por_pasajero,
      datos.notas !== undefined ? datos.notas : existe.notas,
      id,
    ]
  );
  return rows[0];
}

export async function eliminarViaje(id: number): Promise<void> {
  const existe = await obtenerViaje(id);
  if (!existe) throw new AppError(404, 'Viaje no encontrado');

  const abonos = await pool.query('SELECT count(*)::int AS n FROM abonos WHERE viaje_id = $1', [id]);
  if (abonos.rows[0].n > 0) {
    throw new AppError(409, 'El viaje tiene abonos registrados y no puede eliminarse');
  }
  await pool.query('DELETE FROM viajes WHERE id = $1', [id]);
}