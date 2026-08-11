import dotenv from 'dotenv';

dotenv.config();

function flotante(valor: string | undefined, defecto: number): number {
  const n = parseFloat(valor || '');
  return Number.isFinite(n) ? n : defecto;
}

export const env = {
  PORT: flotante(process.env.PORT, 4000),
  DATABASE_URL:
    process.env.DATABASE_URL ||
    'postgres://postgres:postgres@localhost:5432/beka',
  MARGEN_GANANCIA_DEFAULT: flotante(process.env.MARGEN_GANANCIA, 30),
  NOMBRE_NEGOCIO: process.env.NOMBRE_NEGOCIO || 'BEKA',

  NICE_USER: process.env.NICE_USER || '',
  NICE_PASS: process.env.NICE_PASS || '',
  NICE_URL_LOGIN: process.env.NICE_URL_LOGIN || '',
  NICE_HEADLESS: process.env.NICE_HEADLESS !== 'false',
  NICE_TIMEOUT_MS: flotante(process.env.NICE_TIMEOUT_MS, 45000),
  NICE_PAGINAS_MAX: flotante(process.env.NICE_PAGINAS_MAX, 300),
  NICE_SEL_USUARIO: process.env.NICE_SEL_USUARIO || 'input[type=text]',
  NICE_SEL_CLAVE: process.env.NICE_SEL_CLAVE || 'input[type=password]',
  NICE_SEL_BTN_LOGIN: process.env.NICE_SEL_BTN_LOGIN || 'button[type=submit]',
  NICE_SEL_ENLACE_CATALOGO: process.env.NICE_SEL_ENLACE_CATALOGO || 'a[href*=catalogo]',
  NICE_SEL_FILA: process.env.NICE_SEL_FILA || 'table tbody tr',
  NICE_SEL_SKU: process.env.NICE_SEL_SKU || 'td:nth-child(1)',
  NICE_SEL_NOMBRE: process.env.NICE_SEL_NOMBRE || 'td:nth-child(2)',
  NICE_SEL_PRECIO: process.env.NICE_SEL_PRECIO || 'td:nth-child(3)',
  NICE_SEL_IMAGEN: process.env.NICE_SEL_IMAGEN || 'img',

  WHATSAPP_ENABLED: process.env.WHATSAPP_ENABLED !== 'false',
  WHATSAPP_SESION_DIR: process.env.WHATSAPP_SESION_DIR || './data/whatsapp',
  CHROME_EXECUTABLE: process.env.CHROME_EXECUTABLE || undefined,
  FRONTEND_DIST: process.env.FRONTEND_DIST || 'public',
};

export function margenPorDefecto(): number {
  return env.MARGEN_GANANCIA_DEFAULT;
}