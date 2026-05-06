-- ============================================================
-- SECCO — Schema de base de datos en Supabase
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- ============================================================

-- Extensión para UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- CLIENTES
-- ============================================================
CREATE TABLE IF NOT EXISTS clientes (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre      TEXT NOT NULL,
  rut         TEXT NOT NULL UNIQUE,
  telefono    TEXT,
  email       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- VEHÍCULOS
-- ============================================================
CREATE TABLE IF NOT EXISTS vehiculos (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cliente_id  UUID REFERENCES clientes(id) ON DELETE SET NULL,
  marca       TEXT NOT NULL,
  modelo      TEXT NOT NULL,
  anio        INTEGER NOT NULL,
  patente     TEXT NOT NULL UNIQUE,
  vin         TEXT,
  color       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ACTAS DE RECEPCIÓN
-- ============================================================
CREATE TABLE IF NOT EXISTS actas (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vehiculo_id         UUID REFERENCES vehiculos(id) ON DELETE SET NULL,
  cliente_id          UUID REFERENCES clientes(id) ON DELETE SET NULL,

  -- Responsables
  tecnico_nombre      TEXT,
  tc_nombre           TEXT,               -- Torre de control

  -- Datos de ingreso
  fecha_ingreso       DATE NOT NULL,
  hora_ingreso        TIME NOT NULL,
  km                  INTEGER,
  combustible         TEXT,                -- vacio / 1/4 / 1/2 / 3/4 / lleno
  llaves              SMALLINT DEFAULT 0,
  documentacion       TEXT[],             -- Array: permiso, soap, revision, etc.

  -- Estado del vehículo
  estado_exterior     TEXT,               -- sin_danos / con_danos
  detalle_exterior    TEXT,
  estado_interior     TEXT,               -- buen_estado / con_observaciones
  detalle_interior    TEXT,

  -- Trabajo solicitado
  trabajo_solicitado  TEXT,

  -- Declaraciones del cliente
  acepta_declaracion              BOOLEAN DEFAULT FALSE,
  acepta_responsabilidad_objetos  BOOLEAN DEFAULT FALSE,
  acepta_pruebas_ruta             BOOLEAN DEFAULT FALSE,

  -- Firmas (URLs en Supabase Storage)
  firma_cliente_url   TEXT,
  firma_secco_url     TEXT,

  -- Control
  checklist_completo  BOOLEAN DEFAULT FALSE,
  status              TEXT DEFAULT 'borrador', -- borrador / cerrada
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),

  -- Número correlativo legible (Acta #1, #2, ...)
  -- SERIAL genera 1, 2, 3... automáticamente, sin huecos garantizados
  numero_acta         SERIAL UNIQUE
);

-- ============================================================
-- FOTOS DEL ACTA
-- ============================================================
CREATE TABLE IF NOT EXISTS fotos_acta (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  acta_id     UUID REFERENCES actas(id) ON DELETE CASCADE,
  tipo        TEXT NOT NULL,
  -- Tipos: km / combustible / frontal / trasera / lateral_izq / lateral_der / interior / danos / firma_cliente / firma_secco
  url         TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- DIAGNÓSTICOS
-- ============================================================
CREATE TABLE IF NOT EXISTS diagnosticos (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_diagnostico     SERIAL UNIQUE,
  acta_id                UUID REFERENCES actas(id) ON DELETE SET NULL,
  nombre                 TEXT,
  status                 TEXT DEFAULT 'pendiente', -- pendiente / proceso / listo / cerrado
  tipo_mantencion        TEXT,                     -- basica / intermedia / full / otro
  tecnico_asignado       TEXT,
  horas_estimadas        NUMERIC,
  observaciones_generales TEXT,
  fecha_creacion         TIMESTAMPTZ DEFAULT NOW(),
  fecha_inicio           TIMESTAMPTZ,
  fecha_cierre           TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS diagnostico_checklist (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  diagnostico_id  UUID REFERENCES diagnosticos(id) ON DELETE CASCADE,
  seccion         INT,
  item            TEXT,
  estado          TEXT, -- ok / requiere_atencion / urgente / no_aplica
  observacion     TEXT,
  UNIQUE (diagnostico_id, seccion, item)
);

CREATE TABLE IF NOT EXISTS diagnostico_fotos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  diagnostico_id  UUID REFERENCES diagnosticos(id) ON DELETE CASCADE,
  seccion         INT,
  item            TEXT,
  url             TEXT,
  descripcion     TEXT,
  orden           INT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS diagnostico_repuestos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  diagnostico_id  UUID REFERENCES diagnosticos(id) ON DELETE CASCADE,
  nombre          TEXT,
  cantidad        NUMERIC,
  es_base         BOOL DEFAULT false,
  urgencia        TEXT, -- necesario / recomendado / opcional
  observacion     TEXT
);

-- ============================================================
-- ÓRDENES DE TRABAJO (tabla preparada para uso futuro)
-- ============================================================
CREATE TABLE IF NOT EXISTS ordenes_trabajo (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  acta_id           UUID REFERENCES actas(id) ON DELETE SET NULL,
  vehiculo_id       UUID REFERENCES vehiculos(id) ON DELETE SET NULL,
  cliente_id        UUID REFERENCES clientes(id) ON DELETE SET NULL,
  descripcion       TEXT,
  tecnico_asignado  TEXT,
  tecnico_nombre    TEXT,
  status            TEXT DEFAULT 'pendiente', -- pendiente / en_proceso / terminada / entregada
  fecha_inicio      DATE,
  fecha_estimada    DATE,
  items             JSONB DEFAULT '[]'::jsonb,
  repuestos         JSONB DEFAULT '[]'::jsonb,
  instrucciones     JSONB DEFAULT '[]'::jsonb,
  mano_obra         NUMERIC(12,0) DEFAULT 0,
  observaciones     TEXT,
  notas_torre       TEXT,
  historial         JSONB DEFAULT '[]'::jsonb,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),

  -- Número correlativo: OT-1, OT-2, OT-3... hasta el infinito
  -- SERIAL garantiza secuencia continua independiente de borrados
  numero_ot         SERIAL UNIQUE
);

-- ============================================================
-- COTIZACIONES (tabla preparada para uso futuro)
-- ============================================================
CREATE TABLE IF NOT EXISTS cotizaciones (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  acta_id         UUID REFERENCES actas(id) ON DELETE SET NULL,
  diagnostico_id  UUID REFERENCES diagnosticos(id) ON DELETE SET NULL,
  orden_id        UUID REFERENCES ordenes_trabajo(id) ON DELETE SET NULL,
  vehiculo_id     UUID REFERENCES vehiculos(id) ON DELETE SET NULL,
  cliente_id      UUID REFERENCES clientes(id) ON DELETE SET NULL,
  items           JSONB,    -- [{tipo, descripcion, cantidad, costo_unitario, precio_unitario, mano_obra, urgencia, observacion}]
  costo_total     NUMERIC(12,0) DEFAULT 0,
  mano_obra_total NUMERIC(12,0) DEFAULT 0,
  neto_antes_descuento NUMERIC(12,0) DEFAULT 0,
  subtotal        NUMERIC(12,0) DEFAULT 0,
  descuento       NUMERIC(12,0) DEFAULT 0,
  iva             NUMERIC(12,0) DEFAULT 0,
  total           NUMERIC(12,0) DEFAULT 0,
  utilidad        NUMERIC(12,0) DEFAULT 0,
  margen          NUMERIC(6,2) DEFAULT 0,
  vista_cliente   JSONB,
  status          TEXT DEFAULT 'borrador', -- borrador / lista / enviada / aprobada / rechazada
  tipo_presupuesto TEXT DEFAULT 'final', -- inicial / final
  presupuesto_origen_id UUID REFERENCES cotizaciones(id) ON DELETE SET NULL,
  fecha_asignacion TIMESTAMPTZ,
  notas           TEXT,
  notas_internas  TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),

  numero_cotizacion SERIAL UNIQUE
);

ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS diagnostico_id UUID REFERENCES diagnosticos(id) ON DELETE SET NULL;
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS costo_total NUMERIC(12,0) DEFAULT 0;
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS mano_obra_total NUMERIC(12,0) DEFAULT 0;
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS neto_antes_descuento NUMERIC(12,0) DEFAULT 0;
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS iva NUMERIC(12,0) DEFAULT 0;
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS utilidad NUMERIC(12,0) DEFAULT 0;
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS margen NUMERIC(6,2) DEFAULT 0;
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS vista_cliente JSONB;
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS notas_internas TEXT;
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS numero_cotizacion SERIAL UNIQUE;
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS tipo_presupuesto TEXT DEFAULT 'final';
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS presupuesto_origen_id UUID REFERENCES cotizaciones(id) ON DELETE SET NULL;
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS fecha_asignacion TIMESTAMPTZ;
ALTER TABLE actas ALTER COLUMN km DROP NOT NULL;
ALTER TABLE actas ALTER COLUMN combustible DROP NOT NULL;

ALTER TABLE ordenes_trabajo ADD COLUMN IF NOT EXISTS cotizacion_id UUID REFERENCES cotizaciones(id) ON DELETE SET NULL;
ALTER TABLE ordenes_trabajo ADD COLUMN IF NOT EXISTS tecnico_nombre TEXT;
ALTER TABLE ordenes_trabajo ADD COLUMN IF NOT EXISTS items JSONB DEFAULT '[]'::jsonb;
ALTER TABLE ordenes_trabajo ADD COLUMN IF NOT EXISTS repuestos JSONB DEFAULT '[]'::jsonb;
ALTER TABLE ordenes_trabajo ADD COLUMN IF NOT EXISTS instrucciones JSONB DEFAULT '[]'::jsonb;
ALTER TABLE ordenes_trabajo ADD COLUMN IF NOT EXISTS mano_obra NUMERIC(12,0) DEFAULT 0;
ALTER TABLE ordenes_trabajo ADD COLUMN IF NOT EXISTS observaciones TEXT;
ALTER TABLE ordenes_trabajo ADD COLUMN IF NOT EXISTS notas_torre TEXT;
ALTER TABLE ordenes_trabajo ADD COLUMN IF NOT EXISTS historial JSONB DEFAULT '[]'::jsonb;

ALTER TABLE diagnostico_fotos ADD COLUMN IF NOT EXISTS item TEXT;
ALTER TABLE actas ADD COLUMN IF NOT EXISTS acepta_declaracion BOOLEAN DEFAULT FALSE;
ALTER TABLE actas ADD COLUMN IF NOT EXISTS acepta_responsabilidad_objetos BOOLEAN DEFAULT FALSE;
ALTER TABLE actas ADD COLUMN IF NOT EXISTS acepta_pruebas_ruta BOOLEAN DEFAULT FALSE;

-- ============================================================
-- NOTIFICACIONES POR EMAIL
-- ============================================================
CREATE TABLE IF NOT EXISTS email_notificaciones (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type           TEXT NOT NULL, -- ingreso_vehiculo / inicio_mantencion / mantencion_finalizada
  scope_type           TEXT NOT NULL, -- acta / orden_trabajo
  scope_id             UUID NOT NULL,
  acta_id              UUID REFERENCES actas(id) ON DELETE SET NULL,
  cliente_id           UUID REFERENCES clientes(id) ON DELETE SET NULL,
  email_destino        TEXT,
  subject              TEXT,
  html                 TEXT,
  text                 TEXT,
  template_data        JSONB DEFAULT '{}'::jsonb,
  status               TEXT DEFAULT 'pending', -- pending / sent / failed / skipped
  provider_message_id  TEXT,
  error_message        TEXT,
  manual_resend_of     UUID REFERENCES email_notificaciones(id) ON DELETE SET NULL,
  sent_at              TIMESTAMPTZ,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TÉCNICOS
-- ============================================================
CREATE TABLE IF NOT EXISTS tecnicos (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre      TEXT NOT NULL UNIQUE,
  activo      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ÍNDICES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_vehiculos_patente ON vehiculos(patente);
CREATE INDEX IF NOT EXISTS idx_clientes_rut ON clientes(rut);
CREATE INDEX IF NOT EXISTS idx_actas_vehiculo ON actas(vehiculo_id);
CREATE INDEX IF NOT EXISTS idx_actas_cliente ON actas(cliente_id);
CREATE INDEX IF NOT EXISTS idx_actas_fecha ON actas(fecha_ingreso);
CREATE INDEX IF NOT EXISTS idx_fotos_acta_id ON fotos_acta(acta_id);
CREATE INDEX IF NOT EXISTS idx_actas_numero ON actas(numero_acta);
CREATE INDEX IF NOT EXISTS idx_actas_status ON actas(status);
CREATE INDEX IF NOT EXISTS idx_ot_numero ON ordenes_trabajo(numero_ot);
CREATE INDEX IF NOT EXISTS idx_diagnosticos_acta ON diagnosticos(acta_id);
CREATE INDEX IF NOT EXISTS idx_diagnosticos_status ON diagnosticos(status);
CREATE INDEX IF NOT EXISTS idx_diagnostico_checklist_id ON diagnostico_checklist(diagnostico_id);
CREATE INDEX IF NOT EXISTS idx_diagnostico_fotos_id ON diagnostico_fotos(diagnostico_id);
CREATE INDEX IF NOT EXISTS idx_diagnostico_fotos_item ON diagnostico_fotos(diagnostico_id, seccion, item);
CREATE INDEX IF NOT EXISTS idx_diagnostico_repuestos_id ON diagnostico_repuestos(diagnostico_id);
CREATE INDEX IF NOT EXISTS idx_cotizaciones_diagnostico ON cotizaciones(diagnostico_id);
CREATE INDEX IF NOT EXISTS idx_cotizaciones_status ON cotizaciones(status);
CREATE INDEX IF NOT EXISTS idx_cotizaciones_numero ON cotizaciones(numero_cotizacion);
CREATE INDEX IF NOT EXISTS idx_cotizaciones_vehiculo ON cotizaciones(vehiculo_id);
CREATE INDEX IF NOT EXISTS idx_cotizaciones_acta ON cotizaciones(acta_id);
CREATE INDEX IF NOT EXISTS idx_cotizaciones_tipo_presupuesto ON cotizaciones(tipo_presupuesto);
CREATE INDEX IF NOT EXISTS idx_ot_cotizacion ON ordenes_trabajo(cotizacion_id);
CREATE INDEX IF NOT EXISTS idx_ot_status ON ordenes_trabajo(status);
CREATE INDEX IF NOT EXISTS idx_ot_tecnico ON ordenes_trabajo(tecnico_nombre);
CREATE INDEX IF NOT EXISTS idx_email_notificaciones_scope ON email_notificaciones(scope_type, scope_id);
CREATE INDEX IF NOT EXISTS idx_email_notificaciones_status ON email_notificaciones(status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_email_notificaciones_evento_auto
ON email_notificaciones(scope_type, scope_id, event_type)
WHERE manual_resend_of IS NULL;

-- ============================================================
-- ROW LEVEL SECURITY (RLS) — ajustar según necesidad de auth
-- ============================================================
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehiculos ENABLE ROW LEVEL SECURITY;
ALTER TABLE actas ENABLE ROW LEVEL SECURITY;
ALTER TABLE fotos_acta ENABLE ROW LEVEL SECURITY;
ALTER TABLE diagnosticos ENABLE ROW LEVEL SECURITY;
ALTER TABLE diagnostico_checklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE diagnostico_fotos ENABLE ROW LEVEL SECURITY;
ALTER TABLE diagnostico_repuestos ENABLE ROW LEVEL SECURITY;
ALTER TABLE ordenes_trabajo ENABLE ROW LEVEL SECURITY;
ALTER TABLE cotizaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE tecnicos ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_notificaciones ENABLE ROW LEVEL SECURITY;

-- Política temporal: acceso público (sin auth)
-- IMPORTANTE: Reemplazar con políticas basadas en roles cuando se active auth
DROP POLICY IF EXISTS "acceso_publico_clientes" ON clientes;
DROP POLICY IF EXISTS "acceso_publico_vehiculos" ON vehiculos;
DROP POLICY IF EXISTS "acceso_publico_actas" ON actas;
DROP POLICY IF EXISTS "acceso_publico_fotos" ON fotos_acta;
DROP POLICY IF EXISTS "acceso_publico_diagnosticos" ON diagnosticos;
DROP POLICY IF EXISTS "acceso_publico_diagnostico_checklist" ON diagnostico_checklist;
DROP POLICY IF EXISTS "acceso_publico_diagnostico_fotos" ON diagnostico_fotos;
DROP POLICY IF EXISTS "acceso_publico_diagnostico_repuestos" ON diagnostico_repuestos;
DROP POLICY IF EXISTS "acceso_publico_ordenes" ON ordenes_trabajo;
DROP POLICY IF EXISTS "acceso_publico_cotizaciones" ON cotizaciones;
DROP POLICY IF EXISTS "acceso_publico_tecnicos" ON tecnicos;
DROP POLICY IF EXISTS "acceso_publico_email_notificaciones" ON email_notificaciones;

CREATE POLICY "acceso_publico_clientes" ON clientes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "acceso_publico_vehiculos" ON vehiculos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "acceso_publico_actas" ON actas FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "acceso_publico_fotos" ON fotos_acta FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "acceso_publico_diagnosticos" ON diagnosticos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "acceso_publico_diagnostico_checklist" ON diagnostico_checklist FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "acceso_publico_diagnostico_fotos" ON diagnostico_fotos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "acceso_publico_diagnostico_repuestos" ON diagnostico_repuestos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "acceso_publico_ordenes" ON ordenes_trabajo FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "acceso_publico_cotizaciones" ON cotizaciones FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "acceso_publico_tecnicos" ON tecnicos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "acceso_publico_email_notificaciones" ON email_notificaciones FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- STORAGE BUCKET para fotos
-- (ejecutar desde Supabase Dashboard > Storage o via API)
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('fotos-actas', 'fotos-actas', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "fotos_actas_public_select" ON storage.objects;
DROP POLICY IF EXISTS "fotos_actas_public_insert" ON storage.objects;
DROP POLICY IF EXISTS "fotos_actas_public_update" ON storage.objects;
DROP POLICY IF EXISTS "fotos_actas_public_delete" ON storage.objects;

CREATE POLICY "fotos_actas_public_select"
ON storage.objects FOR SELECT
USING (bucket_id = 'fotos-actas');

CREATE POLICY "fotos_actas_public_insert"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'fotos-actas');

CREATE POLICY "fotos_actas_public_update"
ON storage.objects FOR UPDATE
USING (bucket_id = 'fotos-actas')
WITH CHECK (bucket_id = 'fotos-actas');

CREATE POLICY "fotos_actas_public_delete"
ON storage.objects FOR DELETE
USING (bucket_id = 'fotos-actas');
