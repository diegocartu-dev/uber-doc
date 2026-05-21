# Auditoría Legal — Firma Electrónica Interna (Sprint Bus Fase 2)

**Fecha:** 21 de mayo de 2026
**Auditora:** Dra. Carolina (consultora legal salud digital)
**Alcance:** Implementación de firma electrónica interna en Docto para prescripciones médicas
**Marco normativo principal:** Ley 25.506 (arts. 5 y 6), Ley 27.553, Decreto 98/2023
**Principio aplicado:** NO over-comply — citar solo lo que la ley textualmente requiere

---

## Nota preliminar sobre el encuadre legal

La Ley 25.506 distingue dos figuras:
- **Firma digital** (art. 2): requiere certificado emitido por certificador licenciado por AC-ONTI. Presunción de autoría e integridad (arts. 7 y 8). Inversión de la carga probatoria.
- **Firma electrónica** (art. 5): "el conjunto de datos electrónicos [...] utilizados como medio de identificación del firmante". NO requiere certificador licenciado. Tiene valor probatorio (art. 5), pero la carga de acreditarla recae en quien la invoca (art. 5 in fine).

Docto implementa **firma electrónica** (art. 5), no firma digital. Esto es legalmente válido para prescripciones conforme la Ley 27.553, que exige "firma digital o electrónica" sin privilegiar una sobre otra. El Decreto 98/2023, reglamentario de la Ley 27.553, en su Anexo II (Ministerio de Salud) establece que las plataformas de prescripción pueden implementar firma electrónica con mecanismos propios de autenticación. Docto sigue el mismo camino que otras plataformas registradas ante ReNaPDiS.

La clave: al usar firma electrónica, Docto NO es un certificador licenciado y NO debe presentarse como tal. Es una plataforma que implementa un mecanismo de firma electrónica interno para sus profesionales registrados.

---

## 1. Sello PDF — Texto legal

### Texto propuesto por el equipo
```
Firmado electrónicamente conforme Art. 5 Ley 25.506
Plataforma 0270 — ReNaPDiS RL-2026-48984072
```

### Análisis [BLOQUEANTE]

**Cita de Ley 25.506 art. 5:** Correcto. Es la norma que define firma electrónica y le otorga validez. Esta cita es imprescindible.

**¿Mencionar Ley 27.553?** No. La Ley 27.553 habilita la prescripción electrónica/digital, pero el sello refiere al *mecanismo de firma*, no al acto de prescribir. Agregar la 27.553 no suma valor legal al sello y aumenta superficie de inspección. El inspector de ReNaPDiS ya sabe que la plataforma opera bajo 27.553 porque está registrada. No es necesario recordárselo en cada receta.

**¿Mencionar Decreto 98/2023?** No, por la misma razón. El decreto reglamenta la ley; citarlo en el sello es redundante y over-comply.

**Número ReNaPDiS:** El formato `RL-2026-48984072` parece un número de legajo AAIP, no de inscripción ReNaPDiS. Verificar cuál es el identificador correcto de plataforma ante ReNaPDiS. En los TyC actuales se usa "Plataforma 0270" como número ReNaPDiS y `RL-2026-36086505` como legajo AAIP. El sello debe usar el dato correcto.

### Texto final aprobado

```
Firmado electrónicamente — Art. 5, Ley 25.506
Docto | Plataforma 0270 — ReNaPDiS
```

**Justificación de los cambios:**
- Se eliminó "conforme" por innecesario — la cita basta.
- Se agregó "Docto" para identificar la plataforma emisora (trazabilidad).
- Se dejó solo "Plataforma 0270 — ReNaPDiS" sin número de legajo AAIP. El sello identifica la plataforma ante el sistema de salud, no ante la AAIP. No mezclar registros.
- El número de legajo AAIP (RL-2026-36086505) ya figura en los TyC y la Política de Privacidad — no duplicar en cada PDF.

**Acción requerida:** Confirmar que `0270` es efectivamente el número asignado por ReNaPDiS a Docto. Si el número es otro, corregir en el sello Y en los TyC/footer.

---

## 2. OTP Modal — Copy de consentimiento de firma

### Análisis [BLOQUEANTE]

El momento en que el médico ingresa el OTP y confirma es el acto de firma electrónica. Jurídicamente, el médico está:
1. Asumiendo autoría del contenido de ESA receta específica.
2. Manifestando su voluntad de firmar electrónicamente en los términos del art. 5 de la Ley 25.506.
3. Ejerciendo prescripción electrónica conforme Ley 27.553.

El texto debe ser conciso (es un modal, no un contrato) pero jurídicamente completo. El médico debe entender qué está firmando y qué implica.

### Texto final aprobado

**Título del modal:** `Firmar receta electrónicamente`

**Cuerpo:**

```
Ingresá el código de 6 dígitos enviado a tu email para firmar esta receta.

Al confirmar, declarás que:

• Revisaste y aprobás el contenido de esta prescripción.
• Asumís responsabilidad profesional sobre su contenido como médico/a firmante.
• Firmás electrónicamente esta receta conforme al Art. 5 de la Ley 25.506.

Esta acción no puede deshacerse.
```

**Label del input:** `Código de verificación`

**Botón de confirmar:** `Firmar receta`

**Botón de cancelar:** `Cancelar`

**Justificación:**
- "Esta prescripción" / "esta receta": vincula la firma a un documento específico, no genérico. Esto es importante para la validez del art. 5.
- "Responsabilidad profesional": el médico es responsable del contenido clínico. Docto no firma — el médico firma. Esta distinción es clave.
- NO se menciona Ley 27.553 ni Decreto 98/2023 en el modal. El médico no necesita una clase de derecho sanitario para firmar. La cita del art. 5 Ley 25.506 es suficiente para constituir el acto de firma electrónica.
- "No puede deshacerse": advertencia operativa necesaria.

---

## 3. Página de verificación pública (/verificar/{id})

### 3.1 Anonimización del paciente [BLOQUEANTE]

**Datos mostrados:** Iniciales + últimos 3 dígitos del DNI.

**Análisis:** La anonimización es suficiente para los fines de verificación. La Ley 25.326 (art. 2) define dato personal como "información referida a personas físicas o de existencia ideal determinadas o determinables". Iniciales + 3 dígitos del DNI NO permiten determinar la identidad del paciente por sí solos — se necesitaría cruzar con otra base de datos, lo cual excede el concepto de "determinable" del art. 2.

**Veredicto:** Permitido. La anonimización parcial (iniciales + últimos 3 dígitos DNI) es adecuada para una página de verificación cuyo propósito es confirmar la autenticidad del documento, no identificar al paciente.

### 3.2 Mostrar medicación prescripta [BLOQUEANTE]

**Análisis:** Este es el punto más delicado. La medicación prescripta constituye dato de salud (dato sensible, art. 2 Ley 25.326). Mostrarla en una página pública, aun con paciente anonimizado, presenta dos problemas:

1. **Riesgo de re-identificación:** Si alguien conoce al paciente (ej: familiar, empleador) y tiene el link de verificación, puede inferir condiciones de salud por la medicación. Clonazepam → trastorno de ansiedad. Antirretrovirales → HIV. El riesgo es real.

2. **Principio de minimización (art. 4 inc. 1, Ley 25.326):** Los datos tratados deben ser "adecuados, pertinentes y no excesivos en relación con el ámbito y finalidad para los que se hubieran obtenido". La finalidad de la página de verificación es confirmar que la receta es auténtica, NO exhibir su contenido clínico.

**Veredicto:** NO mostrar la medicación en la página pública de verificación. Mostrar solo:
- Que existe una receta válida firmada electrónicamente
- Nombre del profesional, matrícula, especialidad
- Paciente anonimizado (iniciales + 3 últimos dígitos DNI)
- Fecha y hora de emisión
- Hash criptográfico y estado de validación
- Número de plataforma ReNaPDiS

**Si la farmacia necesita ver la medicación:** la receta completa ya la tiene el paciente como PDF. La página de verificación sirve para que la farmacia confirme que ESE PDF es auténtico, no para reemplazarlo.

### 3.3 Disclaimer legal en la página [SUGERIDO]

Incluir al pie de la página de verificación:

```
Este documento fue firmado electrónicamente conforme al Art. 5 de la Ley 25.506.
La verificación confirma la autenticidad e integridad de la receta.
Docto — Plataforma 0270, ReNaPDiS — docto.com.ar
```

No agregar más que eso. No mencionar AAIP, no mencionar Ley 25.326, no mencionar Ley 27.553. El propósito de la página es verificar, no educar al lector sobre el marco normativo argentino.

---

## 4. Enmiendas a TyC y Política de Privacidad

### 4.1 Términos y Condiciones [BLOQUEANTE]

**Hallazgo:** La sección 6 ("Recetas digitales") dice textualmente: *"Las recetas incluyen la firma digital del profesional"*. Esto es **incorrecto** si Docto implementa firma electrónica (art. 5 Ley 25.506), no firma digital (art. 2). La distinción no es semántica — son dos figuras legales con regímenes probatorios distintos. Si un juez o inspector lee que Docto promete "firma digital" pero implementa firma electrónica, hay un problema de veracidad.

**Acción requerida:** Corregir la sección 6 y agregar una cláusula nueva. Propuesta:

**Sección 6 corregida — "Recetas electrónicas y firma electrónica":**

```
6. Recetas electrónicas y firma electrónica

Las recetas emitidas a través de Docto son recetas electrónicas con validez legal
en todo el territorio nacional, en el marco de la Ley 27.553 y el Decreto 98/2023.

Las recetas son firmadas electrónicamente por el profesional interviniente, conforme
al Art. 5 de la Ley 25.506 de Firma Digital. Docto provee el mecanismo de firma
electrónica mediante generación de claves criptográficas y verificación por código
de un solo uso (OTP) enviado al correo electrónico registrado del profesional.

El profesional de la salud es el único firmante y responsable del contenido de cada
receta. Docto no firma las recetas ni asume responsabilidad sobre las decisiones de
prescripción. Docto actúa como plataforma tecnológica que facilita el mecanismo de
firma electrónica.

La autenticidad de cada receta puede verificarse en docto.com.ar/verificar mediante
el código incluido en el documento.

La emisión de una receta es una decisión exclusiva del profesional interviniente.
Docto no puede garantizar que toda consulta resulte en la emisión de una receta.
El paciente no tiene derecho a exigir la prescripción de medicamentos específicos.

Docto se encuentra inscripto ante el Registro Nacional de Plataformas Digitales de
Salud (ReNaPDiS) bajo el número de Plataforma 0270, y ante la Agencia de Acceso a
la Información Pública (AAIP) bajo el legajo RL-2026-36086505.
```

**Cambios clave:**
- "firma digital" → "firma electrónica" (corrección de error legal).
- Se explicita que el MÉDICO firma, no Docto.
- Se describe brevemente el mecanismo (claves + OTP) sin entrar en detalle técnico.
- Se agrega la URL de verificación.
- Se mantiene el disclaimer de que Docto no prescribe.

### 4.2 Política de Privacidad [BLOQUEANTE]

**Hallazgo:** No hay mención de los datos criptográficos (claves, hashes de firma, logs de firma electrónica). Estos son datos personales del profesional que Docto genera y almacena. La Ley 25.326 exige informar al titular qué datos se tratan.

**Acción requerida:** Agregar en la sección 2 ("Qué datos recolectamos") un nuevo inciso, y en la sección 3 ("Finalidad") la finalidad correspondiente.

**Nuevo inciso en sección 2:**

```
e) Datos de firma electrónica (profesionales)

Clave criptográfica pública del profesional, registros de firma electrónica
(fecha, hora, hash del documento firmado, resultado de verificación OTP),
y dirección de correo electrónico utilizada para la verificación OTP. La clave
privada se almacena cifrada y no es accesible en texto plano.
```

**Agregar en sección 3 (Finalidad):**

```
Datos de firma electrónica: generación y verificación de firma electrónica en
recetas y documentos clínicos conforme al Art. 5 de la Ley 25.506, y verificación
pública de autenticidad de documentos emitidos.
```

**Agregar en sección 5 (Destinatarios):**

No se requiere agregar ningún proveedor adicional si las claves se generan y almacenan en Supabase (ya listado). Si se usara un HSM o servicio externo de custodia de claves, habría que agregarlo.

**Agregar en sección 7 (Plazo de conservación):**

```
Datos de firma electrónica: los registros de firma (hash, fecha, resultado OTP)
se conservan por el mismo plazo que los datos clínicos asociados (10 años,
art. 18 Ley 26.529). La clave pública se conserva indefinidamente mientras el
profesional mantenga cuenta activa, y por 10 años después de su baja, para
permitir la verificación de documentos firmados durante su actividad.
```

### 4.3 ¿Falta sección sobre Docto como "certificador interno"? [SUGERIDO]

**Análisis:** Docto NO es un certificador licenciado en los términos de la Ley 25.506 (arts. 17-25). No necesita serlo para firma electrónica. Agregar una sección que lo presente como "certificador" sería over-comply y generaría confusión.

Lo correcto es lo ya propuesto: Docto "provee el mecanismo de firma electrónica". No es certificador. No emite certificados. Genera claves y verifica OTP. Punto.

**No se requiere sección adicional.** La redacción propuesta en la sección 6 de TyC es suficiente.

---

## 5. Política de recuperación de claves

### 5.1 Escenario: médico pierde acceso a 2FA/email [BLOQUEANTE]

**Análisis legal:**

La firma electrónica del art. 5 Ley 25.506 se basa en "la utilización de una técnica de identificación". Si el médico pierde acceso al mecanismo de identificación (email para OTP), necesita regenerar sus claves. Esto plantea dos preguntas:

**A) ¿La regeneración invalida firmas anteriores?**

No. Las firmas anteriores fueron realizadas con la clave anterior en un momento determinado. La validez de la firma electrónica depende de que al momento de firmar, el mecanismo de identificación fue correctamente utilizado. La regeneración de claves es un evento posterior que no afecta retroactivamente la validez de actos ya realizados.

**Analogía:** si un escribano pierde su sello y obtiene uno nuevo, las escrituras anteriores selladas con el sello viejo no se invalidan.

**Las recetas firmadas con la clave anterior siguen siendo legalmente válidas** siempre que:
1. Se conserve la clave pública anterior para verificación.
2. Se conserve el registro de auditoría del acto de firma.
3. La página de verificación pueda validar documentos firmados con claves anteriores.

**B) ¿Qué proceso aplicar?**

El proceso de regeneración debe equilibrar seguridad con practicidad. Propuesta:

### Proceso de regeneración de claves

**Paso 1 — Verificación de identidad del profesional:**
- El profesional solicita regeneración por canal verificable (email previo si aún tiene acceso, o soporte@docto.com.ar con verificación manual).
- Si cambió de email: Docto debe verificar identidad por al menos DOS factores independientes (ej: DNI + matrícula + pregunta de seguridad, o videollamada con documento).

**Paso 2 — Registro en auditoría:**
Antes de regenerar, registrar en tabla de auditoría:
- Fecha y hora de la solicitud
- Motivo declarado (pérdida de acceso, cambio de email, etc.)
- Método de verificación de identidad utilizado
- ID del operador que autorizó (si fue manual)
- Fingerprint de la clave pública anterior

**Paso 3 — Generación de nuevo par de claves:**
- Se genera nuevo par RSA 2048.
- La clave pública anterior se marca como `revocada` pero NO se elimina — queda disponible para verificación de documentos históricos.
- La nueva clave pública se marca como `activa`.

**Paso 4 — Notificación:**
- Enviar email al profesional confirmando la regeneración.
- Si el cambio fue por email nuevo, notificar TAMBIÉN al email anterior (si existe).

### 5.2 Conservación de claves anteriores [BLOQUEANTE]

**Regla:** NUNCA eliminar claves públicas anteriores. La clave pública anterior es necesaria para verificar la autenticidad de los documentos firmados con ella. Eliminarla haría inverificables las recetas históricas.

**Modelo de datos sugerido:**

Cada profesional puede tener múltiples claves en su historial, con estado:
- `activa`: clave vigente, usada para nuevas firmas.
- `revocada`: clave anterior, válida solo para verificación de documentos históricos.

La página de verificación (`/verificar/{id}`) debe buscar la clave correcta según la fecha de firma del documento — no asumir siempre la clave activa.

### 5.3 Evidencia mínima en log de auditoría [BLOQUEANTE]

Para cada acto de firma electrónica, el log debe conservar:

| Campo | Motivo |
|-------|--------|
| `profesional_id` | Identificación del firmante |
| `documento_id` | Identificación del documento firmado |
| `timestamp_firma` | Momento exacto del acto de firma |
| `hash_documento` | Hash SHA-256 del documento al momento de firmar |
| `clave_publica_id` | Referencia a qué clave se usó (para multi-key) |
| `otp_verificado` | Confirmación de que el OTP fue validado exitosamente |
| `ip_origen` | IP desde donde se realizó la firma |
| `user_agent` | Navegador/dispositivo (contexto forense) |

**Plazo de conservación del log:** 10 años, alineado con el plazo de conservación de datos clínicos (art. 18, Ley 26.529). El log de firma es inseparable del documento clínico que acredita.

Para eventos de regeneración de claves, el log debe conservar adicionalmente:

| Campo | Motivo |
|-------|--------|
| `evento` | `regeneracion_clave` |
| `clave_anterior_id` | Fingerprint de la clave revocada |
| `clave_nueva_id` | Fingerprint de la clave nueva |
| `motivo` | Razón declarada por el profesional |
| `metodo_verificacion` | Cómo se verificó la identidad |
| `operador_id` | Quién autorizó (si fue manual) |
| `timestamp` | Momento de la regeneración |

---

## Resumen ejecutivo

| # | Punto | Clasificación | Estado |
|---|-------|---------------|--------|
| 1 | Sello PDF | BLOQUEANTE | Texto final entregado. Verificar número ReNaPDiS. |
| 2 | OTP Modal | BLOQUEANTE | Texto final entregado. Listo para implementar. |
| 3a | Anonimización paciente | BLOQUEANTE | Iniciales + 3 dígitos DNI: suficiente. |
| 3b | Medicación en verificación | BLOQUEANTE | NO mostrar. Viola principio de minimización (art. 4 Ley 25.326). |
| 3c | Disclaimer verificación | SUGERIDO | Texto entregado. Breve, sin over-comply. |
| 4a | TyC sección 6 | BLOQUEANTE | Corregir "firma digital" → "firma electrónica". Texto entregado. |
| 4b | Privacidad — datos de firma | BLOQUEANTE | Agregar inciso e) y finalidad. Texto entregado. |
| 4c | Sección "certificador" | SUGERIDO | NO agregar. Over-comply. |
| 5a | Regeneración de claves | BLOQUEANTE | Proceso de 4 pasos definido. |
| 5b | Conservación claves anteriores | BLOQUEANTE | NUNCA eliminar. Modelo activa/revocada. |
| 5c | Log de auditoría | BLOQUEANTE | Campos mínimos definidos. Retención 10 años. |

---

## Normas citadas en esta auditoría

- **Ley 25.506** — Firma Digital (arts. 2, 5, 6, 7, 8, 17-25)
- **Ley 27.553** — Recetas Electrónicas / Telemedicina
- **Decreto 98/2023** — Reglamentación Ley 27.553, Anexo II Ministerio de Salud
- **Ley 25.326** — Protección de Datos Personales (arts. 2, 4 inc. 1, 5, 12)
- **Ley 26.529** — Derechos del Paciente (art. 18 — conservación historia clínica)

---

*Este documento es un borrador de alta calidad basado en el texto exacto de las normas vigentes. No constituye consultoría legal vinculante. Para su publicación o implementación en producción, Diego debe validar con abogado matriculado.*
