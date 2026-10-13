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

### F2 — Cómo atiende y cómo aparece
- Nada de consulta inmediata: rechazada en `actualizarDisponibilidad` (y la restricción de F1 en la base), fuera de `puedeAtenderAhora`, del rescate, del aviso de demanda y del consultorio privado; el panel no le muestra los bloques de consulta inmediata.
- El aviso del término de controlados del panel no se le muestra (no receta).
- Agenda: duración de 50 minutos disponible.
- Clínica: sección "Psicología" separada de los médicos (y "lo más pronto" de los médicos no ofrece psicólogos, ni al revés).
- Solo adultos: `reservarTurno` (y el pago) rechazan un turno de psicología si el paciente es menor según su fecha de nacimiento; el área "adolescencia" no se le ofrece al psicólogo. Límite declarado: la fecha la declara el paciente.

### F3 — Documentos
- Tipo `constancia` (CHECK en las dos bases), firmable, con el texto aprobado; el PDF sin bloque de diagnóstico.
- El espacio de trabajo del psicólogo: solo evolución y constancia (sin el relleno automático de "indicaciones").
- La identidad congelada en la firma suma profesión y jurisdicción (versión nueva del snapshot).

### F4 — Textos y avisos
- "Médico" → "profesional" en todo el recorrido del turno (pantallas, mails, push) y en el panel; consentimiento informado con las líneas de salud mental (números verificados antes de publicar); mail de bienvenida sin consulta inmediata.
- Admin: la profesión como columna con embudo.

### F5 — Abrir
- Prender el flag, registrar al primer psicólogo real (confirma el texto de REFEPS) y avisarle a Sara.
