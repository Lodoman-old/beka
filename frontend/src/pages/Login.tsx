import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { Fingerprint, KeyRound, LogIn, Server } from 'lucide-react';
import PantallaBloqueo from '../components/PantallaBloqueo';
import Logo from '../components/Logo';
import {
  api,
  guardarToken,
  guardarUrlServidor,
  haySesionAdmin,
  obtenerBaseUrl,
} from '../api/client';
import {
  biometriaDisponible,
  entrarConBiometria,
  guardarCredencialesBiometricas,
} from '../lib/biometria';

interface RespuestaLogin {
  token: string;
}

export default function Login() {
  const nav = useNavigate();
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [servidor, setServidor] = useState(obtenerBaseUrl());
  const [hayHuella, setHayHuella] = useState(false);
  const [bloqueo, setBloqueo] = useState(false);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    void (async () => {
      if (haySesionAdmin()) {
        const esMovil = Capacitor.isNativePlatform();
        const huella = await biometriaDisponible();
        if (esMovil && huella) {
          setHayHuella(true);
          setBloqueo(true);
          const credenciales = await entrarConBiometria();
          if (credenciales) {
            await entrar(credenciales.usuario, credenciales.password);
            return;
          }
          localStorage.removeItem('beka_token_admin');
          setBloqueo(false);
          return;
        }
        nav('/', { replace: true });
        return;
      }
      const huella = await biometriaDisponible();
      if (huella) setHayHuella(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav]);

  async function entrar(u: string, p: string, urlServidor?: string) {
    setCargando(true);
    setError('');
    try {
      if (urlServidor) guardarUrlServidor(urlServidor.trim());
      const respuesta = await api.publica.post<RespuestaLogin>('/auth/login', {
        usuario: u,
        password: p,
      });
      guardarToken(respuesta.token);
      void guardarCredencialesBiometricas(u, p);
      nav('/', { replace: true });
    } catch (e) {
      setError((e as Error).message);
      setBloqueo(false);
    } finally {
      setCargando(false);
    }
  }

  async function alEnviar(e: FormEvent) {
    e.preventDefault();
    await entrar(usuario, password, servidor);
  }

  async function porHuella() {
    setError('');
    setCargando(true);
    const credenciales = await entrarConBiometria();
    if (!credenciales) {
      setError('Huella no reconocida o no disponible');
      setCargando(false);
      setBloqueo(false);
      localStorage.removeItem('beka_token_admin');
      return;
    }
    await entrar(credenciales.usuario, credenciales.password);
  }

  function usarContrasena() {
    localStorage.removeItem('beka_token_admin');
    setBloqueo(false);
  }

  if (bloqueo) {
    return (
      <PantallaBloqueo
        cargando={cargando}
        error={error}
        onHuella={() => void porHuella()}
        onContrasena={usarContrasena}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="flex items-center justify-center">
            <Logo alto="h-24">
              <span className="text-4xl font-black text-white tracking-tight">
                BEKA<span className="text-marca-500">.</span>
              </span>
            </Logo>
          </div>
          <p className="text-slate-400 text-sm mt-1">Inicia sesión como administrador</p>
        </div>
        <form onSubmit={alEnviar} className="bg-white rounded-2xl shadow-2xl p-6 space-y-4">
          {!obtenerBaseUrl() && (
            <label className="block">
              <span className="text-sm font-medium text-slate-700 mb-1 block">
                Dirección del servidor
              </span>
              <div className="relative">
                <Server
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  value={servidor}
                  onChange={(e) => setServidor(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-marca-500"
                  inputMode="url"
                  placeholder="https://tudominio.com"
                  required
                />
              </div>
            </label>
          )}
          <label className="block">
            <span className="text-sm font-medium text-slate-700 mb-1 block">Usuario</span>
            <div className="relative">
              <KeyRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={usuario}
                onChange={(e) => setUsuario(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-marca-500"
                autoCapitalize="none"
                autoComplete="username"
                required
              />
            </div>
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
            className="w-full flex items-center justify-center gap-2 bg-marca-600 hover:bg-marca-700 text-white font-semibold py-2.5 rounded-xl transition disabled:opacity-60"
          >
            <LogIn size={16} />
            {cargando ? 'Entrando...' : 'Entrar'}
          </button>
          {hayHuella && (
            <button
              type="button"
              onClick={() => void porHuella()}
              disabled={cargando}
              className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold py-2.5 rounded-xl transition disabled:opacity-60"
            >
              <Fingerprint size={16} />
              Entrar con huella
            </button>
          )}
        </form>
        <p className="text-center text-[11px] text-slate-500 mt-4">
          Servidor: <span className="font-mono">{obtenerBaseUrl() || '(sin configurar)'}</span>
        </p>
      </div>
    </div>
  );
}