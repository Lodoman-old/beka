import { api, obtenerBaseUrl } from '../api/client';
import { Cliente, Producto, Viaje, Venta } from '../api/types';
import {
  AccionPendiente,
  eliminarDeCola,
  encolar,
  guardarCache,
  leerCache,
  leerCola,
  nuevoId,
} from './localDb';

export const EVENTO_COLA = 'beka-cola-actualizada';

export function notificarCola(): void {
  window.dispatchEvent(new Event(EVENTO_COLA));
}

export async function hayConexion(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return false;
  try {
    const control = new AbortController();
    const temporizador = setTimeout(() => control.abort(), 5000);
    const respuesta = await fetch(`${obtenerBaseUrl()}/api/config`, { signal: control.signal });
    clearTimeout(temporizador);
    return respuesta.ok;
  } catch {
    return false;
  }
}

async function traerTodo<T>(ruta: string): Promise<T[]> {
  const filas: T[] = [];
  let offset = 0;
  for (let intento = 0; intento < 100; intento++) {
    const resultado = await api.get<{ total: number; filas: T[] }>(
      `${ruta}${ruta.includes('?') ? '&' : '?'}limite=100&offset=${offset}`
    );
    filas.push(...resultado.filas);
    if (filas.length >= resultado.total || resultado.filas.length === 0) break;
    offset += resultado.filas.length;
  }
  return filas;
}

export async function actualizarCache(): Promise<void> {
  const [productos, clientes, ventas, viajes] = await Promise.all([
    traerTodo<Producto>('/catalogo'),
    traerTodo<Cliente>('/clientes'),
    traerTodo<Venta>('/ventas?estado=PENDIENTE'),
    traerTodo<Viaje>('/viajes?estado=PENDIENTE'),
  ]);
  await Promise.all([
    guardarCache('productos', productos),
    guardarCache('clientes', clientes),
    guardarCache('ventas_pendientes', ventas),
    guardarCache('viajes_pendientes', viajes),
    guardarCache('ultima_sync', new Date().toISOString()),
  ]);
}

export async function cacheProductos(): Promise<Producto[]> {
  return (await leerCache<Producto[]>('productos')) ?? [];
}

export async function cacheClientes(): Promise<Cliente[]> {
  return (await leerCache<Cliente[]>('clientes')) ?? [];
}

export async function cachePendientesVentas(): Promise<Venta[]> {
  return (await leerCache<Venta[]>('ventas_pendientes')) ?? [];
}

export async function cachePendientesViajes(): Promise<Viaje[]> {
  return (await leerCache<Viaje[]>('viajes_pendientes')) ?? [];
}

export async function ultimaSincronizacionLocal(): Promise<string | null> {
  return (await leerCache<string>('ultima_sync')) ?? null;
}

async function encolarAccion(
  tipo: AccionPendiente['tipo'],
  datos: Record<string, unknown>,
  descripcion: string,
  cliente_ref_local: string | null = null
): Promise<AccionPendiente> {
  const accion: AccionPendiente = {
    id: nuevoId(),
    tipo,
    creado_en: new Date().toISOString(),
    descripcion,
    datos,
    cliente_ref_local,
  };
  await encolar(accion);
  notificarCola();
  return accion;
}

export function encolarClienteLocal(nombre: string, telefono: string | null): Promise<AccionPendiente> {
  return encolarAccion('CLIENTE', { nombre, telefono }, `Cliente nuevo: ${nombre}`);
}

export function encolarVentaLocal(opts: {
  items: { producto_id: number; cantidad: number }[];
  aCredito: boolean;
  clienteId?: number;
  clienteRef?: string | null;
}): Promise<AccionPendiente> {
  const articulos = opts.items.reduce((total, i) => total + i.cantidad, 0);
  return encolarAccion(
    'VENTA',
    {
      items: opts.items,
      a_credito: opts.aCredito,
      cliente_id: opts.clienteId ?? undefined,
    },
    `Venta de ${articulos} artículo(s)`,
    opts.clienteRef ?? null
  );
}

export function encolarAbonoLocal(opts: {
  ventaId?: number;
  viajeId?: number;
  monto: number;
  metodo: string;
}): Promise<AccionPendiente> {
  return encolarAccion(
    'ABONO',
    { venta_id: opts.ventaId, viaje_id: opts.viajeId, monto: opts.monto, metodo: opts.metodo },
    `Abono de $${opts.monto.toFixed(2)}`
  );
}

export async function sincronizarCola(): Promise<{
  sincronizadas: number;
  pendientes: number;
}> {
  const cola = await leerCola();
  let sincronizadas = 0;
  const clienteReal: Record<string, number> = {};

  for (const accion of cola) {
    try {
      if (accion.tipo === 'CLIENTE') {
        const creado = await api.post<{ id: number }>('/clientes', accion.datos);
        clienteReal[accion.id] = creado.id;
      } else if (accion.tipo === 'VENTA') {
        const datos = accion.datos as {
          cliente_id?: number;
          items: { producto_id: number; cantidad: number }[];
          a_credito?: boolean;
        };
        const clienteId =
          datos.cliente_id ??
          (accion.cliente_ref_local ? clienteReal[accion.cliente_ref_local] : undefined);
        if (!clienteId) throw new Error('El cliente pendiente aun no se resolvio');
        await api.post('/ventas', {
          cliente_id: clienteId,
          items: datos.items,
          a_credito: Boolean(datos.a_credito),
          registrado_por: 'OFFLINE',
        });
      } else {
        const datos = accion.datos as {
          venta_id?: number;
          viaje_id?: number;
          monto: number;
          metodo: string;
        };
        await api.post('/abonos', {
          venta_id: datos.venta_id,
          viaje_id: datos.viaje_id,
          monto: datos.monto,
          metodo: datos.metodo,
          observacion: 'Registrado sin conexion',
          registrado_por: 'OFFLINE',
        });
      }
      await eliminarDeCola(accion.id);
      sincronizadas += 1;
    } catch {
      if (!(await hayConexion())) break;
    }
  }

  notificarCola();
  return { sincronizadas, pendientes: (await leerCola()).length };
}