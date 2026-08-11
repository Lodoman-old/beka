import puppeteer, { Browser, Page } from 'puppeteer';
import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { env } from '../config/env';
import { ProductoNice, upsertMasivo } from '../services/catalogo.service';
import { margenActual, niceCredenciales, niceUrlLogin } from '../services/sistema.service';

puppeteerExtra.use(StealthPlugin());

export interface ResultadoScrape {
  paginas_procesadas: number;
  productos_extraidos: number;
  resumen: Awaited<ReturnType<typeof upsertMasivo>>;
}

function limpiarPrecio(texto: string): number {
  const limpio = texto.replace(/[^0-9.,]/g, '').replace(/,/g, '');
  const numero = parseFloat(limpio);
  return Number.isFinite(numero) ? numero : 0;
}

async function extraerFilas(page: Page): Promise<ProductoNice[]> {
  const filas = await page.$$(env.NICE_SEL_FILA);
  const productos: ProductoNice[] = [];

  for (const fila of filas) {
    try {
      const sku = await fila.$eval(env.NICE_SEL_SKU, (el) => el.textContent?.trim() || '');
      const nombre = await fila.$eval(env.NICE_SEL_NOMBRE, (el) => el.textContent?.trim() || '');
      const precio = await fila.$eval(env.NICE_SEL_PRECIO, (el) => el.textContent?.trim() || '');
      const imagen = await fila
        .$eval(env.NICE_SEL_IMAGEN, (el) => {
          const img = el as HTMLImageElement;
          return img.currentSrc || img.src || '';
        })
        .catch(() => '');

      const precioCosto = limpiarPrecio(precio);
      if (!sku || !nombre || precioCosto <= 0) continue;

      productos.push({ sku, nombre, precio_costo: precioCosto, imagen });
    } catch {
      continue;
    }
  }
  return productos;
}

async function irPaginaSiguiente(page: Page): Promise<boolean> {
  const posibles = [
    'a[rel=next]',
    'a.next',
    'li.next a',
    'a[aria-label="Siguiente"]',
    'button[aria-label="Siguiente"]',
  ];
  try {
    const encontrado = await page.evaluate((selector) => {
      const el = document.querySelectorAll<HTMLElement>(selector)[0];
      if (!el) return null;
      if (el.tagName === 'A') {
        const href = (el as HTMLAnchorElement).getAttribute('href');
        const disabled = el.getAttribute('aria-disabled');
        if (href && disabled !== 'true') return href;
      }
      return null;
    }, posibles.join(','));
    if (!encontrado) return false;
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: env.NICE_TIMEOUT_MS }).catch(() => undefined),
      page.evaluate((href) => {
        window.location.href = href;
      }, encontrado),
    ]);
    return true;
  } catch {
    return false;
  }
}

export async function extraerCatalogoNice(): Promise<ResultadoScrape> {
  const { usuario, clave } = await niceCredenciales();
  if (!usuario || !clave) {
    throw new Error(
      'El usuario y la contrasena de NICE no estan configurados; ponlos en Configuracion del sistema (o en el .env)'
    );
  }
  const urlLogin = await niceUrlLogin();
  if (!urlLogin) {
    throw new Error(
      'La URL del portal NICE no esta configurada; pegala en Configuracion del sistema o en el .env (NICE_URL_LOGIN)'
    );
  }

  const margen = await margenActual();
  const productos: ProductoNice[] = [];
  let paginas = 1;

  const browser: Browser = await puppeteerExtra.launch({
    headless: env.NICE_HEADLESS,
    executablePath: env.CHROME_EXECUTABLE,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    defaultViewport: { width: 1366, height: 900 },
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
    );

    console.log('[nice] iniciando sesion en el portal...');
    await page.goto(urlLogin, {
      waitUntil: 'networkidle2',
      timeout: env.NICE_TIMEOUT_MS,
    });

    await page.waitForSelector(env.NICE_SEL_USUARIO, { timeout: env.NICE_TIMEOUT_MS });
    await page.type(env.NICE_SEL_USUARIO, usuario, { delay: 40 });
    await page.waitForSelector(env.NICE_SEL_CLAVE, { timeout: env.NICE_TIMEOUT_MS });
    await page.type(env.NICE_SEL_CLAVE, clave, { delay: 40 });

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: env.NICE_TIMEOUT_MS }).catch(() => undefined),
      page.click(env.NICE_SEL_BTN_LOGIN),
    ]);

    await page.waitForSelector(env.NICE_SEL_ENLACE_CATALOGO, { timeout: env.NICE_TIMEOUT_MS });
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: env.NICE_TIMEOUT_MS }).catch(() => undefined),
      page.click(env.NICE_SEL_ENLACE_CATALOGO),
    ]);

    console.log('[nice] sesion iniciada, extrayendo catalogo...');

    for (let i = 0; i < Math.min(env.NICE_PAGINAS_MAX, 500); i++) {
      const filasPagina = await extraerFilas(page);
      productos.push(...filasPagina);
      console.log(`[nice] pagina ${paginas}: ${filasPagina.length} productos`);

      const haySiguiente = await irPaginaSiguiente(page);
      if (!haySiguiente) break;
      paginas += 1;
    }

    console.log(`[nice] ${productos.length} productos extraidos de ${paginas} paginas, guardando...`);
    const resumen = await upsertMasivo(productos, margen);
    console.log(
      `[nice] sincronizacion completada: ${resumen.insertados} insertados, ${resumen.actualizados} actualizados, ${resumen.con_error} con error`
    );

    return { paginas_procesadas: paginas, productos_extraidos: productos.length, resumen };
  } finally {
    await browser.close();
  }
}