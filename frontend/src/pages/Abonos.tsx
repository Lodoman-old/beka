import { FormEvent, useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Wallet, Search, CheckCircle2, RefreshCw, Building2, Bus, X, FileText } from 'lucide-react';
import { api, q, descargarComprobante } from '../api/client';
import { Abono, ItemVentas, ItemViajes, ResultadoAbono, Venta, Viaje } from '../api/types';
import { useApi, useAccion } from '../hooks/useApi';
import {
  cachePendientesVentas,
  cachePendientesViajes,
  encolarAbonoLocal,
} from '../lib/sincronizador';
import {
  Card,
  Campo,
  inputClase,
  botonPrimario,
  Cargando,
  Alerta,
  Vacio,
  EncabezadoPagina,
} from '../components/ui';
import { moneda, fechaHora, msjError } from '../lib/format';

const montosRapidos = [50, 100, 200, 500, 1000];

interface Entidad {
  tipo: 'VENTA' | 'VIAJE';
  id: number;
  etiqueta: string;
  saldo_pendiente: number;
}

export default function Abonos() {
  const [params] = useSearchParams();
  const ventaPreseleccionada = params.get('venta');
  const viajePreseleccionado = params.get('viaje');

  const [tipo, setTipo] = useState<'VENTA' | 'VIAJE'>(
    viajePreseleccionado ? 'VIAJE' : 'VENTA'
  );
  const [busqueda, setBusqueda] = useState('');
  const [entidad, setEntidad] = useState<Entidad | null>(null);
  const [monto, setMonto] = useState('');
  const [metodo, setMetodo] = useState('EFECTIVO');
  const [exito, setExito] = useState<ResultadoAbono | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ventasCache, setVentasCache] = useState<Entidad[]>([]);
  const [viajesCache, setViajesCache] = useState<Entidad[]>([]);

  const accion = useAccion();

  const convertirVenta = (v: Venta): Entidad => ({
    tipo: 'VENTA' as const,
    id: v.id,
    etiqueta: v.cliente_nombre,
    saldo_pendiente: v.saldo_pendiente,
  });

  const convertirViaje = (v: Viaje): Entidad => ({
    tipo: 'VIAJE' as const,
    id: v.id,
    etiqueta: `${v.destino}${v.cliente_nombre ? ` · ${v.cliente_nombre}` : ''}`,
    saldo_pendiente: v.saldo_pendiente,
  });

  useEffect(() => {
    void cachePendientesVentas().then((filas) => setVentasCache(filas.map(convertirVenta)));
    void cachePendientesViajes().then((filas) => setViajesCache(filas.map(convertirViaje)));
  }, []);

  const filtroBusqueda = busqueda || undefined;
  const ventas = useApi<ItemVentas>(
    () =>
      api.get(
        `/ventas${q({ estado: 'PENDIENTE', busqueda: filtroBusqueda, limite: '10' })}`
      ),
    [filtroBusqueda, tipo]
  );
  const viajes = useApi<ItemViajes>(
    () =>
      api.get(
        `/viajes${q({ estado: 'PENDIENTE', busqueda: filtroBusqueda, limite: '10' })}`
      ),
    [filtroBusqueda, tipo]
  );

  const abonosHoy = useApi<Abono[]>(
    () =>
      api.get(
        `/abonos${q({ desde: new Date(new Date().setHours(0, 0, 0, 0)).toISOString(), limite: '30' })}`
      ),
    []
  );

  const seleccionables: Entidad[] =
    tipo === 'VENTA'
      ? (ventas.datos?.filas ?? []).map(convertirVenta).concat(
          ventas.datos ? [] : ventasCache.filter((v) =>
              v.etiqueta.toLowerCase().includes(busqueda.toLowerCase())
            )
        )
      : (viajes.datos?.filas ?? []).map(convertirViaje).concat(
          viajes.datos ? [] : viajesCache.filter((v) =>
              v.etiqueta.toLowerCase().includes(busqueda.toLowerCase())
            )
        );

  const registrar = (e: FormEvent) => {
    e.preventDefault();
    if (!entidad) return;
    const valor = Number(monto);
    if (!valor || valor <= 0) return;

    void accion.ejecutar(async () => {
      const cuerpo = {
        venta_id: entidad.tipo === 'VENTA' ? entidad.id : null,
        viaje_id: entidad.tipo === 'VIAJE' ? entidad.id : null,
        monto: valor,
        metodo,
        registrado_por: 'POS',
      };
      try {
        const resultado = await api.post<ResultadoAbono>('/abonos', cuerpo);
        setExito(resultado);
      } catch {
        await encolarAbonoLocal({
          ventaId: cuerpo.venta_id ?? undefined,
          viajeId: cuerpo.viaje_id ?? undefined,
          monto: valor,
          metodo,
        });
        setAviso(
          'Sin conexión: el abono se guardó en el teléfono y se registrará al volver el Internet.'
        );
        setTimeout(() => setAviso(null), 8000);
      }
      setMonto('');
      setEntidad(null);
      setBusqueda('');
      await abonosHoy.recargar();
    });
  };

  const elegirPreseleccion = (lista: Entidad[], idBuscado: string | null, tipoBuscado: 'VENTA' | 'VIAJE') => {
    if (idBuscado && !entidad) {
      const encontrada = lista.find((e) => e.id === Number(idBuscado));
      if (encontrada) setEntidad({ ...encontrada, tipo: tipoBuscado });
    }
  };
  elegirPreseleccion(seleccionables, ventaPreseleccionada, 'VENTA');
  elegirPreseleccion(seleccionables, viajePreseleccionado, 'VIAJE');

  return (
    <div className="max-w-2xl mx-auto">
      <EncabezadoPagina
        titulo="Registrar abono"
        subtitulo="Cobro rápido a pie de calle"
      />

      {exito && (
        <Card className="p-5 mb-4 border-emerald-200 bg-emerald-50">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="text-emerald-600 shrink-0 mt-0.5" size={26} />
            <div className="flex-1">
              <p className="font-bold text-emerald-800">
                Abono de {moneda(exito.abono.monto)} registrado
              </p>
              <p className="text-sm text-emerald-700 mt-1">
                {exito.entidad.cliente_nombre} · {exito.entidad.descripcion}
              </p>
              <p className="text-sm font-semibold text-emerald-800 mt-1">
                {exito.entidad.estado === 'LIQUIDADO'
                  ? '¡Cuenta LIQUIDADA!'
                  : `Saldo restante: ${moneda(exito.entidad.saldo_pendiente)}`}
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                <button
                  onClick={() =>
                    void descargarComprobante(
                      `/comprobantes/abono/${exito.abono.id}`,
                      `abono-${exito.abono.id}.pdf`
                    ).catch(() => undefined)
                  }
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 hover:text-emerald-900"
                >
                  <FileText size={15} /> Descargar recibo PDF
                </button>
                <button
                  onClick={() => setExito(null)}
                  className="text-sm font-semibold text-emerald-700 hover:text-emerald-900"
                >
                  Registrar otro abono
                </button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {accion.error && <div className="mb-4"><Alerta tipo="error" mensaje={accion.error} /></div>}
      {aviso && <div className="mb-4"><Alerta tipo="aviso" mensaje={aviso} /></div>}

      <Card className="p-5 mb-5">
        <div className="flex gap-2 mb-5">
          {(
            [
              { t: 'VENTA', etiqueta: 'Venta', Icono: Building2 },
              { t: 'VIAJE', etiqueta: 'Viaje', Icono: Bus },
            ] as const
          ).map(({ t, etiqueta, Icono }) => (
            <button
              key={t}
              onClick={() => {
                setTipo(t);
                setEntidad(null);
              }}
              className={`flex-1 flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition ${
                tipo === t
                  ? 'bg-marca-600 text-white'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}
            >
              <Icono size={17} /> {etiqueta}
              {t === 'VENTA' && 'pendiente'}
            </button>
          ))}
        </div>

        <label className="block mb-3">
          <span className="text-sm font-medium text-slate-600 block mb-1">
            {tipo === 'VENTA' ? 'Buscar cliente' : 'Buscar viaje'}
          </span>
          <div className="relative">
            <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className={inputClase + ' pl-10'}
              placeholder={tipo === 'VENTA' ? 'Nombre del cliente…' : 'Destino o cliente…'}
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>
        </label>

        {!entidad && !busqueda && (
          <p className="text-xs text-slate-400 mb-3">
            Elige una {tipo === 'VENTA' ? 'venta' : 'viaje'} pendiente para cobrarle. Para
            buscarla rápido, escribe el nombre aquí arriba.
          </p>
        )}

        {!entidad ? (
          <ul className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
            {(tipo === 'VENTA' ? ventas.datos?.filas : viajes.datos?.filas)?.map((fila) => {
              const e: Entidad =
                tipo === 'VENTA'
                  ? {
                      tipo,
                      id: fila.id,
                      etiqueta: (fila as { cliente_nombre: string }).cliente_nombre,
                      saldo_pendiente: (fila as { saldo_pendiente: number }).saldo_pendiente,
                    }
                  : {
                      tipo,
                      id: fila.id,
                      etiqueta: `${(fila as { destino: string }).destino}${
                        (fila as { cliente_nombre?: string | null }).cliente_nombre
                          ? ` · ${(fila as { cliente_nombre: string }).cliente_nombre}`
                          : ''
                      }`,
                      saldo_pendiente: (fila as { saldo_pendiente: number }).saldo_pendiente,
                    };
              return (
                <li key={e.id}>
                  <button
                    onClick={() => setEntidad(e)}
                    className="w-full flex justify-between items-center px-2 py-3 hover:bg-slate-50 rounded-xl"
                  >
                    <span className="font-medium text-slate-700 truncate">{e.etiqueta}</span>
                    <span className="text-sm font-bold text-red-500 shrink-0 ml-2">
                      {moneda(e.saldo_pendiente)}
                    </span>
                  </button>
                </li>
              );
            })}
            {!ventas.cargando && !viajes.cargando && !(tipo === 'VENTA' ? ventas.datos?.filas.length : viajes.datos?.filas.length) && (
              <li className="py-6 text-center">
                <p className="text-slate-400 text-sm mb-3">
                  {tipo === 'VENTA'
                    ? 'No hay ventas pendientes de cobro'
                    : 'No hay viajes pendientes de cobro'}
                </p>
                {tipo === 'VENTA' ? (
                  <Link className="text-sm font-semibold text-marca-600 hover:underline" to="/ventas">
                    Registrar una venta →
                  </Link>
                ) : (
                  <Link className="text-sm font-semibold text-marca-600 hover:underline" to="/viajes">
                    Crear un viaje →
                  </Link>
                )}
              </li>
            )}
          </ul>
        ) : (
          <div>
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 mb-4 flex justify-between items-center">
              <div className="min-w-0">
                <p className="font-semibold text-slate-800 truncate">{entidad.etiqueta}</p>
                <p className="text-xs text-slate-400">
                  {entidad.tipo === 'VENTA' ? 'Venta' : 'Viaje'} #{entidad.id}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0 ml-3">
                <div className="text-right">
                  <p className="text-xs text-slate-400">Saldo pendiente</p>
                  <p className="font-bold text-red-500 text-lg">{moneda(entidad.saldo_pendiente)}</p>
                </div>
                <button
                  onClick={() => setEntidad(null)}
                  className="text-slate-400 hover:text-slate-600 p-1"
                  title="Elegir otra venta o viaje"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <form onSubmit={registrar}>
              <Campo etiqueta="Monto del abono ($)">
                <input
                  className={inputClase + ' text-3xl font-black text-center py-4'}
                  inputMode="decimal"
                  placeholder="0.00"
                  value={monto}
                  autoFocus
                  onChange={(e) => setMonto(e.target.value.replace(/[^0-9.]/g, ''))}
                />
              </Campo>

              <div className="grid grid-cols-5 gap-2 mb-4">
                {montosRapidos.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMonto(String(m))}
                    className={`rounded-xl border py-3 text-sm font-bold transition ${
                      monto === String(m)
                        ? 'bg-marca-600 text-white border-marca-600'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    ${m}
                  </button>
                ))}
              </div>

              <Campo etiqueta="Método de pago">
                <select className={inputClase} value={metodo} onChange={(e) => setMetodo(e.target.value)}>
                  <option value="EFECTIVO">Efectivo</option>
                  <option value="TRANSFERENCIA">Transferencia</option>
                  <option value="TARJETA">Tarjeta</option>
                  <option value="OTRO">Otro</option>
                </select>
              </Campo>

              <button
                type="submit"
                disabled={accion.ocupado || !monto}
                className={botonPrimario + ' w-full !py-4 text-lg'}
              >
                <Wallet size={20} />
                {accion.ocupado ? 'Registrando…' : `Registrar abono${monto ? ` de ${moneda(Number(monto))}` : ''}`}
              </button>
            </form>
          </div>
        )}
      </Card>

      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-slate-700 text-sm">Abonos de hoy</h2>
        <button
          onClick={() => void abonosHoy.recargar()}
          className="p-2 text-slate-400 hover:text-marca-600"
          aria-label="Actualizar"
        >
          <RefreshCw size={16} />
        </button>
      </div>
      {abonosHoy.cargando ? (
        <Cargando texto="Cargando abonos…" />
      ) : !abonosHoy.datos?.length ? (
        <Vacio mensaje="Aún no hay abonos hoy" />
      ) : (
        <Card className="divide-y divide-slate-50">
          {abonosHoy.datos.map((a) => (
            <div key={a.id} className="px-4 py-3 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-700 truncate">
                  {a.cliente_nombre || 'Cliente'}
                  {a.destino ? ` · ${a.destino}` : ''}
                </p>
                <p className="text-xs text-slate-400">{fechaHora(a.created_at)}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() =>
                    void descargarComprobante(
                      `/comprobantes/abono/${a.id}`,
                      `abono-${a.id}.pdf`
                    ).catch(() => undefined)
                  }
                  className="p-2 text-slate-400 hover:text-marca-600"
                  title="Descargar recibo PDF"
                >
                  <FileText size={16} />
                </button>
                <div className="text-right">
                  <p className="font-bold text-emerald-600">+{moneda(a.monto)}</p>
                  {a.notificacion_whatsapp === 'SIN_TELEFONO' && (
                    <p className="text-[10px] text-slate-400">sin teléfono</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </Card>
      )}
      {abonosHoy.error && <Alerta tipo="error" mensaje={msjError(abonosHoy.error)} />}
    </div>
  );
}