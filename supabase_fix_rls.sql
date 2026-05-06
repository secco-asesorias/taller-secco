-- ============================================================
-- SECCO — Fix: Recursión infinita en RLS de perfiles
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- ============================================================
-- Problema: las policies admin_lee_perfiles y admin_modifica_perfiles
-- hacen SELECT FROM perfiles, lo que dispara RLS de perfiles de nuevo
-- → recursión infinita. La solución es usar la función mi_rol()
-- que es SECURITY DEFINER y bypasea RLS.
-- ============================================================

-- 1. Asegurar que mi_rol() y mi_nombre() existen con SECURITY DEFINER

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


-- 2. Corregir policies de perfiles (quitar las que hacen SELECT FROM perfiles)

DROP POLICY IF EXISTS "admin_lee_perfiles" ON perfiles;
CREATE POLICY "admin_lee_perfiles" ON perfiles
  FOR SELECT USING (public.mi_rol() = 'admin');

DROP POLICY IF EXISTS "admin_modifica_perfiles" ON perfiles;
CREATE POLICY "admin_modifica_perfiles" ON perfiles
  FOR ALL USING (public.mi_rol() = 'admin');


-- 3. Corregir policies de OTs (quitar los SELECT FROM perfiles inline)

DROP POLICY IF EXISTS "ot_tecnico_lectura" ON ordenes_trabajo;
CREATE POLICY "ot_tecnico_lectura" ON ordenes_trabajo
  FOR SELECT
  USING (
    public.mi_rol() = 'tecnico' AND
    tecnico_nombre = public.mi_nombre()
  );

DROP POLICY IF EXISTS "ot_tecnico_actualizacion" ON ordenes_trabajo;
CREATE POLICY "ot_tecnico_actualizacion" ON ordenes_trabajo
  FOR UPDATE
  USING (
    public.mi_rol() = 'tecnico' AND
    tecnico_nombre = public.mi_nombre()
  );
