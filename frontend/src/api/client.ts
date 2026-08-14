import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';

export const BASE =
  (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_URL ?? '';

const LOCAL_STORAGE_TOKEN = 'beka_token_admin';
const LOCAL_STORAGE_SERVER = 'beka_api_url';

export function obtenerBaseUrl(): string {
  const guardada = localStorage.getItem(LOCAL_STORAGE_SERVER);
  if (guardada) return guardada;
  if (Capacitor.isNativePlatform()) return BASE;
  if (
    typeof window !== 'undefined' &&
    window.location?.origin &&
    window.location.origin !== 'http://localhost'
  ) {
    return window.location.origin;
  }
  return BASE;
}

export function guardarUrlServidor(url: string): void {
  localStorage.setItem(LOCAL_STORAGE_SERVER, url.replace(/\/+$/, ''));
}

export function guardarToken(token: string): void {
  localStorage.setItem(LOCAL_STORAGE_TOKEN, token);
}

export function obtenerToken(): string | null {
  return localStorage.getItem(LOCAL_STORAGE_TOKEN);
}

export function cerrarSesion(): void {
  localStorage.removeItem(LOCAL_STORAGE_TOKEN);
  if (Capacitor.isNativePlatform()) {
    window.location.reload();
    return;
  }
  window.location.href = `${obtenerBaseUrl()}/login`;
}

export function haySesionAdmin(): boolean {
  return Boolean(localStorage.getItem(LOCAL_STORAGE_TOKEN));
}

interface Peticion {
  metodo: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  cuerpo?: unknown;
  token?: string | null;
}

async function peticion<T>({ metodo, path, cuerpo, token }: Peticion): Promise<T> {
  const respuesta = await fetch(`${obtenerBaseUrl()}/api${path}`, {
    method: metodo,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
  });

  if (!respuesta.ok) {
    if (
      respuesta.status === 401 &&
      !path.startsWith('/auth/login') &&
      !path.startsWith('/portal/login')
    ) {
      localStorage.removeItem(LOCAL_STORAGE_TOKEN);
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = `${obtenerBaseUrl()}/login`;
      }
    }
    const cuerpoError = await respuesta.json().catch(() => ({}));
    throw new Error(
      (cuerpoError as { error?: string }).error ?? `Error ${respuesta.status} del servidor`
    );
  }
  return (await respuesta.json()) as T;
}

function autenticada<T>(p: Omit<Peticion, 'token'>): Promise<T> {
  return peticion<T>({ ...p, token: obtenerToken() });
}

export const api = {
  get: <T>(path: string) => autenticada<T>({ metodo: 'GET', path }),
  post: <T>(path: string, cuerpo?: unknown) => autenticada<T>({ metodo: 'POST', path, cuerpo }),
  put: <T>(path: string, cuerpo?: unknown) => autenticada<T>({ metodo: 'PUT', path, cuerpo }),
  del: <T>(path: string) => autenticada<T>({ metodo: 'DELETE', path }),
  publica: {
    post: <T>(path: string, cuerpo?: unknown) => peticion<T>({ metodo: 'POST', path, cuerpo }),
  },
};

export async function descargarComprobante(ruta: string, _nombreArchivo: string): Promise<void> {
  const url = `${obtenerBaseUrl()}/api${ruta}?token=${encodeURIComponent(obtenerToken() ?? '')}`;
  if (Capacitor.isNativePlatform()) {
    await Browser.open({ url });
    return;
  }
  window.open(url, '_blank', 'noopener');
}

export function q(objeto: Record<string, string | number | undefined | null>): string {
  const partes = Object.entries(objeto)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return partes.length ? `?${partes.join('&')}` : '';
}