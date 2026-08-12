import { pool } from '../db/pool';
import { AppError } from '../utils/http';
import { FilaCliente } from '../types';
import { hashPassword } from './auth.service';

const CARACTERES_CONTRASENA = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

function generarContrasenaPortal(): string {
  let contrasena = '';
  for (let i = 0; i < 8; i++) {
    contrasena += CARACTERES_CONTRASENA[Math.floor(Math.random() * CARACTERES_CONTRASENA.length)];
  }
  return contrasena;
}

function normalizarTelefono(telefono: string | null | undefined): string | null {
  if (!telefono) return null;
  const digitos = telefono.replace(/\D/g, '');
  return digitos.length ? digitos : null;
}

async function generarCredencialesPortal(telefono: string | null | undefined): Promise<{
  usuario_portal: string | null;
  pass_hash_portal: string;
  pass_plano_portal: string;
}> {
  const usuario_portal = telefono?.trim() || null;
  const pass_plano_portal = generarContrasenaPortal();
  const pass_hash_portal = await hashPassword(pass_plano_portal);
  return { usuario_portal, pass_hash_portal, pass_plano_portal };
}

export async function buscarClientesPorTelefono(
  telefono: string | null | undefined,
  exceptoId?: number
): Promise<{ id: number; nombre: string; activo: boolean }[]> {
  const digitos = normalizarTelefono(telefono);
  if (!digitos) return [];
  const { rows } = await pool.query(
    `SELECT id, nombre, activo FROM clientes
      WHERE telefono IS NOT NULL
        AND REGEXP_REPLACE(telefono, $2, '', 'g') = $1
        AND id <> COALESCE($3, -1)
      ORDER BY activo DESC, nombre ASC`,
    [digitos, '\\D', exceptoId ?? -1]
  );
  return rows as { id: number; nombre: string; activo: boolean }[];
}

async function quitarTelefonoA(ids: number[]): Promise<void> {
  if (!ids.length) return;
  await pool.query(
    `UPDATE clientes SET telefono = NULL, usuario_portal = NULL, updated_at = now()
      WHERE id = ANY($1)`,
    [ids]
  );
}

export interface DatosCliente {
  nombre: string;
  telefono?: string | null;
  documento?: string | null;
  email?: string | null;
  direccion?: string | null;
  notas?: string | null;
}

export async function listarClientes(opts: {
  busqueda?: string;
  incluirInactivos?: boolean;
  limite: number;
  offset: number;
}): Promise<{ total: number; filas: FilaCliente[] }> {
  const params: unknown[] = [];
  const condiciones: string[] = [];

  if (!opts.incluirInactivos) condiciones.push('c.activo = TRUE');
  if (opts.busqueda) {
    params.push(`%${opts.busqueda}%`);
    condiciones.push(`(c.nombre ILIKE $${params.length} OR COALESCE(c.telefono,'') ILIKE $${params.length} OR COALESCE(c.documento,'') ILIKE $${params.length})`);
  }

  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  params.push(opts.limite, opts.offset);

  const [{ rows: total }, { rows }] = await Promise.all([
    pool.query(
      `SELECT count(*)::int AS total FROM clientes c ${where.replace(/c\./g, '')}`,
      params.slice(0, -2)
    ),
    pool.query(
      `SELECT c.* FROM clientes c ${where} ORDER BY c.nombre ASC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    ),
  ]);

  return { total: total[0]?.total ?? 0, filas: rows };
}

export async function crearCliente(
  datos: DatosCliente,
  accion?: 'cambiar' | 'compartir'
): Promise<FilaCliente> {
  const telefono = datos.telefono?.trim() || null;
  if (telefono) {
    const duplicados = await buscarClientesPorTelefono(telefono);
    if (duplicados.length) {
      if (accion === 'cambiar') {
        await quitarTelefonoA(duplicados.map((d) => d.id));
      } else if (accion !== 'compartir') {
        throw new AppError(
          409,
          `El teléfono ${telefono} ya está registrado para ${duplicados.map((d) => d.nombre).join(', ')}`
        );
      }
    }
  }
  const credenciales = await generarCredencialesPortal(telefono);
  const { rows } = await pool.query(
    `INSERT INTO clientes (nombre, telefono, documento, email, direccion, notas, usuario_portal, pass_hash_portal, pass_plano_portal)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [datos.nombre, telefono, datos.documento || null, datos.email || null, datos.direccion || null, datos.notas || null, credenciales.usuario_portal, credenciales.pass_hash_portal, credenciales.pass_plano_portal]
  );
  return rows[0];
}

export async function obtenerCliente(id: number): Promise<FilaCliente | null> {
  const { rows } = await pool.query('SELECT * FROM clientes WHERE id = $1', [id]);
  return rows[0] ?? null;
}

export async function actualizarCliente(
  id: number,
  datos: DatosCliente,
  accion?: 'cambiar' | 'compartir'
): Promise<FilaCliente> {
  const existe = await obtenerCliente(id);
  if (!existe) throw new AppError(404, 'Cliente no encontrado');

  const telefono = datos.telefono?.trim() || null;
  if (telefono) {
    const duplicados = await buscarClientesPorTelefono(telefono, id);
    if (duplicados.length) {
      if (accion === 'cambiar') {
        await quitarTelefonoA(duplicados.map((d) => d.id));
      } else if (accion !== 'compartir') {
        throw new AppError(
          409,
          `El teléfono ${telefono} ya está registrado para ${duplicados.map((d) => d.nombre).join(', ')}`
        );
      }
    }
  }

  const { rows } = await pool.query(
    `UPDATE clientes
        SET nombre = $1, telefono = $2, documento = $3, email = $4,
            direccion = $5, notas = $6, usuario_portal = $7, updated_at = now()
      WHERE id = $8 RETURNING *`,
    [datos.nombre, telefono, datos.documento || null, datos.email || null, datos.direccion || null, datos.notas || null, telefono, id]
  );
  return rows[0];
}

export async function regenerarCredencialesPortal(id: number): Promise<{ usuario_portal: string; pass_plano_portal: string }> {
  const existe = await obtenerCliente(id);
  if (!existe) throw new AppError(404, 'Cliente no encontrado');
  if (!existe.telefono) {
    throw new AppError(400, 'El cliente no tiene teléfono; sin teléfono no puede acceder al portal');
  }
  const pass_plano_portal = generarContrasenaPortal();
  const pass_hash_portal = await hashPassword(pass_plano_portal);
  await pool.query(
    'UPDATE clientes SET usuario_portal = $1, pass_hash_portal = $2, pass_plano_portal = $3, updated_at = now() WHERE id = $4',
    [existe.telefono, pass_hash_portal, pass_plano_portal, id]
  );
  return { usuario_portal: existe.telefono, pass_plano_portal };
}

export async function asegurarCredencialesPortal(telefono: string | null | undefined): Promise<{
  usuario_portal: string;
  pass_plano_portal: string;
} | null> {
  const digitos = normalizarTelefono(telefono);
  if (!digitos) return null;
  const { rows } = await pool.query(
    `SELECT * FROM clientes
      WHERE activo = TRUE AND telefono IS NOT NULL
        AND REGEXP_REPLACE(telefono, $2, '', 'g') = $1
      LIMIT 1`,
    [digitos, '\\D']
  );
  const cliente = rows[0] as FilaCliente | undefined;
  if (!cliente?.id) return null;
  if (cliente.usuario_portal && cliente.pass_plano_portal) {
    return { usuario_portal: cliente.usuario_portal, pass_plano_portal: cliente.pass_plano_portal };
  }
  return regenerarCredencialesPortal(cliente.id);
}

export async function eliminarCliente(id: number): Promise<void> {
  const existe = await obtenerCliente(id);
  if (!existe) throw new AppError(404, 'Cliente no encontrado');

  await pool.query(
    'UPDATE clientes SET activo = FALSE, updated_at = now() WHERE id = $1',
    [id]
  );
}