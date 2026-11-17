# Restauración del respaldo — probada el 16/11/2026

Cierra el pendiente 1.5 de `DECISIONES.md` ("la restauración nunca se probó").
Antecedente: `docs/infra/2026-08-11-respaldos-y-recuperacion.md`.
Repo público: acá no van conteos de producción, rutas de archivos ni claves.
Los conteos de la prueba quedaron fuera del repo.

## Resultado

**Respaldo restaurado y verificado el 16/11/2026, en 21 minutos de punta a
punta** (22:18 a 22:39, hora argentina): la base, en 5 minutos; la verificación
de la base, unos 3; los archivos del Storage, 1 minuto; la app y el admin contra
la copia, el resto.

| Qué se verificó | Cómo | Resultado |
|---|---|---|
| Datos de las tablas principales: `medicos`, `consultas`, `turnos`, `documentos`, `firma_logs` (la firma de cada documento), `admin_audit_log` y los usuarios (`auth.users`) | Filas creadas hasta la hora del respaldo y md5 de sus ids ordenados, en producción y en la copia (`scripts/respaldo/huella.mjs` + `comparar.mjs`) | Iguales, todas |
| Esquema (lo que dejan las migraciones) | md5 de columnas, funciones (con su código), triggers, constraints e índices | Iguales |
| RLS y permisos | md5 de las políticas, de qué tablas tienen RLS, de los grants de tabla y de columna, y de los roles | Iguales |
| Buckets y metadata del Storage | md5 de buckets y de la lista de objetos | Iguales |
| Las 53 tablas | Que existan todas en la copia | Están todas. 13 tienen otra cantidad total: son las que producción siguió escribiendo después de la hora del respaldo (lo esperable) |
| Que la copia sea el respaldo de esa hora | Último alta de cada tabla en la copia | Ninguna posterior a las 04:23 UTC |
| La app levanta contra la copia y se entra al admin | Next en local con la URL y las claves de la copia (y sin las claves de WhatsApp, mail, pagos ni IA, para que no pueda mandar nada); un admin de prueba creado solo en la copia | Entra; el panel de médicos muestra los datos restaurados; sin errores del servidor |
| Archivos del Storage (credenciales, firmas, fotos, videos) | Restaurados desde la copia de Vercel Blob a la copia de Supabase; cada archivo releído y comparado por md5 (`scripts/respaldo/restaurar-storage.mts`) | Todos los que la base referencia, verificados. Las credenciales abren desde el admin de la copia |

Sobre las migraciones: la tabla `supabase_migrations.schema_migrations` de
producción está vacía (las migraciones se aplican por la Management API, no con
la CLI de Supabase), así que no hay lista que comparar. Lo que se compara es lo
que dejan: el esquema completo, que coincide.

El proyecto de prueba se borró al terminar (vivió 21 minutos; se cobra por
hora: centavos de dólar).

## Qué falló o no viajó (para la próxima vez)

1. **La API pública de Supabase no restaura en un proyecto nuevo.** Solo el
   panel: *Database → Backups → Restore to new project* (en beta). El endpoint
   `POST /v1/projects/{ref}/database/backups/restore` de la API restaura
   **sobre el mismo proyecto**: no usarlo nunca para una prueba.
2. **Los respaldos son físicos**: no se pueden descargar, solo clonar a un
   proyecto nuevo. El proyecto nuevo arranca con el mismo tamaño que producción
   (hoy Small: US$15,33/mes, que se cobran por hora).
3. **Lo que no viaja con el respaldo** (lo dice el propio panel y se comprobó):
   los archivos del Storage, la configuración de Auth (plantillas de mail, SMTP,
   URLs de redirección, el ingreso con Google), las claves de la API (son
   nuevas), las Edge Functions y la configuración de extensiones. En un desastre
   real, además de restaurar: copiar la configuración de Auth de producción
   (`GET /v1/projects/{ref}/config/auth` → `PATCH` en el nuevo; el SMTP se
   vuelve a cargar a mano porque la API no devuelve la contraseña), restaurar
   los archivos con `restaurar-storage.mts`, y cambiar en Vercel
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y
   `SUPABASE_SERVICE_ROLE_KEY` con un deploy fresco. **Ese cambio de Vercel no
   se probó** (habría que apuntar producción a la copia).
4. **Restauración del Storage:** la primera pasada tuvo cuatro cortes de red al
   bajar archivos grandes; el script ahora reintenta y la segunda pasada salió
   completa en 57 s.
5. **Operativos, no del respaldo:** la extensión de Chrome no conectaba (se hizo
   desde el Chrome de Diego al reconectarla); `vercel blob create-store` reescribe
   `.env.local` con los valores entre comillas y los scripts locales que lo leen
   sin quitarlas fallan ("JWT could not be decoded"); el Beta Gate corta todo en
   local si falta `BETA_PASSWORD` (es así a propósito).
6. **No probado:** la base institucional (`ygoenedpeyzwsfblgjsy`). Tiene el mismo
   tipo de respaldo y el mismo procedimiento sirve; su Storage ya está en la copia.

## La copia del Storage

El respaldo de la base no incluye los archivos del Storage. Desde el 16/11:

- **Dónde:** Vercel Blob, almacén `docto-respaldo-storage`, **privado**, en
  São Paulo (`gru1`), conectado a los dos proyectos de Vercel
  (`BLOB_READ_WRITE_TOKEN`). Fuera de Supabase.
- **Cuándo:** todos los días a las 02:30 (cron `copia-storage`, en los dos
  deploys; cada uno copia su propio proyecto). Copia solo lo nuevo o cambiado.
- **Cómo:** cada versión de cada archivo es un blob propio
  (`storage/<ref>/<bucket>/<ruta>@<md5>`). Un archivo reemplazado deja su versión
  vieja; **nada se borra nunca de la copia**: es el "deshacer" de un borrado
  nuestro. Lo temporal por diseño (`consultas-temp`, que se borra solo a las 6 h)
  no se copia.
- **Orden:** firmas primero, después credenciales, después el resto.
- **Integridad:** antes de guardar, compara lo bajado con el md5 de Supabase; si
  el archivo cambió en el medio, no lo guarda y queda para la corrida siguiente.
- **Si falla:** suena el cron (mail al equipo) si un archivo no se pudo copiar
  después de tres intentos, si un archivo lleva más de 48 h sin copia, o si hubo
  pendientes y no se pudo copiar ninguno. Lo que no alcanza en una corrida
  (~3,5 minutos) sigue en la siguiente sin sonar; un archivo borrado entre el
  listado y la descarga tampoco suena. El watchdog avisa si deja de correr. El
  mail y el log no llevan rutas (tienen el id del profesional).
- **La clave del almacén** (`BLOB_READ_WRITE_TOKEN`) está solo en producción y
  marcada como sensible en los dos proyectos de Vercel: los previews no la
  reciben. Puede leer y borrar la copia; los scripts manuales la toman de
  `.env.local`.
- **Horario:** 05:30 UTC, una hora después del respaldo de la base. Un archivo
  reemplazado en esa hora deja sin copia la versión que referencia el respaldo
  de ese día (ventana nocturna chica, aceptada).
- **Costo:** Blob cobra por GB guardado; con el tamaño actual son centavos por mes.
- **Primera copia:** hecha a mano el 16/11 (`copiar-storage.mts`), completa y
  sin fallas.

## Procedimiento (cada tres meses)

**Quién:** una sesión de Claude Code en este repo. Diego solo aprueba el costo del
proyecto de prueba (centavos) y, si la extensión de Chrome no está conectada,
hace los clics del paso 2.

**Cada cuánto:** cada tres meses. Un workflow de GitHub
(`.github/workflows/recordatorio-restauracion.yml`) abre un issue el día 16 de
febrero, mayo, agosto y noviembre. Próxima: 16/02/2027.

1. Hora del respaldo a probar (el más reciente):
   `GET /v1/projects/irpupskopjahbqqvckue/database/backups` → `inserted_at`.
2. En el panel de Supabase, proyecto de producción → *Database → Backups →
   Restore to new project* → ese respaldo → nombre `docto-restauracion-prueba`,
   contraseña generada → *Restore to new project*. Anotar la hora. Esperar
   `ACTIVE_HEALTHY` (`GET /v1/projects/<ref nuevo>`); el 16/11 tardó 5 minutos.
3. Huellas y comparación (la salida de `huella.mjs` tiene conteos: va al
   scratchpad, nunca al repo):
   ```
   node scripts/respaldo/huella.mjs irpupskopjahbqqvckue <hora del respaldo> > "$TMPDIR/prod.json"
   node scripts/respaldo/huella.mjs <ref nuevo> <hora del respaldo> > "$TMPDIR/copia.json"
   node scripts/respaldo/comparar.mjs "$TMPDIR/prod.json" "$TMPDIR/copia.json"
   ```
   Tiene que terminar en "Todo lo que tiene que coincidir coincide". Si una
   tabla principal da distinta, ver si en producción se borraron filas después
   del respaldo antes de llamarlo falla.
4. Archivos: `npx tsx scripts/respaldo/restaurar-storage.mts irpupskopjahbqqvckue <ref nuevo>`.
   Tiene que salir con `sin_copia: 0` y `fallas: 0` en todos los buckets.
5. App: `next dev` con `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   y `SUPABASE_SERVICE_ROLE_KEY` de la copia (las claves salen de
   `GET /v1/projects/<ref nuevo>/api-keys?reveal=true`), las claves de Twilio,
   Resend, Mercado Pago, LiveKit, OpenAI y Anthropic vacías, y un
   `BETA_PASSWORD` cualquiera. Crear un admin de prueba **solo en la copia**
   (`auth/v1/admin/users` con `email_confirm: true`, para que no salga ningún
   mail, + fila en `admin_users`), entrar al admin y abrir una credencial.
6. Borrar el proyecto de prueba (`DELETE /v1/projects/<ref nuevo>`, comprobando
   antes que el nombre sea `docto-restauracion-prueba`).
7. Anotar en este archivo la fecha, cuánto tardó y qué falló, y cerrar el issue.

## Deshacer el borrado o el reemplazo de un archivo en producción

El caso que motivó la copia. La restauración completa no sirve para esto (solo
trae lo que la base todavía referencia). Se hace de a un archivo:

```
npx tsx scripts/respaldo/restaurar-storage.mts irpupskopjahbqqvckue irpupskopjahbqqvckue --sobre-produccion --archivo <bucket>/<ruta>
```

lista las versiones guardadas (la más nueva arriba), y con `--version <etag>`
restaura la elegida en su ruta. Sin `--sobre-produccion` el script no toca
producción, y sobre producción no hace restauraciones completas.

## Datos que nos preguntan (16/11/2026)

- **Región de la base:** `sa-east-1` (São Paulo, AWS), las dos bases
  (verificado por la Management API).
- **Región del Storage:** el Storage es parte del mismo proyecto de Supabase y
  Supabase lo aloja en la región del proyecto, `sa-east-1`. Lo dice Supabase; el
  bucket por dentro no se puede ver. La copia está en Vercel Blob, São Paulo
  (`gru1`, verificado por la API de Vercel).
- **Respaldo de la base:** diario (~04:20 UTC), 7 días de retención, sin
  recuperación a un punto (PITR): un incidente puede perder hasta 24 h. PITR
  sigue siendo decisión de Diego (USD 100/mes por base).
- **Segundo factor en el admin:** pendiente 1.21 de `DECISIONES.md`. El estado
  está en `.privado/seguridad/` (fuera del repo: no se publica en un repo público).

## Historial de pruebas

| Fecha | Respaldo | Tiempo total | Base | Archivos | Qué falló |
|---|---|---|---|---|---|
| 16/11/2026 | 16/11 04:23 UTC | 21 min | iguales | todos, md5 ok | API sin clon; cortes de red en archivos grandes (ya con reintento) |
