# Sellado de integridad diferido — documentos emitidos antes del sellado automático

**Fecha:** 07/08/2026
**Base:** dictamen legal del 07/08/2026 (segunda parte) + decisión operativa del CEO.
**Sustituye en lo pertinente** al criterio de la mañana, que recomendaba no sellar
(registrado en `2026-08-07-firma-electronica-hallazgo-y-remediacion.md`, punto 5).

> ## ⚠️ DECISIÓN DEL CEO — 09/08/2026: NO se avisa a los profesionales
>
> Este documento recomendaba, en el punto 6, avisarle a cada profesional
> alcanzado. **Diego decidió que no se avisa.** La recomendación queda registrada
> abajo tal como se escribió, pero **no se ejecuta**.
>
> Su razonamiento, que rechaza la premisa del punto 6 y no solo la conclusión:
>
> - **No hubo acto unilateral que ratificar.** El sello no creó ninguna
>   obligación nueva ni cambió una sola condición del contrato con el
>   profesional. La firma del art. 5 ya había ocurrido al emitir; el sello es
>   evidencia de esa firma. Encuadrarlo como "acto unilateral de la plataforma"
>   es un error de encuadre.
> - **Fue un bug nuestro, y lo arreglamos.** El sello tendría que haberse
>   aplicado en el momento de la emisión. No aplicarlo fue una falla de
>   ejecución; aplicarlo después restituye el estado que siempre debió existir.
>   Es lo mismo que un paciente que hoy puede descargar su certificado: lo tiene
>   como lo debió tener desde el principio.
> - **Avisar genera dudas donde hay certezas.** Un mail explicando firmas y
>   sellos sobre documentos que están bien instala una sospecha que hoy no existe
>   en ninguno de los cuatro profesionales. Nadie reclamó nada.
> - Es una **decisión comercial y estratégica**, y como tal es del CEO.
>
> **Consecuencias operativas:**
> - Las filas de `sellado_diferido_avisos` **no son una deuda de notificación**.
>   Quedan como registro de qué profesionales abarcó cada lote — dato útil por sí
>   mismo. `enviado_at` en NULL significa "no se avisó", no "falta avisar".
> - No corre ningún plazo de 10 días hábiles: no hay nada que consolidar.
> - **Tampoco queda en pie la revocación automática por objeción** (decisión de
>   Diego del 09/08, en la misma línea). El documento recomendaba comprometerse
>   de antemano a revocar el sello de quien objetara. No se asume ese compromiso:
>   el sello acredita algo que efectivamente pasó, y no se va a deshacer por
>   regla. Si alguna vez alguien plantea algo, lo resuelve Diego en ese momento.
> - A los pacientes tampoco se avisa (ya estaba decidido así).

---

## 1. La decisión y por qué

Los documentos médicos emitidos antes de que la firma electrónica se ejecutara
quedaron sin sello criptográfico. **Tienen que quedar sellados.**

El argumento es de fondo y no de conveniencia: esos documentos **no son falsos**.
Los emitió un profesional real, con matrícula verificada contra REFEPS e identidad
validada biométricamente, en una consulta que efectivamente ocurrió y que el
paciente pagó. La ausencia de sello es **una falla de la plataforma, no un defecto
del acto médico**. Dejarlos marcados como "sin sello electrónico de verificación"
hace que un documento legítimo parezca sospechoso ante una farmacia o un
empleador, y castiga al paciente y al profesional por un error nuestro.

---

## 2. Encuadre — cómo se llama y qué certifica

**Término preciso: "sellado de integridad diferido"** (consolidación criptográfica
de una firma electrónica preexistente).

**NO se llama:** "firma retroactiva", "regularización", "refirmado", "backdating".
Ninguno de esos términos aparece en el código, ni debe aparecer en mails, tickets
ni comunicaciones.

Lo que salva la operación es que hay **dos cosas distintas**:

- **La firma electrónica (art. 5, Ley 25.506)** ocurrió **al emitirse**. El
  profesional, identificado biométricamente y con matrícula validada, cerró la
  consulta desde su sesión autenticada con el contenido a la vista. El art. 5 es
  tecnológicamente neutro: no exige criptografía. Ese acto fue la firma.
- **El sello criptográfico** (RSA-SHA256 + log de no repudio) es **evidencia** de
  esa firma, y se aplica ahora. No la crea ni la reemplaza.

Frase de registro:

> "Docto aplicó con posterioridad a la emisión un sello criptográfico de
> integridad y atribución sobre documentos médicos que ya habían sido firmados
> electrónicamente por el profesional, en los términos del art. 5 de la Ley
> 25.506, al emitirlos desde su sesión autenticada. El sello no constituye ni
> sustituye la firma: acredita que el contenido registrado corresponde a ese
> profesional y que no fue alterado desde el instante en que el sello se aplicó,
> cuya fecha y hora reales constan en el registro de no repudio y en la página
> pública de verificación."

**Qué certifica el sello**

1. Que el contenido y la identidad impresa que hoy se registran corresponden a ese
   documento y a ese profesional según los registros de Docto.
2. Que desde el instante del sellado el contenido no cambió (cualquier edición
   posterior rompe la verificación).
3. La atribución al profesional, sostenida en el acto de emisión.

**Qué NO certifica, y en ningún lado se afirma**

1. Que el profesional haya ejecutado un acto de firma en el instante del sellado.
   **No lo hizo**, y el log lo dice con todas las letras
   (`firmado_por_el_profesional_en_este_instante: false`).
2. Integridad **criptográfica** entre la emisión y el sellado. Esa ventana está
   cubierta por otra evidencia: la fila de `documentos` es insert-only y ninguna
   ruta de la aplicación edita contenido clínico (todas las escrituras a
   `documentos` son `insert`).
3. Fecha cierta de la firma en la fecha de emisión.
4. **Firma digital** de los arts. 7 y 8 de la Ley 25.506. Las presunciones de
   autoría e integridad **no se invocan**, ni hoy ni antes: es firma electrónica,
   art. 5.

**Punto que conviene tener escrito:** en Docto las claves privadas **siempre**
fueron custodiadas por la plataforma (`medico_claves.clave_privada_enc`,
desencriptadas del lado del servidor). Ninguna firma del sistema fue jamás
"ejecutada" por el profesional con una clave en su poder: todas las aplica la
plataforma atribuyéndolas a su sesión. Entre una firma `sesion_medico` y una
diferida, **la diferencia es el instante, no la naturaleza del acto**.

---

## 3. Cómo se concilia con la honestidad

| Dónde | Qué se muestra |
|---|---|
| **Base + log de no repudio** | `firmado_at` = instante REAL del sellado. Más la fecha de emisión, la marca de sellado diferido, la constancia de que el profesional no firmó en ese instante, el motivo, el lote y la autorización. La verdad completa, siempre. |
| **Página pública `/verificar/[id]`** | Las DOS fechas —emisión y sello— con la explicación en criollo. Es donde un tercero verifica de verdad. Ahí no se oculta nada. |
| **PDF** | La misma leyenda que cualquier documento firmado, **sin fecha de sellado**. El PDF no afirma en ningún lado que la firma criptográfica ocurrió en la fecha de emisión: simplemente no la menciona. |

**Por qué el PDF puede no distinguir, en una línea:** el pie **no afirma ninguna
fecha de firma**, y no decir una fecha no es mentir sobre ella. Afirma el mecanismo
(firma electrónica, art. 5) y el nombre del firmante, y ambas cosas son verdaderas
desde la emisión. Además el propio papel lleva impreso el camino a la verdad
completa: el QR, a 3 cm de la leyenda, y la línea que invita a usarlo.

**Consecuencia obligatoria, ya ejecutada:** el sello con QR imprimía debajo la
fecha y hora de la firma. Si se dejaba, el documento histórico salía con la fecha
de hoy bajo el QR —justo lo que no se quiere— o sin ella, y esa ausencia lo
marcaba como distinto. Por eso **la fecha bajo el QR se eliminó para TODOS los
documentos**, incluidos los que se firman al emitirse. Bajo el QR ahora dice
"Verificar autenticidad".

*Costo real y aceptado:* el farmacéutico deja de ver la fecha de firma en el papel.
Sigue viendo la **fecha de emisión con hora** en el encabezado, que es la
clínicamente relevante: la que define la vigencia de una receta y el rango de un
reposo.

**Texto del pie (único, para todo documento sellado):**

> Firmado electrónicamente por {profesional} en los términos del art. 5 de la Ley 25.506.
> Verificá este documento escaneando el código QR o en docto.com.ar/verificar/{id}

La dirección va **completa, con el id del documento** — la misma que codifica el QR.
La primera versión imprimía `/verificar` a secas, y esa ruta **no existía: devolvía
404**. Es la vía impresa alternativa al QR, y es sobre ella que se apoya la decisión
de no imprimir la fecha del sello: el papel lleva impreso el camino a la verdad
completa. Tenía que funcionar. El que no puede escanear —un empleador con el papel,
una farmacia sin cámara— tipeaba y caía en un error, y el documento quedaba
pareciendo *menos* verificable que antes. El id tampoco está impreso en ningún otro
lado del documento, así que un buscador sin id no lo salvaba. `/verificar` a secas
ahora **también existe**, con un buscador por id, para el que copia la dirección
cortada.

**Texto de la página pública**, bajo el título "SOBRE LAS FECHAS DE ESTE
DOCUMENTO", con las filas "Emitido" y "Sello electrónico aplicado":

> El contenido es el original. Lo que se agregó después fue el sello que permite verificarlo.
>
> Este documento se emitió antes de que Docto aplicara el sello electrónico en
> forma automática. El sello se agregó después, sobre el mismo contenido que el
> profesional emitió y entregó ese día: por eso las dos fechas son distintas. La
> primera es la del acto médico; la segunda, la del sello que permite verificarlo
> en esta página. El documento no fue modificado.

El estado sigue siendo **"Documento verificado"** en verde: no hay nada anómalo que
advertir. Las dos filas de fecha se muestran **siempre**, también en los documentos
firmados al emitirse — así el bloque no es un caso especial que salta a la vista, y
que en el caso normal las dos fechas coincidan es la mejor prueba de que Docto no
juega con las fechas.

**El subtítulo verde no puede decir "desde entonces" en un sellado diferido.** La
frase ata la integridad al instante que el lector tenga en la cabeza, y tres bloques
más abajo esta misma página le muestra la fecha de **emisión**: afirmaría justo lo
que el sello NO certifica (punto 2 de "qué NO certifica"). Con sello diferido dice
"…no fue alterado **desde que se aplicó el sello**"; con sello al emitir, "desde
entonces", que ahí es exacto.

**El pie legal de la página tampoco puede contradecir a la tarjeta.** Decía que "los
documentos anteriores a agosto de 2026 no llevan sello": corrido el backfill eso es
falso, y se leía a 200px de una tarjeta verde que muestra un documento de junio con
su sello. El pie ahora describe el mecanismo y nada más; el estado del documento
concreto lo dice la tarjeta, con las dos fechas. Vive en un solo lugar
(`src/app/verificar/PieLegal.tsx`) para que no vuelva a divergir.

---

## 4. Qué queda registrado en `firma_logs`

`metodo_atribucion = 'sellado_diferido_plataforma'`. El valor dice las dos cosas
que importan: que fue posterior y que lo aplicó la plataforma.

- `firmado_at` = **instante real del sellado** (reloj del servidor, UTC).
- `otp_id`, `ip` y `user_agent` en `null`: **no se inventa una IP**, no hubo request
  del profesional. Quién ejecutó el sello va en `contexto.aplicado_por`.
- `firmante` = snapshot completo del profesional + `habilitado_al_emitir` +
  `clave_creada_para_sellado_diferido` si el par se generó recién.
- `contexto` = las circunstancias del documento **más**: `sellado_diferido`,
  `emitido_at`, `dias_entre_emision_y_sellado`, `aplicado_por`,
  `firmado_por_el_profesional_en_este_instante: false`,
  `acto_de_voluntad_original`, `motivo`, `autorizacion`, `lote_id`, `lote_total`,
  `identidad_origen` e `identidad_verificada_contra_emision: false`.

Ese último campo es deliberado y honesto: la identidad impresa se congela desde las
tablas **vivas** de médicos y pacientes, que no tienen `updated_at`. No hay forma de
probar que el nombre o la obra social de hoy son los del día de la emisión. **Se
declara el límite en vez de simularlo.**

`firma_logs` es append-only: el aviso a los profesionales y sus respuestas no
pueden guardarse en la fila. Van en `sellado_diferido_lote` /
`sellado_diferido_avisos`, referenciadas por `lote_id`.

---

## 5. Qué NO se sella

Quedan fuera del lote, y van a revisión manual o a nada:

- Tipos no clínicos (filas de tracking de la tabla `documentos`).
- Documentos de cuentas de prueba, **del profesional o del paciente**. El filtro es
  bilateral, misma convención que `src/lib/insights/filtro-test.ts`: mirar solo la
  bandera del médico dejaba pasar las pruebas hechas con una cuenta de paciente
  interna contra médicos reales. Esos documentos se habrían sellado como actos
  clínicos genuinos, habrían sumado al total del lote y le habrían disparado al
  profesional el aviso de que "sus documentos ya se pueden verificar" por algo que
  fue una prueba.
- Documentos sin consulta ni turno asociado.
- Documentos cuyo profesional **no estaba validado (REFEPS + identidad) al momento
  de emitir**, o cuya validación no es computable. **Estos no se sellan: se
  revisan a mano.** Es el límite más estricto del dictamen y el script lo aplica
  sin excepción ni bandera para saltearlo — los reporta uno por uno.
- Documentos ya sellados: no se re-sella nunca (guard `firma_digital IS NULL`).

---

## 6. Riesgos que quedan y qué los mitiga

1. **No existe consentimiento documentado del profesional** para que Docto firme
   por él (`aceptaciones_legales` nunca recibió una fila `tyc_medico`). Es el riesgo
   más serio. Mitigación: **avisar a los profesionales** —la notificación sin
   objeción funciona como ratificación— y crear el T&C de firma para adelante.
2. **Repudio** ("yo nunca firmé eso"). Mitigación: log encadenado + consulta
   realizada + pago acreditado + documento entregado ese día. La evidencia se
   sostiene sola y no depende de ningún aviso previo.
   ~~Regla operativa: si un profesional objeta, se revoca el sello de ese
   documento.~~ **NO SE ADOPTA** (Diego, 09/08/2026): no se asume de antemano el
   compromiso de deshacer un sello que acredita algo que efectivamente pasó. Un
   planteo concreto lo resuelve Diego en el momento.
3. **Documento con un error que el profesional hubiera querido corregir queda
   congelado.** Mitigación: ventana de 10 días hábiles para observar antes de
   considerar el lote consolidado.
4. **Identidad impresa que cambió entre emisión y sellado.** No es detectable.
   Declarado en el log, no afirmado en ningún lado.
5. **Profesional sin clave activa.** Si el par se genera ahora, queda registrado
   como tal. No se oculta.

**~~Aviso a los profesionales: obligatorio.~~ NO SE EJECUTA — ver la decisión del
CEO del 09/08/2026 al principio de este documento.** El texto original decía:
"es lo que convierte un acto unilateral de la plataforma en algo ratificado; mail
individual, firma Valentina, sin explicación técnica, con vía de objeción a
soporte@docto.com.ar y plazo de 10 días hábiles". Diego rechazó la premisa: no
hubo acto unilateral porque no se creó ninguna obligación nueva — se corrigió un
bug que dejaba sin sello documentos ya firmados.

**A los pacientes no se avisa.** Un mail masivo sobre firmas convierte un problema
invisible en uno visible y alarma sin necesidad. Si alguno pregunta, la página de
verificación ya lo explica.

---

## 7. Límite duro — lo que no se puede hacer en ningún caso

1. **Ningún campo puede contener una fecha de firma anterior a la real.** Ni en
   `firma_digital.firmado_at`, ni en `firma_logs.firmado_at`, ni en el PDF, ni en
   la verificación, ni en exports, mails o reportes. Es el límite que sostiene todo
   lo demás, y está reforzado en la base: `firma_logs` tiene un CHECK que impide
   que una fila declare una firma anterior a su propia inserción, y un trigger que
   rechaza un sellado diferido cuya emisión sea posterior al sello.
2. **El PDF no puede afirmar que el sello se aplicó en la fecha de emisión.**
   Callar la fecha es lo aprobado; enunciarla, no.
3. **No invocar firma digital (arts. 7 y 8).** Es firma electrónica, art. 5.
4. **No ocultar el sellado diferido en `/verificar`.** Si por cualquier motivo el
   bloque de las dos fechas no se pudiera mostrar, **no se sella**.
5. **No sellar** lo enumerado en el punto 5.
6. **No re-sellar ni firmar dos veces**, y **no tocar `firma_logs`**: sin UPDATE,
   sin DELETE, sin "corregir" una fila.
7. ~~**No atribuir la firma a un profesional sin darle vía de objeción**, y
   revocar el sello del documento del que objete.~~ **NO SE ADOPTA** (Diego,
   09/08/2026): ver la decisión al principio del documento.
8. **No reenviar los PDFs sellados a los pacientes** como si fueran documentos
   nuevos. Quedan disponibles en la descarga, nada más.

---

## 8. Cómo se ejecuta

1. Aplicar `supabase/migrations/20260807_sellado_diferido.sql` **antes** del
   backfill. Sin ella el log rechaza el método nuevo y no se sella nada.
2. Simular: `npx tsx scripts/sellar-documentos-historicos.ts`
   (no escribe nada; imprime cuántos se sellarían y por qué se saltean los demás).
3. Ejecutar: `npx tsx scripts/sellar-documentos-historicos.ts --aplicar`
   Es reanudable e idempotente: si se corta, se vuelve a correr el mismo comando.
4. ~~Avisar a los profesionales alcanzados~~ — **NO se avisa** (decisión del CEO,
   09/08/2026). Las filas de `sellado_diferido_avisos` quedan como registro del
   alcance de cada lote, no como deuda pendiente.
5. Revisar a mano lo que quedó fuera por validación no computable.

Tres garantías del backfill sobre el registro de alcance, que valen aunque la
corrida se corte a la mitad:

- **La fila de aviso se escribe apenas se sella el primer documento de cada
  profesional**, no al final. Si se escribía al cierre, un corte dejaba documentos
  sellados y cero filas de aviso — y al relanzar esos documentos ya no son
  candidatos (el filtro pide `firma_digital IS NULL`), así que sus profesionales no
  volvían a aparecer nunca y quedaban fuera del registro de notificación.
- **Un documento que falla no frena a los demás, ni siquiera cuando lanza.** El
  sellado no solo devuelve error: puede tirar excepción (una clave privada
  encriptada con otra `FIRMA_MASTER_KEY`, un PEM corrupto). Sin captura por
  documento, un solo profesional en ese estado abortaba la corrida entera, y como
  los candidatos se leen ordenados por fecha de emisión, cada reintento moría en el
  mismo documento: la operación no se podía completar nunca.
- **El reporte cuenta los profesionales del LOTE, no los de la corrida**, leyéndolos
  de `sellado_diferido_avisos`. Un lote se reanuda; contar solo la corrida hacía que
  el operador que relanza viera menos profesionales de los que hay que avisar, sin
  forma de enterarse de la diferencia.

`--limite` valida su argumento y **falla cerrado**: escrito con espacio en vez de
`=`, o con un typo, aborta con un error en vez de procesar el lote completo.

El estado `sin_sello` del PDF y de la página **se conserva**: sigue siendo la verdad
para cualquier falla futura.

---

*Criterio asistido por IA, no asesoramiento legal vinculante. El encuadre del art. 5
y el tratamiento de los certificados de reposo ameritan OK de laboralista
matriculado antes de cualquier afirmación pública de oponibilidad.*
