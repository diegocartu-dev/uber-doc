# Manual de tableros — la forma Validdar

> Para pegar en la sesión de otro proyecto (Docto, o el que venga) cuando haya que construir o rehacer un tablero. Es el destilado de cómo construimos **Reportes** en Validdar entre el 31/08 y el 02/09/2026, con las reglas que salieron de errores reales. Adaptar la jerga del dominio (en Docto no hay "licencias" ni "empleados": hay consultas, médicos, pacientes, tiempos de espera), pero **la estructura, las reglas y el diseño son los mismos**. Así los tableros de todas las aplicaciones se parecen y se leen igual.

---

## 1. La filosofía: las tres preguntas del dueño

Un tablero no es una colección de gráficos: es una conversación con el dueño de la operación, en este orden y en una sola página con scroll:

1. **¿Cómo estamos?** — los números grandes del período, el estado general contra el promedio, y la evolución mensual.
2. **¿Por qué estamos así?** — la composición (en qué terminaron los casos), los motivos, y **quiénes** (ranking), con filtros acumulables.
3. **¿Cómo lo mejoramos?** — dónde actuar hoy: la lista corta de cosas concretas, el escenario ("si estos 6 se comportaran como el resto, la tasa pasaría de X a Y") y los patrones a observar.

Y un cuarto nivel de profundidad: **la ficha** (en Validdar, el legajo del empleado; en Docto, la ficha del médico o del paciente). Desde cualquier número se llega a la ficha en dos toques, y la ficha muestra **todo el accionar de las dos partes**, incluido el cero explícito ("sanciones: cero" también es información).

La frase de Diego que lo define: *"quiero ver números claros arriba, estado general y evolución con selector de fechas. Eso está fijo. Si quiero ampliar info, toco teclas: es un tablero dinámico tipo Power BI. Si quiero ver más, scrolleo y veo esa historia… hasta llegar a la ficha. Ese es el tablero perfecto."*

## 2. La estructura de la página (de arriba hacia abajo)

**Cabecera fija (sticky)**
- Título del tablero + subtítulo con la **fórmula del número principal** en palabras ("la tasa divide días perdidos por jornadas de lunes a viernes × nómina del período"). Un número que no se puede auditar no sirve para discutir con nadie.
- **Selector de período**: chips de meses (12 visibles, flechas para ir más atrás), tocables uno por uno para sumar o quitar; atajos "Este mes · 3 meses · 6 meses · 12 meses"; toggles de exclusiones (en Validdar: "Incluir vacaciones").
- Pastilla de **estado general**: "Por encima / En / Por debajo de su promedio" (comparación contra el promedio de la ventana).
- **Franja de 4-5 indicadores** con número grande, etiqueta en mayúsculas chicas y una línea de contexto debajo (la base del cálculo o la variación vs. período previo equivalente). El último indicador, destacado en color de acento, es el **"esperan acción"** (lo que alguien tiene que hacer hoy).
- Debajo, una línea con el período elegido y los **filtros activos como chips quitables** de a uno, y "limpiar filtros".

**Sección 1 · ¿Cómo estamos?**
- Izquierda (7/12): **curva de evolución mensual** con puntos tocables (tocar un punto lo suma o lo quita del período). Con filtros activos, la curva muestra el subconjunto filtrado. Meses con datos de otra fuente se marcan con círculo abierto.
- Derecha (5/12): **composición** ("¿en qué terminaron esos N días?") — barra apilada + lista con número y porcentaje. La suma tiene que dar el número grande de arriba, siempre.
- Abajo, ancho completo: **por motivo** — barras horizontales tocables (tocar un motivo filtra todo el tablero), con "N · % · casos" a la derecha; los sectores/áreas como chips debajo, también filtrables.
- Filas informativas al pie de la sección para lo que se excluye a propósito (vacaciones, sanciones), con el link "incluirlas" o "ver tablero de …".

**Sección 2 · ¿Por qué estamos así?**
- Un bloque "**lo que midió el sistema**" con los indicadores propios del producto (en Validdar: avisos fuera de plazo, controles de reposo, señales documentales, controles médicos). Cada señal lleva su evidencia; la decisión es de la empresa.
- **Ranking** ("quiénes"): tabla ordenable por 3 criterios (cantidad, frecuencia, lo grave), con barra proporcional y chips de estado. Cada fila: `+` para filtrar por esa persona sin salir, clic en la fila para abrir la ficha, "Ver ficha →" al hover.

**Sección 3 · ¿Cómo lo mejoramos?**
- Tres tarjetas: **quiénes mueven la aguja** (concentración + escenario), **dónde actuar hoy** (listas cortas con links que abren la ficha **en el lugar**, nunca navegan a otra pantalla), **patrones a observar** (informativo, sin acusar).

**Nivel 4 · La ficha** (panel deslizable sobre el tablero, con "← Volver al tablero" y "Ver los N meses" para abrir toda la ventana)
- Cabecera: nombre, identificadores, 4 tarjetas (total del período, comparación con la media, % del resultado bueno, señales).
- "**Su accionar a lo largo del período**": la síntesis comparada entre casos (no caso por caso).
- **Sanciones / acciones de la empresa** con cero explícito.
- **Una sola línea de tiempo** con TODOS los casos intercalados cronológicamente — los medidos por el sistema y los del registro previo, marcados por fuente.

## 3. Las reglas de los números (todas salieron de errores reales)

1. **Los filtros se acumulan, nunca son excluyentes.** Motivo × sector × persona × diagnóstico se combinan; los casos vivos se ven siempre completos.
2. **Una sola función agrega.** La capa de datos calcula por mes; una única función `vistaDeMeses(lista)` suma el conjunto elegido. Con un mes da exactamente el mes: no hay dos caminos que puedan divergir. Todo desagregado se recalcula desde la unidad real (el caso/la consulta), nunca desde totales.
3. **El total manda, el desglose aclara.** Si el período tiene datos de más de una fuente (lo medido por el sistema + el registro previo del cliente), el número grande es **la realidad del período** y al lado va la composición ("691 del registro previo + 94 medidos"). Cada fuente lleva su marca (°). Mostrar solo "lo nuestro" esconde la realidad; no marcar la fuente miente. Esta regla aplica **en cada indicador, ranking y ficha** — no solo en el titular.
4. **La información del cliente es de primera clase.** Si el cliente pasó su histórico es porque lo tiene validado. Se integra con su marca; jamás se muestra en gris chiquito, jamás con leyendas defensivas ("no informa", "sin desglose", "no lo analizamos"). No es una guerra entre antes y después.
5. **La tasa se divide por lo cubierto.** Solo cuentan en el divisor los días/jornadas que alguna fuente cubrió. Un mes en el que el sistema no existía no aporta divisor (diluye) ni se muestra como 0% (miente): se muestra "—" y se dice desde cuándo se mide. El mes en curso se mide **hasta hoy**, y la pantalla lo dice ("mes en curso al 02/09").
6. **Las variaciones comparan tasas, no totales.** "▼26% vs. mes anterior" compara la tasa de 2 jornadas con la tasa de 20, que es justo. Comparar días de un mes empezado contra un mes entero daba "▼93%": un número verde diciendo una mentira.
7. **La suma de cada sección da el número grande.** Si el titular dice 785, la composición suma 785 y los motivos suman 785. Si algo queda afuera, se dice cuánto y por qué.
8. **Sin datos ≠ cero.** Nunca dibujar 0% donde no hubo medición. "—" con explicación.
9. **Las excepciones se ven y se pueden incluir.** Lo que no cuenta (vacaciones, sanciones) aparece en su fila con el número y un toggle/link para sumarlo. Nada desaparece.
10. **Hora local, no UTC.** Toda fecha "hoy" se calcula en la zona del cliente (en Argentina, `America/Argentina/Buenos_Aires`). Un `toISOString()` a las 21:00 del último día hacía saltar el tablero al mes siguiente con todo en cero.
11. **Paginar las consultas.** PostgREST/Supabase corta en 1000 filas **sin avisar**: paginar con `.range()` siempre que la tabla pueda crecer.
12. **Vocabulario único (glosario).** Cada concepto tiene una palabra y un solo lugar donde se define (`documentoDe()`, `MOTIVOS_NJ`…). La ficha, el ranking y los reportes usan las mismas palabras y colores.
13. **El sistema no juzga: analiza e informa.** Todo hallazgo = evidencia objetiva + sugerencia; nunca lenguaje acusatorio. Lo que el sistema infiere y nadie confirmó se marca como "sin confirmar", nunca como hecho.

## 4. El diseño: misma gramática, paleta propia de cada producto

Cada aplicación conserva **su identidad**: Docto usa los colores de Docto, Validdar los de Validdar. Lo que se comparte es la **gramática** — qué rol cumple cada color, la escala tipográfica, la forma de los componentes y la regla de que el color codifica *estado* o *fuente* y nada más. Así los tableros se leen igual aunque no se vean idénticos.

**Los roles a cubrir con la paleta del proyecto** (mapear cada uno a un color de la marca; los valores de Validdar van solo como referencia de tono/contraste):

| Rol | Para qué | Referencia Validdar |
|---|---|---|
| `brand` | títulos, botón primario, barras principales, chip seleccionado | `#0F3D5C` |
| `brand-hover` | hover del primario y links | `#14537A` |
| `brand-deep` | fondos oscuros (cabeceras) | `#0C3049` |
| `brand-soft` | fondo del ítem activo / chip suave | `#E9EFF4` |
| `accent` | "esperan acción", links de acción, filtro por persona — **un solo acento** | `#0E7C86` |
| `accent-soft` | fondo del bloque de acento | `#EAF4F5` |
| `ink` / `ink-soft` / `ink-faint` | texto principal / secundario / metadatos | `#22303D` · `#5A6B7B` · `#8B99A6` |
| `surface` / `surface-alt` | tarjetas / rail, encabezados de tabla, bloques de contexto | `#FFFFFF` · `#F7F9FA` |
| `line` / `line-soft` | bordes / separadores de fila | `#EDF1F4` · `#F4F7F9` |
| `estado-ok` / `atencion` / `adverso` / `grave` / `neutro` | los ÚNICOS colores de significado; adaptarlos al tono de la marca pero mantener verde / ámbar / rojo / rojo oscuro / gris | `#3E9C63` · `#C98A16` · `#C5504F` · `#A1223C` · `#94A3B8` |
| `fuente-registro` | datos del registro previo del cliente (segundo tono de las barras) | gris `slate-300` |

**Lo que sí es igual en todos los productos**
- Tipografía: la del proyecto, pero con la **misma escala**: número grande 26 px bold; título de sección 17 px semibold con numerito en cuadradito; título de tarjeta 13 px semibold; cuerpo 12.5–13 px; letra chica 11–11.5 px. Números siempre con `tabular-nums`.
- Componentes: tarjetas `rounded-xl` con borde `line`; chips `rounded-full` (seleccionado = fondo `brand` texto blanco; no seleccionado = texto `ink-soft` con hover `surface-alt`); barras de **dos tonos** (marca + `fuente-registro`) cuando hay dos fuentes; pastillas de estado con fondo suave y borde del mismo tono.
- Layout: contenedor `max-w-6xl`; grid 12 columnas para curva (7) + composición (5); tablas con `overflow-x-auto` y ancho mínimo.
- Nada de color decorativo: el color codifica **estado** (ok / atención / grave) o **fuente** (medido / registro), y nada más. Un solo acento.
- Una frase de cierre al pie, en itálica y gris, con el principio del producto (en Validdar: "El sistema no juzga: analiza e informa.").

## 5. Cómo se construye (el proceso que funcionó)

1. **Mock primero, en HTML estático con datos reales o verosímiles**, para validar con pantallas (el fundador valida viendo, no leyendo código). Se itera el mock hasta que "el tablero perfecto" está en la pantalla. Recién ahí, código.
2. **Capa de datos separada de la pantalla**: `lib/tablero.ts` calcula por mes llamando al MISMO motor que usan los demás reportes (así los números no pueden divergir) y devuelve la ventana entera; el componente elige qué meses suma. Una consulta con la clave de servicio y filtro explícito de cliente (el super admin no pertenece a ningún cliente).
3. **Un componente cliente por pantalla**, con estado local (meses elegidos, filtros, orden, ficha abierta). Server component solo para cargar y pasar props.
4. **Script de identidades** (`scripts/probar-tablero.mts`) que corre contra la base real y verifica: partes = total; Σ filas = total; Σ casos = total; Σ categorías = total; tasa = días ÷ cubiertas; mes del tablero = motor llamado directo; aislamiento entre clientes. **Se corre antes de cada deploy.**
5. **Se publica siempre**, sin pedir permiso, y se avisa después con lo que cambió y qué números se van a ver distintos. Cada corrección del fundador se anota con su frase literal en `ESTADO.md` (qué está hecho, qué sigue, decisiones tomadas) para retomar entre sesiones.
6. **Revisión adversarial antes de publicar cambios grandes**: agentes que intentan romper la lógica, cazar falsas alarmas y revisar textos. Encuentran lo que el compilador no ve (hoy: un error de ejecución que hubiera tirado una pantalla entera).

## 6. Cómo pedirlo en la otra sesión (texto para pegar)

> Quiero rehacer el dashboard de Docto **desde cero** siguiendo el manual de tableros de Validdar que te pego abajo (`MANUAL-TABLEROS.md`). Mantené la dinámica y los datos propios de Docto (consultas, médicos, pacientes, tiempos, ingresos — lo que corresponda), pero aplicá **exactamente la misma estructura** (tres preguntas + ficha), **las mismas reglas de los números** (filtros acumulables, una sola función que agrega, el total manda y el desglose aclara, tasas sobre lo cubierto, variaciones por tasa, sin datos ≠ cero, hora local, paginación, glosario único) y **la misma gramática de diseño** (los roles de color mapeados a **la paleta de Docto** — no los hex de Validdar—, la misma escala tipográfica, los mismos componentes, un solo acento, color = estado o fuente). Proceso: primero un mock HTML navegable con datos reales para que yo lo valide en pantalla; después la capa de datos separada del componente, el script de identidades contra la base real, y recién ahí producción. Antes de publicar, una revisión adversarial. Anotá cada decisión mía en ESTADO.md con mi frase literal. Empezá proponiéndome cuáles son las **tres preguntas del dueño** para Docto y qué cinco números van en la franja de arriba, y esperá mi OK antes del mock.

---

*Origen: Validdar, sesión del 02/09/2026 (16+ tandas en un día). Si en el otro proyecto aparece una regla nueva, agregarla acá: este archivo es la fuente única de "nuestra forma".*
