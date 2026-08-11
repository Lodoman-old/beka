import { Router } from 'express';
import * as viajes from '../services/viajes.service';
import {
  envolver,
  paginacion,
  stringObligatorio,
  opcionalTexto,
  numeroPositivo,
  fechaValida,
  AppError,
} from '../utils/http';

const router = Router();

router.get(
  '/',
  envolver(async (req, res) => {
    const { limite, offset } = paginacion(req.query);
    const resultado = await viajes.listarViajes({
      estado: req.query.estado === 'PENDIENTE' || req.query.estado === 'LIQUIDADO' ? req.query.estado : undefined,
      busqueda: typeof req.query.busqueda === 'string' ? req.query.busqueda : undefined,
      limite,
      offset,
    });
    res.json(resultado);
  })
);

router.get(
  '/:id',
  envolver(async (req, res) => {
    const viaje = await viajes.obtenerViaje(Number(req.params.id));
    if (!viaje) throw new AppError(404, 'Viaje no encontrado');
    const pasajeros = await viajes.listarPasajeros(viaje.id);
    res.json({ ...viaje, pasajeros });
  })
);

router.post(
  '/',
  envolver(async (req, res) => {
    const destino = stringObligatorio(req.body?.destino, 'destino');
    const fechaSalida = String(req.body?.fecha_salida ?? '');
    if (!fechaSalida || Number.isNaN(Date.parse(fechaSalida))) {
      throw new AppError(400, 'El campo fecha_salida es obligatorio (YYYY-MM-DD)');
    }
    const viaje = await viajes.crearViaje({
      cliente_id: req.body?.cliente_id ? Number(req.body.cliente_id) : null,
      destino,
      fecha_salida: fechaValida(fechaSalida, 'fecha_salida').toISOString().slice(0, 10),
      fecha_regreso: req.body?.fecha_regreso ? String(req.body.fecha_regreso) : null,
      costo_fijo: numeroPositivo(req.body?.costo_fijo ?? 0, 'costo_fijo') - 0,
      precio_por_pasajero: numeroPositivo(req.body?.precio_por_pasajero ?? 0, 'precio_por_pasajero') - 0,
      notas: opcionalTexto(req.body?.notas),
    }, stringObligatorio(req.body?.registrado_por || 'WEB', 'registrado_por'));
    res.status(201).json(viaje);
  })
);

router.put(
  '/:id',
  envolver(async (req, res) => {
    const viaje = await viajes.actualizarViaje(Number(req.params.id), {
      cliente_id: req.body?.cliente_id !== undefined ? Number(req.body.cliente_id) || null : undefined,
      destino: req.body?.destino ? stringObligatorio(req.body.destino, 'destino') : undefined,
      fecha_salida: req.body?.fecha_salida ? String(req.body.fecha_salida) : undefined,
      fecha_regreso: req.body?.fecha_regreso !== undefined ? String(req.body.fecha_regreso) : undefined,
      costo_fijo: req.body?.costo_fijo !== undefined ? Number(req.body.costo_fijo) : undefined,
      precio_por_pasajero: req.body?.precio_por_pasajero !== undefined ? Number(req.body.precio_por_pasajero) : undefined,
      notas: req.body?.notas !== undefined ? opcionalTexto(req.body.notas) : undefined,
    });
    res.json(viaje);
  })
);

router.delete(
  '/:id',
  envolver(async (req, res) => {
    await viajes.eliminarViaje(Number(req.params.id));
    res.json({ ok: true });
  })
);

router.post(
  '/:id/pasajeros',
  envolver(async (req, res) => {
    const nombre = stringObligatorio(req.body?.nombre, 'nombre');
    const pasajero = await viajes.agregarPasajero(Number(req.params.id), {
      nombre,
      telefono: opcionalTexto(req.body?.telefono),
      asiento: opcionalTexto(req.body?.asiento),
    });
    res.status(201).json(pasajero);
  })
);

router.delete(
  '/pasajeros/:pasajeroId',
  envolver(async (req, res) => {
    await viajes.eliminarPasajero(Number(req.params.pasajeroId));
    res.json({ ok: true });
  })
);

export default router;