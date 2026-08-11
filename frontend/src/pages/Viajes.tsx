import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Bus, ChevronRight, Search } from 'lucide-react';
import { api, q } from '../api/client';
import { ItemViajes } from '../api/types';
import { useApi, useAccion } from '../hooks/useApi';
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
  EncabezadoPagina,
} from '../components/ui';
import { moneda, fechaCorta } from '../lib/format';

interface FormViaje {
  destino: string;
  fecha_salida: string;
  fecha_regreso: string;
  costo_fijo: string;
  precio_por_pasajero: string;
  notas: string;
}

const vacio: FormViaje = {
  destino: '',
  fecha_salida: '',
  fecha_regreso: '',
  costo_fijo: '',
  precio_por_pasajero: '',
  notas: '',
};

export default function Viajes() {
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState('');
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState<FormViaje>(vacio);

  const listado = useApi<ItemViajes>(
    () =>
      api.get(
        `/viajes${q({ busqueda, estado: filtro || undefined, limite: '100' })}`
      ),
    [busqueda, filtro]
  );
  const accion = useAccion();

  const guardar = (e: FormEvent) => {
    e.preventDefault();
    void accion.ejecutar(async () => {
      await api.post('/viajes', {
        ...form,
        costo_fijo: Number(form.costo_fijo) || 0,
        precio_por_pasajero: Number(form.precio_por_pasajero) || 0,
        registrado_por: 'WEB',
      });
      setModal(false);
      setForm(vacio);
      await listado.recargar();
    });
  };

  return (
    <div>
      <EncabezadoPagina
        titulo="Viajes"
        subtitulo={`${listado.datos?.total ?? 0} registrados`}
        accion={
          <button onClick={() => setModal(true)} className={botonPrimario}>
            <Plus size={18} /> Nuevo viaje
          </button>
        }
      />

      <div className="flex gap-2 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className={inputClase + ' pl-9'}
            placeholder="Buscar destino o cliente…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
        <select
          className={inputClase + ' w-auto'}
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
        >
          <option value="">Todos</option>
          <option value="PENDIENTE">Pendientes</option>
          <option value="LIQUIDADO">Liquidados</option>
        </select>
      </div>

      {accion.error && <div className="mb-4"><Alerta tipo="error" mensaje={accion.error} /></div>}

      {listado.cargando ? (
        <Cargando />
      ) : !listado.datos?.filas.length ? (
        <Vacio mensaje="No hay viajes registrados" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {listado.datos.filas.map((v) => (
            <Link key={v.id} to={`/viajes/${v.id}`}>
              <Card className="p-4 hover:shadow-md transition h-full">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <span className="p-2.5 rounded-xl bg-marca-50 text-marca-600">
                      <Bus size={20} />
                    </span>
                    <div>
                      <p className="font-bold text-slate-800">{v.destino}</p>
                      <p className="text-xs text-slate-500">{fechaCorta(v.fecha_salida)} · {v.pasajeros_count ?? 0} pasajeros</p>
                    </div>
                  </div>
                  <Badge estado={v.estado} />
                </div>
                <div className="mt-3 flex justify-between items-end">
                  <div>
                    <p className="text-xs text-slate-400">Saldo pendiente</p>
                    <p className="font-bold text-red-500">{moneda(v.saldo_pendiente)}</p>
                  </div>
                  <span className="text-marca-600 text-sm font-semibold flex items-center">
                    Gestionar <ChevronRight size={16} />
                  </span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Modal abierto={modal} onCerrar={() => setModal(false)} titulo="Nuevo viaje">
        <form onSubmit={guardar}>
          <Campo etiqueta="Destino *">
            <input
              required
              className={inputClase}
              placeholder="Ej. Monterrey"
              value={form.destino}
              onChange={(e) => setForm({ ...form, destino: e.target.value })}
            />
          </Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo etiqueta="Fecha de salida *">
              <input
                required
                type="date"
                className={inputClase}
                value={form.fecha_salida}
                onChange={(e) => setForm({ ...form, fecha_salida: e.target.value })}
              />
            </Campo>
            <Campo etiqueta="Regreso">
              <input
                type="date"
                className={inputClase}
                value={form.fecha_regreso}
                onChange={(e) => setForm({ ...form, fecha_regreso: e.target.value })}
              />
            </Campo>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Campo etiqueta="Costo fijo del viaje ($)">
              <input
                className={inputClase}
                inputMode="decimal"
                placeholder="Ej. 3500"
                value={form.costo_fijo}
                onChange={(e) => setForm({ ...form, costo_fijo: e.target.value })}
              />
            </Campo>
            <Campo etiqueta="Precio por pasajero ($)">
              <input
                className={inputClase}
                inputMode="decimal"
                placeholder="Ej. 800"
                value={form.precio_por_pasajero}
                onChange={(e) => setForm({ ...form, precio_por_pasajero: e.target.value })}
              />
            </Campo>
          </div>
          <Campo etiqueta="Notas">
            <textarea
              className={inputClase}
              rows={2}
              value={form.notas}
              onChange={(e) => setForm({ ...form, notas: e.target.value })}
            />
          </Campo>
          <div className="flex gap-3 justify-end">
            <button type="button" onClick={() => setModal(false)} className={botonSecundario}>
              Cancelar
            </button>
            <button type="submit" disabled={accion.ocupado} className={botonPrimario}>
              {accion.ocupado ? 'Guardando…' : 'Crear viaje'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}