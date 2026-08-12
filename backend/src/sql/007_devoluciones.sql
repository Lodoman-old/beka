CREATE TABLE IF NOT EXISTS devoluciones (
  id               SERIAL PRIMARY KEY,
  venta_id         INTEGER NOT NULL REFERENCES ventas(id) ON DELETE RESTRICT,
  tipo             TEXT NOT NULL DEFAULT 'REEMBOLSO' CHECK (tipo IN ('REEMBOLSO','CAMBIO')),
  motivo           TEXT,
  reembolso_dinero NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (reembolso_dinero >= 0),
  registrado_por   TEXT NOT NULL DEFAULT 'WEB',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_devoluciones_venta ON devoluciones (venta_id);
CREATE INDEX IF NOT EXISTS ix_devoluciones_fecha ON devoluciones (created_at);

CREATE TABLE IF NOT EXISTS devolucion_detalles (
  id              SERIAL PRIMARY KEY,
  devolucion_id   INTEGER NOT NULL REFERENCES devoluciones(id) ON DELETE CASCADE,
  producto_id     INTEGER NOT NULL REFERENCES catalogo_productos(id) ON DELETE RESTRICT,
  cantidad        INTEGER NOT NULL CHECK (cantidad > 0),
  precio_unitario NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (precio_unitario >= 0),
  tipo            TEXT NOT NULL DEFAULT 'DEVUELTO' CHECK (tipo IN ('DEVUELTO','ENTREGADO'))
);

CREATE INDEX IF NOT EXISTS ix_devolucion_detalles_devolucion ON devolucion_detalles (devolucion_id);