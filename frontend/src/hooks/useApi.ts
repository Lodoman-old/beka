import { useCallback, useEffect, useState } from 'react';

export function useApi<T>(cargar: () => Promise<T>, dependencias: unknown[] = []) {
  const [datos, setDatos] = useState<T | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(() => {
    setCargando(true);
    setError(null);
    return cargar()
      .then(setDatos)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Error de conexión con el servidor'))
      .finally(() => setCargando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencias);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  return { datos, cargando, error, recargar };
}

export function useAccion() {
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ejecutar = useCallback(async (fn: () => Promise<unknown>) => {
    setOcupado(true);
    setError(null);
    try {
      await fn();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error inesperado');
      return false;
    } finally {
      setOcupado(false);
    }
  }, []);

  return { ocupado, error, setError, ejecutar };
}