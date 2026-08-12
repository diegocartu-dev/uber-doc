-- 004_accesos_link.sql — Identidad del paciente por link (spec §5).
-- Migración SOLO de la instancia institucional. NUNCA corre en el B2C.
-- Requiere: 002_operadores.sql (FK creado_por).
--
-- El link que viaja por WhatsApp/mail es NUESTRO token (sha256 en DB); la
-- sesión Supabase se mintea JIT server-side al tocar "Entrar" (patrón
-- impersonate del admin). El token pelado NUNCA se guarda ni se loguea.

CREATE TABLE accesos_link (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id   uuid NOT NULL REFERENCES pacientes(id),
  turno_id      uuid REFERENCES turnos(id),        -- uno de los dos
  consulta_id   uuid REFERENCES consultas(id),
  token_hash    text NOT NULL UNIQUE,              -- sha256; el token pelado NUNCA se guarda
  destino       text NOT NULL,                     -- path de aterrizaje
  expira_at     timestamptz NOT NULL,
  revocado_at   timestamptz,
  creado_por    uuid NOT NULL REFERENCES operadores(id),
  canal         text CHECK (canal IN ('whatsapp','mail')),
  enviado_a     text NOT NULL,                     -- celular/mail al momento del envío
  envios_count  int NOT NULL DEFAULT 1,
  ultimo_envio_at timestamptz NOT NULL DEFAULT now(),
  usos_count    int NOT NULL DEFAULT 0,
  ultimo_uso_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Exactamente un recurso: o turno o consulta, nunca ambos ni ninguno.
ALTER TABLE accesos_link ADD CONSTRAINT accesos_link_un_recurso
  CHECK ((turno_id IS NULL) <> (consulta_id IS NULL));

-- Revocación por cambio de celular / listado de tokens vivos por paciente.
CREATE INDEX idx_accesos_link_paciente ON accesos_link (paciente_id);

-- RLS activo SIN policies + sin GRANT a los roles de PostgREST: solo service
-- role (misma disciplina de grants del B2C). Acá viven tokens de acceso:
-- doble cinturón a propósito.
ALTER TABLE accesos_link ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON accesos_link FROM anon, authenticated;
