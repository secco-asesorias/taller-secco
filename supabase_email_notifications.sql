-- ============================================================
-- SECCO — Migracion incremental: emails y fotos por hallazgo
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- ============================================================

ALTER TABLE diagnostico_fotos ADD COLUMN IF NOT EXISTS item TEXT;

CREATE INDEX IF NOT EXISTS idx_diagnostico_fotos_item
ON diagnostico_fotos(diagnostico_id, seccion, item);

CREATE TABLE IF NOT EXISTS email_notificaciones (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type           TEXT NOT NULL,
  scope_type           TEXT NOT NULL,
  scope_id             UUID NOT NULL,
  acta_id              UUID REFERENCES actas(id) ON DELETE SET NULL,
  cliente_id           UUID REFERENCES clientes(id) ON DELETE SET NULL,
  email_destino        TEXT,
  subject              TEXT,
  html                 TEXT,
  text                 TEXT,
  template_data        JSONB DEFAULT '{}'::jsonb,
  status               TEXT DEFAULT 'pending',
  provider_message_id  TEXT,
  error_message        TEXT,
  manual_resend_of     UUID REFERENCES email_notificaciones(id) ON DELETE SET NULL,
  sent_at              TIMESTAMPTZ,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_notificaciones_scope
ON email_notificaciones(scope_type, scope_id);

CREATE INDEX IF NOT EXISTS idx_email_notificaciones_status
ON email_notificaciones(status);

CREATE UNIQUE INDEX IF NOT EXISTS uq_email_notificaciones_evento_auto
ON email_notificaciones(scope_type, scope_id, event_type)
WHERE manual_resend_of IS NULL;

ALTER TABLE email_notificaciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "acceso_publico_email_notificaciones" ON email_notificaciones;
CREATE POLICY "acceso_publico_email_notificaciones"
ON email_notificaciones FOR ALL
USING (true)
WITH CHECK (true);
