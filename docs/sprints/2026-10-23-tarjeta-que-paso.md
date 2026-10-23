# La tarjeta «Qué pasó» (23/10/2026)

## El problema (Diego, 23/10)
"Cada vez que entro a Docto a ver qué pasó, me encuentro con tableros que tienen muchísima información pero no dicen nada." El Dashboard decía "Consultas hoy: 1" sin decir si se atendió o se cayó; el Tablero contaba aceptadas y pagas, también sin desenlace; para saber qué pasó había que ir a Consultas y después a la solapa Historial. Pedido: "tarjetas claras donde ver qué está pasando de un solo vistazo", y "siempre primero hoy".

## Qué se hizo (PR #584)
Una tarjeta nueva, «Qué pasó», es lo primero que se ve en `/admin` y en `/admin/tablero`:
- **Hoy** (siempre primero), con la línea **Ahora**: pedidos de consulta inmediata que nadie aceptó todavía (con los minutos de espera) y atenciones en curso. Abajo, una línea por atención: hora · profesional → paciente · tipo y especialidad · estado con su punto de color · el porqué (solo si no se atendió). Lo más nuevo arriba.
- **Ayer**, igual.
- **Últimos 7 días**: cuántas, cuántas atendidas, cuántas caídas y por qué (cada motivo con su conteo), lo cobrado, y el link a Consultas.

Lo que se fue del Dashboard porque contaba sin decir qué pasó: "Consultas hoy", "En curso ahora", "Consultas en curso" y el gráfico de barras de 7 días. El Tablero no cambia: la tarjeta va arriba del motor.

## Una sola fuente
La fila del Historial (consultas + turnos, sin cuentas de prueba, sin reservas abandonadas, con el porqué de `diagnostico.ts`) pasó del endpoint a `src/lib/consultas/que-paso.ts` (`cargarAtenciones`), y el endpoint la llama desde ahí. Dashboard, Tablero e Historial muestran la misma fila: no pueden contradecirse. `cargarAhora` trae lo vivo; `resumirDia` y `resumirRango` (puras, tests en `que-paso.test.ts`) cuentan.

Palabras: el estado usa `ESTADO_LAB` del tablero (una palabra por cosa); el porqué es el texto de `diagnostico.ts`, el mismo del Historial. Colores: verde solo como indicador de estado (atendida), azul en curso, rojo falla de un proceso, gris lo que una persona decidió, naranja sin datos (los mismos que `COLOR_PORQUE` del Historial).

## Verificación
- `npm run test:unit` en verde (789), `tsc` sin errores en `src/`, lint limpio.
- Render estático del componente con datos de ejemplo.
- En producción, con sesión de admin: ver el cierre de este doc.

## Pendiente
- La ficha de cada atención no se abre desde la tarjeta (el Historial no recibe un id por URL). Si hace falta, va al mandato de tablas (la vista en la URL).
