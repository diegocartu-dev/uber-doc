# Migraciones institucionales

Estos `.sql` se aplican **SOLO en la base de una instancia institucional** (proyecto Supabase dedicado, deploy con `INSTITUCIONAL=true`), **encima** del schema B2C ya provisionado (las migraciones de `supabase/migrations/` + la migración de baseline — ver `scripts/institucional/README.md`). **Nunca corren en el B2C.**

## Env vars de la instancia (provisión)

- **`INSTITUCIONAL=true`** — la fuente de verdad del modo (server, runtime). Todo gate de código sale de acá vía `src/lib/instancia.ts`: páginas, server actions, crons, capas A/B/C, y también el sidebar de `/admin` (que recibe el flag por **prop** desde el layout server — no lee ninguna env client).
- **`NEXT_PUBLIC_INSTITUCIONAL=true`** — variante client-side. Se **inlinea en build**: cambiarla exige **deploy fresco**, nunca `vercel redeploy` (mismo pitfall que `BETA_PASSWORD`). Hoy ningún componente la consume, pero si un gate client la llegara a usar, **setear las dos juntas en el mismo deploy**: si divergen, la UI muestra links a 404 (solo client seteada) o esconde pantallas vivas (solo server seteada). Preferir siempre pasar el flag por prop desde un server component antes que sumar un consumer de la env client.

## Orden de despliegue: la migración ANTES que el código

Los `.sql` de esta carpeta se aplican **a mano** y el código se despliega solo
(push a main → Vercel). Cuando un deploy trae código que consulta algo que
todavía no existe en la base, la pantalla no se degrada: **tira 500**.

**Regla: primero el SQL, después el push.** Concretamente, para el paquete de la
Etapa 8:

| Migración | Qué se cae si el código llega antes |
|---|---|
| **021** | `/admin/periodos` entero: el combo de meses llama a la RPC `periodos_sellados()`, y el botón de corregir a `corregir_encuentro_sellado()`. Sin la migración, la primera es un 404 de PostgREST y la pantalla no abre. |
| **022** | Nada — el trigger solo agrega una prohibición. Se puede aplicar después sin romper, pero mientras no esté, la puerta del INSERT sigue abierta. |
| **023** | La **facturación** de cualquier mes: `periodoEstaSellado()` lee `metering_periodos_cerrados` y **tira** si no puede (a propósito: si esa lectura fallara en silencio, un mes cerrado se vería abierto y el barrido volvería a sellarlo). O sea que sin la 023 aplicada, la card de facturación del panel y el cierre mensual fallan. |

Las tres son **reentrantes**: si el SQL Editor corta a la mitad, se vuelve a
pegar el archivo entero sin miedo.

Y ninguna de las tres toca el B2C: son de la base de la instancia.

## Checklist post-aplicación: verificar los REVOKE de verdad

Tres migraciones crean funciones `SECURITY DEFINER`, que corren con los permisos de su dueño y **no** con los de quien las llama. Las tres revocan el `EXECUTE` a `anon` y `authenticated`… y ese `REVOKE` es exactamente la clase de línea que se da por buena porque está escrita.

No lo está hasta que se prueba. Precedente propio: el 08/07/2026 se descubrió que dos RPC del B2C (`expirar_turno`, `marcar_ausente_paciente`) eran **ejecutables por `anon`** — el `REVOKE` nunca se había verificado contra la base real. El método que lo cerró es el mismo de acá abajo.

**Qué se verifica, y por qué importa:**

| RPC | Migración | Si el REVOKE falla |
|---|---|---|
| `buscar_user_id_por_email(text)` | 007 | Un paciente logueado por link puede **enumerar los emails del padrón** de la provincia, uno por uno, preguntando si existen. |
| `cerrar_sesiones_de_usuario(uuid)` | 013 | Cualquiera con sesión puede **desloguear a cualquier otro** (incluidos operadores y profesionales) pasando su `user_id`. |
| `corregir_encuentro_sellado(...)` | 021 | Es la **única puerta** para tocar una fila ya facturada. Si `anon` o `authenticated` pueden ejecutarla, cualquiera con sesión reclasifica la factura de un mes cerrado. (La función igual verifica contra `admin_users` que quien firma sea superadmin activo: son dos cierres, no uno.) |

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
  AND p.proname IN ('buscar_user_id_por_email', 'cerrar_sesiones_de_usuario', 'corregir_encuentro_sellado');
-- Esperado: anon=false, authenticated=false, service_role=true.
```

Si alguna da `true` en `anon` o `authenticated`, volver a correr el `REVOKE` de la migración correspondiente y **verificar de nuevo** — no alcanza con re-ejecutarlo.

## Checklist post-aplicación: atacar los triggers de inmutabilidad

Mismo principio que los REVOKE de arriba, aplicado a la otra defensa del
contador: **un trigger escrito no es un trigger que frena**. Las migraciones
014, 015, 017, 019, 021, 022 y 023 protegen lo que ya se facturó y lo que ya se
selló, y esa protección es lo único que sostiene la frase que se le dice al
cliente — *"la factura de octubre va a decir lo mismo en diciembre"*.

Se verifica **atacándola**, en la base de la instancia, con el SQL Editor
(service role / dueño). El resultado esperado de cada ataque es un **error**.

> **El orden de esta lista es el orden de ejecución.** No es cosmético: desde la
> 021, sellar una fila es un viaje de ida —levantar el sello ya no es un camino,
> ni por SQL— así que todo lo que hay que probar sobre una fila SIN sellar va
> primero, y recién después se la sella. La versión anterior de este checklist
> arrancaba los ataques 4 y de limpieza con `SET facturado_periodo = NULL`, que
> hoy rebota: era imposible de correr hasta el final.

> Correr esto **antes** de que la instancia tenga tráfico real, o sobre filas
> sintéticas creadas para el ataque. La preparación inserta dos filas de prueba y
> la limpieza del final las borra.

### Preparación

```sql
-- Dos filas sintéticas: ids que no existen en ninguna otra tabla del piloto.
-- La primera es la víctima de casi todos los ataques (:fila); la segunda existe
-- solo para poder firmar una constancia "de otra fila" en el ataque 9b (:vecina).
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

-- Repetir el mismo INSERT para la segunda fila y guardar su id como :vecina.
```

Además hacen falta dos `user_id` reales de `admin_users`, que se reemplazan en
los ataques del bloque 9:

```sql
SELECT user_id, email, nivel, activo FROM admin_users WHERE activo ORDER BY nivel;
-- :user_id_del_superadmin      → uno con nivel = 'super_admin' y activo
-- :user_id_de_un_admin_comun   → uno con nivel <> 'super_admin'
```

### Ataque 1 — el job pisando una clasificación humana (017 + 019)

Va **primero** porque se hace sobre la fila **sin sellar**: un humano corrige, y
después el job pasa por encima.

```sql
UPDATE encuentros_metering
   SET clasificacion = 'no_facturable_corta', clasificacion_origen = 'manual_admin',
       clasificacion_motivo = 'prueba', precio_centavos = 100000
 WHERE id = :fila;

-- Ahora el job "reclasifica" y de paso trae el precio nuevo:
UPDATE encuentros_metering
   SET clasificacion = 'facturable', clasificacion_origen = 'job', precio_centavos = 999999
 WHERE id = :fila;

SELECT clasificacion, clasificacion_origen, precio_centavos
  FROM encuentros_metering WHERE id = :fila;
```

**Esperado:** `no_facturable_corta` / `manual_admin` / `100000`. El UPDATE
**pasa** (el reloj y los documentos sí se pueden refrescar), pero los campos de
la DECISIÓN y el precio vuelven a los del humano. Si sale `facturable` / `job` /
`999999`, la 017 o la 019 no están aplicadas.

### Ataque 2 — una fila que nace sellada (022)

```sql
INSERT INTO encuentros_metering (
  tipo, recurso_id, motor, medico_id, paciente_id, especialidad,
  semana_ar, fecha_ar, segundos_ambos_en_sala, documentos_emitidos,
  precio_centavos, clasificacion, facturado_periodo
)
SELECT 'turno', gen_random_uuid(), 'acordado', m.id, gen_random_uuid(), 'Prueba',
       DATE '2000-01-03', DATE '2000-01-03', 120, 1, 100000, 'facturable', '2000-01'
FROM medicos m LIMIT 1;
```

**Esperado:** `una fila nueva no puede nacer sellada`. Un `INSERT 1` significa que
se le puede agregar una línea a una factura ya emitida con una sola sentencia, sin
que ningún trigger se entere: los de la 014 son BEFORE UPDATE y BEFORE DELETE, y
sobre una fila que todavía no existe no hay nada que proteger.

### Sellar la fila de prueba

Es el paso que habilita los ataques 3 a 5 y el bloque 9. **A partir de acá no hay
vuelta atrás por SQL** — para borrarla al final hay que desactivar los triggers a
mano (ver Limpieza), que es justamente la fricción que se buscó.

```sql
UPDATE encuentros_metering SET facturado_periodo = '2000-01' WHERE id = :fila;
```

**Esperado:** `UPDATE 1`. Sellar una fila que no lo estaba es la única escritura
que el trigger deja pasar sin constancia.

### Ataque 3 — editar una fila ya facturada (014)

```sql
UPDATE encuentros_metering SET clasificacion = 'no_facturable_corta' WHERE id = :fila;
```

**Esperado:** `la fila … ya fue facturada en el período 2000-01 — está sellada`.
Un `UPDATE 1` acá significa que el trigger no está: la factura de un mes cerrado
se puede reescribir.

### Ataque 4 — corregir y re-sellar en el mismo UPDATE (014)

```sql
UPDATE encuentros_metering
   SET clasificacion = 'no_facturable_corta', facturado_periodo = '2000-02'
 WHERE id = :fila;
```

**Esperado:** el mismo error. Es la mitad que se agregó a propósito: sin ella,
"corregir y de paso re-sellar en otro período" pasaba derecho.

### Ataque 5 — levantar el sello (021)

```sql
UPDATE encuentros_metering SET facturado_periodo = NULL WHERE id = :fila;
```

**Esperado:** el mismo error, con la aclaración `y eso incluye levantarle el
sello`. Es el ataque que la 021 agrega sobre la 014: antes este UPDATE **pasaba**,
y con él los tres pasos por SQL —levantar, corregir la fila desprotegida, volver a
sellar— quedaban disponibles para cualquiera con service role, sin una sola fila
de auditoría.

### Ataque 6 — borrar una fila facturada (014)

```sql
DELETE FROM encuentros_metering WHERE id = :fila;
```

**Esperado:** `está facturada (2000-01) y no se puede borrar`.

### Ataque 7 — vaciar la tabla (019)

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

### Ataque 8 — editar una semana ya cerrada (015)

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

### Ataque 9 — corregir un mes sellado sin dejar rastro (021)

La 021 abre **una** puerta sobre la 014: el superadministrador de Docto puede
corregir una fila sellada (R33). La puerta está atada a su rastro, y esto lo
verifica. La fila ya está sellada desde el paso de arriba.

`SET LOCAL` solo vive dentro de una transacción: los dos primeros ataques van
con `BEGIN` / `ROLLBACK` explícitos o no prueban nada.

```sql
-- 9a) La puerta no se abre sola: sin constancia, el UPDATE sigue rebotando.
BEGIN;
  SET LOCAL metering.correccion_id = '00000000-0000-0000-0000-000000000000';
  UPDATE encuentros_metering SET clasificacion = 'falla_tecnica' WHERE id = :fila;
ROLLBACK;
```

**Esperado:** el error de la 014 (`ya fue facturada … está sellada`). Un
`UPDATE 1` significa que el trigger acepta un id de corrección inexistente:
toda la auditoría sería decorativa.

```sql
-- 9b) Con una constancia de OTRA fila, tampoco.
-- La firma va con un superadmin REAL: desde la 021 un trigger de INSERT exige
-- que `admin_user_id` sea un superadministrador activo, así que un
-- `gen_random_uuid()` acá rebota antes de llegar a probar lo que este ataque
-- quiere probar.
INSERT INTO metering_correcciones (encuentro_id, periodo, admin_user_id, motivo, valores_antes, valores_despues)
VALUES (:vecina, '2000-01', :user_id_del_superadmin, 'constancia de otra fila, para la prueba',
        '{}'::jsonb, '{}'::jsonb)
RETURNING id;  -- :otra

BEGIN;
  SET LOCAL metering.correccion_id = ':otra';
  UPDATE encuentros_metering SET clasificacion = 'falla_tecnica' WHERE id = :fila;
ROLLBACK;
```

**Esperado:** el mismo error. La constancia tiene que ser **de ese encuentro** —
y, además, de **esta** transacción: la de arriba se escribió en otra, así que
tampoco serviría para su propia fila.

```sql
-- 9c) Una constancia firmada por un UUID cualquiera ni siquiera se puede escribir.
INSERT INTO metering_correcciones (encuentro_id, periodo, admin_user_id, motivo, valores_antes, valores_despues)
VALUES (:fila, '2000-01', gen_random_uuid(), 'firmada por nadie, para la prueba',
        '{}'::jsonb, '{}'::jsonb);
```

**Esperado:** `no es un superadministrador de Docto activo`. Si pasa, una
constancia escrita a mano puede atribuirse a cualquiera y después servir de
permiso.

```sql
-- 9d) Un admin que no es superadmin no puede, aunque llame a la RPC directo.
SELECT corregir_encuentro_sellado(
  :fila, 'falla_tecnica',
  'prueba de la verificación post-aplicación', :user_id_de_un_admin_comun, NULL);
```

**Esperado:** `Solo un superadministrador de Docto activo puede corregir un
período sellado (R33).`

```sql
-- 9e) Y sin motivo, ni el superadmin.
SELECT corregir_encuentro_sellado(:fila, 'falla_tecnica', 'ok', :user_id_del_superadmin, NULL);
```

**Esperado:** `necesita un motivo de al menos 10 caracteres`.

```sql
-- 9f) El camino legítimo: superadmin + motivo. Deja la fila corregida Y su rastro.
SELECT corregir_encuentro_sellado(
  :fila, 'falla_tecnica',
  'prueba de la verificación post-aplicación', :user_id_del_superadmin, NULL);

SELECT clasificacion, clasificacion_origen FROM encuentros_metering WHERE id = :fila;
SELECT motivo, valores_antes ->> 'clasificacion' AS de, valores_despues ->> 'clasificacion' AS a
  FROM metering_correcciones WHERE encuentro_id = :fila;
```

**Esperado:** `falla_tecnica` / `manual_admin`, y **una fila** en
`metering_correcciones` con el motivo y el de→a (`no_facturable_corta` →
`falla_tecnica`). Si la fila cambió y el registro no existe, la puerta quedó
abierta sin auditoría — el peor de los resultados.

Va último de este bloque a propósito: es el único que **modifica** la fila, y
después de él `9e` ya no probaría lo mismo.

### Ataque 10 — reabrir un mes cerrado (023)

```sql
INSERT INTO metering_periodos_cerrados (periodo, filas_selladas, facturables)
VALUES ('2000-01', 1, 1);

UPDATE metering_periodos_cerrados SET filas_selladas = 999 WHERE periodo = '2000-01';
DELETE FROM metering_periodos_cerrados WHERE periodo = '2000-01';
TRUNCATE metering_periodos_cerrados;
```

**Esperado:** el `INSERT` pasa; los otros tres rebotan (`un mes cerrado no se
reabre ni se borra` / `no se puede vaciar con TRUNCATE`). Si se pudieran editar,
"cerrado" volvería a ser una opinión y un mes que cerró en cero podría volver a
cerrarse con lo que llegó después.

### Limpieza

Va en este orden: primero el rastro, después el sello, después las filas.

```sql
-- El rastro de la prueba es append-only a propósito: para poder borrar las filas
-- sintéticas hay que sacar antes sus correcciones, y eso NO se puede por el
-- trigger. Desactivarlo a mano y volver a activarlo es justamente la fricción
-- que se buscó.
DELETE FROM metering_correcciones WHERE encuentro_id IN (:fila, :vecina);  -- rebota: append-only
ALTER TABLE metering_correcciones DISABLE TRIGGER trg_metering_correcciones_no_delete;
DELETE FROM metering_correcciones WHERE encuentro_id IN (:fila, :vecina);
ALTER TABLE metering_correcciones ENABLE TRIGGER trg_metering_correcciones_no_delete;

-- Lo mismo con el sello. Desde la 021 NO hay forma de levantarlo con un UPDATE
-- —ni siquiera para borrar después—, así que la fila sintética sellada es
-- imborrable mientras los triggers estén activos. Se desactivan los DOS: el de
-- UPDATE (que rechaza levantar el sello) y el de DELETE (que rechaza borrar una
-- fila facturada).
ALTER TABLE encuentros_metering DISABLE TRIGGER trg_encuentros_metering_sellado;
ALTER TABLE encuentros_metering DISABLE TRIGGER trg_encuentros_metering_sellado_delete;
DELETE FROM encuentros_metering WHERE id IN (:fila, :vecina);
ALTER TABLE encuentros_metering ENABLE TRIGGER trg_encuentros_metering_sellado;
ALTER TABLE encuentros_metering ENABLE TRIGGER trg_encuentros_metering_sellado_delete;

-- Y la marca del mes de prueba (mismo procedimiento, mismo motivo).
ALTER TABLE metering_periodos_cerrados DISABLE TRIGGER trg_metering_periodos_cerrados_no_delete;
DELETE FROM metering_periodos_cerrados WHERE periodo = '2000-01';
ALTER TABLE metering_periodos_cerrados ENABLE TRIGGER trg_metering_periodos_cerrados_no_delete;
```

> ⚠ `DISABLE TRIGGER` apaga la protección **para toda la tabla**, no para la fila.
> Es un paso de dos líneas que hay que correr junto y verificar: al terminar,
> `SELECT tgname, tgenabled FROM pg_trigger WHERE NOT tgisinternal;` tiene que
> devolver `O` (habilitado) en todos. Si la limpieza se corta por la mitad, la
> instancia queda sin inmutabilidad y nadie se entera.

**Cualquier ataque que NO devuelva error es un hallazgo**, y se anota en el
registro de provisión de la instancia junto con los REVOKE de arriba.
