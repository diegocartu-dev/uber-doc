# Hallazgo — una devolución hecha fuera de Docto, y un turno "completado" sin paciente

**Fecha:** 30/09/2026 · **Estado:** HALLAZGO documentado a pedido de Diego; sin decisión ni fix todavía.

Caso real del 29/09 a la noche (hora Argentina). Sin nombres, sin identificadores, sin montos: el repo es público. El detalle vive en el panel de Mercado Pago y en la base.

## Qué pasó (verificado en MP, en la base y en `video_presencia`)

| Hora | Qué |
|---|---|
| 20:55 | Una paciente pagó con tarjeta de débito un turno **para la mañana siguiente**. El pago quedó aprobado, con el fee de Docto y el de MP a cargo de la profesional (cobradora). |
| 21:01 – 21:02 | La **profesional entró y salió de la sala de video tres veces**, unos segundos cada vez. **La paciente nunca entró** (la tabla de presencia solo tiene filas con rol `medico`). |
| 21:03 | LiveKit cerró la sala (`room_finished`) y Docto marcó el turno **`completado`** con `cierre_origen = webhook_video`. El rescate del borrador dio "sin contenido": ni evolución ni documentos. |
| 21:14 | La profesional **devolvió el pago completo desde su propia cuenta de Mercado Pago**. En Docto no hay ningún registro de reintegro (`reintegro_estado` en null, sin fila en `refunds_pendientes`): ninguno de los dos caminos de reembolso del código corrió. |
| 21:14 | El webhook de MP recibió `refunded` y Docto solo escribió `mp_status = 'refunded'` más un evento de funnel. Nada más. |

**Por qué devolvió: lo explicó ella.** A las 21:09 escribió a la Bandeja de Docto: entró a la consulta antes del horario **por error**, y el sistema la dejó "como si hubiera hecho la atención médica", que no hizo; pedía un reintegro para la paciente. Cinco minutos después lo hizo ella misma desde su cuenta de MP. O sea: el agujero 1 le pasó a una profesional real, ella lo detectó sola, y la única salida que encontró fue devolver la plata por fuera.

## Los dos agujeros

### 1. Un turno de mañana se marca "completado" hoy si el profesional pisa la sala

`room_finished` cierra como `completado` cualquier turno que esté `en_curso` ([`api/livekit/webhook/route.ts`](../../src/app/api/livekit/webhook/route.ts)), y el turno pasa a `en_curso` cuando el profesional entra a la sala. No se exige que el paciente haya entrado, ni que la sala se haya abierto cerca del horario del turno. Resultado: un turno para las 08:20 del día siguiente quedó "atendido" a las 21:03 de la víspera, sin paciente y sin contenido.

Consecuencias: para la agenda de la mañana ese turno ya no existe; para la paciente, su turno desapareció; para `clasificarTurno` ([`lib/consultas/clasificar.ts`](../../src/lib/consultas/clasificar.ts)) es **"atendida"**, así que los reportes lo cuentan como una consulta hecha.

### 2. Una devolución hecha desde MP deja a Docto ciego

El profesional **puede** devolver un pago desde su cuenta de MP (es su cuenta: el pago vive ahí). Cuando lo hace, Docto solo se entera por el webhook, y hoy el webhook no hace más que anotar el estado (`handleStatusOnly`, [`api/pago/webhook/route.ts`](../../src/app/api/pago/webhook/route.ts)). No hay alerta al equipo, no se le avisa a la paciente, el turno no cambia de estado, el lugar no se vuelve a ofrecer y el reporte sigue contando una atención cobrada.

Lo que sí confirma este caso, y sirve para el plan de pagos ([2026-09-29-plan-pagos-desde-docto.md](./2026-09-29-plan-pagos-desde-docto.md)): una devolución desde una cuenta de MP con saldo **sale al instante** y sin fricción. En la actividad de la cuenta de Docto figura como "Devolución de dinero" por el total de la operación; si el fee de Docto volvió a la paciente como parte de esa devolución no se ve por separado en el panel (**no verificado**).

## Qué se podría hacer (propuestas, no decisiones)

1. **`room_finished` no completa un turno sin paciente.** Si `video_presencia` no tiene ninguna fila con rol `paciente`, el turno no es una atención: vuelve a `confirmado` (si el horario todavía no pasó) o se resuelve como no realizado. Lo mismo vale para la consulta inmediata.
2. **La sala de un turno se abre cerca del horario.** Hoy el profesional puede entrar a la sala de un turno de mañana. Una ventana (por ejemplo, desde 15 minutos antes) evita el cierre prematuro.
3. **Un `refunded` que no vino de Docto es un evento, no una anotación.** Si llega `refunded` y `reintegro_estado` es null: alerta al equipo, aviso a la paciente ("te devolvieron el pago"), el turno pasa a un estado que lo saque de "atendida" y, si el horario no pasó, el lugar se libera.
4. **Los reportes no cuentan como atendida una atención sin paciente.** `clasificarTurno` debería mirar la presencia, no solo el estado.

## Qué se hizo (PR #520, 30/09/2026)

Fuente de verdad: `src/lib/video/presencia.ts` (decisiones puras con pruebas en `tests/unit/video-presencia.test.ts`).

1. **La sala sin paciente no cierra el turno.** En `room_finished` (webhook de LiveKit) y en el barrido de `cerrar-huerfanas`, un turno `en_curso` sin ningún `joined` del paciente en `video_presencia` y sin que nadie haya tocado "Finalizar" **vuelve a `confirmado`**, o a **`en_espera`** si el paciente había hecho el check-in en la sala de espera (entonces, si el profesional no vuelve, el cron lo resuelve como ausencia del profesional, con reintegro). Se limpia `sala_video_url` para que el recordatorio de 15 minutos al profesional vuelva a salir. **Sin filas de presencia no se revierte nada**: la tabla existe desde el 06/06/2026 y el webhook que la escribe falla suave, así que "no hay filas" es "no sé", no "no entró".
2. **La devolución externa deja rastro.** Si llega `refunded` sin `reintegro_estado`: se marca `reembolsado`, se avisa al equipo cuando la atención estaba viva o figuraba hecha, y se anula (`cancelado_medico` / `cancelada`) solo si figuraba hecha, el paciente nunca entró **y no quedó evolución ni documentos**. Una atención viva nunca se cancela sola. Un `refunded` repetido vuelve a pasar por la reacción (es idempotente), así que un fallo transitorio no la pierde.
3. **Las devoluciones de Docto se distinguen de las externas.** `ejecutarRefund` marca `pendiente` **antes** de llamar a Mercado Pago (el webhook llegaba antes de que se anotara el resultado y parecía externa), y si MP responde que el pago ya estaba devuelto, no encola: antes esa fila reintentaba diez días, escalaba a "Docto cubre por CVU" y el paciente cobraba dos veces.

### Lo que la revisión adversarial encontró (55 agentes, 22 hallazgos confirmados) y cómo quedó

| Hallazgo | Qué se hizo |
|---|---|
| El turno revertido conservaba `sala_video_url` y el recordatorio de 15 min lo saltaba | Se limpia al revertir |
| Si el paciente había hecho check-in, volver a `confirmado` lo resolvía como ausencia del paciente sin reintegro | Vuelve a `en_espera` |
| "Sin fila del paciente" no es "no entró": atenciones anteriores a la tabla o con webhook caído se anulaban | Tres valores de presencia; `sin_datos` nunca revierte ni anula; la anulación exige además que no haya evolución ni documentos |
| La devolución que dispara Docto llegaba al webhook con `reintegro_estado` null y se tomaba por externa (alerta falsa en cada cancelación) | `ejecutarRefund` marca `pendiente` antes de llamar a MP; en estados terminales resueltos por Docto no se avisa |
| Un pago ya devuelto por fuera hacía que la cancelación de Docto encolara, reintentara y escalara a cobertura doble | `ejecutarRefund` consulta el pago en MP tras el fallo: ya devuelto = `reembolsado`, sin cola |
| La reacción era at-most-once: un fallo después de anotar `mp_status` se perdía | El `refunded` repetido de MP vuelve a ejecutarla |
| `cerrar-huerfanas` seguía cerrando turnos sin paciente a las 00:00 | Misma regla, misma función |

### Segunda vuelta (37 agentes, 12 confirmados + 2 dudosos) y cómo quedó

| Hallazgo | Qué se hizo |
|---|---|
| El check-in contaba cualquier fila histórica de la sala de espera (una de la víspera, ya cerrada) y mandaba el turno a `en_espera` | Solo cuenta una entrada viva al entrar el profesional: abierta, o cerrada en ese mismo instante |
| La presencia leía todas las filas del turno: un `joined` del paciente de anoche daba por atendido el turno de hoy | Se lee desde el `iniciado_en` de la sesión actual |
| Un `joined` del paciente que no se insertó (el webhook falla suave) convertía una atención real en "no entró" | Cualquier fila del paciente cuenta, también el `left`; el residuo (ninguna fila del paciente pero sí del profesional) queda declarado abajo |
| Si al profesional se le cortaba la red antes de que el paciente entrara, "Retomar" lo dejaba en una sala fantasma con el turno en `confirmado` | `participant_joined` del profesional sobre un turno `confirmado`/`en_espera` lo vuelve a `en_curso` |
| En la instancia institucional la reversión a `en_espera` terminaba en un aviso de "le devolvimos el 100%" que no existió | En la instancia vuelve siempre a `confirmado` |
| Un profesional sin token de MP dejaba la fila `pendiente` sin cola ni aviso, y una devolución externa posterior quedaba muda | Sin token → cola + alerta; y un `refunded` sobre `pendiente` cierra el reintegro y la fila de la cola |
| La reacción marcaba `reembolsado` sobre un slot (`disponible`/`reservado_pendiente`) y la marca viajaba al próximo paciente | Sobre estados de slot no se escribe nada |
| El conteo de documentos ignoraba el error y podía anular una atención con receta | Error al contar = hay evidencia, no se anula |
| La cancelación del paciente a menos de 48 h escribía `reintegro_estado: null` y borraba la marca de la devolución externa | Sin intento de reembolso no se escribe la columna (los tres caminos) |
| El pre-mark de `ejecutarRefund` ignoraba su error | Se loguea |

### Tercera vuelta (22 agentes, 5 confirmados) y cómo quedó

| Hallazgo | Qué se hizo |
|---|---|
| Revertir a `en_espera` hacía que, si el profesional cerraba la pestaña sin tocar "Finalizar", el cron lo resolviera como "plantada" (reintegro, agenda despublicada, alertas, mail al paciente) aunque estuvo en la sala | **Vuelve siempre a `confirmado`.** Desaparece el check-in y sus dos relojes. Si el horario ya pasó, el cron lo resuelve como ausencia del paciente, sin reintegro: la misma plata que hoy, bien contada |
| `participant_joined` escribía `iniciado_en` después de insertar la fila de presencia, y esa fila quedaba fuera de la ventana | El instante se toma antes de escribir la presencia, y la lectura tiene 5 s de margen |
| Los caminos de cancelación podían pisar con `pendiente` un `reembolsado` que el webhook dejó en el medio | Solo reafirman `reembolsado`; la columna la gobierna `ejecutarRefund` |
| Una devolución externa sobre `cubierto_docto` (Docto ya pagó por CVU) era muda: el paciente cobra dos veces | Alerta específica de posible doble cobro; no se toca nada (preexistente, ahora visible) |
| La cola de reintentos sin token del profesional reintentaba a diario sin tope | El tope de diez intentos aplica también sin token: pasa a revisión manual |

### Decisión para Diego

- **Paciente en la sala de espera, profesional que entró y salió sin que el paciente pasara al video.** Con este PR el turno vuelve a `confirmado`; si el horario ya pasó, el cron lo cierra como **ausencia del paciente, sin reintegro** (la misma plata que hoy, que lo daba por "completado"). La alternativa —reintegro sin sancionar al profesional— existe pero exige tocar `resolverNoShowMedico` (que hoy sanciona a todo `en_espera` vencido: agenda despublicada, alertas, mail) y no entra en este PR. Es una regla de plata: la decidís vos.

### Deudas que quedan declaradas

- La **consulta inmediata** no se revierte: su `en_curso` lo escribe el pago, y sus plazos los resuelve `resolver-consultas-vencidas`, que exige `sala_video_url` nula para resolver; una CI donde el profesional abrió la sala y el paciente nunca entró sigue cerrándose como "completada" al cerrarse la sala.
- Una atención real devuelta desde MP queda con `reintegro_estado = 'reembolsado'` y la página de video del profesional no deja completar la documentación en ese estado (regla previa: "reembolsado: no se emite documentación"). La alerta lo deja en manos de una persona.
- `reintegro_estado = 'cubierto_docto'` (Docto ya cubrió al paciente por CVU) más una devolución externa del profesional = el paciente cobró dos veces; hoy no se avisa.
- El paciente puede pedir token de video para un turno `confirmado` (ya era así); la reversión no lo cambia.
- Si el `joined` y el `left` del paciente fallan al insertarse pero los del profesional no, la atención real se revierte igual (la escritura de presencia falla suave y LiveKit no reintenta). Probabilidad baja; se ve en los logs.
- `cerrar-huerfanas` (00:00) puede revertir un turno con el profesional todavía adentro de la sala si lleva 10 minutos sin escribir; antes lo cerraba como "completado" en la misma ventana.
- Cada ciclo "el profesional entra por error → sale → vuelve a entrar" manda otro push al paciente ("ya te está esperando"). Es el costo de no dar por hecho el turno; la propuesta 2 (abrir la sala solo cerca del horario) lo eliminaría.
- (Cerrada en este PR) La cola de reintentos sin token del profesional reintentaba a diario sin tope: ahora el tope de diez intentos aplica también ahí y pasa a revisión manual.

## No verificado

- Si el fee de Docto se revirtió con la devolución (la documentación de MP dice que en una devolución total se descuenta proporcionalmente de las dos cuentas; el panel no lo muestra por separado).
- Si la paciente recibió algún aviso por fuera de Docto.
