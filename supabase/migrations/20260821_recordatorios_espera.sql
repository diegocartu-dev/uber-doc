-- Tope de avisos al profesional por paciente en espera (decisión Diego, 21/08/2026).
--
-- Hasta hoy nada llevaba la cuenta de cuántas veces se le avisó a un profesional
-- por un mismo paciente: el cron de recordatorios reenviaba mientras la fila de
-- la sala siguiera abierta. El 18/08 eso significó 17 mensajes encadenados a una
-- misma profesional entre las 22:09 y las 8:30 del día siguiente, uno cada ~40
-- minutos, madrugada incluida — por un pedido que ya no tenía sentido atender.
--
-- El contador vive en la fila de la sala de espera porque es la que representa
-- "este paciente está esperando a este profesional": se crea con la espera y
-- muere con ella, así que no hay que limpiarlo aparte.
--
-- Aditiva y con DEFAULT: las filas existentes arrancan en 0, que es el valor
-- correcto (todavía no se les descontó ningún aviso bajo la regla nueva).

ALTER TABLE public.sala_espera_entradas
  ADD COLUMN IF NOT EXISTS recordatorios_enviados INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.sala_espera_entradas.recordatorios_enviados IS
  'Veces que se le recordó al profesional que este paciente lo espera. El aviso del momento de entrar no se cuenta acá. Tope: 1 para la CI sin aceptar (liberar-ci-sin-aceptar), 2 para el resto (repush-esperando).';
