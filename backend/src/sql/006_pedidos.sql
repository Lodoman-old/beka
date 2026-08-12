CREATE TABLE IF NOT EXISTS pedidos (
  id             SERIAL PRIMARY KEY,
  cliente_id     INTEGER NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
  estado         TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE','ENTREGADO','CONVERTIDO')),
  venta_id       INTEGER REFERENCES ventas(id) ON DELETE SET NULL,
  notas          TEXT,
  registrado_por TEXT NOT NULL DEFAULT 'SISTEMA',
  fecha          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_pedidos_cliente ON pedidos (cliente_id);
CREATE INDEX IF NOT EXISTS ix_pedidos_fecha ON pedidos (fecha);
CREATE INDEX IF NOT EXISTS ix_pedidos_estado ON pedidos (estado);

CREATE TABLE IF NOT EXISTS pedido_detalles (
  id                    SERIAL PRIMARY KEY,
  pedido_id             INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  producto_id           INTEGER NOT NULL REFERENCES catalogo_productos(id) ON DELETE RESTRICT,
  cantidad              INTEGER NOT NULL CHECK (cantidad > 0),
  precio_unitario       NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (precio_unitario >= 0),
  precio_costo_unitario NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (precio_costo_unitario >= 0),
  UNIQUE (pedido_id, producto_id)
);

CREATE INDEX IF NOT EXISTS ix_pedido_detalles_pedido ON pedido_detalles (pedido_id);