-- 031 — `recordatorios_enviados` en la instancia institucional.
--
-- QUÉ ARREGLA: `repush-esperando` devolvía **HTTP 500 en la instancia** desde el
-- 22/08/2026 10:00 ART. El watchdog lo detectó y alertó ("Aviso al médico de
-- pacientes esperando").
--
-- POR QUÉ PASÓ, y es el punto que importa: el tope de 2 recordatorios (#435,
-- 22/08) agregó esta columna a `sala_espera_entradas` y la migración se aplicó
-- **SOLO en la base B2C**. Pero `vercel.json` es UNO SOLO: el mismo cron corre
-- en los dos deploys, y el de la instancia quedó consultando una columna que en
-- su base no existía. PostgREST falla la query entera y la ruta tira 500.
--
-- LA REGLA QUE SALE DE ACÁ: **toda migración de `supabase/migrations/` que toque
-- una tabla COMPARTIDA tiene que aplicarse también en la base institucional**, y
-- queda anotada acá con su número. El baseline de la instancia se congeló el día
-- que se creó (12/08/2026): nada posterior le llega solo. Antes de dar por
-- cerrada una migración, la pregunta es "¿esta tabla la toca código que corre en
-- los dos deploys?" — si la respuesta es sí, son DOS aplicaciones, no una.
--
-- Aditiva y con DEFAULT, igual que en B2C: las filas existentes arrancan en 0.
-- Idempotente: se puede correr de nuevo sin efecto.

ALTER TABLE public.sala_espera_entradas
  ADD COLUMN IF NOT EXISTS recordatorios_enviados INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.sala_espera_entradas.recordatorios_enviados IS
  'Veces que se le recordó al profesional que este paciente lo espera. El aviso del momento de entrar no se cuenta acá. Tope: 2 (repush-esperando). Espejo de la migración 20260821 del B2C.';
