-- 037 — espejo de `supabase/migrations/20261013_proximo_turno_libre.sql`.
--
-- El menú de rescate (lib/oferta.ts) es código compartido y llama a esta función.

CREATE OR REPLACE FUNCTION public.proximo_turno_libre_por_medico(p_desde date, p_canal text DEFAULT 'clinica_virtual')
RETURNS TABLE (medico_id uuid, fecha date, hora_inicio time)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT DISTINCT ON (t.medico_id) t.medico_id, t.fecha, t.hora_inicio
  FROM turnos t
  WHERE t.estado = 'disponible'
    AND t.canal_origen = p_canal
    AND t.fecha >= p_desde
  ORDER BY t.medico_id, t.fecha, t.hora_inicio
$$;

REVOKE ALL ON FUNCTION public.proximo_turno_libre_por_medico(date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.proximo_turno_libre_por_medico(date, text) TO authenticated, service_role;
