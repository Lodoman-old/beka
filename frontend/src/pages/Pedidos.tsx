import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Minus, Search, Trash2, CheckCheck, ShoppingCart, PackageCheck, Tag } from 'lucide-react';
import { api, q } from '../api/client';
import { Pedido, PedidoDetalle, ItemPedidos, Producto, Cliente } from '../api/types';
import { useApi, useAccion } from '../hooks/useApi';
import { cacheProductos, cacheClientes } from '../lib/sincronizador';
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
import { moneda, fechaCorta } from '../lib/format';

interface FilaNueva {
  producto: Producto;
  cantidad: number;
}

interface FilaConversion extends PedidoDetalle {
  incluido: boolean;
  cantidadVenta: number;
}

const COLORES_ESTADO: Record<string, string> = {
  PENDIENTE: 'bg-amber-100 text-amber-700',
  ENTREGADO: 'bg-sky-100 text-sky-700',
  CONVERTIDO: 'bg-emerald-100 text-emerald-700',
};

const NOMBRE_ESTADO: Record<string, string> = {
  PENDIENTE: 'Pendiente',
  ENTREGADO: 'Entregado',
  CONVERTIDO: 'Convertido',
};

function BadgePedido({ estado }: { estado: string }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
        COLORES_ESTADO[estado] ?? 'bg-slate-100 text-slate-600'
      }`}
    >
      {NOMBRE_ESTADO[estado] ?? estado}
    </span>
  );
}

export default function Pedidos() {
  const [nuevoAbierto, setNuevoAbierto] = useState(false);
  const [seleccion, setSeleccion] = useState<Pedido | null>(null);
  const [convirtiendo, setConvirtiendo] = useState(false);

  const listado = useApi<ItemPedidos>(() => api.get(`/pedidos${q({ limite: '60' })}`), []);
  const accion = useAccion();

  const verDetalle = (p: Pedido) => {
    setSeleccion(p);
    void api.get<Pedido>(`/pedidos/${p.id}`).then((completa) => setSeleccion(completa));
  };

  const crear = async (clienteId: number, filas: FilaNueva[]) => {
    const ok = await accion.ejecutar(async () => {
      await api.post('/pedidos', {
        cliente_id: clienteId,
        items: filas.map((f) => ({ producto_id: f.producto.id, cantidad: f.cantidad })),
      });
      setNuevoAbierto(false);
      await listado.recargar();
    });
    return ok;
  };

  const marcarEntregado = (p: Pedido) => {
    if (!confirm(`¿Marcar el pedido #${p.id} de ${p.cliente_nombre} como entregado?`)) return;
    void accion.ejecutar(async () => {
      await api.post(`/pedidos/${p.id}/entregar`);
      await listado.recargar();
      void verDetalle({ ...p, estado: 'ENTREGADO' });
    });
  };

  const eliminar = (p: Pedido) => {
    if (!confirm(`¿Eliminar el pedido #${p.id} de ${p.cliente_nombre}?`)) return;
    void accion.ejecutar(async () => {
      await api.del(`/pedidos/${p.id}`);
      setSeleccion(null);
      await listado.recargar();
    });
  };

  return (
    <div>
      <EncabezadoPagina
        titulo="Pedidos"
        subtitulo={`${listado.datos?.total ?? 0} registrados`}
        accion={
          <button onClick={() => setNuevoAbierto(true)} className={botonPrimario}>
            <Plus size={18} /> Nuevo pedido
          </button>
        }
      />

      {accion.error && <div className="mb-4"><Alerta tipo="error" mensaje={accion.error} /></div>}

      {listado.cargando ? (
        <Cargando />
      ) : !listado.datos?.filas.length ? (
        <Vacio mensaje="No hay pedidos. Crea el primer pedido para tu cliente." />
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
                    <th className="px-3 py-3 font-medium">Artículos</th>
                    <th className="px-3 py-3 font-medium">Total</th>
                    <th className="px-3 py-3 font-medium">Estado</th>
                    <th className="px-5 py-3 font-medium text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {listado.datos.filas.map((p) => (
                    <tr
                      key={p.id}
                      className="border-b border-slate-50 hover:bg-slate-50 cursor-pointer"
                      onClick={() => verDetalle(p)}
                    >
                      <td className="px-5 py-3 font-semibold text-slate-700">#{p.id}</td>
                      <td className="px-3 py-3">{p.cliente_nombre}</td>
                      <td className="px-3 py-3 text-slate-500">{fechaCorta(p.fecha)}</td>
                      <td className="px-3 py-3 text-slate-600">{p.articulos_count ?? 0}</td>
                      <td className="px-3 py-3 font-medium">{moneda(p.total_pedido ?? 0)}</td>
                      <td className="px-3 py-3"><BadgePedido estado={p.estado} /></td>
                      <td className="px-5 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-2">
                          {p.estado === 'PENDIENTE' && (
                            <button
                              onClick={() => marcarEntregado(p)}
                              className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 text-emerald-700 px-2.5 py-1.5 text-xs font-semibold hover:bg-emerald-100"
                            >
                              <CheckCheck size={14} /> Entregar
                            </button>
                          )}
                          {p.estado !== 'CONVERTIDO' && (
                            <button
                              onClick={() => eliminar(p)}
                              className="p-2 rounded-lg hover:bg-red-50 text-red-400"
                              aria-label="Eliminar"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:hidden">
            {listado.datos.filas.map((p) => (
              <Card key={p.id} className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-slate-800">#{p.id} · {p.cliente_nombre}</span>
                  <BadgePedido estado={p.estado} />
                </div>
                <p className="text-xs text-slate-500">{fechaCorta(p.fecha)}</p>
                <div className="flex justify-between items-center mt-3">
                  <div>
                    <p className="text-sm text-slate-500">Total</p>
                    <p className="font-bold text-slate-800">{moneda(p.total_pedido ?? 0)}</p>
                  </div>
                  {p.estado === 'PENDIENTE' ? (
                    <button onClick={() => marcarEntregado(p)} className={botonPrimario + ' !py-2'}>
                      <CheckCheck size={16} /> Entregar
                    </button>
                  ) : (
                    <button onClick={() => verDetalle(p)} className={botonSecundario + ' !py-2'}>
                      Ver
                    </button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {nuevoAbierto && <ModalNuevoPedido onCerrar={() => setNuevoAbierto(false)} onCrear={crear} />}

      {seleccion && (
        <Modal
          abierto={!!seleccion}
          onCerrar={() => setSeleccion(null)}
          titulo={`Pedido #${seleccion.id} · ${seleccion.cliente_nombre}`}
          ancho="max-w-2xl"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <BadgePedido estado={seleccion.estado} />
              <span className="text-xs text-slate-400">{fechaCorta(seleccion.fecha)}</span>
            </div>
          </div>

          <div className="space-y-2 mb-4">
            {seleccion.detalles?.map((d) => (
              <div key={d.id} className="flex items-center justify-between text-sm border-b border-slate-50 pb-2">
                <div className="min-w-0">
                  <p className="font-medium text-slate-700 truncate">{d.producto_nombre}</p>
                  <p className="text-xs text-slate-400">SKU {d.sku} × {d.cantidad}</p>
                </div>
                <span className="font-semibold shrink-0">{moneda(d.precio_unitario * d.cantidad)}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-between text-sm mb-4">
            <span className="text-slate-500">Total del pedido</span>
            <span className="font-bold">{moneda(seleccion.total_pedido ?? 0)}</span>
          </div>

          {seleccion.estado === 'PENDIENTE' && (
            <div className="flex gap-3">
              <button onClick={() => setSeleccion(null)} className={botonSecundario + ' flex-1'}>
                Cerrar
              </button>
              <button
                onClick={() => marcarEntregado(seleccion)}
                disabled={accion.ocupado}
                className={botonPrimario + ' flex-1'}
              >
                <CheckCheck size={18} /> Marcar entregado
              </button>
            </div>
          )}

          {seleccion.estado === 'ENTREGADO' && (
            <div className="flex gap-3">
              <button onClick={() => setSeleccion(null)} className={botonSecundario + ' flex-1'}>
                Cerrar
              </button>
              <button
                onClick={() => setConvirtiendo(true)}
                disabled={!seleccion.detalles?.length}
                className={botonPrimario + ' flex-1 disabled:opacity-50'}
              >
                <Tag size={18} /> Convertir en venta
              </button>
            </div>
          )}

          {seleccion.estado === 'CONVERTIDO' && (
            <div className="flex gap-3">
              <button onClick={() => setSeleccion(null)} className={botonSecundario + ' flex-1'}>
                Cerrar
              </button>
              <Link to={`/ventas`} className={botonPrimario + ' flex-1'}>
                Ir a ventas
              </Link>
            </div>
          )}
        </Modal>
      )}

      {seleccion && seleccion.estado === 'ENTREGADO' && convirtiendo && (
        <ModalConvertir
          pedido={seleccion}
          onCerrar={() => setConvirtiendo(false)}
          onConvertido={() => {
            setConvirtiendo(false);
            setSeleccion(null);
            void listado.recargar();
          }}
        />
      )}
    </div>
  );
}

function ModalNuevoPedido({
  onCerrar,
  onCrear,
}: {
  onCerrar: () => void;
  onCrear: (clienteId: number, filas: FilaNueva[]) => Promise<boolean>;
}) {
  const [clienteId, setClienteId] = useState<number | null>(null);
  const [busquedaCliente, setBusquedaCliente] = useState('');
  const [listaClientesAbierta, setListaClientesAbierta] = useState(false);
  const [busquedaProducto, setBusquedaProducto] = useState('');
  const [filas, setFilas] = useState<FilaNueva[]>([]);
  const [errores, setErrores] = useState<string | null>(null);
  const [clientesCache, setClientesCache] = useState<Cliente[]>([]);
  const [productosCache, setProductosCache] = useState<Producto[]>([]);
  const accion = useAccion();

  useEffect(() => {
    void cacheClientes().then(setClientesCache);
    void cacheProductos().then(setProductosCache);
  }, []);

  const textoBusquedaCliente = busquedaCliente.toLowerCase();
  const textoBusquedaProducto = busquedaProducto.toLowerCase();
  const filasClientes = clientesCache.filter(
    (c) => c.activo && c.nombre.toLowerCase().includes(textoBusquedaCliente)
  );
  const filasProductos = productosCache.filter(
    (p) =>
      p.activo &&
      (p.nombre + ' ' + p.sku).toLowerCase().includes(textoBusquedaProducto)
  );

  const total = filas.reduce((acc, f) => acc + f.producto.precio_publico * f.cantidad, 0);

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
    if (!clienteId) {
      setErrores('Selecciona el cliente del pedido');
      return;
    }
    if (!filas.length) {
      setErrores('Agrega al menos un producto');
      return;
    }
    setErrores(null);
    void onCrear(clienteId, filas).then((ok) => ok && onCerrar());
  };

  return (
    <Modal abierto onCerrar={onCerrar} titulo="Nuevo pedido" ancho="max-w-2xl">
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
                <li className="px-3.5 py-2.5 text-sm text-slate-400">Sin resultados</li>
              )}
            </ul>
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

        {errores && <div className="mb-3"><Alerta tipo="error" mensaje={errores} /></div>}
        {accion.error && <div className="mb-3"><Alerta tipo="error" mensaje={accion.error} /></div>}

        <div className="flex items-center justify-between mb-4">
          <span className="text-slate-500 text-sm">Total del pedido</span>
          <span className="text-2xl font-black text-slate-800">{moneda(total)}</span>
        </div>

        <div className="flex gap-3 justify-end">
          <button type="button" onClick={onCerrar} className={botonSecundario}>Cancelar</button>
          <button type="submit" className={botonPrimario}>
            <ShoppingCart size={16} /> Registrar pedido
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ModalConvertir({
  pedido,
  onCerrar,
  onConvertido,
}: {
  pedido: Pedido;
  onCerrar: () => void;
  onConvertido: () => void;
}) {
  const [detalles, setDetalles] = useState<FilaConversion[]>(
    () => (pedido.detalles ?? []).map((d) => ({ ...d, incluido: true, cantidadVenta: d.cantidad }))
  );
  const [errores, setErrores] = useState<string | null>(null);
  const accion = useAccion();

  const total = detalles
    .filter((d) => d.incluido && d.cantidadVenta > 0)
    .reduce((acc, d) => acc + d.precio_hoy * d.cantidadVenta, 0);

  const guardar = (e: FormEvent) => {
    e.preventDefault();
    if (!detalles.some((d) => d.incluido && d.cantidadVenta > 0)) {
      setErrores('Incluye al menos un producto en la venta');
      return;
    }
    setErrores(null);
    void accion.ejecutar(async () => {
      await api.post(`/pedidos/${pedido.id}/convertir`, {
        items: detalles.map((d) => ({
          pedido_detalle_id: d.id,
          incluir: d.incluido && d.cantidadVenta > 0,
          cantidad: d.cantidadVenta > 0 ? d.cantidadVenta : 1,
        })),
      });
      onConvertido();
    });
  };

  return (
    <Modal abierto onCerrar={onCerrar} titulo={`Convertir pedido #${pedido.id} en venta`} ancho="max-w-2xl">
      <form onSubmit={guardar}>
        <p className="text-sm text-slate-500 mb-4">
          Desmarca los productos que no van a la venta y ajusta las cantidades (el precio se toma
          del catálogo de hoy, día de la entrega).
        </p>
        <div className="rounded-xl border border-slate-200 divide-y mb-4">
          {detalles.map((d) => (
            <div key={d.id} className="px-3.5 py-2.5 flex items-center gap-3">
              <input
                type="checkbox"
                checked={d.incluido}
                onChange={(e) =>
                  setDetalles((actuales) =>
                    actuales.map((a) =>
                      a.id === d.id ? { ...a, incluido: e.target.checked } : a
                    )
                  )
                }
                className="w-4 h-4 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <p className={"text-sm font-medium truncate" + (d.incluido ? '' : ' text-slate-400 line-through')}>
                  {d.producto_nombre}
                </p>
                <p className="text-xs text-slate-400">
                  pedido {d.cantidad} · {moneda(d.precio_hoy)} hoy
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={!d.incluido}
                  onClick={() =>
                    setDetalles((actuales) =>
                      actuales.map((a) =>
                        a.id === d.id
                          ? { ...a, cantidadVenta: Math.max(0, a.cantidadVenta - 1) }
                          : a
                      )
                    )
                  }
                  className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-40"
                  aria-label="Menos"
                >
                  <Minus size={14} />
                </button>
                <span className="w-8 text-center font-semibold">{d.cantidadVenta}</span>
                <button
                  type="button"
                  disabled={!d.incluido || d.cantidadVenta >= d.cantidad}
                  onClick={() =>
                    setDetalles((actuales) =>
                      actuales.map((a) =>
                        a.id === d.id
                          ? { ...a, cantidadVenta: Math.min(a.cantidad, a.cantidadVenta + 1) }
                          : a
                      )
                    )
                  }
                  className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-40"
                  aria-label="Más"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 mb-4 text-xs text-slate-400">
          <PackageCheck size={14} /> Lo que no se incluya se queda fuera de la venta (no cobrado).
        </div>
        <div className="flex justify-between items-center mb-4">
          <span className="text-slate-500 text-sm">Total de la venta</span>
          <span className="text-2xl font-black text-slate-800">{moneda(total)}</span>
        </div>
        {errores && <div className="mb-3"><Alerta tipo="error" mensaje={errores} /></div>}
        {accion.error && <div className="mb-3"><Alerta tipo="error" mensaje={accion.error} /></div>}
        <div className="flex gap-3 justify-end">
          <button type="button" onClick={onCerrar} className={botonSecundario}>Cancelar</button>
          <button type="submit" disabled={accion.ocupado} className={botonPrimario}>
            <Tag size={16} /> {accion.ocupado ? 'Creando venta…' : 'Crear venta'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export const _NOMBRE_ESTADO = NOMBRE_ESTADO;