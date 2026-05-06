-- ============================================================
-- SECCO — Migracion incremental: documentos por vehiculo
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- ============================================================

-- Los borradores de acta se crean antes de registrar km/combustible.
ALTER TABLE actas ALTER COLUMN km DROP NOT NULL;
ALTER TABLE actas ALTER COLUMN combustible DROP NOT NULL;

-- Estados/tipos para presupuestos sin asignar, preliminares y finales.
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS tipo_presupuesto TEXT DEFAULT 'final';
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS presupuesto_origen_id UUID REFERENCES cotizaciones(id) ON DELETE SET NULL;
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS fecha_asignacion TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_cotizaciones_vehiculo ON cotizaciones(vehiculo_id);
CREATE INDEX IF NOT EXISTS idx_cotizaciones_acta ON cotizaciones(acta_id);
CREATE INDEX IF NOT EXISTS idx_cotizaciones_tipo_presupuesto ON cotizaciones(tipo_presupuesto);

-- Refuerza que los presupuestos sin asignar no queden mezclados con documentos de vehículo.
CREATE INDEX IF NOT EXISTS idx_cotizaciones_sin_asignar
ON cotizaciones(status, updated_at)
WHERE status = 'sin_asignar' AND acta_id IS NULL AND vehiculo_id IS NULL;
