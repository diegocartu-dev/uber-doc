-- 011_acceso_ciclo_vida.sql — Ciclo de vida del link de acceso (spec §5.4, R19)
-- + freno de fuerza bruta sobre la landing.
-- Migración SOLO de la instancia institucional. NUNCA corre en el B2C.
-- Requiere: 001_institucion_config.sql, 004_accesos_link.sql.
--
-- ── POR QUÉ LOS NÚMEROS VAN AL CONFIG Y NO AL CÓDIGO ─────────────────────────
-- El ciclo de vida del link (cuánto vive, cuántas veces se puede pedir de
-- nuevo) es POLÍTICA de la institución, no una constante técnica. La spec §5.4
-- lo deja como PROPUESTA pendiente de cierre ("vive mientras viva el turno +
-- 30 días; reenvío self-service máx. 1 cada 10 min"). Los defaults de abajo
-- SON esa propuesta: si Diego —o el próximo cliente de marca blanca— la
-- cambia, se edita la fila desde /admin/institucion y listo. Nadie vuelve a
-- discutir código por un número.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE institucion_config
  -- R19: días que el link sigue vivo DESPUÉS del encuentro, para que el
  -- paciente pueda volver a bajar sus documentos desde el mismo enlace.
  ADD COLUMN IF NOT EXISTS vigencia_documentos_dias int NOT NULL DEFAULT 30
    CHECK (vigencia_documentos_dias BETWEEN 0 AND 3650),
  -- R19: reenvío self-service — "máximo 1 cada 10 minutos".
  ADD COLUMN IF NOT EXISTS reenvio_cooldown_minutos int NOT NULL DEFAULT 10
    CHECK (reenvio_cooldown_minutos BETWEEN 0 AND 1440),
  -- Techo diario del mismo reenvío (el mock solo fija el cooldown; sin techo,
  -- 144 mensajes por día al mismo celular siguen entrando en la regla).
  ADD COLUMN IF NOT EXISTS reenvio_max_por_dia int NOT NULL DEFAULT 5
    CHECK (reenvio_max_por_dia BETWEEN 1 AND 100),
  -- 03-spec §2.3 estado B: la puerta abre 10 min antes del turno. NO cierra al
  -- final: llegar tarde —o que el profesional se demore— no puede dejar al
  -- paciente afuera. El que resuelve el turno abandonado es el cron de
  -- vencidos, a los ~20 min de gracia, no esta pantalla.
  ADD COLUMN IF NOT EXISTS ventana_entrada_min int NOT NULL DEFAULT 10
    CHECK (ventana_entrada_min BETWEEN 0 AND 240);

-- Los cuatro son OPERACIÓN (no términos comerciales): se suman al grant
-- columna por columna de la migración 001. Ver ahí por qué el grant es
-- columna por columna y no de tabla.
GRANT SELECT (
  vigencia_documentos_dias,
  reenvio_cooldown_minutos,
  reenvio_max_por_dia,
  ventana_entrada_min
) ON institucion_config TO authenticated;

-- ── Freno de fuerza bruta de la landing /acceso/t/<token> ────────────────────
--
-- El token es de 32 bytes al azar: adivinarlo es imposible en la práctica. El
-- freno NO existe por eso, sino porque el POST de la landing hace trabajo caro
-- (generateLink + verifyOtp contra Supabase Auth) y un link que circula por
-- WhatsApp es público de hecho: cualquiera que lo tenga puede martillarlo.
--
-- Un bucket por CLAVE, no una fila por intento: se pisa en el lugar y no crece
-- sin control. Las claves son sha256 — ni la IP ni el token quedan en claro en
-- la base (el token pelado no se guarda NUNCA, ni acá). Hay DOS familias, con
-- trabajos distintos (ver accesos.ts):
--   · sha256("enlace|" + ip + "|" + token_hash) — techo al martilleo de UN
--     enlace. Se escribe SOLO después de validar el token: si se escribiera
--     antes, cada request con basura estrenaría fila y la tabla crecería con
--     un INSERT por request, que es exactamente lo contrario de lo que dice el
--     párrafo de arriba.
--   · sha256("ip|" + ip) — techo al que BARRE tokens, contando FALLOS. Un
--     paciente de verdad nunca falla, así que ni con media provincia detrás de
--     la misma IP de la operadora se deja a nadie afuera.
CREATE TABLE IF NOT EXISTS accesos_intentos (
  clave          text PRIMARY KEY,
  ventana_inicio timestamptz NOT NULL DEFAULT now(),
  intentos       int NOT NULL DEFAULT 0,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- Barrido de buckets viejos: lo hace `tocarBucket` en accesos.ts, en una de
-- cada cincuenta llamadas, borrando todo lo que no se toca hace un día. Este
-- índice es el que hace barato ese DELETE.
CREATE INDEX IF NOT EXISTS idx_accesos_intentos_updated ON accesos_intentos (updated_at);

-- RLS activo SIN policies + sin GRANT a los roles de PostgREST: solo service
-- role (misma disciplina que accesos_link — acá vive el rastro del freno).
ALTER TABLE accesos_intentos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON accesos_intentos FROM anon, authenticated;
