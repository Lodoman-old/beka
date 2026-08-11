CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS clientes (
  id         SERIAL PRIMARY KEY,
  nombre     TEXT NOT NULL CHECK (char_length(btrim(nombre)) > 0),
  telefono   TEXT,
  documento  TEXT,
  email      TEXT,
  direccion  TEXT,
  notas      TEXT,
  activo     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_clientes_telefono ON clientes (telefono)
  WHERE telefono IS NOT NULL AND btrim(telefono) <> '';
CREATE UNIQUE INDEX IF NOT EXISTS uq_clientes_documento ON clientes (documento)
  WHERE documento IS NOT NULL AND btrim(documento) <> '';

CREATE TABLE IF NOT EXISTS catalogo_productos (
  id              SERIAL PRIMARY KEY,
  sku             TEXT NOT NULL UNIQUE,
  nombre          TEXT NOT NULL,
  precio_costo    NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (precio_costo >= 0),
  precio_publico  NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (precio_publico >= 0),
  margen_aplicado NUMERIC(6,2) NOT NULL DEFAULT 0,
  imagen          TEXT,
  activo          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ventas (
  id               SERIAL PRIMARY KEY,
  cliente_id       INTEGER NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
  estado           TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE','LIQUIDADO')),
  total            NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  costo_total      NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (costo_total >= 0),
  saldo_pendiente  NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (saldo_pendiente >= 0),
  notas            TEXT,
  registrado_por   TEXT NOT NULL DEFAULT 'SISTEMA',
  fecha            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_ventas_cliente ON ventas (cliente_id);
CREATE INDEX IF NOT EXISTS ix_ventas_fecha ON ventas (fecha);

CREATE TABLE IF NOT EXISTS venta_detalles (
  id                    SERIAL PRIMARY KEY,
  venta_id              INTEGER NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
  producto_id           INTEGER NOT NULL REFERENCES catalogo_productos(id) ON DELETE RESTRICT,
  cantidad              INTEGER NOT NULL CHECK (cantidad > 0),
  precio_unitario       NUMERIC(12,2) NOT NULL CHECK (precio_unitario >= 0),
  precio_costo_unitario NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (precio_costo_unitario >= 0),
  UNIQUE (venta_id, producto_id)
);

CREATE TABLE IF NOT EXISTS viajes (
  id                   SERIAL PRIMARY KEY,
  cliente_id           INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
  destino              TEXT NOT NULL,
  fecha_salida         DATE NOT NULL,
  fecha_regreso        DATE,
  costo_fijo           NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (costo_fijo >= 0),
  precio_por_pasajero  NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (precio_por_pasajero >= 0),
  estado               TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE','LIQUIDADO')),
  total                NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  saldo_pendiente      NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (saldo_pendiente >= 0),
  notas                TEXT,
  registrado_por       TEXT NOT NULL DEFAULT 'SISTEMA',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_viajes_cliente ON viajes (cliente_id);
CREATE INDEX IF NOT EXISTS ix_viajes_salida ON viajes (fecha_salida);

CREATE TABLE IF NOT EXISTS pasajeros (
  id         SERIAL PRIMARY KEY,
  viaje_id   INTEGER NOT NULL REFERENCES viajes(id) ON DELETE CASCADE,
  nombre     TEXT NOT NULL CHECK (char_length(btrim(nombre)) > 0),
  telefono   TEXT,
  asiento    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_pasajeros_asiento ON pasajeros (viaje_id, asiento)
  WHERE asiento IS NOT NULL AND btrim(asiento) <> '';
CREATE INDEX IF NOT EXISTS ix_pasajeros_viaje ON pasajeros (viaje_id);

CREATE TABLE IF NOT EXISTS abonos (
  id                    SERIAL PRIMARY KEY,
  venta_id              INTEGER REFERENCES ventas(id) ON DELETE RESTRICT,
  viaje_id              INTEGER REFERENCES viajes(id) ON DELETE RESTRICT,
  pasajero_id           INTEGER REFERENCES pasajeros(id) ON DELETE RESTRICT,
  monto                 NUMERIC(12,2) NOT NULL CHECK (monto > 0),
  metodo                TEXT NOT NULL DEFAULT 'EFECTIVO' CHECK (metodo IN ('EFECTIVO','TRANSFERENCIA','TARJETA','OTRO')),
  observacion           TEXT,
  registrado_por        TEXT NOT NULL DEFAULT 'POS',
  notificacion_whatsapp TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK (notificacion_whatsapp IN ('PENDIENTE','ENVIADA','FALLIDA','SIN_TELEFONO')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((venta_id IS NULL) <> (viaje_id IS NULL))
);

CREATE INDEX IF NOT EXISTS ix_abonos_venta ON abonos (venta_id);
CREATE INDEX IF NOT EXISTS ix_abonos_viaje ON abonos (viaje_id);
CREATE INDEX IF NOT EXISTS ix_abonos_pasajero ON abonos (pasajero_id);
CREATE INDEX IF NOT EXISTS ix_abonos_created ON abonos (created_at);

CREATE TABLE IF NOT EXISTS configuracion (
  clave       TEXT PRIMARY KEY,
  valor       TEXT NOT NULL,
  descripcion TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION recalcular_venta(_venta_id INTEGER) RETURNS VOID AS $$
DECLARE
  v_total    NUMERIC(12,2);
  v_costo    NUMERIC(12,2);
  v_abonado  NUMERIC(12,2);
  v_saldo    NUMERIC(12,2);
BEGIN
  SELECT COALESCE(SUM(d.cantidad * d.precio_unitario), 0),
         COALESCE(SUM(d.cantidad * d.precio_costo_unitario), 0)
    INTO v_total, v_costo
    FROM venta_detalles d
   WHERE d.venta_id = _venta_id;

  SELECT COALESCE(SUM(monto), 0) INTO v_abonado FROM abonos WHERE venta_id = _venta_id;

  v_saldo := GREATEST(v_total - v_abonado, 0);

  UPDATE ventas
     SET total = v_total,
         costo_total = v_costo,
         saldo_pendiente = v_saldo,
         estado = CASE WHEN v_saldo <= 0 THEN 'LIQUIDADO' ELSE 'PENDIENTE' END,
         updated_at = now()
   WHERE id = _venta_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION recalcular_viaje(_viaje_id INTEGER) RETURNS VOID AS $$
DECLARE
  v_precio   NUMERIC(12,2);
  v_total    NUMERIC(12,2);
  v_abonado  NUMERIC(12,2);
  v_saldo    NUMERIC(12,2);
BEGIN
  SELECT precio_por_pasajero INTO v_precio FROM viajes WHERE id = _viaje_id;

  SELECT (SELECT count(*) FROM pasajeros WHERE viaje_id = _viaje_id) * v_precio
    INTO v_total;

  SELECT COALESCE(SUM(monto), 0) INTO v_abonado FROM abonos WHERE viaje_id = _viaje_id;

  v_saldo := GREATEST(v_total - v_abonado, 0);

  UPDATE viajes
     SET total = v_total,
         saldo_pendiente = v_saldo,
         estado = CASE WHEN v_saldo <= 0 THEN 'LIQUIDADO' ELSE 'PENDIENTE' END,
         updated_at = now()
   WHERE id = _viaje_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_venta_detalle() RETURNS TRIGGER AS $$
BEGIN
  PERFORM recalcular_venta(COALESCE(NEW.venta_id, OLD.venta_id));
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_venta_detalle_ai ON venta_detalles;
CREATE TRIGGER trg_venta_detalle_ai AFTER INSERT OR UPDATE OR DELETE ON venta_detalles
FOR EACH ROW EXECUTE FUNCTION trg_venta_detalle();

CREATE OR REPLACE FUNCTION trg_abono() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.venta_id IS NOT NULL THEN PERFORM recalcular_venta(OLD.venta_id); END IF;
    IF OLD.viaje_id IS NOT NULL THEN PERFORM recalcular_viaje(OLD.viaje_id); END IF;
    RETURN OLD;
  END IF;
  IF NEW.venta_id IS NOT NULL THEN PERFORM recalcular_venta(NEW.venta_id); END IF;
  IF NEW.viaje_id IS NOT NULL THEN PERFORM recalcular_viaje(NEW.viaje_id); END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_abono_ai ON abonos;
CREATE TRIGGER trg_abono_ai AFTER INSERT OR UPDATE OR DELETE ON abonos
FOR EACH ROW EXECUTE FUNCTION trg_abono();

CREATE OR REPLACE FUNCTION trg_pasajero() RETURNS TRIGGER AS $$
BEGIN
  PERFORM recalcular_viaje(COALESCE(NEW.viaje_id, OLD.viaje_id));
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pasajero_ai ON pasajeros;
CREATE TRIGGER trg_pasajero_ai AFTER INSERT OR UPDATE OR DELETE ON pasajeros
FOR EACH ROW EXECUTE FUNCTION trg_pasajero();