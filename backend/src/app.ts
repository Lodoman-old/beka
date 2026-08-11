import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import fs from 'fs';

import { env } from './config/env';
import { manejarError } from './utils/http';

import clientesRouter from './routes/clientes.routes';
import ventasRouter from './routes/ventas.routes';
import viajesRouter from './routes/viajes.routes';
import abonosRouter from './routes/abonos.routes';
import catalogoRouter from './routes/catalogo.routes';
import reportesRouter from './routes/reportes.routes';
import configRouter, { manejarQrWhatsApp } from './routes/config.routes';
import comprobantesRouter from './routes/comprobantes.routes';
import authRouter from './routes/auth.routes';
import portalRouter from './routes/portal.routes';
import { necesitaAuth, necesitaRol, ROL_ADMIN } from './services/auth.service';
import { envolver } from './utils/http';

export function crearApp(): Application {
  const app: Application = express();

  app.use(
    helmet({
      crossOriginResourcePolicy: false,
      contentSecurityPolicy: {
        directives: {
          ...helmet.contentSecurityPolicy.getDefaultDirectives(),
          'upgrade-insecure-requests': null,
        },
      },
    })
  );
  app.use(cors());
  app.use(express.json({ limit: '2mb' }));
  app.use(morgan('dev'));

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ ok: true, timestamp: new Date().toISOString() });
  });

  const api = express.Router();
  api.use('/auth', authRouter);
  api.use('/portal', portalRouter);
  api.get('/config/whatsapp-qr', envolver(manejarQrWhatsApp));

  api.use(necesitaAuth, necesitaRol(ROL_ADMIN));
  api.use('/clientes', clientesRouter);
  api.use('/ventas', ventasRouter);
  api.use('/viajes', viajesRouter);
  api.use('/abonos', abonosRouter);
  api.use('/catalogo', catalogoRouter);
  api.use('/reportes', reportesRouter);
  api.use('/config', configRouter);
  api.use('/comprobantes', comprobantesRouter);
  app.use('/api', api);

  const dist = path.resolve(process.cwd(), env.FRONTEND_DIST);
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    const indexHtml = path.join(dist, 'index.html');
    app.get('*', (req: Request, res: Response, next: NextFunction) => {
      if (req.path.startsWith('/api')) return next();
      res.sendFile(indexHtml);
    });
  }

  app.use(manejarError);
  return app;
}

