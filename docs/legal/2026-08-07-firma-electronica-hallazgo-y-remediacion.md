# Firma electrónica de documentos médicos — hallazgo y remediación

**Fecha del registro:** 07/08/2026
**Base:** dictamen legal del 07/08/2026 + lectura directa del código.
**Estado:** remediación en curso. Este documento se escribe el mismo día del hallazgo.

Este registro existe porque, si esto alguna vez se discute, la diferencia entre
"lo sabían y lo ocultaron" y "lo detectaron, lo registraron y lo remediaron en X
días" es todo el partido.

---

## 1. Los hechos, tal como se encontraron

1. **La firma electrónica nunca se ejecutó.** El motor criptográfico existía
   (`src/lib/firma/`: hash canónico SHA-256, RSA-SHA256, claves por médico,
   OTP, `firma_logs`), pero **ningún camino de la aplicación lo llamaba**.
   114 documentos entregados a pacientes reales, **0 firmados**.

2. **El PDF afirmaba que la firma existía.** `renderFooter()` en
   `src/lib/pdf/receta.ts` imprimía **incondicionalmente**:
   - *"Este documento ha sido firmado electrónicamente por [X]"*
   - *"Firma electrónica con validez legal según Ley 25.506"*

   El sello criptográfico sí estaba condicionado (`if (doc.firma)`), pero la
   leyenda de texto no. Cada PDF entregado —y cada descarga posterior— era una
   afirmación falsa sobre la naturaleza del propio instrumento.

3. **Aunque se hubiera llamado a firmar, el PDF no habría mostrado el sello.**
   `src/app/api/documentos/[id]/pdf/route.ts` buscaba la firma solo si
   `tipo === "receta"` y **en la tabla `recetas`**, donde nada del código
   inserta jamás. Todas las recetas viven en `documentos`.

4. **La página pública de verificación agredía al documento legítimo.** Un
   documento sin firma caía en el estado `invalida` y mostraba pantalla roja
   *"Firma no válida — No se pudo verificar la autenticidad"*. Un farmacéutico o
   un empleador que verificara uno de los 114 veía "sospechoso" sobre un
   documento real.

5. **La fecha de emisión no entraba al hash.** En un certificado de reposo el
   rango de días se calcula desde `created_at`: se podía correr la ventana de
   reposo sin romper la firma.

---

## 2. Las decisiones

### Se firma por atribución de sesión, no con OTP por documento

Ninguna norma (Ley 25.506, Ley 27.553, Dto. 98/2023, Dto. 407/2026) exige OTP ni
segundo factor por documento. El art. 5 pide datos electrónicos usados por el
signatario como medio de identificación: una sesión autenticada de un médico con
identidad validada biométricamente (Didit + RENAPER) y matrícula verificada
contra REFEPS es un sustrato **más fuerte** que un OTP por mail.

**El acto de voluntad es el click en "Finalizar consulta"**, con el contenido a
la vista. La firma se ejecuta server-side en ese mismo instante. No se agrega
fricción a un flujo que funciona.

Lo que sí cambia el eje: como el art. 5 in fine pone la carga de acreditar en
quien invoca la firma, **el log ES la defensa**. Por eso `firma_logs` pasa a
guardar el sustrato completo y a ser append-only y encadenado.

### No se firma retroactivamente ningún documento histórico

Firmar hoy con fecha de hoy y presentarlo como firmado al emitirse es antedatar.
**Nunca se escribe un `firmado_at` anterior al instante real de firma.** Los 114
documentos quedan como "sin sello", que es la verdad, y así lo dicen el PDF y la
página de verificación.

### Al paciente no se le dice que su documento "no era válido"

Fue emitido por un profesional identificado, con matrícula verificada, desde una
plataforma inscripta. Lo que cambió es la fuerza de la prueba técnica, no la
realidad del acto médico. **Aviso reactivo y dirigido, no masivo**: ningún
paciente sufrió daño, no hay incidente de datos personales que dispare deber de
notificación ante la AAIP, y un mensaje masivo generaría alarma desproporcionada
a un defecto que para el paciente es invisible. El único escenario con daño
concreto es un certificado que un empleador esté cuestionando: para eso, tener
lista la vía de re-emisión y responder caso por caso.

---

## 3. Qué se hizo (PR `fix/firmar-documentos-al-emitirlos`)

| # | Acción | Estado |
|---|---|---|
| 1 | Sacar la leyenda de firma del PDF cuando no hay firma | ✅ |
| 2 | Estado neutro "sin sello" en la página de verificación | ✅ |
| 3 | Congelar hash de integridad de los 114 (sin llamarlo firma) | ⏳ pendiente |
| 4 | Cablear la firma en el cierre de consulta, server-side | ✅ |
| 5 | Arreglar el lookup del PDF (`documentos`, todos los tipos) | ✅ |
| 6 | Meter `created_at` en el hash | ✅ |
| 7 | `firma_logs` append-only + encadenado + campos del checklist | ✅ |
| 8 | Montar el OTP **solo** para certificados | ⏳ pendiente |
| 9 | Firma digital real (AC licenciada) | ⏳ roadmap |

### Qué queda registrado en cada firma

`firma_logs`, append-only (trigger anti-UPDATE y anti-DELETE, `REVOKE` a los
roles de aplicación) y encadenado por médico (`log_anterior_hash` / `log_hash`,
con índice único que impide bifurcar la cadena):

- **Identidad:** snapshot de nombre, tipo y número de matrícula, jurisdicciones,
  `refeps_validado` + fecha, `identidad_validada` + fecha, `didit_session_id` y
  estado, `es_cuenta_test`, `user_id` de la sesión, y referencia a la aceptación
  de T&C del médico (versión, hash del texto, fecha, IP) — o constancia
  explícita de que no existe.
- **Integridad:** hash SHA-256 sobre serialización canónica que incluye `id`,
  tipo, diagnóstico, tratamiento, días de reposo, contenido, paciente, médico y
  **`created_at`**; firma RSA-SHA256; `clave_id` de la clave que firmó.
- **Tiempo y circunstancias:** `firmado_at` de reloj del servidor en UTC, canal
  (consulta/turno), ancla del evento clínico y su `completada_at`, IP y
  user-agent (ahora obligatorios), método de atribución.

### Regla de falla

La firma **nunca** bloquea ni revierte la entrega del documento. Si falla, el
documento queda guardado y visible para el paciente, sin sello, y tanto el PDF
como la página de verificación lo dicen. Además, si no se puede escribir el log,
la firma se revierte: preferimos "sin sello" (verdadero) antes que una firma que
no podríamos acreditar.

---

## 4. Pendientes

- **Constancia de integridad de los 114** (punto 3): calcular y guardar el hash
  del contenido actual en registro append-only, con fecha de hoy y **sin
  llamarlo firma**. Dos fechas verdaderas ("emitido el X / sello de integridad
  aplicado el Y") no son antedatado.
- **Re-emisión a pedido de certificados (36)**: por el mismo médico, que revise
  y reafirme el contenido. Que el sistema los auto-firme sin que el médico los
  mire sería cometer de nuevo el mismo pecado. Recetas (32): solo si una
  farmacia rechaza una vigente. Indicaciones (43) y órdenes (3): sin acción.
- **OTP para certificados de reposo**: el modal (`ModalOTPFirma`) y los
  endpoints `/api/2fa/*` ya existen y funcionan; falta montarlo. Es el documento
  de máxima exposición (el empleador es un tercero adversarial).
- **Verificar `RENAPDIS_RL_NUMBER` en Vercel producción**: si falta, todas las
  recetas dicen "Inscripción en trámite" mientras CLAUDE.md afirma Plataforma
  0270. Confirmar contra prod, no contra `.env.local`.
- **Documentos que quedan sin firmar** porque el médico cerró el navegador antes
  de que saliera el pedido de firma: hoy quedan "sin sello". Evaluar un repaso
  acotado, sin antedatar.
- **Gate de laboralista matriculado** sobre certificados de reposo (pendiente ya
  señalado en el dictamen del 27/06).

---

*Criterio asistido por IA, no asesoramiento legal vinculante. Los puntos 1, 2 y
la página de verificación son correcciones de afirmaciones falsas y no admiten
discusión legal. La atribución por sesión y el tratamiento de los certificados
de reposo ameritan OK de laboralista matriculado antes de cualquier afirmación
pública de oponibilidad.*
