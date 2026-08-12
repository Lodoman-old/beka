import { ReactNode, useEffect, useRef, useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import Layout from './components/Layout';
import PantallaBloqueo from './components/PantallaBloqueo';
import { ConfirmarProvider } from './components/Confirmar';
import Login from './pages/Login';
import Portal from './pages/Portal';
import Dashboard from './pages/Dashboard';
import Clientes from './pages/Clientes';
import Ventas from './pages/Ventas';
import VentaDetalle from './pages/VentaDetalle';
import Pedidos from './pages/Pedidos';
import Viajes from './pages/Viajes';
import ViajeDetalle from './pages/ViajeDetalle';
import Abonos from './pages/Abonos';
import Catalogo from './pages/Catalogo';
import Configuracion from './pages/Configuracion';
import Offline from './pages/Offline';
import { actualizarCache, sincronizarCola } from './lib/sincronizador';
import { api, guardarToken, haySesionAdmin } from './api/client';
import {
  biometriaDisponible,
  entrarConBiometria,
} from './lib/biometria';

function Protegida({ children }: { children: ReactNode }) {
  const ubicacion = useLocation();
  if (!haySesionAdmin()) {
    return <Navigate to="/login" state={{ desde: ubicacion.pathname }} replace />;
  }
  return <>{children}</>;
}

export default function App() {
  const [puerta, setPuerta] = useState<'comprobando' | 'bloqueada' | 'abierta'>('comprobando');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const intentoInicial = useRef(false);

  async function abrirConHuella() {
    setCargando(true);
    setError('');
    const credenciales = await entrarConBiometria();
    if (!credenciales) {
      setError('Huella no reconocida o no disponible');
      setCargando(false);
      return;
    }
    try {
      const respuesta = await api.publica.post<{ token: string }>('/auth/login', {
        usuario: credenciales.usuario,
        password: credenciales.password,
      });
      guardarToken(respuesta.token);
      setPuerta('abierta');
    } catch (e) {
      setError((e as Error).message);
      setCargando(false);
    }
  }

  function usarContrasena() {
    localStorage.removeItem('beka_token_admin');
    setPuerta('abierta');
  }

  useEffect(() => {
    void (async () => {
      if (!haySesionAdmin()) {
        setPuerta('abierta');
        return;
      }
      const huella = Capacitor.isNativePlatform() && (await biometriaDisponible());
      if (!huella) {
        setPuerta('abierta');
        return;
      }
      setPuerta('bloqueada');
      if (intentoInicial.current) return;
      intentoInicial.current = true;
      const credenciales = await entrarConBiometria();
      if (!credenciales) {
        setError('Huella no reconocida o no disponible');
        return;
      }
      try {
        const respuesta = await api.publica.post<{ token: string }>('/auth/login', {
          usuario: credenciales.usuario,
          password: credenciales.password,
        });
        guardarToken(respuesta.token);
        setPuerta('abierta');
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, []);

  useEffect(() => {
    const alVolverRed = () => {
      if (!haySesionAdmin()) return;
      void actualizarCache().catch(() => undefined);
      void sincronizarCola().catch(() => undefined);
    };
    if (navigator.onLine && haySesionAdmin()) alVolverRed();
    window.addEventListener('online', alVolverRed);
    return () => window.removeEventListener('online', alVolverRed);
  }, []);

  if (puerta === 'comprobando') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <span className="text-3xl font-black text-white tracking-tight">
          BEKA<span className="text-marca-500">.</span>
        </span>
      </div>
    );
  }

  if (puerta === 'bloqueada') {
    return (
      <PantallaBloqueo
        cargando={cargando}
        error={error}
        onHuella={() => void abrirConHuella()}
        onContrasena={usarContrasena}
      />
    );
  }

  return (
    <ConfirmarProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/portal" element={<Portal />} />
        <Route
          path="*"
          element={
            <Protegida>
              <Layout>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/clientes" element={<Clientes />} />
                  <Route path="/ventas" element={<Ventas />} />
                  <Route path="/ventas/:id" element={<VentaDetalle />} />
                  <Route path="/pedidos" element={<Pedidos />} />
                  <Route path="/viajes" element={<Viajes />} />
                  <Route path="/viajes/:id" element={<ViajeDetalle />} />
                  <Route path="/abonos" element={<Abonos />} />
                  <Route path="/catalogo" element={<Catalogo />} />
                  <Route path="/configuracion" element={<Configuracion />} />
                  <Route path="/offline" element={<Offline />} />
                </Routes>
              </Layout>
            </Protegida>
          }
        />
      </Routes>
    </ConfirmarProvider>
  );
}
