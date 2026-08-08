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
   diagnóstico, se emite como indicaciones), y las mismas **dos omisiones**:
   - **receta sin CUIL del paciente** — no se puede emitir;
   - **certificado sin días de reposo** — los días son un dato jurídico
     obligatorio (art. 210 LCT) y el cierre normal los exige. El autoguardado
     persiste `dias_reposo: null` mientras el profesional todavía no eligió el
     chip, así que el caso es frecuente: escribe el cuerpo, sigue hablando más de
     5 s, se corta la llamada. Emitirlo igual habría mandado —y sellado con la
     matrícula del profesional— un certificado que dice "0 días de reposo
     laboral", texto que nadie escribió.

   Las dos omisiones se marcan en el resultado y se dicen en el aviso al médico y
   en el mail del equipo, con el dato que falta y qué hacer.
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

Ese mutex serializa a los **cerradores entre sí**, pero no cubre al médico
emitiendo por el camino normal: el overlay de corte le ofrece "Finalizar
consulta" justo mientras corre el reloj de 2 minutos, así que las dos cosas
pueden pasar en el mismo segundo. Eso se resuelve con dos guardas
complementarias, una por cada orden posible de la carrera:

| Quién llega primero | Quién emite | Guarda |
|---|---|---|
| El médico (el DELETE de la sala deja `cierre_origen = 'medico'`) | El flujo del médico | Los cierres **en vivo** (webhook, `consulta-estado`, `turno-estado`) ven la marca y cierran **sin rescatar** |
| El cierre automático (deja `cierre_origen` = `desconexion` / `webhook_video` / …) | El rescate | `WorkspaceConsulta` ve que la cerró un camino automático y **no inserta**: el borrador queda intacto |

Entre las dos, exactamente uno de los dos caminos emite. Los **crons** son la
excepción deliberada: cierran horas después, cuando el guardado en background del
profesional ya murió, así que ignoran la marca y rescatan igual (ahí la red es el
chequeo de documentos ya emitidos).

### 3.b. El repaso de "cerrado y nunca entregado"

El espejo del problema original: el profesional **sí** apretó "Finalizar", pero
el guardado de documentos —que corre en background, después del redirect al
dashboard— nunca terminó (cerró la pestaña, el navegador del celular congeló la
página de fondo, el insert falló). El encuentro queda cerrado *por el médico*,
con el borrador entero adentro y el paciente sin nada. Ningún cierre automático
lo ve, porque ya está cerrado.

`rescatarLoEscritoQueNuncaSeEntrego()` lo barre desde el cron nocturno
`cerrar-huerfanas`: encuentros cerrados, **cobrados** (`mp_status = 'approved'`),
con contenido clínico escrito y sin un solo documento clínico emitido. Con una
hora de gracia (para no pisar un guardado en background que todavía corre),
ventana de 7 días y tope por corrida. Es además el reintento de cualquier rescate
en vivo que se haya caído: mientras el encuentro siga sin documentos, sigue
siendo candidato.

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
     todo con un `return` mudo**: guarda igual, salvo que lo haya cerrado un
     camino automático (que ya rescató) o que ya existan documentos **clínicos**
     de ese encuentro. El estado y la firma del cierre no se re-escriben, y la
     evolución se guarda siempre — es la versión que el profesional revisó y
     confirmó, y pisa a la que el rescate haya guardado sin validar.

## Correcciones de la revisión adversarial

Sobre el primer envío de esta rama:

1. **Certificado de reposo sin días — se emitía con "0 días".** Bloqueante: el
   rescate mandaba y sellaba un certificado laboral con un texto que el
   profesional nunca escribió. Ahora se omite y se avisa (ver punto 1 arriba).
2. **Duplicación de documentos en la carrera "Finalizar" vs. cierre por
   desconexión.** Bloqueante: el mutex serializaba a los cerradores entre sí pero
   no al médico. Resuelto con las dos guardas complementarias del punto 3.
3. **El guard de `WorkspaceConsulta` contaba filas de tracking.** `documentos`
   también guarda filas `documento_medico` (adjuntos que el médico manda por mail
   durante la consulta): un adjunto del minuto 10 hacía descartar todo lo
   escrito. Ahora filtra por tipos clínicos, y un error al consultar significa
   "no emitir" (el borrador queda, el repaso nocturno lo levanta).
4. **La marca `cierre_origen = 'medico'` fallaba en silencio y creaba un punto
   ciego.** Ahora el UPDATE chequea resultado y filas afectadas, y el caso "cerró
   como médico pero nunca emitió" lo levanta el repaso de 3.b.
5. **Trabajo no acotado sin `maxDuration`.** Los cuatro caminos que ahora emiten,
   firman y mandan mails/pushes lo declaran (`consulta-estado`, `turno-estado`,
   webhook de LiveKit: 60 s; los dos crons: 300 s). En los crons el rescate pasó
   al **final** de la corrida, para que un timeout no se lleve puesta la
   recuperación de consultas pagadas colgadas, y quedó con tope por corrida.
6. **Spam de alertas.** El mail de "se cerró sin documentación" —el caso
   frecuente del paciente que no apareció— pasó a `sendDoctoAlertThrottled` (6 h).
   Y al profesional ese caso le llega como aviso `info` sin push, en vez de una
   alerta `alta` que lo interpelaba por un no-show.
7. **`--limite 5` (con espacio) en el script procesaba TODO.** Mismo bug que ya
   había mordido en `sellar-documentos-historicos.ts`. Ahora toda opción con
   valor vacío corta la corrida.
8. **El filtro de "pagado" del script estaba documentado pero no implementado.**
   Ahora exige `mp_status = 'approved'` de verdad, y el reporte muestra el cobro
   de cada candidato.

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
