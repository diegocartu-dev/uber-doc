# Tablero único de gestión — `/admin/tablero` (04/09/2026)

**Estado:** en producción como ítem nuevo del menú del admin ("Tablero"),
**conviviendo** con `/admin` (Dashboard) y `/insights` ("Hoy") mientras Diego
lo valida. Cuando lo dé por bueno, los dos viejos se apagan y `/insights`
redirige.

Decisión que lo origina (Diego, 04/09): *"Quiero rehacer desde cero los
tableros de Docto [...] Un solo tablero, no dos."* y, para publicarlo:
*"podemos aplicarlo a un nuevo ITEM consulta en el menu, sin quitar lo que hoy
esta? osea mientras validamos conviven los dos?"*

La forma de construirlo es la de `MANUAL-TABLEROS.md` (la forma Validdar): las
preguntas del dueño, las reglas de los números y la gramática de diseño con la
paleta de Docto. Las decisiones con frase literal, la ronda de especialistas y
las correcciones de Diego están en `ESTADO_ACTUAL_DOCTO.md` §13.

## Qué muestra (de arriba hacia abajo)

1. **Período**: hoy · ayer · 7 · 14 · 30 días · desde/hasta libres, o chips de
   mes. Tocar un punto de la curva elige ese día, semana o mes.
2. **Seis números**, cada uno con QUIÉN (profesional, paciente, provincia):
   consultas · pacientes nuevos · búsquedas con alguien (liquidez) · conversión
   con oferta · cobrado y fee · esperan acción (solo lo que tiene reloj).
3. **Hoy y ahora**: en línea ahora, agenda de hoy, tira horaria de hoy y ayer
   (en línea por hora, búsquedas caídas en huecos), quién buscó hoy; al lado,
   "a quién le escribo hoy".
4. **¿Está girando?**: curva por día/semana/mes, composición de desenlaces con
   sus motivos, excepciones declaradas (intentos, reservas en curso, cuentas
   de prueba), lista una por una.
5. **¿Por qué con tanta oferta hay tan pocas consultas?**: búsquedas sin
   nadie, cobertura horaria de la CI, horas de CI por pedido, lugares
   ofrecidos y ocupación; embudo con el escalón "encontraron a alguien"; qué
   pasó con cada búsqueda; mapa hora × día de semana; ranking de profesionales.
6. **Lo que se pagó, ¿se atendió bien y quedó la plata?**: desenlaces de las
   pagas, cobrado/fee/devuelto por causa, dependencia de pocos profesionales.
7. **Campaña de activación y patrones**: listos que no ofertan (ordenados por
   "prendió alguna vez" y demanda perdida en su zona), dónde reclutar y a quién
   rescatar, escenario en pagos.
8. **Lo que todavía no se mide**, con lo que hace falta para medirlo.
9. **Fichas** en panel lateral: atención (búsqueda → elección → pedido → avisos
   → aceptación → pago → atención → cierre → documentos → después), profesional
   (quién es, su accionar, acciones de Docto con cero explícito, línea de
   tiempo), paciente y provincia. Pila de fichas para volver.

Todo el tablero se filtra al tocar un motivo, canal, especialidad, provincia o
profesional; cada filtro declara a qué vistas no llega. Toda tabla ordena y
filtra por columna y tiene buscador.

## Cómo está construido

- **`src/lib/tablero/cargar.ts`** (servidor, clave de servicio): lee las
  tablas con `traerTodo` (paginación real con `.range()` y `count: exact`, que
  lanza si trae de menos) y clasifica con el motor del repo: `clasificar.ts`,
  `plata.ts`, `reservas.ts`, `resultado-busqueda.ts`, `mp-cuenta.ts`,
  `perfil-medico.ts`. Filtro de cuentas de prueba bilateral. Cadena completa de
  `turno_origen_id`. Un pago se acredita a una sola búsqueda; un checkout
  abierto no es pago. De `medicos` viajan booleanos, nunca celular, DNI ni
  notas. Cualquier error de la base lanza.
- **`src/lib/tablero/vista.ts`**: LA función que agrega. Pura. La usan la
  pantalla, la ficha (con el filtro por profesional, por eso coincide con el
  ranking por construcción) y el script de identidades. Contiene el glosario
  único (desenlaces, motivos, estados) y las reglas de variación: con menos de
  10 casos, diferencia absoluta y sin color; color solo si la diferencia
  supera 2·√(a+b); tasas en puntos solo con ≥ 30 en el denominador y ≥ 5
  éxitos.
- **`src/lib/tablero/cobertura.ts`**: desde cuándo se mide cada cosa y las
  fechas (todo en fecha argentina). Sin cobertura no hay divisor ni cero.
- **`src/app/admin/tablero/motor.js`**: el mock validado por Diego, tal cual,
  montado en un contenedor y escuchando por delegación. No se reescribió en
  React a propósito: mientras el diseño se valida, la pantalla de producción
  es exactamente la validada y cada corrección del mock llega sin traducción.
  Cuando quede firme, se porta. Todo dato que entra al HTML pasa por `esc()`.
- **`scripts/probar-tablero.mts`**: identidades contra producción, se corre
  antes de cada deploy que toque `src/lib/tablero/`: partes = total; Σ por
  profesional = total; mes del tablero = motor llamado directo sobre filas
  crudas; rango = Σ días para las métricas aditivas; meses = rango
  equivalente; aislamiento de cuentas de prueba; plata (fee ≤ cobrado, nunca
  cobrado y devuelto a la vez); reservas y cadena; cobertura; embudo monótono
  y acreditación única; "ahora" = badges del sidebar. Imprime solo conteos.
- **`src/lib/tablero/vista.test.ts`**: las mismas identidades sobre datos
  sintéticos, en `npm run test:unit`.

## Bugs del motor detectados en el camino (pendientes, fuera de este PR)

- `clasificar.ts` decide "aceptada, sin pagar" antes de mirar `resuelta_por`:
  una cancelación del profesional sin pago se lee como abandono del paciente.
- `resultado-busqueda.ts` ignora `conAgendaTurnos`: "había médicos pero
  ninguno en línea" es cota superior (incluye a quien venía por un turno). El
  tablero lo declara al pie del embudo.
- La espera y la duración de una consulta no se miden: la entrada a la sala
  no se registra. El tablero lo dice en "lo que todavía no se mide".

## Revisión adversarial antes de publicar

**Sofía (textos), aplicado:** el pie ya no dice "mock"; "en línea hace más de
4 horas" en lugar de "sin aceptar nada" (eso no se mide); el estado de entrega
de los avisos se traduce (Twilio devuelve inglés); `reservado_pendiente` se
llama "Pendiente de pago" en todos lados (regla del 10/08); el interruptor
"Solo reales" que no hacía nada pasó a texto; vocabulario único (profesional,
sin nadie, en línea, devolución, provincia, turno pago, paciente, tipo, sin
respuesta, Mercado Pago, triaje); concordancia de singular y plural en toda la
pantalla; sin "reincidentes" ni "prendidos sin pedidos" con nombres en la
narrativa; la ficha de la atención dice "pago HH:MM · cierre · entrada a la
sala sin registro" en lugar de afirmar una espera; "suma = N" y los párrafos
metodológicos fueron a tooltips.

**Sofía, pendiente de Diego (son sus frases o el glosario del repo):**
- Títulos: "¿Giró…?" → "¿Cuántas consultas hubo, y más que antes?"; "¿Por qué
  con tanta oferta publicada hay tan pocas consultas?" → "¿Dónde se pierde la
  demanda?"; "…¿se atendió bien y quedó la plata?" → sin "bien" (la
  conformidad no se mide).
- "El profesional no sostuvo" / "El paciente no llegó" → "no entró" (lo que se
  mide es la sala). Son las etiquetas de `clasificar.ts`, el glosario del repo:
  cambiarlas ahí, no solo en el tablero.
- La fila "Sanciones: cero" se mantiene porque el manual la pide.
- "Fee Docto" es el único término en inglés que queda; es vocabulario de Diego.

**Roberto (correctitud y seguridad), aplicado antes del PR:**
- **XSS almacenado** (explotable apenas se publicara): nombres de pacientes
  (los edita el paciente), `metadata.medicoId` y `metadata.paso` de
  `eventos_funnel` (los escribe el cliente) llegaban al HTML sin escapar en
  tres lugares, y los `data-id` de los links no se escapaban. Fix en las dos
  puntas: todo dato escapa en el motor, y el cargador solo acepta un
  profesional elegido que exista en la lista y claves de triaje limpias.
  Además `/api/funnel/track` ahora sanea la metadata de los eventos del
  paciente antes de guardarla (UUID para `medicoId`, texto limpio, números y
  booleanos; el resto se descarta).
- **Puerta de la página**: dependía solo del layout de `/admin`, y en una
  navegación parcial del App Router el cliente puede declarar que ya tiene el
  layout. La página verifica el rol por su cuenta.
- **Paginación por cursor** en lugar de offset: con offset, una inserción
  concurrente duplicaba una fila y omitía otra; con cursor no. Una diferencia
  chica contra el `count` se registra, una grande lanza.
- **Lugares contados dos veces**: una cancelación del paciente re-ofrece el
  mismo lugar en otra fila; ahora un lugar es (profesional, fecha, hora).
- **Período por defecto**: los últimos cuatro meses de la ventana, no una
  lista fija que el 1/10 hubiera dejado afuera al mes en curso.
- **Payload**: se sacaron los campos derivados de `ciHoras` y `slots`.
- **Script de identidades**: se sacó una identidad que pasaba siempre y otra
  que no se podía verificar desde las unidades; ya no imprime montos.

**Roberto, colateral (fuera de este PR, auditoría aparte):**
- Ocho páginas hermanas de `/admin` tampoco verifican el rol por su cuenta.
- `authenticated` tiene UPDATE sobre todas las columnas de `pacientes` y
  `medicos`, incluida `es_cuenta_test`. No se probó si es explotable.
- Si `eventos_funnel` crece a decenas de miles de filas, agregar los lugares
  con una función en la base en lugar de paginar.

## Decisiones que esperan a Diego

1. Seis números en la franja, o cinco.
2. Rango contiguo de días en lugar de meses salteados.
3. Definición de "cobrado" (aprobado y no devuelto, o solo completadas) y de
   "aprobados" (reales sin baja, o con baja).
4. Registrar el azul profundo de los turnos (`#235391`) como `brand-deep` en
   el sistema de diseño.
5. Cuándo apagar `/admin` (Dashboard) y `/insights` ("Hoy"), y qué hacer con
   el `/admin` móvil actual (hoy muestra `MobileControlCenter`, que es la única
   pantalla del interruptor de emergencia).
