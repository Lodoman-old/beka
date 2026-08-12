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

function limpiarCandadoPerfil(): void {
  const dir = env.WHATSAPP_SESION_DIR;
  const raices = [dir, path.dirname(dir), '/app/.wwebjs_auth'];
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
        if (!cmdline.includes(perfil)) continue;
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

function reubicarSesion(): void {
  const dir = env.WHATSAPP_SESION_DIR;
  const origen = path.join(dir, 'session');
  try {
    if (!fs.existsSync(origen)) return;
    const destino = path.join(dir, `session-respaldo-${Date.now()}`);
    fs.renameSync(origen, destino);
    console.log(
      '[whatsapp] demasiados fallos de candado: la sesion se movio a ' + destino +
      ' y se reiniciara desde cero (necesitara escanear el QR)'
    );
  } catch (e) {
    console.error('[whatsapp] no pude mover la sesion:', (e as Error).message);
  }
}

function programarReintento(): void {
  if (reintentoTimer) clearTimeout(reintentoTimer);
  reintentoTimer = setTimeout(() => {
    reintentoTimer = null;
    void destruirYReiniciar('reintento programado');
  }, 60_000);
}

async function destruirYReiniciar(origen: string): Promise<void> {
  if (cliente) {
    const actual = cliente;
    cliente = null;
    sesionConectada = false;
    try {
      await actual.destroy();
    } catch {
      // el cliente ya no existia o no pudo apagarse; seguimos igual
    }
  }
  sesionConectada = false;
  qrPendiente = false;
  errorInicializacion = null;
  mensajeInicializado = false;
  console.log(`[whatsapp] reiniciando sesion (${origen})...`);
  await new Promise((r) => setTimeout(r, 3000));
  inicializarWhatsApp();
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
      if (mensaje && /parche-lid|WWebJS|lid/i.test(mensaje)) {
        console.log(`[wa-page] ${mensaje}`);
      }
    });
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
            window.__bekaUsync = async function (numero) {
              if (window.__bekaLidCache[numero]) return window.__bekaLidCache[numero];
              const query = window.require('WAWebContactSyncUtils').constructUsyncDeltaQuery([{ type: 'add', phoneNumber: numero }]);
              const r = await query.execute();
              const lid = r && Array.isArray(r.list) && r.list.length && r.list[0] && (r.list[0].id || r.list[0].lid);
              if (lid) window.__bekaLidCache[numero] = lid;
              return lid || null;
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
                    return getAsModel ? await window.WWebJS.getChatModel(creado.chat, { isChannel: false }) : creado.chat;
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
  if (!env.WHATSAPP_ENABLED || mensajeInicializado) return;
  mensajeInicializado = true;

  limpiarCandadoPerfil();
  matarProcesosChromium();
  limpiarCandadoPerfil();
  restaurarSesionRespaldo();

  console.log(
    `[whatsapp] sesion en disco: ${sesionEnDisco() ? 'SI (se reutilizara)' : 'NO (se pedira QR)'}`
  );

  if (hayCandadoActivo()) {
    fallosCandado += 1;
    console.log(
      `[whatsapp] el candado del perfil sigue activo (#${fallosCandado}); espero a que se libere sin tocar la sesion...`
    );
    if (fallosCandado >= 20) {
      fallosCandado = 0;
      console.log('[whatsapp] candado persistente por mas de 20 minutos: reubicando la sesion');
      reubicarSesion();
    }
    programarReintento();
    return;
  }

  try {
    cliente = new Client({
      authStrategy: new LocalAuth({
        dataPath: env.WHATSAPP_SESION_DIR,
      }),
      webVersion: '2.3000.1041220451-alpha',
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
      if (reintentoTimer) {
        clearTimeout(reintentoTimer);
        reintentoTimer = null;
      }
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
      if (reintentoTimer) {
        clearTimeout(reintentoTimer);
        reintentoTimer = null;
      }
      sesionConectada = true;
      qrPendiente = false;
      errorInicializacion = null;
      fallosCandado = 0;
      console.log('[whatsapp] Sesion conectada correctamente');
      void aplicarParcheLid().then(() => {
        iniciarColaDeReintentos();
      });
    });

cliente.on('auth_failure', (mensaje) => {
      sesionConectada = false;
      errorInicializacion = 'Fallo de autenticacion: ' + mensaje;
      console.error('[whatsapp]', errorInicializacion);
      if (!apagando) {
        console.log('[whatsapp] reprogramando reconexion: la sesion se generara de nuevo en el QR');
        programarReintento();
      }
    });

    cliente.on('disconnected', (razon) => {
      sesionConectada = false;
      qrPendiente = false;
      errorInicializacion = 'Sesion desconectada: ' + razon;
      console.error('[whatsapp]', errorInicializacion);
      if (!apagando) {
        console.log('[whatsapp] reconexion automatica programada en 60s...');
        programarReintento();
      }
    });

    void cliente.initialize().catch((e) => {
      errorInicializacion = 'No se pudo iniciar el navegador de WhatsApp: ' + String(e?.message || e);
      console.error('[whatsapp]', errorInicializacion);
      if (/process_singleton|in use by another Chromium/i.test(errorInicializacion)) {
        fallosCandado += 1;
        console.log(`[whatsapp] fallo de candado #${fallosCandado}`);
        matarProcesosChromium();
        limpiarCandadoPerfil();
        if (fallosCandado >= 20) {
          fallosCandado = 0;
          console.log('[whatsapp] candado persistente por mas de 20 minutos: reubicando la sesion');
          reubicarSesion();
        }
      } else {
        fallosCandado = 0;
      }
      programarReintento();
    });
  } catch (e) {
    errorInicializacion = 'Error creando el cliente de WhatsApp: ' + String((e as Error).message);
    console.error('[whatsapp]', errorInicializacion);
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
  if (!mensajeInicializado && !cliente) {
    console.log('[whatsapp] reinicio a peticion del usuario: sin cliente activo, inicializando');
    inicializarWhatsApp();
    return;
  }
  void destruirYReiniciar('a peticion del usuario');
}

export function detenerWhatsApp(): void {
  apagando = true;
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

