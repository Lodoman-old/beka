export interface Cliente {
  id: number;
  nombre: string;
  telefono: string | null;
  documento: string | null;
  email: string | null;
  direccion: string | null;
  notas: string | null;
  activo: boolean;
  created_at: string;
  usuario_portal?: string | null;
  pass_plano_portal?: string | null;
}

export interface Producto {
  id: number;
  sku: string;
  nombre: string;
  talla: string | null;
  color: string | null;
  precio_costo: number;
  precio_publico: number;
  margen_aplicado: number;
  imagen: string | null;
  activo: boolean;
}

export interface DetalleVenta {
  id: number;
  producto_id: number;
  cantidad: number;
  precio_unitario: number;
  precio_costo_unitario: number;
  sku: string;
  producto_nombre: string;
  imagen: string | null;
}

export interface Venta {
  id: number;
  cliente_id: number;
  cliente_nombre: string;
  cliente_telefono: string | null;
  estado: 'PENDIENTE' | 'LIQUIDADO';
  total: number;
  costo_total: number;
  saldo_pendiente: number;
  a_credito?: boolean;
  recargo_pct?: number;
  recargo_monto?: number;
  notas: string | null;
  fecha: string;
  abonos_count?: number;
  detalles?: DetalleVenta[];
}

export interface Viaje {
  id: number;
  cliente_id: number | null;
  cliente_nombre: string | null;
  destino: string;
  fecha_salida: string;
  fecha_regreso: string | null;
  costo_fijo: number;
  precio_por_pasajero: number;
  estado: 'PENDIENTE' | 'LIQUIDADO';
  total: number;
  saldo_pendiente: number;
  pasajeros_count?: number;
  pasajeros?: Pasajero[];
}

export interface Pasajero {
  id: number;
  viaje_id: number;
  nombre: string;
  telefono: string | null;
  asiento: string | null;
  abonado: number;
  precio: number;
  saldo: number;
}

export interface Abono {
  id: number;
  venta_id: number | null;
  viaje_id: number | null;
  pasajero_id: number | null;
  monto: number;
  metodo: string;
  observacion: string | null;
  notificacion_whatsapp: string;
  created_at: string;
  cliente_nombre?: string;
  destino?: string | null;
  cliente_telefono?: string | null;
}

export interface ResultadoAbono {
  abono: Abono;
  entidad: {
    tipo: 'VENTA' | 'VIAJE';
    id: number;
    descripcion: string;
    cliente_nombre: string;
    telefono: string | null;
    saldo_pendiente: number;
    estado: string;
  };
}

export interface Balance {
  ingresos_brutos: number;
  costos_totales: number;
  utilidad_neta: number;
  cuentas_por_cobrar: number;
  caja_recibida: number;
  desglose: {
    mercaderia: { ingresos: number; costos: number; utilidad: number };
    viajes: { ingresos: number; costos: number; utilidad: number };
  };
}

export interface PuntoSerie {
  periodo: string;
  ingresos: number;
  costos: number;
  utilidad: number;
  caja: number;
}

export interface Deudor {
  id: number;
  nombre: string;
  telefono: string | null;
  saldo: number;
}

export interface ItemCatalog {
  total: number;
  filas: Producto[];
}

export interface ItemClientes {
  total: number;
  filas: Cliente[];
}

export interface ItemVentas {
  total: number;
  filas: Venta[];
}

export interface Pedido {
  id: number;
  cliente_id: number;
  cliente_nombre: string;
  cliente_telefono: string | null;
  estado: 'PENDIENTE' | 'ENTREGADO' | 'CONVERTIDO';
  venta_id: number | null;
  notas: string | null;
  fecha: string;
  articulos_count?: number;
  total_pedido?: number;
  detalles?: PedidoDetalle[];
}

export interface PedidoDetalle {
  id: number;
  pedido_id: number;
  producto_id: number;
  cantidad: number;
  precio_unitario: number;
  precio_costo_unitario: number;
  sku: string;
  producto_nombre: string;
  imagen: string | null;
  precio_hoy: number;
}

export interface ItemPedidos {
  total: number;
  filas: Pedido[];
}

export interface Devolucion {
  id: number;
  venta_id: number;
  tipo: 'REEMBOLSO' | 'CAMBIO';
  motivo: string | null;
  reembolso_dinero: number;
  registrado_por: string;
  created_at: string;
}

export interface ResultadoDevolucion {
  devolucion: Devolucion;
  venta: Venta;
}

export interface ItemViajes {
  total: number;
  filas: Viaje[];
}

export interface ValorConfig {
  clave: string;
  valor: string;
  descripcion: string | null;
}

export interface EstadoWhatsApp {
  activo: boolean;
  estado: string;
  qr_pendiente: boolean;
  detalle: string | null;
  sesion_en_disco?: boolean;
  respaldo_en_disco?: boolean;
}