-- ============================================================================
-- Migración: bucket privado para los videos de capacitación de profesionales
-- Fecha: 2026-09-15 — decisión Diego
-- ============================================================================
-- Dos videos instructivos (cómo empezar a atender, cómo cursar una consulta)
-- que se ven solo dentro de "Configurá cómo atendés" y solo con cuenta aprobada.
-- Pedido explícito: que no se puedan compartir.
--
-- PRIVADO, y SIN POLICIES A PROPÓSITO. Ningún usuario lee este bucket con su
-- propio token: el único que lo toca es el servidor con service role, que no
-- pasa por RLS. Sin policies, `anon` y `authenticated` no pueden listar, leer,
-- subir ni borrar nada. El acceso de un profesional es SIEMPRE a través de
-- /api/medico/capacitacion/[video], que comprueba sesión y aprobación y recién
-- ahí firma un link que caduca.
--
-- Si mañana alguien agrega una policy de SELECT para `authenticated`, cualquier
-- paciente logueado podría pedir estos objetos directo. No hace falta ninguna.
--
-- Tope y tipo: los archivos reales pesan 16 y 20 MB. 50 MB deja margen para
-- una versión nueva sin permitir que entre cualquier cosa, y solo acepta mp4.
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'capacitacion-profesionales',
  'capacitacion-profesionales',
  false,
  52428800, -- 50 MB
  ARRAY['video/mp4']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
