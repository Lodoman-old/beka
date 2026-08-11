INSERT INTO configuracion (clave, valor, descripcion) VALUES
  ('MARGEN_GANANCIA', '30', 'Margen de ganancia en porcentaje aplicado al precio de costo del catalogo'),
  ('NOMBRE_NEGOCIO', 'BEKA', 'Nombre del negocio usado en reportes y mensajes de WhatsApp'),
  ('ULTIMA_SINCRONIZACION_NICE', '', 'Fecha y hora de la ultima sincronizacion del catalogo NICE')
ON CONFLICT (clave) DO NOTHING;