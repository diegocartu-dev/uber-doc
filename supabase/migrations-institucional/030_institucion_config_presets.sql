-- 030_institucion_config_presets.sql — guardar una identidad de marca para
-- poder volver a ponerla después.
-- Migración SOLO de la instancia institucional. NUNCA corre en el B2C.
-- Requiere: 001_institucion_config.sql (de ahí salen los campos de marca).
--
-- ── PARA QUÉ ─────────────────────────────────────────────────────────────────
-- La instancia es MARCA BLANCA: la identidad del cliente vive entera en la fila
-- de `institucion_config` (nombre, subnombre, logo, paleta, teléfono de ayuda),
-- no en el código. Eso está bien, pero tiene una consecuencia práctica: mostrar
-- la instancia a un cliente exige escribir su identidad ahí, y volver a dejarla
-- neutra después exige borrarla — y ese borrado se lleva puesta la
-- configuración que alguien se tomó el trabajo de armar.
--
-- Esta tabla es el "antes" de ese borrado. Se guarda el bloque de marca tal
-- como está, se blanquea tranquilo, y restaurar es volver a escribir los mismos
-- campos. Un preset por nombre; el mismo nombre se pisa.
--
-- Los ARCHIVOS no se tocan: `quitarAssetInstitucion()` sólo pone la columna en
-- NULL y el logo sigue en el bucket `institucion-assets`. Por eso el preset
-- guarda el `logo_path` (el nombre del archivo) y no la imagen: restaurar es
-- volver a apuntar, nunca volver a subir.
--
-- ── QUÉ NO GUARDA, A PROPÓSITO ───────────────────────────────────────────────
-- Sólo marca: identidad, documentos y comunicaciones. NO guarda lo comercial
-- (`precio_consulta_centavos`, `acuerdo_horas_semana_default`) ni la operación
-- (ventana de CI, duración del slot, especialidades). Dos razones: el blanqueo
-- de marca no las toca, así que no hay nada que restaurar; y un jsonb con el
-- precio adentro sería una copia de un término del contrato en una tabla nueva,
-- con sus propios grants que mantener. Lo comercial se queda en un solo lugar.
--
-- ── SÓLO SERVICE ROLE ────────────────────────────────────────────────────────
-- RLS activo y sin policies: nadie que entre con anon o authenticated lee esto.
-- Es config de provisión —la maneja el /admin interno de Docto, no la
-- institución— y no tiene por qué viajar al browser de un paciente.
CREATE TABLE IF NOT EXISTS institucion_config_presets (
  nombre_preset text PRIMARY KEY,
  marca         jsonb NOT NULL,   -- bloque de marca de institucion_config
  nota          text,             -- para qué era este preset, en castellano
  guardado_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE institucion_config_presets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON institucion_config_presets FROM anon, authenticated;

-- ── CÓMO SE USA ──────────────────────────────────────────────────────────────
-- Guardar la marca actual antes de blanquear:
--
--   INSERT INTO institucion_config_presets (nombre_preset, marca, nota)
--   SELECT 'demo-AAAA-MM-DD',
--          jsonb_build_object(
--            'nombre', nombre, 'subnombre', subnombre, 'logo_path', logo_path,
--            'color_primary', color_primary, 'color_primary_dark', color_primary_dark,
--            'color_primary_soft', color_primary_soft, 'dominio', dominio,
--            'pdf_accent', pdf_accent, 'pdf_isologo_path', pdf_isologo_path,
--            'pdf_efector_texto', pdf_efector_texto,
--            'wa_remitente_nombre', wa_remitente_nombre,
--            'mail_from', mail_from, 'telefono_ayuda', telefono_ayuda),
--          'para qué era'
--   FROM institucion_config WHERE id = 1
--   ON CONFLICT (nombre_preset) DO UPDATE
--     SET marca = EXCLUDED.marca, guardado_at = now();
--
-- Restaurarla:
--
--   UPDATE institucion_config c SET
--     nombre = p.marca->>'nombre',
--     subnombre = p.marca->>'subnombre',
--     logo_path = p.marca->>'logo_path',
--     color_primary = p.marca->>'color_primary',
--     color_primary_dark = p.marca->>'color_primary_dark',
--     color_primary_soft = p.marca->>'color_primary_soft',
--     pdf_accent = p.marca->>'pdf_accent',
--     pdf_isologo_path = p.marca->>'pdf_isologo_path',
--     wa_remitente_nombre = p.marca->>'wa_remitente_nombre',
--     mail_from = p.marca->>'mail_from',
--     telefono_ayuda = p.marca->>'telefono_ayuda',
--     updated_at = now()
--   FROM institucion_config_presets p
--   WHERE c.id = 1 AND p.nombre_preset = 'demo-AAAA-MM-DD';
--
-- ⚠ DESPUÉS DE CUALQUIERA DE LAS DOS: HACE FALTA UN DEPLOY FRESCO.
-- El cache de `getConfigInstitucion()` (60 s) se vence solo, pero las pantallas
-- que Next prerenderiza en build se llevan la marca HORNEADA en el HTML: el
-- login y el chrome del panel siguieron mostrando el logo y la paleta viejas
-- después de blanquear la base (x-vercel-cache: HIT, doce horas de age). Las
-- pantallas del paciente, que se arman por request, cambiaron al instante.
-- Cambiar la marca en la base y no redeployar deja media instancia con la
-- identidad anterior — que es justo lo que uno quería sacar.
