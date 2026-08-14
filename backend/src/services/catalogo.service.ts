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
  nuevos: number;
  solo_precio: number;
  cambios: number;
  sin_cambios: number;
  desactivados: number;
}

export interface ProgresoUpsert {
  procesados: number;
  total: number;
  nuevos: number;
  solo_precio: number;
  cambios: number;
  sin_cambios: number;
}

interface ProductoExistente {
  sku: string;
  nombre: string;
  precio_costo: number;
  imagen: string | null;
}

export async function upsertMasivo(
  productos: ProductoNice[],
  margen: number,
  onProgreso?: (progreso: ProgresoUpsert) => void
): Promise<ResumenSincronizacion> {
  const resumen: ResumenSincronizacion = {
    insertados: 0,
    actualizados: 0,
    con_error: 0,
    margen_usado: margen,
    nuevos: 0,
    solo_precio: 0,
    cambios: 0,
    sin_cambios: 0,
    desactivados: 0,
  };

  const valores: unknown[] = [];
  const inconsistencia: string[] = [];
  const skus: string[] = [];
  const clasificados: ('nuevo' | 'precio' | 'cambio' | 'igual')[] = [];
  let conError = 0;

  const registro: ProductoNice[] = [];

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
    registro.push({ sku, nombre, precio_costo: p.precio_costo, imagen: p.imagen || null });
  }
  resumen.con_error = conError;

  const existentes = new Map<string, ProductoExistente>();
  if (skus.length) {
    const { rows } = await pool.query(
      'SELECT sku, nombre, precio_costo, imagen FROM catalogo_productos WHERE sku = ANY($1)',
      [skus]
    );
    for (const fila of rows as ProductoExistente[]) {
      existentes.set(String(fila.sku), fila);
    }
  }

  const conteos = { nuevos: 0, solo_precio: 0, cambios: 0, sin_cambios: 0 };
  for (const p of registro) {
    const previo = existentes.get(p.sku);
    if (!previo) {
      conteos.nuevos += 1;
      clasificados.push('nuevo');
      continue;
    }
    const mismoPrecio = Math.abs(previo.precio_costo - p.precio_costo) < 0.01;
    const mismoNombre = previo.nombre === p.nombre;
    const mismaImagen = (previo.imagen || '') === (p.imagen || '');
    if (mismoPrecio && mismoNombre && mismaImagen) {
      conteos.sin_cambios += 1;
      clasificados.push('igual');
    } else if (mismoPrecio) {
      conteos.cambios += 1;
      clasificados.push('cambio');
    } else if (mismoNombre && mismaImagen) {
      conteos.solo_precio += 1;
      clasificados.push('precio');
    } else {
      conteos.cambios += 1;
      clasificados.push('cambio');
    }
  }

  const running = { nuevos: 0, solo_precio: 0, cambios: 0, sin_cambios: 0 };
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
    const corte = Math.min(i + 500, clasificados.length);
    for (let j = i; j < corte; j++) {
      const t = clasificados[j];
      if (t === 'nuevo') running.nuevos += 1;
      else if (t === 'precio') running.solo_precio += 1;
      else if (t === 'cambio') running.cambios += 1;
      else running.sin_cambios += 1;
    }
    onProgreso?.({ procesados: corte, total: registro.length, ...running });
  }
  if (registro.length === 0) {
    onProgreso?.({ procesados: 0, total: 0, nuevos: 0, solo_precio: 0, cambios: 0, sin_cambios: 0 });
  }

  if (skus.length) {
    const { rowCount } = await pool.query(
      `UPDATE catalogo_productos
          SET activo = FALSE, updated_at = now()
        WHERE origen = 'NICE' AND activo AND NOT (sku = ANY($1))`,
      [skus]
    );
    resumen.desactivados = rowCount ?? 0;
  }

  resumen.nuevos = conteos.nuevos;
  resumen.solo_precio = conteos.solo_precio;
  resumen.cambios = conteos.cambios;
  resumen.sin_cambios = conteos.sin_cambios;

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
  talla?: string | null;
  color?: string | null;
  precio_costo: number;
  imagen?: string | null;
}): Promise<FilaProducto> {
  const margen = await margenActual();
  const { rows } = await pool.query(
    `INSERT INTO catalogo_productos (sku, nombre, talla, color, precio_costo, precio_publico, margen_aplicado, imagen)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [
      datos.sku.trim(),
      datos.nombre.trim(),
      datos.talla?.trim() || null,
      datos.color?.trim() || null,
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
    Pick<FilaProducto, 'nombre' | 'talla' | 'color' | 'precio_costo' | 'imagen' | 'activo' | 'sku'> & {
      margen?: number;
    }
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
        SET nombre = $1, talla = $2, color = $3, precio_costo = $4, precio_publico = $5,
            margen_aplicado = $6, imagen = $7, activo = $8, sku = $9, updated_at = now()
      WHERE id = $10 RETURNING *`,
    [
      datos.nombre ?? existe.nombre,
      datos.talla !== undefined ? datos.talla?.trim() || null : existe.talla,
      datos.color !== undefined ? datos.color?.trim() || null : existe.color,
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