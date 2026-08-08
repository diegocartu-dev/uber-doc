# 08/08/2026 — El cierre automático rescata el borrador

## El hallazgo

Docto autoguarda cada 5 segundos lo que el médico escribe durante la consulta
(`consultas.doc_borrador` / `turnos.doc_borrador`, hook `useAutoSaveBorrador`).
Eso funcionaba bien.

Lo que **no existía** era el paso siguiente: ninguna línea de código convertía
ese borrador en documentos entregados al paciente. El borrador era una libreta
privada del médico — solo servía para repoblar su pantalla si volvía a entrar
mientras la consulta seguía abierta.

Consecuencias medidas en producción sobre consultas pagadas ya completadas:

- **Un caso de junio.** Videollamada larga, el profesional escribió diagnóstico y
  evolución, el sistema los guardó en el borrador, y el paciente no recibió nada.
  Apareció recién en esta auditoría, dos meses después.
- **Un caso de agosto.** El profesional nunca tocó "Finalizar consulta"; un cron
  nocturno cerró la consulta en silencio. El paciente reclamó por mail cinco días
  después.

## Los caminos por los que se cierra una consulta sin "Finalizar"

| Camino | Dónde vive | `cierre_origen` |
|---|---|---|
| Desconexión de 2 min sin retorno | `/api/consulta-estado` y `/api/turno-estado` | `desconexion` |
| La sala de video quedó vacía | `/api/livekit/webhook` (`room_finished`) | `webhook_video` |
| Quedó abierta > 4 h (repaso nocturno) | `/api/cron/cerrar-huerfanas` | `cierre_automatico` |
| Backstop diario de rejoin | `/api/cron/rejoin-expirar` | `rejoin_expirado` |

Ninguno miraba el borrador. Ninguno avisaba a nadie.

## Lo que se hizo

### 1. Un solo lugar compartido

`src/lib/consultas/cerrar-con-rescate.ts`. Dado un encuentro que **acaba de ser
cerrado automáticamente**:

1. Lee su `doc_borrador`.
2. Si tiene contenido clínico real (diagnóstico, receta, indicaciones,
   certificado, orden o días de reposo — strings vacíos no cuentan), emite los
   documentos con **el mismo criterio que el cierre normal del médico**: mismos
   tipos, mismos campos, mismo fallback (si no hay ningún documento pero sí
   diagnóstico, se emite como indicaciones), misma omisión de la receta cuando el
   paciente no tiene CUIL.
3. Los sella por el mismo motor de firma (`sellarDocumento` → hash canónico
   SHA-256 + RSA-SHA256 + log encadenado en `firma_logs`).
4. Guarda la evolución si el borrador la tiene y el encuentro no tenía.
5. Deja registro del rescate en `consultas.rescate_borrador` / `turnos.rescate_borrador`.
6. Avisa: al paciente (push "tus documentos ya están disponibles"), al médico
   (mensaje interno + push, para que revise) y al equipo (`sendDoctoAlert`).
7. Si **no** hay contenido, no inventa nada: solo lo marca y avisa igual — una
   consulta pagada que terminó sin documentación es exactamente lo que hay que
   detectar en horas, no en cinco días.

### 2. Atribución honesta de la firma

Camino nuevo `firmarDocumentoPorRescate` en `src/lib/firma/documento.ts`, con
método de atribución `rescate_borrador`. Mismo motor, mismo log, misma identidad
congelada que los demás caminos. Lo único distinto es que el registro dice la
verdad: el profesional **redactó** el contenido desde su sesión autenticada (el
autoguardado la verificó en cada PATCH), pero **no confirmó al cerrar**. El log
lo guarda explícito en `contexto.confirmado_por_el_profesional_al_cerrar: false`.
Por eso el rescate siempre le avisa para que revise.

### 3. Idempotencia sin locks nuevos

El `UPDATE ... WHERE estado = 'en_curso' RETURNING id` de cada camino **es** el
mutex: solo el que efectivamente cerró el encuentro rescata. Si el webhook de
video y el polling del paciente se disparan casi a la vez, uno solo cierra y uno
solo emite. Como cinturón adicional, el helper vuelve a chequear que no existan
documentos clínicos del encuentro antes de emitir.

### 4. El rescate nunca frena el cierre

El rescate corre **después** de que el estado ya cambió, y su entrada pública no
lanza excepciones jamás: cualquier fallo se loguea, se alerta por mail y se
devuelve como resultado. Un error del rescate no puede dejar consultas abiertas
para siempre.

### 5. Repaso de lo ya perdido

`scripts/rescatar-borradores-perdidos.ts` — **modo simulación por defecto**.
Busca encuentros ya cerrados, pagados, sin documentos y con borrador con
contenido, y emite lo que quedó guardado. No se corrió en esta rama.

```
npx tsx scripts/rescatar-borradores-perdidos.ts              # simulación
npx tsx scripts/rescatar-borradores-perdidos.ts --aplicar    # emite de verdad
```

Por defecto avisa **solo al equipo**: mandarle un push a un paciente por una
consulta de hace dos meses es una decisión de producto, no un efecto colateral de
correr un script (`--avisar-a-todos` para incluir paciente y profesional).

## Extensiones de alcance (decide Diego)

Todas son consecuencia técnica del ticket, pero se reportan igual:

1. **`/api/turno-estado`** también cierra por desconexión (el ticket nombraba
   cuatro caminos y este era el gemelo de `consulta-estado` para turnos). Se
   cableó igual, y de paso se le agregaron `completada_at` y `cierre_origen`, que
   no escribía: sus cierres quedaban sin hora ni firma de quién cerró.
2. **`/api/cron/rejoin-expirar`** tampoco escribía `completada_at` ni
   `cierre_origen`. Ahora sí (`rejoin_expirado`), y el valor se agregó al mapa de
   etiquetas del panel admin.
3. **`/api/cron/cerrar-huerfanas`**: su `UPDATE` masivo no estaba condicionado por
   `estado = 'en_curso'` ni devolvía filas. Ahora sí — hacía falta para saber cuáles
   cerró de verdad, y de paso evita re-cerrar lo que se cerró entre el SELECT y el
   UPDATE.
4. **`WorkspaceConsulta`**: el insert de documentos del cierre normal no chequeaba
   error y el borrador se borraba a renglón seguido. Si el insert fallaba, se perdía
   todo sin rastro. Ahora, si falla, **el borrador no se borra** (queda recuperable,
   a mano o con el script) y el cierre se hace igual para no trabar al paciente.
5. **Protección de la carrera "Finalizar" vs. webhook de video** (obligatoria: sin
   esto el rescate podía duplicar documentos). Cuando el médico toca "Finalizar",
   el borrado de la sala dispara `room_finished`, que puede cerrar el encuentro
   milisegundos antes de que el guardado en background del médico corra. Tres
   piezas lo resuelven:
   - `/api/livekit/crear-sala` (DELETE) marca `cierre_origen = 'medico'` **antes**
     de borrar la sala: es la intención del médico, registrada del lado del servidor.
   - el webhook, si ve esa marca, cierra como siempre pero **no rescata** (la
     emisión es del flujo del médico) y no pisa la firma del cierre.
   - `WorkspaceConsulta`, si encuentra el encuentro ya cerrado, **ya no descarta
     todo con un `return` mudo**: guarda igual, salvo que ya existan documentos
     de ese encuentro. El estado y la firma del cierre no se re-escriben.

## Migración

`supabase/migrations/20260808_rescate_borrador.sql` — **va antes del deploy del
código**. Ensancha el CHECK de `firma_logs.metodo_atribucion` y agrega la columna
`rescate_borrador` a `consultas` y `turnos`.

Si el código sale primero, el rescate **igual entrega los documentos** (que es lo
que importa), pero salen sin sello y el mail de alerta lo dice con todas las
letras. La columna `rescate_borrador` tiene fallback: si no existe todavía, la
constancia se anota dentro del propio `doc_borrador`.

## Lo que queda pendiente

- **Reabrir una consulta cerrada para reenviar documentos.** El CEO lo pidió;
  quedó fuera de este alcance (`workspace/page.tsx` solo admite `pagada` y
  `en_curso`). Con el rescate en producción es menos urgente, pero sigue siendo
  la herramienta que le falta al médico para corregir lo enviado.
- **Correr el repaso de lo ya perdido** contra producción, primero en simulación.
