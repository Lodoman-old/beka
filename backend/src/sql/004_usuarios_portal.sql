CREATE TABLE IF NOT EXISTS usuarios (
  id SERIAL PRIMARY KEY,
  usuario TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  nombre TEXT,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE clientes ADD COLUMN IF NOT EXISTS usuario_portal TEXT;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS pass_hash_portal TEXT;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS pass_plano_portal TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_clientes_usuario_portal ON clientes (usuario_portal) WHERE usuario_portal IS NOT NULL;