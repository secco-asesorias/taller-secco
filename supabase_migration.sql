-- ============================================================
-- SECCO — Migration: Auth + Roles + Soft Lock
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- ============================================================
-- IMPORTANTE: Ejecutar este archivo DESPUÉS de supabase_schema.sql
-- ============================================================


-- ============================================================
-- 1. TABLA PERFILES (vinculada a auth.users de Supabase)
-- ============================================================
CREATE TABLE IF NOT EXISTS perfiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre          TEXT NOT NULL,
  rol             TEXT NOT NULL DEFAULT 'tecnico'
                  CHECK (rol IN ('admin', 'tecnico', 'recepcionista')),
  activo          BOOLEAN DEFAULT true,
  creado_en       TIMESTAMPTZ DEFAULT NOW(),
  actualizado_en  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE perfiles ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- 2. FUNCIONES HELPER (SECURITY DEFINER — bypassean RLS)
--    Deben crearse ANTES de las policies que las usan.
-- ============================================================
CREATE OR REPLACE FUNCTION public.mi_rol()
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT rol FROM public.perfiles WHERE id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.mi_nombre()
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT nombre FROM public.perfiles WHERE id = auth.uid() LIMIT 1;
$$;


-- Políticas de perfiles — usando mi_rol() para evitar recursión infinita
DROP POLICY IF EXISTS "perfil_propio_lectura" ON perfiles;
CREATE POLICY "perfil_propio_lectura" ON perfiles
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "admin_lee_perfiles" ON perfiles;
CREATE POLICY "admin_lee_perfiles" ON perfiles
  FOR SELECT USING (public.mi_rol() = 'admin');

DROP POLICY IF EXISTS "admin_modifica_perfiles" ON perfiles;
CREATE POLICY "admin_modifica_perfiles" ON perfiles
  FOR ALL USING (public.mi_rol() = 'admin');

DROP POLICY IF EXISTS "usuario_actualiza_propio" ON perfiles;
CREATE POLICY "usuario_actualiza_propio" ON perfiles
  FOR UPDATE USING (auth.uid() = id);


-- ============================================================
-- 3. TRIGGER: crear perfil automáticamente al registrar usuario
-- ============================================================
CREATE OR REPLACE FUNCTION public.crear_perfil_usuario()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.perfiles (id, nombre, rol)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nombre', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'rol', 'tecnico')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.crear_perfil_usuario();


-- ============================================================
-- 4. TABLA SESIONES DE EDICIÓN (soft lock multiusuario)
-- ============================================================
CREATE TABLE IF NOT EXISTS sesiones_edicion (
  tabla           TEXT NOT NULL,
  registro_id     UUID NOT NULL,
  usuario_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre_usuario  TEXT NOT NULL,
  activo_hasta    TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '2 minutes'),
  PRIMARY KEY (tabla, registro_id)
);

ALTER TABLE sesiones_edicion ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sesiones_autenticado" ON sesiones_edicion;
CREATE POLICY "sesiones_autenticado" ON sesiones_edicion
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');


-- ============================================================
-- 5. REEMPLAZAR POLÍTICAS RLS ABIERTAS CON RBAC
-- ============================================================

-- ── CLIENTES ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "acceso_publico_clientes" ON clientes;

CREATE POLICY "clientes_lectura" ON clientes
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "clientes_escritura" ON clientes
  FOR INSERT WITH CHECK (public.mi_rol() IN ('admin', 'recepcionista', 'tecnico'));

CREATE POLICY "clientes_actualizacion" ON clientes
  FOR UPDATE USING (public.mi_rol() IN ('admin', 'recepcionista'));

-- ── VEHÍCULOS ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "acceso_publico_vehiculos" ON vehiculos;

CREATE POLICY "vehiculos_lectura" ON vehiculos
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "vehiculos_escritura" ON vehiculos
  FOR INSERT WITH CHECK (public.mi_rol() IN ('admin', 'recepcionista', 'tecnico'));

CREATE POLICY "vehiculos_actualizacion" ON vehiculos
  FOR UPDATE USING (public.mi_rol() IN ('admin', 'recepcionista'));

-- ── ACTAS ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "acceso_publico_actas" ON actas;

CREATE POLICY "actas_lectura" ON actas
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "actas_insercion" ON actas
  FOR INSERT WITH CHECK (public.mi_rol() IN ('admin', 'recepcionista', 'tecnico'));

CREATE POLICY "actas_actualizacion" ON actas
  FOR UPDATE USING (auth.role() = 'authenticated');

-- ── FOTOS ACTA ────────────────────────────────────────────────
DROP POLICY IF EXISTS "acceso_publico_fotos" ON fotos_acta;

CREATE POLICY "fotos_acta_acceso" ON fotos_acta
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ── DIAGNÓSTICOS ──────────────────────────────────────────────
DROP POLICY IF EXISTS "acceso_publico_diagnosticos" ON diagnosticos;

CREATE POLICY "diagnosticos_lectura" ON diagnosticos
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "diagnosticos_escritura" ON diagnosticos
  FOR INSERT WITH CHECK (public.mi_rol() IN ('admin', 'tecnico'));

CREATE POLICY "diagnosticos_actualizacion" ON diagnosticos
  FOR UPDATE USING (public.mi_rol() IN ('admin', 'tecnico'));

-- ── CHECKLIST, FOTOS DIAGNÓSTICO, REPUESTOS ───────────────────
DROP POLICY IF EXISTS "acceso_publico_diagnostico_checklist" ON diagnostico_checklist;
DROP POLICY IF EXISTS "acceso_publico_diagnostico_fotos" ON diagnostico_fotos;
DROP POLICY IF EXISTS "acceso_publico_diagnostico_repuestos" ON diagnostico_repuestos;

CREATE POLICY "diag_checklist_acceso" ON diagnostico_checklist
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (public.mi_rol() IN ('admin', 'tecnico'));

CREATE POLICY "diag_fotos_acceso" ON diagnostico_fotos
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (public.mi_rol() IN ('admin', 'tecnico'));

CREATE POLICY "diag_repuestos_acceso" ON diagnostico_repuestos
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (public.mi_rol() IN ('admin', 'tecnico'));

-- ── COTIZACIONES: SOLO ADMIN ───────────────────────────────────
DROP POLICY IF EXISTS "acceso_publico_cotizaciones" ON cotizaciones;

CREATE POLICY "cotizaciones_admin" ON cotizaciones
  FOR ALL
  USING (public.mi_rol() = 'admin')
  WITH CHECK (public.mi_rol() = 'admin');

-- ── ÓRDENES DE TRABAJO ────────────────────────────────────────
DROP POLICY IF EXISTS "acceso_publico_ordenes" ON ordenes_trabajo;

-- Admin gestiona todas las OTs
CREATE POLICY "ot_admin" ON ordenes_trabajo
  FOR ALL
  USING (public.mi_rol() = 'admin')
  WITH CHECK (public.mi_rol() = 'admin');

-- Técnico ve sus propias OTs asignadas
CREATE POLICY "ot_tecnico_lectura" ON ordenes_trabajo
  FOR SELECT
  USING (
    public.mi_rol() = 'tecnico' AND
    tecnico_nombre = public.mi_nombre()
  );

-- Técnico puede actualizar sus propias OTs (avanzar estado, instrucciones)
CREATE POLICY "ot_tecnico_actualizacion" ON ordenes_trabajo
  FOR UPDATE
  USING (
    public.mi_rol() = 'tecnico' AND
    tecnico_nombre = public.mi_nombre()
  );

-- ── TÉCNICOS ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "acceso_publico_tecnicos" ON tecnicos;

CREATE POLICY "tecnicos_lectura" ON tecnicos
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "tecnicos_admin_escritura" ON tecnicos
  FOR INSERT WITH CHECK (public.mi_rol() = 'admin');

CREATE POLICY "tecnicos_admin_actualizacion" ON tecnicos
  FOR UPDATE USING (public.mi_rol() = 'admin');


-- ============================================================
-- 6. ACTUALIZAR STORAGE — solo usuarios autenticados suben fotos
-- ============================================================
DROP POLICY IF EXISTS "fotos_actas_public_insert" ON storage.objects;
DROP POLICY IF EXISTS "fotos_actas_public_update" ON storage.objects;
DROP POLICY IF EXISTS "fotos_actas_public_delete" ON storage.objects;

CREATE POLICY "fotos_actas_auth_insert"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'fotos-actas' AND auth.role() = 'authenticated');

CREATE POLICY "fotos_actas_auth_update"
ON storage.objects FOR UPDATE
USING (bucket_id = 'fotos-actas' AND auth.role() = 'authenticated')
WITH CHECK (bucket_id = 'fotos-actas' AND auth.role() = 'authenticated');

CREATE POLICY "fotos_actas_auth_delete"
ON storage.objects FOR DELETE
USING (bucket_id = 'fotos-actas' AND auth.role() = 'authenticated');


-- ============================================================
-- 7. ÍNDICES ADICIONALES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_perfiles_rol ON perfiles(rol);
CREATE INDEX IF NOT EXISTS idx_sesiones_edicion_registro ON sesiones_edicion(tabla, registro_id);


-- ============================================================
-- INSTRUCCIONES POST-EJECUCIÓN
-- ============================================================
-- 1. Ir a Supabase Dashboard > Authentication > Users
-- 2. Crear el primer usuario admin: click "Add user" con email y contraseña
-- 3. Luego ejecutar en SQL Editor:
--
--    UPDATE perfiles SET rol = 'admin' WHERE id = '<UUID del usuario>';
--
-- O al crear el usuario via API:
--    supabase.auth.admin.createUser({
--      email: 'admin@secco.cl',
--      password: '...',
--      user_metadata: { nombre: 'Nombre Admin', rol: 'admin' }
--    })
-- ============================================================
