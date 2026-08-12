-- Acceso al portal por numero de telefono:
-- el usuario del cliente es su telefono completo; se elimina el indice unico
-- porque dos clientes pueden compartir numero (y eligiran su nombre al entrar).

DROP INDEX IF EXISTS idx_clientes_usuario_portal;

UPDATE clientes SET usuario_portal = NULL WHERE telefono IS NULL;
UPDATE clientes
   SET usuario_portal = telefono, updated_at = now()
 WHERE telefono IS NOT NULL AND usuario_portal IS DISTINCT FROM telefono;
