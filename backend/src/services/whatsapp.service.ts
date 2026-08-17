import { Client, LocalAuth, MessageMedia } from 'whatsapp-web.js';
import * as qrcode from 'qrcode-terminal';
import QRCode from 'qrcode';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { env } from '../config/env';
import { EntidadAbono, FilaAbono, FilaVenta } from '../types';
import { abonosPendientesDeNotificar, marcarNotificacion } from './abonos.service';
import { asegurarCredencialesPortal } from './clientes.service';
import { nombreNegocio, DIR_DATOS, obtenerValor } from './sistema.service';
import { pdfAbono, pdfVenta } from './comprobantes.service';
import { pool } from '../db/pool';

let cliente: Client | null = null;
let sesionConectada = false;
let qrPendiente = false;
let mensajeInicializado = false;

let ultimaLimpieza: {
  dir: string;
  borrados: number;
  sesionExiste: boolean;
  entradas: string[];
  encontrados: string[];
  error?: string;
} | null = null;
let fallosCandado = 0;
let errorInicializacion: string | null = null;
let reintentos: ReturnType<typeof setInterval> | null = null;
let reintentoTimer: ReturnType<typeof setTimeout> | null = null;
let apagando = false;
let generacion = 0;
let inicializando = false;
let reiniciando = false;
let fallosConsecutivos = 0;
let ultimoReady = 0;
let ultimaSincronizacion = 0;

const REINTENTOS_BACKOFF = [60_000, 120_000, 300_000, 900_000];
const MIN_INTERVALO_READY = 10_000;
const MIN_INTERVALO_SYNC = 5 * 60_000;

const TRABAJO = '/tmp/beka-auth';

function copiarSesion(origen: string, destino: string): void {
  const carpetaCache = new Set([
    'Cache',
    'Code Cache',
    'GPUCache',
    'Dictionaries',
    'CacheStorage',
    'Cache_Data',
  ]);
  try {
    if (!fs.existsSync(origen)) return;
    fs.mkdirSync(destino, { recursive: true });
    for (const entrada of fs.readdirSync(origen)) {
      if (entrada.startsWith('Singleton') || entrada.startsWith('Crashpad')) continue;
      const rutaO = path.join(origen, entrada);
      const rutaD = path.join(destino, entrada);
      let esDir = false;
      try {
        esDir = fs.statSync(rutaO).isDirectory();
      } catch {
        continue;
      }
      if (esDir && entrada === 'Default') {
        fs.mkdirSync(rutaD, { recursive: true });
        for (const sub of fs.readdirSync(rutaO)) {
          if (carpetaCache.has(sub)) continue;
          const rs = path.join(rutaO, sub);
          try {
            fs.cpSync(rs, path.join(rutaD, sub), { recursive: true });
          } catch {
            // archivo ocupado; se salta
          }
        }
      } else if (esDir) {
        try {
          fs.cpSync(rutaO, rutaD, { recursive: true });
        } catch {
          // archivo ocupado; se salta
        }
      } else {
        try {
          fs.copyFileSync(rutaO, rutaD);
        } catch {
          // archivo ocupado; se salta
        }
      }
    }
  } catch (e) {
    console.error('[whatsapp] no pude copiar la sesion:', (e as Error).message);
  }
}

function sincronizarSesionSiHay(forzar = false): void {
  const ahora = Date.now();
  if (!forzar && ahora - ultimaSincronizacion < MIN_INTERVALO_SYNC) {
    console.log(
      `[whatsapp] sync de sesion omitido (hace ${Math.round((ahora - ultimaSincronizacion) / 1000)}s; maximo 1 cada 5 min)`
    );
    return;
  }
  ultimaSincronizacion = ahora;
  const sesionTmp = path.join(TRABAJO, 'session');
  if (!fs.existsSync(sesionTmp)) return;
  if (!fs.existsSync(path.join(sesionTmp, 'Default'))) return;
  const destino = path.join(env.WHATSAPP_SESION_DIR, 'session');
  copiarSesion(sesionTmp, destino);
  console.log('[whatsapp] sesion sincronizada al volumen');
}

function borrarSesionDeDisco(): void {
  const dir = env.WHATSAPP_SESION_DIR;
  try {
    if (!fs.existsSync(dir)) return;
    let borrado = 0;
    for (const entrada of fs.readdirSync(dir)) {
      if (entrada === 'session' || entrada.startsWith('session-respaldo-')) {
        fs.rmSync(path.join(dir, entrada), { recursive: true, force: true });
        borrado += 1;
      }
    }
    console.log(`[whatsapp] sesion borrada del volumen (${borrado} carpeta(s)); se pedira un QR nuevo`);
  } catch (e) {
    console.error('[whatsapp] no pude borrar la sesion del volumen:', (e as Error).message);
  }
}

function limpiarCandadoPerfil(): void {
  const dir = env.WHATSAPP_SESION_DIR;
  const raices = [dir, path.dirname(dir), '/app/.wwebjs_auth', TRABAJO];
  const reporte: {
    borrados: number;
    sesionExiste: boolean;
    entradas: string[];
    encontrados: string[];
    error?: string;
  } = {
    borrados: 0,
    sesionExiste: false,
    entradas: [],
    encontrados: [],
  };
  try {
    if (fs.existsSync(dir)) {
      reporte.sesionExiste = fs.existsSync(path.join(dir, 'session'));
      reporte.entradas = fs
        .readdirSync(dir)
        .slice(0, 40)
        .map((e) => e.slice(0, 40));
    }
    const pendientes: string[] = [];
    for (const raiz of raices) {
      if (fs.existsSync(raiz)) pendientes.push(raiz);
    }
    let borrados = 0;
    while (pendientes.length > 0) {
      const actual = pendientes.pop() as string;
      for (const entrada of fs.readdirSync(actual)) {
        const ruta = path.join(actual, entrada);
        let esDir = false;
        try {
          esDir = fs.statSync(ruta).isDirectory();
        } catch {
          continue;
        }
        if (esDir) {
          if (entrada === 'Singleton') {
            fs.rmSync(ruta, { recursive: true, force: true });
            borrados += 1;
            reporte.encontrados.push(ruta);
            console.log('[whatsapp] candado eliminado:', ruta);
          } else {
            pendientes.push(ruta);
          }
        } else if (entrada.startsWith('Singleton')) {
          fs.rmSync(ruta, { force: true });
          borrados += 1;
          reporte.encontrados.push(ruta);
          console.log('[whatsapp] candado eliminado:', ruta);
        }
      }
    }
    if (borrados > 0) console.log(`[whatsapp] ${borrados} archivos de candado eliminados`);
    reporte.borrados = borrados;
  } catch (e) {
    reporte.error = (e as Error).message;
    console.error('[whatsapp] no pude limpiar el candado del perfil:', reporte.error);
  }
  ultimaLimpieza = { dir, ...reporte };
}

function limpiarCachePerfil(): void {
  const dir = path.join(TRABAJO, 'session', 'Default');
  const carpetas = ['Cache', 'Code Cache', 'GPUCache', 'Dictionaries', 'CacheStorage', 'Service Worker/CacheStorage'];
  try {
    if (!fs.existsSync(dir)) return;
    let borrado = 0;
    for (const carpeta of carpetas) {
      const ruta = path.join(dir, carpeta);
      if (fs.existsSync(ruta)) {
        fs.rmSync(ruta, { recursive: true, force: true });
        borrado += 1;
      }
    }
    if (borrado > 0) console.log(`[whatsapp] cache del perfil podado: ${borrado} carpetas`);
  } catch (e) {
    console.error('[whatsapp] no pude podar la cache del perfil:', (e as Error).message);
  }
}

function matarProcesosChromium(): number {
  const perfil = env.WHATSAPP_SESION_DIR;
  let muertos = 0;
  try {
    if (!fs.existsSync('/proc')) return 0;
    const pids = fs.readdirSync('/proc').filter((p) => /^\d+$/.test(p));
    for (const pid of pids) {
      try {
        const cmdline = fs
          .readFileSync(path.join('/proc', pid, 'cmdline'), 'utf8')
          .replace(/\0/g, ' ');
        if (!/chrome|chromium/i.test(cmdline)) continue;
        if (!cmdline.includes(perfil) && !cmdline.includes(TRABAJO)) continue;
        try {
          process.kill(Number(pid), 'SIGKILL');
          muertos += 1;
          console.log('[whatsapp] proceso Chromium huerfano terminado: pid', pid);
        } catch {
          // ya estaba muerto o sin permisos
        }
      } catch {
        // el pid ya no existe
      }
    }
  } catch (e) {
    console.error('[whatsapp] no pude revisar procesos Chromium:', (e as Error).message);
  }
  if (muertos > 0) console.log(`[whatsapp] ${muertos} procesos Chromium terminados`);
  return muertos;
}

function hayCandadoActivo(): boolean {
  const dir = env.WHATSAPP_SESION_DIR;
  const raices = [dir, path.dirname(dir), '/app/.wwebjs_auth'].filter((r) => fs.existsSync(r));
  const pendientes: string[] = [...raices];
  let vueltas = 0;
  while (pendientes.length > 0 && vueltas < 5000) {
    const actual = pendientes.pop() as string;
    vueltas += 1;
    for (const entrada of fs.readdirSync(actual)) {
      const ruta = path.join(actual, entrada);
      let esDir = false;
      try {
        esDir = fs.statSync(ruta).isDirectory();
      } catch {
        continue;
      }
      if (esDir) {
        if (entrada === 'Singleton') return true;
        pendientes.push(ruta);
      } else if (entrada.startsWith('Singleton')) {
        return true;
      }
    }
  }
  return false;
}

function programarReintento(): void {
  if (reintentoTimer) clearTimeout(reintentoTimer);
  const espera = REINTENTOS_BACKOFF[Math.min(fallosConsecutivos, REINTENTOS_BACKOFF.length - 1)];
  console.log(
    `[whatsapp] reconexion programada en ${Math.round(espera / 1000)}s (fallos consecutivos: ${fallosConsecutivos})`
  );
  reintentoTimer = setTimeout(() => {
    reintentoTimer = null;
    void destruirYReiniciar('reintento programado');
  }, espera);
}

async function destruirYReiniciar(origen: string): Promise<void> {
  if (reiniciando) {
    console.log(`[whatsapp] reinicio ignorado: ya hay uno en curso (${origen})`);
    return;
  }
  reiniciando = true;
  try {
if (sesionConectada) sincronizarSesionSiHay(true);
    if (cliente) {
      const actual = cliente;
      cliente = null;
      sesionConectada = false;
      generacion += 1;
      try {
        await Promise.race([
          actual.destroy(),
          new Promise((r) => setTimeout(r, 15_000)),
        ]);
      } catch {
        // el cliente ya no existia o no pudo apagarse; seguimos igual
      }
      matarProcesosChromium();
      limpiarCandadoPerfil();
    }
    sesionConectada = false;
    qrPendiente = false;
    errorInicializacion = null;
    mensajeInicializado = false;
    inicializando = false;
    console.log(`[whatsapp] reiniciando sesion (${origen})...`);
    await new Promise((r) => setTimeout(r, 3000));
    inicializarWhatsApp();
  } finally {
    reiniciando = false;
  }
}

function sesionEnDisco(): boolean {
  try {
    return fs.existsSync(path.join(env.WHATSAPP_SESION_DIR, 'session'));
  } catch {
    return false;
  }
}

function restaurarSesionRespaldo(): void {
  const dir = env.WHATSAPP_SESION_DIR;
  try {
    if (!fs.existsSync(dir) || sesionEnDisco()) return;
    const respaldos = fs
      .readdirSync(dir)
      .filter((e) => e.startsWith('session-respaldo-'))
      .map((e) => ({ nombre: e, ruta: path.join(dir, e) }))
      .sort((a, b) => fs.statSync(b.ruta).mtimeMs - fs.statSync(a.ruta).mtimeMs);
    const masReciente = respaldos[0];
    if (!masReciente) return;
    fs.renameSync(masReciente.ruta, path.join(dir, 'session'));
    console.log('[whatsapp] sesion restaurada desde respaldo: ' + masReciente.nombre);
  } catch (e) {
    console.error('[whatsapp] no pude restaurar la sesion de respaldo:', (e as Error).message);
  }
}

export function estadoWhatsApp(): {
  activo: boolean;
  estado: string;
  qr_pendiente: boolean;
  detalle: string | null;
  sesion_en_disco?: boolean;
  respaldo_en_disco?: boolean;
  candado?: typeof ultimaLimpieza;
} {
  return {
    activo: env.WHATSAPP_ENABLED,
    estado: !env.WHATSAPP_ENABLED
      ? 'DESACTIVADO'
      : sesionConectada
        ? 'CONECTADO'
        : qrPendiente
          ? 'ESPERANDO_QR'
          : errorInicializacion
            ? 'ERROR'
            : 'INICIANDO',
    qr_pendiente: qrPendiente,
    detalle: errorInicializacion,
    sesion_en_disco: sesionEnDisco(),
    respaldo_en_disco: (() => {
      try {
        if (!fs.existsSync(env.WHATSAPP_SESION_DIR)) return false;
        return fs.readdirSync(env.WHATSAPP_SESION_DIR).some((e) => e.startsWith('session-respaldo-'));
      } catch {
        return false;
      }
    })(),
    candado: ultimaLimpieza,
  };
}

export function sesionWhatsAppActiva(): boolean {
  return sesionConectada && cliente !== null;
}

async function aplicarParcheLid(): Promise<void> {
  try {
    const pagina = (cliente as unknown as {
      pupPage?: {
        evaluate: (fn: string) => Promise<unknown>;
        on: (evento: string, fn: (...args: unknown[]) => void) => void;
      };
    }).pupPage;
    if (!pagina) return;
pagina.on('console', (m) => {
      const mensaje = (m as unknown as { text: () => string }).text();
      if (mensaje && /parche-lid|WWebJS|lid|error/i.test(mensaje)) {
        console.log(`[wa-page] ${mensaje}`);
      }
    });
    (pagina as unknown as { on: (e: string, fn: (err: unknown) => void) => void }).on(
      'pageerror',
      (err) => {
        const e = err as { message?: string; stack?: string };
        console.error(`[wa-page] pageerror: ${e?.message} ${e?.stack || ''}`);
      }
    );
const resultado = await pagina.evaluate(`
      (() => {
        try {
          const gating = window.require && window.require('WAWebLid1X1MigrationGating');
          if (gating && gating.Lid1X1MigrationUtils) {
            gating.Lid1X1MigrationUtils.isLidMigrated = () => false;
          }
const original = window.WWebJS && window.WWebJS.getChat;
          if (original) {
            window.__bekaLidCache = window.__bekaLidCache || {};
            const sendOriginal = window.WWebJS.sendMessage;
            if (sendOriginal) {
              window.WWebJS.sendMessage = async function (chat, content, options) {
                try {
                  const r = await sendOriginal.call(this, chat, content, options);
                  console.log('[parche-lid] sendMessage OK ' + (chat && chat.id && chat.id._serialized));
                  return r;
                } catch (e) {
                  console.error('[parche-lid] sendMessage ERROR ' + (chat && chat.id && chat.id._serialized) + ' -> ' + e.name + ': ' + e.message + '\\n' + (e.stack || '').split('\\n').slice(0, 15).join('\\n'));
                  throw e;
                }
              };
            }
            window.__bekaUsync = async function (numero) {
              if (window.__bekaLidCache[numero]) return window.__bekaLidCache[numero];
              const variantes = [String(numero)];
              if (String(numero).length === 12 && String(numero).startsWith('52')) variantes.push('521' + String(numero).slice(2));
              if (String(numero).length === 13 && String(numero).startsWith('521')) variantes.push('52' + String(numero).slice(3));
              for (const variante of variantes) {
                try {
                  const query = window.require('WAWebContactSyncUtils').constructUsyncDeltaQuery([{ type: 'add', phoneNumber: variante }]);
                  const r = await query.execute();
                  const item = r && Array.isArray(r.list) && r.list.length ? r.list[0] : null;
                  let idResuelto = null;
                  if (item) {
                    if (typeof item.id === 'string') idResuelto = item.id;
                    else if (item.id && item.id._serialized) idResuelto = item.id._serialized;
                    else if (item.lid) idResuelto = item.lid;
                    else if (item.user) idResuelto = item.user + '@lid';
                  }
                  if (idResuelto && /@/.test(idResuelto)) {
                    window.__bekaLidCache[numero] = idResuelto;
                    return idResuelto;
                  }
                } catch (e) {
                  console.error('[parche-lid] usync fallo variante ' + variante + ': ' + (e && e.message));
                }
              }
              return null;
            };
window.WWebJS.getChat = async function (chatId, opts) {
              const numero = String(chatId).split('@')[0];
              try {
                const lid = await window.__bekaUsync(numero);
                if (lid) {
                  const lidWid = window.require('WAWebWidFactory').createWid(lid);
                  const creado = await window.require('WAWebFindChatAction').findOrCreateLatestChat(lidWid);
                  if (creado && creado.chat) {
                    const { getAsModel = true } = opts || {};
                    console.log('[parche-lid] getChat CON LID OK ' + chatId);
                    if (!getAsModel) return creado.chat;
                    try {
                      return await window.WWebJS.getChatModel(creado.chat, { isChannel: false });
                    } catch (e) {
                      console.error('[parche-lid] getChatModel fallo ' + chatId + ' -> ' + e.name + ': ' + e.message);
                      return {
                        id: creado.chat.id,
                        formattedTitle: typeof creado.chat.formattedTitle === 'function' ? creado.chat.formattedTitle() : (creado.chat.formattedTitle || ''),
                        isGroup: false,
                        isReadOnly: false,
                        unreadCount: 0,
                        t: 0,
                        archive: false,
                        pin: false,
                        isLocked: false,
                        isMuted: false,
                        muteExpiration: 0,
                        lastMessage: null
                      };
                    }
                  }
                }
              } catch (e) {
                console.error('[parche-lid] usync fallo ' + chatId + ': ' + (e && e.message));
              }
              try {
                const r = await original.call(this, chatId, opts);
                console.log('[parche-lid] getChat ORIGINAL OK ' + chatId);
                return r;
              } catch (e) {
                console.error('[parche-lid] getChat ORIGINAL ERROR ' + chatId + ' -> ' + e.name + ': ' + e.message + '\\n' + (e.stack || '').split('\\n').slice(0, 12).join('\\n'));
                throw e;
              }
            };
          }
          return 'parche-lid aplicado';
        } catch (e) { return 'error: ' + (e && e.message ? e.message : 'desconocido'); }
      })();
    `);
console.log('[whatsapp] resultado parche LID:', String(resultado));
  } catch (e) {
    console.error('[whatsapp] no pude aplicar el parche LID:', (e as Error).message);
  }
}

export function inicializarWhatsApp(): void {
  if (!env.WHATSAPP_ENABLED || mensajeInicializado || inicializando || cliente) {
    if (!mensajeInicializado) {
      console.log('[whatsapp] inicializacion ignorada: ya hay una en curso o un cliente activo');
    }
    return;
  }
  mensajeInicializado = true;
  inicializando = true;
  const miGeneracion = ++generacion;

  limpiarCandadoPerfil();
  matarProcesosChromium();
  limpiarCandadoPerfil();
  restaurarSesionRespaldo();
  limpiarCachePerfil();

  try {
    fs.rmSync(TRABAJO, { recursive: true, force: true });
    fs.mkdirSync(TRABAJO, { recursive: true });
    copiarSesion(path.join(env.WHATSAPP_SESION_DIR, 'session'), path.join(TRABAJO, 'session'));
    const hayEnTmp = fs.existsSync(path.join(TRABAJO, 'session', 'Default'));
    console.log(`[whatsapp] perfil de trabajo en /tmp listo (sesion copiada: ${hayEnTmp ? 'SI' : 'NO'})`);
  } catch (e) {
    console.error('[whatsapp] no pude preparar el perfil temporal:', (e as Error).message);
  }

  console.log(
    `[whatsapp] sesion en disco: ${sesionEnDisco() ? 'SI (se reutilizara)' : 'NO (se pedira QR)'}`
  );

  if (hayCandadoActivo()) {
    fallosCandado += 1;
    console.log(
      `[whatsapp] el perfil esta bloqueado por OTRA instancia en ejecucion (#${fallosCandado}); ` +
      'la sesion NO se toca: espero a que la libere (si es un contenedor viejo de un deploy, detenlo)'
    );
    programarReintento();
    return;
  }

  try {
    cliente = new Client({
authStrategy: new LocalAuth({
        dataPath: TRABAJO,
      }),
      webVersion: '2.3000.1045241378-alpha',
      webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/%s.html',
      },
      puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        executablePath: env.CHROME_EXECUTABLE,
        protocolTimeout: 300000,
      },
    });

    cliente.on('qr', (qr) => {
      if (generacion !== miGeneracion) return;
      if (reintentoTimer) {
        clearTimeout(reintentoTimer);
        reintentoTimer = null;
      }
      fallosConsecutivos = 0;
      qrPendiente = true;
      errorInicializacion = null;
      console.log('\n[whatsapp] Escanea este codigo QR con tu WhatsApp (solo la primera vez):\n');
      qrcode.generate(qr, { small: true });
      const rutaQr = path.join(DIR_DATOS, 'qr.png');
      QRCode.toFile(rutaQr, qr, { width: 320, margin: 1, color: { dark: '#000000', light: '#FFFFFF' } })
        .then(() => console.log(`[whatsapp] QR guardado en ${rutaQr} (sirvelo en /api/config/whatsapp-qr)`))
        .catch((e) => console.error('[whatsapp] no pude guardar el QR:', (e as Error).message));
    });

cliente.on('ready', () => {
      if (generacion !== miGeneracion) return;
      const ahora = Date.now();
      if (ahora - ultimoReady < MIN_INTERVALO_READY) {
        console.log(
          `[whatsapp] ready repetido ignorado (${Math.round((ahora - ultimoReady) / 1000)}s tras el anterior)`
        );
        return;
      }
      ultimoReady = ahora;
      if (reintentoTimer) {
        clearTimeout(reintentoTimer);
        reintentoTimer = null;
      }
      sesionConectada = true;
      qrPendiente = false;
      errorInicializacion = null;
      fallosCandado = 0;
      fallosConsecutivos = 0;
      console.log('[whatsapp] Sesion conectada correctamente');
      sincronizarSesionSiHay();
      void aplicarParcheLid().then(() => {
        iniciarColaDeReintentos();
      });
    });

cliente.on('auth_failure', (mensaje) => {
      if (generacion !== miGeneracion) return;
      sesionConectada = false;
      fallosConsecutivos += 1;
      errorInicializacion = 'Fallo de autenticacion: ' + mensaje;
      console.error('[whatsapp]', errorInicializacion);
      if (!apagando) {
        console.log('[whatsapp] reprogramando reconexion: la sesion se generara de nuevo en el QR');
        programarReintento();
      }
    });

    cliente.on('disconnected', (razon) => {
      if (generacion !== miGeneracion) return;
      sesionConectada = false;
      qrPendiente = false;
      fallosConsecutivos += 1;
      errorInicializacion = 'Sesion desconectada: ' + razon;
      console.error('[whatsapp]', errorInicializacion);
      if (!apagando) {
        if (String(razon) === 'LOGOUT') {
          borrarSesionDeDisco();
        }
        console.log('[whatsapp] reconexion automatica programada en 60s...');
        programarReintento();
      }
    });

    void cliente.initialize().catch((e) => {
      fallosConsecutivos += 1;
      errorInicializacion = 'No se pudo iniciar el navegador de WhatsApp: ' + String(e?.message || e);
      console.error('[whatsapp]', errorInicializacion);
      if (/process_singleton|in use by another Chromium/i.test(errorInicializacion)) {
        fallosCandado += 1;
        console.log(
          `[whatsapp] perfil bloqueado por otra instancia (#${fallosCandado}): ` +
          'no se toca la sesion; se reintenta en 60s hasta que la otra instancia la libere'
        );
        matarProcesosChromium();
        limpiarCandadoPerfil();
      } else {
        fallosCandado = 0;
      }
      programarReintento();
    });
} catch (e) {
    errorInicializacion = 'Error creando el cliente de WhatsApp: ' + String((e as Error).message);
    console.error('[whatsapp]', errorInicializacion);
    mensajeInicializado = false;
    inicializando = false;
    fallosConsecutivos += 1;
    programarReintento();
  }
}

export function normalizarTelefono(telefono: string | null | undefined): string | null {
  if (!telefono) return null;
  const original = String(telefono);
  const conPrefijo = original.trim().startsWith('+');
  const digitos = original.replace(/\D/g, '');
  if (conPrefijo) {
    if (digitos.length >= 10 && digitos.length <= 15) return digitos;
    return null;
  }
  if (digitos.length === 10) return `52${digitos}`;
  if (digitos.length === 11 && digitos.startsWith('1')) return `52${digitos.slice(1)}`;
  if (digitos.length === 12 && (digitos.startsWith('52') || digitos.startsWith('58'))) return digitos;
  return null;
}

function moneda(cantidad: number): string {
  return `$${cantidad.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export async function construirMensajeAbono(
  abono: FilaAbono,
  entidad: EntidadAbono
): Promise<string> {
  const negocio = await nombreNegocio();
  const nombre = entidad.cliente_nombre || 'cliente';
  const monto = moneda(abono.monto);
  const saldo = moneda(entidad.saldo_pendiente);

  const lineas = [
    `*${negocio}* · Confirmacion de abono`,
    '',
    `Hola *${nombre}* 👋`,
    '',
    `Recibimos tu abono de *${monto}* ✅`,
    `Correspondiente a *${entidad.descripcion}*`,
    '',
  ];

if (entidad.estado === 'LIQUIDADO') {
    lineas.push(`🎉 *Tu cuenta quedo LIQUIDADA!*`);
  } else {
    lineas.push(`💰 Saldo pendiente: *${saldo}*`);
  }

  const portal = await bloquePortal(entidad.telefono);
  lineas.push('', '¡Gracias por tu confianza! 🙏');
  if (portal) lineas.push(...portal.split('\n'));
  lineas.push('', `— ${negocio}`);
  return lineas.join('\n');
}

async function enviarMensajeA(telefono: string, texto: string): Promise<void> {
  if (!cliente || !sesionConectada) {
    throw new Error('WhatsApp no conectado');
  }
const chat = await getChatConCache(telefono);
  await chat.sendMessage(texto);
}

const chatCache = new Map<string, import('whatsapp-web.js').Chat>();

async function getChatConCache(telefono: string): Promise<import('whatsapp-web.js').Chat> {
  if (!cliente || !sesionConectada) {
    throw new Error('WhatsApp no conectado');
  }
  const existente = chatCache.get(telefono);
  if (existente) return existente;
  const chat = await cliente.getChatById(`${telefono}@c.us`);
  chatCache.set(telefono, chat);
  return chat;
}

async function enviarPDFA(
  telefono: string,
  buffer: Buffer,
  nombreArchivo: string
): Promise<void> {
  if (!cliente || !sesionConectada) {
    throw new Error('WhatsApp no conectado');
  }
  const rutaTemporal = path.join(os.tmpdir(), nombreArchivo);
  fs.writeFileSync(rutaTemporal, buffer);
  try {
const media = MessageMedia.fromFilePath(rutaTemporal);
    const chat = await getChatConCache(telefono);
    await chat.sendMessage(media, { caption: `Recibo ${nombreArchivo.replace('.pdf', '')}` });
  } finally {
    fs.unlink(rutaTemporal, () => undefined);
  }
}

export async function notificarAbono(abono: FilaAbono, entidad: EntidadAbono): Promise<void> {
  const telefono = normalizarTelefono(entidad.telefono);
  if (!telefono) {
    await marcarNotificacion(abono.id, 'SIN_TELEFONO');
    return;
  }
  if (!sesionWhatsAppActiva()) return;
  try {
    const texto = await construirMensajeAbono(abono, entidad);
    const pdf = await pdfAbono(abono.id);
    await enviarMensajeA(telefono, texto);
    await enviarPDFA(telefono, pdf.buffer, pdf.nombre);
    await marcarNotificacion(abono.id, 'ENVIADA');
    console.log(`[whatsapp] comprobante + PDF enviados a ${telefono} (abono #${abono.id})`);
  } catch (e) {
    await marcarNotificacion(abono.id, 'FALLIDA');
    console.error(`[whatsapp] fallo al enviar abono #${abono.id}:`, (e as Error).message);
  }
}

export async function notificarVenta(venta: FilaVenta): Promise<void> {
  const telefono = normalizarTelefono(venta.cliente_telefono);
  if (!telefono || !sesionWhatsAppActiva()) return;
  try {
    const negocio = await nombreNegocio();
    const portal = await bloquePortal(venta.cliente_telefono);
    const texto = [
      `*${negocio}* · Recibo de venta #${venta.id}`,
      '',
      `Hola *${venta.cliente_nombre || 'cliente'}* 👋`,
      '',
      `Tu venta por *${moneda(venta.total)}* quedó registrada ✅`,
      venta.saldo_pendiente > 0
        ? `Saldo pendiente: *${moneda(venta.saldo_pendiente)}*`
        : '🎉 ¡Pagada por completo!',
      '',
      'Te enviamos tu recibo en PDF. ¡Gracias por tu confianza! 🙏',
      ...(portal ? portal.split('\n') : []),
    ].join('\n');
    const pdf = await pdfVenta(venta.id);
    await enviarMensajeA(telefono, texto);
    await enviarPDFA(telefono, pdf.buffer, pdf.nombre);
    console.log(`[whatsapp] recibo de venta #${venta.id} enviado a ${telefono}`);
  } catch (e) {
    console.error(`[whatsapp] fallo al enviar recibo de venta #${venta.id}:`, (e as Error).message);
  }
}

function iniciarColaDeReintentos(): void {
  if (reintentos) return;
  reintentos = setInterval(async () => {
    try {
const pendientes = await abonosPendientesDeNotificar(20);
        if (pendientes.length) console.log(`[whatsapp] cola: ${pendientes.length} abono(s) pendiente(s) por enviar`);
        for (const abono of pendientes) {
          const telefono = normalizarTelefono((abono as FilaAbono & { cliente_telefono?: string | null }).cliente_telefono);
          void procesarPendiente(abono, telefono);
        }
    } catch (e) {
      console.error('[whatsapp] error en la cola de reintentos:', (e as Error).message);
    }
  }, 60_000);
}

async function procesarPendiente(abono: FilaAbono, telefono: string | null): Promise<void> {
  if (!telefono) {
    await marcarNotificacion(abono.id, 'SIN_TELEFONO');
    return;
  }
try {
    const texto = await construirMensajePendiente(abono);
    await enviarMensajeA(telefono, texto);
    const pdf = await pdfAbono(abono.id);
    await enviarPDFA(telefono, pdf.buffer, pdf.nombre);
    await marcarNotificacion(abono.id, 'ENVIADA');
    console.log(`[whatsapp] abono #${abono.id} enviado y marcado ENVIADA`);
  } catch (e) {
    const detalle = e instanceof Error ? `${e.name}: ${e.message}\n${e.stack}` : JSON.stringify(e);
    console.error(`[whatsapp] reintento fallido abono #${abono.id}: ${detalle}`);
    try {
      await marcarNotificacion(abono.id, 'FALLIDA');
      console.error(`[whatsapp] abono #${abono.id} marcado FALLIDA en BD`);
    } catch (e2) {
      console.error(`[whatsapp] no pude marcar FALLIDA del abono #${abono.id}:`, (e2 as Error).message);
    }
  }
}

async function bloquePortal(telefono: string | null | undefined): Promise<string> {
  if (!telefono) return '';
  try {
    const portalUrl = (await obtenerValor('PORTAL_URL')) || '';
    if (!portalUrl) return '';
    const credenciales = await asegurarCredencialesPortal(telefono);
    if (!credenciales) return '';
    const url = `${portalUrl.replace(/\/+$/, '').replace(/\/portal$/i, '')}/portal`;
    return ['', '🌐 *Consulta tus cuentas en línea*:', `📲 ${url}`, `👤 Usuario: ${credenciales.usuario_portal}`, `🔑 Contraseña: ${credenciales.pass_plano_portal}`].join('\n');
  } catch (e) {
    console.error('[whatsapp] no pude armar el bloque del portal:', (e as Error).message);
    return '';
  }
}

async function construirMensajePendiente(abono: FilaAbono): Promise<string> {
  const negocio = await nombreNegocio();
  const portal = await bloquePortal((abono as FilaAbono & { cliente_telefono?: string | null }).cliente_telefono);
  return [
    `*${negocio}* · Confirmacion de abono`,
    '',
    `Hola *${abono.cliente_nombre || 'cliente'}* 👋`,
    '',
    `Recibimos tu abono de *${moneda(abono.monto)}* ✅`,
    `Referencia: *${abono.venta_id ? 'venta #' + abono.venta_id : abono.destino ? 'viaje a ' + abono.destino : 'viaje'}*`,
    '',
    '¡Gracias por tu confianza! 🙏',
    ...(portal ? portal.split('\n') : []),
  ].join('\n');
}

export function reiniciarWhatsApp(): void {
  if (!env.WHATSAPP_ENABLED) return;
  apagando = false;
  if (reintentoTimer) {
    clearTimeout(reintentoTimer);
    reintentoTimer = null;
  }
  if (!mensajeInicializado && !cliente && !inicializando) {
    console.log('[whatsapp] reinicio a peticion del usuario: sin cliente activo, inicializando');
    inicializarWhatsApp();
    return;
  }
  void destruirYReiniciar('a peticion del usuario');
}

export function detenerWhatsApp(): void {
  apagando = true;
  generacion += 1;
  if (sesionConectada) sincronizarSesionSiHay(true);
  if (reintentos) clearInterval(reintentos);
  if (reintentoTimer) {
    clearTimeout(reintentoTimer);
    reintentoTimer = null;
  }
  if (cliente) {
    void cliente.destroy().catch(() => undefined);
    cliente = null;
    sesionConectada = false;
  }
}

