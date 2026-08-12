-- 007_buscar_user_por_email.sql — Lookup directo de auth.users por email.
-- Migración SOLO de la instancia institucional. NUNCA corre en el B2C.
--
-- Cierra el riesgo §11.10 de la spec (gate #402): el alta de operadores en
-- /admin/operadores buscaba el user_id paginando `listUsers` con un techo de
-- 20 páginas × 1000 = 20.000 usuarios. Con un padrón provincial provisionado
-- (cada paciente del padrón es una cuenta de auth) ese techo se supera y el
-- resultado es un falso "ese email no tiene cuenta" — silencioso y confuso.
--
-- El reemplazo es un lookup indexado directo sobre auth.users, expuesto como
-- RPC SECURITY DEFINER (los roles de PostgREST no pueden leer el schema auth;
-- el definer sí — mismo patrón que las funciones definer ya usadas en la
-- instancia, p.ej. log_disponibilidad de 005). El código la invoca SIEMPRE
-- con service role; a anon/authenticated se les revoca el EXECUTE: un
-- paciente logueado no puede usarla para enumerar emails del padrón.

CREATE OR REPLACE FUNCTION public.buscar_user_id_por_email(p_email text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT id
  FROM auth.users
  WHERE lower(email) = lower(trim(p_email))
  LIMIT 1;
$$;

-- Solo service role (el rol postgres/service_role no pierde EXECUTE por esto).
REVOKE ALL ON FUNCTION public.buscar_user_id_por_email(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.buscar_user_id_por_email(text) FROM anon, authenticated;
