import { ReactNode, createContext, useCallback, useContext, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { botonPrimario, botonSecundario } from './ui';

export interface OpcionesConfirmar {
  titulo?: string;
  confirmarTexto?: string;
  cancelarTexto?: string;
  peligro?: boolean;
}

type ConfirmarFn = (mensaje: string, opciones?: OpcionesConfirmar) => Promise<boolean>;

const ContextoConfirmar = createContext<ConfirmarFn>(async () => false);

export function ConfirmarProvider({ children }: { children: ReactNode }) {
  const [caja, setCaja] = useState<{
    mensaje: string;
    opciones: OpcionesConfirmar;
    resolver: (ok: boolean) => void;
  } | null>(null);

  const confirmar = useCallback<ConfirmarFn>((mensaje, opciones = {}) => {
    return new Promise<boolean>((resolver) => setCaja({ mensaje, opciones, resolver }));
  }, []);

  const cerrar = (ok: boolean) => {
    caja?.resolver(ok);
    setCaja(null);
  };

  return (
    <ContextoConfirmar.Provider value={confirmar}>
      {children}
      {caja && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60" onClick={() => cerrar(false)} />
          <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6">
            <div className="flex items-start gap-3">
              <span
                className={`p-2.5 rounded-xl shrink-0 ${
                  caja.opciones.peligro
                    ? 'bg-red-50 text-red-500'
                    : 'bg-amber-50 text-amber-500'
                }`}
              >
                <AlertTriangle size={22} />
              </span>
              <div className="min-w-0">
                {caja.opciones.titulo && (
                  <h3 className="font-bold text-slate-800 mb-1">{caja.opciones.titulo}</h3>
                )}
                <p className="text-sm text-slate-500 whitespace-pre-line">{caja.mensaje}</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => cerrar(false)}
                className={botonSecundario + ' !py-2'}
                autoFocus
              >
                {caja.opciones.cancelarTexto ?? 'Cancelar'}
              </button>
              <button
                onClick={() => cerrar(true)}
                className={`${
                  caja.opciones.peligro ? '!bg-red-600 hover:!bg-red-700' : ''
                } ${botonPrimario} !py-2`}
              >
                {caja.opciones.confirmarTexto ?? 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ContextoConfirmar.Provider>
  );
}

export function useConfirmar(): ConfirmarFn {
  return useContext(ContextoConfirmar);
}