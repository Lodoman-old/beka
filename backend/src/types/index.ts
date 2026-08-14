export interface FilaCliente {
  id: number;
  nombre: string;
  telefono: string | null;
  documento: string | null;
  email: string | null;
  direccion: string | null;
  notas: string | null;
  activo: boolean;
  usuario_portal: string | null;
  pass_plano_portal: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface FilaProducto {
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
  created_at: Date;
  updated_at: Date;
}

export interface FilaVenta {
  id: number;
  cliente_id: number;
  estado: 'PENDIENTE' | 'LIQUIDADO';
  total: number;
  costo_total: number;
  saldo_pendiente: number;
  notas: string | null;
  registrado_por: string;
  fecha: Date;
  created_at: Date;
  cliente_nombre?: string;
  cliente_telefono?: string | null;
  abonos_count?: number;
}

export interface FilaViaje {
  id: number;
  cliente_id: number | null;
  destino: string;
  fecha_salida: string;
  fecha_regreso: string | null;
  costo_fijo: number;
  precio_por_pasajero: number;
  estado: 'PENDIENTE' | 'LIQUIDADO';
  total: number;
  saldo_pendiente: number;
  notas: string | null;
  registrado_por: string;
  created_at: Date;
  cliente_nombre?: string | null;
  pasajeros_count?: number;
}

export interface FilaPasajero {
  id: number;
  viaje_id: number;
  nombre: string;
  telefono: string | null;
  asiento: string | null;
  abonado: number;
  precio: number;
  saldo: number;
}

export interface FilaAbono {
  id: number;
  venta_id: number | null;
  viaje_id: number | null;
  pasajero_id: number | null;
  monto: number;
  metodo: string;
  observacion: string | null;
  registrado_por: string;
  notificacion_whatsapp: string;
  created_at: Date;
  cliente_nombre?: string;
  destino?: string | null;
}

export interface EntidadAbono {
  tipo: 'VENTA' | 'VIAJE';
  id: number;
  descripcion: string;
  cliente_nombre: string;
  telefono: string | null;
  saldo_pendiente: number;
  estado: string;
  destino?: string;
}