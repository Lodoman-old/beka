import { FormEvent, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import {
  Percent,
  MessageCircle,
  RefreshCw,
  Shield,
  Database,
  Clock,
  Globe,
  CreditCard,
  Image as ImageIcon,
  Trash2,
  KeyRound,
  Link2,
  Server,
  CheckCircle2,
  XCircle,
  Loader2,
  Cloud,
} from 'lucide-react';
import { api, guardarUrlServidor, obtenerBaseUrl } from '../api/client';
import { ValorConfig, EstadoWhatsApp } from '../api/types';
import { useApi, useAccion } from '../hooks/useApi';
import {
  Card,
  Campo,
  inputClase,
  botonPrimario,
  botonSecundario,
  Cargando,
  Alerta,
  EncabezadoPagina,
} from '../components/ui';
import { fechaHora } from '../lib/format';

interface SyncEstado {
  estado: 'nunca' | 'iniciando' | 'ejecutando' | 'ok' | 'error';
  fase?: 'tienda' | 'extrayendo' | 'guardando';
  rondas?: number;
  productos?: number;
  paginas?: number;
  porcentaje?: number | null;
  nuevos?: number;
  solo_precio?: number;
  cambios?: number;
  sin_cambios?: number;
  desactivados?: number;
  resumen?: {
    insertados: number;
    actualizados: number;
    con_error: number;
    nuevos: number;
    solo_precio: number;
    cambios: number;
    sin_cambios: number;
    desactivados: number;
  };
  mensaje?: string;
  actualizado?: string;
}

export default function Configuracion() {
  const config = useApi<ValorConfig[]>(() => api.get('/config'), []);
  const whatsapp = useApi<EstadoWhatsApp>(() => api.get('/config/whatsapp'), []);
  const accion = useAccion();
  const [margen, setMargen] = useState('');
  const [nombreNegocio, setNombreNegocio] = useState('');
  const [urlNice, setUrlNice] = useState('');
  const [recargo, setRecargo] = useState('');
  const [usuarioNice, setUsuarioNice] = useState('');
  const [passNice, setPassNice] = useState('');
  const [urlPortal, setUrlPortal] = useState('');
  const [passActual, setPassActual] = useState('');
  const [passNueva, setPassNueva] = useState('');
  const [claveCambiada, setClaveCambiada] = useState(false);
  const [planificado, setPlanificado] = useState(false);
  const [logoVersion, setLogoVersion] = useState(0);
  const [logoExiste, setLogoExiste] = useState<boolean | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [urlServidor, setUrlServidor] = useState('');
  const [syncModal, setSyncModal] = useState(false);
  const [syncInfo, setSyncInfo] = useState<SyncEstado | null>(null);
  const [cloudCloud, setCloudCloud] = useState('');
  const [cloudKey, setCloudKey] = useState('');
  const [cloudSecret, setCloudSecret] = useState('');
  const [cloudCarpeta, setCloudCarpeta] = useState('');
  const [cloudGuardado, setCloudGuardado] = useState(false);

  const guardarCloudinary = (e: FormEvent) => {
    e.preventDefault();
    void accion.ejecutar(async () => {
      for (const [clave, valor] of [
        ['CLOUDINARY_CLOUD', cloudCloud],
        ['CLOUDINARY_KEY', cloudKey],
        ['CLOUDINARY_SECRET', cloudSecret],
        ['CLOUDINARY_FOLDER', cloudCarpeta],
      ] as const) {
        if (valor.trim()) await api.put('/config', { clave, valor: valor.trim() });
      }
      await config.recargar();
      setCloudGuardado(true);
      setTimeout(() => setCloudGuardado(false), 5000);
      setCloudCloud('');
      setCloudKey('');
      setCloudSecret('');
      setCloudCarpeta('');
    });
  };

  const faseTexto =
    syncInfo?.estado === 'iniciando'
      ? 'Iniciando…'
      : syncInfo?.fase === 'tienda'
        ? 'Abriendo la tienda NICE…'
        : syncInfo?.fase === 'extrayendo'
          ? 'Extrayendo productos…'
          : syncInfo?.fase === 'guardando'
            ? 'Guardando en el catálogo…'
            : 'Trabajando…';

  const esMovil = Capacitor.isNativePlatform();

  const valorDe = (clave: string): string =>
    config.datos?.find((c) => c.clave === clave)?.valor ?? '';
  const cloudCloudActual = valorDe('CLOUDINARY_CLOUD');
  const cloudKeyActual = valorDe('CLOUDINARY_KEY');
  const cloudCarpetaActual = valorDe('CLOUDINARY_FOLDER') || 'beka';
  const cloudConfigurado = Boolean(cloudCloudActual && cloudKeyActual);
  const margenActual = valorDe('MARGEN_GANANCIA');
  const nombreActual = valorDe('NOMBRE_NEGOCIO');
  const urlNiceActual = valorDe('NICE_URL_LOGIN');
  const recargoActual = valorDe('RECARGO_ABONOS') || '10';
  const usuarioNiceActual = valorDe('NICE_USER');
  const passNiceActual = valorDe('NICE_PASS');
  const urlPortalActual = valorDe('PORTAL_URL');
  const ultimaSync = valorDe('ULTIMA_SINCRONIZACION_NICE');

  const estado = whatsapp.datos?.estado ?? 'INICIANDO';
  const etiquetaEstado: Record<string, string> = {
    CONECTADO: 'Conectado',
    ESPERANDO_QR: 'Esperando escaneo QR (terminal del VPS)',
    ERROR: 'Error',
    INICIANDO: 'Iniciando…',
    DESACTIVADO: 'Desactivado',
  };

  const guardarMargen = (e: FormEvent) => {
    e.preventDefault();
    void accion.ejecutar(async () => {
      await api.put('/config', { clave: 'MARGEN_GANANCIA', valor: String(Number(margen)) });
      await config.recargar();
      setMargen('');
    });
  };

  const guardarNombre = (e: FormEvent) => {
    e.preventDefault();
    void accion.ejecutar(async () => {
      await api.put('/config', { clave: 'NOMBRE_NEGOCIO', valor: nombreNegocio });
      await config.recargar();
      setNombreNegocio('');
    });
  };

  const guardarUrlNice = (e: FormEvent) => {
    e.preventDefault();
    void accion.ejecutar(async () => {
      await api.put('/config', { clave: 'NICE_URL_LOGIN', valor: urlNice.trim() });
      await config.recargar();
      setUrlNice('');
    });
  };

  const guardarRecargo = (e: FormEvent) => {
    e.preventDefault();
    void accion.ejecutar(async () => {
      await api.put('/config', { clave: 'RECARGO_ABONOS', valor: String(Number(recargo)) });
      await config.recargar();
      setRecargo('');
    });
  };

  const guardarCredenciales = (e: FormEvent) => {
    e.preventDefault();
    void accion.ejecutar(async () => {
      if (usuarioNice.trim()) {
        await api.put('/config', { clave: 'NICE_USER', valor: usuarioNice.trim() });
      }
      if (passNice) {
        await api.put('/config', { clave: 'NICE_PASS', valor: passNice });
      }
      await config.recargar();
      setUsuarioNice('');
      setPassNice('');
    });
  };

  const guardarUrlPortal = (e: FormEvent) => {
    e.preventDefault();
    void accion.ejecutar(async () => {
      await api.put('/config', { clave: 'PORTAL_URL', valor: urlPortal.trim().replace(/\/+$/, '') });
      await config.recargar();
      setUrlPortal('');
    });
  };

  const cambiarPass = (e: FormEvent) => {
    e.preventDefault();
    setClaveCambiada(false);
    void accion.ejecutar(async () => {
      await api.put('/auth/cambiar-pass', {
        passwordActual: passActual,
        passwordNueva: passNueva,
      });
      setPassActual('');
      setPassNueva('');
      setClaveCambiada(true);
      setTimeout(() => setClaveCambiada(false), 5000);
    });
  };

  const recalcular = () => {
    void accion.ejecutar(async () => {
      await api.post('/catalogo/recalcular-precios');
      await config.recargar();
      setPlanificado(true);
      setTimeout(() => setPlanificado(false), 5000);
    });
  };

  const esperarSync = (intentos: number) => {
    setTimeout(() => {
      void api
        .get<SyncEstado>('/config/scrape-estado')
        .then((e) => {
          setSyncInfo(e);
          if (e.estado === 'ok' || e.estado === 'error') {
            void config.recargar();
            return;
          }
          if (intentos < 150) esperarSync(intentos + 1);
          else
            setSyncInfo({
              estado: 'error',
              mensaje: 'Tardó demasiado; revisa los logs del servidor.',
            });
        })
        .catch(() => {
          if (intentos < 150) esperarSync(intentos + 1);
        });
    }, 4000);
  };

  const sincronizar = () => {
    setSyncModal(true);
    setSyncInfo({ estado: 'iniciando' });
    void accion
      .ejecutar(async () => {
        await api.post('/config/scrape');
        esperarSync(0);
      })
      .catch(() => {
        setSyncInfo({
          estado: 'error',
          mensaje: accion.error ?? 'No se pudo iniciar la sincronización',
        });
      });
  };

  const comprobarLogo = () => {
    void fetch(`${obtenerBaseUrl()}/api/config/logo`, { method: 'GET' })
      .then((r) => setLogoExiste(r.ok))
      .catch(() => setLogoExiste(false));
  };

  const subirLogo = (archivo: File | undefined) => {
    if (!archivo) return;
    setLogoError(null);
    if (archivo.size > 5 * 1024 * 1024) {
      setLogoError('La imagen pesa más de 5 MB. Usa una más ligera.');
      return;
    }
    const lector = new FileReader();
    lector.onload = () => {
      void accion.ejecutar(async () => {
        await api.put('/config/logo', { imagen: String(lector.result) });
        setLogoVersion((v) => v + 1);
      });
    };
    lector.onerror = () => setLogoError('No se pudo leer el archivo');
    lector.readAsDataURL(archivo);
  };

  const quitarLogo = () => {
    if (!confirm('¿Quitar el logo del negocio?')) return;
    void accion.ejecutar(async () => {
      await api.del('/config/logo');
      setLogoExiste(false);
    });
  };

  const cambiarServidor = (e: FormEvent) => {
    e.preventDefault();
    if (!urlServidor.trim()) return;
    guardarUrlServidor(urlServidor);
    window.location.href = `${urlServidor.trim().replace(/\/+$/, '')}/login`;
  };

  if (config.cargando) return <Cargando />;

  if (logoExiste === null) comprobarLogo();

  return (
    <div className="max-w-3xl">
      <EncabezadoPagina
        titulo="Configuración del sistema"
        subtitulo="Variables, sincronización y notificaciones"
      />

      {accion.error && <div className="mb-4"><Alerta tipo="error" mensaje={accion.error} /></div>}
      {planificado && (
        <div className="mb-4">
          <Alerta tipo="exito" mensaje="Precios del catálogo recalculados con el margen nuevo" />
        </div>
      )}

      {esMovil && (
        <Card className="p-5 mb-4">
          <h2 className="font-semibold text-slate-800 mb-1 flex items-center gap-2">
            <Server size={18} className="text-marca-600" /> Dirección del servidor
          </h2>
          <p className="text-sm text-slate-500 mb-3">
            Actual: <span className="font-mono font-bold text-slate-700">{obtenerBaseUrl()}</span>.
            Si cambias de servidor, vuelve a iniciar sesión.
          </p>
          <form onSubmit={cambiarServidor} className="flex gap-2">
            <input
              className={inputClase}
              inputMode="url"
              placeholder="https://tudominio.com"
              value={urlServidor}
              onChange={(e) => setUrlServidor(e.target.value)}
            />
            <button type="submit" className={botonPrimario}>
              Guardar
            </button>
          </form>
        </Card>
      )}

      <Card className="p-5 mb-4">
        <h2 className="font-semibold text-slate-800 mb-1 flex items-center gap-2">
          <Percent size={18} className="text-marca-600" /> Margen de ganancia
        </h2>
        <p className="text-sm text-slate-500 mb-3">
          Actual: <span className="font-bold text-marca-700">{margenActual}%</span>. Se aplica al
          precio de costo de NICE para calcular el precio al público.
        </p>
        <form onSubmit={guardarMargen} className="flex gap-2">
          <input
            className={inputClase + ' w-32'}
            inputMode="numeric"
            placeholder={`Ej. ${margenActual}`}
            value={margen}
            onChange={(e) => setMargen(e.target.value.replace(/[^0-9.]/g, ''))}
          />
          <button type="submit" className={botonSecundario}>
            Guardar margen
          </button>
          <button type="button" onClick={recalcular} className={botonPrimario}>
            <RefreshCw size={16} /> Recalcular precios
          </button>
        </form>
      </Card>

      <Card className="p-5 mb-4">
        <h2 className="font-semibold text-slate-800 mb-1">Nombre del negocio</h2>
        <p className="text-sm text-slate-500 mb-3">
          Actual: <span className="font-bold">{nombreActual}</span>. Se usa en los comprobantes de
          WhatsApp y reportes.
        </p>
        <form onSubmit={guardarNombre} className="flex gap-2">
          <input
            className={inputClase + ' max-w-xs'}
            placeholder={nombreActual}
            value={nombreNegocio}
            onChange={(e) => setNombreNegocio(e.target.value)}
          />
          <button type="submit" className={botonSecundario}>
            Guardar nombre
          </button>
        </form>
      </Card>

      <Card className="p-5 mb-4">
        <h2 className="font-semibold text-slate-800 mb-1 flex items-center gap-2">
          <CreditCard size={18} className="text-marca-600" /> Recargo por ventas a crédito
        </h2>
        <p className="text-sm text-slate-500 mb-3">
          Actual: <span className="font-bold text-marca-700">{recargoActual}%</span>. Cuando
          marcas una venta como "a crédito (en abonos)", el total sube este porcentaje.
        </p>
        <form onSubmit={guardarRecargo} className="flex gap-2">
          <input
            className={inputClase + ' w-32'}
            inputMode="numeric"
            placeholder={`Ej. ${recargoActual}`}
            value={recargo}
            onChange={(e) => setRecargo(e.target.value.replace(/[^0-9.]/g, ''))}
          />
          <button type="submit" className={botonSecundario}>
            Guardar recargo
          </button>
        </form>
      </Card>

      <Card className="p-5 mb-4">
        <h2 className="font-semibold text-slate-800 mb-1 flex items-center gap-2">
          <Link2 size={18} className="text-marca-600" /> URL del portal de clientes
        </h2>
        <p className="text-sm text-slate-500 mb-3">
          {urlPortalActual ? (
            <>
              Actual: <span className="font-bold text-slate-700 break-all">{urlPortalActual}</span>
            </>
          ) : (
            'Aún sin configurar. La página donde tus clientes consultan sus cuentas pendientes en línea.'
          )}{' '}
          Se envía por WhatsApp junto con el usuario y la contraseña de cada cliente (p. ej.{' '}
          <span className="font-mono text-xs">https://tudominio.com</span>).
        </p>
        <form onSubmit={guardarUrlPortal} className="flex gap-2">
          <input
            className={inputClase + ' flex-1'}
            inputMode="url"
            placeholder="Ej. https://tudominio.com"
            value={urlPortal}
            onChange={(e) => setUrlPortal(e.target.value)}
          />
          <button type="submit" className={botonSecundario}>
            Guardar URL
          </button>
        </form>
      </Card>

      <Card className="p-5 mb-4">
        <h2 className="font-semibold text-slate-800 mb-1 flex items-center gap-2">
          <KeyRound size={18} className="text-marca-600" /> Mi contraseña de acceso
        </h2>
        <p className="text-sm text-slate-500 mb-3">
          La contraseña para entrar al sistema (usuario <span className="font-bold">admin</span>).
          {claveCambiada && (
            <span className="font-semibold text-emerald-600 block mt-1">Contraseña actualizada correctamente</span>
          )}
        </p>
        <form onSubmit={cambiarPass} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Campo etiqueta="Contraseña actual">
              <input
                type="password"
                className={inputClase}
                autoComplete="current-password"
                value={passActual}
                onChange={(e) => setPassActual(e.target.value)}
                required
              />
            </Campo>
            <Campo etiqueta="Contraseña nueva (mín. 8 caracteres)">
              <input
                type="password"
                className={inputClase}
                autoComplete="new-password"
                value={passNueva}
                onChange={(e) => setPassNueva(e.target.value)}
                required
              />
            </Campo>
          </div>
          <button type="submit" className={botonSecundario + ' self-start'}>
            Cambiar contraseña
          </button>
        </form>
      </Card>

      <Card className="p-5 mb-4">
        <h2 className="font-semibold text-slate-800 mb-1 flex items-center gap-2">
          <Globe size={18} className="text-marca-600" /> URL de acceso al portal NICE
        </h2>
        <p className="text-sm text-slate-500 mb-3">
          {urlNiceActual ? (
            <>
              Actual:{' '}
              <span className="font-bold text-slate-700 break-all">{urlNiceActual}</span>
            </>
          ) : (
            'La dirección donde inicia sesión NICE aún no está configurada. Pégalo aquí.'
          )}{' '}
          La usa la sincronización del catálogo (botón "Sincronizar catálogo ahora").
        </p>
        <form onSubmit={guardarUrlNice} className="flex gap-2">
          <input
            className={inputClase + ' flex-1'}
            inputMode="url"
            placeholder="Ej. https://niceaccess.example.com/login"
            value={urlNice}
            onChange={(e) => setUrlNice(e.target.value)}
          />
          <button type="submit" className={botonSecundario}>
            Guardar URL
          </button>
        </form>
      </Card>

      <Card className="p-5 mb-4">
        <h2 className="font-semibold text-slate-800 mb-1 flex items-center gap-2">
          <Database size={18} className="text-marca-600" /> Catálogo NICE
        </h2>
        <p className="text-sm text-slate-500 mb-3">
          {ultimaSync ? (
            <>
              Última sincronización: <span className="font-semibold text-slate-700">{fechaHora(ultimaSync)}</span>
            </>
          ) : (
            'El catálogo aún no se ha sincronizado'
          )}
        </p>
        <p className="text-xs text-slate-400 mb-3">
          Usa el usuario, la contraseña y la URL que configuras en esta página (las del archivo
          .env solo valen de respaldo inicial). El proceso corre en segundo plano en el VPS y verás
          su avance en esta misma ventana.
        </p>
        <button onClick={sincronizar} className={botonPrimario}>
          <RefreshCw size={16} /> Sincronizar catálogo ahora
        </button>
      </Card>

      <Card className="p-5 mb-4">
        <h2 className="font-semibold text-slate-800 mb-1 flex items-center gap-2">
          <MessageCircle size={18} className="text-emerald-600" /> Notificaciones de WhatsApp
        </h2>
        <div className="flex items-center gap-2 mb-2">
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              estado === 'CONECTADO'
                ? 'bg-emerald-500'
                : estado === 'ESPERANDO_QR'
                  ? 'bg-amber-500'
                  : 'bg-red-400'
            }`}
          />
          <p className="text-sm font-medium text-slate-700">
            {etiquetaEstado[estado] ?? estado}
          </p>
        </div>
        <p className="text-sm text-slate-500">
          Cada abono y cada venta envían al cliente su comprobante en texto y su recibo en PDF.
          La primera conexión requiere escanear el QR en la terminal del VPS.
        </p>
        {whatsapp.datos?.qr_pendiente && (
          <div className="mt-3 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700 flex items-start gap-2">
            <Clock size={16} className="mt-0.5 shrink-0" />
            <div>
              Pendiente: escanea el QR con tu WhatsApp (Ajustes → Dispositivos vinculados → Vincular
              un dispositivo). Se refresca cada pocos segundos.
              <img
                src={`${obtenerBaseUrl()}/api/config/whatsapp-qr?v=${Date.now()}`}
                alt="Código QR de WhatsApp"
                className="mt-3 w-56 h-56 rounded-lg bg-white p-2 border border-amber-200"
              />
            </div>
          </div>
        )}
        {whatsapp.datos?.detalle && (
          <div className="mt-3">
            <Alerta tipo="error" mensaje={whatsapp.datos.detalle} />
          </div>
        )}
      </Card>

      <Card className="p-5 mb-4">
        <h2 className="font-semibold text-slate-800 mb-1 flex items-center gap-2">
          <ImageIcon size={18} className="text-marca-600" /> Logo del negocio
        </h2>
        <p className="text-sm text-slate-500 mb-3">
          Aparece en los recibos PDF de ventas y abonos. PNG, JPG o WebP, máximo 5 MB
          (se recomienda cuadrado, ejemplo 512×512).
        </p>
        <div className="flex items-center gap-4">
          {logoExiste ? (
            <img
              src={`${obtenerBaseUrl()}/api/config/logo?v=${logoVersion}`}
              alt="Logo del negocio"
              className="w-16 h-16 rounded-xl object-cover border border-slate-200 bg-white"
            />
          ) : (
            <div className="w-16 h-16 rounded-xl border-2 border-dashed border-slate-200 flex items-center justify-center text-slate-300">
              <ImageIcon size={24} />
            </div>
          )}
          <div className="flex flex-col sm:flex-row gap-2">
            <label
              className={botonSecundario + ' cursor-pointer'}
              onClick={(e) => {
                if (accion.ocupado) e.preventDefault();
              }}
            >
              <ImageIcon size={16} />
              {accion.ocupado ? 'Guardando…' : logoExiste ? 'Cambiar logo' : 'Subir logo'}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  subirLogo(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </label>
            {logoExiste && (
              <button type="button" onClick={quitarLogo} className="inline-flex items-center gap-1.5 text-sm font-semibold text-red-500 hover:text-red-700">
                <Trash2 size={15} /> Quitar
              </button>
            )}
          </div>
        </div>
        {logoError && (
          <div className="mt-3">
            <Alerta tipo="error" mensaje={logoError} />
          </div>
        )}
      </Card>

      <Card className="p-5 mb-4">
        <h2 className="font-semibold text-slate-800 mb-1 flex items-center gap-2">
          <Cloud size={18} className="text-sky-600" /> Imágenes en la nube (Cloudinary)
        </h2>
        <p className="text-sm text-slate-500 mb-3">
          Opcional. Si lo configuras, las imágenes que subas manualmente (productos y logo) se
          comprimen y se alojan en tu cuenta de Cloudinary en vez de ocupar el servidor. Si lo
          dejas vacío, todo sigue guardándose en el servidor como hasta ahora.
        </p>
        <p className="text-sm text-slate-500 mb-3">
          {cloudConfigurado ? (
            <>
              Estado: <span className="font-semibold text-emerald-600">configurado</span> (nube{' '}
              <span className="font-mono font-bold text-slate-700">{cloudCloudActual}</span>,
              carpeta <span className="font-mono font-bold text-slate-700">{cloudCarpetaActual}</span>)
            </>
          ) : (
            <>
              Estado:{' '}
              <span className="font-semibold text-slate-700">no configurado</span> — las imágenes
              se guardan en el servidor
            </>
          )}
        </p>
        <form onSubmit={guardarCloudinary} className="flex flex-col gap-4">
          <Campo etiqueta="Cloud name">
            <input
              className={inputClase}
              autoComplete="off"
              placeholder={cloudCloudActual || 'Ej. mi-negocio'}
              value={cloudCloud}
              onChange={(e) => setCloudCloud(e.target.value)}
            />
          </Campo>
          <Campo etiqueta="API Key">
            <input
              className={inputClase}
              autoComplete="off"
              placeholder={cloudKeyActual || 'Ej. 123456789012345'}
              value={cloudKey}
              onChange={(e) => setCloudKey(e.target.value)}
            />
          </Campo>
          <Campo etiqueta="API Secret">
            <input
              type="password"
              className={inputClase}
              autoComplete="new-password"
              placeholder={cloudSecret ? '' : '••••••••••••••••'}
              value={cloudSecret}
              onChange={(e) => setCloudSecret(e.target.value)}
            />
          </Campo>
          <Campo etiqueta="Carpeta (opcional)">
            <input
              className={inputClase}
              autoComplete="off"
              placeholder={cloudCarpetaActual}
              value={cloudCarpeta}
              onChange={(e) => setCloudCarpeta(e.target.value)}
            />
          </Campo>
          <button type="submit" className={botonSecundario + ' self-start'}>
            Guardar credenciales
          </button>
        </form>
        {cloudGuardado && (
          <div className="mt-3">
            <Alerta tipo="exito" mensaje="Credenciales de Cloudinary guardadas" />
          </div>
        )}
      </Card>

      <Card className="p-5 mb-4">
        <h2 className="font-semibold text-slate-800 mb-1 flex items-center gap-2">
          <Shield size={18} className="text-emerald-600" /> Usuario y contraseña de NICE
        </h2>
        <p className="text-sm text-slate-500 mb-3">
          {usuarioNiceActual ? (
            <>
              Usuario actual:{' '}
              <span className="font-bold text-slate-700">{usuarioNiceActual}</span>
            </>
          ) : (
            'Aún no hay usuario configurado.'
          )}{' '}
          Los usa la sincronización del catálogo para iniciar sesión en el portal. Como solo
          ustedes dos usan el sistema, se manejan desde aquí; el archivo .env solo sirve de
          respaldo inicial.
        </p>
        <form onSubmit={guardarCredenciales} className="flex flex-col gap-4">
          <Campo etiqueta="Usuario">
            <input
              className={inputClase}
              autoComplete="off"
              placeholder={usuarioNiceActual || 'Ej. administrador'}
              value={usuarioNice}
              onChange={(e) => setUsuarioNice(e.target.value)}
            />
          </Campo>
          <Campo etiqueta="Contraseña">
            <input
              type="password"
              className={inputClase}
              autoComplete="new-password"
              placeholder={passNiceActual ? '•••••••• (se conserva si dejas vacío)' : 'Nueva contraseña'}
              value={passNice}
              onChange={(e) => setPassNice(e.target.value)}
            />
          </Campo>
          <button type="submit" className={botonSecundario + ' self-start'}>
            Guardar credenciales
          </button>
        </form>
        <p className="text-xs text-slate-400 mt-3">
          La contraseña de PostgreSQL y demás secretos del servidor siguen viviendo solo en el
          archivo .env.
        </p>
      </Card>

      {syncModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md">
            <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
              <Database size={18} className="text-marca-600" /> Sincronizar catálogo NICE
            </h3>
            {syncInfo?.estado === 'ok' ? (
              <>
                <div className="flex items-center gap-2 text-emerald-600 font-semibold mb-3">
                  <CheckCircle2 size={20} /> Sincronización completada
                </div>
                <ul className="text-sm text-slate-600 space-y-1 mb-4">
                  <li>
                    Productos extraídos:{' '}
                    <span className="font-semibold text-slate-800">{syncInfo.productos ?? 0}</span>
                  </li>
                  <li>
                    Productos nuevos:{' '}
                    <span className="font-semibold text-slate-800">
                      {syncInfo.resumen?.nuevos ?? 0}
                    </span>
                  </li>
                  <li>
                    Solo cambió el precio:{' '}
                    <span className="font-semibold text-slate-800">
                      {syncInfo.resumen?.solo_precio ?? 0}
                    </span>
                  </li>
                  <li>
                    Actualizados con cambios:{' '}
                    <span className="font-semibold text-slate-800">
                      {syncInfo.resumen?.cambios ?? 0}
                    </span>
                  </li>
                  <li>
                    Sin cambios:{' '}
                    <span className="font-semibold text-slate-800">
                      {syncInfo.resumen?.sin_cambios ?? 0}
                    </span>
                  </li>
                  <li>
                    Quitados del catálogo:{' '}
                    <span className="font-semibold text-slate-800">
                      {syncInfo.resumen?.desactivados ?? 0}
                    </span>
                  </li>
                  {syncInfo.resumen && syncInfo.resumen.con_error > 0 && (
                    <li className="text-red-600">
                      Con error:{' '}
                      <span className="font-semibold">{syncInfo.resumen.con_error}</span>
                    </li>
                  )}
                </ul>
                <button
                  onClick={() => setSyncModal(false)}
                  className={botonPrimario + ' w-full'}
                >
                  Cerrar
                </button>
              </>
            ) : syncInfo?.estado === 'error' ? (
              <>
                <div className="flex items-center gap-2 text-red-600 font-semibold mb-3">
                  <XCircle size={20} /> La sincronización falló
                </div>
                <p className="text-sm text-slate-600 mb-4 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {syncInfo.mensaje}
                </p>
                <button
                  onClick={() => setSyncModal(false)}
                  className={botonPrimario + ' w-full'}
                >
                  Cerrar
                </button>
              </>
            ) : (
              <div className="flex flex-col items-center py-2">
                <Loader2 size={36} className="text-marca-600 animate-spin mb-3" />
                <p className="text-sm text-slate-600 mb-1">{faseTexto}</p>
                {typeof syncInfo?.porcentaje === 'number' && syncInfo.fase === 'guardando' ? (
                  <div className="w-full mt-2 mb-1">
                    <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full bg-marca-600 rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, syncInfo.porcentaje)}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-slate-500 text-center mt-1">
                      Guardando… {syncInfo.porcentaje}%
                    </p>
                  </div>
                ) : syncInfo?.fase === 'extrayendo' ? (
                  <div className="w-full mt-2 mb-1">
                    <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full w-1/3 bg-marca-600 rounded-full animate-pulse" />
                    </div>
                    <p className="text-[11px] text-slate-500 text-center mt-1">
                      Extrayendo productos…{' '}
                      {syncInfo.productos != null ? `${syncInfo.productos} hasta ahora` : ''}
                    </p>
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-500 mt-1">
                    {syncInfo?.productos != null ? `${syncInfo.productos} productos extraídos` : ''}
                    {typeof syncInfo?.rondas === 'number'
                      ? ` · ronda ${syncInfo.rondas}`
                      : ''}
                  </p>
                )}
                {(syncInfo?.nuevos || syncInfo?.solo_precio || syncInfo?.cambios) ? (
                  <p className="text-[11px] text-slate-500 mt-1 text-center">
                    Nuevos {syncInfo.nuevos} · Solo precio {syncInfo.solo_precio} · Con cambios{' '}
                    {syncInfo.cambios}
                  </p>
                ) : null}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}