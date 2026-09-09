# Mandato de tablas — aplicado a todas las pantallas que listan

**Fecha:** 08–09/09/2026
**Pedido de Diego:** *"quiero que veas esto y me digas que nos falta para tener todo lo que
sean tablas así"* → después de ver la muestra: *"medicos pasan a tablas · tabla demo
eliminala · y con el resto dale a todo"*.

El mandato entró tal cual al `CLAUDE.md`, sección **Mandato de tablas y listados**. Este
documento registra qué se aplicó, qué se encontró de paso, y qué quedó afuera.

## Qué se hizo

| # | PR | Pantalla | Qué ganó |
|---|---|---|---|
| 1 | #477 | — | Port de la lógica y del componente desde OverCall, con sus 44 pruebas, más una pantalla de muestra |
| 2 | #478 | — | Anchos de columna ajustables como en Excel y cabecera fija al scrollear |
| 3 | #479 | Pacientes | Tabla completa. La consulta traía **50 filas**; ahora trae hasta 5.000 |
| 4 | #480 | Bandeja | Tabla completa. La consulta traía 200 mensajes; ahora 2.000 |
| 5 | #481 | Médicos | Ordenaba **del más viejo al más nuevo** y su buscador no veía la mitad de la ficha |
| 6 | #482 | Médicos | Tabla completa. Las insignias de cobros, identidad y perfil ahora se filtran |
| 7 | #483 | Consultas | Tabla completa, columnas por solapa |
| 8 | #484 | Reembolsos | Tabla en las tres solapas |
| 9 | #485 | Cancelaciones | Tabla en las dos listas, y los desplegables de servidor se vuelven filtros de columna |
| 10 | #486 | Pacientes esperando | Tabla completa, y la urgencia deja de decirse sólo con color |
| 11 | #487 | Agendas institucionales | Tabla completa. **No tenía ni cabeceras** |
| 12 | #488 | /insights (4 tablas) | Tabla completa en modo oscuro |
| 13 | #489 | Tablero | Su motor propio en JavaScript plano pasa las cuatro trampas |
| 14 | este | — | Se va la muestra, el mandato entra al `CLAUDE.md` |

## Lo que apareció de paso, y no era cosmético

Diego preguntó si esto era cosmética. La respuesta honesta era que no: toca código que anda.
Cada pantalla confirmó la precaución.

- **Pacientes traía 50 filas.** El listado se veía completo y no lo era.
- **Médicos ordenaba al revés.** El profesional que se acababa de registrar quedaba último.
  Y su buscador miraba una parte de la ficha, así que buscar por matrícula no encontraba nada.
- **Cancelaciones tenía los indicadores peleados con la lista.** Los tres desplegables de
  arriba filtraban en el servidor: al elegir un tipo, el total bajaba pero los indicadores de
  al lado seguían contando el período entero; al elegir un profesional, el acumulado mezclaba
  los turnos de todos con las cancelaciones de uno.
- **Pacientes esperando tildaba filas invisibles.** "Tildar todo" tomaba la lista entera:
  con un filtro puesto se podían cancelar entradas que no estaban en pantalla.
- **Agendas no tenía cabeceras.** Seis columnas sin nombre. Y ordenaba por la fecha de
  vigencia, no por cuándo se cargó, teniendo la fecha de alta en la base sin leerse.
- **La urgencia y la disponibilidad se decían sólo con color.** Un punto rojo sin palabra al
  lado. Ahora las dos tienen su columna, con punto **más** texto, y se filtran.
- **El motor del tablero fallaba las cuatro trampas nombradas**: buscar sin acentos, orden
  humano, empates estables y cadena vacía tratada como vacío.

## Desvíos del orden por defecto, todos con el motivo escrito

La regla es lo más nuevo arriba. Cinco pantallas se apartan, y cada una lo dice en su código:

| Pantalla | Ordena por | Por qué |
|---|---|---|
| Deudas de reembolsos | quién debe más | la fila no tiene fecha; lo que se busca es a quién reclamar |
| Cancelaciones por profesional | tasa, de peor a mejor | es un acumulado, no un hecho con fecha |
| Pacientes esperando | quien lleva más tiempo | es una fila en vivo |
| Insights · Hoy | hora, de la mañana a la noche | es una agenda |
| Insights · Médicos | lo facturado | es un ranking |

## Lo que quedó afuera, y por qué

- **El filtro de columna del tablero** sigue siendo un desplegable o un campo de texto, no el
  panel de casillas con conteo. Da el mismo recorte y reescribir ese motor es rehacer una
  pantalla aprobada dos días antes.
- **`/admin/padron` no aplica.** No es un listado: es la vista previa de un archivo que se
  está importando. Sus filas son las líneas del archivo, no registros guardados.
- **Volver de "Desactivadas" a la lista viva, en Agendas.** La baja tiene botón; el alta de
  vuelta, no. Deuda declarada en el PR.
- **El techo de 500 filas por período en Cancelaciones.** Antes, elegir un profesional corría
  ese techo para él solo; ahora el techo es del período.

## Cómo se verificó

Tipos, lint y las 561 pruebas unitarias en verde en cada PR, más el gate de CI de cada uno.
**No se probó en el navegador**: son catorce pantallas y la verificación fue por compilación
y por revisión del código, no visual. Queda dicho porque un "anda" sin haberlo mirado sería
una suposición.
