import PDFDocument from 'pdfkit';
import { pool } from '../db/pool';
import { AppError } from '../utils/http';
import { existeLogo, RUTA_LOGO, nombreNegocio } from './sistema.service';

function moneda(cantidad: number): string {
  return `$${cantidad.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fechaTexto(fecha: string | Date, conHora = false): string {
  const d = new Date(fecha);
  const texto = d.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
  if (!conHora) return texto;
  return `${texto} ${d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`;
}

type PDFDoc = typeof PDFDocument;

function crearDocumento(titulo: string, negocio: string): PDFDoc {
  const doc: PDFDoc = new PDFDocument({ size: 'LETTER', margin: 45 });
  doc.info.Title = titulo;
  doc.info.Author = negocio;

  const gradiente = doc.linearGradient(0, 0, doc.page.width, 135);
  gradiente.stop(0, '#24336b').stop(1, '#101b42');
  doc.rect(0, 0, doc.page.width, 135).fill(gradiente);

  if (existeLogo()) {
    try {
      doc.image(RUTA_LOGO, 45, 38, { fit: [75, 75] });
    } catch {
      void 0;
    }
  }
  doc.fontSize(15).font('Helvetica-Bold').fillColor('#ffffff').text(negocio, 135, 40, { width: 400 });
  const yTitulo = Math.max(doc.y + 5, 68);
  doc.fontSize(12).fillColor('#cdd8f0').text(titulo, 135, yTitulo, { width: 400 });
  const yEmitido = Math.max(doc.y + 3, yTitulo + 17);
  doc.fillColor('#8fa3d8').fontSize(8.5).font('Helvetica').text(`Emitido: ${fechaTexto(new Date(), true)}`, 135, yEmitido, { width: 400 });
  doc.fillColor('#000000');
  doc.font('Helvetica-Bold').fontSize(11).text('_______________________________________________________________________________', 45, 150);
  doc.y = 160;
  return doc;
}

function lineasDocumento(doc: PDFDoc, filas: { izquierda: string; derecha: string }[]): void {
  const anchoUtil = doc.page.width - 90;
  for (const fila of filas) {
    const y = doc.y;
    doc.font('Helvetica').fontSize(10.5).fillColor('#334155');
    doc.text(fila.izquierda, 45, y);
    if (fila.derecha) {
      doc.text(fila.derecha, 45, y, { width: anchoUtil, align: 'right' });
    }
    doc.moveDown(0.3);
  }
  doc.moveDown(0.5);
}

function encabezadoTabla(doc: PDFDoc, columnas: string[], anchos: number[]): void {
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#1e293b');
  const y = doc.y;
  let x = 45;
  columnas.forEach((columna, i) => {
    doc.text(columna, x, y, { width: anchos[i] - 10, align: i === columnas.length - 1 ? 'right' : 'left', lineBreak: false });
    x += anchos[i];
  });
  doc.y = y + 13;
  doc.text('______________________________', 45);
  doc.moveDown(0.3);
}

function pieDocumento(doc: PDFDoc, negocio: string): void {
  doc.moveDown(1);
  doc.font('Helvetica').fontSize(9).fillColor('#94a3b8');
  doc.text(`Generado por BEKA · ${negocio}`, { align: 'center' });
}

function finalizar(doc: PDFDoc): Promise<Buffer> {
  return new Promise((resolver) => {
    const trozos: Buffer[] = [];
    doc.on('data', (t) => trozos.push(t as Buffer));
    doc.on('end', () => resolver(Buffer.concat(trozos)));
    doc.end();
  });
}

interface FilasParaVenta {
  venta: {
    id: number;
    fecha: string;
    total: number;
    costo_total: number;
    saldo_pendiente: number;
    estado: string;
    notas: string | null;
    a_credito?: boolean;
    recargo_pct?: number;
    recargo_monto?: number;
    cliente_nombre: string;
    cliente_telefono: string | null;
  };
  detalles: {
    sku: string;
    producto_nombre: string;
    cantidad: number;
    precio_unitario: number;
    precio_costo_unitario: number;
  }[];
  abonos: { id: number; monto: number; metodo: string; created_at: string }[];
}

export async function pdfVenta(idVenta: number): Promise<{ buffer: Buffer; nombre: string }> {
  const { rows } = await pool.query(
    `SELECT v.*, c.nombre AS cliente_nombre, c.telefono AS cliente_telefono
       FROM ventas v JOIN clientes c ON c.id = v.cliente_id
      WHERE v.id = $1`,
    [idVenta]
  );
  if (!rows.length) throw new AppError(404, 'Venta no encontrada');
  const venta = rows[0] as FilasParaVenta['venta'];

  const detalles = (
    await pool.query(
      `SELECT p.sku, p.nombre AS producto_nombre, d.cantidad, d.precio_unitario, d.precio_costo_unitario
         FROM venta_detalles d JOIN catalogo_productos p ON p.id = d.producto_id
        WHERE d.venta_id = $1 ORDER BY d.id`,
      [idVenta]
    )
  ).rows as FilasParaVenta['detalles'];

  const abonos = (
    await pool.query(
      `SELECT id, monto, metodo, created_at FROM abonos WHERE venta_id = $1 ORDER BY id`,
      [idVenta]
    )
  ).rows as FilasParaVenta['abonos'];

  const negocio = await nombreNegocio();
  const doc = crearDocumento(`Recibo de venta #${idVenta}`, negocio);

  lineasDocumento(doc, [
    { izquierda: `Cliente: ${venta.cliente_nombre}`, derecha: '' },
    ...(venta.cliente_telefono ? [{ izquierda: `Teléfono: ${venta.cliente_telefono}`, derecha: '' }] : []),
    { izquierda: `Fecha: ${fechaTexto(venta.fecha, true)}`, derecha: `Estado: ${venta.estado === 'LIQUIDADO' ? 'LIQUIDADO' : 'PENDIENTE'}` },
    { izquierda: 'Producto/servicio', derecha: 'Cant. · Precio' },
  ]);

  encabezadoTabla(doc, ['SKU', 'Producto', 'Cant.', 'Precio', 'Subtotal'], [70, 215, 45, 80, 120]);
  for (const d of detalles) {
    const x = 45;
    const y = doc.y;
    doc.font('Helvetica').fontSize(9.5).fillColor('#334155');
    doc.text(String(d.sku), x, y, { width: 70, lineBreak: false, ellipsis: true });
    doc.text(d.producto_nombre, x + 70, y, { width: 215, lineBreak: false, ellipsis: true });
    doc.text(String(d.cantidad), x + 285, y, { width: 45, align: 'right', lineBreak: false });
    doc.text(moneda(d.precio_unitario), x + 330, y, { width: 80, align: 'right', lineBreak: false });
    doc.text(moneda(d.precio_unitario * d.cantidad), x + 410, y, { width: 120, align: 'right', lineBreak: false });
    doc.moveDown(0.4);
  }
  doc.text('_____________________________', 45);
  doc.moveDown(0.5);

  lineasDocumento(doc, [
    { izquierda: 'Subtotal', derecha: moneda(detalles.reduce((s, d) => s + d.precio_unitario * d.cantidad, 0)) },
    ...(venta.recargo_monto ? [{ izquierda: `Recargo por crédito (${venta.recargo_pct}%)`, derecha: moneda(venta.recargo_monto) }] : []),
    { izquierda: 'Total', derecha: moneda(venta.total) },
    ...(venta.saldo_pendiente > 0
      ? [{ izquierda: 'Saldo pendiente', derecha: moneda(venta.saldo_pendiente) }]
      : [{ izquierda: 'Estado', derecha: 'Cuenta LIQUIDADA' }]),
  ]);

  if (abonos.length) {
    doc.text('Abonos registrados', { align: 'center' });
    encabezadoTabla(doc, ['#', 'Fecha', 'Método', 'Monto'], [45, 150, 200, 140]);
    for (const a of abonos) {
      lineasDocumento(doc, [
        { izquierda: `#${a.id}`, derecha: '' },
        { izquierda: fechaTexto(a.created_at), derecha: a.metodo },
        { izquierda: moneda(a.monto), derecha: '' },
      ]);
    }
  }

  pieDocumento(doc, negocio);
  const buffer = await finalizar(doc);
  return { buffer, nombre: `recibo-venta-${idVenta}.pdf` };
}

export async function pdfAbono(idAbono: number): Promise<{ buffer: Buffer; nombre: string }> {
  const { rows } = await pool.query(
    `SELECT a.*, c.nombre AS cliente_nombre, c.telefono AS cliente_telefono,
            v.destino, v.saldo_pendiente AS saldo_viaje, v.estado AS estado_viaje,
            ve.saldo_pendiente AS saldo_venta, ve.estado AS estado_venta,
            ve.total AS total_venta
       FROM abonos a
       LEFT JOIN clientes c ON c.id = (CASE WHEN a.venta_id IS NOT NULL THEN (SELECT cliente_id FROM ventas WHERE id = a.venta_id) ELSE (SELECT cl.id FROM viajes j LEFT JOIN clientes cl ON cl.id = j.cliente_id WHERE j.id = a.viaje_id) END)
       LEFT JOIN viajes v ON v.id = a.viaje_id
       LEFT JOIN ventas ve ON ve.id = a.venta_id
      WHERE a.id = $1`,
    [idAbono]
  );
  if (!rows.length) throw new AppError(404, 'Abono no encontrado');
  const abono = rows[0] as {
    id: number;
    venta_id: number | null;
    viaje_id: number | null;
    monto: number;
    metodo: string;
    observacion: string | null;
    registrado_por: string;
    created_at: string;
    cliente_nombre: string | null;
    cliente_telefono: string | null;
    destino: string | null;
    saldo_viaje: number | null;
    estado_viaje: string | null;
    saldo_venta: number | null;
    estado_venta: string | null;
    total_venta: number | null;
  };

  const negocio = await nombreNegocio();
  const esVenta = abono.venta_id !== null;
  const saldo = esVenta ? abono.saldo_venta : abono.saldo_viaje;
  const estado = esVenta ? abono.estado_venta : abono.estado_viaje;
  const descripcion = esVenta
    ? `Venta #${abono.venta_id}`
    : `Viaje a ${abono.destino ?? 'sin destino'}`;

  const doc = crearDocumento(`Comprobante de abono #${abono.id}`, negocio);

  lineasDocumento(doc, [
    { izquierda: `Cliente: ${abono.cliente_nombre || 'Cliente'}`, derecha: '' },
    ...(abono.cliente_telefono ? [{ izquierda: `Teléfono: ${abono.cliente_telefono}`, derecha: '' }] : []),
    { izquierda: 'Concepto', derecha: descripcion },
    { izquierda: 'Monto abonado', derecha: moneda(abono.monto) },
    { izquierda: 'Método de pago', derecha: abono.metodo },
    { izquierda: 'Fecha', derecha: fechaTexto(abono.created_at, true) },
    {
      izquierda: estado === 'LIQUIDADO' ? 'Estado' : 'Saldo restante',
      derecha: estado === 'LIQUIDADO' ? 'CUENTA LIQUIDADA' : moneda(saldo ?? 0),
    },
  ]);

  pieDocumento(doc, negocio);
  const buffer = await finalizar(doc);
  return { buffer, nombre: `comprobante-abono-${idAbono}.pdf` };
}