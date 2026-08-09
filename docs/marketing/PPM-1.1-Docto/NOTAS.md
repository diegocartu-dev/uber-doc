# PPM 1.1 Docto — pieza para médicos · 1080×1920 (WhatsApp)

> **Nombre interno:** "PPM 1.1 Docto" (no "captación"). El término "captación" es
> jerga de marketing y suena a reclutamiento si lo lee un médico — por eso ni el
> archivo ni la pieza lo usan. El médico solo ve la imagen y el nombre de archivo
> `PPM 1.1 Docto.png`.

> **Estado (13/06/2026): pieza renderizada y completa — copy borrador puesto.**
> Ya no hay placeholders. El copy de los bloques abiertos lo propuso Code según el
> doc fundacional (ver "Copy borrador" abajo); es sustituible si el del otro
> proyecto difiere. Diego la envía él mismo (no se manda por mail desde acá).
> Flags a chequear antes de mandar: captura MP (monto ilustrativo) + "primeros 15"
> founder + gate legal de claims/marca.

## Cómo enviarla por WhatsApp (clave)

- **Una imagen NO es clickeable** en WhatsApp. Ningún PNG lleva a una web por sí
  solo. Para mandar a `docto.com.ar/medicos`, dos opciones:
  1. **Imagen + link pegado en el texto** del mismo mensaje (WhatsApp lo hace
     clickeable solo). Pegar el link CON UTM (ver Medición): el visible queda feo
     pero clickea bien; o usar `docto.com.ar/medicos` limpio si se prioriza estética.
  2. **Mandar el PDF**: el botón `docto.com.ar/medicos` es un link real clickeable
     (lleva el UTM `utm_medium=pdf&utm_content=ppm-1.1` embebido).
- **Calidad / "se ve pixelado":** WhatsApp recomprime lo que se manda como *foto*.
  Solución: mandar como **documento/archivo** (PNG 2x o PDF). El PDF es vectorial,
  nunca pixela.

## Copy borrador (propuesto por Code, sustituible)

- **Paso 3 (actualizado 13/06, aprobado por Diego):** "Ponete disponible — Tres
  formas de atender: Turnos Programados en la Clínica Virtual, Consultas Inmediatas
  o tu Consultorio Particular." (Antes repetía el bloque económico — redundancia que
  marcó Diego.)

- **Subtítulo gancho:** "Armá tu consultorio digital en Docto y atendé por video.
  Sin alquiler, sin secretaria, sin letra chica."
- **Bloque Nova:** eyebrow "Tu asistente Nova" · título "Armá tu agenda hablándole
  a Nova" · línea "Le decís cuándo querés atender y a qué precio. Ella crea los
  turnos por vos."
- **Bloque economía:** eyebrow "Cobrás directo" · título "Tus honorarios, sin
  intermediarios" · línea "El paciente paga y cobrás directo en tu Mercado Pago."
  (aprobada por Diego. Antes: "5% / primeros 15" → anti-venta; luego "obras sociales
  / 90 días" → se lee al revés; luego "la plata es tuya sin vueltas" → lunfardo.)
- **CTA:** "Sumate como médico fundador." · botón `docto.com.ar/medicos` ·
  microcopy "Sin abono, sin contrato. Te registrás en minutos."

Base en doc fundacional: §3.1 (Docto no toca la plata), landing /medicos ("Sin abono.
Sin contrato. Solo una comisión cuando atendés." + Nova arma agenda). Sin claims
prohibidos (no resultados, no emergencias, no receta-como-producto).

**Decisión Diego (13/06/2026):** NO comunicar "comisión 5% / primeros 15 fundadores"
en pieza. Razón: es fricción/anti-venta — el médico no sabe si entra en el cupo
("¿soy el 14 o el 17?") ni cuánto paga si no es fundador. Reemplazado por "Tus honorarios sin intermediarios" (filosofía §3.1). Esto fue un
**override del doc fundacional §5.2 + Anexo decisión 1** (que pedía comunicar el 5%
+ escasez); **el doc ya se actualizó a v1.2** con la nueva regla.

## Archivos

| Archivo | Qué es |
|---|---|
| `template-1080x1920.html` | Template editable de la pieza. Gancho, 3 pasos y URL cerrados; resto con copy borrador. El botón es un `<a>` real → clickeable en el PDF. |
| `PPM 1.1 Docto.png` | Render **alta resolución 2x (2160×3840)**. Mandar como DOCUMENTO, no como foto. |
| `PPM 1.1 Docto.pdf` | Versión vectorial (no pixela) con el botón `docto.com.ar/medicos` como **link clickeable**. Ideal para WhatsApp. |
| `capturas/captura-nova-agenda.html/.png` | Captura ficticia: Nova creando agenda con precio, réplica fiel de la UI real (`src/app/medico/nova/page.tsx`). |
| `capturas/captura-cobro-mp.html/.png` | Captura ficticia: notificación de Mercado Pago con el cobro acreditado. |
| `render.mjs` | Regenera los 3 PNG: `node docs/marketing/PPM-1.1-Docto/render.mjs`. Avisa si el contenido desborda el lienzo. |

Datos de las capturas: 100% inventados (agenda ficticia, monto de referencia del
doc fundacional). Cero datos de pacientes — la captura de Nova ni siquiera
involucra pacientes, es la agenda del médico.

## ⚠️ Flags para la revisión (decisiones de Diego)

1. **"Nova generando una receta" no existe en el producto.** Las acciones reales
   de Nova hoy (verificadas en `src/app/api/nova/chat/route.ts` y
   `confirmar/route.ts`) son solo de agenda: ver agenda, crear disponibilidad,
   bloquear período, cancelar y reprogramar turnos. Las recetas se generan en el
   workspace de consulta, sin Nova. Por eso la captura muestra **Nova creando
   disponibilidad con precio** — acción real, alineada con la landing `/medicos`
   ("Nova te ayuda a configurar tu agenda") y con el paso 2 del copy cerrado
   ("fijás tu precio, abrís tu agenda"). Si la campaña quiere mostrar receta:
   o se cambia el ángulo del bloque, o la feature se construye antes. No salió
   ninguna pieza mostrando a Nova recetando.
2. **Captura MP — validar contra la prueba real.** El literal de la notificación
   y el monto ($27.000 = neto médico de referencia sobre consulta de $30.000,
   doc fundacional §10) son verosímiles pero inventados. Cotejar con los
   screenshots reales de la prueba de pagos del 10/06 antes de publicar.
   Además: usa marca de un tercero (Mercado Pago) en pieza pública → **gate
   legal obligatorio** (Carolina).
3. **Logo:** usé la variante de la landing `/medicos` (wordmark "docto" en
   minúscula + estetoscopio). Ojo: `public/logo-docto.svg` dice "Docto" con
   mayúscula y otro color de estetoscopio — hay una inconsistencia de marca
   interna a resolver algún día; esta pieza sigue el doc fundacional (minúscula).

## URL de destino (definida)

**`https://docto.com.ar/medicos`** — landing de médicos existente, visible en el
botón CTA de la pieza. Si el visitante ya es médico logueado, redirige a su
dashboard (comportamiento actual de la página, correcto para este uso).

## Medición — propuesta

**Convención UTM para todo el GTM (usar desde ya):**

```
https://docto.com.ar/medicos?utm_source=whatsapp&utm_medium=imagen&utm_campaign=medicos-founders-v1
```

- `utm_source` = canal de distribución (whatsapp, instagram, prensa…)
- `utm_medium` = formato (imagen, pdf, story…) — el PDF de respaldo usará `pdf`
- `utm_campaign` = `medicos-founders-v1`

**Cómo circula:** la imagen muestra la URL limpia (`docto.com.ar/medicos`, ya
cerrada en el botón); el **caption del mensaje de WhatsApp** lleva el link con
UTM. Quien hace click queda atribuido; quien tipea entra directo — y como
`/medicos` hoy casi no tiene tráfico orgánico, todo pico de visitas durante la
campaña es atribuible a la pieza con error mínimo.

**Estado real:** hoy `/medicos` no registra visitas en ningún lado (sin evento
funnel, sin Vercel Analytics instalado). Sin un cambio mínimo, no hay medición.
Opciones, de más a menos recomendada:

1. **Evento funnel propio (recomendada — 1 ticket chico, infra ya existente).**
   Un componente client en `/medicos` que postea `landing_medicos_view` a
   `/api/funnel/track` con `{utm_source, utm_medium, utm_campaign, referrer}` en
   metadata (mismo patrón `trackClient` que ya usa `TabCobros.tsx`). Requiere
   ampliar la whitelist CHECK de `eventos_funnel` → **migración SQL, que
   requiere OK de Diego antes de aplicarse**:

   ```sql
   -- Ampliar whitelist de eventos_funnel para tracking de landing médicos
   -- (lista vigente según 20260515_eventos_funnel_pago_events.sql + el evento nuevo)
   ALTER TABLE eventos_funnel DROP CONSTRAINT IF EXISTS eventos_funnel_evento_check;

   ALTER TABLE eventos_funnel ADD CONSTRAINT eventos_funnel_evento_check CHECK (
     evento = ANY (ARRAY[
       'mp_oauth_view_tab',
       'mp_oauth_start_click',
       'mp_oauth_callback_success',
       'mp_oauth_callback_error',
       'mp_oauth_disconnect',
       'session_expired_detected',
       'session_expired_background',
       'pago_creado',
       'pago_aprobado',
       'pago_rechazado',
       'pago_refund',
       'pago_chargeback',
       'landing_medicos_view'
     ])
   );

   COMMENT ON CONSTRAINT eventos_funnel_evento_check ON eventos_funnel IS
     'Whitelist de eventos permitidos — actualizado con landing_medicos_view (GTM médicos)';
   ```

   **Esta migración NO está creada ni aplicada** — requiere OK de Diego
   (protocolo de validación) y se crea como archivo en `supabase/migrations/`
   recién cuando se apruebe el ticket de tracking.

   Medición (cuántos entraron desde la pieza):

   ```sql
   SELECT count(*) FROM eventos_funnel
   WHERE evento = 'landing_medicos_view'
     AND metadata->>'utm_campaign' = 'medicos-founders-v1';
   ```

   Y el funnel completo (vista → registro médico → aprobado) se cruza por fechas
   contra la tabla `medicos`.

2. **Vercel Web Analytics (cero SQL, dashboard listo).** Habilitar en el
   dashboard de Vercel + `@vercel/analytics` en el layout. Mide pageviews y UTM
   out of the box. Contra: paquete nuevo en todo el sitio y datos fuera de
   nuestra DB.

3. **Variante link corto propio** (si se quisiera atribuir también a quien
   tipea): redirect `docto.com.ar/sumate` → `/medicos?utm_source=pieza&...` en
   `next.config`. Implica cambiar la URL visible del botón (hoy cerrada como
   `/medicos`), así que solo si Diego lo prefiere. **No** usar acortadores de
   terceros (bit.ly) — dominio ajeno en pieza de salud = desconfianza.

Ninguna de las tres está implementada: tocan producto y todo vuelve a revisión
antes. La pieza puede circular con UTM desde el día uno aunque el tracking entre
después — los links viejos quedan atribuidos correctamente apenas se active.

## Antes de enviar (decisiones de Diego)

1. **Captura MP:** notificación y monto ($27.000) son ilustrativos/inventados —
   no es un cobro real. Como ilustración en la pieza está OK; tener presente que
   el número es de referencia, no una promesa.
2. **Gate legal:** el doc pide revisión de claims + uso de marca MP antes de
   publicar. Diego decide si lo saltea para este envío.
4. Si cambia algún texto: editar `template-1080x1920.html` →
   `node docs/marketing/PPM-1.1-Docto/render.mjs`.

## Más adelante

- PDF de respaldo (mismo manual de marca; `utm_medium=pdf`).
- Tracking de `/medicos` (ver sección Medición) — no implementado aún.
