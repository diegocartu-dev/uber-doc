-- 046 — espejo de `supabase/migrations/20261013_medicos_identidad.sql`.
-- Fecha de nacimiento y sexo del profesional (13/10/2026). Farmalink los exige
-- para registrar cada receta y Docto no los guardaba: los trae la verificación
-- de identidad (Didit, del DNI) y se descartaban.
--
-- Tabla aparte a propósito: no toca `medicos` (ni sus SELECT, ni sus grants, ni
-- el trigger de verificación). Solo el servidor la lee y la escribe.

CREATE TABLE IF NOT EXISTS public.medicos_identidad (
  medico_id        uuid PRIMARY KEY REFERENCES public.medicos(id) ON DELETE CASCADE,
  fecha_nacimiento date,
  sexo             text CHECK (sexo IN ('M', 'F', 'X')),
  nombre           text,
  apellido         text,
  fuente           text NOT NULL DEFAULT 'didit',
  didit_session_id text,
  actualizado_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.medicos_identidad ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.medicos_identidad FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.medicos_identidad IS
  'Datos de identidad del profesional que exige el registro de recetas (fecha de nacimiento, sexo, nombre y apellido del DNI). Fuente: verificación Didit. Solo service role.';
