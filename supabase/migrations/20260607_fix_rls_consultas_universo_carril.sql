-- Fix: RLS de consultas INSERT — universo del carril de prueba (es_cuenta_test).
-- YA APLICADA en prod (07/06/2026, autorizada por Diego). Este archivo la trackea.
--
-- GAP del carril de prueba (#167): los guards de la app (clinica/actions.ts) se
-- hicieron universe-aware (test↔test permitido), pero la policy RLS
-- "Pacientes pueden crear consultas" seguía con `m.es_cuenta_test = false`
-- hardcodeado → un paciente test NO podía crear una CI con un médico test (la base
-- rechazaba la INSERT → "No se pudo crear la consulta"). Detectado por Diego
-- testeando el par de prueba. La QA de #167 no lo cazó (revisó guards de app, no RLS).
--
-- Fix: espejar el guard de la app — el médico debe estar en el MISMO universo que el
-- paciente. Real↔real y test↔test permitidos; los cruces siguen bloqueados (aislamiento
-- intacto, no se abre nada).

ALTER POLICY "Pacientes pueden crear consultas" ON consultas
WITH CHECK (
  (auth.uid() = paciente_id) AND EXISTS (
    SELECT 1 FROM medicos m
    WHERE m.id = consultas.medico_id
      AND m.disponible = true
      AND m.verificado = true
      AND m.estado_registro = 'aprobado'
      AND m.es_cuenta_test = COALESCE(
        (SELECT p.es_cuenta_test FROM pacientes p WHERE p.user_id = auth.uid()),
        false
      )
  )
);
