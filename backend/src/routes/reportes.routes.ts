import { Router } from 'express';
import * as reportes from '../services/reportes.service';
import { envolver, AppError, fechaValida } from '../utils/http';

const router = Router();

function periodoPorDefecto(): { desde: Date; hasta: Date } {
  const hasta = new Date();
  const desde = new Date(hasta.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { desde, hasta };
}

router.get(
  '/balance',
  envolver(async (req, res) => {
    const { desde, hasta } = periodoPorDefecto();
    const d = req.query.desde ? fechaValida(req.query.desde, 'desde') : desde;
    const h = req.query.hasta ? fechaValida(req.query.hasta, 'hasta') : hasta;
    if (d >= h) throw new AppError(400, 'La fecha desde debe ser anterior a hasta');

    const balance = await reportes.balance(d, h);
    const cxc = await reportes.cuentasPorCobrar();
    res.json({ ...balance, cuentas_por_cobrar: cxc.total });
  })
);

router.get(
  '/series',
  envolver(async (req, res) => {
    const hasta = new Date();
    const desde = new Date(hasta.getFullYear(), hasta.getMonth() - 5, 1);
    const d = req.query.desde ? fechaValida(req.query.desde, 'desde') : desde;
    const h = req.query.hasta ? fechaValida(req.query.hasta, 'hasta') : hasta;

    const series = await reportes.seriesMensuales(d, h);
    res.json(series);
  })
);

router.get(
  '/cuentas-por-cobrar',
  envolver(async (_req, res) => {
    const resultado = await reportes.cuentasPorCobrar();
    res.json(resultado);
  })
);

export default router;