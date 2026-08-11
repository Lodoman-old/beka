import * as fs from 'fs';
import { extraerCatalogoNice, ProgresoScrape } from '../src/scraper/nice.scraper';

const RUTA_ESTADO = process.env.SCRAPE_ESTADO_FILE || 'scrape-estado.json';

function escribirEstado(datos: Record<string, unknown>): void {
  try {
    fs.writeFileSync(RUTA_ESTADO, JSON.stringify({ ...datos, actualizado: new Date().toISOString() }));
  } catch (e) {
    console.error('[scrape] no pude escribir el estado:', (e as Error).message);
  }
}

async function principal(): Promise<void> {
  try {
    const resultado = await extraerCatalogoNice((progreso: ProgresoScrape) =>
      escribirEstado({ estado: 'ejecutando', ...progreso })
    );
    escribirEstado({
      estado: 'ok',
      resumen: resultado.resumen,
      productos: resultado.productos_extraidos,
      paginas: resultado.paginas_procesadas,
      porcentaje: 100,
    });
    console.log('Resultado:', JSON.stringify(resultado, null, 2));
    process.exit(0);
  } catch (e) {
    escribirEstado({ estado: 'error', mensaje: (e as Error).message });
    console.error('[scrape] fallo:', (e as Error).message);
    process.exit(1);
  }
}

void principal();