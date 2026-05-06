-- ============================================================
-- SECCO — Migracion incremental: declaraciones del cliente
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- ============================================================

ALTER TABLE actas ADD COLUMN IF NOT EXISTS acepta_declaracion BOOLEAN DEFAULT FALSE;
ALTER TABLE actas ADD COLUMN IF NOT EXISTS acepta_responsabilidad_objetos BOOLEAN DEFAULT FALSE;
ALTER TABLE actas ADD COLUMN IF NOT EXISTS acepta_pruebas_ruta BOOLEAN DEFAULT FALSE;
