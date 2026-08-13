-- 013_cerrar_sesiones.sql — Revocar un enlace también cierra la sesión que ese
-- enlace ya había abierto.
-- Migración SOLO de la instancia institucional. NUNCA corre en el B2C.
-- Requiere: 004_accesos_link.sql.
--
-- ── EL PROBLEMA QUE RESUELVE ─────────────────────────────────────────────────
-- `revocarAccesosDe()` escribía `revocado_at` y nada más. Los dos casos que ese
-- código dice cubrir son teléfono robado y error de padrón: en los dos, el que
-- tiene el enlace muy probablemente YA tocó "Entrar", así que apagarle el token
-- le cierra una puerta por la que no piensa volver a pasar. La sesión que ese
-- link minteó es una sesión real del paciente y seguía viva.
--
-- ── POR QUÉ HACE FALTA SQL ───────────────────────────────────────────────────
-- `auth.admin.signOut()` del SDK de Supabase pide el JWT del usuario — justo lo
-- que no tenemos: vive en el teléfono del otro. No hay en el SDK ninguna forma
-- de revocar por user_id, así que la revocación baja a las tablas de GoTrue,
-- que PostgREST no expone. De ahí esta función.
--
-- ⚠ VENTANA CONOCIDA: el access token que ese navegador ya tiene sigue siendo
-- válido hasta que expira (una hora, el default de Supabase); después no puede
-- renovarlo y queda afuera. Para ese intervalo está la otra mitad de la
-- defensa, que es de aplicación y actúa en el acto: la cookie con el id del
-- acceso, que las pantallas del paciente comprueban en cada request contra
-- `revocado_at` / `expira_at`.

CREATE OR REPLACE FUNCTION cerrar_sesiones_de_usuario(p_user_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public, pg_temp
AS $$
DECLARE
  borradas int;
BEGIN
  DELETE FROM auth.sessions WHERE user_id = p_user_id;
  GET DIAGNOSTICS borradas = ROW_COUNT;
  -- GoTrue guarda el user_id de los refresh tokens como texto, no como uuid.
  DELETE FROM auth.refresh_tokens WHERE user_id = p_user_id::text;
  RETURN borradas;
END;
$$;

-- Solo service role. Una función SECURITY DEFINER que borra sesiones ajenas no
-- puede quedar ejecutable por anon ni por authenticated: sería un botón para
-- desloguear a cualquiera conociendo su user_id (misma lección que el REVOKE de
-- expirar_turno / marcar_ausente_paciente, 08/07/2026).
REVOKE ALL ON FUNCTION cerrar_sesiones_de_usuario(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION cerrar_sesiones_de_usuario(uuid) FROM anon, authenticated;
