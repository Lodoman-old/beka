ALTER TABLE ventas ADD COLUMN IF NOT EXISTS a_credito BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS recargo_pct NUMERIC(6,2) NOT NULL DEFAULT 0;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS recargo_monto NUMERIC(12,2) NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION recalcular_venta(_venta_id INTEGER) RETURNS VOID AS $$
DECLARE
  v_base     NUMERIC(12,2);
  v_costo    NUMERIC(12,2);
  v_abonado  NUMERIC(12,2);
  v_recargo  NUMERIC(12,2);
  v_total    NUMERIC(12,2);
  v_saldo    NUMERIC(12,2);
BEGIN
  SELECT COALESCE(SUM(d.cantidad * d.precio_unitario), 0),
         COALESCE(SUM(d.cantidad * d.precio_costo_unitario), 0)
    INTO v_base, v_costo
    FROM venta_detalles d
   WHERE d.venta_id = _venta_id;

  SELECT COALESCE(SUM(monto), 0) INTO v_abonado FROM abonos WHERE venta_id = _venta_id;

  SELECT recargo_pct INTO v_recargo FROM ventas WHERE id = _venta_id;

  v_recargo := ROUND(v_base * (v_recargo / 100), 2);
  v_total := v_base + v_recargo;
  v_saldo := GREATEST(v_total - v_abonado, 0);

  UPDATE ventas
     SET total = v_total,
         costo_total = v_costo,
         recargo_monto = v_recargo,
         saldo_pendiente = v_saldo,
         estado = CASE WHEN v_saldo <= 0 THEN 'LIQUIDADO' ELSE 'PENDIENTE' END,
         updated_at = now()
   WHERE id = _venta_id;
END;
$$ LANGUAGE plpgsql;