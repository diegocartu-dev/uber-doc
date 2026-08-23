# Nombre y apellido, y la rectificación de documentos ya emitidos

**Fecha de cierre:** 23/08/2026 · **PR:** #437 · **Migración:**
`20260823_rectificacion_identidad_y_nombre_apellido.sql`, aplicada y verificada
en producción el 23/08.

> El caso va en genérico: este repositorio es público. El detalle con nombres
> vive en la conversación con Diego y en el panel admin.

## El caso (21/08/2026)

Una paciente escribió tres veces a soporte pidiendo que le agregaran su apellido
en la receta y el certificado. Lo que mostró la revisión contra producción:

| Hora | Qué pasó |
|---|---|
| 16:05 | Se registra. El formulario pide **un** campo, "Nombre completo", y valida solo que no esté vacío. Ella escribe su nombre de pila. |
| 16:06 | Se crea su ficha, completa en todo lo demás: DNI, CUIL, nacimiento, cobertura. |
| 16:11 → 16:22 | Consulta pedida, pagada, atendida y cerrada. |
| **16:22:06** | Se emiten y **se sellan** receta, indicaciones y certificado con `identidad.paciente_nombre` = su nombre de pila. |
| 16:29 y 16:38 | Escribe dos veces a soporte. |
| **21:44** | Entra a "Mis datos" y **corrige la ficha ella misma**. |

Nadie de Docto tocó nada: la corrección fue de ella. Se confirmó comparando el
`xmin` de la fila con el de eventos de hora conocida — la ficha se modificó en la
transacción inmediatamente anterior a un evento suyo de 26 segundos después—, y
además el panel admin **no puede** editar el nombre (solo `estado_cuenta`).

## Por qué la corrección no le sirvió

Dos hechos del diseño, no un bug:

1. **Al firmar, la identidad impresa se congela dentro del hash**
   (`src/lib/firma/identidad.ts`). A las 16:22 la ficha decía lo que decía.
2. **El PDF se dibuja desde ese snapshot, no desde la ficha viva**
   (`src/lib/pdf/documento-desde-db.ts`). Es deliberado: si el PDF releyera la
   ficha, el documento cambiaría después de firmado y la firma no valdría nada.

Y no había salida: lo sellado es inmutable, y `completar-documentacion` se niega
explícitamente a emitir dos veces el mismo tipo — sirve para lo que **faltó**, no
para lo que salió mal.

## La decisión (Diego, 22/08/2026)

> "No es ninguna alteración, ya lo discutimos con otro caso. Es completar algo
> que debimos hacer nosotros si el proceso hubiera estado correcto. Ni siquiera
> el médico sabe qué apellido tiene porque esos datos se le completan solos. No
> cambiamos nada de lo que escribió el médico. Solo corregimos un error de
> proceso. Es transparente para todos."

Y sobre la causa: dos campos, nombre y apellido, **obligatorios como todos los
que necesitan los documentos**.

## Lo que se construyó

### 1. Nombre y apellido, separados y obligatorios

En los tres formularios del paciente: registro, onboarding y "Mis datos". Se
guardan **las partes y el compuesto** — `nombre_completo` la siguen leyendo
documentos, listados y mails, así que todos los lectores existentes toman ambos
**sin tocar un solo SELECT en producción** (regla de CLAUDE.md sobre columnas
nuevas).

El gate previo a la consulta ("Tu información médica") exige los dos: es el
último lugar donde se puede frenar antes de que la ficha se imprima y se selle.

**Las filas anteriores no se parten a la fuerza.** Nadie puede saber si un
"María Belén Pérez" es nombre compuesto o apellido doble: se aceptan si ya
tienen dos palabras, y se prefilean partidas para que la persona confirme. Una
sola palabra manda al onboarding, que ahora lo pide bien.

Fuente de verdad: **`src/lib/pacientes/nombre.ts`**.

### 2. Rectificación de identidad — camino 5 de firma

`src/lib/firma/documento.ts`. Re-sella el **mismo** documento con el bloque del
paciente tomado de la ficha de hoy:

- **Mismo** id, contenido clínico, diagnóstico, tratamiento, reposo y fecha de
  emisión.
- **Mismo** bloque del profesional — `mezclarIdentidadRectificada` lo garantiza
  y tiene test, incluido el caso `v:1` donde agregar una clave rompería el hash
  de lo ya firmado.
- Nueva firma con la clave activa del profesional; `firmado_at` = instante real.

**Nada se borra.** La firma anterior entera —hash, firma, identidad, fecha y
método— queda dentro de `firma_digital.rectificacion`, con el motivo y quién
autorizó. En `firma_logs` se encadena una fila con método propio
(`rectificacion_identidad_plataforma`) y el mismo contenido. Si el log no se
puede escribir, **se restituye la firma anterior**: mismo invariante que los
otros cuatro caminos.

**La página pública lo dice con todas las letras**, sin exponer un dato del
paciente: que el contenido clínico no fue alterado, que los datos de identidad
los completó Docto después de la emisión, y qué fecha corresponde a qué.

Corre **dentro de producción** (`/api/admin/rectificar-identidad`, protegido con
`CRON_SECRET` fail-closed) por la misma razón que el sellado histórico:
`FIRMA_MASTER_KEY` vive en Vercel y no se lee de vuelta. **Simula por defecto**;
solo escribe con `aplicar: true`. Idempotente: si la identidad firmada ya
coincide con la ficha, se saltea.

## Verificación

- **509/509 tests** (8 nuevos: composición y partición del nombre, y la mezcla
  de identidad con su caso `v:1`).
- **tsc: 23 errores, exactamente los mismos 23 que main** — todos preexistentes
  en `tests/unit/`, **cero en `src/`**.
- **eslint limpio** sobre los 16 archivos tocados.
- Migración aplicada y **releída** de `information_schema` y `pg_constraint`.

## La regla que queda

**Un dato que la plataforma completa sola y que termina impreso en un documento
firmado necesita dos cosas: que se pida bien antes, y una vía de corrección
después.** Faltaban las dos. La primera es el gate; la segunda, el camino 5.

Y el corolario del formulario: *"nombre completo" en un solo campo no garantiza
un nombre completo*. Cualquier dato obligatorio para los documentos se pide
explícito y se valida explícito.
