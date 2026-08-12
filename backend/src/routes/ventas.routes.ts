import { Router } from 'express';
import * as ventas from '../services/ventas.service';
import {
  envolver,
  paginacion,
  stringObligatorio,
  opcionalTexto,
  enteroPositivo,
  AppError,
} from '../utils/http';

const router = Router();

router.get(
  '/',
  envolver(async (req, res) => {
    const { limite, offset } = paginacion(req.query);
    const estado = req.query.estado === 'LIQUIDADO' ? 'LIQUIDADO' : req.query.estado === 'PENDIENTE' ? 'PENDIENTE' : undefined;
    const resultado = await ventas.listarVentas({
      clienteId: req.query.cliente_id ? Number(req.query.cliente_id) : undefined,
      estado,
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
    const venta = await ventas.obtenerVenta(Number(req.params.id));
    if (!venta) throw new AppError(404, 'Venta no encontrada');
    res.json(venta);
  })
);

router.post(
  '/',
  envolver(async (req, res) => {
    const clienteId = enteroPositivo(req.body?.cliente_id, 'cliente_id');
    const items = req.body?.items;
    if (!Array.isArray(items) || items.length === 0) {
      throw new AppError(400, 'La venta necesita al menos un articulo en items');
    }
    const normalizados = items.map((item: { producto_id?: unknown; cantidad?: unknown }) => ({
      producto_id: enteroPositivo(item?.producto_id, 'producto_id'),
      cantidad: enteroPositivo(item?.cantidad, 'cantidad'),
    }));
    const venta = await ventas.crearVenta(
      clienteId,
      normalizados,
      opcionalTexto(req.body?.notas),
      stringObligatorio(req.body?.registrado_por || 'WEB', 'registrado_por'),
      req.body?.a_credito === true
    );
    res.status(201).json(venta);
  })
);

router.post(
  '/:id/devolucion',
  envolver(async (req, res) => {
    const devueltos = Array.isArray(req.body?.devueltos)
      ? req.body.devueltos.map(
          (item: { venta_detalle_id?: unknown; cantidad?: unknown }) => ({
            venta_detalle_id: enteroPositivo(item?.venta_detalle_id, 'venta_detalle_id'),
            cantidad: enteroPositivo(item?.cantidad, 'cantidad'),
          })
        )
      : [];
    const entregados = Array.isArray(req.body?.entregados)
      ? req.body.entregados.map(
          (item: { producto_id?: unknown; cantidad?: unknown }) => ({
            producto_id: enteroPositivo(item?.producto_id, 'producto_id'),
            cantidad: enteroPositivo(item?.cantidad, 'cantidad'),
          })
        )
      : [];
    const resultado = await ventas.devolverArticulos(
      Number(req.params.id),
      devueltos,
      entregados,
      opcionalTexto(req.body?.motivo)
    );
    res.json(resultado);
  })
);

router.delete(
  '/:id',
  envolver(async (req, res) => {
    await ventas.eliminarVenta(Number(req.params.id));
    res.json({ ok: true });
  })
);

export default router;