# Firma electrónica de documentos médicos — hallazgo y remediación

**Fecha del registro:** 07/08/2026
**Base:** dictamen legal del 07/08/2026 + lectura directa del código.
**Estado:** remediación en curso. Este documento se escribe el mismo día del hallazgo.

> **Actualización del 07/08/2026 (tarde).** El criterio de este documento sobre
> los documentos históricos —no sellarlos, porque sería antedatar— fue
> **sustituido** por decisión del CEO y un segundo dictamen. Se aplica sobre ellos
> un **sello de integridad diferido**: la firma electrónica (art. 5) ocurrió al
> emitirse; lo que se consolida ahora es su evidencia criptográfica, con
> `firmado_at` real y las dos fechas visibles en la verificación pública. El
> encuadre completo, los límites y lo que NO se sella están en
> [`2026-08-07-sellado-diferido-documentos-historicos.md`](./2026-08-07-sellado-diferido-documentos-historicos.md).

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

### Corrección post-revisión: la firma cubre lo que el PDF imprime

La primera versión del PR firmaba `{id, tipo, diagnóstico, tratamiento, días de
reposo, contenido, paciente_id, medico_id, created_at}`: solo los **IDs** de
paciente y médico. Pero el PDF no imprime IDs — imprime nombre del paciente,
CUIL, sexo, fecha de nacimiento, obra social y nº de afiliado; nombre del médico,
matrícula y domicilio. Todo eso se leía en vivo de `pacientes` y `medicos` al
generar el PDF, y todo eso lo edita su dueño desde `/mis-datos` **después** de
emitido. Como el PDF se regenera en cada request:

1. El médico emite un certificado de reposo para "Juan Pérez" por 5 días. Firma OK.
2. El paciente cambia su `nombre_completo` (o su obra social, o su nº de afiliado).
3. Vuelve a abrir el PDF: sale con el dato nuevo, el mismo QR y el pie
   *"Firmado electrónicamente por Dr. X…"*.
4. El empleador escanea el QR y ve verde: *"su contenido no fue alterado"*.

Era el mismo modo de falla que el dictamen quería eliminar —la página afirmando
integridad sobre contenido que la firma no cubre—, y antes del PR no era
alcanzable solo porque no había ningún documento firmado.

**Solución:** al firmar se congela el juego exacto de campos que el PDF imprime
(`src/lib/firma/identidad.ts`), entra al hash y queda dentro de
`firma_digital.identidad`. El PDF de un documento sellado se renderiza **desde el
snapshot**, no desde las tablas vivas, y la página pública muestra el firmante
congelado. Tocar el snapshot sin la clave privada del médico rompe la
verificación: el estado pasa a "alterado". Si el snapshot no se puede construir,
**no se firma** (el documento queda sin sello, que es la verdad).

*Límite registrado:* se congela el **path** de la firma manuscrita, no la imagen.
Si el médico reemplaza el archivo en Storage, cambia el trazo impreso. Es su
propia firma sobre su propio documento.

### Qué NO puede hacer el endpoint de firma

`POST /api/documentos/firmar` sella únicamente documentos **clínicos**
(receta, indicaciones, certificado, orden — no las filas de tracking que otros
caminos escriben en `documentos`), **del médico de la sesión**, **sin sello
previo**, **emitidos dentro de los 30 minutos** y de un médico **aprobado y con
REFEPS validado** (cuentas de test exentas, igual que el constraint de DB).

La ventana de recencia existe por el punto 4 de este documento: sin ella, un POST
con `documentoIds` podía sellar hoy cualquiera de los 114 históricos, sin que
nadie los revisara — que es exactamente lo que se prohibió.

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

## 4. Decisión pendiente de Diego: el T&C del médico no existe

El checklist del dictamen (punto 3, identidad del firmante) pide el
consentimiento documentado donde consta que **el click del médico constituye su
firma electrónica**. Ese consentimiento **no existe hoy**, verificado contra
producción el 07/08/2026:

```sql
select tipo, count(*) from aceptaciones_legales group by 1;
-- datos_sensibles | 1108      ← único tipo. Ninguna fila 'tyc_medico'.
```

Ningún camino de la app inserta `tyc_medico` y `versiones_textos_legales` no
tiene esa versión. El log lo registra con honestidad
(`tyc_medico: null`, `tyc_medico_registrada: false`, más la lista de lo que el
médico sí aceptó), pero la consecuencia es de negocio, no de código: **la
atribución por sesión se apoya en un consentimiento que hoy falta**, y sin él la
atribución es más débil si un médico desconoce una firma.

Qué haría falta: texto de T&C para médicos con la cláusula de firma electrónica,
versión sembrada en `versiones_textos_legales`, y punto de aceptación en el
registro o en el primer login (con inserción en `aceptaciones_legales`). Es
trabajo chico; la decisión de redacción y de momento es de Diego + laboralista.

---

## 5. Pendientes

- **Aplicar `supabase/migrations/20260807_firma_por_sesion.sql` ANTES del deploy**
  (no después). Si el código sale primero, el log de firma falla y todos los
  documentos de esa ventana salen con la leyenda ámbar "sin sello": fail-safe
  para los datos, pero una farmacia o un empleador pueden rechazar por eso un
  documento recién emitido. La migración es segura de aplicar sobre el código
  viejo, así que el orden correcto no cuesta nada.
- ~~**Constancia de integridad de los 114**~~ → **RESUELTO por el sellado de
  integridad diferido** (ver el aviso del encabezado y
  `2026-08-07-sellado-diferido-documentos-historicos.md`). Las dos fechas
  verdaderas —"emitido el X / sello aplicado el Y"— se muestran en la página
  pública de verificación.
- **Re-emisión a pedido de certificados**: por el mismo médico, si el contenido
  tiene un error. Sigue vigente como vía de corrección; ya no como sustituto del
  sello. El aviso al profesional abre la ventana para pedirla.
- **OTP para certificados de reposo**: el modal (`ModalOTPFirma`) y los
  endpoints `/api/2fa/*` ya existen y funcionan; falta montarlo. Es el documento
  de máxima exposición (el empleador es un tercero adversarial).
- **Verificar `RENAPDIS_RL_NUMBER` en Vercel producción**: si falta, todas las
  recetas dicen "Inscripción en trámite" mientras CLAUDE.md afirma Plataforma
  0270. Confirmar contra prod, no contra `.env.local`.
- **Documentos que quedan sin firmar** porque el médico cerró el navegador antes
  de que saliera el pedido de firma: quedan "sin sello". El cron
  `documentos-sin-sello` (cada hora) los cuenta y avisa por mail — no los firma.
  Un cron no es el lugar para sellar: el sellado diferido es una operación
  deliberada, con lote, autorización y aviso al profesional.
- **T&C del médico con cláusula de firma electrónica** (punto 4 de arriba).
- **Gate de laboralista matriculado** sobre certificados de reposo (pendiente ya
  señalado en el dictamen del 27/06).

---

*Criterio asistido por IA, no asesoramiento legal vinculante. Los puntos 1, 2 y
la página de verificación son correcciones de afirmaciones falsas y no admiten
discusión legal. La atribución por sesión y el tratamiento de los certificados
de reposo ameritan OK de laboralista matriculado antes de cualquier afirmación
pública de oponibilidad.*
