# Cómo se sirven los videos de capacitación

Dos videos para profesionales, producidos con los guiones de esta carpeta:

| Video | Guion | Duración | Peso |
|---|---|---|---|
| Cómo configurar cómo atendés | `GUION-1-CONFIGURAR.md` | 2 min 30 s | 7,8 MB |
| Atender una consulta de principio a fin | `GUION-2-ATENDER.md` | 3 min 46 s | 10 MB |

El segundo video cubre solo el flujo de consulta inmediata.

Los archivos originales pesaban 16 y 20 MB. Se recomprimieron el 15/09 con
`libx264 -preset slow -crf 28` (audio AAC 96k, faststart): la mitad de peso, sin
pérdida visible en el texto de las pantallas. Si se vuelve a producir un video,
misma receta.

## Las decisiones de Diego (15/09/2026)

- **Se ven en la pantalla "Configurá cómo atendés"**, en una sección "Cómo se usa
  Docto" al final: debajo de las tres tarjetas y de sus notas de precio y
  comisión, que hablan de las tarjetas y no de los videos.
- **No se mandan por mail.**
- **Solo los ve una cuenta aprobada.**
- **Que no se puedan compartir.** Ver abajo qué significa eso de verdad.
- Además hay un link a los videos en la pantalla final del onboarding. Aparece en
  sus dos variantes, "¡Listo!" y "¡Casi listo!", y quien deja la identidad para
  después lo vuelve a ver cada vez que retoma el wizard. No aparece en la instancia
  institucional.

Los títulos de las tarjetas son los mismos que el cuadro de título de cada video.
La tarjeta, el encabezado del reproductor y lo primero que muestra el video dicen
lo mismo, para que nadie dude de si abrió el video correcto.

## Dónde está cada cosa

| Qué | Dónde |
|---|---|
| Catálogo, gate de aprobación y plazo del link | `src/lib/capacitacion.ts` |
| Pruebas del gate | `src/lib/capacitacion.test.ts` |
| Ruta que firma el link | `src/app/api/medico/capacitacion/[video]/route.ts` |
| Tarjetas y reproductor | `src/app/medico/como-atendes/VideosCapacitacion.tsx` |
| La sección en la pantalla | `src/app/medico/como-atendes/page.tsx` |
| Link del cierre del onboarding | `src/app/medico/onboarding/OnboardingWizard.tsx` |
| Bucket | `supabase/migrations/20260915_bucket_capacitacion_profesionales.sql` |
| Portadas | `public/capacitacion/` |

## Cómo funciona

1. Los archivos viven en el bucket **privado** `capacitacion-profesionales`, sin
   ninguna policy. Nadie lo lee con su propio token: solo el servidor.
2. La pantalla muestra la sección solo si la cuenta está aprobada:
   `verificado`, `estado_registro = 'aprobado'` y **no dada de baja**. La baja es
   blanda y no toca las otras dos columnas, por eso se mira aparte.
3. El reproductor **no conoce la dirección del video**. Pide
   `/api/medico/capacitacion/empezar` o `/consulta`, y esa ruta vuelve a comprobar
   sesión y aprobación desde cero. Esconder la sección en la pantalla esconde el
   botón, no el archivo: por eso el gate está en los dos lugares.
4. Si pasa, la ruta redirige a una dirección firmada que caduca a las dos horas.
5. Encima del video va el nombre de quien lo mira, cambiando de lugar cada tanto.

## Lo que se puede prometer y lo que no

**Se puede, con precisión:**

- La dirección que figura en la página, `/api/medico/capacitacion/...`, solo abre
  el video desde una cuenta aprobada con la sesión iniciada. Pegada en un chat no
  le sirve a nadie más.
- La dirección firmada a la que esa ruta redirige se ve en las herramientas del
  navegador. **Esa sí la abre cualquiera que la tenga, sin cuenta, hasta que
  caduca a las dos horas.** Conseguirla requiere abrir las herramientas técnicas
  del navegador.
- La página nunca recibe el nombre del archivo en el bucket.
- Una grabación de pantalla lleva el nombre de quien la sacó.

**No se puede, con ninguna tecnología:** impedir que alguien grabe la pantalla o
filme el monitor con el celular. Tampoco que alguien con conocimientos técnicos se
quede con el archivo mientras el link firmado está vigente: si el video se
reproduce, los bytes ya están en su máquina. Ni el DRM que usan las plataformas de
streaming impide la grabación.

Dos detalles con consecuencias:

- **La marca con el nombre desaparece si se usa la pantalla completa del
  sistema.** El reproductor ya ocupa toda la pantalla. En los navegadores basados
  en Chrome el botón de pantalla completa del sistema queda **visible pero gris y
  sin función** (`controlsList` lo deshabilita, no lo saca). Safari, el de iPhone
  incluido, y Firefox lo muestran activo: ahí, si alguien lo toca, la marca no se
  ve. Sacarlo del todo exigiría controles propios, que no vale la pena.
- **Por qué el link dura dos horas y no cinco minutos.** El navegador pide el
  video por pedazos a medida que avanza, y cada pedazo vuelve a presentar la
  firma. Con cinco minutos, alguien que pausa o deja la pestaña abierta se queda
  con el video cortado a la mitad. Bajar el plazo no protege más: cualquier plazo
  que alcance para mirar el video alcanza para pegarlo en un chat.

## Cómo reemplazar un video

1. Subir el archivo nuevo al bucket con **otro nombre**, por ejemplo con la fecha:
   `v1-configurar-2026-10-01.mp4`.
2. Cambiar `archivo` en `src/lib/capacitacion.ts`, y `duracion` si cambió.
3. Si cambió el cuadro de título, regenerar la portada en `public/capacitacion/`.
   Deuda conocida de los videos actuales: su cuadro de título no usa la tipografía
   Inter del producto. La portada es ese mismo cuadro, así que se corrige cuando se
   vuelva a producir el video, no antes: una portada distinta del video confunde.
4. Deploy. Recién después borrar el archivo viejo del bucket.

**Nunca pisar el mismo nombre.** El borde de la red de Supabase sigue sirviendo la
versión vieja un rato aunque el objeto se haya borrado: medido el 14/09. Un nombre
nuevo no tiene esa caché.

Antes de subir, comprobar que el archivo está preparado para streaming, o sea con
el índice al principio. Los dos actuales lo están. Si uno nuevo no lo está, se
arregla sin tocar la imagen:

```bash
ffmpeg -i entrada.mp4 -c copy -movflags +faststart salida.mp4
```

## Verificado contra producción (15/09/2026)

| Prueba | Resultado |
|---|---|
| Bucket después de la migración | privado, tope 50 MB, solo mp4 |
| Dirección pública directa al archivo | cerrada |
| Pedido con la clave anónima que tiene cualquier navegador | cerrado |
| Link firmado, pedido de un pedazo del medio | sirve el pedazo, tipo video/mp4 |
| Policies existentes de Storage | todas acotadas a su propio bucket: ninguna abre este |
