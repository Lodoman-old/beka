import { Router } from 'express';
import * as catalogo from '../services/catalogo.service';
import {
  envolver,
  paginacion,
  stringObligatorio,
  numeroPositivo,
  opcionalTexto,
  AppError,
} from '../utils/http';

const router = Router();

router.get(
  '/',
  envolver(async (req, res) => {
    const { limite, offset } = paginacion(req.query);
    const resultado = await catalogo.buscarProductos({
      busqueda: typeof req.query.busqueda === 'string' ? req.query.busqueda : undefined,
      incluirInactivos: req.query.incluir_inactivos === 'true',
      limite,
      offset,
    });
    res.json(resultado);
  })
);

router.get(
  '/sku/:sku',
  envolver(async (req, res) => {
    const producto = await catalogo.obtenerPorSku(req.params.sku);
    if (!producto) throw new AppError(404, 'Producto no encontrado con ese SKU');
    res.json(producto);
  })
);

router.get(
  '/:id',
  envolver(async (req, res) => {
    const producto = await catalogo.obtenerProducto(Number(req.params.id));
    if (!producto) throw new AppError(404, 'Producto no encontrado');
    res.json(producto);
  })
);

router.post(
  '/',
  envolver(async (req, res) => {
    const producto = await catalogo.crearProductoManual({
      sku: stringObligatorio(req.body?.sku, 'sku'),
      nombre: stringObligatorio(req.body?.nombre, 'nombre'),
      precio_costo: numeroPositivo(req.body?.precio_costo ?? 0, 'precio_costo'),
      imagen: opcionalTexto(req.body?.imagen),
    });
    res.status(201).json(producto);
  })
);

router.put(
  '/:id',
  envolver(async (req, res) => {
    const producto = await catalogo.actualizarProducto(Number(req.params.id), {
      sku: req.body?.sku !== undefined ? stringObligatorio(req.body.sku, 'sku') : undefined,
      nombre: req.body?.nombre !== undefined ? stringObligatorio(req.body.nombre, 'nombre') : undefined,
      precio_costo:
        req.body?.precio_costo !== undefined ? numeroPositivo(req.body.precio_costo, 'precio_costo') : undefined,
      margen: req.body?.margen !== undefined ? numeroPositivo(req.body.margen, 'margen') : undefined,
      imagen: req.body?.imagen !== undefined ? opcionalTexto(req.body.imagen) : undefined,
      activo: req.body?.activo !== undefined ? Boolean(req.body.activo) : undefined,
    });
    res.json(producto);
  })
);

router.delete(
  '/:id',
  envolver(async (req, res) => {
    await catalogo.eliminarProducto(Number(req.params.id));
    res.json({ ok: true });
  })
);

router.post(
  '/recalcular-precios',
  envolver(async (req, res) => {
    const resultado = await catalogo.recalcularPrecios();
    res.json(resultado);
  })
);

export default router;