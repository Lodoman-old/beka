import { useEffect, useState } from 'react';
import { CloudOff, Inbox, RefreshCw, Trash2, Wifi, WifiOff } from 'lucide-react';
import { AccionPendiente, eliminarDeCola, leerCola } from '../lib/localDb';
import {
  EVENTO_COLA,
  hayConexion,
  sincronizarCola,
  ultimaSincronizacionLocal,
} from '../lib/sincronizador';
import {
  Card,
  EncabezadoPagina,
  Alerta,
  botonPrimario,
} from '../components/ui';
import { fechaHora } from '../lib/format';
import { useConfirmar } from '../components/Confirmar';

const etiquetasTipo: Record<AccionPendiente['tipo'], string> = {
  CLIENTE: 'Cliente nuevo',
  VENTA: 'Venta',
  ABONO: 'Abono',
};

export default function Offline() {
  const confirmar = useConfirmar();
  const [enLinea, setEnLinea] = useState(navigator.onLine);
  const [cola, setCola] = useState<AccionPendiente[]>([]);
  const [sincronizando, setSincronizando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [ultimaSync, setUltimaSync] = useState<string | null>(null);

  const recargarCola = () => {
    void leerCola().then(setCola);
    void ultimaSincronizacionLocal().then(setUltimaSync);
  };

  const comprobarRed = () => {
    void hayConexion().then((ok) => setEnLinea(ok));
  };

  useEffect(() => {
    recargarCola();
    comprobarRed();
    const alVolver = () => {
      setEnLinea(true);
      void sincronizarCola().then(() => recargarCola());
    };
    const alIrse = () => setEnLinea(false);
    const alCambiarCola = () => recargarCola();
    window.addEventListener('online', alVolver);
    window.addEventListener('offline', alIrse);
    window.addEventListener(EVENTO_COLA, alCambiarCola);
    return () => {
      window.removeEventListener('online', alVolver);
      window.removeEventListener('offline', alIrse);
      window.removeEventListener(EVENTO_COLA, alCambiarCola);
    };
  }, []);

  const sincronizar = async () => {
    setSincronizando(true);
    setMensaje(null);
    const resultado = await sincronizarCola();
    setSincronizando(false);
    if (resultado.sincronizadas > 0) {
      setMensaje(
        `${resultado.sincronizadas} registro(s) enviado(s) al servidor${resultado.pendientes > 0 ? `; quedan ${resultado.pendientes} pendientes` : ''}`
      );
    } else if (resultado.pendientes > 0) {
      setMensaje('No se pudo sincronizar: verifica la conexión e intenta otra vez');
    } else {
      setMensaje('No hay nada pendiente por sincronizar');
    }
    recargarCola();
    comprobarRed();
  };

  const quitar = (id: string) => {
    void eliminarDeCola(id).then(recargarCola);
  };

  return (
    <div className="max-w-2xl">
      <EncabezadoPagina
        titulo="Modo sin conexión"
        subtitulo="Registros guardados en el teléfono mientras no hay Internet"
      />

      <Card className="p-5 mb-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {enLinea ? (
              <Wifi size={22} className="text-emerald-600" />
            ) : (
              <WifiOff size={22} className="text-red-500" />
            )}
            <div>
              <p className="font-semibold text-slate-800">
                {enLinea ? 'Con conexión' : 'Sin conexión'}
              </p>
              <p className="text-sm text-slate-500">
                {ultimaSync
                  ? `Catálogo y pendientes guardados: ${fechaHora(ultimaSync)}`
                  : 'Aún no se ha guardado una copia local'}
              </p>
            </div>
          </div>
          {enLinea && (
            <button onClick={() => void sincronizar()} disabled={sincronizando} className={botonPrimario}>
              <RefreshCw size={16} className={sincronizando ? 'animate-spin' : ''} />
              {sincronizando ? 'Sincronizando…' : 'Sincronizar ahora'}
            </button>
          )}
        </div>
      </Card>

      {mensaje && <div className="mb-4"><Alerta tipo="exito" mensaje={mensaje} /></div>}

      {!enLinea && cola.length > 0 && (
        <div className="mb-4">
          <Alerta
            tipo="aviso"
            mensaje={`${cola.length} registro(s) esperando conexión. En cuanto vuelva el Internet se envían solos al servidor.`}
          />
        </div>
      )}

      <Card className="p-5 mb-4">
        <h2 className="font-semibold text-slate-800 mb-1 flex items-center gap-2">
          <Inbox size={18} className="text-marca-600" /> Pendientes de sincronizar
          {cola.length > 0 && (
            <span className="rounded-full bg-marca-600 text-white text-xs font-bold px-2 py-0.5">
              {cola.length}
            </span>
          )}
        </h2>
        <p className="text-sm text-slate-500 mb-4">
          Cuando registras una venta o un abono sin Internet, se guarda aquí (en el teléfono).
          Al volver la conexión se envía automáticamente al servidor, en el mismo orden.
        </p>

        {cola.length === 0 ? (
          <div className="text-center py-8 text-slate-400">
            <CloudOff size={40} className="mx-auto mb-2 opacity-60" />
            <p className="text-sm">No hay registros pendientes</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {cola.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-marca-50 text-marca-700 text-[10px] font-bold px-2 py-0.5">
                      {etiquetasTipo[a.tipo]}
                    </span>
                    <p className="font-medium text-slate-700 text-sm truncate">{a.descripcion}</p>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {fechaHora(a.creado_en)}
                    {a.tipo === 'VENTA' && a.cliente_ref_local && ' · cliente nuevo por crear'}
                  </p>
                </div>
                <button
                  onClick={() => {
                    void confirmar(
                      '¿Eliminar este registro pendiente?\nNo se enviará al servidor.',
                      {
                        titulo: 'Eliminar registro pendiente',
                        confirmarTexto: 'Eliminar',
                        peligro: true,
                      }
                    ).then((ok) => ok && quitar(a.id));
                  }}
                  className="p-2 text-slate-400 hover:text-red-500 shrink-0"
                  title="Eliminar registro pendiente"
                >
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-5">
        <p className="text-sm text-slate-500">
          La copia local (catálogo, clientes y cuentas pendientes) se actualiza cada vez que el
          sistema detecta conexión al abrir la app. Así puedes vender y cobrar aunque el teléfono
          no tenga Internet. Si pierdes el teléfono, los registros pendientes también se pierden;
          los ya sincronizados quedan seguros en el servidor.
        </p>
      </Card>
    </div>
  );
}