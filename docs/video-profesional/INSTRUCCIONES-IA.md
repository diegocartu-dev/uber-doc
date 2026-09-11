# Instrucciones para la IA que produce los videos

Copiá y pegá el bloque de abajo tal cual. Está escrito para que se entienda sin
conocer Docto, y para que no pueda mezclar una narración con la pantalla
equivocada.

---

```
Vas a producir dos videos instructivos para profesionales de la salud que usan
Docto, una plataforma argentina de telemedicina. El público son médicos, muchos
de ellos poco familiarizados con tecnología. Tono: claro, cercano, tuteo
argentino (vos, tenés, podés). Sin jerga técnica.

TE ENTREGO DOS GUIONES Y DOCE IMÁGENES. Los guiones son:
  GUION-1-CONFIGURAR.md  → video 1
  GUION-2-ATENDER.md     → video 2
Las imágenes están en la carpeta capturas/.

=== REGLA NÚMERO UNO, LA MÁS IMPORTANTE ===

CADA BLOQUE DEL GUION YA TIENE ASIGNADA SU IMAGEN, escrita en la línea que dice
"Imagen:". Usá EXACTAMENTE esa y ninguna otra. No las intercambies, no las
reordenes, no elijas vos cuál va mejor.

Si una narración habla de una pantalla y mostrás otra, el video enseña mal y el
profesional se pierde. Es el error más grave que podés cometer acá.

Antes de exportar, verificá bloque por bloque que la imagen en pantalla es la
que el guion nombra para ese bloque.

=== REGLA NÚMERO DOS: NO INVENTES PANTALLAS ===

Estas doce imágenes son fotos reales del producto. NO las recrees, NO las
redibujes, NO generes pantallas parecidas, NO uses capturas de stock ni mockups
de teléfonos genéricos. Si una pantalla no está entre las doce, ese momento se
narra sin imagen o con la imagen anterior en pantalla.

Tampoco cambies los textos que se ven adentro de las imágenes. Son los textos
reales del producto y el profesional los va a buscar tal cual en su teléfono.

=== REGLA NÚMERO TRES: LAS IMÁGENES YA VIENEN TRATADAS ===

En dos de las imágenes vas a ver una zona con un desenfoque suave, al pie de la
pantalla. Está puesto a propósito: ahí había un dato que no corresponde mostrar
porque no es igual para todos los profesionales.

NO la quites, NO intentes reconstruir lo que dice, NO la reemplaces, NO la
menciones en la narración. Tratala como parte de la imagen.

Tampoco apliques filtros, correcciones de color, nitidez ni mejoras automáticas
a ninguna imagen: están tal como se necesitan.

=== CÓMO ANIMAR ===

Son imágenes fijas de pantallas de celular. Para que no sea aburrido:
- Movimiento suave de acercamiento sobre la zona de la que habla la voz.
- Cuando el guion dice "A marcar", resaltá ese elemento: un círculo, un
  subrayado o un oscurecido del resto. Uno por vez, en el orden que dice el
  guion.
- Cuando la narración menciona un botón, que ese botón se ilumine en ese
  segundo, no antes ni después.
- Transición simple entre bloques. Nada de efectos llamativos.

Formato: vertical, 1080x1920, para ver en el teléfono. Las imágenes ya son
verticales de iPhone.

=== VOZ ===

Español rioplatense, ritmo pausado. El texto a leer es el que está bajo
"Narración:" en cada bloque, entre las comillas angulares. Leelo tal cual.
Las palabras en negrita son nombres de botones: pronunciálas con un poco de
énfasis, porque el profesional las va a buscar en su pantalla.

Lo que está bajo "A marcar", "Lo que se ve en pantalla", "Puntos a marcar" y
"Notas de producción" son indicaciones para vos: NO se leen en voz alta.

=== DURACIÓN ===

Video 1: unos 2 minutos. Video 2: unos 3 minutos.
Cada bloque tiene su duración sugerida entre paréntesis en el título. Respetala:
está calculada para que se pueda seguir sin pausar.

=== LO QUE FALTA, Y QUÉ HACER ===

Hay cuatro momentos que los guiones narran y para los que NO hay imagen:
  1. El WhatsApp que le llega al profesional (video 2, bloque 1)
  2. La videollamada con las dos caras (video 2, bloque 5)
  3. La pantalla final del paciente con sus documentos (video 2, bloque 7)
  4. El formulario de crear una agenda (video 1, bloque 3)

Para esos momentos: sostené en pantalla la imagen del bloque anterior mientras
la voz narra, o dejá un fondo limpio con el texto clave. NO los inventes ni los
recrees. Esas tomas se van a filmar aparte de un teléfono real.
```

---

## Para vos, Diego, antes de mandarlo

**Las doce imágenes que van adjuntas:**

| Archivo | Qué muestra | Va en |
|---|---|---|
| `v2-00-panel-del-profesional.png` | El panel, de donde arranca todo | Video 1, bloque 1 (apertura) |
| `v1-01-hub-como-atendes.png` | Las tres formas de atender | Video 1, bloque 1 |
| `v1-02-configurar-consulta-inmediata.png` | Precio, duración, horario, interruptor | Video 1, bloque 2 |
| `v1-03-agenda.png` | El calendario de la agenda | Video 1, bloque 3 |
| `v1-04-consultorio-particular.png` | El link privado, Copiar, WhatsApp | Video 1, bloque 4 |
| `v2-01-panel-paciente-esperando.png` | El panel con el paciente esperando | Video 2, bloque 1 |
| `v2-02-paciente-sala-espera.png` | El paciente esperando ser aceptado | Video 2, bloque 3 |
| `v2-03-esperando-pago.png` | "Esperando pago" con el reloj | Video 2, bloque 2 |
| `v2-04-paciente-falta-pagar.png` | "Falta un paso: pagá tu consulta" | Video 2, bloque 3 |
| `v2-05-lista-para-atender.png` | Lista para atender, con el botón de iniciar | Video 2, bloque 4 |
| `v2-06-consultorio-virtual.png` | El consultorio con las tres pestañas | Video 2, bloque 5 |
| `v2-07-documentar.png` | Documentar con "Volver a la llamada" | Video 2, bloque 6 |

**Lo que ya se resolvió sobre las imágenes:**

- **El porcentaje de comisión está difuminado** en las dos pantallas donde
  aparecía. Se ve una zona borrosa suave, no un rectángulo tapado: la pantalla
  sigue pareciendo natural. La IA tiene la orden de no tocarlo.
- **Las pantallas desprolijas se limpiaron en serio**, no se taparon. El cartel
  naranja de "consultas sin documentación entregada" y las cuarenta agendas de
  prueba acumuladas ya no están porque se limpiaron los datos viejos de la
  cuenta de prueba, y las pantallas se volvieron a capturar. Lo que se ve ahora
  es una cuenta prolija de verdad.
- **Las capturas largas están recortadas** a la parte que importa: el panel y la
  agenda medían más de cinco pantallas de alto.
