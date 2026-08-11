const NOMBRE_DB = 'beka-offline';
const VERSION_DB = 1;
const ALMACEN_CACHE = 'cache';
const ALMACEN_COLA = 'cola';

export interface AccionPendiente {
  id: string;
  tipo: 'CLIENTE' | 'VENTA' | 'ABONO';
  creado_en: string;
  descripcion: string;
  datos: Record<string, unknown>;
  cliente_ref_local: string | null;
}

function abrirBase(): Promise<IDBDatabase> {
  return new Promise((resolver, rechazar) => {
    const peticion = indexedDB.open(NOMBRE_DB, VERSION_DB);
    peticion.onupgradeneeded = () => {
      const base = peticion.result;
      if (!base.objectStoreNames.contains(ALMACEN_CACHE)) {
        base.createObjectStore(ALMACEN_CACHE);
      }
      if (!base.objectStoreNames.contains(ALMACEN_COLA)) {
        base.createObjectStore(ALMACEN_COLA, { keyPath: 'id' });
      }
    };
    peticion.onsuccess = () => resolver(peticion.result);
    peticion.onerror = () => rechazar(peticion.error);
  });
}

function operar<T>(
  almacen: string,
  accion: (store: IDBObjectStore) => IDBRequest
): Promise<T> {
  return abrirBase().then(
    (base) =>
      new Promise<T>((resolver, rechazar) => {
        const transaccion = base.transaction(almacen, 'readwrite');
        transaccion.oncomplete = () => base.close();
        transaccion.onerror = () => {
          base.close();
          rechazar(transaccion.error);
        };
        const peticion = accion(transaccion.objectStore(almacen));
        peticion.onsuccess = () => resolver(peticion.result as T);
        peticion.onerror = () => rechazar(peticion.error);
      })
  );
}

export function nuevoId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function guardarCache(clave: string, valor: unknown): Promise<void> {
  await operar(ALMACEN_CACHE, (store) => store.put(valor, clave));
}

export async function leerCache<T>(clave: string): Promise<T | null> {
  return operar<T | null>(ALMACEN_CACHE, (store) => store.get(clave));
}

export async function encolar(accion: AccionPendiente): Promise<void> {
  await operar(ALMACEN_COLA, (store) => store.add(accion));
}

export async function leerCola(): Promise<AccionPendiente[]> {
  return operar<AccionPendiente[]>(ALMACEN_COLA, (store) => store.getAll());
}

export async function eliminarDeCola(id: string): Promise<void> {
  await operar(ALMACEN_COLA, (store) => store.delete(id));
}

export async function contarCola(): Promise<number> {
  return (await leerCola()).length;
}