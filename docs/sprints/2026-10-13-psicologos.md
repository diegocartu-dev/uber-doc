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

- **El texto exacto con el que REFEPS devuelve la profesión de psicología.** El código de hoy solo reconoce "Médico". Se confirma con el primer psicólogo real que se registre (o un DNI de prueba que pase Diego).
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

### F4 — Textos y avisos
- "Médico" → "profesional" en todo el recorrido del turno (pantallas, mails, push) y en el panel; consentimiento informado con las líneas de salud mental (números verificados antes de publicar); mail de bienvenida sin consulta inmediata.
- Admin: la profesión como columna con embudo.

### F5 — Abrir
- Prender el flag, registrar al primer psicólogo real (confirma el texto de REFEPS) y avisarle a Sara.
