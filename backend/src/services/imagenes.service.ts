import { v2 as cloudinary } from 'cloudinary';
import * as fs from 'fs';
import * as path from 'path';
import { AppError } from '../utils/http';
import { DIR_DATOS, obtenerValor } from './sistema.service';

export interface ConfigCloudinary {
  cloud: string | null;
  key: string | null;
  secret: string | null;
  carpeta: string;
}

export function cloudinaryConfigurado(cfg: ConfigCloudinary): boolean {
  return Boolean(cfg.cloud && cfg.key && cfg.secret);
}

export async function obtenerConfigCloudinary(): Promise<ConfigCloudinary> {
  const [cloud, key, secret, carpeta] = await Promise.all([
    obtenerValor('CLOUDINARY_CLOUD'),
    obtenerValor('CLOUDINARY_KEY'),
    obtenerValor('CLOUDINARY_SECRET'),
    obtenerValor('CLOUDINARY_FOLDER'),
  ]);
  return { cloud, key, secret, carpeta: carpeta || 'beka' };
}

function validarDataUrl(datos: string): { mime: string; base64: string } {
  const coincide = /^data:([a-z]+\/[a-z0-9.+-]+);base64,(.+)$/s.exec(datos);
  if (!coincide) throw new AppError(400, 'La imagen debe venir en formato data URL');
  const soloBase64 = coincide[2].length;
  if (soloBase64 > 8 * 1024 * 1024) throw new AppError(400, 'La imagen pesa mas de 8 MB');
  return { mime: coincide[1], base64: coincide[2] };
}

export async function subirImagen(dataUrl: string): Promise<string> {
  const { mime } = validarDataUrl(dataUrl);
  const tipo = mime.startsWith('image/')
    ? mime.replace('image/', '')
    : 'jpg';
  const cfg = await obtenerConfigCloudinary();
  if (cloudinaryConfigurado(cfg)) {
    cloudinary.config({
      cloud_name: cfg.cloud as string,
      api_key: cfg.key as string,
      api_secret: cfg.secret as string,
    });
    const resultado = await cloudinary.uploader.upload(dataUrl, {
      folder: cfg.carpeta,
      format: 'jpg',
      transformation: [{ width: 1200, crop: 'limit', quality: 'auto' }],
    });
    return resultado.secure_url;
  }
  const dir = path.join(DIR_DATOS, 'imagenes');
  fs.mkdirSync(dir, { recursive: true });
  const nombre = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${tipo === 'jpeg' ? 'jpg' : tipo}`;
  fs.writeFileSync(path.join(dir, nombre), Buffer.from(dataUrl.split(',')[1], 'base64'));
  return `/api/img/${nombre}`;
}

export async function subirLogo(dataUrl: string): Promise<string | null> {
  const { mime } = validarDataUrl(dataUrl);
  const tipo = mime.startsWith('image/') ? mime.replace('image/', '') : 'png';
  const cfg = await obtenerConfigCloudinary();
  if (!cloudinaryConfigurado(cfg)) return null;
  cloudinary.config({
    cloud_name: cfg.cloud as string,
    api_key: cfg.key as string,
    api_secret: cfg.secret as string,
  });
  const resultado = await cloudinary.uploader.upload(dataUrl, {
    folder: `${cfg.carpeta}/logo`,
    format: 'png',
    transformation: [{ width: 512, height: 512, crop: 'limit', quality: 'auto' }],
  });
  return resultado.secure_url;
}

export function rutaArchivoImagen(nombre: string): string | null {
  const dir = path.join(DIR_DATOS, 'imagenes');
  if (!/^[A-Za-z0-9._-]+$/.test(nombre)) return null;
  const ruta = path.join(dir, nombre);
  return fs.existsSync(ruta) ? ruta : null;
}

export function archivosImagenesDir(): string {
  return path.join(DIR_DATOS, 'imagenes');
}