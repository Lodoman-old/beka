import { Router } from 'express';
import * as pedidos from '../services/pedidos.service';
import {
  envolver,
  paginacion,
  opcionalTexto,
  enteroPositivo,
  AppError,
} from '../utils/http';

const router = Router();

router.get(
  '/',
  envolver(async (req, res) => {
    const { limite, offset } = paginacion(req.query);
    const estado =
      req.query.estado === 'ENTREGADO'
        ? 'ENTREGADO'
        : req.query.estado === 'PENDIENTE'
          ? 'PENDIENTE'
          : undefined;
    const resultado = await pedidos.listarPedidos({
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
    const pedido = await pedidos.obtenerPedido(Number(req.params.id));
    if (!pedido) throw new AppError(404, 'Pedido no encontrado');
    res.json(pedido);
  })
);

router.post(
  '/',
  envolver(async (req, res) => {
    const clienteId = enteroPositivo(req.body?.cliente_id, 'cliente_id');
    const items = req.body?.items;
    if (!Array.isArray(items) || items.length === 0) {
      throw new AppError(400, 'El pedido necesita al menos un articulo en items');
    }
    const normalizados = items.map((item: { producto_id?: unknown; cantidad?: unknown }) => ({
      producto_id: enteroPositivo(item?.producto_id, 'producto_id'),
      cantidad: enteroPositivo(item?.cantidad, 'cantidad'),
    }));
    const pedido = await pedidos.crearPedido(
      clienteId,
      normalizados,
      opcionalTexto(req.body?.notas),
      'WEB'
    );
    res.status(201).json(pedido);
  })
);

router.post(
  '/:id/entregar',
  envolver(async (req, res) => {
    const pedido = await pedidos.marcarEntregado(Number(req.params.id));
    res.json(pedido);
  })
);

router.post(
  '/:id/convertir',
  envolver(async (req, res) => {
    const items = req.body?.items;
    if (!Array.isArray(items) || items.length === 0) {
      throw new AppError(400, 'Indica que productos incluir en la venta');
    }
    const normalizados = items.map(
      (item: { pedido_detalle_id?: unknown; incluir?: unknown; cantidad?: unknown }) => ({
        pedido_detalle_id: enteroPositivo(item?.pedido_detalle_id, 'pedido_detalle_id'),
        incluir: item?.incluir === true,
        cantidad: enteroPositivo(item?.cantidad, 'cantidad'),
      })
    );
    const venta = await pedidos.convertirEnVenta(Number(req.params.id), normalizados);
    res.status(201).json(venta);
  })
);

router.delete(
  '/:id',
  envolver(async (req, res) => {
    await pedidos.eliminarPedido(Number(req.params.id));
    res.json({ ok: true });
  })
);

export default router;