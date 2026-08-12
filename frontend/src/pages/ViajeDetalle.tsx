import { FormEvent, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Bus,
  Search,
  Trash2,
  Wallet,
  UserPlus,
} from 'lucide-react';
import { api } from '../api/client';
import { Viaje } from '../api/types';
import { useApi, useAccion } from '../hooks/useApi';
import { useConfirmar } from '../components/Confirmar';
import {
  Card,
  Modal,
  Campo,
  inputClase,
  botonPrimario,
  botonSecundario,
  Badge,
  Cargando,
  Alerta,
  Vacio,
} from '../components/ui';
import { moneda, fechaCorta } from '../lib/format';

const montosRapidos = [100, 200, 500, 1000];

export default function ViajeDetalle() {
  const { id } = useParams();
  const viajeId = Number(id || 0);

  const viaje = useApi<Viaje>(() => api.get(`/viajes/${viajeId}`), [viajeId]);
  const accion = useAccion();
  const confirmar = useConfirmar();
  const [filtro, setFiltro] = useState('');
  const [abrirNuevo, setAbrirNuevo] = useState(false);
  const [abonoDe, setAbonoDe] = useState<{ pasajeroId: number | null; nombre: string } | null>(null);
  const [formPasajero, setFormPasajero] = useState({
    nombre: '',
    telefono: '',
    asiento: '',
  });
  const [monto, setMonto] = useState('');
  const [exito, setExito] = useState<string | null>(null);

  const datos = viaje.datos;
  const pasajeros = datos?.pasajeros ?? [];

  const filtrados = pasajeros.filter((p) =>
    p.nombre.toLowerCase().includes(filtro.toLowerCase())
  );

  const agregarPasajero = (e: FormEvent) => {
    e.preventDefault();
    void accion.ejecutar(async () => {
      await api.post(`/viajes/${viajeId}/pasajeros`, {
        nombre: formPasajero.nombre,
        telefono: formPasajero.telefono || null,
        asiento: formPasajero.asiento || null,
      });
      setFormPasajero({ nombre: '', telefono: '', asiento: '' });
      setAbrirNuevo(false);
      await viaje.recargar();
    });
  };

  const quitarPasajero = async (pasajeroId: number, nombre: string) => {
    const ok = await confirmar(`¿Quitar a ${nombre} del viaje?`, {
      titulo: 'Quitar pasajero',
      confirmarTexto: 'Quitar',
      peligro: true,
    });
    if (!ok) return;
    void accion.ejecutar(async () => {
      await api.del(`/viajes/pasajeros/${pasajeroId}`);
      await viaje.recargar();
    });
  };

  const registrarAbono = (e: FormEvent) => {
    e.preventDefault();
    if (!abonoDe) return;
    const valor = Number(monto);
    if (!valor || valor <= 0) return;
    void accion.ejecutar(async () => {
      const resultado = await api.post<{ entidad: { saldo_pendiente: number; estado: string } }>(
        '/abonos',
        {
          viaje_id: viajeId,
          pasajero_id: abonoDe.pasajeroId ?? null,
          monto: valor,
          registrado_por: 'POS',
        }
      );
      setExito(
        `Abono registrado. Saldo del viaje: ${moneda(resultado.entidad.saldo_pendiente)} (${
          resultado.entidad.estado === 'LIQUIDADO' ? '¡LIQUIDADO!' : 'pendiente'
        })`
      );
      setMonto('');
      setAbonoDe(null);
      await viaje.recargar();
      setTimeout(() => setExito(null), 6000);
    });
  };

  if (viaje.cargando) return <Cargando />;
  if (!datos) return <Alerta tipo="error" mensaje={viaje.error ?? 'Viaje no encontrado'} />;

  return (
    <div>
      <Link
        to="/viajes"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-marca-600 mb-4"
      >
        <ArrowLeft size={16} /> Todos los viajes
      </Link>

      <Card className="p-5 mb-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-800 flex items-center gap-2.5">
              <span className="p-2 rounded-xl bg-marca-50 text-marca-600">
                <Bus size={22} />
              </span>
              {datos.destino}
            </h1>
            <p className="text-sm text-slate-500 mt-1.5">
              Salida: {fechaCorta(datos.fecha_salida)}
              {datos.cliente_nombre ? ` · Organizador: ${datos.cliente_nombre}` : ''}
            </p>
          </div>
          <Badge estado={datos.estado} />
        </div>
        <div className="grid grid-cols-3 gap-3 mt-5 text-center">
          <div>
            <p className="text-xs text-slate-400">Pasajeros</p>
            <p className="font-bold text-lg">{datos.pasajeros?.length ?? datos.pasajeros_count ?? 0}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Precio por pasajero</p>
            <p className="font-bold text-lg">{moneda(datos.precio_por_pasajero)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Saldo del viaje</p>
            <p className="font-bold text-lg text-red-500">{moneda(datos.saldo_pendiente)}</p>
          </div>
        </div>
      </Card>

      {exito && <div className="mb-4"><Alerta tipo="exito" mensaje={exito} /></div>}
      {accion.error && <div className="mb-4"><Alerta tipo="error" mensaje={accion.error} /></div>}

      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className={inputClase + ' pl-10'}
            placeholder="Buscar pasajero por nombre…"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
          />
        </div>
        <button onClick={() => setAbrirNuevo(true)} className={botonPrimario}>
          <UserPlus size={18} /> Agregar pasajero
        </button>
      </div>

      {filtrados.length === 0 ? (
        <Vacio mensaje="No se encontraron pasajeros" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 mb-6">
          {filtrados.map((p) => (
            <Card key={p.id} className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-marca-100 text-marca-700 font-bold shrink-0">
                    {p.nombre.charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-800 truncate">{p.nombre}</p>
                    <p className="text-xs text-slate-400">
                      {p.asiento ? `Asiento ${p.asiento}` : 'Sin asiento'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => quitarPasajero(p.id, p.nombre)}
                  className="p-1.5 rounded-lg text-red-300 hover:bg-red-50"
                  aria-label="Quitar"
                >
                  <Trash2 size={15} />
                </button>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <div>
                  <p className="text-[11px] text-slate-400">Abonado / Estudios</p>
                  <p className="text-sm text-slate-500">
                    <span className="font-semibold text-emerald-600">{moneda(p.abonado)}</span> ·{' '}
                    <span className="text-slate-400">{moneda(p.precio)}</span>
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Restante</p>
                  <p className="font-bold text-red-500">{moneda(p.saldo)}</p>
                </div>
                <button
                  onClick={() => setAbonoDe({ pasajeroId: p.id, nombre: p.nombre })}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-3.5 py-2"
                >
                  <Wallet size={15} /> Abonar
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {pasajeros.length === 0 && (
        <div className="mb-6">
          <Vacio mensaje="Aún no hay pasajeros en este viaje" />
        </div>
      )}

      <Modal
        abierto={abrirNuevo}
        onCerrar={() => setAbrirNuevo(false)}
        titulo="Agregar pasajero"
      >
        <form onSubmit={agregarPasajero}>
          <Campo etiqueta="Nombre completo *">
            <input
              required
              className={inputClase}
              value={formPasajero.nombre}
              onChange={(e) => setFormPasajero({ ...formPasajero, nombre: e.target.value })}
            />
          </Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo etiqueta="Teléfono (WhatsApp)">
              <input
                className={inputClase}
                inputMode="tel"
                value={formPasajero.telefono}
                onChange={(e) => setFormPasajero({ ...formPasajero, telefono: e.target.value })}
              />
            </Campo>
            <Campo etiqueta="Número de asiento">
              <input
                className={inputClase}
                placeholder="Ej. 12"
                value={formPasajero.asiento}
                onChange={(e) => setFormPasajero({ ...formPasajero, asiento: e.target.value })}
              />
            </Campo>
          </div>
          <div className="flex gap-3 justify-end">
            <button type="button" onClick={() => setAbrirNuevo(false)} className={botonSecundario}>
              Cancelar
            </button>
            <button type="submit" disabled={accion.ocupado} className={botonPrimario}>
              Agregar
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        abierto={!!abonoDe}
        onCerrar={() => setAbonoDe(null)}
        titulo={`Abono · ${abonoDe?.nombre ?? ''}`}
      >
        <form onSubmit={registrarAbono}>
          <p className="text-sm text-slate-500 mb-3">
            Viaje a <span className="font-semibold">{datos.destino}</span> · precio de boleto{' '}
            {moneda(datos.precio_por_pasajero)}
          </p>
          <Campo etiqueta="Monto del abono ($)">
            <input
              required
              className={inputClase + ' text-2xl font-bold'}
              inputMode="decimal"
              placeholder="0.00"
              value={monto}
              autoFocus
              onChange={(e) => setMonto(e.target.value.replace(/[^0-9.]/g, ''))}
            />
          </Campo>
          <div className="grid grid-cols-4 gap-2 mb-4">
            {montosRapidos.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMonto(String(m))}
                className="rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                ${m}
              </button>
            ))}
          </div>
          {accion.error && <div className="mb-3"><Alerta tipo="error" mensaje={accion.error} /></div>}
          <button type="submit" disabled={accion.ocupado} className={botonPrimario + ' w-full'}>
            <Wallet size={18} /> {accion.ocupado ? 'Registrando…' : 'Registrar abono'}
          </button>
        </form>
      </Modal>
    </div>
  );
}