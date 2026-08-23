-- 23/08/2026 — dos cosas que nacen del mismo caso:
--   (1) Camino 5 de firma: RECTIFICACIÓN de la identidad del paciente en un
--       documento ya sellado.
--   (2) `pacientes.nombre` y `pacientes.apellido` como campos propios.
--
-- EL CASO (21/08/2026): una paciente se registró con su nombre de pila solamente
-- —el formulario pedía UN campo "Nombre completo" y validaba solo que no
-- estuviera vacío—. Sus tres documentos (receta, indicaciones, certificado) se
-- sellaron con `identidad.paciente_nombre = "<nombre de pila>"`: la identidad
-- impresa se congela dentro del hash al firmar (src/lib/firma/identidad.ts).
-- Esa misma noche ella corrigió su ficha desde "Mis datos". Los documentos, por
-- diseño, no cambiaron: el PDF se dibuja desde el snapshot firmado, no desde la
-- ficha viva. Escribió tres veces a soporte pidiendo su apellido.
--
-- ─── 1. Rectificación de identidad ───────────────────────────────────────────
--
-- DECISIÓN DIEGO (22/08/2026), textual: "No es ninguna alteración. Es completar
-- algo que debimos hacer nosotros si el proceso hubiera estado correcto. Ni
-- siquiera el médico sabe qué apellido tiene [el paciente] porque esos datos se
-- le completan solos. No cambiamos nada de lo que escribió el médico. Solo
-- corregimos un error de proceso. Es transparente para todos."
--
-- QUÉ HACE EL CAMINO 5 (src/lib/firma/documento.ts): re-sella el MISMO
-- documento —mismo id, mismo contenido clínico, misma fecha de emisión, mismo
-- bloque del profesional— con el bloque del paciente tomado de la ficha de hoy.
-- Nuevo hash, nueva firma con la clave activa del profesional, `firmado_at` =
-- instante real. En `firma_digital.rectificacion` quedan el hash, la identidad
-- y la fecha de firma anteriores, el motivo y quién lo autorizó. En `firma_logs`
-- se encadena una fila con método propio cuyo contexto lleva lo mismo. La
-- página pública de verificación lo muestra.
--
-- El CHECK de metodo_atribucion se ensancha en cada camino nuevo (20260807 →
-- 20260808 → acá). Si el código sale antes que esta migración, el insert en
-- firma_logs falla con 23514 y la rectificación se REVIERTE sola a la firma
-- anterior (no queda un documento rectificado sin log): ver pistaMigracion()
-- en documento.ts.

ALTER TABLE public.firma_logs
  DROP CONSTRAINT IF EXISTS firma_logs_metodo_atribucion_check;
ALTER TABLE public.firma_logs
  ADD CONSTRAINT firma_logs_metodo_atribucion_check
  CHECK (metodo_atribucion IN (
    'otp',
    'sesion_medico',
    'sellado_diferido_plataforma',
    'rescate_borrador',
    'rectificacion_identidad_plataforma'
  )) NOT VALID;

-- Coherencia: una rectificación SIEMPRE dice sobre qué hash actúa, por qué, y
-- qué identidad reemplaza. Un log de rectificación sin eso no permite reconstruir
-- qué decía el documento antes — que es justo lo que la hace transparente.
ALTER TABLE public.firma_logs
  DROP CONSTRAINT IF EXISTS firma_logs_rectificacion_identidad_check;
ALTER TABLE public.firma_logs
  ADD CONSTRAINT firma_logs_rectificacion_identidad_check
  CHECK (
    metodo_atribucion <> 'rectificacion_identidad_plataforma' OR (
      otp_id IS NULL
      AND contexto ? 'hash_anterior'
      AND contexto ? 'motivo'
      AND contexto ? 'identidad_anterior'
    )
  ) NOT VALID;

COMMENT ON COLUMN public.firma_logs.metodo_atribucion IS
  '"otp" = segundo factor por mail; "sesion_medico" = sesión autenticada del médico al finalizar la consulta (art. 5 Ley 25.506); "sellado_diferido_plataforma" = sello posterior sobre documentos históricos; "rescate_borrador" = la plataforma emitió y selló lo que el médico había dejado escrito, en un cierre automático que él no disparó; "rectificacion_identidad_plataforma" = la plataforma re-selló un documento ya firmado reemplazando SOLO el bloque de identidad del paciente por el de su ficha corregida — contenido clínico e identidad del profesional intactos; hash e identidad anteriores en contexto y en firma_digital.rectificacion.';

-- ─── 2. nombre / apellido ─────────────────────────────────────────────────────
--
-- `nombre_completo` SIGUE siendo la columna que leen los documentos, los
-- listados y los mails. Lo que cambia es quién la escribe: desde ahora los tres
-- formularios del paciente (registro, onboarding, Mis datos) piden nombre y
-- apellido por separado, los exigen, y guardan los tres — nombre, apellido y el
-- compuesto "Nombre Apellido". Así TODOS los lectores existentes toman ambos sin
-- tocar un solo SELECT en producción (regla CLAUDE.md sobre columnas nuevas).
--
-- Las filas existentes quedan con nombre/apellido en NULL: no se adivina cómo
-- partir "María Belén Pérez" ni "Lisandro Torres Arata". El gate previo a la
-- consulta ("Tu información médica") acepta apellido cargado O un
-- nombre_completo de al menos dos palabras; una sola palabra manda al
-- onboarding, que ahora lo pide bien.
--
-- `pacientes` tiene grants a nivel TABLA para authenticated (verificado el
-- 23/08: role_table_grants, no column_privileges parciales), así que las
-- columnas nuevas quedan cubiertas sin GRANT adicional. No es el caso de
-- `medicos` (ver CLAUDE.md); acá no aplica.

ALTER TABLE public.pacientes
  ADD COLUMN IF NOT EXISTS nombre text,
  ADD COLUMN IF NOT EXISTS apellido text;

COMMENT ON COLUMN public.pacientes.nombre IS
  'Nombre/s de pila. Obligatorio en registro, onboarding y Mis datos desde el 23/08/2026. nombre_completo = nombre || '' '' || apellido.';
COMMENT ON COLUMN public.pacientes.apellido IS
  'Apellido/s. Obligatorio desde el 23/08/2026. NULL en filas anteriores: nombre_completo no se parte automáticamente.';
