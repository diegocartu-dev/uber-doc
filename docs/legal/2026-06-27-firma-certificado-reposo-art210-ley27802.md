# ¿La firma electrónica de Docto satisface el art. 210 LCT (Ley 27.802) para certificados de reposo?

**Fecha:** 27/06/2026
**Tipo:** Análisis legal empírico (defensa + contraataque adversarial + veredicto). Draft de criterio asistido por IA — NO es asesoramiento legal vinculante. Requiere OK de laboralista matriculado antes de afirmaciones públicas de oponibilidad.
**Disparador:** la nueva Ley 27.802 (reforma laboral) endureció los requisitos del certificado de reposo. Pregunta: ¿el certificado de Docto, firmado con **firma electrónica** (art. 5, Ley 25.506) desde su plataforma **ReNaPDiS 0270**, cumple/es oponible bajo el nuevo art. 210 LCT, que habla de documentos "firmados digitalmente"?

---

## Veredicto: DEFENDIBLE-CON-RIESGO

**Probablemente oponible, pero NO automáticamente oponible.** La diferencia entre firma digital y electrónica acá es precisamente la diferencia entre "oponibilidad automática" y "oponibilidad que hay que litigar".

| Escenario | Probabilidad de sostenerse |
|---|---|
| Empleador NO impugna formalmente (justificación de ausencia administrativa) | **Alta (~80–85%)** — el certificado es regulatoriamente conforme y goza de regularidad mientras no haya impugnación concreta |
| Empleador IMPUGNA con buen abogado en juicio laboral | **Moderada (~55–60%, y se litiga)** — pega la inversión de la carga de la prueba (art. 5 in fine, Ley 25.506) |

Por qué "defendible-con-riesgo" y no FIRME ni ZONA-GRIS pura: el **reglamento operativo vigente (Decreto 407/2026) NO exige firma digital** y Docto cumple sus dos requisitos literales (plataforma ReNaPDiS + médico REFEPS) — eso juega claramente a favor. Pero la firma electrónica **no goza de la presunción de autoría/integridad** (arts. 7–8, Ley 25.506) y el verbo "digitalmente" + art. 288 CCyC le dan munición real al empleador.

---

## Evidencia empírica (textos literales + fuentes)

**Art. 210 LCT (texto Ley 27.802, BO 06/03/2026 — aviso 339128):**
> "...emitidos en todo el territorio nacional por profesionales médicos habilitados para el ejercicio de la medicina y **firmados digitalmente** a través de las plataformas electrónicas autorizadas por la **ley 27.553** y su reglamentación."
> Contenido exigido: diagnóstico médico + tratamiento + cantidad de días de reposo.
> (El articulado NO menciona "ReNaPDiS" ni "REFEPS"; esos aparecen en la reglamentación.)

**Ley 27.553 (art. 5, que reforma art. 19 Ley 17.132):**
> "Las prescripciones y/o recetas deben ser formuladas en idioma nacional, fechadas y firmadas en forma **manuscrita, electrónica o digital**."
> → La ley a la que el art. 210 **remite expresamente** admite firma electrónica. El Decreto 98/2023 reconoce en paralelo "receta electrónica" (firma electrónica) y "receta digital" (firma digital).

**Ley 25.506 — la distinción decisiva:**
> Art. 2 (**firma DIGITAL**): procedimiento matemático verificable; arts. 7–8 dan **presunción de autoría e integridad** (quien la niega debe probar).
> Art. 5 (**firma ELECTRÓNICA**): medio de identificación que carece de algún requisito de la digital. *"En caso de ser desconocida la firma electrónica corresponde a quien la invoca acreditar su validez."* → **NO hay presunción; la carga se invierte contra quien la invoca.**

**Art. 288 CCyC** (apoyo del empleador): *"...el requisito de la firma de una persona queda satisfecho si se utiliza una firma digital..."*

**Decreto 407/2026 (BO 01/06/2026), art. 6 Anexo I — HALLAZGO DECISIVO a favor de Docto:**
> Requiere que el certificado sea *"emitido electrónicamente mediante sistema de información o plataforma digital debidamente registrada en el ReNaPDiS y suscriptas por profesional habilitado ante REFEPS."*
> **NO dice "firma digital" ni "firmado digitalmente". Exige plataforma ReNaPDiS + médico REFEPS — condiciones que Docto cumple.**
> Instruye al Ministerio de Salud a fijar las condiciones técnicas de las plataformas en 30 días (**plazo vencido ~01/07/2026**).

**Sin jurisprudencia ni guía oficial** que resuelva si "firmado digitalmente" admite firma electrónica o exige digital ONTI (al 27/06/2026, punto abierto).

---

## Defensa (a favor de Docto)
1. **El reglamento operativo (Decreto 407/2026) no exige firma digital** — exige plataforma ReNaPDiS + médico REFEPS, y Docto cumple ambos literalmente. *(Columna vertebral.)*
2. **El art. 210 remite a la Ley 27.553**, que admite expresamente firma electrónica → lectura sistemática: el estándar lo fija la norma remitida.
3. **El certificado de Docto tiene el contenido sustancial exigido** (diagnóstico + tratamiento + días — verificado en `src/lib/pdf/receta.ts`).
4. **Art. 288 CCyC fija un estándar suficiente, no excluyente** ("queda satisfecho SI se utiliza firma digital" = una vía, no la única).

## Contraataque (abogado del empleador)
1. El texto **literal** del art. 210 dice "firmados **digitalmente**" (verificado contra BO).
2. **Art. 288 CCyC**: el requisito de firma en instrumento electrónico se satisface con firma digital.
3. **Inversión de la carga (art. 5 in fine)** — el golpe procesal: al empleador le basta **desconocer** el certificado y obligar a la contraria a un peritaje sobre la cadena de firma. Para un trabajador individual es disuasivo.
4. Sin firma digital (art. 8) **no hay presunción de integridad** del PDF.
5. ReNaPDiS 0270 podría leerse como habilitación "para recetas", no para certificados de reposo.

**Todo el ataque se confirma o se cae con UN documento todavía inexistente: la resolución técnica del Ministerio de Salud (instrucción del Decreto 407/2026).**

---

## Qué lo vuelve FIRME (en orden de contundencia)
1. **Sumar firma digital ONTI (art. 2) al tipo "certificado"** — no a toda la receta. Único cierre definitivo bajo control de Docto: da presunción de autoría/integridad, invierte la carga a favor del trabajador, matchea el verbo literal.
2. **Resolución del Ministerio de Salud** especificando el tipo de firma (plazo vencido ~01/07/2026). **Re-chequear después del 01/07/2026 — es el documento que define la cuestión.**
3. **Confirmar el alcance de ReNaPDiS 0270** (que habilita como plataforma prescriptora en sentido amplio, no segmenta certificados).
4. **Dictamen de laboralista matriculado.**

---

## Comunicación pública — qué SÍ / qué NO
- **NO** decir "certificado válido y oponible al empleador" / "garantizado ante tu trabajo" / "con plena validez frente a tu empleador". Es la afirmación de máxima exposición y hoy no se sostiene sin litigio.
- **SÍ** (literalmente cierto, ya es la leyenda del PDF en `receta.ts:770`): *"certificado médico emitido conforme al art. 210 LCT, desde plataforma registrada en ReNaPDiS, suscripto por médico habilitado en REFEPS, con firma electrónica con validez legal según Ley 25.506."* **Describir cumplimiento, no prometer oponibilidad.**
- La leyenda actual del PDF está bien calibrada (cita 210 / 27.802 / 407/2026 / 25.506 sin colgar de más). No agregarle "oponible al empleador".

## Acciones
- [ ] **Re-chequear después del 01/07/2026** si Salud dictó la resolución técnica (define la cuestión).
- [ ] Decisión de negocio: evaluar sumar **firma digital ONTI** al tipo "certificado" (única acción que lo vuelve FIRME sin depender de terceros). Recomendación legal: si el certificado de reposo va a ser producto destacado de cara al paciente, vale la firma digital.
- [ ] Pasar este análisis por un **laboralista matriculado** antes de cualquier afirmación pública de oponibilidad.

## Evidencia en el repo
- `src/app/terminos-medico/TerminosMedicoContent.tsx:46` — admisión de firma electrónica art. 5, sin certificador licenciado.
- `src/lib/pdf/receta.ts:177-187` — el tipo "certificado" renderiza tratamiento + reposo laboral (art. 210); `:765-770` leyenda y normas citadas.
- `src/lib/receta-constants.ts:1` — `PLATAFORMA_ID = "0270"`.
