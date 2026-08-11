import { pool } from '../db/pool';
import { AppError } from '../utils/http';
import { FilaProducto } from '../types';
import { calcularPrecioPublico, guardarValor, margenActual } from './sistema.service';

export interface ProductoNice {
  sku: string;
  nombre: string;
  precio_costo: number;
  imagen?: string | null;
}

export interface ResumenSincronizacion {
  insertados: number;
  actualizados: number;
  con_error: number;
  margen_usado: number;
}

export async function upsertMasivo(
  productos: ProductoNice[],
  margen: number
): Promise<ResumenSincronizacion> {
  const resumen: ResumenSincronizacion = {
    insertados: 0,
    actualizados: 0,
    con_error: 0,
    margen_usado: margen,
  };

  const valores: unknown[] = [];
  const inconsistencia: string[] = [];
  const skus: string[] = [];
  let conError = 0;

  for (const p of productos) {
    const sku = String(p.sku ?? '').trim();
    const nombre = String(p.nombre ?? '').trim();
    if (!sku || !nombre || !Number.isFinite(p.precio_costo) || p.precio_costo < 0) {
      conError += 1;
      continue;
    }
    skus.push(sku);
    valores.push(sku, nombre, p.precio_costo, calcularPrecioPublico(p.precio_costo, margen), margen, p.imagen || null, 'NICE');
    inconsistencia.push(`($${valores.length - 6}, $${valores.length - 5}, $${valores.length - 4}, $${valores.length - 3}, $${valores.length - 2}, $${valores.length - 1}, $${valores.length})`);
  }
  resumen.con_error = conError;

  for (let i = 0; i < inconsistencia.length; i += 500) {
    const lote = inconsistencia.slice(i, i + 500);
    const loteValores = valores.slice(i * 7, (i + 500) * 7);
    const { rows } = await pool.query(
      `INSERT INTO catalogo_productos
         (sku, nombre, precio_costo, precio_publico, margen_aplicado, imagen, origen)
       VALUES ${lote.join(',')}
       ON CONFLICT (sku) DO UPDATE
         SET nombre = EXCLUDED.nombre,
             precio_costo = EXCLUDED.precio_costo,
             precio_publico = EXCLUDED.precio_publico,
             margen_aplicado = EXCLUDED.margen_aplicado,
             imagen = EXCLUDED.imagen,
             origen = EXCLUDED.origen,
             activo = TRUE,
             updated_at = now()
       RETURNING (xmax = 0) AS insertado`,
      loteValores
    );
    for (const fila of rows) {
      if (fila.insertado) resumen.insertados += 1;
      else resumen.actualizados += 1;
    }
  }

  if (skus.length) {
    await pool.query(
      `UPDATE catalogo_productos
          SET activo = FALSE, updated_at = now()
        WHERE origen = 'NICE' AND activo AND NOT (sku = ANY($1))`,
      [skus]
    );
  }

  await guardarValor('ULTIMA_SINCRONIZACION_NICE', new Date().toISOString());
  return resumen;
}

export async function recalcularPrecios(): Promise<{ actualizados: number; margen: number }> {
  const margen = await margenActual();
  const { rowCount } = await pool.query(
    `UPDATE catalogo_productos
        SET precio_publico = ROUND(precio_costo * (1 + ($1 / 100)), 2),
            margen_aplicado = $1,
            updated_at = now()`,
    [margen]
  );
  return { actualizados: rowCount ?? 0, margen };
}

export async function buscarProductos(opts: {
  busqueda?: string;
  incluirInactivos?: boolean;
  limite: number;
  offset: number;
}): Promise<{ total: number; filas: FilaProducto[] }> {
  const params: unknown[] = [];
  const condiciones: string[] = [];

  if (!opts.incluirInactivos) condiciones.push('p.activo = TRUE');
  if (opts.busqueda) {
    params.push(`%${opts.busqueda}%`);
    condiciones.push(`(p.nombre ILIKE $${params.length} OR p.sku ILIKE $${params.length})`);
  }

  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  params.push(opts.limite, opts.offset);

  const [{ rows: total }, { rows }] = await Promise.all([
    pool.query(`SELECT count(*)::int AS total FROM catalogo_productos p ${where}`, params.slice(0, -2)),
    pool.query(
      `SELECT p.* FROM catalogo_productos p ${where}
        ORDER BY p.nombre ASC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    ),
  ]);

  return { total: total[0]?.total ?? 0, filas: rows as FilaProducto[] };
}

export async function obtenerPorSku(sku: string): Promise<FilaProducto | null> {
  const { rows } = await pool.query(
    'SELECT * FROM catalogo_productos WHERE sku = $1',
    [String(sku).trim()]
  );
  return rows[0] ?? null;
}

export async function obtenerProducto(id: number): Promise<FilaProducto | null> {
  const { rows } = await pool.query('SELECT * FROM catalogo_productos WHERE id = $1', [id]);
  return rows[0] ?? null;
}

export async function crearProductoManual(datos: {
  sku: string;
  nombre: string;
  precio_costo: number;
  imagen?: string | null;
}): Promise<FilaProducto> {
  const margen = await margenActual();
  const { rows } = await pool.query(
    `INSERT INTO catalogo_productos (sku, nombre, precio_costo, precio_publico, margen_aplicado, imagen)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [
      datos.sku.trim(),
      datos.nombre.trim(),
      datos.precio_costo,
      calcularPrecioPublico(datos.precio_costo, margen),
      margen,
      datos.imagen || null,
    ]
  );
  return rows[0];
}

export async function actualizarProducto(
  id: number,
  datos: Partial<
    Pick<FilaProducto, 'nombre' | 'precio_costo' | 'imagen' | 'activo' | 'sku'> & { margen?: number }
  >
): Promise<FilaProducto> {
  const existe = await obtenerProducto(id);
  if (!existe) throw new AppError(404, 'Producto no encontrado');

  const margenNuevo = datos.margen;
  const margen =
    margenNuevo !== undefined && Number.isFinite(margenNuevo)
      ? margenNuevo
      : existe.margen_aplicado;

  const { rows } = await pool.query(
    `UPDATE catalogo_productos
        SET nombre = $1, precio_costo = $2, precio_publico = $3,
            margen_aplicado = $4, imagen = $5, activo = $6, sku = $7, updated_at = now()
      WHERE id = $8 RETURNING *`,
    [
      datos.nombre ?? existe.nombre,
      datos.precio_costo ?? existe.precio_costo,
      calcularPrecioPublico(datos.precio_costo ?? existe.precio_costo, margen),
      margen,
      datos.imagen !== undefined ? datos.imagen : existe.imagen,
      datos.activo !== undefined ? datos.activo : existe.activo,
      datos.sku ?? existe.sku,
      id,
    ]
  );
  return rows[0];
}

export async function eliminarProducto(id: number): Promise<void> {
  const existe = await obtenerProducto(id);
  if (!existe) throw new AppError(404, 'Producto no encontrado');
  await pool.query('UPDATE catalogo_productos SET activo = FALSE, updated_at = now() WHERE id = $1', [id]);
}