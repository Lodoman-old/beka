import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Minus, Search, Trash2, Wallet } from 'lucide-react';
import { api, q } from '../api/client';
import { ItemVentas, ItemClientes, ItemCatalog, Producto, Venta, Cliente, ValorConfig } from '../api/types';
import { useApi, useAccion } from '../hooks/useApi';
import { useConfirmar } from '../components/Confirmar';
import {
  cacheProductos,
  cacheClientes,
  encolarClienteLocal,
  encolarVentaLocal,
} from '../lib/sincronizador';
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

interface FilaNueva {
  producto: Producto;
  cantidad: number;
}

export default function Ventas() {
  const [nueva, setNueva] = useState<{ abierto: boolean; clienteId: number | null }>({
    abierto: false,
    clienteId: null,
  });
  const [aviso, setAviso] = useState<string | null>(null);
  const [enLinea, setEnLinea] = useState(navigator.onLine);
  const navigate = useNavigate();

  const listado = useApi<ItemVentas>(() => api.get(`/ventas${q({ limite: '60' })}`), []);
  const accion = useAccion();
  const confirmar = useConfirmar();

  useEffect(() => {
    const activar = () => setEnLinea(true);
    const desactivar = () => setEnLinea(false);
    window.addEventListener('online', activar);
    window.addEventListener('offline', desactivar);
    return () => {
      window.removeEventListener('online', activar);
      window.removeEventListener('offline', desactivar);
    };
  }, []);

  const avisar = (mensaje: string) => {
    setAviso(mensaje);
    setTimeout(() => setAviso(null), 8000);
  };

  const abrirNueva = () => setNueva({ abierto: true, clienteId: null });

  const crear = async (
    clienteId: number | null,
    clienteRefLocal: string | null,
    filas: FilaNueva[],
    aCredito: boolean
  ) => {
    const ok = await accion.ejecutar(async () => {
      const cuerpo = {
        cliente_id: clienteId ?? undefined,
        items: filas.map((f) => ({ producto_id: f.producto.id, cantidad: f.cantidad })),
        registrado_por: 'WEB',
        a_credito: aCredito,
      };
      try {
        await api.post('/ventas', cuerpo);
        setNueva({ abierto: false, clienteId: null });
        await listado.recargar();
      } catch {
        await encolarVentaLocal({
          items: cuerpo.items,
          aCredito,
          clienteId: clienteId ?? undefined,
          clienteRef: clienteRefLocal,
        });
        setNueva({ abierto: false, clienteId: null });
        avisar('Sin conexión: la venta se guardó en el teléfono y se enviará al volver el Internet.');
      }
    });
    return ok;
  };

  const eliminar = async (v: Venta) => {
    const ok = await confirmar(
      `¿Eliminar la venta #${v.id}? No es posible si tiene abonos.`,
      { titulo: 'Eliminar venta', confirmarTexto: 'Eliminar', peligro: true }
    );
    if (!ok) return;
    void accion.ejecutar(async () => {
      await api.del(`/ventas/${v.id}`);
      await listado.recargar();
    });
  };

  return (
    <div>
      <EncabezadoPagina
        titulo="Ventas"
        subtitulo={`${listado.datos?.total ?? 0} registradas`}
        accion={
          <button onClick={abrirNueva} className={botonPrimario}>
            <Plus size={18} /> Nueva venta
          </button>
        }
      />

      {accion.error && <div className="mb-4"><Alerta tipo="error" mensaje={accion.error} /></div>}
      {aviso && <div className="mb-4"><Alerta tipo="aviso" mensaje={aviso} /></div>}
      {!enLinea && (
        <div className="mb-4">
          <Alerta
            tipo="aviso"
            mensaje="Sin conexión al servidor. Las ventas se guardan en el teléfono y se sincronizan solas al volver el Internet."
          />
        </div>
      )}

      {listado.cargando ? (
        <Cargando />
      ) : !listado.datos?.filas.length ? (
        <Vacio mensaje="No hay ventas registradas" />
      ) : (
        <>
          <div className="hidden md:block">
            <Card className="overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                    <th className="px-5 py-3 font-medium">Folio</th>
                    <th className="px-3 py-3 font-medium">Cliente</th>
                    <th className="px-3 py-3 font-medium">Fecha</th>
                    <th className="px-3 py-3 font-medium">Total</th>
                    <th className="px-3 py-3 font-medium">Saldo</th>
                    <th className="px-3 py-3 font-medium">Estado</th>
                    <th className="px-5 py-3 font-medium text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {listado.datos.filas.map((v) => (
                    <tr
                      key={v.id}
                      className="border-b border-slate-50 hover:bg-slate-50 cursor-pointer"
                      onClick={() => navigate(`/ventas/${v.id}`)}
                    >
                      <td className="px-5 py-3 font-semibold text-slate-700">#{v.id}</td>
                      <td className="px-3 py-3">{v.cliente_nombre}</td>
                      <td className="px-3 py-3 text-slate-500">{fechaCorta(v.fecha)}</td>
                      <td className="px-3 py-3 font-medium">{moneda(v.total)}</td>
                      <td className="px-3 py-3 font-semibold text-red-500">{moneda(v.saldo_pendiente)}</td>
                      <td className="px-3 py-3"><Badge estado={v.estado} /></td>
                      <td className="px-5 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-2">
                          <Link
                            to={`/abonos?venta=${v.id}`}
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 text-emerald-700 px-2.5 py-1.5 text-xs font-semibold hover:bg-emerald-100"
                          >
                            <Wallet size={14} /> Abonar
                          </Link>
                          <button
                            onClick={() => eliminar(v)}
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
            </Card>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:hidden">
            {listado.datos.filas.map((v) => (
              <Card key={v.id} className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-slate-800">#{v.id} · {v.cliente_nombre}</span>
                  <Badge estado={v.estado} />
                </div>
                <p className="text-xs text-slate-500">{fechaCorta(v.fecha)}</p>
                <div className="flex justify-between items-center mt-3">
                  <div>
                    <p className="text-sm text-slate-500">Saldo</p>
                    <p className="font-bold text-red-500">{moneda(v.saldo_pendiente)}</p>
                  </div>
                  <div className="flex gap-2">
                    <Link
                      to={`/ventas/${v.id}`}
                      className={botonSecundario + ' !py-2 text-sm'}
                    >
                      Ver
                    </Link>
                    <Link
                      to={`/abonos?venta=${v.id}`}
                      className={botonPrimario + ' !py-2'}
                    >
                      <Wallet size={16} /> Abonar
                    </Link>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {nueva.abierto && (
        <ModalVenta
          onCerrar={() => setNueva({ abierto: false, clienteId: null })}
          onCrear={crear}
        />
      )}
    </div>
  );
}

function ModalVenta({
  onCerrar,
  onCrear,
}: {
  onCerrar: () => void;
  onCrear: (
    clienteId: number | null,
    clienteRefLocal: string | null,
    filas: FilaNueva[],
    aCredito: boolean
  ) => Promise<boolean>;
}) {
  const [clienteId, setClienteId] = useState<number | null>(null);
  const [clienteRefLocal, setClienteRefLocal] = useState<string | null>(null);
  const [busquedaCliente, setBusquedaCliente] = useState('');
  const [listaClientesAbierta, setListaClientesAbierta] = useState(false);
  const [busquedaProducto, setBusquedaProducto] = useState('');
  const [filas, setFilas] = useState<FilaNueva[]>([]);
  const [errores, setErrores] = useState<string | null>(null);
  const [aCredito, setACredito] = useState(false);
  const [clientesCache, setClientesCache] = useState<Cliente[]>([]);
  const [productosCache, setProductosCache] = useState<Producto[]>([]);
  const accionNuevoCliente = useAccion();

  useEffect(() => {
    void cacheClientes().then(setClientesCache);
    void cacheProductos().then(setProductosCache);
  }, []);

  const config = useApi<ValorConfig[]>(() => api.get('/config'), []);
  const recargoPct = Number(
    config.datos?.find((c) => c.clave === 'RECARGO_ABONOS')?.valor || 0
  );

  const clientes = useApi<ItemClientes>(() =>
    api.get(`/clientes${q({ busqueda: busquedaCliente, limite: '20' })}`), [busquedaCliente]
  );
  const productos = useApi<ItemCatalog>(() =>
    api.get(`/catalogo${q({ busqueda: busquedaProducto, limite: '12' })}`), [busquedaProducto]
  );

  const textoBusquedaCliente = busquedaCliente.toLowerCase();
  const textoBusquedaProducto = busquedaProducto.toLowerCase();
  const filasClientes =
    clientes.datos?.filas ??
    clientesCache.filter(
      (c) => c.activo && c.nombre.toLowerCase().includes(textoBusquedaCliente)
    );
  const filasProductos =
    productos.datos?.filas ??
    productosCache.filter(
      (p) =>
        p.activo &&
        (p.nombre + ' ' + p.sku).toLowerCase().includes(textoBusquedaProducto)
    );

  const total = filas.reduce((acc, f) => acc + f.producto.precio_publico * f.cantidad, 0);
  const totalConRecargo = total * (1 + recargoPct / 100);

  const crearNuevoCliente = async () => {
    const nombre = busquedaCliente.trim();
    if (!nombre) return;
    const ok = await accionNuevoCliente.ejecutar(async () => {
      try {
        const nuevo = await api.post<{ id: number; nombre: string }>('/clientes', { nombre });
        setClienteId(nuevo.id);
        setClienteRefLocal(null);
        setBusquedaCliente(nuevo.nombre);
      } catch {
        const accion = await encolarClienteLocal(nombre, null);
        setClienteId(null);
        setClienteRefLocal(accion.id);
        setBusquedaCliente(`${nombre} (se creará al sincronizar)`);
      }
      setListaClientesAbierta(false);
      setErrores(null);
    });
    return ok;
  };

  const agregar = (p: Producto) => {
    setFilas((actuales) => {
      const existe = actuales.find((f) => f.producto.id === p.id);
      if (existe) {
        return actuales.map((f) =>
          f.producto.id === p.id ? { ...f, cantidad: f.cantidad + 1 } : f
        );
      }
      return [...actuales, { producto: p, cantidad: 1 }];
    });
    setBusquedaProducto('');
  };

  const cambiarCantidad = (productoId: number, delta: number) => {
    setFilas((actuales) =>
      actuales
        .map((f) =>
          f.producto.id === productoId
            ? { ...f, cantidad: Math.max(1, f.cantidad + delta) }
            : f
        )
    );
  };

  const guardar = (e: FormEvent) => {
    e.preventDefault();
    if (!clienteId && !clienteRefLocal) {
      setErrores('Selecciona el cliente de la venta');
      return;
    }
    if (!filas.length) {
      setErrores('Agrega al menos un producto');
      return;
    }
    setErrores(null);
    void onCrear(clienteId, clienteRefLocal, filas, aCredito).then((ok) => ok && onCerrar());
  };

  return (
    <Modal abierto onCerrar={onCerrar} titulo="Nueva venta" ancho="max-w-2xl">
      <form onSubmit={guardar}>
        <Campo etiqueta="Cliente *">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className={inputClase + ' pl-9'}
              placeholder="Buscar cliente…"
              value={busquedaCliente}
              onFocus={() => setListaClientesAbierta(true)}
              onChange={(e) => {
                setBusquedaCliente(e.target.value);
                setClienteId(null);
                setListaClientesAbierta(true);
              }}
            />
          </div>
          {busquedaCliente && listaClientesAbierta && (
            <ul className="mt-1.5 rounded-xl border border-slate-200 bg-white divide-y max-h-44 overflow-y-auto shadow-lg">
              {filasClientes.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setClienteId(c.id);
                      setClienteRefLocal(null);
                      setBusquedaCliente(c.nombre);
                      setListaClientesAbierta(false);
                      setErrores(null);
                    }}
                    className="w-full text-left px-3.5 py-2.5 text-sm hover:bg-slate-50"
                  >
                    {c.nombre} <span className="text-slate-400 text-xs ml-1">{c.telefono}</span>
                  </button>
                </li>
              ))}
              {filasClientes.length === 0 && (
                <li>
                  <button
                    type="button"
                    disabled={accionNuevoCliente.ocupado}
                    onClick={() => void crearNuevoCliente()}
                    className="w-full text-left px-3.5 py-2.5 text-sm font-semibold text-marca-600 hover:bg-marca-50 disabled:opacity-50"
                  >
                    {accionNuevoCliente.ocupado
                      ? 'Creando…'
                      : `+ Crear cliente "${busquedaCliente.trim()}"`}
                  </button>
                </li>
              )}
            </ul>
          )}
          {clienteRefLocal && (
            <p className="mt-2 text-xs text-amber-600 font-medium">
              Cliente nuevo sin conexión: se creará en el servidor al sincronizar, junto con esta venta.
            </p>
          )}
        </Campo>

        <Campo etiqueta="Agregar productos">
          <input
            className={inputClase}
            placeholder="Buscar por nombre o SKU…"
            value={busquedaProducto}
            onChange={(e) => setBusquedaProducto(e.target.value)}
          />
          {busquedaProducto && (
            <ul className="mt-1.5 rounded-xl border border-slate-200 bg-white divide-y max-h-44 overflow-y-auto">
              {filasProductos.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => agregar(p)}
                    className="w-full flex justify-between items-center px-3.5 py-2.5 text-sm hover:bg-slate-50"
                  >
                    <span>{p.nombre}</span>
                    <span className="text-marca-600 font-semibold">{moneda(p.precio_publico)}</span>
                  </button>
                </li>
              ))}
              {filasProductos.length === 0 && (
                <li className="px-3.5 py-2.5 text-sm text-slate-400">
                  Sin resultados en la copia local del catálogo
                </li>
              )}
            </ul>
          )}
        </Campo>

        {filas.length > 0 && (
          <div className="rounded-xl border border-slate-200 divide-y mb-4">
            {filas.map((f) => (
              <div key={f.producto.id} className="px-3.5 py-2.5 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{f.producto.nombre}</p>
                  <p className="text-xs text-slate-400">{moneda(f.producto.precio_publico)} c/u</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => cambiarCantidad(f.producto.id, -1)}
                    className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200"
                    aria-label="Menos"
                  >
                    <Minus size={14} />
                  </button>
                  <span className="w-8 text-center font-semibold">{f.cantidad}</span>
                  <button
                    type="button"
                    onClick={() => cambiarCantidad(f.producto.id, 1)}
                    className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200"
                    aria-label="Más"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <label className="flex items-center gap-2 mb-4 text-sm font-medium text-slate-600">
          <input
            type="checkbox"
            checked={aCredito}
            onChange={(e) => setACredito(e.target.checked)}
          />
          El cliente pagará a crédito (en abonos)
          {aCredito && recargoPct > 0 && (
            <span className="rounded-full bg-marca-50 text-marca-700 text-xs font-bold px-2 py-0.5">
              +{recargoPct}% al total
            </span>
          )}
        </label>

        <div className="flex justify-between items-center mb-4">
          <span className="text-slate-500 text-sm">
            {aCredito
              ? `Total a crédito (contado ${moneda(total)} + recargo)`
              : 'Total a pagar'}
          </span>
          <span className="text-2xl font-black text-slate-800">
            {moneda(aCredito ? totalConRecargo : total)}
          </span>
        </div>

        {errores && <div className="mb-3"><Alerta tipo="error" mensaje={errores} /></div>}
        {accionNuevoCliente.error && (
          <div className="mb-3">
            <Alerta tipo="error" mensaje={accionNuevoCliente.error} />
          </div>
        )}

        <div className="flex gap-3 justify-end">
          <button type="button" onClick={onCerrar} className={botonSecundario}>Cancelar</button>
          <button type="submit" className={botonPrimario}>Registrar venta</button>
        </div>
      </form>
    </Modal>
  );
}