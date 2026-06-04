# Nova como manual ilustrado — Diseño

> **Decidido por Diego (04/06/2026).** Diseñado por @sofia (UX + contenido) +
> @marcos (arquitectura), integrado por Cortana. **APROBADO.** Este es el documento
> de diseño para la implementación.

---

## 1. Concepto

La ayuda de Docto **NO es videos ni IA generativa.** Es **Nova** —el asistente que
el médico ya conoce— sirviendo **cuentitos ilustrados curados**: secuencias de pasos
con **foto señalada + texto corto**, que el médico recorre a su ritmo.

**Por qué así (las decisiones de fondo):**
- **No videos in-app:** si un médico necesita un video para usar una pantalla, eso
  es un bug de diseño, no de tutorial. Lo intuitivo (modelo MP) va primero. Los
  videos quedan para **adquisición** (landing /medicos, redes), no para enseñar a usar.
- **No IA generativa en el contenido:** en una app médica, una IA que alucina y dice
  "tocá acá" sobre un botón que no existe destruye la confianza para siempre. El
  contenido curado **no puede equivocarse.**
- **El help-seeking es real** (la gente va a YouTube/ChatGPT igual). En vez de
  perderlos afuera, **Nova es el canal de ayuda adentro** → los retenemos y la IA a
  la que iban a recurrir es la nuestra.

**Ventajas:** cero alucinación · cero costo de tokens · fácil de mantener · reusa
Nova (persona + chat + TTS) · diferencial que nadie tiene.

## 2. La mecánica

Un **cuentito** = secuencia de **burbujas de Nova**, cada paso:
**foto arriba** (recorte enfocado, señalada) → **texto corto** (un verbo, ≤140 chars)
→ botón **"Siguiente →"**. El médico avanza a su ritmo; cada paso queda en el hilo
para releer; cierra con **"Listo ✓"** + una felicitación, y **encadena** al cuentito
siguiente relevante.

**100% del lado del cliente** (no toca `/api/nova/chat`): el avance es un `setState`
local que empuja el próximo paso al array `mensajes`. **Cero tokens, cero latencia,
cero alucinación.** Reusa las burbujas y el mecanismo de `opciones`/`opcionElegida`
que el chat **ya tiene** — solo se le suman imágenes.

## 3. Decisiones de diseño (resueltas)

| Tema | Decisión |
|---|---|
| **Señalador** | **Quemado en la foto** (no runtime). El equipo de contenido anota el recorte → garantiza que cae justo. Siempre **azul #378ADD** (halo/flecha/marco), **nunca verde** (el verde de las capturas reales es "estado"). Naranja #D85A30 solo para "cuidado, no toques". Uno por paso (dos máx). |
| **Hosting de fotos** | **`public/nova/manual/{id}/{n}.webp`** en el repo. Versionado, deploy atómico con el contenido, servido gratis por el CDN, sin Storage/auth. WebP livianas (datos móviles). |
| **Foto** | Recorte **enfocado** (no pantalla entera), aspect 4:3–16:10, borde 12px, **tap-to-zoom** (lightbox). Con **datos reales, un poco desordenada** (así se superpone mental con la pantalla del médico). |
| **Texto** | 1 verbo por paso, ≤140 chars, tono de colega ("vos"), nombres de botones **entre comillas tal cual aparecen**. |
| **Ritmo** | 3–6 pasos por cuentito. Botón "Siguiente →" / último "Listo ✓". "Atrás" como link gris discreto desde el paso 2. Target táctil ≥48px. |

**Esquema del contenido** (archivo TS estático, NO base de datos — versionado,
revisable por PR, testeable, cero runtime cost):
`src/lib/nova/manual/funciones-ayuda.ts`
```
type Paso = { texto: string; imagen: string; alt: string; ampliacion?: Paso };
type Funcion = { id: string; titulo: string; categoria: Categoria;
                 keywords: string[]; pasos: Paso[]; cierre?: {...} };
```

## 4. Capa conversacional — "nunca queda atrapado"

El cuentito NO encierra al médico en botones. La cajita de texto **sigue abierta** y
Nova **siempre responde**:

- **"Repetímelo / de nuevo"** → botón **"↺ Repetir"** + re-narra. ("Atrás" vuelve al paso previo.)
- **"No entiendo"** → cada paso difícil tiene una **versión ampliada curada**
  (`ampliacion`): botón **"No me quedó claro"** → más detalle / foto con más zoom /
  el paso partido en dos. Curado = siempre correcto.
- **"Andá más despacio"** → el cuentito **ya va al ritmo del médico** (nunca
  auto-avanza). Y la voz se puede **bajar de velocidad** (parámetro speed del TTS).

**El input abierto durante el cuentito:**
- Pedidos comunes (*repetí, más lento, volvé, ya sé*) → **matcher local**, instantáneo, **sin IA**.
- Cualquier otra cosa (*"¿y si cobro más?"*) → cae a la **Nova IA real** (con contexto).

→ Para el médico, Nova es **una persona paciente** que siempre le contesta. La línea
entre estático y generativo la ve solo el equipo técnico.

## 5. Puntos de entrada (contextual primero, sin saturar)

- **A) "¿Cómo funciona?" por sección** (la principal): link discreto gris junto al
  título de cada sección → abre Nova **ya con ese cuentito** (deep link
  `/medico/nova?walkthrough=<id>`). La ayuda aparece donde nace la duda.
- **B) Nova reconoce la pregunta:** el médico escribe/dicta "cómo armo un turno" →
  Nova **ofrece el cuentito** ("Te lo muestro con fotos 📸" + botón), no improvisa texto.
- **C) Grilla "¿Cómo funciona Docto?"** en el `MenuDrawer`: el índice completo por
  categoría, para repasar en frío.
- **NO** botones "?" flotantes permanentes en cada pantalla (ruido).

## 6. Set inicial de cuentitos

**Tier 1 (lanzamiento):** 1) Armar un turno · 2) Ponerme disponible para CI ·
3) Atender una consulta · 4) Hacer una receta · 5) Recorrer mi tablero.
**Tier 2:** Consultorio particular · Cobrar (MP) · Editar/pausar agenda · Certificado/indicación · Hablar con Nova.
**Tier 3:** Historia del paciente · Cancelar/reprogramar · Perfil + firma · Bloquear días.

**Piloto:** hacer el **#1 "Armar un turno" completo** (código + 6 fotos señaladas),
validarlo con un médico real, y recién ahí escalar — los otros son molde.

### Ejemplo completo — "Armar un turno" (6 pasos)
Apertura: *"Dale, te muestro paso a paso. Son 6 pantallitas 👇"* · **Empezar →**
1. *(halo en "+ Nueva agenda")* — *"Entrá a Mi agenda y tocá **'+ Nueva agenda'**."*
2. *(campo Nombre)* — *"Ponele un nombre que reconozcas, como 'Semana laboral'. Elegí duración y valor."*
3. *(Desde/Hasta)* — *"Marcá desde y hasta qué día vale."*
4. *(días L-V)* — *"Tocá los días que atendés. **Un toque** = tu horario de siempre."* ← paso clave (el truco de los toques; tiene `ampliacion`)
5. *(+ Agregar franja)* — *"¿Mañana y tarde? Tocá **'+ Agregar franja'**."*
6. *(Guardar modelo)* — *"Tocá **'Guardar modelo'** y ¡listo!"* · **Listo ✓**
Cierre: *"¡Ya está! Tus turnos quedaron publicados."* · **[Ver cómo ponerme disponible]**

## 7. Arquitectura técnica (Marcos)

- **Registro:** `src/lib/nova/manual/funciones-ayuda.ts` (array estático). Matcher
  local puro en `src/lib/nova/manual/match.ts`. Test de integridad
  `funciones-ayuda.test.ts` (ids únicos, imágenes existen) que corre en CI.
- **Chat** (`src/app/medico/nova/page.tsx`): extender `MensajeChat` con
  `imagen?`, `imagenAlt?`, `manual?: {funcionId, pasoActual, totalPasos}`. Render
  `<img>` plano (no next/image) en la burbuja nova. Guarda en `elegirOpcion`: si el
  mensaje es `manual`, llamar `avanzarManual` (client-side) en vez de `enviarMensaje` (LLM).
- **Serve = retrieval estático**, NUNCA `/api/nova/chat`. `/api/nova/tts` se reusa
  tal cual (narración opcional por paso, respetando voz silenciada).
- **Guardrails:** nunca rutear el avance por el LLM; nunca mandar `imagen` en el
  `historial` al LLM (el map ya filtra a `role`+`content`); no DB ni Storage; no LLM
  para el routing del manual.

## 8. Plan de construcción (olas)

1. **Ola 1 — Motor:** registro + extensión de `MensajeChat` + render de burbuja con
   foto + mecánica Siguiente/Atrás (client-side) + el cuentito #1 cargado.
2. **Ola 2 — Capa conversacional:** botón Repetir + versión ampliada ("No me quedó
   claro") + matcher local + fallback a la IA real + control de velocidad de voz.
3. **Ola 3 — Puntos de entrada:** "¿Cómo funciona?" contextual (deep link) + la grilla en el menú.
4. **Contenido + validación:** las **6 fotos señaladas** de "Armar un turno" (las
   genera Diego/Sofía) → validar el piloto con un médico real → escalar al resto del Tier 1.

> **Lo único no-código:** las fotos señaladas. El motor se construye con contenido de
> ejemplo y Diego/Sofía cargan las capturas reales.

### Checklist para las 6 capturas reales de "Armar un turno"
Reemplazan a los placeholders `public/nova/manual/armar-turno/{1..6}.webp` (mismo
path, mismo número = mismo paso). Verificar con `npx tsx scripts/verify-manual-imagenes.ts`.
- **Contrato:** `N.webp` = `pasos[N-1]` del registro. El rótulo interno y el texto del paso deben coincidir.
- **Paso 4 (días):** la captura debe mostrar la pantalla **real**, con el miércoles rotulado **"X"** (no "M" — la maqueta dice "M M", el componente real usa L M **X** J V S D). Es el paso más confuso; la foto tiene que superponerse con lo que el médico ve.
- **Paso 5 (franja):** capturar con **un día ya activo** — el botón "+ Agregar franja" solo aparece después de seleccionar un día con horario base.
- **Señalador:** quemado, azul #378ADD, nunca verde. Uno por paso.

## 8.bis Estado de implementación

- **Ola 1 — Motor:** ✅ en `main` (PR #152). Registro estático + burbuja con foto +
  contador + Siguiente/Atrás/Listo + deep link `?walkthrough=` + narración TTS por paso.
- **Ola 2 — Capa conversacional:** 🔵 en review (`feat/nova-manual-ola2`).
  - "↺ Repetir", "No me quedó claro" (ampliación **inline**), "Más despacio"
    (velocidad TTS 1 ↔ 0.75, persistida) en una fila de controles **separada de la
    navegación** (no consumen el paso, solo en el paso activo).
  - Navegación primaria (Siguiente/Listo/Empezar/encadenar) → **azul relleno**;
    "← Atrás" → borde azul.
  - Input abierto: `matchControl` intercepta los controles por voz/texto con cuentito
    activo; el resto cae a la Nova IA real.
  - **Target táctil de los botones del manual = 48px** (spec §3/§6, médico de 70).
    Los botones de confirmación de acción de Nova quedan en 44px (otro flujo).
  - Audio: lo que el médico pide a mano (Repetir, abrir ampliación) suena **aunque
    la voz esté en silencio global** (el silencio es solo para la narración automática).
  - **Decisiones de síntesis:** ampliación inline (no burbuja nueva); `matchFuncion`
    **no** se cablea en el interceptor (entrada por lenguaje natural = Ola 3, para no
    secuestrar acciones reales como "armá un turno" en chat libre); "Más despacio" en
    la fila de controles (no header).
- **Ola 3 — Puntos de entrada:** ⬜ pendiente. Link "¿Cómo funciona?" contextual +
  grilla en el menú + `matchFuncion` para que Nova **ofrezca** el cuentito.

## 9. Por qué es un diferencial
Ayuda **ilustrada + curada + segura + conversacional**, servida por la propia IA del
producto. Construye confianza en Nova (porque nunca se equivoca), y esa confianza se
transfiere a las features generativas reales de Nova. Barata de hacer y mantener.
Nadie en telemedicina argentina tiene esto.
