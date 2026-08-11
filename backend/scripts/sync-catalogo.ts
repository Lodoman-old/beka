import { extraerCatalogoNice } from '../src/scraper/nice.scraper';

async function principal(): Promise<void> {
  try {
    const resultado = await extraerCatalogoNice();
    console.log('Resultado:', JSON.stringify(resultado, null, 2));
    process.exit(0);
  } catch (e) {
    console.error('[scrape] fallo:', (e as Error).message);
    process.exit(1);
  }
}

void principal();