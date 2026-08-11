import { ReactNode } from 'react';
import { NavLink, Link } from 'react-router-dom';
import {
  Home,
  Users,
  Wallet,
  Bus,
  Tag,
  Package,
  Settings,
  CloudOff,
  LogOut,
} from 'lucide-react';
import { cerrarSesion } from '../api/client';
import Logo from './Logo';

const enlaces = [
  { a: '/', etiqueta: 'Inicio', Icono: Home },
  { a: '/abonos', etiqueta: 'Abonos', Icono: Wallet },
  { a: '/ventas', etiqueta: 'Ventas', Icono: Tag },
  { a: '/viajes', etiqueta: 'Viajes', Icono: Bus },
  { a: '/catalogo', etiqueta: 'Catálogo', Icono: Package },
  { a: '/clientes', etiqueta: 'Clientes', Icono: Users },
];

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-100 md:pl-64">
      <aside className="hidden md:flex fixed inset-y-0 left-0 w-64 bg-slate-900 flex-col z-40">
        <div className="px-6 py-6 border-b border-slate-800">
          <Logo alto="h-12">
            <span className="text-2xl font-black text-white tracking-tight">
              BEKA<span className="text-marca-500">.</span>
            </span>
          </Logo>
          <p className="text-xs text-slate-400 mt-2">Gestión de negocio</p>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {enlaces.map(({ a, etiqueta, Icono }) => (
            <NavLink
              key={a}
              to={a}
              end={a === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
                  isActive
                    ? 'bg-marca-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`
              }
            >
              <Icono size={18} />
              {etiqueta}
            </NavLink>
          ))}
          <NavLink
            to="/offline"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
                isActive
                  ? 'bg-marca-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`
            }
          >
            <CloudOff size={18} />
            Sin conexión
          </NavLink>
          <NavLink
            to="/configuracion"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
                isActive
                  ? 'bg-marca-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`
            }
          >
            <Settings size={18} />
            Configuración
          </NavLink>
        </nav>
        <div className="px-3 py-4 border-t border-slate-800 space-y-1">
          <div className="px-3.5 text-[11px] text-slate-500">Sistema BEKA v1.0</div>
          <button
            onClick={cerrarSesion}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium text-slate-300 hover:bg-red-600/20 hover:text-red-400 transition"
          >
            <LogOut size={18} />
            Salir
          </button>
        </div>
      </aside>

      <header className="md:hidden sticky top-0 z-40 bg-gradient-to-r from-sky-600 via-blue-700 to-blue-900 px-4 py-2.5 flex items-center justify-between shadow-lg">
        <Logo alto="h-10">
          <span className="font-black text-white">
            BEKA<span className="text-sky-300">.</span>
          </span>
        </Logo>
        <div className="flex items-center gap-1">
          <Link to="/offline" className="p-2 text-white/80 hover:text-white" title="Modo sin conexión">
            <CloudOff size={20} />
          </Link>
          <Link to="/configuracion" className="p-2 text-white/80 hover:text-white">
            <Settings size={20} />
          </Link>
          <button
            onClick={cerrarSesion}
            className="p-2 text-white/80 hover:text-white"
            title="Salir"
          >
            <LogOut size={20} />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 md:px-8 pt-4 md:pt-8 pb-28 md:pb-10">
        {children}
      </main>

      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-slate-200 grid grid-cols-6 pb-[env(safe-area-inset-bottom)]">
        {enlaces.map(({ a, etiqueta, Icono }) => (
          <NavLink
            key={a}
            to={a}
            end={a === '/'}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium transition ${
                isActive ? 'text-marca-600' : 'text-slate-400'
              }`
            }
          >
            <Icono size={20} />
            {etiqueta}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}