import { FormEvent, useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Search, ScanLine, X, RefreshCw, Package, Plus } from 'lucide-react';
import { api, q } from '../api/client';
import { Producto, ItemCatalog } from '../api/types';
import { useApi, useAccion } from '../hooks/useApi';
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
import { moneda, msjError } from '../lib/format';
import { subirImagenProducto, descripcionPeso } from '../lib/imagen';

export default function Catalogo() {
  const [busqueda, setBusqueda] = useState('');
  const [escaneando, setEscaneando] = useState(false);
  const [editar, setEditar] = useState<Producto | null>(null);
  const [skuBuscado, setSkuBuscado] = useState('');
  const [resultadoSku, setResultadoSku] = useState<Producto | null>(null);
  const [tarjeta, setTarjeta] = useState<null | { tipo: 'error' | 'exito'; msg: string }>(null);
  const [nuevo, setNuevo] = useState(false);
  const [formNuevo, setFormNuevo] = useState({ sku: '', nombre: '', precio_costo: '', imagen: '' });
  const [subiendoNuevo, setSubiendoNuevo] = useState(false);

  const manejarArchivoNuevo = async (archivo: File | undefined) => {
    if (!archivo) return;
    try {
      setSubiendoNuevo(true);
      const pesoOriginal = descripcionPeso(archivo);
      const url = await subirImagenProducto(archivo);
      setFormNuevo((f) => ({ ...f, imagen: url }));
      setTarjeta({ tipo: 'exito', msg: `Imagen subida (${pesoOriginal} → comprimida)` });
    } catch (e) {
      setTarjeta({ tipo: 'error', msg: msjError(e) });
    } finally {
      setSubiendoNuevo(false);
    }
  };

  const listado = useApi<ItemCatalog>(
    () => api.get(`/catalogo${q({ busqueda, limite: '60' })}`),
    [busqueda]
  );
  const accion = useAccion();

  const buscarSkuManual = async (sku: string) => {
    const limpio = sku.trim();
    if (!limpio) return;
    setSkuBuscado('');
    try {
      const p = await api.get<Producto>(`/catalogo/sku/${encodeURIComponent(limpio)}`);
      setResultadoSku(p);
      setTarjeta(null);
    } catch (e) {
      setTarjeta({ tipo: 'error', msg: `SKU ${limpio} no encontrado en el catálogo` });
      setResultadoSku(null);
    }
  };

  const guardarEdicion = async (datos: Partial<Producto>) => {
    if (!editar) return;
    const ok = await accion.ejecutar(async () => {
      await api.put(`/catalogo/${editar.id}`, {
        nombre: datos.nombre ?? editar.nombre,
        precio_costo: datos.precio_costo ?? editar.precio_costo,
        activo: datos.activo ?? editar.activo,
        sku: editar.sku,
        imagen: datos.imagen !== undefined ? datos.imagen : editar.imagen,
      });
      setEditar(null);
      await listado.recargar();
    });
    if (ok) setTarjeta({ tipo: 'exito', msg: 'Producto actualizado' });
  };

  const crearProducto = async (e: FormEvent) => {
    e.preventDefault();
    const ok = await accion.ejecutar(async () => {
      await api.post('/catalogo', {
        sku: formNuevo.sku.trim(),
        nombre: formNuevo.nombre.trim(),
        precio_costo: Number(formNuevo.precio_costo),
        imagen: formNuevo.imagen.trim() || null,
      });
      setNuevo(false);
      setFormNuevo({ sku: '', nombre: '', precio_costo: '', imagen: '' });
      await listado.recargar();
    });
    if (ok) setTarjeta({ tipo: 'exito', msg: 'Producto agregado al catálogo' });
  };

  return (
    <div className="max-w-4xl">
      <EncabezadoPagina
        titulo="Catálogo de productos"
        subtitulo={`${listado.datos?.total ?? 0} productos sincronizados de NICE`}
        accion={
          <div className="flex gap-2">
            <button onClick={() => setNuevo(true)} className={botonSecundario}>
              <Plus size={18} /> Nuevo producto
            </button>
            <button onClick={() => setEscaneando(true)} className={botonPrimario}>
              <ScanLine size={18} /> Escanear
            </button>
          </div>
        }
      />

      <div className="flex gap-2 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className={inputClase + ' pl-10'}
            placeholder="Buscar por nombre o SKU…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
      </div>

      <form
        className="flex gap-2 mb-4"
        onSubmit={(e) => {
          e.preventDefault();
          void buscarSkuManual(skuBuscado);
        }}
      >
        <input
          className={inputClase}
          placeholder="Escribir código SKU (código de barras)…"
          value={skuBuscado}
          onChange={(e) => setSkuBuscado(e.target.value)}
        />
        <button
          type="submit"
          className={botonSecundario + ' shrink-0'}
          onClick={() => void buscarSkuManual(skuBuscado)}
        >
          Consultar
        </button>
      </form>

      {tarjeta && <div className="mb-4"><Alerta tipo={tarjeta.tipo} mensaje={tarjeta.msg} /></div>}

      {resultadoSku && (
        <Card className="p-4 mb-5 border-marca-200">
          <div className="flex items-center gap-3">
            <img
              src={resultadoSku.imagen || undefined}
              referrerPolicy="no-referrer"
              alt=""
              className="w-16 h-16 rounded-xl object-cover bg-slate-100 shrink-0"
            />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-marca-600">SKU {resultadoSku.sku}</p>
              <p className="font-semibold text-slate-800 truncate">{resultadoSku.nombre}</p>
              <p className="text-sm text-slate-500">
                Costo <span className="line-through">{moneda(resultadoSku.precio_costo)}</span>
                {' · '}
                <span className="font-bold text-emerald-600 not-italic">
                  {moneda(resultadoSku.precio_publico)}
                </span>
              </p>
            </div>
            <button
              onClick={() => setEditar(resultadoSku)}
              className={botonSecundario + ' shrink-0 !py-2'}
            >
              Editar
            </button>
          </div>
        </Card>
      )}

      {listado.cargando ? (
        <Cargando />
      ) : !listado.datos?.filas.length ? (
        <Vacio mensaje="Sin productos. Ejecuta la sincronización NICE en Configuración." />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
          {listado.datos.filas.map((p) => (
            <Card key={p.id} className="p-3 hover:shadow-md transition cursor-pointer" >
              <button className="block w-full text-left" onClick={() => setEditar(p)}>
                <div className="w-full h-24 rounded-xl bg-slate-100 overflow-hidden mb-2">
                  {p.imagen ? (
                    <img
                      src={p.imagen}
                      referrerPolicy="no-referrer"
                      alt={p.nombre}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-300">
                      <Package size={28} />
                    </div>
                  )}
                </div>
                <p className="text-[10px] font-semibold text-marca-600 truncate">{p.sku}</p>
                <p className="text-sm font-medium text-slate-700 line-clamp-2 min-h-[2.5rem]">
                  {p.nombre}
                </p>
                <div className="mt-1.5 flex items-baseline gap-1.5">
                  <span className="font-bold text-emerald-600">{moneda(p.precio_publico)}</span>
                  <span className="text-[10px] text-slate-300 line-through">
                    {moneda(p.precio_costo)}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400">margen {p.margen_aplicado}%</p>
              </button>
            </Card>
          ))}
        </div>
      )}

      {escaneando && (
        <Escáner
          onCerrar={() => setEscaneando(false)}
          onSku={(sku) => {
            setEscaneando(false);
            void buscarSkuManual(sku);
          }}
        />
      )}

      <Modal
        abierto={!!editar}
        onCerrar={() => setEditar(null)}
        titulo={editar ? `Editar · ${editar.sku}` : ''}
      >
        {editar && (
          <FormProducto
            producto={editar}
            guardar={guardarEdicion}
            ocupado={accion.ocupado}
            error={accion.error}
          />
        )}
      </Modal>

      <Modal
        abierto={nuevo}
        onCerrar={() => setNuevo(false)}
        titulo="Nuevo producto en el catálogo"
      >
        <form onSubmit={crearProducto}>
          <Campo etiqueta="SKU (código del producto) *">
            <input
              required
              className={inputClase}
              placeholder="Ej. NICE-1003"
              value={formNuevo.sku}
              onChange={(e) => setFormNuevo({ ...formNuevo, sku: e.target.value })}
            />
          </Campo>
          <Campo etiqueta="Nombre *">
            <input
              required
              className={inputClase}
              placeholder="Ej. Leggins mujer"
              value={formNuevo.nombre}
              onChange={(e) => setFormNuevo({ ...formNuevo, nombre: e.target.value })}
            />
          </Campo>
          <Campo etiqueta="Precio de costo ($) *">
            <input
              required
              className={inputClase}
              inputMode="decimal"
              placeholder="Ej. 350"
              value={formNuevo.precio_costo}
              onChange={(e) => setFormNuevo({ ...formNuevo, precio_costo: e.target.value })}
            />
          </Campo>
<Campo etiqueta="URL de la imagen">
            <input
              className={inputClase}
              placeholder="https://…"
              inputMode="url"
              value={formNuevo.imagen}
              onChange={(e) => setFormNuevo({ ...formNuevo, imagen: e.target.value })}
            />
          </Campo>
          <div className="flex items-center gap-3 mb-4">
            <label
              className={
                botonSecundario +
                ' cursor-pointer !py-2 text-sm' +
                (subiendoNuevo ? ' opacity-50 pointer-events-none' : '')
              }
            >
              {subiendoNuevo ? 'Comprimiendo y subiendo…' : 'Subir imagen del archivo'}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={(e) => {
                  void manejarArchivoNuevo(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </label>
            {formNuevo.imagen && (
              <img
                src={formNuevo.imagen}
                referrerPolicy="no-referrer"
                alt="Vista previa"
                className="w-10 h-10 rounded-lg object-cover border border-slate-200 bg-white"
              />
            )}
          </div>
          <p className="text-xs text-slate-400 mb-4">
            La imagen se comprime automáticamente (máx. 900 px) antes de subirse. Si hay Cloudinary
            configurado, se aloja ahí; si no, en el servidor.
          </p>
          {accion.error && <div className="mb-3"><Alerta tipo="error" mensaje={accion.error} /></div>}
          <div className="flex gap-3 justify-end">
            <button type="button" onClick={() => setNuevo(false)} className={botonSecundario}>
              Cancelar
            </button>
            <button type="submit" disabled={accion.ocupado} className={botonPrimario}>
              <Plus size={16} /> Agregar producto
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function FormProducto({
  producto,
  guardar,
  ocupado,
  error,
}: {
  producto: Producto;
  guardar: (datos: Partial<Producto> & { margen?: number }) => void;
  ocupado: boolean;
  error: string | null;
}) {
  const [nombre, setNombre] = useState(producto.nombre);
  const [costo, setCosto] = useState(String(producto.precio_costo));
  const [margen, setMargen] = useState(String(producto.margen_aplicado));
  const [imagen, setImagen] = useState(producto.imagen ?? '');
  const [activo, setActivo] = useState(producto.activo);
  const [subiendo, setSubiendo] = useState(false);
  const [errorSubir, setErrorSubir] = useState<string | null>(null);

  const manejarArchivo = async (archivo: File | undefined) => {
    if (!archivo) return;
    try {
      setSubiendo(true);
      setErrorSubir(null);
      const url = await subirImagenProducto(archivo);
      setImagen(url);
    } catch (e) {
      setErrorSubir(msjError(e));
    } finally {
      setSubiendo(false);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        guardar({
          nombre,
          precio_costo: Number(costo),
          margen: Number(margen),
          activo,
          imagen: imagen.trim() || null,
        });
      }}
    >
      <Campo etiqueta="Nombre">
        <input className={inputClase} value={nombre} onChange={(e) => setNombre(e.target.value)} />
      </Campo>
      <Campo etiqueta="Precio de costo ($)">
        <input
          className={inputClase}
          inputMode="decimal"
          value={costo}
          onChange={(e) => setCosto(e.target.value)}
        />
      </Campo>
      <Campo etiqueta="Margen de ganancia (%) — solo este producto">
        <input
          className={inputClase}
          inputMode="decimal"
          value={margen}
          onChange={(e) => setMargen(e.target.value.replace(/[^0-9.]/g, ''))}
        />
      </Campo>
      <Campo etiqueta="URL de la imagen">
        <input
          className={inputClase}
          inputMode="url"
          placeholder="https://…"
          value={imagen}
          onChange={(e) => setImagen(e.target.value)}
        />
      </Campo>
      <div className="flex items-center gap-3 mb-4">
        <label
          className={
            botonSecundario +
            ' cursor-pointer !py-2 text-sm' +
            (subiendo ? ' opacity-50 pointer-events-none' : '')
          }
        >
          {subiendo ? 'Comprimiendo y subiendo…' : 'Subir imagen del archivo'}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              void manejarArchivo(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </label>
        {imagen && (
          <img
            src={imagen}
            referrerPolicy="no-referrer"
            alt="Vista previa"
            className="w-10 h-10 rounded-lg object-cover border border-slate-200 bg-white"
          />
        )}
      </div>
      {errorSubir && (
        <div className="mb-3">
          <Alerta tipo="error" mensaje={errorSubir} />
        </div>
      )}
      <p className="text-sm text-slate-500 mb-4">
        Precio al público calculado:{' '}
        <span className="font-bold text-emerald-600">
          {moneda(Number(costo) * (1 + (Number(margen) || 0) / 100))}
        </span>{' '}
        (margen {margen || 0}% de este producto, independiente del margen general)
      </p>
      <label className="flex items-center gap-2 mb-4 text-sm font-medium text-slate-600">
        <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
        Producto activo
      </label>
      {error && <div className="mb-3"><Alerta tipo="error" mensaje={error} /></div>}
      <button type="submit" disabled={ocupado} className={botonPrimario + ' w-full'}>
        <RefreshCw size={16} /> Guardar cambios
      </button>
    </form>
  );
}

function Escáner({ onCerrar, onSku }: { onCerrar: () => void; onSku: (sku: string) => void }) {
  const contenedor = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [activo, setActivo] = useState(false);

  useEffect(() => {
    let lector: Html5Qrcode | null = null;

    const iniciar = async () => {
      if (!contenedor.current) return;
      try {
        lector = new Html5Qrcode('lector-beka');
        await lector.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 260, height: 260 } },
          (texto) => {
            void lector?.stop().catch(() => undefined);
            setActivo(false);
            onSku(texto);
          },
          () => undefined
        );
        setActivo(true);
      } catch (e) {
        setError(
          'No se pudo acceder a la cámara. Verifica el permiso de cámara del navegador o escribe el SKU manualmente.'
        );
        console.error(msjError(e));
      }
    };
    void iniciar();

    return () => {
      if (lector) void lector.stop().catch(() => undefined);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <h3 className="font-semibold">Escanear código de barras</h3>
        <button onClick={onCerrar} className="p-2" aria-label="Cerrar">
          <X size={22} />
        </button>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        <div ref={contenedor} id="lector-beka" className="w-full max-w-sm rounded-2xl overflow-hidden" />
        {error ? (
          <p className="text-amber-300 text-sm mt-4 text-center">{error}</p>
        ) : (
          <p className="text-slate-300 text-sm mt-4 text-center">
            {activo ? 'Apunta la cámara al código de barras del producto' : 'Iniciando cámara…'}
          </p>
        )}
      </div>
      <button onClick={onCerrar} className="mx-auto mb-8 w-4/5 max-w-sm py-3 rounded-2xl bg-white text-black font-bold">
        Cancelar
      </button>
    </div>
  );
}