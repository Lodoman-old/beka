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

export interface ProgresoScrape {
  fase: 'tienda' | 'extrayendo' | 'guardando';
  rondas?: number;
  productos?: number;
}

async function cerrarBanners(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const id of ['bannerCookiesFade', 'bannerCookies', 'bannerCookiesFadeModal']) {
      const el = document.getElementById(id);
      if (el) el.remove();
    }
  });
}

async function extraerTarjetas(page: Page): Promise<ProductoNice[]> {
  const resultado = await page.evaluate(
    (selFila, selSku, selNombre, selPrecio, selImagen) => {
      const limpiar = (texto: string): number => {
        const limpio = texto.replace(/[^0-9.,]/g, '').replace(/,/g, '');
        const numero = parseFloat(limpio);
        return Number.isFinite(numero) ? numero : 0;
      };
      const productos: {
        sku: string;
        nombre: string;
        precio_costo: number;
        imagen: string;
      }[] = [];
      for (const tarjeta of Array.from(document.querySelectorAll(selFila))) {
        try {
          const enlace = tarjeta.querySelector(selSku) as HTMLAnchorElement | null;
          const href = enlace?.getAttribute('href') || '';
          const sku = decodeURIComponent(
            (href.split('sItemSecondCode=')[1] ?? '').split('&')[0]
          ).trim();
          if (!sku) continue;
          const bloque = tarjeta.querySelector(selNombre);
          const lineas = (bloque?.textContent || '')
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean);
          const nombre = lineas[1] ?? lineas[0] ?? '';
          const precioEl = tarjeta.querySelector(selPrecio);
          const precioCosto = limpiar((precioEl?.textContent || '').trim());
          if (!nombre || precioCosto <= 0) continue;
          const img = tarjeta.querySelector(selImagen) as HTMLImageElement | null;
          const imagen = img ? img.currentSrc || img.src || '' : '';
          productos.push({ sku, nombre, precio_costo: precioCosto, imagen });
        } catch {
          continue;
        }
      }
      return productos;
    },
    env.NICE_SEL_FILA,
    env.NICE_SEL_SKU,
    env.NICE_SEL_NOMBRE,
    env.NICE_SEL_PRECIO,
    env.NICE_SEL_IMAGEN
  );
  return resultado;
}

async function cargarMasSiExiste(page: Page): Promise<boolean> {
  try {
    const tieneBoton = await page.evaluate(() => {
      const botones = Array.from(document.querySelectorAll('button'));
      const b = botones.find((x) => /cargar\s*más/i.test(x.textContent || ''));
      if (!b) return false;
      b.click();
      return true;
    });
    return tieneBoton;
  } catch {
    return false;
  }
}

export async function extraerCatalogoNice(
  onProgreso?: (progreso: ProgresoScrape) => void
): Promise<ResultadoScrape> {
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
  let rondas = 0;

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
    await cerrarBanners(page);

    await page.waitForSelector(env.NICE_SEL_USUARIO, { timeout: env.NICE_TIMEOUT_MS });
    await page.type(env.NICE_SEL_USUARIO, usuario, { delay: 40 });
    await page.waitForSelector(env.NICE_SEL_CLAVE, { timeout: env.NICE_TIMEOUT_MS });
    await page.type(env.NICE_SEL_CLAVE, clave, { delay: 40 });

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: env.NICE_TIMEOUT_MS }).catch(() => undefined),
      page.evaluate(() => {
        const b = document.querySelector('#loginButton');
        if (b) (b as HTMLButtonElement).click();
      }),
    ]);
    await page
      .waitForFunction(() => !location.href.includes('/Account/Login'), {
        timeout: env.NICE_TIMEOUT_MS,
      })
      .catch(() => undefined);
    console.log('[nice] sesion iniciada:', page.url());
    onProgreso?.({ fase: 'tienda' });

    const urlTienda = `https://backoffice.niceonline.com/${usuario}nb/Products?nPage=1`;
    console.log('[nice] abriendo la tienda:', urlTienda);
    await page.goto(urlTienda, { waitUntil: 'networkidle2', timeout: env.NICE_TIMEOUT_MS });
    await new Promise((r) => setTimeout(r, 3000));
    await cerrarBanners(page);
    onProgreso?.({ fase: 'extrayendo', rondas: 0, productos: 0 });

    console.log('[nice] extrayendo catalogo...');
    for (let i = 0; i < Math.min(env.NICE_PAGINAS_MAX, 500); i++) {
      const antes = (await page.$$(env.NICE_SEL_FILA)).length;
      const filasPagina = await extraerTarjetas(page);
      productos.push(...filasPagina);
      onProgreso?.({ fase: 'extrayendo', rondas: rondas + 1, productos: productos.length });
      const hayMas = await cargarMasSiExiste(page);
      if (!hayMas) {
        rondas += 1;
        console.log(`[nice] ronda ${rondas}: ${filasPagina.length} productos (sin mas paginas)`);
        break;
      }
      rondas += 1;
      console.log(`[nice] ronda ${rondas}: ${filasPagina.length} productos (cargando mas...)`);
      try {
        await page.waitForFunction(
          (n) => document.querySelectorAll(env.NICE_SEL_FILA).length > n,
          { timeout: 60000 },
          antes
        );
      } catch {
        break;
      }
      await new Promise((r) => setTimeout(r, 1200));
    }

    console.log(
      `[nice] ${productos.length} productos extraidos en ${rondas} rondas, guardando...`
    );
    onProgreso?.({ fase: 'guardando', rondas, productos: productos.length });
    const resumen = await upsertMasivo(productos, margen);
    console.log(
      `[nice] sincronizacion completada: ${resumen.insertados} insertados, ${resumen.actualizados} actualizados, ${resumen.con_error} con error`
    );

    return { paginas_procesadas: rondas, productos_extraidos: productos.length, resumen };
  } finally {
    await browser.close();
  }
}
