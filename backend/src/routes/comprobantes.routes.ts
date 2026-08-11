import { Router } from 'express';
import { pdfAbono, pdfVenta } from '../services/comprobantes.service';
import { envolver } from '../utils/http';

const router = Router();

router.get(
  '/venta/:id',
  envolver(async (req, res) => {
    const { buffer, nombre } = await pdfVenta(Number(req.params.id));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${nombre}"`);
    res.send(buffer);
  })
);

router.get(
  '/abono/:id',
  envolver(async (req, res) => {
    const { buffer, nombre } = await pdfAbono(Number(req.params.id));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${nombre}"`);
    res.send(buffer);
  })
);

export default router;