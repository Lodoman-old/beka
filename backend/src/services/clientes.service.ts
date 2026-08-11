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

async function generarUsuarioPortal(telefono: string | null | undefined, nombre: string): Promise<string> {
  const base =
    (telefono ?? '').replace(/\D/g, '').slice(-8) ||
    nombre.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);
  for (let intento = 0; intento < 10; intento++) {
    const candidato = intento === 0 ? base : `${base}${Math.floor(Math.random() * 90 + 10)}`;
    const { rows } = await pool.query('SELECT 1 FROM clientes WHERE usuario_portal = $1', [candidato]);
    if (!rows.length) return candidato;
  }
  return `${base}${Date.now().toString(36)}`;
}

async function generarCredencialesPortal(telefono: string | null | undefined, nombre: string): Promise<{
  usuario_portal: string;
  pass_hash_portal: string;
  pass_plano_portal: string;
}> {
  const usuario_portal = await generarUsuarioPortal(telefono, nombre);
  const pass_plano_portal = generarContrasenaPortal();
  const pass_hash_portal = await hashPassword(pass_plano_portal);
  return { usuario_portal, pass_hash_portal, pass_plano_portal };
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

export async function crearCliente(datos: DatosCliente): Promise<FilaCliente> {
  const credenciales = await generarCredencialesPortal(datos.telefono, datos.nombre);
  const { rows } = await pool.query(
    `INSERT INTO clientes (nombre, telefono, documento, email, direccion, notas, usuario_portal, pass_hash_portal, pass_plano_portal)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [datos.nombre, datos.telefono || null, datos.documento || null, datos.email || null, datos.direccion || null, datos.notas || null, credenciales.usuario_portal, credenciales.pass_hash_portal, credenciales.pass_plano_portal]
  );
  return rows[0];
}

export async function obtenerCliente(id: number): Promise<FilaCliente | null> {
  const { rows } = await pool.query('SELECT * FROM clientes WHERE id = $1', [id]);
  return rows[0] ?? null;
}

export async function actualizarCliente(id: number, datos: DatosCliente): Promise<FilaCliente> {
  const existe = await obtenerCliente(id);
  if (!existe) throw new AppError(404, 'Cliente no encontrado');

  const { rows } = await pool.query(
    `UPDATE clientes
        SET nombre = $1, telefono = $2, documento = $3, email = $4,
            direccion = $5, notas = $6, updated_at = now()
      WHERE id = $7 RETURNING *`,
    [datos.nombre, datos.telefono || null, datos.documento || null, datos.email || null, datos.direccion || null, datos.notas || null, id]
  );
  return rows[0];
}

export async function regenerarCredencialesPortal(id: number): Promise<{ usuario_portal: string; pass_plano_portal: string }> {
  const existe = await obtenerCliente(id);
  if (!existe) throw new AppError(404, 'Cliente no encontrado');
  const pass_plano_portal = generarContrasenaPortal();
  const pass_hash_portal = await hashPassword(pass_plano_portal);
  let usuario_portal = existe.usuario_portal;
  if (!usuario_portal) {
    usuario_portal = await generarUsuarioPortal(existe.telefono, existe.nombre);
  }
  await pool.query(
    'UPDATE clientes SET usuario_portal = $1, pass_hash_portal = $2, pass_plano_portal = $3, updated_at = now() WHERE id = $4',
    [usuario_portal, pass_hash_portal, pass_plano_portal, id]
  );
  return { usuario_portal, pass_plano_portal };
}

export async function asegurarCredencialesPortal(telefono: string | null | undefined): Promise<{
  usuario_portal: string;
  pass_plano_portal: string;
} | null> {
  if (!telefono) return null;
  const { rows } = await pool.query(
    'SELECT * FROM clientes WHERE telefono = $1 AND activo = TRUE LIMIT 1',
    [telefono]
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