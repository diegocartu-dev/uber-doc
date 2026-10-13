# Psicólogos en Docto — decisiones (13/10/2026) y plan

Pedido de AC Ai (Sara, 12/10): los psicólogos llegan a Docto y el registro los rebota, porque la validación de matrícula solo acepta la de médico. Diego decidió que entran, y cómo.

## Decisiones de Diego (13/10/2026)

| Tema | Decisión | Por qué |
|---|---|---|
| Cómo atienden | **Solo con turno.** Nunca consulta inmediata. Sesión con la duración que elija el profesional (50 min sugerido). | Una consulta inmediata de salud mental suele ser una crisis, y una crisis va a una guardia o a una línea de emergencia, no a una videollamada con alguien que no conoce. |
| Qué emiten | **Evolución** en la historia clínica (ya existe) y una **constancia de atención**. Nunca receta, orden de estudios, certificado ni indicaciones. | El psicólogo no receta; el paciente necesita poder justificar la sesión. |
| Cómo aparecen | **Sección propia "Psicología"** en la clínica, separados de los médicos. Título **"Lic."** en vez de Dr./Dra. | Hoy la clínica muestra a todos los profesionales de la provincia sin elegir especialidad: mezclados, quien busca un médico encontraría psicólogos. |
| Edad | **Solo pacientes adultos** al principio. | Con menores hace falta el consentimiento de los padres y otro encuadre; se suma después. |
| Verificación | Igual que el médico: biometría (Didit) + **REFEPS**, aceptando la matrícula habilitada **de psicología**. Ruteo por jurisdicción igual. | REFEPS releva más de 79 profesiones de la salud; la matrícula y el ejercicio son provinciales. |
| Coste por uso | **Igual que los médicos** (mismo esquema de categorías). | — |

### Texto aprobado de la constancia

```
CONSTANCIA DE ATENCIÓN

Dejo constancia de que {nombre y apellido del paciente},
DNI {dni}, asistió a una sesión de atención psicológica
por videollamada el {fecha} a las {hora} hs.

Lic. {nombre y apellido}
Licenciado/a en Psicología
Matrícula {tipo} {número} — {jurisdicción}
Domicilio profesional: {domicilio}

Firmado electrónicamente en Docto.
```

Lleva lo que pide el Decreto 905/1995 para las certificaciones del psicólogo (nombre, profesión, matrícula, domicilio) y nada clínico (secreto profesional).

## Lo que no está verificado

- ~~El texto exacto con el que REFEPS devuelve la profesión de psicología.~~ **Verificado el 13/10** contra el catálogo público de REFEPS (SISA → Codificaciones públicas → REFEPS → Profesiones matriculadas): son dos, el código 5 "Psicólogo" y el código 6 "Licenciado en psicología", las dos con profesión de referencia "Psicólogo". Psicopedagogos, psicomotricistas y técnicos quedan afuera. `lib/refeps/profesion.ts` reconoce exactamente eso.
- **Que el Decreto 905/1995 siga vigente y alcance a la atención por videollamada.** Es la referencia más directa que se encontró; conviene que lo mire el abogado.
- **Números de las líneas de emergencia** que se muestren en las pantallas de psicología: se verifican antes de publicarlos.

## Plan de construcción

Se arma detrás de un interruptor (flag `registro_psicologos`, apagado): cada fase se mergea y queda dormida; el registro se abre recién cuando están todas, y ahí se le avisa a Sara (`docs/respuesta-docto-buzon-sara.md`, `src/lib/bandeja/sara.ts`).

Inventario del 13/10: ~150 lugares que suponen que el profesional es médico, en registro, REFEPS, consulta inmediata, clínica, documentos, textos, edad y admin. Lo más delicado:
- **No hay columna de profesión**: todo se infiere de `especialidad` (texto libre) y `titulo`.
- **Un psicólogo validado hoy aparecería en TODAS las provincias**: `derivarJurisdicciones` descarta las matrículas que no son de médico y `habilitadoEnProvincia` lee "sin jurisdicciones" como "en todas".
- **Los permisos de `medicos` son por columna** (verificado en producción): la columna nueva necesita su GRANT SELECT o la clínica se cae entera (caída del 22/06).
- **El tipo de documento** admite hoy receta, indicaciones, certificado y orden (verificado en producción): la constancia es un tipo nuevo.
- **La fecha de nacimiento del paciente** la declara él (sin verificar) y un trigger viejo rellena `2000-01-01`.

### F1 — Base y registro · ✅ 13/10 (en producción, dormida detrás del flag)
- `medicos.profesion` (`medico` | `psicologo`, por defecto `medico`): con GRANT SELECT, en el trigger de columnas de confianza y en la re-verificación; y una restricción en la base: un psicólogo nunca queda `disponible` (consulta inmediata).
- "Psicología" en el catálogo de especialidades (no en el buscador de la landing ni en "atención general").
- Registro: elegir profesión (solo con el flag prendido); el psicólogo, título "Lic." y especialidad fija; textos neutros; sin el término de controlados (no receta).
- REFEPS por profesión: el médico solo con matrícula de médico, el psicólogo solo con la de psicología; jurisdicciones derivadas según su profesión (cierra el "todas las provincias"); «Usar esta» igual. Se reconoce la profesión de forma tolerante hasta ver el texto real.
- Matrícula única **por profesión** (hallado al construir): el índice único de la base no dejaba registrar a un psicólogo con el mismo número y provincia que un médico, y los colegios numeran cada uno por su lado.
- "Pasar a Medicina general" (Mi perfil): oculto y rechazado para el psicólogo.

Qué quedó hecho:
- Migración `20261013_medicos_profesion.sql` (espejo institucional `036`), aplicada en las dos bases y probada en transacciones que se deshicieron: el GRANT de lectura existe; la sesión del profesional no se cambia la profesión (el trigger la devuelve); cambiarla con service role invalida REFEPS y devuelve a revisión; un psicólogo no puede quedar `disponible` ni con consulta inmediata en su link; una profesión inventada se rechaza; misma matrícula en la misma profesión se rechaza y en distinta profesión se acepta. Todas las fichas existentes quedaron `medico`.
- Flag `registro_psicologos` sembrado apagado en las dos bases.
- Código: `lib/refeps/profesion.ts` (`profesionDe`, `esMatriculaDe`), `derivarJurisdicciones` y `cruzarMatricula` con la profesión de la ficha (por defecto médico: para los médicos no cambia nada), y la profesión pasada en el alta automática de REFEPS, en la reconciliación de identidad, en las dos rutas de REFEPS del admin y en «Usar esta». Tests en `matricula-refeps.test.ts`.
- Registro: con el flag prendido aparece "Profesión: Médico/a · Psicólogo/a". El psicólogo queda Lic. · Psicología, sin el término de controlados. Con el flag apagado (hoy) el formulario es el de siempre.

Revisión independiente antes del merge (13/10): con el flag apagado no cambia nada para los médicos. Lo que encontró para antes de abrir, ya corregido en el mismo PR:
- El panel de admin no recibía la profesión: «Usar esta» le habría ofrecido a un psicólogo sus matrículas de médico y escondido las de psicología.
- Cambiar la profesión con la identidad ya validada no volvía a cruzar la matrícula (quedaba congelada la de la otra profesión): ahora la base lo rechaza (`profesion_congelada`), igual que la matrícula.
- `refeps_validado` miraba solo que la persona figure y esté activa: a un psicólogo ahora le exige además una matrícula de psicología habilitada (`refepsValida`).
- El reconocimiento de la psicología pasó a lista cerrada (como la de médico): "Técnico en psicología", "Psicólogo social" o un título de especialista no cuentan. Si el texto real de REFEPS es otro, va a revisión y se suma a la lista.
- Mismo nombre y misma matrícula en dos profesiones chocaba en el slug del perfil: ahora se desempata en el medio ("…-2-MP5555").
- Queda menor: si el flag se apaga en medio de un registro de psicólogo, el error aparece en el último paso y hay que recargar.
- No usar `OVERRIDE_FLAG_REGISTRO_PSICOLOGOS` en las vistas previas: comparten la base de producción y crearían psicólogos reales.

**Textos nuevos para que apruebe Diego antes de abrir** (los ve solo un psicólogo, con el flag prendido):
- Selector: "Profesión" · "Médico/a" · "Psicólogo/a"; y "Título y especialidad: Lic. · Psicología".
- "Estos datos aparecen impresos en tus constancias." (el médico sigue viendo "recetas").
- Credencial: "…el que emite el Ministerio o el Colegio de Psicólogos" y "Subí la foto de tu credencial profesional para continuar."
- Declaración: "…soy responsable de mis actos profesionales como profesional independiente" (el médico sigue con "actos médicos").
- Firma: "Aparece impresa en cada constancia que emitas."

### F2 — Cómo atiende y cómo aparece · ✅ 13/10 (dormida: sin psicólogos registrados no se ve nada)
- Nada de consulta inmediata. La base ya lo impide desde F1 (`disponible` y `ci_en_consultorio` siempre falsos), así que `puedeAtenderAhora`, la clínica, el triage y el link propio nunca le ofrecen consulta inmediata. Además: `actualizarDisponibilidad` responde con un mensaje; el panel no muestra el bloque de consulta inmediata, ni los carteles de "Falta el valor de tu consulta" y "Activá la consulta inmediata"; "Cómo atendés" no muestra la tarjeta y su pantalla de configuración lo devuelve al hub; el aviso de demanda (piloto en pausa) solo va a médicos.
- El aviso del término de controlados del panel y el del calendario de reserva no se muestran en psicología (no receta).
- Agenda: se suma la duración de 50 minutos (para todos; no cambia nada de lo existente).
- Clínica: si en la provincia hay psicólogos, aparece el selector "Médicos · Psicología". La lista de médicos ya no los incluye, y "lo más pronto" tampoco. En la sección de psicología no hay leyenda de disponibilidad, ni botón de consulta inmediata, ni precio de consulta inmediata: solo "Agendar turno". Un paciente menor no ve la sección.
- Rescate (alternativas cuando algo se cae): solo profesionales de la misma profesión que el que se cayó.
- Solo adultos: `reservarTurno` rechaza un turno de psicología si el paciente es menor según su fecha de nacimiento (ese es el paso previo obligatorio al pago); el psicólogo no puede declarar el área "adolescencia" (ni se le muestra). Límite declarado: la fecha la escribe el paciente y no se verifica; sin fecha no se le niega a nadie. La instancia institucional asigna turnos por otro camino y no tiene esta regla (no hay psicólogos ahí).

Revisión independiente de F2 (13/10): no cambia nada hoy para médicos ni pacientes, salvo la opción "50 minutos" en la agenda, que se ve en cuanto se mergea. Corregido en el mismo PR:
- Nova le ofrecía al psicólogo "Prender consulta inmediata" (el widget y el prompt): ya no.
- El link propio (`/dr/…`) del psicólogo decía "No disponible en este momento" y "Consulta $ 0": ahora muestra solo "Agendar turno".
- Un menor que entraba por link directo veía el calendario de un psicólogo: ahora vuelve a la clínica.
- Si la lectura de la profesión fallara, la clínica separa por la especialidad ("Psicología", que es fija).
- Los turnos de cada sección cuentan solo en su sección.
Quedan para F4 (textos): la descripción del cobro en Mercado Pago ("Consulta virtual de 20 minutos" sale de la duración de la consulta inmediata), textos de "Cómo atendés" pensados para médicos, el "No disponible" de la barra del panel, y un aviso en la búsqueda de la sección Médicos cuando alguien busca "psicólogo".
La revisión encontró además dos problemas que ya existían y se arreglaron aparte el mismo día: la clínica escondía profesionales (#554) y un paciente podía confirmarse un turno sin pagar (#555).

**Textos nuevos de F2 para que apruebe Diego antes de abrir:**
- Clínica: "Médicos" · "Psicología"; "Psicólogos habilitados para tu jurisdicción"; "N psicólogos habilitados en {provincia}"; "No encontramos psicólogos para …".
- Panel: "Agendas y tu consultorio privado" (subtítulo del acceso a "Cómo atendés").
- Mensajes: "En psicología se atiende solo con turno: la consulta inmediata no está disponible."; "La atención psicológica en Docto es solo para mayores de 18 años."; "Por ahora la atención psicológica en Docto es solo para adultos."
- Agenda: "50 minutos" (este se ve apenas se mergea, para todos).

### F3 — Documentos · ✅ 13/10 (dormida: solo la ve un psicólogo)
- Tipo `constancia` en `documentos` (CHECK en las dos bases, migración `20261013_documentos_constancia.sql` + espejo `039`) y firmable (`TIPOS_FIRMABLES`).
- El texto aprobado lo arma el servidor (`lib/documentos/constancia.ts`, con tests; los datos salen de `constancia-datos.ts`): paciente y DNI, fecha y hora del turno, "Lic." + nombre, "Licenciado/a en Psicología", matrícula con jurisdicción ("MP 5555 — Córdoba"; la nacional dice "MN 12345 — Nacional") y domicilio profesional. Va entero en `contenido`, que entra al hash de la firma: no hizo falta una versión nueva de la identidad congelada.
- PDF: título "CONSTANCIA DE ATENCIÓN", el texto aprobado, la firma y el QR de verificación; sin los bloques de profesional, paciente y diagnóstico (serían los mismos datos dos veces y nada clínico). El resto de los documentos sale idéntico byte a byte (test de huellas).
- Espacio de trabajo del psicólogo: diagnóstico y evolución como siempre (historia clínica), sin receta, indicaciones, certificado ni orden, y una casilla "Emitir la constancia de atención para el paciente" que sale **tildada** (con el texto a la vista). Sin relleno de "indicaciones" en ningún camino (cierre normal, completar documentación y rescate del cierre automático). El documento de la constancia no guarda el diagnóstico.
- Si el profesional no tocó "Finalizar" y la atención se cerró sola, el rescate guarda la evolución pero no emite la constancia: se emite desde "completar documentación".
- Etiqueta "Constancia de atención" en las pantallas del paciente y del profesional, y en el mail de documentos.

Revisión independiente de F3 (13/10): con el flag apagado no cambia nada para los médicos (los PDF existentes salen idénticos byte a byte). Corregido en el mismo PR, antes de abrir:
- **La constancia dice que el paciente asistió:** ahora la emite el servidor (`lib/documentos/emitir-constancia.ts`, ruta `/api/turno/[turnoId]/constancia`) y solo si la sala registró que el paciente entró (`video_presencia`). Si no entró, no sale. Si no hay registro, por ahora tampoco (decisión 1.14 en `DECISIONES.md`).
- **Red en la base** (`20261013_documentos_segun_profesion.sql` + espejo `043`, aplicada y probada en las dos bases): un psicólogo solo puede guardar constancias, un médico nunca, y una sola constancia por turno. Si un día la lectura de la profesión fallara, la base frena igual.
- **Cierre automático:** con un psicólogo guarda la evolución y deja un aviso propio ("la constancia de atención no se emite sola: emitila desde Documentación pendiente"); no avisa al equipo y el repaso nocturno no lo repite.
- **Documentación pendiente:** una sesión de psicología con evolución ya no figura pendiente (la constancia es opcional).
- **Completar documentación:** guarda la evolución aunque no se emita la constancia, y dice por qué no salió.
- **Rectificación de identidad:** no se ofrece para una constancia (el nombre y el DNI van dentro del texto firmado; hay que emitir una nueva).
- El texto normaliza nombres, DNI y tipo de matrícula; una MP sin provincia no se emite.

Segunda revisión (13/10), corregido:
- **La constancia la guarda solo el servidor** (`20261013_documentos_constancia_solo_servidor.sql` + espejo `044`, aplicada y probada en las dos bases): la sesión del profesional ya no puede insertar una constancia directo (se salteaba el control de presencia); los médicos siguen guardando sus documentos igual.
- La emisión exige además: sesión terminada, no reembolsada y profesional habilitado (aprobado y con REFEPS), las mismas guardas que "completar documentación".
- Si la constancia no sale (el paciente no entró, no hay registro, faltan datos, error), el profesional recibe un aviso en su bandeja; si es un error, también el equipo.
- Una sesión cerrada sola, con el paciente adentro y sin constancia, queda en "Documentación pendiente" para emitirla.
- Un error de la base ya no se informa como "faltan datos".
- La rectificación de una constancia queda como decisión pendiente (1.14 de `DECISIONES.md`): el nombre y el DNI van en el texto firmado y hay una sola constancia por turno.

**Para que decida Diego antes de abrir:** los cinco puntos de la decisión 1.14 de `DECISIONES.md` (constancia tildada por defecto, qué hacer sin registro de presencia, sacar "Firmado electrónicamente en Docto.", lectura del borrador por el paciente) y estos textos nuevos: la casilla "Emitir la constancia de atención para el paciente"; "La constancia de atención no se puede emitir: falta tu domicilio profesional o tu matrícula, o el DNI del paciente."; los motivos de `textoMotivoSinConstancia`; el aviso "Tu sesión se cerró sola…"; el push "Ya podés ver la constancia de atención de tu sesión."; "Constancia de atención" en las listas. La matrícula nacional se escribe "MN 12345 — Nacional".

Queda para F4: `/verificar` dice "Verificando receta" y habla de "acto médico".

### F4 — Textos y avisos · ✅ 13/10 (dormida: solo lo ve un psicólogo o su paciente)
Inventario con un barrido de 5 ángulos + crítico (124 sitios, 96 aplican, ninguno rompe), implementado por 5 agentes en archivos disjuntos y un sexto que propuso lo legal. Regla de oro: para los médicos no cambia nada; todo texto nuevo es condicional a la profesión (`lib/medicos/vocabulario.ts`). Lo legal (consentimiento informado de psicología con versión `psi-v1`, T&C, pie, landing) NO se codeó: está propuesto en `docs/sprints/2026-10-13-psicologos-textos-legales.md` para Diego y el abogado.

Hecho por grupo:
- Camino del paciente (turno): etiqueta "Profesional" en el calendario, el pago, la confirmación y la sala de espera; el cierre de la videollamada y el paso previo a la sala hablan de la constancia; `/verificar` dice "documento" y, para una constancia, "atención"; "Lic." no se duplica en `formatNombreMedico` (test nuevo); la respuesta pública de verificación suma `tipo` y `profesion`.
- Avisos: mails de turno con "Profesional"; mail de turno no realizado sin consulta inmediata; mail de bienvenida al psicólogo sin la viñeta de consulta inmediata ni la guía PDF; push "está esperando tu sesión"; el no-show del profesional nombra con "Lic." solo en psicología; el cobro en Mercado Pago dice "Sesión de psicología de N minutos" (y la duración real del turno para todos: antes decía siempre 20).
- Panel del profesional: dashboard, "Cómo atendés", onboarding, perfil, workspace, historial y perfil público hablan de turnos, sesiones y constancia para el psicólogo; sin videos de capacitación (hablan de recetas).
- Nova: para un psicólogo nunca ofrece consulta inmediata, habla de sesiones y Lic., no promete recetas, sugiere 50 min.
- Admin: columna "Profesión" con embudo en /admin/medicos; "Lic." en /admin/consultas.

Cambia también para médicos o sus pacientes (pocos; Diego puede vetar cualquiera). Después de la revisión propia quedaron solo estos:
- `/verificar`: "Verificando receta..." → "Verificando documento..." (ya decía "receta" para certificados y órdenes).
- Nombres de respaldo cuando la ficha no tiene nombre (caso que el registro no permite): "Medico"/"Médico"/"Doctor/a" → "Profesional" o nada.
- Inicio del paciente, tarjeta Clínica Virtual: tildes y la "un" que faltaba ("Consultá un médico ahora o agendá un turno").
- Cobro en Mercado Pago de un turno: la duración real del lugar reservado (antes decía siempre "20 minutos").
- Alertas internas al equipo: "Médico sin saldo" → "Profesional sin saldo".
- La respuesta pública de `/api/verificar` suma dos campos de datos (`tipo`, `profesion`), sin contenido.
- Las descripciones de las herramientas de Nova (las lee solo el modelo, ningún usuario): "médico" → "profesional" y la duración admite 50 (la agenda ya lo ofrece a todos).
- Pantalla "Pendiente de pago" de un turno: la duración es la del lugar reservado, igual que el ítem de Mercado Pago (antes decía la de la consulta inmediata).
- `/admin/consultas`: la cabecera "Médico" pasa a "Profesional" (solo el equipo).
- `formatNombreMedico`: un nombre cargado como "Lic. …" ya no recibe "Dr." delante (caso que el registro casi no permite).
- Consultorio particular, cartel de fundador: decía "comisión", palabra prohibida por la regla de vocabulario de Diego; ahora "coste por uso de la plataforma".
(Los agentes habían cambiado para todos el popup de notificaciones y el aviso de no-show del profesional; se revirtieron a condicionales.)

Revisión adversarial (5 lentes + regla de oro, 13/10): 1 "rompe hoy" (las descripciones de Nova, declaradas arriba), 6 "al abrir" y 16 menores, todos corregidos en el mismo PR: "consulta"/"sesión" coherente en todo el flujo del paciente de psicología (sala de espera, cierre de la videollamada, push, reembolso, aviso de plantada), duración real en la pantalla de pago, "Lic. —" en el admin, la tabla de profesionales con 9 columnas, y un aviso en el log cuando la lectura de la profesión falla (se asume médico).

Lo que los agentes dejaron sin hacer, con motivo (decisiones de producto o fuera de alcance):
- [paciente-turno] verificar/BuscarDocumentoClient.tsx "Verificar un documento médico" (y verificar/page.tsx, verificar/[id]/page.tsx metadata, PieLegal.tsx "documentos médicos" / — No tienen documento a mano y el texto actual es correcto para todos los usuarios de hoy (todos médicos): sería un cambio neutro para todos sin justificación de error, y PieLegal/metadata no son de mi grupo. Propuesta par
- [paciente-turno] auth/register/page.tsx: "Registrate para acceder a consultas médicas virtuales" y el link "¿Sos médico?" — Página pública sin profesión que leer; el texto actual es correcto hoy y el cambio lo verían todos los pacientes. Va con la apertura del flag (F5) y con OK de Diego. Propuesta: "Registrate para atenderte por videollamada
- [paciente-turno] InfoMedicaForm: obra social / nro de afiliado en el paso previo a la sesión de psicología — No sé si tiene sentido pedirlos para una constancia de atención; es decisión de producto de Diego. Solo cambié título y bajada.
- [paciente-turno] EstudiosPaciente: ocultar el botón "Estudios" en psicología — Decisión de producto que tiene que coincidir con la pestaña Estudios del workspace (grupo panel-profesional). Elegí la opción que no quita nada: textos "Archivos para tu profesional"; si el otro grupo la oculta, acá hay 
- [paciente-turno] articuloMedico('Lic.') → artículo "el/la" — La ficha no guarda el género del profesional y "Lic." es neutro: dejé el "" a propósito y lo documenté en el comentario del helper (con test). Si Diego quiere artículo, hay que guardar el género en el registro (decisión 
- [paciente-turno] F1 ¿normaliza el nombre al registrar (le saca el "Lic." tipeado)? — No lo verifiqué a fondo; solo comprobé que registro-medico/actions.ts fija titulo = "Lic." para psicólogos. Con el guard nuevo, si el nombre viene con "Lic." adelante no se duplica, así que el resultado es correcto en lo
- [avisos] email.ts enviarDocumentoMedico: "Documento de tu sesión" para psicólogos — La única ruta que lo dispara (src/app/api/consulta/enviar-documento-medico/route.ts) busca el id en la tabla `consultas` (consulta inmediata) y rechaza todo lo demás; un psicólogo nunca tiene una CI, así que hoy ese mail
- [avisos] consultas/sin-respuesta.ts:266 fallback "Doctor/a" — Archivo fuera de mi grupo y solo aplica a la consulta inmediata, que el psicólogo no tiene.
- [avisos] Botón "Ver profesionales disponibles" → /clinica en el mail de turno no realizado (paciente de psicólogo) — Cambié solo el párrafo. No verifiqué si /clinica lista psicólogos; si tiene otra entrada, el destino se ajusta en un paso aparte.
- [avisos] lib/crons-meta.ts y api/cron/recuperar-registros/route.ts — Estaban en mi lista de archivos pero no tenían hallazgos; no los toqué.
- [avisos] Push al profesional en reintentar-refunds ("se descontará de tus próximas consultas") — No estaba en los hallazgos; lo dejé igual. Si se quiere neutro ("próximos cobros"), es una línea.
- [panel-profesional] WorkspaceConsulta.tsx: pestaña «Estudios» para el psicólogo (renombrar a «Archivos» u ocultarla) — Decisión de producto: ocultarla le saca el envío de PDF al paciente (útil para un informe) y renombrarla inventa una etiqueta nueva. Se deja como está hasta que Diego elija; es un cambio de una línea con `esPsicologia`.
- [panel-profesional] dr/[slug]/page.tsx: título «Médico no encontrado — Docto» → «Consultorio no encontrado — Docto», y dr/[slug]/not-found.tsx: «Encontrá otros médicos en la clínic — Son textos neutros que verían también los pacientes de médicos, y el actual no es incorrecto para ellos (regla de oro: solo se admite un texto para todos si el de hoy ya está mal). Queda para el OK de Diego; propuesta li
- [panel-profesional] paciente/[pacienteId]/page.tsx: ocultar «Historial de consultas» si está vacío para el psicólogo — Ya pasa: `seccionConsultas` es null cuando `consultasFueraDeTimeline.length === 0`, para todos. No había nada que cambiar.
- [panel-profesional] lib/pdf/receta.ts (disclaimer del pie y leyenda de Ley 27.553 para la constancia) y lib/documentos/constancia.ts (posible «Lic. Lic.» si el nombre ya trae el pr — Fuera de mi alcance por consigna: lo legal y el texto aprobado de la constancia se proponen en el doc, no se codean. El caso «Lic. Lic.» conviene resolverlo en `formatNombreMedico` (hallazgo de texto.ts, grupo paciente-t
- [panel-profesional] como-atendes/page.tsx: sección de videos para psicología — Hecho con la opción principal del hallazgo (no mostrar sección ni botón «Instructivos» al psicólogo; tampoco el link del cierre del onboarding). Es una decisión de producto reversible en una línea: si Diego prefiere most
- [nova] Helper compartido para la duración sugerida de sesión (50) — No existe una constante común en src/lib (la agenda la tiene como <option> literal); la dejé como constante local DURACION_SESION_PSICOLOGIA_MIN en nova/confirmar/route.ts. Si otro grupo crea una, conviene unificar. No s
- [nova] Barrido con regex "médico"→"profesional" sobre el prompt — Lo probé y pisaba mis propios bloques de psicología ("no médico", "grabado para médicos"); lo reemplacé por una variable explícita ${quien}/${quienes} en el template, que es lo que quedó.
- [admin] Tocar src/app/admin/consultas/[id]/page.tsx — Prohibido por la consigna (lo cambia otro PR).
- [admin] Mostrar 'Dr./Dra.' a los médicos en /admin/consultas — La API nunca mandó el título y la tabla nunca lo mostró; agregarlo cambiaría lo que el admin ve de los médicos. Solo se agrega 'Lic.' a las filas de psicología.

**Textos nuevos para que apruebe Diego antes de abrir** (literal; quién lo ve):
- `src/app/clinica/[medicoId]/turnos/CalendarioTurnos.tsx` · paciente de psicólogo (resumen antes de reservar): «Profesional»
- `src/app/turno/[turnoId]/pago/PagoPendiente.tsx` · paciente de psicólogo (detalle del turno a pagar): «Profesional»
- `src/app/turno/[turnoId]/confirmacion/page.tsx` · paciente de psicólogo (tarjeta de turno confirmado): «Profesional»
- `src/app/turno/[turnoId]/espera/EsperaTurno.tsx` · paciente de psicólogo (tarjeta de la sala de espera): «Profesional»
- `src/components/BotonPush.tsx` · paciente de psicólogo (popup de notificaciones tras confirmar el turno): «¿Querés que te avisemos cuando te estén esperando en la sala?»
- `src/components/BotonPush.tsx` · paciente de psicólogo (variante botón, texto al pie): «Te avisamos cuando te estén esperando para atenderte.»
- `src/app/consulta/[id]/sala/SalaConsultaPaciente.tsx` · paciente de psicólogo (cierre de la videollamada, sala finalizada): «Si te dejaron una constancia de atención, ya la podés ver en tus documentos.»
- `src/app/consulta/[id]/sala/SalaConsultaPaciente.tsx` · paciente de psicólogo (cierre de la videollamada, pantalla de documentos): «En unos minutos vas a encontrar acá tu constancia de atención, si la emitieron.»
- `src/components/EstudiosPaciente.tsx` · paciente de psicólogo (panel de archivos dentro de la videollamada): «ARCHIVOS PARA TU PROFESIONAL»
- `src/components/EstudiosPaciente.tsx` · paciente de psicólogo (al subir un archivo o link): «Tu archivo está disponible para tu profesional. Se eliminará automáticamente cuando finalice la sesión.»
- `src/app/turno/[turnoId]/video/page.tsx` · paciente (push cuando el profesional abre la sala y la ficha no tiene nombre; con nombre no cambia): «Ya te están esperando. Ingresá ahora a tu consulta.»
- `src/components/InfoMedicaForm.tsx` · paciente de psicólogo (título del paso previo a la sala): «Tus datos»
- `src/components/InfoMedicaForm.tsx` · paciente de psicólogo (bajada del paso previo a la sala): «Estos datos se usan para confeccionar tu constancia de atención. Si algo está mal, editalo antes de entrar a la sesión.»
- `src/app/mis-consultas/page.tsx` · paciente (nombre de respaldo cuando la ficha no se lee; antes decía "Medico" sin tilde): «Profesional»
- `src/app/documentos/page.tsx` · paciente (firmante de respaldo cuando la ficha no se lee; antes "Médico"): «Profesional»
- `src/app/api/livekit/token/route.ts` · paciente (nombre sobre el video cuando el profesional reconecta sin nombre en la ficha; antes "Medico"): «Profesional»
- `src/app/clinica/[medicoId]/turnos/actions.ts` · psicólogo (push cuando el paciente entra a la sala de espera): «{nombre del paciente} está esperando tu sesión»
- `src/app/verificar/[id]/VerificarRecetaClient.tsx` · quien escanea el QR de CUALQUIER documento (mientras carga; antes "Verificando receta..."): «Verificando documento...»
- `src/app/verificar/[id]/VerificarRecetaClient.tsx` · quien escanea el QR de una constancia de atención (bloque de sellado diferido): «La primera es la de la atención; la segunda, la del sello que permite verificarlo en esta página.»
- `src/app/verificar/[id]/VerificarRecetaClient.tsx` · quien escanea el QR de una constancia de atención (bloque de rectificación de identidad): «la fecha de emisión es la de la atención original.»
- `src/app/verificar/[id]/VerificarRecetaClient.tsx` · quien escanea el QR de una constancia de atención (pie legal de la página): «Esta página no muestra información clínica del paciente por razones de privacidad.»
- `src/app/api/pago/crear-v2/route.ts` · paciente de psicólogo (ítem del checkout de Mercado Pago): «Sesión de psicología de {N} minutos — {fecha} {hora}»
- `src/lib/email.ts (wrapHtml, cabecera de los mails)` · paciente de psicólogo y psicólogo: «Psicología online»
- `src/lib/email.ts (detalleTurno: confirmado, cancelado, no realizado, recordatorios 24 h y 10 min)` · paciente de psicólogo: «Profesional: Lic. {nombre}  (la fila que para médicos dice "Médico")»
- `src/lib/email.ts (turno confirmado)` · paciente de psicólogo: «Hola {nombre}, tu sesión fue confirmada.»
- `src/lib/email.ts (archivo .ics adjunto)` · paciente de psicólogo: «Sesión con Lic. {nombre} - Docto  /  alarma: Sesión en 1 hora»
- `src/lib/email.ts (tu turno no pudo realizarse)` · paciente de psicólogo: «Si necesitás atenderte, hay otros profesionales de Psicología con turnos próximos.»
- `src/lib/email.ts (documentación disponible, post-cierre)` · paciente de psicólogo: «Asunto: Ya está disponible la constancia de atención de tu sesión · Chip: Constancia disponible · Título: Ya tenés la constancia de atención de tu sesión · Cuerpo: Hola {nombre}, Lic. {nombre} completó la documentación de tu sesión y ya la podés ver y descargar.»
- `src/lib/email.ts (recordatorio 24 h)` · paciente de psicólogo: «Recordatorio: sesión mañana  ·  Asunto: Recordatorio: sesión mañana con Lic. {nombre}»
- `src/lib/email.ts (recordatorio 10 min)` · paciente de psicólogo: «Tu sesión con Lic. {nombre} empieza a las {hh:mm}. Entrá a la sala virtual: cuando entres, le avisamos para que te atienda.  (también en el asunto)»
- `src/lib/email.ts (bienvenida al profesional aprobado)` · psicólogo: «Viñeta 3 de "Para arrancar en 5 minutos": Publicá tu agenda — los pacientes reservan día y hora y vos los esperás en tu panel a esa hora.  ·  Título: Tus dos formas de atender: (sin la viñeta de Consulta Inmediata; quedan Turnos Programados y Consultorio Particular)  ·  …en un par de sesiones ya va a ser tu plataforma de trabajo preferida.  ·  Sin la guía PDF adjunta y sin la línea "Adjuntamos una guía rápida…"»
- `src/lib/email.ts (recordatorio de identidad)` · psicólogo: «Cargar tu firma — para la constancia de atención.  ·  Conectar Mercado Pago — para que recibas el cobro de tus sesiones.  ·  …los pacientes no pueden reservar sesiones con vos.»
- `src/lib/email.ts (recordatorio de identidad, solo si la ficha no tiene nombre)` · profesional (médico o psicólogo) sin nombre_completo: «Hola  (antes: "Hola, Doctor/a")»
- `src/lib/cancelaciones.ts (mensaje interno + push al paciente cuando el profesional no entró)` · paciente (de médico y de psicólogo): «{La Dra. / El Dr. / Lic.} {nombre} no pudo atender tu turno del {fecha}. Te reembolsamos la consulta.  — si no se pudo leer la ficha: "Tu profesional no pudo atender…" (psicólogo) / "El médico no pudo atender…" (médico, igual que hoy)»
- `src/lib/cancelaciones.ts (motivo_cancelacion, lo ve el equipo en el panel de reembolsos)` · admin: «Profesional ausente — no atendió el turno  (para médicos sigue "Médico ausente — no atendió el turno")»
- `src/lib/cancelaciones.ts (aviso al profesional que dejó plantado un turno)` · psicólogo: «Hola {nombre}. Un paciente te esperó en su turno del {fecha} y la sesión no ocurrió, así que le devolvimos el 100% de lo que pagó. (…)  — sin nombre: "Hola. Un paciente…" (antes "Hola Doctor/a.")»
- `src/lib/whatsapp.ts (variable {{1}} de las plantillas al profesional, solo si la ficha no tiene nombre)` · profesional sin nombre_completo: «profesional  (antes "Doctor/a")»
- `src/lib/cancelaciones.ts (alerta al equipo, primer refund fallido)` · equipo: «Profesional sin saldo en MP. Se reintenta cada 24h y a las 48h Docto cubre al paciente por CVU. Suele resolverse solo cuando el profesional cobra otra atención — no requiere acción inmediata.»
- `src/app/api/cron/reintentar-refunds/route.ts (alertas al equipo)` · equipo: «Un refund lleva 48hs sin resolverse (profesional sin saldo).  ·  La deuda del profesional ya quedó registrada…  ·  NO se registró deuda del profesional automáticamente para este caso.»
- `src/app/dashboard/page.tsx` · psicólogo: «(barra superior) el punto «Disponible / No disponible» no se muestra; no hay texto de reemplazo»
- `src/app/dashboard/page.tsx` · psicólogo: «[motivo del bloqueo]. Sin esos avisos no te enterarías de los pacientes que te esperan, así que por ahora no aparecés en la sección de Psicología ni podés recibir turnos.»
- `src/app/dashboard/BannerMercadoPago.tsx` · psicólogo: «Tu registro ya está completo — este es el paso que te habilita a atender. Los pacientes pagan la consulta y el dinero va directo a tu cuenta de Mercado Pago. Sin esto no podés publicar tu agenda.»
- `src/app/dashboard/AgendaHoy.tsx` · psicólogo: «(pestaña del navegador) Docto — Psicología / (N) Docto — Psicología»
- `src/app/dashboard/ModalPushMedico.tsx` · psicólogo: «Cuando un paciente reserva un turno o entra a la sala, te avisamos al teléfono — no hace falta que estés mirando Docto. Sin esto, no te enterás de los pacientes que te esperan.»
- `src/app/medico/como-atendes/page.tsx` · psicólogo: «El precio lo ponés en cada agenda que crees.»
- `src/app/medico/como-atendes/page.tsx` · psicólogo: «¡Felicitaciones por tu categoría de Profesional Fundador!»
- `src/app/medico/como-atendes/page.tsx` · psicólogo: «(la sección «Cómo se usa Docto» y el botón «Instructivos» no se muestran al psicólogo mientras los videos sean de consulta inmediata y receta; sin texto de reemplazo)»
- `src/app/medico/como-atendes/consultorio/ConsultorioParticular.tsx` · psicólogo: «¡Felicitaciones por tu categoría de Profesional Fundador!»
- `src/app/medico/onboarding/OnboardingWizard.tsx` · psicólogo: «Firma — para tus constancias de atención»
- `src/app/medico/onboarding/OnboardingWizard.tsx` · psicólogo: «Domicilio del consultorio — figura en tu constancia de atención»
- `src/app/medico/onboarding/OnboardingWizard.tsx` · psicólogo: «Tu firma para las constancias»
- `src/app/medico/onboarding/OnboardingWizard.tsx` · psicólogo: «Figura en la constancia de atención. Aunque atiendas solo de forma virtual, la constancia necesita un domicilio profesional registrado.»
- `src/app/medico/onboarding/OnboardingWizard.tsx` · psicólogo: «Confirmamos que sos el titular de la matrícula que registraste. Esto protege a tus pacientes de la suplantación de identidad y respalda cada constancia que firmás con tu nombre.»
- `src/app/medico/onboarding/OnboardingWizard.tsx` · psicólogo: «(el link «Ver los videos de cómo se usa Docto» del cierre no se muestra al psicólogo)»
- `src/app/medico/perfil/PerfilClient.tsx` · psicólogo: «Estos datos aparecen en tus constancias de atención y son visibles para el paciente.»
- `src/app/medico/perfil/FirmaManuscrita.tsx` · psicólogo: «Tu firma aparece en cada constancia de atención que emitas. Podés cambiarla cuando quieras.»
- `src/app/medico/consulta/[id]/workspace/WorkspaceConsulta.tsx` · psicólogo: «Finalizar sesión»
- `src/app/medico/consulta/[id]/workspace/WorkspaceConsulta.tsx` · psicólogo: «Sesión finalizada / Sesión finalizada el [fecha]»
- `src/app/medico/consulta/[id]/workspace/WorkspaceConsulta.tsx` · psicólogo: «Completá el diagnóstico antes de finalizar la sesión.»
- `src/app/medico/consulta/[id]/workspace/WorkspaceConsulta.tsx` · psicólogo: «Si nadie vuelve en 2 minutos, la sesión se cierra automáticamente.»
- `src/app/medico/consulta/[id]/workspace/PanelHistoriaClinica.tsx` · psicólogo: «Primera sesión con este paciente.»
- `src/app/medico/consulta/[id]/workspace/PanelHistoriaClinica.tsx` · psicólogo: «(los bloques «Receta — Sin receta» e «Indicaciones — Sin indicaciones» de cada visita previa no se muestran; quedan evolución y diagnóstico)»
- `src/app/medico/paciente/[pacienteId]/EvolucionesTimeline.tsx` · psicólogo: «(las secciones «Medicación» e «Indicaciones» de cada atención no se muestran)»
- `src/app/medico/paciente/[pacienteId]/page.tsx` · psicólogo: «Cancelado por el profesional (estado cancelado_medico en el historial de turnos)»
- `src/app/medico/historial/MisPacientesClient.tsx` · psicólogo: «N sesión / N sesiones (línea secundaria de cada paciente, donde el médico ve «N consulta(s)»)»
- `src/app/dr/[slug]/page.tsx` · paciente de un psicólogo: «Ingresá para agendar un turno.»
- `src/app/dashboard/page.tsx` · paciente (todos): «Consultá un médico ahora o agendá un turno»
- `src/app/api/nova/chat/route.ts` · profesional (psicólogo, vía Nova; bloque PROFESIÓN del prompt estático, solo variante psicología): «PROFESIÓN: PSICOLOGÍA
Quien te habla es psicólogo o psicóloga (título "Lic."), no médico. En psicología se atiende SOLO con turno: la consulta inmediata no existe para esta profesión, nunca la ofrecés ni la mencionás, y si la pide le explicás que en psicología se atiende solo con turno y le ofrecés abrir turnos. Sus atenciones son sesiones: decís "sesión", nunca "consulta". No receta: nunca prometas recetas ni hables de ellas; al terminar una sesión el único documento que emite es la constancia de atención.»
- `src/app/api/nova/chat/route.ts` · profesional (psicólogo, frase que Nova le dice si pide "atiendo ahora"): «En psicología se atiende solo con turno; ¿le abro turnos para hoy?»
- `src/app/api/nova/chat/route.ts` · profesional (psicólogo, pregunta de Nova cuando no menciona la duración): «¿Las sesiones son de 50 minutos?»
- `src/app/api/nova/chat/route.ts` · profesional (psicólogo, ejemplo de "qué podés hacer", cuatro cosas): «Puedo ayudarle con todo lo de su agenda — crear turnos, ver qué tiene para hoy o la semana, cancelar o bloquear turnos, y contarle cuánto vale su sesión. ¿Por dónde arrancamos?»
- `src/app/api/nova/chat/route.ts` · profesional (psicólogo, saludo de primera sesión): «Hola Lic. Pérez, soy Nova, su asistente personal en Docto. No soy un menú de opciones ni un bot — estoy acá para entenderle y ayudarle de verdad con su agenda. ¿Le cuento cómo?»
- `src/app/api/nova/chat/route.ts` · profesional (psicólogo, "cancelá todo"): «Voy a bloquear sus turnos disponibles. (y al confirmar: le recordás que cuando quiera volver a atender tiene que abrir turnos de nuevo)»
- `src/app/api/nova/chat/route.ts` · profesional (psicólogo, descripción de los videos en el prompt): «- "Cómo configurar cómo atendés" (2 min 30 s): agenda de turnos y el link del consultorio particular. Está grabado para médicos: la parte de consulta inmediata no le aplica, y si lo ofrecés se lo aclarás en media oración.
- "Atender una consulta de principio a fin" (3 min 46 s): cómo es atender una sesión de principio a fin, desde que un paciente lo espera hasta que recibe su constancia. También está grabado para médicos: lo de las recetas no le aplica.
[...] "Tenemos dos videos cortos en Configurá cómo atendés: uno de cómo dejar todo listo y otro de cómo es atender una sesión."»
- `src/app/api/nova/chat/route.ts` · profesional (psicólogo, ejemplo cuando Nova no entiende): «Ese tema no es lo mío. Lo que sí puedo hacer es ayudarle con su agenda, sus turnos. ¿Necesita algo de eso?»
- `src/app/api/nova/chat/route.ts` · Nova (instrucción interna de trato, titulo "Lic."; no la ve ningún usuario): «Atendés a Lic. Pérez. Dirigite a quien atendés como "Lic. Pérez". El título "Lic." no dice el género: no le antepongas "el" ni "la".»
- `src/app/api/nova/chat/route.ts` · Nova (encabezado del bloque dinámico, solo psicología; interno): «DATOS DEL PROFESIONAL Y CONTEXTO DE HOY»
- `src/app/admin/medicos/MedicosClient.tsx` · admin (solo el panel /admin/medicos): «Columna nueva "Profesión" en la tabla de aprobados/rechazados/suspendidos, con embudo y orden; valores "Médico" / "Psicólogo". El buscador también encuentra por esas palabras. En la ficha lateral, bloque Matrícula, campo nuevo "Profesión" con el mismo valor.»
- `src/app/admin/consultas/ConsultasClient.tsx` · admin (solo el panel /admin/consultas): «Cabecera de columna "Médico" → "Profesional" (en pantalla y en el CSV). Placeholder del buscador: "Buscar por profesional, paciente, especialidad…". Una fila de psicología muestra el nombre como "Lic. Nombre Apellido" y, como los turnos no guardan especialidad, la columna Especialidad dice "Psicología". Para los médicos la fila queda exactamente igual (nombre sin título, como hasta hoy).»


### F5 — Abrir
- Prender el flag, registrar al primer psicólogo real (confirma el texto de REFEPS) y avisarle a Sara.
