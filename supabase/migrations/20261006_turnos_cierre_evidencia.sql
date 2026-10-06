-- APLICADA en producción el 06/10/2026 (OK de Diego), verificada en
-- information_schema. NO aplicada en la base de la instancia institucional
-- (no aprobado): ningún SELECT compartido debe leer esta columna.
--
-- La caja negra del cierre de un turno, igual que consultas.cierre_evidencia:
-- lo que se sabe de por qué un turno pago no se atendió (aviso al profesional,
-- presencia en la sala y en el video) y la marca del revisor de caídas
-- (revisada_at) para que suene una sola vez.
ALTER TABLE turnos ADD COLUMN IF NOT EXISTS cierre_evidencia jsonb;
