import { Link } from 'react-router-dom';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts';
import { TrendingUp, Wallet, PiggyBank, AlertCircle, ChevronRight } from 'lucide-react';
import { api, q } from '../api/client';
import { Balance, PuntoSerie, Deudor, Abono } from '../api/types';
import { useApi } from '../hooks/useApi';
import { Card, Cargando, Vacio, Alerta } from '../components/ui';
import { moneda, corto, etiquetaMes, fechaHora, inicioDeMes, vaciarTexto } from '../lib/format';

export default function Dashboard() {
  const balance = useApi<Balance>(() =>
    api.get<Balance>(`/reportes/balance${q({ desde: inicioDeMes() })}`)
  );
  const series = useApi<PuntoSerie[]>(() =>
    api.get<PuntoSerie[]>('/reportes/series')
  );
  const deudores = useApi<{ total: number; deudores: Deudor[] }>(() =>
    api.get('/reportes/cuentas-por-cobrar')
  );
  const abonosHoy = useApi<Abono[]>(() =>
    api.get<Abono[]>(
      `/abonos${q({ desde: new Date(new Date().setHours(0, 0, 0, 0)).toISOString(), limite: '8' })}`
    )
  );

  if (balance.cargando) return <Cargando />;

  const datos = balance.datos;
  if (!datos) return <Alerta tipo="error" mensaje={balance.error ?? 'Sin datos'} />;

  const pasaAWhatsapp = (telefono: string | null) => {
    const limpio = vaciarTexto(telefono);
    return limpio ? `https://wa.me/52${limpio}` : '#';
  };

  const tarjetas = [
    {
      etiqueta: 'Utilidad del mes',
      valor: moneda(datos.utilidad_neta),
      Icono: TrendingUp,
      clase: 'bg-emerald-50 text-emerald-600',
    },
    {
      etiqueta: 'Ingresos brutos',
      valor: corto(datos.ingresos_brutos),
      Icono: PiggyBank,
      clase: 'bg-marca-50 text-marca-600',
    },
    {
      etiqueta: 'Costos del mes',
      valor: corto(datos.costos_totales),
      Icono: Wallet,
      clase: 'bg-slate-100 text-slate-600',
    },
    {
      etiqueta: 'Cuentas por cobrar',
      valor: corto(datos.cuentas_por_cobrar),
      Icono: AlertCircle,
      clase: 'bg-red-50 text-red-500',
    },
  ];

  return (
    <div>
      <h1 className="text-xl md:text-2xl font-bold text-slate-800 mb-1">Panel de control</h1>
      <p className="text-sm text-slate-500 mb-5">
        Balance del mes en curso · Caja recibida: <span className="font-semibold text-emerald-600">{moneda(datos.caja_recibida)}</span>
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {tarjetas.map(({ etiqueta, valor, Icono, clase }) => (
          <Card key={etiqueta} className="p-4">
            <div className={`inline-flex p-2.5 rounded-xl ${clase} mb-3`}>
              <Icono size={20} />
            </div>
            <p className="text-2xl font-bold text-slate-800 leading-tight">{valor}</p>
            <p className="text-xs text-slate-500 mt-1">{etiqueta}</p>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mb-6">
        <Card className="p-5">
          <h2 className="font-semibold text-slate-800 mb-4">Utilidad neta por mes</h2>
          {series.datos && series.datos.length ? (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={series.datos}>
                <defs>
                  <linearGradient id="gUtil" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="periodo" tickFormatter={etiquetaMes} tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => `$${Number(v) / 1000}k`} tick={{ fontSize: 11 }} width={50} />
                <Tooltip formatter={(v) => moneda(Number(v))} />
                <Area
                  type="monotone"
                  dataKey="utilidad"
                  name="Utilidad"
                  stroke="#6366f1"
                  strokeWidth={2}
                  fill="url(#gUtil)"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <Vacio mensaje="Sin datos suficientes para graficar" />
          )}
        </Card>

        <Card className="p-5">
          <h2 className="font-semibold text-slate-800 mb-4">Ingresos vs costos por mes</h2>
          {series.datos && series.datos.length ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={series.datos}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="periodo" tickFormatter={etiquetaMes} tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => `$${Number(v) / 1000}k`} tick={{ fontSize: 11 }} width={50} />
                <Tooltip formatter={(v) => moneda(Number(v))} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="ingresos" name="Ingresos" fill="#6366f1" radius={[6, 6, 0, 0]} />
                <Bar dataKey="costos" name="Costos" fill="#f59e0b" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <Vacio mensaje="Sin datos suficientes para graficar" />
          )}
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="overflow-hidden">
          <div className="px-5 pt-5 pb-3 flex items-center justify-between">
            <h2 className="font-semibold text-slate-800">Principales deudores</h2>
            <span className="text-xs text-slate-500">{corto(deudores.datos?.total ?? 0)} total</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                  <th className="px-5 py-2 font-medium">Cliente</th>
                  <th className="px-3 py-2 font-medium">Saldo</th>
                  <th className="px-5 py-2 font-medium text-right">Contactar</th>
                </tr>
              </thead>
              <tbody>
                {deudores.datos?.deudores.slice(0, 8).map((d) => (
                  <tr key={d.id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="px-5 py-2.5 font-medium text-slate-700">{d.nombre}</td>
                    <td className="px-3 py-2.5 font-semibold text-red-500">{corto(d.saldo)}</td>
                    <td className="px-5 py-2.5 text-right">
                      <a
                        href={pasaAWhatsapp(d.telefono)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-marca-600 hover:text-marca-700 text-xs font-semibold"
                      >
                        WhatsApp
                      </a>
                    </td>
                  </tr>
                ))}
                {!deudores.datos?.deudores.length && (
                  <tr>
                    <td colSpan={3} className="px-5 py-6 text-center text-slate-400">
                      Sin deudas pendientes. ¡Todo liquidado!
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="px-5 pt-5 pb-3 flex items-center justify-between">
            <h2 className="font-semibold text-slate-800">Abonos recibidos hoy</h2>
            <Link to="/abonos" className="text-xs font-semibold text-marca-600 flex items-center gap-0.5">
              Registrar <ChevronRight size={14} />
            </Link>
          </div>
          <ul className="divide-y divide-slate-50">
            {abonosHoy.datos?.map((a) => (
              <li key={a.id} className="px-5 py-2.5 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-700 truncate">
                    {a.cliente_nombre || 'Cliente'}
                  </p>
                  <p className="text-xs text-slate-400">{fechaHora(a.created_at)}</p>
                </div>
                <span className="text-sm font-semibold text-emerald-600 shrink-0">
                  +{moneda(a.monto)}
                </span>
              </li>
            ))}
            {!abonosHoy.datos?.length && (
              <li className="px-5 py-6 text-center text-slate-400 text-sm">
                Aún no hay abonos registrados hoy
              </li>
            )}
          </ul>
        </Card>
      </div>
    </div>
  );
}