import { pool } from '../db/pool';

export interface Balance {
  ingresos_brutos: number;
  costos_totales: number;
  utilidad_neta: number;
  cuentas_por_cobrar: number;
  caja_recibida: number;
  desglose: {
    mercaderia: { ingresos: number; costos: number; utilidad: number };
    viajes: { ingresos: number; costos: number; utilidad: number };
  };
}

export async function balance(desde: Date, hasta: Date): Promise<Balance> {
  const { rows } = await pool.query(
    `WITH merc AS (
       SELECT COALESCE(SUM(v.total), 0) AS ingresos,
              COALESCE(SUM(v.costo_total), 0) AS costos
         FROM ventas v
        WHERE v.fecha >= $1 AND v.fecha < $2
     ),
     via AS (
       SELECT COALESCE(SUM(j.total), 0) AS ingresos,
              COALESCE(SUM(j.costo_fijo), 0) AS costos
         FROM viajes j
        WHERE j.created_at >= $1 AND j.created_at < $2
     ),
     caja AS (
       SELECT COALESCE(SUM(a.monto), 0) AS total
         FROM abonos a
        WHERE a.created_at >= $1 AND a.created_at < $2
     ),
     cxc AS (
       SELECT COALESCE((SELECT SUM(v2.saldo_pendiente) FROM ventas v2 WHERE v2.estado = 'PENDIENTE'), 0)
            + COALESCE((SELECT SUM(j2.saldo_pendiente) FROM viajes j2 WHERE j2.estado = 'PENDIENTE'), 0) AS total
     )
     SELECT (SELECT ingresos FROM merc) AS ingresos_merc,
            (SELECT costos FROM merc) AS costos_merc,
            (SELECT ingresos FROM via) AS ingresos_via,
            (SELECT costos FROM via) AS costos_via,
            (SELECT total FROM caja) AS caja,
            (SELECT total FROM cxc) AS cxc`,
    [desde, hasta]
  );

  const r = rows[0];
  const ingresosMerc = Number(r.ingresos_merc);
  const costosMerc = Number(r.costos_merc);
  const ingresosVia = Number(r.ingresos_via);
  const costosVia = Number(r.costos_via);
  const ingresos = ingresosMerc + ingresosVia;
  const costos = costosMerc + costosVia;

  return {
    ingresos_brutos: ingresos,
    costos_totales: costos,
    utilidad_neta: ingresos - costos,
    cuentas_por_cobrar: Number(r.cxc),
    caja_recibida: Number(r.caja),
    desglose: {
      mercaderia: { ingresos: ingresosMerc, costos: costosMerc, utilidad: ingresosMerc - costosMerc },
      viajes: { ingresos: ingresosVia, costos: costosVia, utilidad: ingresosVia - costosVia },
    },
  };
}

export interface PuntoSerie {
  periodo: string;
  ingresos: number;
  costos: number;
  utilidad: number;
  caja: number;
}

export async function seriesMensuales(desde: Date, hasta: Date): Promise<PuntoSerie[]> {
  const { rows } = await pool.query(
    `WITH meses AS (
       SELECT to_char(generate_series(date_trunc('month', $1::timestamptz),
                                     date_trunc('month', $2::timestamptz), '1 month'), 'YYYY-MM') AS periodo
     ),
     v_m AS (
       SELECT to_char(date_trunc('month', v.fecha), 'YYYY-MM') AS periodo,
              SUM(v.total) AS ingresos, SUM(v.costo_total) AS costos
         FROM ventas v
        WHERE v.fecha BETWEEN $1 AND $2
        GROUP BY 1
     ),
     j_m AS (
       SELECT to_char(date_trunc('month', j.created_at), 'YYYY-MM') AS periodo,
              SUM(j.total) AS ingresos, SUM(j.costo_fijo) AS costos
         FROM viajes j
        WHERE j.created_at BETWEEN $1 AND $2
        GROUP BY 1
     ),
     a_m AS (
       SELECT to_char(date_trunc('month', a.created_at), 'YYYY-MM') AS periodo,
              SUM(a.monto) AS caja
         FROM abonos a
        WHERE a.created_at BETWEEN $1 AND $2
        GROUP BY 1
     )
     SELECT m.periodo,
            COALESCE(v.ingresos, 0) + COALESCE(j.ingresos, 0) AS ingresos,
            COALESCE(v.costos, 0) + COALESCE(j.costos, 0) AS costos,
            COALESCE(v.ingresos, 0) + COALESCE(j.ingresos, 0)
              - COALESCE(v.costos, 0) - COALESCE(j.costos, 0) AS utilidad,
            COALESCE(a.caja, 0) AS caja
       FROM meses m
       LEFT JOIN v_m v ON v.periodo = m.periodo
       LEFT JOIN j_m j ON j.periodo = m.periodo
       LEFT JOIN a_m a ON a.periodo = m.periodo
      ORDER BY m.periodo`,
    [desde, hasta]
  );
  return rows as PuntoSerie[];
}

export interface Deudor {
  id: number;
  nombre: string;
  telefono: string | null;
  saldo: number;
}

export async function cuentasPorCobrar(): Promise<{ total: number; deudores: Deudor[] }> {
  const { rows } = await pool.query(
    `WITH saldos AS (
       SELECT cliente_id, SUM(saldo_pendiente) AS saldo
         FROM ventas
        WHERE estado = 'PENDIENTE' AND cliente_id IS NOT NULL
        GROUP BY cliente_id
       UNION ALL
       SELECT cliente_id, SUM(saldo_pendiente) AS saldo
         FROM viajes
        WHERE estado = 'PENDIENTE' AND cliente_id IS NOT NULL
        GROUP BY cliente_id
     )
     SELECT c.id, c.nombre, c.telefono, COALESCE(SUM(s.saldo), 0) AS saldo
       FROM clientes c
       LEFT JOIN saldos s ON s.cliente_id = c.id
      WHERE c.activo = TRUE
      GROUP BY c.id, c.nombre, c.telefono
      ORDER BY saldo DESC
      LIMIT 25`
  );
  return {
    total: rows.reduce((acc: number, r) => acc + Number(r.saldo), 0),
    deudores: rows as Deudor[],
  };
}