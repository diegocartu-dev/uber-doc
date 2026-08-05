# Drenaje del registro médico — fotos pesadas (413) y firma (2026-08-01 → 04)

## Síntoma

Diego (01/08): "me parece raro que en unos días no se registraron médicos". Ningún
médico nuevo completaba el registro desde fines de julio. Al 04/08 había **13
usuarios con rol médico creados desde el 17/07 que nunca llegaron a tener ficha
en `medicos`** (quedaron a mitad del formulario de Fase B).

## Causa 1 — envío >4,5 MB → HTTP 413 (fix 01/08, PR #318-#320 aprox.)

Vercel corta cualquier body de más de ~4,5 MB con 413 **antes** de llegar al
server action. Verificado empíricamente contra producción: POST de 5 MB → 413,
3 MB → 200. El formulario aceptaba credencial 5 MB + firma 2 MB + foto de perfil
5 MB; una foto de credencial sacada con celular pesa 3-5 MB → el envío moría sin
mensaje útil y el médico abandonaba.

**Fix:** compresión en el navegador (`src/lib/imagenes/comprimir.ts`, canvas
1600px JPEG 0.82: 5 MB → ~400-800 KB legibles) aplicada a credencial y foto de
perfil + red de contención con mensaje en criollo si aun así supera 4 MB.
Se enviaron 12 mails de recupero a los médicos trabados (03/08).

## Causa 2 — subir imagen de firma: tope de 2 MB sin comprimir (fix 04/08, PR #330)

**La pista la dio un médico real.** Davide (usuario del 23/07, uno de los 12 del
mail de recupero) respondió por la Bandeja el 03/08: *"No me está registrando la
firma digital. Por eso no puedo proseguir llenando el formulario."*

El modo "Prefiero subir una imagen" del paso 3 (firma) quedó **fuera del barrido
de compresión del 01/08**: rechazaba en seco cualquier imagen de más de 2 MB
("La imagen no puede superar 2MB", texto chico y fácil de no ver). Una foto de
la firma sacada con celular pesa 3-5 MB → callejón sin salida. Y al tocar
"Continuar a la verificación" el error decía **"Dibujá tu firma"** aunque el
médico estuviera en modo subir — confusión doble.

### Evidencia empírica (sonda Playwright contra producción, cero escrituras)

Cuenta descartable creada con service role y borrada al final; el submit final
se interceptó y abortó antes del server (jamás se creó ficha). Sondas:
`sonda-firma.mjs`, `sonda-firma-touch.mjs`, `sonda-firma-fix.mjs` (raíz del repo).

| Prueba (pre-fix) | Resultado |
|---|---|
| Dibujar firma con mouse | ✅ funciona, la guarda deja pasar |
| Dibujar firma con touch (celular emulado, CDP) | ✅ funciona |
| Subir foto de firma de 3 MB | ❌ rechazada en seco |
| Finalizar tras el rechazo | ❌ "Dibujá tu firma" (modo subir) |

| Verificación (post-fix, en prod) | Resultado |
|---|---|
| Foto real de 11,6 MB en modo subir | ✅ aceptada (comprimida en el navegador) |
| Preview de la firma | ✅ visible |
| Guarda del submit | ✅ deja pasar; el envío llega al server action |

### Fix (PR #330)

- `FirmaCanvas` (registro) y `FirmaManuscrita` (perfil) comprimen con
  `comprimirImagen` **antes** del tope de 2 MB.
- El error del submit habla del gesto correcto según el modo (subir vs dibujar).
- `input.value` se limpia al rechazar (permite reelegir el mismo archivo).
- Topes server-side (`actions.ts`, `api/medico/firma`) intactos como backstop.

## Causa 3 — "Error al enviar el registro" con la ficha YA creada (fix 05/08)

Cazada por la instrumentación **en su primer día**, durante la prueba de registro
real de Diego (05/08): el evento `registro_medico_error` quedó grabado 2 segundos
DESPUÉS de que la ficha ya existía en `medicos`. Causa: el `redirect()` del server
action viaja como excepción de control (`NEXT_REDIRECT`) y el `try/catch` del form
la atrapaba como si fuera un fallo → cartel rojo "Error al enviar el registro.
Recargá la página" **sobre un envío exitoso**. Un médico real que ve eso cree que
falló y abandona, con la ficha creada y sin saberlo.

**Fix:** el catch deja pasar las excepciones con `digest` `NEXT_REDIRECT` (la
navegación a identidad se completa) y solo reporta los errores reales. Barrido del
patrón en el resto del código: era el único caller que envolvía una action con
redirect en try/catch.

## Regla que queda

**Todo formulario que reciba imágenes del usuario pasa por
`src/lib/imagenes/comprimir.ts` ANTES de cualquier chequeo de peso o envío.**
Un tope de peso sin compresión previa es un bug latente: las cámaras de los
celulares producen fotos de 3-12 MB y el usuario no tiene forma de achicarlas.

## Pendiente

- Respuesta a Davide por la Bandeja (borrador listo, espera OK de Diego).
- Observar si los 13 trabados completan el registro tras el fix + recupero.
