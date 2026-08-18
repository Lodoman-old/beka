import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  Browsers,
  type WASocket,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import * as qrcode from 'qrcode-terminal';
import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';
import { env } from '../config/env';
import { EntidadAbono, FilaAbono, FilaVenta } from '../types';
import { abonosPendientesDeNotificar, marcarNotificacion } from './abonos.service';
import { asegurarCredencialesPortal } from './clientes.service';
import { nombreNegocio, DIR_DATOS, obtenerValor } from './sistema.service';
import { pdfAbono, pdfVenta } from './comprobantes.service';

let cliente: WASocket | null = null;
let sesionConectada = false;
let qrPendiente = false;
let mensajeInicializado = false;
let errorInicializacion: string | null = null;
let reintentos: ReturnType<typeof setInterval> | null = null;
let reintentoTimer: ReturnType<typeof setTimeout> | null = null;
let apagando = false;
let generacion = 0;
let inicializando = false;
let reiniciando = false;
let fallosConsecutivos = 0;
let ultimoReady = 0;
let ultimoQr = '';

const mensajesMemoria = new Map<string, import('@whiskeysockets/baileys').WAMessage>();

const REINTENTOS_BACKOFF = [60_000, 120_000, 300_000, 900_000];
const MIN_INTERVALO_READY = 10_000;

function dirSesion(): string {
  return path.join(env.WHATSAPP_SESION_DIR, 'baileys');
}

function sesionEnDisco(): boolean {
  try {
    return fs.existsSync(path.join(dirSesion(), 'creds.json'));
  } catch {
    return false;
  }
}

function borrarSesionDeDisco(): void {
  const dir = env.WHATSAPP_SESION_DIR;
  try {
    if (!fs.existsSync(dir)) return;
    let borrado = 0;
    for (const entrada of fs.readdirSync(dir)) {
      if (entrada === 'baileys' || entrada === 'session' || entrada.startsWith('session-respaldo-')) {
        fs.rmSync(path.join(dir, entrada), { recursive: true, force: true });
        borrado += 1;
      }
    }
    console.log(`[whatsapp] sesion borrada del volumen (${borrado} carpeta(s)); se pedira un QR nuevo`);
  } catch (e) {
    console.error('[whatsapp] no pude borrar la sesion del volumen:', (e as Error).message);
  }
}

function programarReintento(esperaPersonalizada?: number): void {
  if (reintentoTimer) clearTimeout(reintentoTimer);
  const espera = esperaPersonalizada ?? REINTENTOS_BACKOFF[Math.min(fallosConsecutivos, REINTENTOS_BACKOFF.length - 1)];
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
    if (cliente) {
      const actual = cliente;
      cliente = null;
      sesionConectada = false;
      generacion += 1;
      try {
        await Promise.race([
          new Promise<void>((resolver) => {
            actual.end(new Error('reinicio'));
            resolver();
          }),
          new Promise((r) => setTimeout(r, 10_000)),
        ]);
      } catch {
        // el cliente ya no existia o no pudo apagarse; seguimos igual
      }
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

export function estadoWhatsApp(): {
  activo: boolean;
  estado: string;
  qr_pendiente: boolean;
  detalle: string | null;
  sesion_en_disco?: boolean;
  respaldo_en_disco?: boolean;
  candado?: null;
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
    respaldo_en_disco: false,
    candado: null,
  };
}

export function sesionWhatsAppActiva(): boolean {
  return sesionConectada && cliente !== null;
}

function generarQr(qr: string): void {
  if (qr === ultimoQr) return;
  ultimoQr = qr;
  if (reintentoTimer) {
    clearTimeout(reintentoTimer);
    reintentoTimer = null;
  }
  fallosConsecutivos = 0;
  qrPendiente = true;
  errorInicializacion = null;
  console.log('[whatsapp] QR disponible; escanealo con el WhatsApp del negocio (solo la primera vez)');
  qrcode.generate(qr, { small: true });
  const rutaQr = path.join(DIR_DATOS, 'qr.png');
  QRCode.toFile(rutaQr, qr, { width: 320, margin: 1, color: { dark: '#000000', light: '#FFFFFF' } })
    .then(() => console.log(`[whatsapp] QR guardado en ${rutaQr} (sirvelo en /api/config/whatsapp-qr)`))
    .catch((e) => console.error('[whatsapp] no pude guardar el QR:', (e as Error).message));
}

async function arrancarSock(miGeneracion: number): Promise<void> {
  try {
    let version: { version: [number, number, number] };
    try {
      const v = await fetchLatestBaileysVersion();
      version = v;
    } catch {
      version = { version: [6, 7, 24] };
    }
    const { state, saveCreds } = await useMultiFileAuthState(dirSesion());
    console.log(
      `[whatsapp] sesion en disco: ${sesionEnDisco() ? 'SI (se reutilizara)' : 'NO (se pedira QR)'}`
    );

    const sock = makeWASocket({
      version: version.version,
      auth: state,
      printQRInTerminal: false,
      browser: Browsers.ubuntu('Chrome'),
      logger: pino({ level: 'error' }),
      markOnlineOnConnect: false,
      syncFullHistory: false,
      getMessage: async (clave) => {
        const guardada = mensajesMemoria.get(`${clave.remoteJid}:${clave.id}`);
        return guardada?.message || undefined;
      },
    });
    cliente = sock;

    sock.ev.on('creds.update', () => {
      void saveCreds().catch(() => undefined);
    });

    sock.ev.on('connection.update', (u) => {
      if (generacion !== miGeneracion) return;
      if (u.qr) generarQr(u.qr);
      if (u.connection === 'open') {
        const ahora = Date.now();
        if (ahora - ultimoReady < MIN_INTERVALO_READY) {
          console.log(
            `[whatsapp] open repetido ignorado (${Math.round((ahora - ultimoReady) / 1000)}s tras el anterior)`
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
        fallosConsecutivos = 0;
        console.log('[whatsapp] Sesion conectada correctamente');
        iniciarColaDeReintentos();
      }
      if (u.connection === 'close') {
        if (apagando) return;
        sesionConectada = false;
        fallosConsecutivos += 1;
        const codigo = (
          u.lastDisconnect?.error as { output?: { statusCode?: number } } | undefined
        )?.output?.statusCode;
        if (
          codigo === DisconnectReason.loggedOut ||
          codigo === DisconnectReason.badSession ||
          codigo === DisconnectReason.multideviceMismatch
        ) {
          qrPendiente = false;
          errorInicializacion = 'La sesion fue revocada o es invalida; se generara un QR nuevo';
          console.error(`[whatsapp] ${errorInicializacion} (codigo ${codigo})`);
          borrarSesionDeDisco();
          programarReintento();
        } else if (sesionEnDisco()) {
          qrPendiente = false;
          errorInicializacion = 'Conexion perdida: ' + (codigo ?? 'desconocido');
          console.error('[whatsapp]', errorInicializacion);
          programarReintento();
        } else {
          console.log(
            `[whatsapp] caida temporal (${codigo ?? 'desconocido'}) mientras se espera el escaneo; el QR se regenera`
          );
          programarReintento(15_000);
        }
      }
    });

    sock.ev.on('messages.upsert', (m) => {
      for (const msg of m.messages) {
        if (msg.key?.id && msg.key.remoteJid) {
          mensajesMemoria.set(`${msg.key.remoteJid}:${msg.key.id}`, msg);
        }
      }
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
  console.log('[whatsapp] inicializando sesion (Baileys)...');
  void arrancarSock(miGeneracion);
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

function jidDe(telefono: string): string {
  return `${telefono}@s.whatsapp.net`;
}

async function enviarMensajeA(telefono: string, texto: string): Promise<void> {
  if (!cliente || !sesionConectada) {
    throw new Error('WhatsApp no conectado');
  }
  await cliente.sendMessage(jidDe(telefono), { text: texto });
}

async function enviarPDFA(
  telefono: string,
  buffer: Buffer,
  nombreArchivo: string
): Promise<void> {
  if (!cliente || !sesionConectada) {
    throw new Error('WhatsApp no conectado');
  }
  await cliente.sendMessage(jidDe(telefono), {
    document: buffer,
    fileName: nombreArchivo,
    mimetype: 'application/pdf',
    caption: `Recibo ${nombreArchivo.replace('.pdf', '')}`,
  });
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
  if (reintentos) clearInterval(reintentos);
  if (reintentoTimer) {
    clearTimeout(reintentoTimer);
    reintentoTimer = null;
  }
  if (cliente) {
    try {
      cliente.end(new Error('apagado'));
    } catch {
      // ya no existia
    }
    cliente = null;
    sesionConectada = false;
  }
}