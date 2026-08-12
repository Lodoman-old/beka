import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Wallet,
  FileText,
  Undo2,
  Plus,
  Minus,
  Tag,
  PackageX,
} from 'lucide-react';
import { api, q, descargarComprobante } from '../api/client';
import { Venta, Abono, DetalleVenta, Producto, ResultadoDevolucion } from '../api/types';
import { useApi, useAccion } from '../hooks/useApi';
import { cacheProductos } from '../lib/sincronizador';
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
} from '../components/ui';
import { moneda, fechaCorta } from '../lib/format';

interface FilaDevolucion {
  detalle: DetalleVenta;
  cantidad: number;
}

interface FilaEntrega {
  producto: Producto;
  cantidad: number;
}

export default function VentaDetalle() {
  const { id } = useParams();
  const ventaId = Number(id || 0);

  const venta = useApi<Venta>(() => api.get(`/ventas/${ventaId}`), [ventaId]);
  const abonos = useApi<Abono[]>(
    () => api.get(`/abonos${q({ venta_id: ventaId, limite: '100' })}`),
    [ventaId]
  );
  const accion = useAccion();
  const [devolucionAbierta, setDevolucionAbierta] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const datos = venta.datos;
  const abonado = (abonos.datos ?? []).reduce((acc, a) => acc + a.monto, 0);

  const avisar = (mensaje: string) => {
    setAviso(mensaje);
    setTimeout(() => setAviso(null), 8000);
  };

  const devolver = (filas: FilaDevolucion[], entregas: FilaEntrega[], motivo: string | null) => {
    void accion.ejecutar(async () => {
      const resultado = await api.post<ResultadoDevolucion>(`/ventas/${ventaId}/devolucion`, {
        devueltos: filas
          .filter((f) => f.cantidad > 0)
          .map((f) => ({ venta_detalle_id: f.detalle.id, cantidad: f.cantidad })),
        entregados: entregas
          .filter((f) => f.cantidad > 0)
          .map((f) => ({ producto_id: f.producto.id, cantidad: f.cantidad })),
        motivo: motivo || null,
      });
      setDevolucionAbierta(false);
      if (resultado.devolucion.reembolso_dinero > 0) {
        avisar(
          `Devolución registrada: regresa ${moneda(resultado.devolucion.reembolso_dinero)} al cliente.`
        );
      } else if (resultado.venta.saldo_pendiente >= 0) {
        avisar(
          `Devolución registrada: la cuenta del cliente queda en ${moneda(resultado.venta.saldo_pendiente)}.`
        );
      }
      venta.recargar();
      abonos.recargar();
    });
  };

  if (venta.cargando) return <Cargando />;
  if (!datos) return <Alerta tipo="error" mensaje={venta.error ?? 'Venta no encontrada'} />;

  const recargoPct = datos.recargo_pct ?? 0;
  const base = (datos.detalles ?? []).reduce(
    (acc, d) => acc + d.precio_unitario * d.cantidad,
    0
  );

  return (
    <div>
      <Link
        to="/ventas"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-marca-600 mb-4"
      >
        <ArrowLeft size={16} /> Todas las ventas
      </Link>

      <Card className="p-5 mb-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-800 flex items-center gap-2.5">
              <span className="p-2 rounded-xl bg-marca-50 text-marca-600">
                <Tag size={22} />
              </span>
              Venta #{datos.id}
            </h1>
            <p className="text-sm text-slate-500 mt-1.5">
              {datos.cliente_nombre}
              {datos.cliente_telefono ? ` · ${datos.cliente_telefono}` : ''} ·{' '}
              {fechaCorta(datos.fecha)}
            </p>
            {datos.notas && <p className="text-xs text-slate-400 mt-1">Nota: {datos.notas}</p>}
          </div>
          <Badge estado={datos.estado} />
        </div>

        <div className="grid grid-cols-3 gap-3 mt-5 text-center">
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Total</p>
            <p className="font-bold text-slate-800">{moneda(datos.total)}</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Abonado</p>
            <p className="font-bold text-emerald-600">{moneda(abonado)}</p>
          </div>
          <div className="rounded-xl bg-red-50 p-3">
            <p className="text-xs text-red-400">Saldo pendiente</p>
            <p className="font-bold text-red-600">{moneda(datos.saldo_pendiente)}</p>
          </div>
        </div>
      </Card>

      {aviso && <div className="mb-4"><Alerta tipo="exito" mensaje={aviso} /></div>}
      {accion.error && <div className="mb-4"><Alerta tipo="error" mensaje={accion.error} /></div>}

      <Card className="overflow-hidden mb-5">
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-slate-800">Productos</h2>
          <span className="text-sm text-slate-400">
            {recargoPct > 0
              ? `recargo ${recargoPct}% aplicado (${moneda(datos.recargo_monto ?? 0)})`
              : 'a contado'}
          </span>
        </div>
        <div className="divide-y divide-slate-50">
          {(datos.detalles ?? []).map((d) => (
            <div key={d.id} className="px-5 py-3 flex items-center justify-between text-sm">
              <div className="min-w-0">
                <p className="font-medium text-slate-700 truncate">{d.producto_nombre}</p>
                <p className="text-xs text-slate-400">
                  SKU {d.sku} · {moneda(d.precio_unitario)} c/u
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-semibold text-slate-800">
                  {d.cantidad} × {moneda(d.precio_unitario)}
                </p>
                <p className="text-xs text-slate-400">{moneda(d.precio_unitario * d.cantidad)}</p>
              </div>
            </div>
          ))}
          {!datos.detalles?.length && (
            <p className="px-5 py-4 text-sm text-slate-400">Sin productos</p>
          )}
          {recargoPct > 0 && (
            <div className="px-5 py-3 flex justify-between text-sm text-slate-500">
              <span>Base del recargo</span>
              <span>{moneda(base)}</span>
            </div>
          )}
          <div className="px-5 py-3 flex justify-between text-sm font-bold text-slate-800">
            <span>Total</span>
            <span>{moneda(datos.total)}</span>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden mb-5">
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-slate-800">Abonos</h2>
          <span className="text-sm font-medium text-emerald-600">{moneda(abonado)}</span>
        </div>
        <div className="divide-y divide-slate-50">
          {(abonos.datos ?? []).map((a) => (
            <div key={a.id} className="px-5 py-3 flex items-center justify-between text-sm">
              <div className="min-w-0">
                <p className="font-medium text-slate-700">{moneda(a.monto)}</p>
                <p className="text-xs text-slate-400">
                  {a.metodo} · {fechaCorta(a.created_at)}
                  {a.notificacion_whatsapp === 'FALLIDA' || a.notificacion_whatsapp === 'PENDIENTE'
                    ? ' · WhatsApp pendiente'
                    : ''}
                </p>
              </div>
            </div>
          ))}
          {!abonos.datos?.length && (
            <p className="px-5 py-4 text-sm text-slate-400">No hay abonos registrados</p>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Link to={`/abonos?venta=${datos.id}`} className={botonPrimario + ' w-full'}>
          <Wallet size={18} /> Registrar abono
        </Link>
        <button
          onClick={() =>
            void descargarComprobante(
              `/comprobantes/venta/${datos.id}`,
              `venta-${datos.id}.pdf`
            ).catch(() => undefined)
          }
          className={botonSecundario + ' w-full'}
        >
          <FileText size={18} /> Recibo PDF
        </button>
        <button
          onClick={() => setDevolucionAbierta(true)}
          disabled={!datos.detalles?.length}
          className={botonSecundario + ' w-full disabled:opacity-50'}
        >
          <Undo2 size={18} /> Devolución
        </button>
      </div>

      {devolucionAbierta && (
        <ModalDevolucion
          detalles={datos.detalles ?? []}
          abonado={abonado}
          recargoPct={recargoPct}
          ventaId={datos.id}
          ocupado={accion.ocupado}
          onCerrar={() => setDevolucionAbierta(false)}
          onEnviar={devolver}
        />
      )}
    </div>
  );
}

function ModalDevolucion({
  detalles,
  abonado,
  recargoPct,
  ventaId,
  ocupado,
  onCerrar,
  onEnviar,
}: {
  detalles: DetalleVenta[];
  abonado: number;
  recargoPct: number;
  ventaId: number;
  ocupado: boolean;
  onCerrar: () => void;
  onEnviar: (filas: FilaDevolucion[], entregas: FilaEntrega[], motivo: string | null) => void;
}) {
  const [devoluciones, setDevoluciones] = useState<FilaDevolucion[]>(
    detalles.map((d) => ({ detalle: d, cantidad: 0 }))
  );
  const [entregas, setEntregas] = useState<FilaEntrega[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [productosCache, setProductosCache] = useState<Producto[]>([]);
  const [motivo, setMotivo] = useState('');
  const [errores, setErrores] = useState<string | null>(null);

  useEffect(() => {
    void cacheProductos().then(setProductosCache);
  }, []);

  const textoBinario = busqueda.toLowerCase();
  const resultados = productosCache.filter(
    (p) =>
      p.activo &&
      (p.nombre + ' ' + p.sku).toLowerCase().includes(textoBinario) &&
      !entregas.some((f) => f.producto.id === p.id)
  );

  const baseRestante = devoluciones.reduce(
    (acc, f) => acc + (f.detalle.cantidad - f.cantidad) * f.detalle.precio_unitario,
    0
  );
  const baseEntregas = entregas.reduce(
    (acc, f) => acc + f.producto.precio_publico * f.cantidad,
    0
  );
  const valorDevuelto = devoluciones.reduce(
    (acc, f) => acc + f.cantidad * f.detalle.precio_unitario,
    0
  );
  const baseNueva = baseRestante + baseEntregas;
  const nuevoTotal = baseNueva;
  const reembolso = Math.max(0, abonado - nuevoTotal);
  const saldoNuevo = Math.max(0, nuevoTotal - abonado);
  const algoDevuelto = devoluciones.some((f) => f.cantidad > 0);

  const cambiarCantidad = (detalleId: number, delta: number) => {
    setDevoluciones((actuales) =>
      actuales.map((f) =>
        f.detalle.id === detalleId
          ? {
              ...f,
              cantidad: Math.max(0, Math.min(f.detalle.cantidad, f.cantidad + delta)),
            }
          : f
      )
    );
  };

  const agregar = (p: Producto) => {
    setEntregas((actuales) => {
      const existe = actuales.find((f) => f.producto.id === p.id);
      if (existe) {
        return actuales.map((f) =>
          f.producto.id === p.id ? { ...f, cantidad: f.cantidad + 1 } : f
        );
      }
      return [...actuales, { producto: p, cantidad: 1 }];
    });
    setBusqueda('');
  };

  const cambiarEntrega = (productoId: number, delta: number) => {
    setEntregas((actuales) =>
      actuales
        .map((f) =>
          f.producto.id === productoId ? { ...f, cantidad: f.cantidad + delta } : f
        )
        .filter((f) => f.cantidad > 0)
    );
  };

  const quitarEntrega = (productoId: number) => {
    setEntregas((actuales) => actuales.filter((f) => f.producto.id !== productoId));
  };

  const confirmar = () => {
    if (!algoDevuelto) {
      setErrores('Indica cuántos productos se devuelven');
      return;
    }
    setErrores(null);
    onEnviar(devoluciones, entregas, motivo.trim() || null);
  };

  return (
    <Modal abierto onCerrar={onCerrar} titulo={`Devolución · venta #${ventaId}`} ancho="max-w-2xl">
      <p className="text-sm text-slate-500 mb-4">
        Marca qué y cuánto se devuelve. Si se cambia por otro producto, agrégalo abajo; el precio
        de los reemplazos se toma del catálogo de hoy. El saldo y la deuda se ajustan solos.
      </p>

      <div className="rounded-xl border border-slate-200 divide-y mb-4">
        {devoluciones.map((f) => (
          <div key={f.detalle.id} className="px-3.5 py-2.5 flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{f.detalle.producto_nombre}</p>
              <p className="text-xs text-slate-400">
                comprado {f.detalle.cantidad} · {moneda(f.detalle.precio_unitario)} c/u
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={f.cantidad === 0}
                onClick={() => cambiarCantidad(f.detalle.id, -1)}
                className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-40"
                aria-label="Menos"
              >
                <Minus size={14} />
              </button>
              <span className={`w-8 text-center font-semibold ${f.cantidad > 0 ? 'text-red-600' : ''}`}>
                {f.cantidad}
              </span>
              <button
                type="button"
                disabled={f.cantidad >= f.detalle.cantidad}
                onClick={() => cambiarCantidad(f.detalle.id, 1)}
                className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-40"
                aria-label="Más"
              >
                <Plus size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <Campo etiqueta="Cambiar por otro producto (opcional)">
        <input
          className={inputClase}
          placeholder="Buscar producto de reemplazo…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
        {busqueda && (
          <ul className="mt-1.5 rounded-xl border border-slate-200 bg-white divide-y max-h-40 overflow-y-auto">
            {resultados.map((p) => (
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
            {resultados.length === 0 && (
              <li className="px-3.5 py-2.5 text-sm text-slate-400">Sin resultados</li>
            )}
          </ul>
        )}
      </Campo>

      {entregas.length > 0 && (
        <div className="rounded-xl border border-slate-200 divide-y mb-4">
          {entregas.map((f) => (
            <div key={f.producto.id} className="px-3.5 py-2.5 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{f.producto.nombre}</p>
                <p className="text-xs text-slate-400">{moneda(f.producto.precio_publico)} c/u</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => cambiarEntrega(f.producto.id, -1)}
                  className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200"
                  aria-label="Menos"
                >
                  <Minus size={14} />
                </button>
                <span className="w-8 text-center font-semibold">{f.cantidad}</span>
                <button
                  type="button"
                  onClick={() => cambiarEntrega(f.producto.id, 1)}
                  className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200"
                  aria-label="Más"
                >
                  <Plus size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => quitarEntrega(f.producto.id)}
                  className="p-1.5 rounded-lg hover:bg-red-50 text-red-400"
                  aria-label="Quitar"
                >
                  <PackageX size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Campo etiqueta="Motivo (opcional)">
        <input
          className={inputClase}
          placeholder="Ej. cambio de talla, artículo defectuoso…"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
        />
      </Campo>

<div className="rounded-xl bg-slate-50 p-4 mb-4 space-y-1.5 text-sm">
        <div className="flex justify-between text-slate-500">
          <span>Valor devuelto</span>
          <span className="text-red-600 font-medium">− {moneda(valorDevuelto)}</span>
        </div>
        {entregas.length > 0 && (
          <div className="flex justify-between text-slate-500">
            <span>Valor de los reemplazos</span>
            <span className="text-emerald-600 font-medium">+ {moneda(baseEntregas)}</span>
          </div>
        )}
        {recargoPct > 0 && (
          <p className="text-[11px] text-amber-600">
            Sin recargo en la devolución: el porcentaje ({recargoPct}%) deja de aplicarse a esta venta.
          </p>
        )}
        <div className="flex justify-between font-bold text-slate-800">
          <span>Nuevo total de la venta</span>
          <span>{moneda(nuevoTotal)}</span>
        </div>
        <div className="flex justify-between text-slate-500 border-t border-slate-200 pt-1.5">
          <span>Ya abonado</span>
          <span>{moneda(abonado)}</span>
        </div>
        <div className="flex justify-between font-semibold">
          <span>Saldo pendiente del cliente</span>
          <span className="text-red-600">{moneda(saldoNuevo)}</span>
        </div>
        {reembolso > 0 && (
          <div className="flex justify-between font-semibold text-emerald-700 bg-emerald-50 -mx-4 px-4 py-2 rounded-b-xl">
            <span>Dinero a regresar al cliente</span>
            <span>{moneda(reembolso)}</span>
          </div>
        )}
      </div>

      {errores && <div className="mb-3"><Alerta tipo="error" mensaje={errores} /></div>}

      <div className="flex gap-3 justify-end">
        <button type="button" onClick={onCerrar} className={botonSecundario}>
          Cancelar
        </button>
        <button
          type="button"
          onClick={confirmar}
          disabled={ocupado || !algoDevuelto}
          className={botonPrimario}
        >
          <Undo2 size={16} /> {ocupado ? 'Registrando…' : 'Registrar devolución'}
        </button>
      </div>
    </Modal>
  );
}