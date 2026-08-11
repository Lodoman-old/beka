import { pool } from '../db/pool';
import { env } from '../config/env';
import { AppError } from '../utils/http';
import path from 'path';
import fs from 'fs';

export const DIR_DATOS = path.resolve(process.cwd(), 'data');
export const RUTA_LOGO = path.join(DIR_DATOS, 'logos', 'logo.png');

export function existeLogo(): boolean {
  return fs.existsSync(RUTA_LOGO);
}

export function guardarLogo(dataUrl: string): void {
  const coincidencia = /^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/.exec(dataUrl);
  if (!coincidencia) {
    throw new AppError(400, 'Formato de imagen invalido; envia un PNG o JPG en base64');
  }
  const buffer = Buffer.from(coincidencia[2], 'base64');
  if (buffer.length === 0) throw new AppError(400, 'El archivo de imagen esta vacio');
  if (buffer.length > 5 * 1024 * 1024) {
    throw new AppError(400, 'La imagen es demasiado grande (maximo 5 MB)');
  }
  const mime = coincidencia[1];
  const valido =
    (mime.includes('png') && buffer[0] === 0x89 && buffer[1] === 0x50) ||
    (mime.includes('jpeg') && buffer[0] === 0xff && buffer[1] === 0xd8) ||
    (mime.includes('webp') && buffer.toString('ascii', 0, 4) === 'RIFF');
  if (!valido) throw new AppError(400, 'La imagen no es un PNG, JPG o WebP valido');
  fs.mkdirSync(path.dirname(RUTA_LOGO), { recursive: true });
  fs.writeFileSync(RUTA_LOGO, buffer);
}

export function eliminarLogo(): void {
  if (fs.existsSync(RUTA_LOGO)) fs.unlinkSync(RUTA_LOGO);
}

export async function obtenerConfiguracion(): Promise<
  { clave: string; valor: string; descripcion: string | null }[]
> {
  const { rows } = await pool.query(
    'SELECT clave, valor, descripcion FROM configuracion ORDER BY clave'
  );
  return rows;
}

export async function obtenerValor(clave: string): Promise<string | null> {
  const { rows } = await pool.query('SELECT valor FROM configuracion WHERE clave = $1', [clave]);
  return rows.length ? (rows[0].valor as string) : null;
}

export async function guardarValor(clave: string, valor: string): Promise<void> {
  await pool.query(
    `INSERT INTO configuracion (clave, valor, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now()`,
    [clave, valor]
  );
}

export async function margenActual(): Promise<number> {
  const valor = await obtenerValor('MARGEN_GANANCIA');
  const margen = valor !== null && !Number.isNaN(parseFloat(valor)) ? parseFloat(valor) : null;
  return margen ?? env.MARGEN_GANANCIA_DEFAULT;
}

export async function nombreNegocio(): Promise<string> {
  const valor = await obtenerValor('NOMBRE_NEGOCIO');
  return valor && valor.trim() ? valor : env.NOMBRE_NEGOCIO;
}

export async function niceUrlLogin(): Promise<string> {
  const valor = await obtenerValor('NICE_URL_LOGIN');
  return valor && valor.trim() ? valor : env.NICE_URL_LOGIN;
}

export async function niceCredenciales(): Promise<{ usuario: string; clave: string }> {
  const usuario = await obtenerValor('NICE_USER');
  const clave = await obtenerValor('NICE_PASS');
  return {
    usuario: usuario && usuario.trim() ? usuario : env.NICE_USER,
    clave: clave && clave.trim() ? clave : env.NICE_PASS,
  };
}

export async function recargoAbonos(): Promise<number> {
  const valor = await obtenerValor('RECARGO_ABONOS');
  const recargo = valor !== null && !Number.isNaN(parseFloat(valor)) ? parseFloat(valor) : null;
  return recargo ?? 10;
}

export async function paisWhatsApp(): Promise<string> {
  const valor = await obtenerValor('PAIS_WHATSAPP');
  if (valor && /^\d{1,3}$/.test(valor.trim())) return valor.trim();
  return '52';
}

export async function asegurarConfiguracionBase(): Promise<void> {
  const margen = await obtenerValor('MARGEN_GANANCIA');
  if (margen === null) {
    await guardarValor('MARGEN_GANANCIA', String(env.MARGEN_GANANCIA_DEFAULT));
  }
  const nombre = await obtenerValor('NOMBRE_NEGOCIO');
  if (nombre === null || !nombre.trim()) {
    await guardarValor('NOMBRE_NEGOCIO', env.NOMBRE_NEGOCIO);
  }
  const urlNice = await obtenerValor('NICE_URL_LOGIN');
  if (urlNice === null || !urlNice.trim()) {
    await guardarValor('NICE_URL_LOGIN', env.NICE_URL_LOGIN);
  }
  const usuarioNice = await obtenerValor('NICE_USER');
  if (usuarioNice === null) {
    await guardarValor('NICE_USER', env.NICE_USER);
  }
  const claveNice = await obtenerValor('NICE_PASS');
  if (claveNice === null) {
    await guardarValor('NICE_PASS', env.NICE_PASS);
  }
  const recargo = await obtenerValor('RECARGO_ABONOS');
  if (recargo === null) {
    await guardarValor('RECARGO_ABONOS', '10');
  }
  const portalUrl = await obtenerValor('PORTAL_URL');
  if (portalUrl === null) {
    await guardarValor('PORTAL_URL', '');
  }
  console.log('[config] variables del sistema listas');
}

export function calcularPrecioPublico(precioCosto: number, margen: number): number {
  return Math.round(precioCosto * (1 + margen / 100) * 100) / 100;
}