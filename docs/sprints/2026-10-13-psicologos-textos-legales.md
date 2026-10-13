# Psicólogos F4 — textos legales y páginas públicas: propuestas (13/10/2026)

Grupo "legal-landing" del barrido F4 (`docs/sprints/2026-10-13-psicologos.md`). **Acá no se cambió código**: los textos legales (consentimiento informado, términos y condiciones) y las páginas públicas (pie de página, landing para profesionales) se proponen y los aprueba Diego, con el abogado donde se indica. Para los médicos no cambia nada hasta que se apruebe; lo único que por naturaleza cambiaría para todos son los documentos públicos únicos (T&C, pie, landing), y está marcado.

Convenciones:
- **Hoy** = lo que dice el archivo en `main` al 13/10 (números de línea de esa versión).
- **Propuesta** = texto completo listo para pegar cuando es corto; para los T&C, redacción sugerida para que el abogado la revise, no para publicar tal cual.
- **Decide** = Diego (copy y producto) · Abogado (alcance legal, marco normativo) · Diego + abogado.
- **[número verificado]** = marcador que quedó SIN uso. Regla de Diego del 13/10 (versión final): Docto no atiende emergencias en ninguna especialidad; los textos **nuevos** no publican números de teléfono (no sabemos si están actualizados); los números que ya estaban publicados (107 / 911) se quedan, y **todo** texto de emergencias suma "o el servicio de emergencias de tu zona" (`src/lib/legal/lineas-emergencia.ts`, `CLAUDE.md` § "Reglas de todo texto que ve un usuario").

**Estado (13/10, tarde):** Diego aprobó todo ("ok lo legal"). Implementado en la rama `feat/psicologos-f5-legal`: §1 consentimiento de psicología (`psi-v1`, versión fijada por el servidor), §2 T&C del paciente, §4 pie y §5 landing (estos dos, condicionados al flag `registro_psicologos`, como dice §6). §3 T&C del profesional por el camino A está escrito y sin publicar, en `docs/legal/terminos-profesional-psicologos.patch` (`git apply` lo publica, con la fecha de vigencia a corregir), y espera DECISIONES 1.15: su §11 promete avisar con 15 días cualquier modificación. Hallazgo al implementar §1: la página y la API del consentimiento de TURNO comparaban `turnos.paciente_id` (que es `pacientes.id`) contra el `user_id`, así que ningún paciente de turno llegaba a firmarlo: la vuelta de Mercado Pago (info médica → consentimiento) terminaba en el inicio. Corregido en el mismo PR, y esto cambia el después del pago de **todo** turno, también de médicos: info médica → consentimiento (leer hasta el final + tilde) → confirmación. El pago simulado de las cuentas de prueba recorre ahora el mismo camino.

---

## 1. Consentimiento informado del paciente

### 1.1 Dónde está y cómo funciona hoy

| Pieza | Archivo:línea | Hoy |
|---|---|---|
| Componente (texto + tilde) | `src/components/ConsentimientoInformado.tsx:12` | `const TEXTO_VERSION = "v1"` fijo; se manda al API en el POST (L45). |
| Título | `…ConsentimientoInformado.tsx:80` | «Consentimiento informado para teleconsulta médica» |
| Subtítulo de la pantalla | `…ConsentimientoInformado.tsx:71` | «Leé el siguiente texto antes de iniciar tu consulta.» |
| Limitaciones | `…ConsentimientoInformado.tsx:87` | «…el profesional no puede realizar examen físico directo, tomar signos vitales ni efectuar procedimientos… Esto puede afectar el alcance del diagnóstico y las indicaciones.» |
| Derivación | `…ConsentimientoInformado.tsx:89` | «…según su criterio clínico, que tu situación requiere atención presencial…» |
| Registro de datos | `…ConsentimientoInformado.tsx:91` | «…incluyendo diagnóstico, indicaciones, recetas y cualquier documentación clínica generada…» |
| Emergencias | `…ConsentimientoInformado.tsx:95` | «Esto NO es un servicio de emergencias. Docto es una plataforma de telemedicina electiva. Ante una emergencia o urgencia médica, llamá al SAME (107) o dirigite al centro de salud más cercano.» Sin línea de crisis ni de salud mental. |
| Marco legal | `…ConsentimientoInformado.tsx:99` | «Ley 27.553 (art. 7), Ley 26.529 (arts. 5 y 6), Resolución 581/2022…» |
| Texto del tilde | `…ConsentimientoInformado.tsx:111` | «Declaro que comprendí las condiciones de esta teleconsulta y presto mi consentimiento informado para realizarla.» |
| Página del turno | `src/app/turno/[turnoId]/consentimiento/page.tsx:44` | Busca `texto_version = "v1"` para saltear la pantalla si ya lo aceptó; lee de `turnos` solo `paciente_id` (L31). |
| Página de la consulta inmediata | `src/app/consulta/[id]/consentimiento/page.tsx:44` | Igual, con `consulta_id`. **No cambia**: un psicólogo nunca tiene consulta inmediata (restricción en la base desde F1). |
| API | `src/app/api/consentimiento/route.ts:52` | Inserta `texto_version: textoVersion ?? "v1"`: guarda lo que manda el cliente, sin validar. |
| Tabla | `supabase/migrations/20260520_consentimientos_informados.sql:9` | `texto_version TEXT NOT NULL DEFAULT 'v1'`, sin CHECK. |

Cómo se llega: `crear-v2` (pago) → `info-medica` → `consentimiento` → confirmación. El paciente lo ve **después de pagar** (la secuencia no se toca acá).

Qué está mal para psicología: el paciente de un psicólogo lee que va a una "teleconsulta médica", con examen físico, diagnóstico y recetas; firma eso; y la única línea de emergencia es el SAME, justo en la profesión cuyo riesgo propio es una crisis (es el motivo por el que no hay consulta inmediata de psicología, sprint L9).

### 1.2 Propuesta de texto — consentimiento para psicología (borrador completo)

Se muestra **solo** cuando la ficha del profesional del turno es de psicología. El texto médico queda idéntico, letra por letra.

> **Consentimiento informado para atención psicológica a distancia**
>
> Antes de iniciar tu sesión, es importante que leas y aceptes lo siguiente:
>
> **Modalidad de atención.** La sesión que estás por realizar se lleva a cabo a distancia, mediante videollamada, a través de la plataforma Docto, con un profesional de la psicología matriculado. No implica la presencia física del profesional.
>
> **Limitaciones de la atención a distancia.** La atención psicológica por videollamada tiene limitaciones propias de la distancia: el profesional no puede intervenir en persona ni acompañarte físicamente si durante la sesión te sentís mal, y la comunicación depende de la calidad de la conexión y de la privacidad del lugar desde donde te conectás. Elegí un espacio tranquilo y privado.
>
> **Alcance.** En Docto la atención psicológica es solo para personas mayores de 18 años. El profesional no emite recetas, órdenes de estudios ni certificados médicos. Si necesitás una evaluación médica o un tratamiento con medicación, te va a orientar para que consultes a un médico.
>
> **Derivación.** El profesional puede determinar, según su criterio profesional, que tu situación requiere atención presencial, una evaluación médica o psiquiátrica, o un dispositivo de mayor contención. En ese caso te lo va a indicar durante la sesión y podrá orientarte sobre los pasos a seguir.
>
> **Registro de datos y secreto profesional.** Los datos de la sesión —la evolución que registra el profesional en tu historia clínica y la constancia de atención, si se emite— se almacenarán en la plataforma conforme a la Ley 25.326 de Protección de Datos Personales. Los datos de salud son tratados como datos sensibles con las máximas medidas de seguridad. Lo que compartas en la sesión está protegido por el secreto profesional; la constancia de atención no incluye contenido clínico. Docto se encuentra inscripto ante la Agencia de Acceso a la Información Pública (AAIP) bajo el legajo RL-2026-36086505 y ante el Registro Nacional de Plataformas Digitales de Salud (ReNaPDiS) como Plataforma 0270.
>
> **Derecho a interrumpir.** Podés interrumpir o abandonar la sesión en cualquier momento, sin necesidad de justificación.
>
> **Esto NO es un servicio de emergencias ni de atención en crisis.** Docto es una plataforma de atención electiva, con turno. Si estás pensando en hacerte daño, si sentís que no podés mantenerte a salvo o si alguien está en peligro, no esperes al turno: llamá al **[número verificado]** (línea de atención en crisis y salud mental, las 24 horas), al **SAME (107)** o al **911**, o dirigite a la guardia más cercana.
>
> **Videollamada no grabada.** La videollamada no es grabada ni almacenada por Docto.
>
> Marco legal: Ley 23.277 (ejercicio profesional de la psicología) y su Decreto 905/1995, Ley 26.657 (Salud Mental), Ley 26.529 (arts. 5 y 6), Ley 27.553 (art. 7), Ley 25.326. *[lista a confirmar por el abogado]*

Textos de la pantalla alrededor del cuadro (condicionales, misma regla):
- Subtítulo (L71): «Leé el siguiente texto antes de iniciar tu sesión.»
- Tilde (L111): «Declaro que comprendí las condiciones de esta sesión de atención psicológica a distancia y presto mi consentimiento informado para realizarla.»
- Botón (L131) «Acepto y continuar» y los mensajes de error: iguales.

Notas para el bloque de emergencias:
- **Antes de publicar hay que verificar los números** contra la fuente oficial (Ministerio de Salud de la Nación / organismo que opere la línea) y anotar en este doc qué línea es, su alcance (nacional o AMBA) y la fecha de verificación. Si hay una línea nacional y una de CABA, se pone la nacional y se evalúa con el abogado si vale sumar la local. Hasta entonces el marcador queda y la pantalla **no se abre**.
- El SAME 107 y el 911 ya están publicados en el producto (`TerminosContent.tsx:16`, `triage/page.tsx:433`); se mantienen.
- La frase "no esperes al turno" es a propósito: la atención psicológica en Docto es solo con turno, y la crisis no debe quedar esperando ese turno.

**Decide:** Diego (copy entero) + abogado (bloque de alcance y derivación, marco legal, redacción del bloque de emergencias y si la Ley 26.657 exige algo más en el consentimiento).

### 1.3 Versionado: "v1" para médicos, "psi-v1" para psicología

Por qué hace falta una versión propia: `consentimientos_informados.texto_version` es la prueba de **qué texto** aceptó el paciente. Si el psicólogo mostrara otro texto pero el registro dijera "v1", el registro afirmaría que aceptó el texto médico. Y al revés: la página saltea la pantalla si encuentra un "v1" para ese turno, así que un paciente podría no ver nunca el texto de psicología. (Mismo principio que el dictamen del 20/07, `docs/legal/2026-07-20-reintento-biometria-sin-reconsentimiento.md`: el servidor verifica la versión vigente, no fabrica aceptaciones.)

Propuesta (para quien lo implemente; no está hecho):

1. **Una sola fuente de verdad** para la versión, p. ej. `src/lib/legal/consentimiento-version.ts`:
   `versionConsentimiento(profesion) → esPsicologia(profesion) ? "psi-v1" : "v1"`. Nunca una cadena escrita a mano en tres archivos (regla de los helpers de `CLAUDE.md`).
2. **`turno/[turnoId]/consentimiento/page.tsx`** (la única página que lo tiene que buscar: la consulta inmediata no existe para psicología):
   - Leer `medico_id` del turno en una **query aparte** (`.from("turnos").select("medico_id").eq("id", turnoId)`), no sumando la columna al `select("paciente_id")` que ya corre en producción (regla del 22/06).
   - `profesionDeLaFicha(admin, { medicoId })` (service role, query propia).
   - Buscar el consentimiento existente con `texto_version = versionConsentimiento(profesion)` en vez de `"v1"` (L44).
   - Pasar `profesion` al componente por prop.
3. **`ConsentimientoInformado.tsx`**: prop `profesion?: string | null` (opcional; sin prop = médico, texto y versión de hoy). Elige el bloque de texto y manda `textoVersion: versionConsentimiento(profesion)`.
4. **`/api/consentimiento/route.ts`** (hoy guarda lo que le mandan): validar que `textoVersion` esté en el conjunto permitido (`"v1"`, `"psi-v1"`) y, mejor, **recalcularla en el servidor** a partir de la profesión del profesional del turno, para que el registro no dependa del cliente. Si no coincide con lo que el cliente mandó, 400.
5. **Base:** `texto_version` es `TEXT` sin CHECK → no hace falta migración, ni en la base institucional (allí no hay psicólogos; la lectura de profesión devuelve médico y todo sigue en "v1").
6. **Cuando cambie el texto médico** se sube a "v2" y el de psicología a "psi-v2" por separado: cada texto tiene su propia versión.

`consulta/[id]/consentimiento/page.tsx` no se toca.

**Decide:** Diego (el nombre "psi-v1" y que la versión la fije el servidor). Es lógica, no texto: no cambia nada para los médicos.

---

## 2. Términos y Condiciones del paciente — `src/app/terminos/TerminosContent.tsx`

Documento **único y público** (`/terminos`, el triage lo embebe en L339 y `ModalTerminos` también): no hay profesión que leer al mostrarlo, así que **cualquier cambio acá lo ven todos**. Por eso la propuesta es hacerlo **neutro** (cubrir las dos profesiones) y no bifurcarlo. Cambiarlo implica subir la "Versión vigente desde" (L10) y "Última actualización" (L166); el abogado dice si hace falta notificar (§12 promete 15 días de aviso ante cambios significativos).

| # | Línea | Hoy | Propuesta (borrador para el abogado) | Decide |
|---|---|---|---|---|
| 2.1 | L26 | «…profesionales de la salud habilitados para realizar consultas médicas a distancia mediante videoconferencia, en el marco de la Ley 27.553…» | «…profesionales de la salud habilitados —médicos y psicólogos— para realizar consultas y sesiones a distancia mediante videoconferencia, en el marco de la Ley 27.553 y demás normativa aplicable a cada profesión.» | Diego + abogado |
| 2.2 | L27 | «La relación médico-paciente se establece exclusivamente entre el profesional y el paciente. Docto no ejerce la medicina ni presta servicios médicos directamente.» | «La relación profesional-paciente se establece exclusivamente entre el profesional y el paciente. Docto no ejerce la medicina ni la psicología, ni presta servicios de salud directamente.» | Diego + abogado |
| 2.3 | L16 y L29-38 (emergencias) | «No es un servicio de emergencias ni urgencias médicas… llamá al SAME (107)…»; la lista ya incluye «Crisis de salud mental con riesgo…» (L36) pero la salida es solo 107/ambulancia/guardia. | L16: «…No es un servicio de emergencias, urgencias ni atención en crisis. Ante una urgencia o emergencia, llamá al SAME (107) o al 911, o concurrí al centro de salud más cercano. Ante una crisis de salud mental, llamá al [número verificado].» · L38: sumar al final «Ante una crisis de salud mental o pensamientos de hacerse daño, el paciente puede además comunicarse con la línea de atención en crisis [número verificado], las 24 horas.» Mismos marcadores y misma verificación que §1.2. | Diego + abogado |
| 2.4 | L40 | «…complementario a la atención médica presencial. El profesional de la salud determinará, según su criterio clínico…» | «…complementario a la atención presencial. El profesional determinará, según su criterio profesional…» | Diego |
| 2.5 | L43-46 (§3.1) | «La teleconsulta en Docto es un acto médico real: un profesional habilitado te atiende… y puede diagnosticar, indicar tratamiento o emitir una receta cuando corresponda.» | Mantener el párrafo para médicos y sumar uno: «Cuando te atiende un psicólogo, la sesión es un acto profesional de atención psicológica a distancia: el profesional no emite recetas, órdenes de estudios ni certificados médicos, y puede orientarte a una consulta médica o presencial si tu situación lo requiere. La atención psicológica en Docto es solo para mayores de 18 años.» El título §3 pasaría de «Salud y atención médica» a «Salud y atención profesional». | Diego + abogado |
| 2.6 | L49 (§3.2) | «…tu consentimiento para que el acto médico se realice de forma remota…» | «…para que el acto profesional (médico o psicológico) se realice de forma remota…» | Abogado |
| 2.7 | L50 (§3.2) | «Los documentos que se generen en tu consulta (receta, indicaciones, constancias)…» | Ya nombra constancias: queda. Es el único lugar donde aparecen; §7 no las nombra (2.8). | — |
| 2.8 | L95-102 (§7; 7.2 en L101-102) | Título «Recetas y documentos médicos digitales»; 7.2 «…indicaciones médicas, órdenes de estudios y certificados médicos… bajo la exclusiva responsabilidad profesional del médico interviniente». La constancia de atención del psicólogo no figura. | Título: «Recetas y documentos digitales». En 7.2 cambiar «del médico interviniente» por «del profesional interviniente» y sumar un 7.4: «**Constancia de atención psicológica.** Cuando te atiende un psicólogo, el profesional puede emitir una constancia de atención firmada electrónicamente, que acredita que asististe a una sesión en una fecha y hora determinadas. La constancia no incluye contenido clínico, protegido por el secreto profesional. Su emisión es una decisión del profesional y requiere que hayas participado de la sesión.» (La última frase refleja la regla de F3: sin registro de presencia no se emite.) | Diego + abogado |
| 2.9 | L125 (§9) | «Utilizar la plataforma para fines distintos a la consulta médica legítima.» | «…fines distintos a la atención de salud legítima.» | Diego |
| 2.10 | L133-134 (§10) | «…diagnósticos o tratamientos indicados por los profesionales de la salud.» / «Los resultados de los tratamientos médicos seguidos por el paciente.» | «…diagnósticos, tratamientos o intervenciones indicados por los profesionales de la salud.» / «Los resultados de los tratamientos o procesos terapéuticos seguidos por el paciente.» | Diego |
| 2.11 | L68 (§5) | «El contenido de sus diagnósticos, indicaciones terapéuticas y recetas.» | «El contenido de sus diagnósticos, indicaciones terapéuticas, recetas, evoluciones y constancias.» | Diego |
| 2.12 | L117 (§8) | «Los datos clínicos (diagnósticos, recetas, indicaciones, historia clínica) se conservan por un plazo mínimo de 10 años…» | Sumar «evoluciones» a la lista. El plazo (art. 18, Ley 26.529) aplica igual a la historia clínica del psicólogo; lo confirma el abogado. | Abogado |

No se propone tocar §6 (pagos, cancelaciones): aplica igual a una sesión de psicología, y el ítem «Consulta Inmediata — ningún profesional la toma…» no le aplica a quien nunca pide una.

---

## 3. Términos y Condiciones del profesional — `src/app/terminos-medico/TerminosMedicoContent.tsx`

Los acepta el profesional al registrarse (`registro-medico/actions.ts:408` guarda `terminos_aceptados_at`; en el formulario F1 la profesión ya se conoce). El título (L7, «…para Profesionales de la Salud») ya es neutro. Se ve también desde `/terminos-medico` y `ModalTerminos` (perfil "medico").

**Dos caminos**, lo decide Diego con el abogado:
- **A — Un solo documento, neutro, con un párrafo propio para psicología** (recomendado: un solo texto que mantener, el registro de psicología ya nace con el documento correcto, y los médicos que ya aceptaron no pierden nada porque sus obligaciones no cambian).
- **B — Un documento aparte** (`/terminos-psicologo`, `TerminosPsicologoContent.tsx`), elegido por la profesión del formulario de registro. Más limpio jurídicamente si el abogado prefiere no mezclar regímenes; cuesta un archivo más y un `perfil` nuevo en `ModalTerminos`.

Propuestas de redacción (sirven para A; para B, el mismo texto en su archivo):

| # | Línea | Hoy | Propuesta (borrador para el abogado) | Decide |
|---|---|---|---|---|
| 3.1 | L17 | «…ejercés la medicina bajo tu propia matrícula, responsabilidad y criterio clínico.» | «…ejercés tu profesión —medicina o psicología— bajo tu propia matrícula, responsabilidad y criterio profesional.» | Abogado |
| 3.2 | L18 | «Docto no ejerce la medicina ni interviene en las decisiones clínicas.» | «Docto no ejerce la medicina ni la psicología, ni interviene en las decisiones clínicas o terapéuticas.» | Abogado |
| 3.3 | L25 | «Cumplís con los requisitos legales para el ejercicio de la telemedicina conforme a la Ley 27.553…» | «…para el ejercicio de tu profesión a distancia conforme a la Ley 27.553 y la normativa aplicable a tu profesión (para psicología, la Ley 23.277 y su reglamentación).» *[marco a confirmar]* | Abogado |
| 3.4 | L34 | «Toda decisión clínica adoptada durante una teleconsulta — incluyendo diagnósticos, indicaciones terapéuticas, prescripción de medicamentos y derivaciones — es de tu exclusiva responsabilidad profesional.» | «Toda decisión clínica o terapéutica adoptada durante una teleconsulta o sesión — incluyendo diagnósticos, indicaciones, prescripción de medicamentos (solo médicos), evoluciones, constancias y derivaciones — es de tu exclusiva responsabilidad profesional.» | Abogado |
| 3.5 | L35 | «Docto no responde por actos médicos… La relación médico-paciente se establece…» | «Docto no responde por actos profesionales, omisiones ni por los resultados de los tratamientos o procesos terapéuticos. La relación profesional-paciente se establece exclusivamente entre vos y el paciente.» | Abogado |
| 3.6 | L38 | «…normas éticas, legales y de buena práctica médica vigentes.» | «…normas éticas, legales y de buena práctica de tu profesión vigentes.» | Diego |
| 3.7 | L40 | «No utilizar la plataforma para atender emergencias ni urgencias médicas.» | «No utilizar la plataforma para atender emergencias, urgencias ni situaciones de crisis; ante una, orientar al paciente a los servicios de emergencia.» | Diego + abogado |
| 3.8 | L41 | «Completar la documentación clínica de cada consulta (diagnóstico, indicaciones y, si corresponde, receta) antes de finalizarla.» El psicólogo documenta evolución y, si corresponde, constancia; el producto no le pide indicaciones ni receta. | «Completar la documentación clínica de cada atención antes de finalizarla: en medicina, diagnóstico, indicaciones y, si corresponde, receta; en psicología, la evolución y, si corresponde, la constancia de atención.» | Diego + abogado |
| 3.9 | L44-48 (§4) | «Recetas digitales y firma electrónica»; el consentimiento a la firma electrónica (art. 5, Ley 25.506) se presta «en todos los documentos que generes… incluyendo recetas, indicaciones médicas e informes». La constancia se firma con ese mecanismo y no está nombrada. | Título «Documentos digitales y firma electrónica». L47: «…en todos los documentos que generes en la plataforma, incluyendo recetas, indicaciones, informes, certificados y constancias de atención.» Y un párrafo: «**Constancia de atención (psicología).** Podés emitir una constancia de atención, firmada electrónicamente, que acredita la asistencia del paciente a una sesión en una fecha y hora determinadas, sin contenido clínico. Su emisión es una decisión tuya; la plataforma la habilita solo cuando registró la participación del paciente en la sesión.» | Abogado (es la base legal de la firma de la constancia) |
| 3.10 | L75 (§8) | «Tratar los datos de los pacientes exclusivamente para la finalidad de la atención médica.» | «…para la finalidad de la atención de salud que prestás.» | Diego |
| 3.11 | L82 (§9) | «Las consultas pendientes al momento de la baja…» | «Las consultas y sesiones pendientes…» | Diego |
| 3.12 | Nuevo (en §3) | — | «**Psicología: alcance.** Si sos psicólogo, atendés únicamente con turno programado (la consulta inmediata no está disponible para tu profesión), solo a pacientes mayores de 18 años, y no emitís recetas, órdenes de estudios ni certificados médicos a través de la plataforma.» (Refleja las decisiones del 13/10 y lo que la base ya impide.) | Diego + abogado |

Los médicos que ya aceptaron: en el camino A sus obligaciones no cambian (solo se nombra la otra profesión). Que esto no exija re-aceptación lo confirma el abogado; si la exige, el camino B evita tocarles el documento.

---

## 4. Pie de página — `src/components/Footer.tsx`

Pie global del sitio: lo ve también el paciente de un psicólogo. **No hay profesión que leer**: todo cambio es para todos. Propuesta para el momento de **abrir el flag (F5)**, no antes (hasta entonces no hay psicólogos y el texto de hoy es verdad).

| Línea | Hoy | Propuesta | Decide |
|---|---|---|---|
| L40 | «Plataforma de telemedicina argentina. Conectamos pacientes con médicos para consultas virtuales.» | «Plataforma de telemedicina argentina. Conectamos pacientes con médicos y psicólogos para consultas virtuales.» | Diego |
| L5 y L15 | Link «Buscar médico» → `/clinica` | «Buscar profesional» (la clínica ya tiene el selector «Médicos · Psicología» desde F2) | Diego |
| L16 | Columna «Médicos» (link «Sumate a Docto») | «Profesionales» | Diego |
| L88 | «Emite certificados médicos digitales, incluido el de reposo laboral…» | Queda: sigue siendo verdad para los médicos. | — |

---

## 5. Landing para profesionales — `src/app/medicos/page.tsx`

Página pública (`/medicos`), sin profesión que leer; de acá sale el registro (que con el flag ofrece Médico/a · Psicólogo/a). Propuesta para **F5**.

| Línea | Hoy | Propuesta | Decide |
|---|---|---|---|
| L39 | «Tus pacientes te eligen a vos, no a “un médico disponible”» | «Tus pacientes te eligen a vos, no a “un profesional disponible”» | Diego |
| L46-48 (tarjeta Consulta Inmediata) | «Te ponés disponible y atendés al instante · Activás disponibilidad cuando tenés tiempo libre. Los pacientes te encuentran.» Un psicólogo que se registra desde acá espera algo que no va a tener. | Agregar a la descripción: «Solo para médicos: en psicología se atiende con turno.» (o una leyenda chica bajo la tarjeta). | Diego |
| L262-264 (Nova) | «Armá tu agenda, consultá tus turnos del día o dictá una receta en voz alta. Nova la confecciona y, cuando confirmás, queda firmada electrónicamente.» Promesa falsa para un psicólogo. | «Armá tu agenda, consultá tus turnos del día o, si sos médico, dictá una receta en voz alta: Nova la confecciona y, cuando confirmás, queda firmada electrónicamente. En psicología, la constancia de atención se emite al cerrar la sesión.» | Diego |
| L67 (pasos) | «Completás tu perfil (matrícula, especialidad, foto)» | Queda: vale para los dos. | — |

Al margen (no es hallazgo del barrido): la ruta se llama `/medicos` y el componente `MedicosLanding`; para un psicólogo la URL ya dice "médicos". Si Diego quiere, un alias `/profesionales` que redirija es un cambio de una línea en F5.

---

## 6. Resumen de decisiones

| Qué | Quién | Cuándo |
|---|---|---|
| Texto completo del consentimiento de psicología (§1.2) y los números de las líneas de crisis verificados | Diego + abogado | Antes de abrir el flag (bloquea F5) |
| Versión "psi-v1" fijada por el servidor (§1.3) | Diego | Se implementa con el texto aprobado |
| T&C del paciente: neutro, con 7.4 constancia y crisis en emergencias (§2) | Diego + abogado | Antes de abrir; cambia para todos |
| T&C del profesional: camino A (uno neutro) o B (uno por profesión) y las cláusulas (§3) | Diego + abogado | Antes de abrir el registro de psicólogos |
| Pie y landing (§4, §5) | Diego | Al abrir (F5); hasta entonces el texto de hoy es verdad |

Lo que no está verificado y se dice tal cual: los números de las líneas de salud mental; que la Ley 23.277 / Decreto 905/1995 y la Ley 26.657 sean el marco correcto para citar en el consentimiento; si tocar los T&C exige notificar o re-aceptar.
