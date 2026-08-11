import { Router } from 'express';
import * as clientes from '../services/clientes.service';
import { envolver, paginacion, stringObligatorio, opcionalTexto, AppError } from '../utils/http';
import { obtenerCliente } from '../services/clientes.service';

const router = Router();

router.get(
  '/',
  envolver(async (req, res) => {
    const { limite, offset } = paginacion(req.query);
    const resultado = await clientes.listarClientes({
      busqueda: typeof req.query.busqueda === 'string' ? req.query.busqueda : undefined,
      incluirInactivos: req.query.incluir_inactivos === 'true',
      limite,
      offset,
    });
    res.json(resultado);
  })
);

router.get(
  '/:id',
  envolver(async (req, res) => {
    const cliente = await obtenerCliente(Number(req.params.id));
    if (!cliente) throw new AppError(404, 'Cliente no encontrado');
    res.json(cliente);
  })
);

router.post(
  '/',
  envolver(async (req, res) => {
    const nombre = stringObligatorio(req.body?.nombre, 'nombre');
    const cliente = await clientes.crearCliente({
      nombre,
      telefono: opcionalTexto(req.body?.telefono),
      documento: opcionalTexto(req.body?.documento),
      email: opcionalTexto(req.body?.email),
      direccion: opcionalTexto(req.body?.direccion),
      notas: opcionalTexto(req.body?.notas),
    });
    res.status(201).json(cliente);
  })
);

router.put(
  '/:id',
  envolver(async (req, res) => {
    const nombre = stringObligatorio(req.body?.nombre, 'nombre');
    const cliente = await clientes.actualizarCliente(Number(req.params.id), {
      nombre,
      telefono: opcionalTexto(req.body?.telefono),
      documento: opcionalTexto(req.body?.documento),
      email: opcionalTexto(req.body?.email),
      direccion: opcionalTexto(req.body?.direccion),
      notas: opcionalTexto(req.body?.notas),
    });
    res.json(cliente);
  })
);

router.put(
  '/:id/credenciales-portal',
  envolver(async (req, res) => {
    const resultado = await clientes.regenerarCredencialesPortal(Number(req.params.id));
    res.json(resultado);
  })
);

router.delete(
  '/:id',
  envolver(async (req, res) => {
    await clientes.eliminarCliente(Number(req.params.id));
    res.json({ ok: true });
  })
);

export default router;