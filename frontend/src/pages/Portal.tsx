import { FormEvent, useEffect, useState } from 'react';
import { Bus, LogOut, Tag, Wallet } from 'lucide-react';
import { obtenerBaseUrl } from '../api/client';
import Logo from '../components/Logo';

const TOKEN_CLIENTE = 'beka_token_cliente';

interface Cuenta {
  tipo: 'venta' | 'viaje';
  id: number;
  total: number;
  saldo_pendiente: number;
  fecha: string;
  recargo_pct: number | null;
  abonos: { id: number; monto: number; metodo: string; fecha: string }[];
}

interface MiCuenta {
  cliente: { id: number; nombre: string; telefono: string | null };
  cuentas: Cuenta[];
  total_adeudado: number;
}

function moneda(cantidad: number): string {
  return `$${cantidad.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function Portal() {
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const [datos, setDatos] = useState<MiCuenta | null>(null);
  const [sesion, setSesion] = useState<{ nombre: string } | null>(null);

  const base = obtenerBaseUrl();

  function leerSesion() {
    const t = localStorage.getItem(TOKEN_CLIENTE);
    if (t) {
      cargarCuenta(t).catch(() => {
        localStorage.removeItem(TOKEN_CLIENTE);
        setSesion(null);
      });
    }
  }

  useEffect(() => {
    leerSesion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function cargarCuenta(token: string): Promise<void> {
    const r = await fetch(`${base}/api/portal/mi-cuenta`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) throw new Error('Sesión expirada');
    const cuerpo = (await r.json()) as MiCuenta;
    setDatos(cuerpo);
    setSesion({ nombre: cuerpo.cliente.nombre });
  }

  async function alEnviar(e: FormEvent) {
    e.preventDefault();
    setCargando(true);
    setError('');
    try {
      const r = await fetch(`${base}/api/portal/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario, password }),
      });
      const cuerpo = await r.json();
      if (!r.ok) throw new Error((cuerpo as { error?: string }).error ?? 'Error al entrar');
      localStorage.setItem(TOKEN_CLIENTE, (cuerpo as { token: string }).token);
      setSesion({ nombre: (cuerpo as { nombre: string }).nombre });
      await cargarCuenta((cuerpo as { token: string }).token);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }

  function salir() {
    localStorage.removeItem(TOKEN_CLIENTE);
    setSesion(null);
    setDatos(null);
  }

  if (sesion && datos) {
    return (
      <div className="min-h-screen bg-slate-100 pb-8">
        <div className="bg-gradient-to-r from-sky-600 via-blue-700 to-blue-900 text-white px-4 py-6">
          <div className="max-w-2xl mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Logo alto="h-11" />
              <div>
                <p className="font-black text-white">Sistema BEKA</p>
                <p className="text-xs text-sky-200">Portal de clientes</p>
              </div>
            </div>
            <button
              onClick={salir}
              className="flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 text-white px-3 py-2 rounded-xl text-sm font-medium transition"
            >
              <LogOut size={16} /> Salir
            </button>
          </div>
        </div>
        <div className="max-w-2xl mx-auto px-4 pt-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-black text-slate-900">¡Hola, {datos.cliente.nombre}!</h1>
              <p className="text-sm text-slate-500">Estas son tus cuentas pendientes</p>
            </div>
          </div>

          <div className="bg-slate-900 text-white rounded-2xl p-5 mb-6 flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-300">Total que te falta por pagar</p>
              <p className="text-3xl font-black mt-1">{moneda(datos.total_adeudado)}</p>
            </div>
            <Wallet size={40} className="text-marca-400" />
          </div>

          <div className="space-y-4">
            {datos.cuentas.length === 0 && (
              <div className="bg-white rounded-2xl p-8 text-center text-slate-500">
                🎉 ¡No tienes cuentas pendientes!
              </div>
            )}
            {datos.cuentas.map((c) => (
              <div key={`${c.tipo}-${c.id}`} className="bg-white rounded-2xl shadow-sm p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    {c.tipo === 'venta' ? (
                      <Tag size={18} className="text-marca-600" />
                    ) : (
                      <Bus size={18} className="text-marca-600" />
                    )}
                    <div>
                      <p className="font-semibold text-slate-900">
                        {c.tipo === 'venta' ? `Venta #${c.id}` : `Viaje #${c.id}`}
                      </p>
                      <p className="text-xs text-slate-400">
                        Fecha: {new Date(c.fecha).toLocaleDateString('es-MX')}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-400">Saldo pendiente</p>
                    <p className="font-black text-red-600">{moneda(c.saldo_pendiente)}</p>
                  </div>
                </div>
                {c.abonos.length > 0 && (
                  <div className="mt-4 border-t border-slate-100 pt-3">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                      Tus abonos
                    </p>
                    <div className="space-y-1">
                      {c.abonos.map((a) => (
                        <div key={a.id} className="flex items-center justify-between text-sm">
                          <span className="text-slate-600">
                            {new Date(a.fecha).toLocaleDateString('es-MX')} · {a.metodo}
                          </span>
                          <span className="font-semibold text-emerald-600">{moneda(a.monto)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          <p className="text-center text-[11px] text-slate-400 mt-8">
            {datos.cliente.telefono ? `Contacto: ${datos.cliente.telefono} · ` : ''}Sistema BEKA
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="flex items-center justify-center mb-4">
            <Logo alto="h-14" />
          </div>
          <h1 className="text-2xl font-black text-white">Consulta tus cuentas</h1>
          <p className="text-slate-400 text-sm mt-1">
            Entra con el usuario y contraseña que te enviaron por WhatsApp
          </p>
        </div>
        <form onSubmit={alEnviar} className="bg-white rounded-2xl shadow-2xl p-6 space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-slate-700 mb-1 block">Usuario</span>
            <input
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-marca-500"
              autoCapitalize="none"
              autoComplete="username"
              required
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700 mb-1 block">Contraseña</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-marca-500"
              autoComplete="current-password"
              required
            />
          </label>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={cargando}
            className="w-full bg-marca-600 hover:bg-marca-700 text-white font-semibold py-2.5 rounded-xl transition disabled:opacity-60"
          >
            {cargando ? 'Entrando...' : 'Ver mis cuentas'}
          </button>
        </form>
      </div>
    </div>
  );
}