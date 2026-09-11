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

TE ENTREGO DOS GUIONES Y ONCE IMÁGENES. Los guiones son:
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

Estas once imágenes son fotos reales del producto. NO las recrees, NO las
redibujes, NO generes pantallas parecidas, NO uses capturas de stock ni mockups
de teléfonos genéricos. Si una pantalla no está entre las once, ese momento se
narra sin imagen o con la imagen anterior en pantalla.

Tampoco cambies los textos que se ven adentro de las imágenes. Son los textos
reales del producto y el profesional los va a buscar tal cual en su teléfono.

=== REGLA NÚMERO TRES: TAPAR EL PORCENTAJE DE COMISIÓN ===

Dos imágenes muestran al pie un bloque que dice:

  "¡Felicitaciones por tu categoría de Médico Fundador! Docto te descuenta una
  comisión de solo el 5% por consulta realizada; el resto va directo a tu
  Mercado Pago."

Las dos imágenes son:
  capturas/v1-01-hub-como-atendes.png       → el bloque está al pie, abajo de todo
  capturas/v1-04-consultorio-particular.png → el bloque está dentro de la tarjeta
                                               del link, debajo del texto gris

EN LAS DOS, TAPÁ ESE BLOQUE COMPLETO. Usá un rectángulo del mismo color de fondo
de la pantalla (gris muy claro, casi blanco) para que parezca que no está, o
recortá la imagen por encima de ese bloque.

Por qué: ese porcentaje NO es el mismo para todos los profesionales, depende de
la categoría de cada uno. La cuenta con la que se tomaron las fotos tiene una
condición especial. Si queda a la vista, el video le promete a todos un número
que puede no ser el suyo.

No lo reemplaces por otro número ni lo menciones en la narración. Simplemente no
se habla de comisiones en estos videos.

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

**Las once imágenes que van adjuntas:**

| Archivo | Qué muestra | Va en |
|---|---|---|
| `v1-01-hub-como-atendes.png` | Las tres formas de atender | Video 1, bloque 1 · **tapar comisión** |
| `v1-02-configurar-consulta-inmediata.png` | Precio, duración, horario, interruptor | Video 1, bloque 2 |
| `v1-03-agenda.png` | El calendario de la agenda | Video 1, bloque 3 · ver aviso abajo |
| `v1-04-consultorio-particular.png` | El link privado, Copiar, WhatsApp | Video 1, bloque 4 · **tapar comisión** |
| `v2-01-panel-paciente-esperando.png` | El panel con el aviso | Video 2, bloque 1 · ver aviso abajo |
| `v2-02-paciente-sala-espera.png` | El paciente esperando ser aceptado | Video 2, bloque 3 |
| `v2-03-esperando-pago.png` | "Esperando pago" con el reloj | Video 2, bloque 2 |
| `v2-04-paciente-falta-pagar.png` | "Falta un paso: pagá tu consulta" | Video 2, bloque 3 |
| `v2-05-lista-para-atender.png` | Lista para atender, con el botón de iniciar | Video 2, bloque 4 |
| `v2-06-consultorio-virtual.png` | El consultorio con las tres pestañas | Video 2, bloque 5 |
| `v2-07-documentar.png` | Documentar con "Volver a la llamada" | Video 2, bloque 6 |

**Dos imágenes que convendría volver a sacar antes de producir:**

- `v1-03-agenda.png` muestra cuarenta agendas de prueba acumuladas. Se entiende
  poco. Con la cuenta de prueba limpia queda mucho mejor.
- `v2-01-panel-paciente-esperando.png` tiene arriba un bloque naranja que dice
  "5 consultas sin documentación entregada", que es basura de las pruebas. En un
  video institucional queda mal.

Las dos las puedo volver a capturar limpias cuando quieras, en diez minutos.
