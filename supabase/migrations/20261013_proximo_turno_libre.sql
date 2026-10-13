-- =============================================================================
-- El próximo turno libre de CADA profesional (13/10/2026).
--
-- La clínica y el menú de rescate pedían los primeros 500 turnos libres de la
-- clínica virtual, ordenados por fecha, para saber quién tiene agenda y cuál es
-- su turno más cercano. Con las agendas que hay hoy, 500 turnos alcanzan apenas
-- para mañana: un profesional con la consulta inmediata apagada y turnos recién
-- desde pasado mañana quedaba FUERA de la clínica, sin que nadie se enterara.
--
-- Lo que esas pantallas necesitan es, por profesional, su turno libre más
-- cercano: una fila por profesional, sin tope que se rompa al crecer.
--
-- SECURITY INVOKER: respeta la RLS de `turnos` de quien la llama (el paciente
-- ve los turnos libres, igual que con el SELECT de antes).
--
-- Va también a la base institucional (migrations-institucional/037): el menú de
-- rescate (lib/oferta.ts) es código compartido.
-- =============================================================================

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
