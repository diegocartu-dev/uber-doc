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

## Checklist post-aplicación: atacar los triggers de inmutabilidad

Mismo principio que los REVOKE de arriba, aplicado a la otra defensa del
contador: **un trigger escrito no es un trigger que frena**. Las migraciones
014, 015, 017 y 019 protegen lo que ya se facturó y lo que ya se selló, y esa
protección es lo único que sostiene la frase que se le dice al cliente — *"la
factura de octubre va a decir lo mismo en diciembre"*.

Se verifica **atacándola**, en la base de la instancia, con el SQL Editor
(service role / dueño). El resultado esperado de cada ataque es un **error**.

> Correr esto **antes** de que la instancia tenga tráfico real, o sobre filas
> sintéticas creadas para el ataque. Los pasos de preparación insertan una fila
> de prueba y la borran al final.

### Preparación

```sql
-- Fila sintética: ids que no existen en ninguna otra tabla del piloto.
INSERT INTO encuentros_metering (
  tipo, recurso_id, motor, medico_id, paciente_id, especialidad,
  semana_ar, fecha_ar, segundos_ambos_en_sala, documentos_emitidos,
  precio_centavos, clasificacion
)
SELECT 'turno', gen_random_uuid(), 'acordado', m.id, gen_random_uuid(), 'Prueba',
       DATE '2000-01-03', DATE '2000-01-03', 120, 1, 100000, 'facturable'
FROM medicos m LIMIT 1
RETURNING id;
-- Guardar el id devuelto: abajo va como :fila.
```

### Ataque 1 — editar una fila ya facturada (014)

```sql
UPDATE encuentros_metering SET facturado_periodo = '2000-01' WHERE id = :fila;  -- sella, OK
UPDATE encuentros_metering SET clasificacion = 'no_facturable_corta' WHERE id = :fila;
```

**Esperado:** `la fila … ya fue facturada en el período 2000-01 — está sellada`.
Un `UPDATE 1` acá significa que el trigger no está: la factura de un mes cerrado
se puede reescribir.

### Ataque 2 — corregir y re-sellar en el mismo UPDATE (014)

```sql
UPDATE encuentros_metering
   SET clasificacion = 'no_facturable_corta', facturado_periodo = '2000-02'
 WHERE id = :fila;
```

**Esperado:** el mismo error. Es la mitad que se agregó a propósito: sin ella,
"corregir y de paso re-sellar en otro período" pasaba derecho.

### Ataque 3 — borrar una fila facturada (014)

```sql
DELETE FROM encuentros_metering WHERE id = :fila;
```

**Esperado:** `está facturada (2000-01) y no se puede borrar`.

### Ataque 4 — el job pisando una clasificación humana (017 + 019)

```sql
UPDATE encuentros_metering SET facturado_periodo = NULL WHERE id = :fila;  -- levantar el sello
UPDATE encuentros_metering
   SET clasificacion = 'falla_tecnica', clasificacion_origen = 'manual_admin',
       clasificacion_motivo = 'prueba', precio_centavos = 100000
 WHERE id = :fila;

-- Ahora el job "reclasifica" y de paso trae el precio nuevo:
UPDATE encuentros_metering
   SET clasificacion = 'facturable', clasificacion_origen = 'job', precio_centavos = 999999
 WHERE id = :fila;

SELECT clasificacion, clasificacion_origen, precio_centavos
  FROM encuentros_metering WHERE id = :fila;
```

**Esperado:** `falla_tecnica` / `manual_admin` / `100000`. El UPDATE **pasa** (el
reloj y los documentos sí se pueden refrescar), pero los campos de la DECISIÓN y
el precio vuelven a los del humano. Si sale `facturable` / `job` / `999999`, la
017 o la 019 no están aplicadas.

### Ataque 5 — vaciar la tabla (019)

```sql
TRUNCATE encuentros_metering;
TRUNCATE acuerdo_semanas;
```

**Esperado en los dos:** `no se puede vaciar con TRUNCATE: sostiene facturación
ya emitida y cumplimiento sellado`.

Este es el ataque más importante de la lista, porque es el más creíble: nadie
escribe un UPDATE malicioso, pero `TRUNCATE` es literalmente lo que se tipea
para "limpiar y volver a correr el job" en un ambiente que uno cree que es de
prueba. `TRUNCATE` **no dispara los triggers de fila**: sin la 019, se lleva
puesta toda la inmutabilidad de las 014 y 015 sin que ni un trigger se entere.

Verificar además que el permiso está sacado:

```sql
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_name IN ('encuentros_metering','acuerdo_semanas')
  AND privilege_type = 'TRUNCATE';
-- Esperado: ninguna fila para anon / authenticated / service_role.
```

### Ataque 6 — editar una semana ya cerrada (015)

```sql
INSERT INTO acuerdo_semanas (medico_id, semana_ar, horas_comprometidas, minutos_cumplidos, estado, cerrada_at)
SELECT m.id, DATE '2000-01-03', 1, 60, 'cerrada', now() FROM medicos m LIMIT 1;

UPDATE acuerdo_semanas SET minutos_cumplidos = 999 WHERE semana_ar = DATE '2000-01-03';
DELETE FROM acuerdo_semanas WHERE semana_ar = DATE '2000-01-03';
```

**Esperado:** los dos rebotan (`la semana … está cerrada`). Para limpiar la fila
de prueba hay que reabrirla primero — que es exactamente el procedimiento de dos
pasos que el trigger obliga:

```sql
UPDATE acuerdo_semanas SET estado = 'abierta' WHERE semana_ar = DATE '2000-01-03';
DELETE FROM acuerdo_semanas WHERE semana_ar = DATE '2000-01-03';
```

### Limpieza

```sql
UPDATE encuentros_metering SET facturado_periodo = NULL WHERE id = :fila;
DELETE FROM encuentros_metering WHERE id = :fila;
```

**Cualquier ataque que NO devuelva error es un hallazgo**, y se anota en el
registro de provisión de la instancia junto con los REVOKE de arriba.
