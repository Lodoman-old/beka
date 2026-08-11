import { Router } from 'express';
import * as abonos from '../services/abonos.service';
import { notificarAbono } from '../services/whatsapp.service';
import {
  envolver,
  paginacion,
  numeroPositivo,
  enteroPositivo,
  opcionalTexto,
  fechaValida,
  AppError,
} from '../utils/http';

const router = Router();

router.get(
  '/',
  envolver(async (req, res) => {
    const { limite, offset } = paginacion(req.query);
    const desde = req.query.desde ? fechaValida(req.query.desde, 'desde') : undefined;
    const hasta = req.query.hasta ? fechaValida(req.query.hasta, 'hasta') : undefined;
    const filas = await abonos.listarAbonos({
      desde,
      hasta,
      ventaId: req.query.venta_id ? Number(req.query.venta_id) : undefined,
      viajeId: req.query.viaje_id ? Number(req.query.viaje_id) : undefined,
      limite,
      offset,
    });
    res.json(filas);
  })
);

router.post(
  '/',
  envolver(async (req, res) => {
    const monto = numeroPositivo(req.body?.monto, 'monto');
    const ventaId = req.body?.venta_id !== undefined && req.body?.venta_id !== null ? Number(req.body.venta_id) : null;
    const viajeId = req.body?.viaje_id !== undefined && req.body?.viaje_id !== null ? Number(req.body.viaje_id) : null;
    const pasajeroId = req.body?.pasajero_id !== undefined && req.body?.pasajero_id !== null ? Number(req.body.pasajero_id) : null;

    const resultado = await abonos.crearAbono({
      venta_id: ventaId,
      viaje_id: viajeId,
      pasajero_id: pasajeroId,
      monto,
      metodo: typeof req.body?.metodo === 'string' ? req.body.metodo : 'EFECTIVO',
      observacion: opcionalTexto(req.body?.observacion),
      registrado_por: typeof req.body?.registrado_por === 'string' ? req.body.registrado_por : 'POS',
    });

    void notificarAbono(resultado.abono, resultado.entidad);

    res.status(201).json(resultado);
  })
);

router.post(
  '/:id/reintentar-notificacion',
  envolver(async (req, res) => {
    const id = enteroPositivo(req.params.id, 'id');
    const filas = await abonos.listarAbonos({
      limite: 50,
      offset: 0,
    });
    const fila = filas.find((r) => r.id === id);
    if (!fila) throw new AppError(404, 'Abono no encontrado');
    await abonos.marcarNotificacion(id, 'PENDIENTE');
    res.json({ ok: true });
  })
);

export default router;