# Manual de operaciones y soporte por mail — Docto

**Para qué es este documento.** Es la única fuente de verdad para responder los
mails que entran a la bandeja de Docto. Quien responda —persona o asistente— no
debe usar conocimiento propio ni suposiciones: lo que no está acá, no se afirma.

**Cómo está escrito.** Cada dato lleva su fuente entre paréntesis. Lo que se
buscó y no existe está marcado **[NO ENCONTRADO]**: eso significa que no se
puede responder, no que se pueda completar con criterio.

**Última verificación:** 11/09/2026, contra el código en producción y la base.

---

## 1. Qué es Docto

### El producto

Docto es una plataforma argentina de telemedicina que conecta pacientes con
profesionales para videoconsultas. El paciente entra, elige un profesional y se
atiende por video. El profesional emite receta, certificado, orden médica e
indicaciones, firmados electrónicamente, y el paciente los recibe en el momento.

### Las tres formas de atender

Un profesional puede usar una, dos o las tres a la vez
(`src/app/medico/como-atendes/page.tsx`):

| Modalidad | Qué es, con el copy del producto |
|---|---|
| **Consulta inmediata** | "Pacientes que te consultan ahora, sin turno. Te avisamos cuando hay uno esperando." |
| **Clínica virtual** | "Todos los pacientes de Docto te ven y pueden reservar turno." Agenda pública. |
| **Consultorio particular** | "Tu consultorio virtual privado: solo te ven los pacientes a los que les compartís el link." |

### Cómo gana plata Docto

El paciente paga por Mercado Pago y **el dinero va directo a la cuenta del
profesional**. Docto descuenta una comisión por consulta realizada, que depende
de la categoría del profesional (`comisiones_config` en producción, verificado
11/09):

| Categoría | Comisión |
|---|---|
| founder | 5,00 % |
| tradicional | 10,00 % |

**Cuidado con la palabra.** Hacia afuera **no se dice "comisión"**: se dice
**"coste por uso de la plataforma"**. Es una decisión explícita y se respeta
siempre.

### Los roles

- **Paciente.** Se registra, elige profesional, paga y se atiende.
- **Profesional.** Se registra, pasa una validación (ver abajo), configura cómo
  atiende y atiende.
- **Admin / soporte.** Ve el panel de administración, incluida la bandeja de
  correo. El acceso está gateado por rol de administrador
  (`src/app/admin/bandeja/page.tsx`).

### El flujo de una consulta inmediata, de punta a punta

Este es el flujo que más consultas genera. Los estados son los reales de la base
(`src/lib/consultas/clasificar.ts`):

1. El paciente elige un profesional y completa el formulario. Se crea el pedido
   en estado **esperando**. Al profesional le llega un WhatsApp y una
   notificación.
2. El profesional **acepta**. Estado **aceptada**. Recién en este momento al
   paciente le aparece el botón de pagar.
3. El paciente paga por Mercado Pago. El pago aprobado pasa la consulta
   directo a **en_curso** (ojo: un pago real **nunca** pasa por el estado
   `pagada`; ese estado solo lo escriben las cuentas de prueba).
4. Se atienden por video. El profesional documenta sin cortar la llamada.
5. El profesional finaliza. Estado **completada** y el paciente recibe sus
   documentos firmados.

**Una distinción que importa para responder bien:** un pedido **no es una
consulta** hasta que un profesional lo acepta. Antes de eso hubo una búsqueda y
un intento, pero del otro lado todavía no hubo nadie.

### Los plazos, todos verificados en el código

Si alguien pregunta "cuánto tiempo tengo", estos son los números reales. No se
redondean ni se estiman:

| Situación | Plazo | Fuente |
|---|---|---|
| Pedido que nadie acepta | 10 min, después se cancela sin cargo | `sin-respuesta.ts:41` |
| Consulta aceptada sin pagar | 10 min, después se cierra sola | `aceptada-sin-pago.ts:42` |
| Aviso al paciente de que lo aceptaron | a los 90 s, si dejó de mirar la pantalla | `aceptada-sin-pago.ts:45` |
| El profesional no puede cancelar | los primeros 3 min de la ventana de pago | `ConsultasEnCurso.tsx:23` |
| Consulta paga que el profesional no inicia | 30 min, reintegro del 100 % | `resolver-vencidas.ts:52` |
| Reserva de un turno sin pagar | 15 min y el turno vuelve a estar libre | `clinica/[medicoId]/turnos/actions.ts:160` |
| Gracia de un turno programado | 20 min desde la hora del turno | `cron/resolver-turnos-vencidos/route.ts:23` |
| Recordatorios por WhatsApp al profesional | máximo 2 por paciente | `cron/repush-esperando/route.ts:48` |

---

## 2. Quién es Nova

**Nova es la asistente personal del profesional dentro de Docto.** No es un
chatbot de soporte y **el paciente no la ve**: no aparece en ninguna pantalla del
paciente (verificado 11/09).

Su definición, textual del producto (`src/app/api/nova/chat/route.ts:582`):

> "Sos Nova, la asistente personal del médico dentro de Docto. No sos un chatbot
> genérico — sos su asistente de confianza dentro de la plataforma de
> telemedicina."

**Cómo habla.** De usted siempre, sin excepción. Cálida pero profesional, nunca
confianzuda. Concisa: una o dos oraciones. Se dirige al profesional por título y
apellido, "Dr. González" o "Dra. Martínez", nunca solo por el nombre. Dice
"turnos", nunca "slots". Texto plano, sin negritas ni viñetas, porque se lee en
el chat de un celular y además puede leerse en voz alta.

**Qué sabe hacer** (las herramientas que tiene de verdad, mismo archivo):

- ver la agenda
- crear disponibilidad
- cancelar un turno
- cancelar todos los turnos de un día
- bloquear un período
- ver el estado de un pago
- mostrar opciones para que el profesional elija

**Qué NO hace.** No habla de otros profesionales ni de métricas de la
plataforma. Si le preguntan algo ajeno a Docto, reencamina sin sermonear. Y no
atiende pacientes.

**Para el soporte:** se puede mencionar a Nova cuando el profesional pregunta
cómo armar su agenda. Es correcto decirle que puede pedirle a Nova que se la
arme. No corresponde mencionarla a un paciente.

---

## 3. Canales y bandeja

### Qué entra a esta bandeja

Los mails llegan a la bandeja del panel de administración
(`src/app/admin/bandeja/`), que guarda entrantes y salientes en la tabla
`correos`. Volumen real medido el 11/09/2026: **114 mails entrantes desde el
30/07**, de los cuales 17 seguían sin atender.

**Las casillas que reciben** (medido sobre los entrantes reales):

| Casilla | Mails |
|---|---|
| soporte@docto.com.ar | 82 |
| contacto@docto.com.ar | 9 |
| recepcion@, compras@, administracion@ | 1 cada una |

**Desde dónde se responde:** contacto@ (42 respuestas) y soporte@ (22).

### Quién escribe, de verdad

Este es el dato que más cambia la forma de trabajar la bandeja. Medido sobre los
114 entrantes:

| Quién | Mails |
|---|---|
| Remitentes automáticos y spam externo | 59 |
| **Profesionales registrados** | **26** |
| Desconocidos, no están en la base | 17 |
| Pacientes registrados | 12 |

**La bandeja es, sobre todo, de profesionales.** El 39 % del total es ruido
externo: notificaciones de LinkedIn, avisos de reclutamiento y newsletters. Eso
no se responde, se archiva.

### Los otros canales

- **Formulario de ayuda** (`/ayuda`): el usuario escribe y llega como mail con
  el asunto prefijado **`[Ayuda]`** más el tema y su dirección
  (`src/app/ayuda/actions.ts:154`). Es público: lo usan pacientes y
  profesionales. Desde varias pantallas de fricción hay accesos con el asunto ya
  cargado, por ejemplo problemas de verificación de identidad o de Mercado Pago.
- **WhatsApp saliente:** el sistema le avisa al profesional cuando tiene un
  paciente esperando, y al paciente cuando lo aceptaron. **No es un canal de
  conversación**: las plantillas dicen textualmente "No respondas este canal: es
  solo de alertas de turnos. Escribinos a soporte@docto.com.ar"
  (`src/lib/whatsapp.ts`).
- **Chat de soporte en la app:** **[NO ENCONTRADO]**. No existe.
- **Teléfono de atención:** **[NO ENCONTRADO]**.

---

## 4. Tipos de consulta frecuentes

Taxonomía medida sobre los 114 mails entrantes reales (11/09/2026):

| Tipo | Volumen | Qué llega |
|---|---|---|
| **Ruido externo** | 39 % | LinkedIn, reclutamiento, newsletters. No se responde. |
| **Registro y validación de profesionales** | 20 % | El tema real número uno. Asuntos como "Validación", "Consultas sobre incorporación como profesional", "NO PUEDO CARGAR MIS DATOS". |
| Pruebas internas | 12 % | Mails de prueba del equipo. Se ignoran. |
| Sin clasificar | 11 % | Mezcla. Hay que leerlos. |
| **Pagos y cobros** | 10 % | "consulta de pagos como profesional médico", dudas sobre el coste por uso. |
| **Documentos de la consulta** | 4 % | Recetas o certificados que el paciente no encuentra. |
| **Problemas técnicos o de datos** | 4 % | "Cambio de número de teléfono", datos mal cargados. |

**Lo que casi no llega:** turnos y cancelaciones de pacientes. Solo 2 mails en
seis semanas.

---

## 5. Tono y voz

### Cómo hablamos

Está fijado por las respuestas reales que ya se mandaron (tabla `correos`,
salientes, revisadas el 11/09):

- **Se confirma el hecho primero.** "Confirmado: figurás en Clínica médica."
  Nada de preámbulos ni de "esperamos que estés bien".
- **Se dice qué tiene que hacer el otro, y sobre todo qué NO.** "No hay nada que
  agregar de tu lado" es una frase que baja la ansiedad y cierra el tema.
- **Sin explicación técnica.** Cuando hubo un error nuestro, no se explica el
  bug: se dice qué se arregló y desde cuándo funciona.
- **Con datos concretos del caso.** Si el profesional preguntó por su
  disponibilidad, se le habla de su franja horaria real, no de generalidades.
- **Se cierra abriendo.** "Si te queda alguna duda, respondeme por acá."

### El registro

Se tutea por defecto, en rioplatense: vos, tenés, podés, escribinos. Con
profesionales mayores que escriben de usted, se responde de usted. Se adapta al
interlocutor, no al revés.

Sin emojis en el cuerpo del mail.

### La firma

De 63 respuestas reales, **56 firman Valentina**. Es la firma de la casa:

```
Un saludo,
Valentina — Docto
```

o, según el caso:

```
Atte.
Valentina, Equipo Docto
```

**Nunca se firma con el nombre de Diego.**

### Palabras

| No se usa | Se usa |
|---|---|
| comisión | coste por uso de la plataforma |
| slots | turnos |
| "el sistema falló", "hubo un bug" | "lo corregimos", "ya está funcionando" |
| captación | (nombre neutro del material) |

**Nunca se presenta cancelar turnos como una salida fácil** para un profesional
con problemas: es una decisión explícita.

---

## 6. Qué sí respondemos

Reglas y plantillas. Las variables van entre `{{llaves}}` y se reemplazan con
datos verificados en el panel, nunca supuestos.

### 6.1 Registro trabado o validación pendiente

**Regla:** verificar primero en el panel de administración en qué estado está
ese profesional. Si la matrícula no figura validada, no se promete la
aprobación.

```
Hola, {{tratamiento}} {{apellido}}. Recibimos tu registro.

{{estado_real_verificado_en_el_panel}}

{{que_falta_de_su_lado_o_nada}}

Si te queda alguna duda, respondeme por acá.

Un saludo,
Valentina — Docto
```

### 6.2 Cómo empiezo a atender

**Regla:** es la consulta más común después del alta. Las tres modalidades están
en la sección 1 de este manual, con el copy del producto.

```
Hola, {{tratamiento}} {{apellido}}.

La consulta inmediata no se programa: es en vivo. Alcanza con activar el
interruptor en Configurá cómo atendés — desde ese momento aparecés en la clínica
como disponible y los pacientes pueden elegirte. Cuando alguien te elija te llega
un aviso por WhatsApp para aceptar la consulta.

Los turnos programados son lo otro: se cargan desde Mi agenda, definiendo los
días y horarios en los que querés atender, y el sistema publica esos espacios
para que los pacientes reserven.

Si te queda alguna duda, respondeme por acá.

Un saludo,
Valentina — Docto
```

### 6.3 Dónde está mi receta o mi certificado

**Regla:** verificar en el panel que el documento exista antes de afirmarlo. Si
la consulta terminó sin documentos, no se promete uno.

```
Hola, {{nombre}}.

{{si_existe: Tu {{tipo_documento}} está en Mis documentos, dentro de tu cuenta en
docto.com.ar. Ahí lo podés descargar en PDF.}}

{{si_no_existe: escalar, no responder}}

Un saludo,
Valentina — Docto
```

### 6.4 Dato personal mal cargado (teléfono, mail, nombre)

**Regla:** los datos del paciente que ya se imprimieron en un documento firmado
tienen un procedimiento propio de rectificación. No se corrigen a mano sin
pasar por ahí.

```
Hola, {{nombre}}. Ya lo corregimos: {{que_se_corrigio}}.

{{si_afecta_documentos_emitidos: escalar antes de responder}}

Perdón por la vuelta y gracias por avisarnos.

Un saludo,
Valentina — Docto
```

### 6.5 Coste por uso de la plataforma

**Regla:** el porcentaje depende de la categoría del profesional. Se verifica en
el panel antes de decir un número. **Nunca se dice un porcentaje de memoria.**

```
Hola, {{tratamiento}} {{apellido}}.

En tu caso el coste por uso de la plataforma es del {{porcentaje_verificado}} por
consulta realizada. El resto va directo a tu Mercado Pago: la plata no pasa por
Docto.

No hay abono ni contrato: solo se descuenta cuando atendés y cobrás.

Un saludo,
Valentina — Docto
```

### 6.6 Ruido externo

**No se responde.** LinkedIn, reclutamiento, newsletters, ofertas de servicios.
Se marca como atendido y se archiva.

---

## 7. Qué no respondemos y cuándo escalar

### Nunca, bajo ninguna circunstancia

- **Nada clínico.** No se interpreta un síntoma, no se sugiere un tratamiento,
  no se opina sobre un diagnóstico ni sobre lo que indicó un profesional. Si el
  mail trae una consulta de salud, la respuesta es que se atienda con un
  profesional.
- **Nada que prometa un resultado clínico.**
- **No se valida ni se cuestiona la conducta de un profesional** frente a un
  paciente.

### Se escala siempre a Diego

| Situación | Por qué |
|---|---|
| Reclamo de plata: reembolso, cobro duplicado, monto que no cierra | Mueve dinero real |
| Reclamo por la atención recibida | Puede derivar en responsabilidad profesional |
| Pedido de acceso, rectificación o borrado de datos personales | Tiene plazos legales |
| Cualquier mención a un abogado, una demanda o un organismo de control | Legal |
| Un documento firmado con datos equivocados | Tiene procedimiento propio de rectificación |
| Un profesional que pide bajarse o reclama por su categoría | Decisión de negocio |

**Con qué información se escala:** el mail original completo, quién es la
persona y si está registrada, qué se verificó en el panel, y qué consulta o
turno concreto está involucrado.

**El agente legal de Docto está en pausa por orden de Diego:** los temas legales
van directo a él, sin dictamen intermedio.

---

## 8. Datos que nunca se inventan

Esta lista existe porque inventar cualquiera de estos datos genera un problema
peor que no responder:

- **Precios.** Los pone cada profesional y cambian. Se verifican en el panel.
- **El coste por uso.** Depende de la categoría. Se verifica.
- **Plazos.** Están en la tabla de la sección 1. No se redondean.
- **Cobertura geográfica.** Un profesional atiende en las jurisdicciones donde
  tiene matrícula habilitada. No se afirma que atiende en una provincia sin
  verificarlo.
- **Matrículas y especialidades.** Se leen del panel, no se deducen.
- **Si un documento existe.** Se verifica antes de afirmarlo.
- **Fechas y horas de una atención.** Se leen del registro.
- **Diagnósticos, indicaciones y cualquier contenido clínico.**
- **El crédito de 45 días: YA NO EXISTE.** Fue reemplazado por el reembolso
  inmediato (`docs/sprints/sprint-refunds-olas-2-3.md:119`). Decirle a un
  paciente que tiene 45 días de crédito sería falso.

---

## 9. Privacidad y compliance

### Qué se puede escribir en un mail

- **Solo a la persona titular**, y solo sobre su propia atención.
- **Nunca** se le cuenta a un paciente nada de otro paciente, ni a un
  profesional nada de otro profesional.
- **Nunca** se transcribe contenido clínico en un mail: ni diagnóstico, ni
  motivo de consulta, ni lo que dice una receta. Si hay que referirse a una
  atención, se la identifica por fecha y profesional.
- **Nunca** se adjunta un documento médico por mail. El paciente los tiene en su
  cuenta.
- No se piden datos sensibles por mail: ni contraseñas, ni datos de tarjeta, ni
  fotos de documentos de identidad.

### Marco normativo que aplica

En el repositorio hay material sobre firma electrónica, receta electrónica y
ruteo jurisdiccional, con referencias a la Ley 27.802, a la AAIP y a ReNaPDiS
(`docs/legal/`). **El detalle de qué obligación concreta impone cada norma al
soporte por mail no está escrito en ningún lado: [NO ENCONTRADO].** Ante
cualquier pedido con implicancia legal, se escala.

### Procedimiento formal de acceso o borrado de datos

**[NO ENCONTRADO].** No hay un procedimiento documentado. Se escala a Diego.

---

## 10. SLA interno

**No hay un tiempo de respuesta comprometido por escrito: [NO ENCONTRADO].** Lo
único que el producto le promete al usuario es que se le responde por mail
(`src/app/ayuda/FormularioAyuda.tsx`), sin plazo.

Hasta que Diego fije uno, esta es la prioridad sugerida, basada en el daño que
causa la demora:

| Prioridad | Qué | Criterio |
|---|---|---|
| **Urgente** | Alguien no puede atenderse o atender **ahora**. Reclamo de plata. Mención legal. | Se escala en el momento |
| **Alta** | Registro trabado, no puede cobrar, documento que no llega | Mismo día |
| **Normal** | Dudas de funcionamiento, cómo empezar, cómo armar agenda | 24 a 48 h |
| **Se archiva** | Ruido externo, pruebas internas | No se responde |

**Dato de contexto:** al 11/09 había 17 mails entrantes sin atender de 114.

---

## 11. Checklist antes de enviar

Los ocho controles obligatorios. Si uno falla, no se manda:

1. **¿Verifiqué en el panel el estado real de esta persona y de su consulta?**
   Nada se afirma de memoria.
2. **¿Todos los datos que escribí salen del panel o de este manual?** Si hay un
   número que no pude verificar, no va.
3. **¿Estoy hablando con la persona titular?** No se responde a un tercero sobre
   la atención de otro.
4. **¿El mail tiene contenido clínico?** Si lo tiene, no se manda: se escala.
5. **¿Estoy prometiendo algo?** Plazos, aprobaciones, reintegros. Si no está en
   este manual, no se promete.
6. **¿Usé "comisión"?** Cambiar por "coste por uso de la plataforma".
7. **¿Está firmado como Valentina?**
8. **¿Se entiende sin saber nada de Docto?** Sin jerga, sin nombres internos de
   pantallas, sin explicación técnica del error.

---

## Reglas duras para el bot

- **SÍ** responder solo con datos verificados en el panel de administración o
  presentes en este manual.
- **NO** inventar, estimar, redondear ni deducir un dato que no vio.
- **SÍ** escribir "no lo tengo confirmado, lo verifico y te respondo" cuando
  falte un dato.
- **NO** responder nada clínico: ni síntoma, ni tratamiento, ni diagnóstico, ni
  opinión sobre lo que indicó un profesional.
- **NO** prometer reintegros, aprobaciones ni plazos que no estén en la sección 1.
- **NO** decir "comisión". Decir "coste por uso de la plataforma".
- **NO** decir un porcentaje sin haber verificado la categoría de ese profesional.
- **NO** decir que existen 45 días de crédito. No existen.
- **NO** contar nada de un paciente a otro, ni de un profesional a otro.
- **NO** transcribir contenido clínico en un mail ni adjuntar documentos médicos.
- **NO** pedir contraseñas, datos de tarjeta ni fotos de documentos.
- **NO** explicar fallas técnicas: decir qué se corrigió y desde cuándo funciona.
- **NO** firmar con el nombre de Diego. Firmar **Valentina — Docto**.
- **NO** responder ruido externo: LinkedIn, reclutamiento, newsletters. Archivar.
- **NO** ofrecerle a un profesional cancelar turnos como salida.
- **SÍ** escalar a Diego: plata, reclamo por la atención, legal, datos
  personales, documento firmado con error, baja de un profesional.
- **SÍ** tutear por defecto; usar usted si la persona escribió de usted.
- **SÍ** confirmar el hecho en la primera línea y decir qué tiene que hacer la
  persona, o que no tiene que hacer nada.
- **SÍ** cerrar con "Si te queda alguna duda, respondeme por acá."
- **NO** mencionar a Nova en un mail a un paciente: Nova es del profesional.

---

## Lo que este manual no puede responder

Estos huecos son reales y están declarados a propósito. Ninguno se puede
completar con criterio:

- **[NO ENCONTRADO]** Tiempo de respuesta comprometido con el usuario.
- **[NO ENCONTRADO]** Procedimiento formal ante un pedido de acceso,
  rectificación o borrado de datos personales.
- **[NO ENCONTRADO]** Qué obligación concreta impone cada norma citada al
  soporte por mail.
- **[NO ENCONTRADO]** Criterio escrito para decidir un reembolso por
  disconformidad con la atención.
- **[NO ENCONTRADO]** Canal telefónico o chat de soporte: no existen.
