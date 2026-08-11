ALTER TABLE catalogo_productos ADD COLUMN IF NOT EXISTS origen TEXT NOT NULL DEFAULT 'MANUAL';
CREATE INDEX IF NOT EXISTS ix_productos_origen ON catalogo_productos (origen);