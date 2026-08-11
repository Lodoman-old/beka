import { pool } from '../db/pool';
import { AppError } from '../utils/http';
import { EntidadAbono, FilaAbono } from '../types';

export interface FiltrosAbonos {
  desde?: Date;
  hasta?: Date;
  ventaId?: number;
  viajeId?: number;
  limite: number;
  offset: number;
}

export async function listarAbonos(opts: FiltrosAbonos): Promise<FilaAbono[]> {
  const params: unknown[] = [];
  const condiciones: string[] = [];

  if (opts.desde) {
    params.push(opts.desde);
    condiciones.push(`a.created_at >= $${params.length}`);
  }
  if (opts.hasta) {
    params.push(opts.hasta);
    condiciones.push(`a.created_at < $${params.length}`);
  }
  if (opts.ventaId) {
    params.push(opts.ventaId);
    condiciones.push(`a.venta_id = $${params.length}`);
  }
  if (opts.viajeId) {
    params.push(opts.viajeId);
    condiciones.push(`a.viaje_id = $${params.length}`);
  }

  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  params.push(opts.limite, opts.offset);

  const { rows } = await pool.query(
    `SELECT a.*,
            COALESCE(p.nombre, c.nombre, '') AS cliente_nombre,
            COALESCE(p.telefono, c.telefono, cj.telefono) AS cliente_telefono,
            j.destino
       FROM abonos a
       LEFT JOIN ventas v ON v.id = a.venta_id
       LEFT JOIN clientes c ON c.id = v.cliente_id
       LEFT JOIN viajes j ON j.id = a.viaje_id
       LEFT JOIN clientes cj ON cj.id = j.cliente_id
       LEFT JOIN pasajeros p ON p.id = a.pasajero_id
       LEFT JOIN clientes cc ON cc.id = cj.id
       ${where}
      ORDER BY a.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return rows as FilaAbono[];
}

export async function abonosPendientesDeNotificar(limite = 20): Promise<FilaAbono[]> {
  const { rows } = await pool.query(
    `SELECT a.*,
            COALESCE(p.nombre, c.nombre, '') AS cliente_nombre,
            COALESCE(p.telefono, c.telefono, cj.telefono) AS cliente_telefono,
            j.destino
       FROM abonos a
       LEFT JOIN ventas v ON v.id = a.venta_id
       LEFT JOIN clientes c ON c.id = v.cliente_id
       LEFT JOIN viajes j ON j.id = a.viaje_id
       LEFT JOIN clientes cj ON cj.id = j.cliente_id
       LEFT JOIN pasajeros p ON p.id = a.pasajero_id
      WHERE a.notificacion_whatsapp = 'PENDIENTE'
      ORDER BY a.created_at ASC
      LIMIT $1`,
    [limite]
  );
  return rows as FilaAbono[];
}

export async function marcarNotificacion(idAbono: number, estado: string): Promise<void> {
  await pool.query('UPDATE abonos SET notificacion_whatsapp = $1 WHERE id = $2', [
    estado,
    idAbono,
  ]);
}

export interface DatosAbono {
  venta_id?: number | null;
  viaje_id?: number | null;
  pasajero_id?: number | null;
  monto: number;
  metodo?: string;
  observacion?: string | null;
  registrado_por?: string;
}

export interface ResultadoAbono {
  abono: FilaAbono;
  entidad: EntidadAbono;
}

export async function crearAbono(datos: DatosAbono): Promise<ResultadoAbono> {
  const venta = datos.venta_id ?? null;
  const viaje = datos.viaje_id ?? null;
  const pasajero = datos.pasajero_id ?? null;

  if ((venta === null) === (viaje === null)) {
    throw new AppError(400, 'El abono debe pertenecer a una venta o a un viaje');
  }
  if (pasajero && viaje === null) {
    throw new AppError(400, 'Un abono de pasajero debe pertenecer a un viaje');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (viaje && pasajero) {
      const pertenece = await client.query(
        'SELECT id FROM pasajeros WHERE id = $1 AND viaje_id = $2',
        [pasajero, viaje]
      );
      if (!pertenece.rowCount) {
        throw new AppError(404, 'El pasajero no pertenece al viaje indicado');
      }
    }

    const { rows } = await client.query(
      `INSERT INTO abonos (venta_id, viaje_id, pasajero_id, monto, metodo, observacion, registrado_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        venta,
        viaje,
        pasajero,
        datos.monto,
        datos.metodo || 'EFECTIVO',
        datos.observacion || null,
        datos.registrado_por || 'POS',
      ]
    );
    const abono = rows[0] as FilaAbono;

    let entidad: EntidadAbono;
    if (venta !== null) {
      const { rows: v } = await client.query(
        `SELECT v.id, v.estado, v.saldo_pendiente, v.total, c.nombre AS cliente_nombre, c.telefono
           FROM ventas v JOIN clientes c ON c.id = v.cliente_id
          WHERE v.id = $1`,
        [venta]
      );
      if (!v.length) throw new AppError(404, 'Venta no encontrada');
      entidad = {
        tipo: 'VENTA',
        id: v[0].id,
        descripcion: `venta #${v[0].id}`,
        cliente_nombre: v[0].cliente_nombre,
        telefono: v[0].telefono,
        saldo_pendiente: v[0].saldo_pendiente,
        estado: v[0].estado,
      };
    } else {
      let participante = '';
      if (pasajero !== null) {
        const { rows: p } = await client.query(
          'SELECT nombre FROM pasajeros WHERE id = $1',
          [pasajero]
        );
        participante = p.length ? (p[0].nombre as string) : '';
      }
      const { rows: j } = await client.query(
        `SELECT j.id, j.estado, j.saldo_pendiente, j.destino, c.nombre AS cliente_nombre, c.telefono
           FROM viajes j LEFT JOIN clientes c ON c.id = j.cliente_id
          WHERE j.id = $1`,
        [viaje]
      );
      if (!j.length) throw new AppError(404, 'Viaje no encontrado');
      entidad = {
        tipo: 'VIAJE',
        id: j[0].id,
        descripcion: `viaje a ${j[0].destino}`,
        cliente_nombre: participante || j[0].cliente_nombre || 'Viajero',
        telefono: j[0].telefono,
        saldo_pendiente: j[0].saldo_pendiente,
        estado: j[0].estado,
        destino: j[0].destino,
      };
    }

    await client.query('COMMIT');
    return { abono, entidad };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}