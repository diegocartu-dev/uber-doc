# Reabrir una consulta cerrada para completar la documentación — 08/08/2026

## El problema

El borrador del médico (`consultas.doc_borrador` / `turnos.doc_borrador`) se guarda
solo cada 5 segundos y funciona bien. Pero es una **libreta privada**: ninguna línea
de código lo convierte en documentos entregados al paciente. Solo sirve para
repoblar la pantalla del médico mientras la consulta sigue abierta.

Cuatro caminos cierran una atención sin que el médico apriete "Finalizar", y
ninguno mira el borrador ni avisa a nadie:

| Camino | Archivo | `cierre_origen` |
|---|---|---|
| Desconexión de 2 min | `src/app/api/consulta-estado/route.ts` | `desconexion` |
| Sala de video vacía | `src/app/api/livekit/webhook/route.ts` | `webhook_video` |
| Cron nocturno (4 h abierta) | `src/app/api/cron/cerrar-huerfanas/route.ts` | `cierre_automatico` |
| Backstop diario de rejoin | `src/app/api/cron/rejoin-expirar/route.ts` | — |

Y una vez cerrada, el médico **no podía volver a entrar**: `workspace/page.tsx`
solo admitía `pagada` y `en_curso`. La puerta quedaba cerrada con llave desde
adentro, con el texto del profesional adentro.

Resultado medido en producción sobre atenciones pagadas: hubo casos donde el
profesional escribió diagnóstico y evolución, el sistema los guardó en el borrador
y el paciente no recibió nada — y nadie se enteró hasta una auditoría, meses
después. Otro caso llegó como reclamo del paciente por mail cinco días más tarde.

## Lo que entra en esta rama

**Alcance:** que el médico pueda volver a una atención ya cerrada, emitir la
documentación que faltó y que le llegue al paciente. Los agujeros del camino del
médico durante la llamada (guardado fire-and-forget que descarta todo si la
consulta ya estaba cerrada, insert sin chequeo de error) se atacan aparte.

### 1. Acceso acotado a la atención cerrada
`workspace/page.tsx` (CI) y `turno/[turnoId]/video/page.tsx` (turnos) admiten
ahora el estado cerrado, **solo para el médico que atendió**, en modo
`modoCompletar`:

- sin video (no se crea sala LiveKit ni se emite token),
- sin cambiar el estado de la atención (sigue cerrada, con su `cierre_origen`),
- sin poder alterar ni borrar nada de lo ya emitido y firmado,
- bloqueado sobre canceladas y sobre `reintegro_estado = 'reembolsado'`.

### 2. Cómo la encuentra el médico
- **Dashboard**: tarjeta ámbar arriba de todo (`DocumentacionPendiente.tsx`) con
  las atenciones cerradas que no entregaron ni un documento clínico. Marca aparte
  las que además tienen texto sin enviar en el borrador, y dice por qué se cerró
  ("Se cortó la conexión", "La cerró el sistema"). Si no hay nada pendiente, no
  dibuja nada.
- **Historial** (`HistorialInline`): las filas afectadas llevan el aviso
  "El paciente no recibió documentación" con el botón "Completar y enviar" al lado.

### 3. La pantalla
Es el mismo workspace en modo completar: sin video, con el borrador ya cargado,
una barra superior con el paciente y la fecha de cierre, y un solo botón —
"Emitir y enviar al paciente". Un bloque lista lo que el paciente ya recibió; los
campos de esos tipos no se muestran (un documento firmado es inmutable, ofrecer un
textarea sería mentir).

### 4. Emisión
`POST /api/consulta/[id]/completar-documentacion` (channel-aware). Inserta los
documentos faltantes y los firma por el **mismo camino que el cierre normal**
(`firmarDocumentoPorSesion`: RSA-SHA256 + log en `firma_logs`). La llamada es
**bloqueante** a propósito: el médico vino justamente porque la vez anterior algo
se perdió en silencio.

Fecha de emisión = **hoy**, la real. No se antedata nada. `emitido_post_cierre`
deja constancia explícita de que la emisión ocurrió después del cierre.

La evolución se completa **solo si estaba vacía**: lo ya registrado no se pisa.

### 5. Aviso al paciente
Canales que ya funcionan, sin inventar uno nuevo:
- push (`pushAlPaciente`, mismo mecanismo que el cierre normal),
- mail (`enviarEmailDocumentacionDisponible`, Resend, con link a "Mis consultas").

El paciente ve y descarga los documentos desde `/mis-consultas` y `/documentos`,
que listan por `paciente_id` sin filtro de fecha ni de estado: los documentos
nuevos aparecen arriba solos.

### 6. Guards
- solo el médico dueño de la atención (`medico_id` de la sesión),
- solo atenciones cerradas (una abierta se documenta por el flujo normal),
- nada de canceladas ni reembolsadas,
- **no se emite dos veces el mismo tipo** (dedupe por `tipo` contra lo ya emitido),
- el firmante tiene que estar `aprobado` + REFEPS validado (o cuenta test),
- sustancias controladas rechazadas, igual que en el borrador,
- certificado de reposo sin días → rechazado (art. 210 LCT),
- receta sin CUIL del paciente → no se emite, y se le avisa al médico en pantalla,
- **cero UPDATE y cero DELETE sobre `documentos`** en todo el endpoint.

## Migración

`supabase/migrations/20260808_documentacion_post_cierre.sql` — agrega
`documentos.emitido_post_cierre` y `emitido_post_cierre_at`. **No se aplicó.**

El código tiene fallback: si la migración todavía no está, el insert se reintenta
sin esas columnas y el documento igual se emite y se entrega. Entregarle el
documento al paciente pesa más que la columna de auditoría — pero sin la migración
no queda la marca, así que conviene aplicarla antes de mergear.

## Qué NO se tocó

El flujo de cierre normal del médico (video → "Finalizar y enviar al paciente" →
redirect → guardado fire-and-forget → firma) sigue exactamente igual.
