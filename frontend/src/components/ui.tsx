import { ReactNode } from 'react';
import { X, Loader2 } from 'lucide-react';

export function cn(...clases: (string | false | null | undefined)[]): string {
  return clases.filter(Boolean).join(' ');
}

export function Card({
  children,
  className = '',
  onClick,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <div className={'bg-white rounded-2xl border border-slate-200 shadow-sm ' + className} onClick={onClick}>
      {children}
    </div>
  );
}

export function Badge({ estado }: { estado: string }) {
  const liquida = estado === 'LIQUIDADO';
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold',
        liquida ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
      )}
    >
      {liquida ? 'LIQUIDADO' : 'PENDIENTE'}
    </span>
  );
}

export function Modal({
  abierto,
  onCerrar,
  titulo,
  children,
  ancho = 'max-w-lg',
}: {
  abierto: boolean;
  onCerrar: () => void;
  titulo: string;
  children: ReactNode;
  ancho?: string;
}) {
  if (!abierto) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-slate-900/60" onClick={onCerrar} />
      <div
        className={cn(
          'relative w-full bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[92vh] overflow-y-auto',
          ancho
        )}
      >
        <div className="sticky top-0 bg-white/95 backdrop-blur border-b border-slate-100 px-5 py-4 flex items-center justify-between rounded-t-3xl sm:rounded-t-2xl">
          <h3 className="font-semibold text-slate-800">{titulo}</h3>
          <button
            onClick={onCerrar}
            className="p-2 rounded-full hover:bg-slate-100 text-slate-500"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Campo({
  etiqueta,
  children,
}: {
  etiqueta: string;
  children: ReactNode;
}) {
  return (
    <label className="block mb-3">
      <span className="block text-sm font-medium text-slate-600 mb-1">{etiqueta}</span>
      {children}
    </label>
  );
}

export const inputClase =
  'w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-marca-500 focus:border-marca-500 bg-white';

export const botonPrimario =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-marca-600 hover:bg-marca-700 text-white font-semibold px-4 py-2.5 transition disabled:opacity-50 disabled:cursor-not-allowed';

export const botonSecundario =
  'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-medium px-4 py-2.5 transition disabled:opacity-50';

export function Alerta({ tipo, mensaje }: { tipo: 'error' | 'exito' | 'aviso'; mensaje: string }) {
  const estilos =
    tipo === 'error'
      ? 'bg-red-50 text-red-700 border-red-200'
      : tipo === 'aviso'
        ? 'bg-amber-50 text-amber-800 border-amber-200'
        : 'bg-emerald-50 text-emerald-700 border-emerald-200';
  return (
    <div className={cn('rounded-xl px-4 py-3 text-sm font-medium border', estilos)}>
      {mensaje}
    </div>
  );
}

export function Cargando({ texto = 'Cargando...' }: { texto?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-slate-400">
      <Loader2 className="animate-spin mb-2" size={28} />
      <span className="text-sm">{texto}</span>
    </div>
  );
}

export function Vacio({ mensaje }: { mensaje: string }) {
  return (
    <div className="py-10 text-center text-slate-400 text-sm bg-white rounded-2xl border border-dashed border-slate-200">
      {mensaje}
    </div>
  );
}

export function EncabezadoPagina({
  titulo,
  subtitulo,
  accion,
}: {
  titulo: string;
  subtitulo?: string;
  accion?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 mb-5">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-slate-800">{titulo}</h1>
        {subtitulo && <p className="text-sm text-slate-500 mt-0.5">{subtitulo}</p>}
      </div>
      {accion}
    </div>
  );
}