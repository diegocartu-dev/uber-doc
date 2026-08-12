-- 001_institucion_config.sql — Config de la institución (marca blanca).
-- Migración SOLO de la instancia institucional. NUNCA corre en el B2C.
--
-- Tabla SINGLETON (una instancia = una institución; no hace falta
-- institucion_id). Editable desde el /admin interno de Docto sin redeploy.
-- Lectura desde código: getConfigInstitucion() con cache + createAdminClient
-- (patrón src/lib/feature-flags.ts — se construye en Etapa 1).
--
-- El nombre del cliente NO se escribe en el código jamás: vive acá.
-- La fila se crea al provisionar la instancia (desde el /admin interno);
-- no hay seed en el repo porque los valores son del cliente.

CREATE TABLE institucion_config (
  id            int PRIMARY KEY DEFAULT 1 CHECK (id = 1),   -- singleton
  -- IDENTIDAD
  nombre        text NOT NULL,            -- ej. "Ministerio de Salud"
  subnombre     text,                     -- ej. "Provincia de ___"
  logo_path     text,                     -- Storage bucket 'institucion-assets' (SVG/PNG)
  color_primary text NOT NULL DEFAULT '#4A3F8C',       -- --inst-primary (placeholder violeta)
  color_primary_dark text NOT NULL DEFAULT '#37306B',
  color_primary_soft text NOT NULL DEFAULT '#EEECF7',
  dominio       text NOT NULL,            -- alimenta links, QR, remitentes
  -- DOCUMENTOS
  pdf_accent    text,                     -- default efectivo: color_primary
  pdf_isologo_path text,                  -- isologo para el header del PDF (120×40)
  pdf_efector_texto text NOT NULL DEFAULT
    'Emitido a través de Docto (docto.com.ar) — plataforma de telemedicina. Matrícula del profesional verificada en REFEPS — Red Federal de Registros de Profesionales de la Salud.',
    -- ⚠ PLACEHOLDER LEGAL: la redacción final la definen el CEO y el abogado,
    -- junto al DPA. El placeholder permite avanzar el render.
  -- COMUNICACIONES
  wa_remitente_nombre text,               -- marca en el cuerpo del WhatsApp
  mail_from     text NOT NULL,            -- remitente (dominio verificado en Resend)
  telefono_ayuda text,                    -- "0800-..." — WhatsApp, estados del link y mails
  -- OPERACIÓN
  ci_ventana_inicio time NOT NULL DEFAULT '08:00',      -- ventana de CI permitida
  ci_ventana_fin    time NOT NULL DEFAULT '20:00',
  slot_duracion_min int NOT NULL DEFAULT 15,            -- la define la INSTITUCIÓN, no el médico
  especialidades    text[] NOT NULL DEFAULT '{}',       -- chips del otorgador
  acuerdo_horas_semana_default numeric NOT NULL DEFAULT 1,  -- default de acuerdos_servicio
  -- COMERCIAL
  precio_consulta_centavos bigint NOT NULL,             -- metering → factura mensual
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- RLS + GRANTS DE COLUMNA: la tabla mezcla branding (mostrable en la UI) con
-- términos COMERCIALES del contrato (precio_consulta_centavos = lo que Docto
-- factura por consulta, acuerdo_horas_semana_default) que NO puede leer un
-- paciente (sesión por link = authenticated) ni un profesional. La policy de
-- fila sola no alcanza (pasaría la fila entera): mismo patrón de grants de
-- columna que `medicos` en el B2C — se revoca el grant de tabla y se grantea
-- columna por columna, EXCLUYENDO las comerciales.
--
-- ⚠ Consecuencia (lección outage 19-24/06): un SELECT con el cliente RLS que
-- incluya una columna sin grant falla ENTERO (permission denied) y PostgREST
-- devuelve null silencioso. Las lecturas de columnas comerciales (metering,
-- /admin interno) van SIEMPRE por service role — que además es el patrón ya
-- previsto (getConfigInstitucion con createAdminClient).
ALTER TABLE institucion_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Config legible por usuarios autenticados"
  ON institucion_config FOR SELECT
  TO authenticated
  USING (true);

REVOKE ALL ON institucion_config FROM anon, authenticated;
GRANT SELECT (
  id, nombre, subnombre, logo_path,
  color_primary, color_primary_dark, color_primary_soft,
  dominio,
  pdf_accent, pdf_isologo_path, pdf_efector_texto,
  wa_remitente_nombre, mail_from, telefono_ayuda,
  ci_ventana_inicio, ci_ventana_fin, slot_duracion_min, especialidades,
  updated_at
) ON institucion_config TO authenticated;
-- Sin grant (solo service role): precio_consulta_centavos,
-- acuerdo_horas_semana_default.
