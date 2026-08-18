# Incidente 17/08/2026 — Outage de API/Auth, y el descubrimiento de que la remediación del 17/07 nunca se había aplicado

## Resumen

**Downtime: ~35 minutos (20:17 → 20:52 ART).** PostgREST (todo el acceso a datos) y GoTrue (login/sesiones) colgados; Postgres degradado hasta quedar inaccesible. **Cero pérdida de datos.** Impacto usuario: las páginas estáticas cargaban, todo lo demás moría en `504 GATEWAY_TIMEOUT` / `MIDDLEWARE_INVOCATION_TIMEOUT`.

El hallazgo importante no es el outage — es lo que apareció al investigarlo: **el upgrade de compute a Small decidido y documentado el 17/07/2026 nunca llegó a aplicarse**, y producción llevaba un mes corriendo en `nano` (0,5 GB), el escalón más bajo que existe, por debajo de dos proyectos internos que no facturan.

## Detección

Lo vio Diego en pantalla, no el watchdog. Ese es un dato en sí mismo y motiva el follow-up de alertas del final.

## Línea de tiempo (UTC — restar 3 h para ART)

| Hora | Evento |
|---|---|
| 23:16:53 | Primera consulta cortada por `statement timeout` en los logs de Postgres |
| 23:19 | Diego ve `504 MIDDLEWARE_INVOCATION_TIMEOUT` en el apex |
| 23:17–23:21 | Los 13 crons devuelven 504; `/admin/medicos`, `/api/admin/contadores` y `/sw.js` también |
| ~23:35 | Diagnóstico: `GET /health?services=db,auth,rest` da los tres CAÍDOS; la instancia institucional (misma región) está sana → descarta caída de plataforma |
| 23:41 | **Restart del proyecto** vía Management API (OK de Diego) |
| 23:43 | PostgREST arranca y no encuentra Postgres (`Connection refused`), reintenta en bucle |
| ~23:52 | `db=OK auth=OK rest=OK`, tres lecturas seguidas en 200 |

## Causa raíz

**Compute agotado en `nano` (0,5 GB) compartido entre Postgres + PostgREST + GoTrue + Realtime + pooler.** Es la misma causa y la misma firma que el incidente del 17/07 (ver `2026-07-17-outage-supabase-compute.md`): los servicios laterales quedan zombies, Postgres aguanta más y cae último, y el panel de Supabase sigue diciendo `ACTIVE_HEALTHY` mientras el endpoint de salud dice lo contrario.

### La evidencia que descarta las hipótesis alternativas

Se probaron y descartaron, en este orden:

- **No fue saturación de conexiones.** Una consulta que entró en una ventana de la recuperación devolvió 12 conexiones abiertas de 60 disponibles.
- **No fue tamaño de datos.** La base pesa ~30 MB. *(Este número engaña y por eso se documenta: el giga de RAM no es para los datos, se reparte entre cinco servicios. Mirar el tamaño de la base para dimensionar compute es el error que casi hace descartar la causa correcta.)*
- **No fue una caída de Supabase.** El tablero daba `sa-east-1` operativo, y la instancia institucional —misma región, mismo proveedor— respondía normal durante todo el episodio.
- **No fue el spend cap.** El cap está activo, pero la organización estaba por debajo del 1% en todas las cuotas (egress, MAU, storage, Realtime).
- **No fue una consulta nuestra pesada.** Las consultas que el motor cortó por timeout son el saludo protocolar de PostgREST al abrir conexión: `SET client_encoding = 'UTF8'`, `BEGIN ... READ ONLY`, `SELECT current_setting('server_version_num')`, `SELECT name FROM pg_timezone_names`. Son operaciones de microsegundos. Que esas den timeout significa que el proceso no podía ejecutar ni un no-op. El checkpoint del período lo confirma: `wrote 3 buffers (0.0%)` — la base no estaba escribiendo casi nada.

## El hallazgo de fondo: la remediación que nunca se aplicó

El documento del 17/07 registra el upgrade a Small a las 09:45 ART con OK de Diego. Su sección de "Verificación post-recuperación" comprueba cuatro cosas: PostgREST 200, GoTrue 200, una página con datos en 200, y los latidos de los crons reanudados.

**Ninguna de las cuatro mira el tamaño de la máquina.** Y las cuatro son efectos del *restart* de las 09:31 — catorce minutos ANTES del upgrade. Se verificó que el sitio volvió y se dio por hecho el resto.

Prueba de que nunca corrió, de la facturación de Supabase: en el ciclo 08/07–08/08 —que contiene el 17/07— el consumo registra **solo horas de Micro Compute, y ninguna hora de Small**. Si Small hubiera estado activo desde el 17/07 habría ~500 horas suyas en ese período.

### El detalle que lo vuelve absurdo

`nano` y `micro` cuestan **lo mismo** (US$0,01344/hora): Supabase factura las horas de nano bajo la línea "Micro Compute" y muestra el botón de Micro con el cartel *"Free Upgrade"*. Producción estuvo un mes pagando precio de Micro y recibiendo la mitad de la máquina — y el upgrade que lo arreglaba era gratis y estaba a un clic.

## Remediación aplicada

1. **Inmediata:** restart del proyecto → servicios de vuelta en ~11 min.
2. **De fondo:** compute a **Small (2 GB, 2 cores, ~US$15/mes)** vía Management API — `PATCH /v1/projects/{ref}/billing/addons` con `{addon_type:"compute_instance", addon_variant:"ci_small"}`. *(Ojo: en la versión de API vigente, `POST` y `PUT` a esa ruta dan 404; el único verbo que funciona es `PATCH`, y devuelve 200 con cuerpo vacío — razón de más para verificar en vez de confiar en el código de respuesta.)*

## Verificación post-cambio

A diferencia de julio, se verifica el **estado final**, en tres fuentes independientes:

- El inventario de Supabase (`GET /v1/organizations/{org}/projects` → `databases[].infra_compute_size`) dice `small`.
- El adicional contratado (`GET /v1/projects/{ref}/billing/addons` → `selected_addons`) dice `ci_small`.
- La base declara sus propios parámetros: `max_connections` pasa de 60 a 90 y `shared_buffers` sube, medido con `SELECT ... FROM pg_settings`.

## Lecciones

### 1. Una remediación no está aplicada hasta que se verifica el estado final

CLAUDE.md ya tiene la regla de "verificación contra producción real" para *reportes de estado*. No cubría las *remediaciones*, y este incidente es la factura de ese hueco: un mes creyendo que producción tenía 2 GB cuando tenía medio.

**Regla nueva:** toda remediación de infraestructura se cierra comprobando el estado resultante en una fuente distinta de la que ejecutó el cambio. No vale el código de respuesta de la API que la aplicó, ni que el síntoma haya desaparecido — el síntoma puede haber desaparecido por otra cosa (acá, por el restart).

Esto no es un caso aislado: el mismo día se detectaron otros dos del mismo patrón — una llave maestra cargada en el formato equivocado (64 hex esperados, se cargó base64 de 44), y un comando que anunció "MERGEADO" habiéndose comido un 503.

### 2. El tamaño de la base no dimensiona el compute

El compute sostiene cinco servicios; los datos son el inquilino más chico. Dimensionar mirando `pg_database_size` lleva a la conclusión opuesta a la correcta.

### 3. `ACTIVE_HEALTHY` no significa sano

El panel dice `ACTIVE_HEALTHY` con los servicios muertos. La fuente confiable es `GET /v1/projects/{ref}/health?services=db,auth,rest`, y por encima de eso, una lectura real contra `/rest/v1/`.

## Follow-ups abiertos

- **Alerta externa de disponibilidad** — ya estaba propuesta en el doc del 17/07 y sigue sin implementarse; hoy volvió a costar. Un ping desde fuera cada pocos minutos a `/rest/v1/` detecta esto sin depender de los crons del propio proyecto (que mueren con él). Es el trabajo que Diego dejó agendado al cerrar este incidente.
- **Límite de tiempo en el middleware.** `updateSession` llama a `supabase.auth.getUser()` en cada request sin timeout ni salida alternativa: cualquier lentitud de Supabase se convierte en el sitio entero caído, incluso para páginas que no necesitan sesión. Con un tope de 2–3 s y seguir de largo, un episodio como este degrada el login pero deja el resto en pie.
- **PITR sigue apagado** en todos los proyectos (ventana de recuperación: 24 h). Decisión de Diego pendiente, ver la nota de respaldos.
