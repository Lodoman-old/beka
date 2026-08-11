import { pool } from '../db/pool';
import { AppError } from '../utils/http';
import { FilaProducto, FilaVenta } from '../types';
import { recargoAbonos } from './sistema.service';
import { notificarVenta } from './whatsapp.service';

export interface ItemVenta {
  producto_id: number;
  cantidad: number;
}

export async function crearVenta(
  clienteId: number,
  items: ItemVenta[],
  notas?: string | null,
  registradoPor = 'SISTEMA',
  aCredito = false
): Promise<FilaVenta> {
  if (!items || items.length === 0) {
    throw new AppError(400, 'La venta necesita al menos un articulo');
  }

  const cliente = await pool.query('SELECT id FROM clientes WHERE id = $1', [clienteId]);
  if (!cliente.rowCount) throw new AppError(404, 'Cliente no encontrado');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const recargoPct = aCredito ? await recargoAbonos() : 0;
    const venta = (
      await client.query(
        `INSERT INTO ventas (cliente_id, notas, registrado_por, a_credito, recargo_pct)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [clienteId, notas || null, registradoPor, aCredito, recargoPct]
      )
    ).rows[0];

    for (const item of items) {
      if (!Number.isInteger(item.cantidad) || item.cantidad <= 0) {
        throw new AppError(400, 'La cantidad debe ser un entero positivo');
      }
      const producto = (
        await client.query(
          `SELECT id, precio_publico, precio_costo, activo FROM catalogo_productos WHERE id = $1`,
          [item.producto_id]
        )
      ).rows[0] as Partial<FilaProducto>;

      if (!producto || !producto.activo) {
        throw new AppError(404, `Producto con id ${item.producto_id} no encontrado o inactivo`);
      }
      await client.query(
        `INSERT INTO venta_detalles (venta_id, producto_id, cantidad, precio_unitario, precio_costo_unitario)
         VALUES ($1, $2, $3, $4, $5)`,
        [venta.id, producto.id, item.cantidad, producto.precio_publico, producto.precio_costo]
      );
    }

    const final = (
      await client.query(
        `SELECT v.*, c.nombre AS cliente_nombre, c.telefono AS cliente_telefono
           FROM ventas v
           JOIN clientes c ON c.id = v.cliente_id
          WHERE v.id = $1`,
        [venta.id]
      )
    ).rows[0];

    await client.query('COMMIT');
    void notificarVenta(final);
    return final;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function listarVentas(opts: {
  clienteId?: number;
  estado?: 'PENDIENTE' | 'LIQUIDADO';
  busqueda?: string;
  limite: number;
  offset: number;
}): Promise<{ total: number; filas: FilaVenta[] }> {
  const params: unknown[] = [];
  const condiciones: string[] = [];

  if (opts.clienteId) {
    params.push(opts.clienteId);
    condiciones.push(`v.cliente_id = $${params.length}`);
  }
  if (opts.estado) {
    params.push(opts.estado);
    condiciones.push(`v.estado = $${params.length}`);
  }
  if (opts.busqueda) {
    params.push(`%${opts.busqueda}%`);
    condiciones.push(`c.nombre ILIKE $${params.length}`);
  }

  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  params.push(opts.limite, opts.offset);

  const consulta = `
    SELECT v.*, c.nombre AS cliente_nombre, c.telefono AS cliente_telefono,
           (SELECT count(*)::int FROM abonos a WHERE a.venta_id = v.id) AS abonos_count
      FROM ventas v
      JOIN clientes c ON c.id = v.cliente_id
      ${where}
     ORDER BY v.fecha DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`;

  const [{ rows: total }, { rows }] = await Promise.all([
    pool.query(
      `SELECT count(*)::int AS total FROM ventas v JOIN clientes c ON c.id = v.cliente_id ${where.replace(/v\.cliente_id/g, 'v.cliente_id')}`,
      params.slice(0, -2)
    ),
    pool.query(consulta, params),
  ]);

  return { total: total[0]?.total ?? 0, filas: rows };
}

export async function obtenerVenta(id: number): Promise<FilaVenta & { detalles: DetalleVenta[] } | null> {
  const consulta = `
    SELECT v.*, c.nombre AS cliente_nombre, c.telefono AS cliente_telefono
      FROM ventas v
      JOIN clientes c ON c.id = v.cliente_id
     WHERE v.id = $1`;
  const { rows } = await pool.query(consulta, [id]);
  if (!rows.length) return null;

  const venta = rows[0];
  const detalles = await pool.query(
    `SELECT d.id, d.producto_id, d.cantidad, d.precio_unitario, d.precio_costo_unitario,
            p.sku, p.nombre AS producto_nombre, p.imagen
       FROM venta_detalles d
       JOIN catalogo_productos p ON p.id = d.producto_id
      WHERE d.venta_id = $1
      ORDER BY d.id`,
    [id]
  );
  return { ...venta, detalles: detalles.rows };
}

export interface DetalleVenta {
  id: number;
  producto_id: number;
  cantidad: number;
  precio_unitario: number;
  precio_costo_unitario: number;
  sku: string;
  producto_nombre: string;
  imagen: string | null;
}

export async function eliminarVenta(id: number): Promise<void> {
  const existe = await pool.query('SELECT id FROM ventas WHERE id = $1', [id]);
  if (!existe.rowCount) throw new AppError(404, 'Venta no encontrada');

  const abonos = await pool.query('SELECT count(*)::int AS n FROM abonos WHERE venta_id = $1', [id]);
  if (abonos.rows[0].n > 0) {
    throw new AppError(409, 'La venta tiene abonos registrados y no puede eliminarse');
  }
  await pool.query('DELETE FROM ventas WHERE id = $1', [id]);
}