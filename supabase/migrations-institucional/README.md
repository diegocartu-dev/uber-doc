# Migraciones institucionales

Estos `.sql` se aplican **SOLO en la base de una instancia institucional** (proyecto Supabase dedicado, deploy con `INSTITUCIONAL=true`), **encima** del schema B2C ya provisionado (las migraciones de `supabase/migrations/` + la migración de baseline — ver `scripts/institucional/README.md`). **Nunca corren en el B2C.**

## Env vars de la instancia (provisión)

- **`INSTITUCIONAL=true`** — la fuente de verdad del modo (server, runtime). Todo gate de código sale de acá vía `src/lib/instancia.ts`: páginas, server actions, crons, capas A/B/C, y también el sidebar de `/admin` (que recibe el flag por **prop** desde el layout server — no lee ninguna env client).
- **`NEXT_PUBLIC_INSTITUCIONAL=true`** — variante client-side. Se **inlinea en build**: cambiarla exige **deploy fresco**, nunca `vercel redeploy` (mismo pitfall que `BETA_PASSWORD`). Hoy ningún componente la consume, pero si un gate client la llegara a usar, **setear las dos juntas en el mismo deploy**: si divergen, la UI muestra links a 404 (solo client seteada) o esconde pantallas vivas (solo server seteada). Preferir siempre pasar el flag por prop desde un server component antes que sumar un consumer de la env client.

## Checklist post-aplicación: verificar los REVOKE de verdad

Dos migraciones crean funciones `SECURITY DEFINER`, que corren con los permisos de su dueño y **no** con los de quien las llama. Las dos revocan el `EXECUTE` a `anon` y `authenticated`… y ese `REVOKE` es exactamente la clase de línea que se da por buena porque está escrita.

No lo está hasta que se prueba. Precedente propio: el 08/07/2026 se descubrió que dos RPC del B2C (`expirar_turno`, `marcar_ausente_paciente`) eran **ejecutables por `anon`** — el `REVOKE` nunca se había verificado contra la base real. El método que lo cerró es el mismo de acá abajo.

**Qué se verifica, y por qué importa:**

| RPC | Migración | Si el REVOKE falla |
|---|---|---|
| `buscar_user_id_por_email(text)` | 007 | Un paciente logueado por link puede **enumerar los emails del padrón** de la provincia, uno por uno, preguntando si existen. |
| `cerrar_sesiones_de_usuario(uuid)` | 013 | Cualquiera con sesión puede **desloguear a cualquier otro** (incluidos operadores y profesionales) pasando su `user_id`. |

**Cómo (en la base de la instancia, con la anon key pública del proyecto — no la service role):**

```bash
# Reemplazar por los datos de la INSTANCIA (nunca los del B2C).
INSTANCIA_URL="https://<ref>.supabase.co"
ANON_KEY="<anon key pública de la instancia>"

# 1) anon NO puede buscar usuarios por email
curl -s -X POST "$INSTANCIA_URL/rest/v1/rpc/buscar_user_id_por_email" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"p_email":"cualquiera@ejemplo.com"}'

# 2) anon NO puede cerrar sesiones ajenas
curl -s -X POST "$INSTANCIA_URL/rest/v1/rpc/cerrar_sesiones_de_usuario" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"p_user_id":"00000000-0000-0000-0000-000000000000"}'
```

**Resultado esperado en los dos casos:** un error `42501` / `permission denied for function …`.

**Cualquier otra cosa es un hallazgo**, incluido un `200` con `null`: eso significa que la función **se ejecutó** y solo no encontró nada — el `REVOKE` no está.

**Repetir con un JWT de `authenticated`** (el token de un paciente de prueba entrando por su link): es el rol que realmente tiene un visitante en la instancia, y el que más importa de los dos.

Verificable también en SQL, útil para dejar constancia en el registro de provisión:

```sql
SELECT p.proname,
       has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated,
       has_function_privilege('service_role',  p.oid, 'EXECUTE') AS service_role
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('buscar_user_id_por_email', 'cerrar_sesiones_de_usuario');
-- Esperado: anon=false, authenticated=false, service_role=true.
```

Si alguna da `true` en `anon` o `authenticated`, volver a correr el `REVOKE` de la migración correspondiente y **verificar de nuevo** — no alcanza con re-ejecutarlo.
