import { pool } from '../db/pool';
import { AppError } from '../utils/http';
import { FilaProducto } from '../types';
import { notificarVenta } from './whatsapp.service';

export interface ItemPedido {
  producto_id: number;
  cantidad: number;
}

export interface ItemConversion {
  pedido_detalle_id: number;
  incluir: boolean;
  cantidad: number;
}

export async function crearPedido(
  clienteId: number,
  items: ItemPedido[],
  notas?: string | null,
  registradoPor = 'SISTEMA'
): Promise<Record<string, unknown>> {
  if (!items || items.length === 0) {
    throw new AppError(400, 'El pedido necesita al menos un articulo');
  }

  const cliente = await pool.query('SELECT id FROM clientes WHERE id = $1', [clienteId]);
  if (!cliente.rowCount) throw new AppError(404, 'Cliente no encontrado');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const pedido = (
      await client.query(
        `INSERT INTO pedidos (cliente_id, notas, registrado_por)
         VALUES ($1, $2, $3) RETURNING *`,
        [clienteId, notas || null, registradoPor]
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
        `INSERT INTO pedido_detalles (pedido_id, producto_id, cantidad, precio_unitario, precio_costo_unitario)
         VALUES ($1, $2, $3, $4, $5)`,
        [pedido.id, producto.id, item.cantidad, producto.precio_publico, producto.precio_costo]
      );
    }

    const final = (
      await client.query(
        `SELECT p.*, c.nombre AS cliente_nombre, c.telefono AS cliente_telefono
           FROM pedidos p JOIN clientes c ON c.id = p.cliente_id
          WHERE p.id = $1`,
        [pedido.id]
      )
    ).rows[0];

    await client.query('COMMIT');
    return final;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function listarPedidos(opts: {
  estado?: 'PENDIENTE' | 'ENTREGADO';
  busqueda?: string;
  limite: number;
  offset: number;
}): Promise<{ total: number; filas: Record<string, unknown>[] }> {
  const params: unknown[] = [];
  const condiciones: string[] = [];

  if (opts.estado) {
    params.push(opts.estado);
    condiciones.push(`p.estado = $${params.length}`);
  }
  if (opts.busqueda) {
    params.push(`%${opts.busqueda}%`);
    condiciones.push(`c.nombre ILIKE $${params.length}`);
  }

  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  params.push(opts.limite, opts.offset);

  const consulta = `
    SELECT p.*, c.nombre AS cliente_nombre, c.telefono AS cliente_telefono,
           (SELECT count(*)::int FROM pedido_detalles d WHERE d.pedido_id = p.id) AS articulos_count,
           (SELECT COALESCE(SUM(d.cantidad * d.precio_unitario), 0)
              FROM pedido_detalles d WHERE d.pedido_id = p.id) AS total_pedido
      FROM pedidos p
      JOIN clientes c ON c.id = p.cliente_id
      ${where}
     ORDER BY p.fecha DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`;

  const [{ rows: total }, { rows }] = await Promise.all([
    pool.query(
      `SELECT count(*)::int AS total FROM pedidos p JOIN clientes c ON c.id = p.cliente_id ${where}`,
      params.slice(0, -2)
    ),
    pool.query(consulta, params),
  ]);

  return { total: total[0]?.total ?? 0, filas: rows };
}

export async function obtenerPedido(
  id: number
): Promise<(Record<string, unknown> & { detalles: Record<string, unknown>[] }) | null> {
  const { rows } = await pool.query(
    `SELECT p.*, c.nombre AS cliente_nombre, c.telefono AS cliente_telefono
       FROM pedidos p JOIN clientes c ON c.id = p.cliente_id
      WHERE p.id = $1`,
    [id]
  );
  if (!rows.length) return null;

  const detalles = await pool.query(
    `SELECT d.id, d.pedido_id, d.producto_id, d.cantidad, d.precio_unitario,
            d.precio_costo_unitario, p.sku, p.nombre AS producto_nombre, p.imagen,
            p.precio_publico AS precio_hoy
       FROM pedido_detalles d
       JOIN catalogo_productos p ON p.id = d.producto_id
      WHERE d.pedido_id = $1
      ORDER BY d.id`,
    [id]
  );
  return { ...rows[0], detalles: detalles.rows };
}

export async function marcarEntregado(id: number): Promise<Record<string, unknown>> {
  const existe = await pool.query('SELECT id, estado FROM pedidos WHERE id = $1', [id]);
  if (!existe.rowCount) throw new AppError(404, 'Pedido no encontrado');
  if (existe.rows[0].estado === 'CONVERTIDO') {
    throw new AppError(409, 'El pedido ya fue convertido en venta');
  }
  if (existe.rows[0].estado === 'ENTREGADO') {
    throw new AppError(409, 'El pedido ya está entregado');
  }
  const { rows } = await pool.query(
    `UPDATE pedidos SET estado = 'ENTREGADO', updated_at = now() WHERE id = $1 RETURNING *`,
    [id]
  );
  return rows[0];
}

export async function convertirEnVenta(
  id: number,
  items: ItemConversion[]
): Promise<Record<string, unknown>> {
  const pedido = await pool.query('SELECT id, estado, notas, cliente_id FROM pedidos WHERE id = $1', [id]);
  if (!pedido.rowCount) throw new AppError(404, 'Pedido no encontrado');
  if (pedido.rows[0].estado !== 'ENTREGADO') {
    throw new AppError(409, 'El pedido debe estar ENTREGADO antes de convertirlo en venta');
  }

  const { rows: detalles } = await pool.query(
    'SELECT id, producto_id, cantidad FROM pedido_detalles WHERE pedido_id = $1',
    [id]
  );
  const porId = new Map(detalles.map((d) => [d.id, d]));
  const elegidos: { detalle: (typeof detalles)[0]; cantidad: number }[] = [];
  for (const item of items ?? []) {
    const detalle = porId.get(item.pedido_detalle_id);
    if (!detalle) throw new AppError(400, `Detalle ${item.pedido_detalle_id} no pertenece al pedido`);
    if (!item.incluir || item.cantidad <= 0) continue;
    if (!Number.isInteger(item.cantidad) || item.cantidad > detalle.cantidad) {
      throw new AppError(
        400,
        `La cantidad para el producto del detalle ${item.pedido_detalle_id} excede lo pedido`
      );
    }
    elegidos.push({ detalle, cantidad: item.cantidad });
  }
  if (!elegidos.length) throw new AppError(400, 'Selecciona al menos un producto para la venta');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const venta = (
      await client.query(
        `INSERT INTO ventas (cliente_id, notas, registrado_por)
         VALUES ($1, $2, $3) RETURNING *`,
        [pedido.rows[0].cliente_id, `Pedido #${id}${pedido.rows[0].notas ? ' · ' + pedido.rows[0].notas : ''}`, 'SISTEMA']
      )
    ).rows[0];

    for (const { detalle, cantidad } of elegidos) {
      const producto = (
        await client.query(
          `SELECT id, precio_publico, precio_costo, activo FROM catalogo_productos WHERE id = $1`,
          [detalle.producto_id]
        )
      ).rows[0] as Partial<FilaProducto> | undefined;
      if (!producto || !producto.activo) {
        throw new AppError(404, `Producto con id ${detalle.producto_id} no encontrado o inactivo`);
      }
      await client.query(
        `INSERT INTO venta_detalles (venta_id, producto_id, cantidad, precio_unitario, precio_costo_unitario)
         VALUES ($1, $2, $3, $4, $5)`,
        [venta.id, producto.id, cantidad, producto.precio_publico, producto.precio_costo]
      );
    }

    const final = (
      await client.query(
        `SELECT v.*, c.nombre AS cliente_nombre, c.telefono AS cliente_telefono
           FROM ventas v JOIN clientes c ON c.id = v.cliente_id
          WHERE v.id = $1`,
        [venta.id]
      )
    ).rows[0];

    await client.query(
      `UPDATE pedidos SET estado = 'CONVERTIDO', venta_id = $1, updated_at = now() WHERE id = $2`,
      [venta.id, id]
    );

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

export async function eliminarPedido(id: number): Promise<void> {
  const existe = await pool.query('SELECT id, estado FROM pedidos WHERE id = $1', [id]);
  if (!existe.rowCount) throw new AppError(404, 'Pedido no encontrado');
  if (existe.rows[0].estado === 'CONVERTIDO') {
    throw new AppError(409, 'El pedido ya fue convertido en venta y no puede eliminarse');
  }
  await pool.query('DELETE FROM pedidos WHERE id = $1', [id]);
}