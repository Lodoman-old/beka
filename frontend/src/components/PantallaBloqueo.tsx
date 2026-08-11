import { Fingerprint, ShieldCheck } from 'lucide-react';

export default function PantallaBloqueo({
  cargando,
  error,
  enProgreso,
  onHuella,
  onContrasena,
}: {
  cargando: boolean;
  error: string;
  enProgreso?: boolean;
  onHuella: () => void;
  onContrasena: () => void;
}) {
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-4">
      <div className="text-center mb-8">
        <div className="w-20 h-20 mx-auto rounded-3xl bg-marca-600/20 flex items-center justify-center mb-4">
          <Fingerprint size={44} className="text-marca-400" />
        </div>
        <span className="text-3xl font-black text-white tracking-tight">
          BEKA<span className="text-marca-500">.</span>
        </span>
        <p className="text-slate-400 text-sm mt-2">Desbloquea con tu huella</p>
      </div>
      {!enProgreso && (
        <>
          <button
            onClick={onHuella}
            disabled={cargando}
            className="w-full max-w-xs flex items-center justify-center gap-2 bg-white hover:bg-slate-200 text-slate-900 font-bold py-4 rounded-2xl transition disabled:opacity-60"
          >
            <ShieldCheck size={20} />
            {cargando ? 'Verificando...' : 'Entrar con huella'}
          </button>
          <button
            onClick={onContrasena}
            className="mt-4 text-sm text-slate-500 hover:text-slate-300"
          >
            Usar usuario y contraseña
          </button>
        </>
      )}
      {error && <p className="mt-4 text-red-400 text-sm">{error}</p>}
    </div>
  );
}
