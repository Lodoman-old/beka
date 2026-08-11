import { Router, Request, Response } from 'express';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import * as sistema from '../services/sistema.service';
import { estadoWhatsApp } from '../services/whatsapp.service';
import { envolver, stringObligatorio } from '../utils/http';
import { env } from '../config/env';

const router = Router();

export async function manejarQrWhatsApp(_req: Request, res: Response): Promise<void> {
  const rutaQr = path.join(sistema.DIR_DATOS, 'qr.png');
  if (!fs.existsSync(rutaQr)) {
    res.status(404).json({ error: 'QR_NO_DISPONIBLE' });
    return;
  }
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(rutaQr);
}

router.get('/whatsapp-qr', envolver(manejarQrWhatsApp));

router.get(
  '/logo',
  envolver(async (_req, res) => {
    if (!sistema.existeLogo()) {
      res.status(404).json({ error: 'LOGO_NO_EXISTE' });
      return;
    }
    const ruta = sistema.RUTA_LOGO;
    const tipo = ruta.endsWith('.png') ? 'image/png' : 'image/jpeg';
    res.setHeader('Content-Type', tipo);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.sendFile(ruta);
  })
);

router.put(
  '/logo',
  envolver(async (req, res) => {
    sistema.guardarLogo(stringObligatorio(req.body?.imagen, 'imagen'));
    res.json({ ok: true });
  })
);

router.delete(
  '/logo',
  envolver(async (_req, res) => {
    sistema.eliminarLogo();
    res.json({ ok: true });
  })
);

router.get(
  '/',
  envolver(async (_req, res) => {
    const configuracion = await sistema.obtenerConfiguracion();
    res.json(configuracion);
  })
);

router.put(
  '/',
  envolver(async (req, res) => {
    const clave = stringObligatorio(req.body?.clave, 'clave');
    const valor = stringObligatorio(req.body?.valor, 'valor');
    await sistema.guardarValor(clave, valor);
    res.json({ ok: true });
  })
);

router.get(
  '/whatsapp',
  envolver(async (_req, res) => {
    res.json(estadoWhatsApp());
  })
);

router.post(
  '/scrape',
  envolver(async (_req, res) => {
    const script = path.join(__dirname, '..', '..', 'scripts', 'sync-catalogo.js');
    if (!fs.existsSync(script)) {
      throw new Error('El script de sincronizacion no esta compilado; ejecuta npm run build');
    }
    const hijo = spawn(process.execPath, [script], {
      stdio: 'inherit',
      env: { ...process.env },
    });
    hijo.on('error', (e) => {
      console.error('[scrape] no se pudo lanzar el proceso:', e.message);
    });
    res.json({ ok: true, mensaje: 'Sincronizacion del catalogo iniciada en segundo plano' });
  })
);

router.get(
  '/ambiente',
  envolver(async (_req, res) => {
    res.json({
      PORT: env.PORT,
      NOMBRE_NEGOCIO: env.NOMBRE_NEGOCIO,
      MARGEN_GANANCIA: env.MARGEN_GANANCIA_DEFAULT,
      WHATSAPP_ENABLED: env.WHATSAPP_ENABLED,
      NICE_URL_LOGIN: env.NICE_URL_LOGIN,
      NICE_USER: env.NICE_USER,
    });
  })
);

export default router;