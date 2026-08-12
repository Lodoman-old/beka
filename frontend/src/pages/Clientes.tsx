import { FormEvent, useState } from 'react';
import { Plus, Search, Pencil, Trash2, Phone, Globe, Copy, RefreshCw } from 'lucide-react';
import { api, q, obtenerBaseUrl } from '../api/client';
import { Cliente, ItemClientes } from '../api/types';
import { useApi, useAccion } from '../hooks/useApi';
import { useConfirmar } from '../components/Confirmar';
import {
  Card,
  Modal,
  Campo,
  inputClase,
  botonPrimario,
  botonSecundario,
  Cargando,
  Alerta,
  Vacio,
  EncabezadoPagina,
} from '../components/ui';
import { msjError } from '../lib/format';

interface Formulario {
  nombre: string;
  telefono: string;
  documento: string;
  email: string;
  direccion: string;
  notas: string;
}

const vacio: Formulario = {
  nombre: '',
  telefono: '',
  documento: '',
  email: '',
  direccion: '',
  notas: '',
};

async function copiarTexto(texto: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(texto);
  } catch {
    const area = document.createElement('textarea');
    area.value = texto;
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }
}

export default function Clientes() {
  const [busqueda, setBusqueda] = useState('');
  const [modal, setModal] = useState<{ abierto: boolean; editar: Cliente | null }>({
    abierto: false,
    editar: null,
  });
  const [portal, setPortal] = useState<Cliente | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);
  const [form, setForm] = useState<Formulario>(vacio);
  const [duplicado, setDuplicado] = useState<{
    cuerpo: Record<string, string | null>;
    nombres: string[];
  } | null>(null);

  const regenerar = useAccion();
  const confirmar = useConfirmar();

  const urlPortal = () => `${obtenerBaseUrl()}/portal`;

  const regenerarPortal = async (c: Cliente) => {
    const ok = await confirmar(
      `¿Generar nuevas credenciales de portal para ${c.nombre}?\nEsto invalida las anteriores.`,
      { titulo: 'Nuevas credenciales del portal', confirmarTexto: 'Generar' }
    );
    if (!ok) return;
    void regenerar.ejecutar(async () => {
      const r = await api.put<{ usuario_portal: string; pass_plano_portal: string }>(
        `/clientes/${c.id}/credenciales-portal`
      );
      setPortal({ ...c, usuario_portal: r.usuario_portal, pass_plano_portal: r.pass_plano_portal });
      await listado.recargar();
    });
  };

  const listado = useApi<ItemClientes>(
    () => api.get<ItemClientes>(`/clientes${q({ busqueda, limite: '200' })}`),
    [busqueda]
  );
  const accion = useAccion();

  const abrirNuevo = () => {
    setForm(vacio);
    setModal({ abierto: true, editar: null });
  };

  const abrirEditar = (c: Cliente) => {
    setForm({
      nombre: c.nombre,
      telefono: c.telefono ?? '',
      documento: c.documento ?? '',
      email: c.email ?? '',
      direccion: c.direccion ?? '',
      notas: c.notas ?? '',
    });
    setModal({ abierto: true, editar: c });
  };

  const enviarCliente = async (cuerpo: Record<string, string | null>, modo?: 'cambiar' | 'compartir') => {
    await accion.ejecutar(async () => {
      if (modal.editar) await api.put(`/clientes/${modal.editar.id}`, { ...cuerpo, accion: modo });
      else await api.post('/clientes', { ...cuerpo, accion: modo });
      setModal({ abierto: false, editar: null });
      setDuplicado(null);
      await listado.recargar();
    });
  };

  const guardar = (e: FormEvent) => {
    e.preventDefault();
    void accion.ejecutar(async () => {
      const cuerpo = { ...form, telefono: form.telefono || null, documento: form.documento || null };
      const telefono = form.telefono?.trim();
      if (telefono) {
        const r = await api.get<{ existe: boolean; clientes: { id: number; nombre: string }[] }>(
          `/clientes/telefono-existe${q({
            telefono,
            excepto: modal.editar ? String(modal.editar.id) : '',
          })}`
        );
        if (r.existe) {
          setDuplicado({ cuerpo, nombres: r.clientes.map((c) => c.nombre) });
          return;
        }
      }
      await enviarCliente(cuerpo);
    });
  };

  const eliminar = async (c: Cliente) => {
    const ok = await confirmar(`¿Desactivar al cliente ${c.nombre}?`, {
      titulo: 'Desactivar cliente',
      confirmarTexto: 'Desactivar',
      peligro: true,
    });
    if (!ok) return;
    void accion.ejecutar(async () => {
      await api.del(`/clientes/${c.id}`);
      await listado.recargar();
    });
  };

  return (
    <div>
      <EncabezadoPagina
        titulo="Clientes"
        subtitulo={`${listado.datos?.total ?? 0} registrados`}
        accion={
          <button onClick={abrirNuevo} className={botonPrimario}>
            <Plus size={18} /> Nuevo cliente
          </button>
        }
      />

      <div className="relative mb-4">
        <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre, teléfono o documento…"
          className={`${inputClase} pl-10`}
        />
      </div>

      {accion.error && <div className="mb-4"><Alerta tipo="error" mensaje={accion.error} /></div>}
      {listado.cargando ? (
        <Cargando />
      ) : !listado.datos?.filas.length ? (
        <Vacio mensaje="No hay clientes. Crea el primer registro." />
      ) : (
        <Card className="overflow-hidden">
          <div className="hidden md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                  <th className="px-5 py-3 font-medium">Nombre</th>
                  <th className="px-3 py-3 font-medium">Teléfono</th>
                  <th className="px-3 py-3 font-medium">Documento</th>
                  <th className="px-3 py-3 font-medium">Dirección</th>
                  <th className="px-5 py-3 font-medium text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {listado.datos.filas.map((c) => (
                  <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="px-5 py-3 font-medium text-slate-700">{c.nombre}</td>
                    <td className="px-3 py-3 text-slate-600">{c.telefono ?? '—'}</td>
                    <td className="px-3 py-3 text-slate-600">{c.documento ?? '—'}</td>
                    <td className="px-3 py-3 text-slate-600 truncate max-w-[220px]">
                      {c.direccion ?? '—'}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setPortal(c)}
                          className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"
                          aria-label="Acceso al portal"
                          title="Acceso del cliente al portal"
                        >
                          <Globe size={16} />
                        </button>
                        <button
                          onClick={() => abrirEditar(c)}
                          className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"
                          aria-label="Editar"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          onClick={() => eliminar(c)}
                          className="p-2 rounded-lg hover:bg-red-50 text-red-400"
                          aria-label="Eliminar"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="md:hidden divide-y divide-slate-50">
            {listado.datos.filas.map((c) => (
              <li key={c.id} className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-slate-800">{c.nombre}</p>
                  <div className="flex items-center">
                    <button
                      onClick={() => setPortal(c)}
                      className="p-2 text-slate-500"
                      aria-label="Acceso al portal"
                    >
                      <Globe size={16} />
                    </button>
                    <button
                      onClick={() => abrirEditar(c)}
                      className="p-2 text-marca-600"
                      aria-label="Editar"
                    >
                      <Pencil size={16} />
                    </button>
                  </div>
                </div>
                <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                  <Phone size={12} /> {c.telefono ?? 'Sin teléfono'}
                </p>
                {c.direccion && (
                  <p className="text-xs text-slate-400 mt-0.5">{c.direccion}</p>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Modal
        abierto={modal.abierto}
        onCerrar={() => setModal({ abierto: false, editar: null })}
        titulo={modal.editar ? 'Editar cliente' : 'Nuevo cliente'}
      >
        <form onSubmit={guardar}>
          <Campo etiqueta="Nombre completo *">
            <input
              required
              className={inputClase}
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            />
          </Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo etiqueta="Teléfono (WhatsApp)">
              <input
                className={inputClase}
                placeholder="55 1234 5678"
                inputMode="tel"
                value={form.telefono}
                onChange={(e) => setForm({ ...form, telefono: e.target.value })}
              />
            </Campo>
            <Campo etiqueta="Documento (IFE)">
              <input
                className={inputClase}
                value={form.documento}
                onChange={(e) => setForm({ ...form, documento: e.target.value })}
              />
            </Campo>
          </div>
          <Campo etiqueta="Dirección">
            <input
              className={inputClase}
              value={form.direccion}
              onChange={(e) => setForm({ ...form, direccion: e.target.value })}
            />
          </Campo>
          <Campo etiqueta="Notas">
            <textarea
              className={inputClase}
              rows={2}
              value={form.notas}
              onChange={(e) => setForm({ ...form, notas: e.target.value })}
            />
          </Campo>
          {accion.error && <div className="mb-3"><Alerta tipo="error" mensaje={accion.error} /></div>}
          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={() => setModal({ abierto: false, editar: null })}
              className={botonSecundario}
            >
              Cancelar
            </button>
            <button type="submit" disabled={accion.ocupado} className={botonPrimario}>
              {accion.ocupado ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        abierto={!!portal}
        onCerrar={() => { setPortal(null); setCopiado(null); }}
        titulo={`Acceso al portal · ${portal?.nombre ?? ''}`}
      >
        {portal && (
          <>
            <p className="text-sm text-slate-500 mb-4">
              El cliente puede entrar en <span className="font-mono text-xs">{urlPortal()}</span> con
              estas credenciales para consultar sus cuentas pendientes.
            </p>
            {portal.usuario_portal ? (
              <div className="space-y-3 bg-slate-50 rounded-xl p-4 border border-slate-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] text-slate-400 uppercase font-semibold">Usuario</p>
                    <p className="font-mono font-semibold">{portal.usuario_portal}</p>
                  </div>
                  <button
                    onClick={() => {
                      void copiarTexto(portal.usuario_portal ?? '');
                      setCopiado('usuario');
                    }}
                    className="p-2 rounded-lg text-slate-500 hover:bg-white"
                    aria-label="Copiar usuario"
                  >
                    <Copy size={16} />
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] text-slate-400 uppercase font-semibold">Contraseña</p>
                    <p className="font-mono font-semibold">{portal.pass_plano_portal}</p>
                  </div>
                  <button
                    onClick={() => {
                      void copiarTexto(portal.pass_plano_portal ?? '');
                      setCopiado('password');
                    }}
                    className="p-2 rounded-lg text-slate-500 hover:bg-white"
                    aria-label="Copiar contraseña"
                  >
                    <Copy size={16} />
                  </button>
                </div>
                {copiado && (
                  <p className="text-[11px] font-semibold text-emerald-600">
                    {copiado === 'usuario' ? 'Usuario copiado' : 'Contraseña copiada'}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-500">
                Este cliente aún no tiene credenciales. Genera unas nuevas.
              </p>
            )}
            {regenerar.error && <div className="mt-3"><Alerta tipo="error" mensaje={regenerar.error} /></div>}
            <div className="flex gap-3 justify-end mt-5">
              <button
                type="button"
                onClick={() => { setPortal(null); setCopiado(null); }}
                className={botonSecundario}
              >
                Cerrar
              </button>
              <button
                type="button"
                disabled={regenerar.ocupado}
                onClick={() => regenerarPortal(portal)}
                className={botonPrimario}
              >
                <RefreshCw size={16} />
                {regenerar.ocupado ? 'Generando…' : 'Generar nuevas credenciales'}
              </button>
            </div>
          </>
        )}
      </Modal>

      <Modal
        abierto={!!duplicado}
        onCerrar={() => setDuplicado(null)}
        titulo="El teléfono ya está registrado"
      >
        {duplicado && (
          <>
            <p className="text-sm text-slate-600 mb-4">
              El teléfono <span className="font-semibold">{form.telefono}</span> ya está registrado para{' '}
              <span className="font-semibold">{duplicado.nombres.join(', ')}</span>. ¿Qué quieres hacer?
            </p>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => void enviarCliente(duplicado.cuerpo, 'cambiar')}
                disabled={accion.ocupado}
                className={`${botonPrimario} w-full`}
              >
                Cambiar el número al nuevo cliente
              </button>
              <p className="text-[11px] text-slate-400 -mt-1">
                El cliente anterior pierde el acceso con ese número; sus ventas quedan en su registro.
              </p>
              <button
                type="button"
                onClick={() => void enviarCliente(duplicado.cuerpo, 'compartir')}
                disabled={accion.ocupado}
                className={`${botonSecundario} w-full`}
              >
                Dejar el mismo número para ambos
              </button>
              <p className="text-[11px] text-slate-400 -mt-1">
                Al entrar al portal, cada uno elige su nombre para ver sus propias ventas.
              </p>
            </div>
            <div className="flex gap-3 justify-end mt-5">
              <button
                type="button"
                onClick={() => setDuplicado(null)}
                className={botonSecundario}
              >
                Usar otro número
              </button>
            </div>
          </>
        )}
      </Modal>

      {listado.error && !listado.cargando && <Alerta tipo="error" mensaje={msjError(listado.error)} />}
    </div>
  );
}