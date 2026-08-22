# La espera de la consulta inmediata, acotada — plazo de 10 minutos y tope de 2 avisos

**Fecha de cierre:** 22/08/2026 · **PRs:** #432, #433, #435 (`fc8c972`) · **Migración:**
`20260821_recordatorios_espera.sql`, aplicada y verificada en producción el 22/08.

> Caso descripto en genérico a propósito: este repositorio es público. El detalle con nombres
> vive en la conversación con Diego y en el panel admin.

## El caso que lo destapó (18/08/2026)

A las 22:09 un paciente pidió una consulta inmediata a la única profesional que figuraba
disponible para su provincia esa noche. Ella no la aceptó. Y **nadie la cerró durante 11 horas.**

Lo que mostró el análisis contra producción (base + log real de Twilio):

- **El aviso SÍ salió.** El WhatsApp de "aceptá la consulta" se entregó a las 22:09:41 y el de
  "paciente esperando" a las 22:09:42. La profesional no estaba ignorando nada: con toda
  probabilidad dormía. El canal no falló — lo que falló fue lo que vino después.
- **17 mensajes encadenados** a la misma persona entre las 22:09 y las 8:30 del día siguiente,
  uno cada ~40 minutos, con los de las 2, 3, 4, 5 y 6 de la mañana incluidos. Todos entregados.
  El cron `repush-esperando` reinsistía mientras la fila de la sala de espera siguiera abierta, y
  **nada llevaba la cuenta** de cuántas veces ya se había avisado.
- **Figuró "disponible ahora" 14 horas seguidas** sin estarlo. El cron de auto-apagado
  (`apagar-disponibilidad`) trataba el estado `esperando` como "está atendiendo, no lo cortes",
  así que no la apagó. Recién pudo hacerlo 30 minutos después de que ella misma cancelara el
  pedido, a la mañana.
- **El paciente quedó retenido** mirando la sala de espera de alguien que no iba a venir, con
  la otra oferta de su provincia apagada.

Mientras tanto, la tabla `whatsapp_envios` existía con **cero filas**: el canal funcionaba pero
nadie escribía el registro, así que "¿le llegó el aviso?" sólo se podía contestar entrando a
Twilio. (Eso lo arregló #433.)

## El diagnóstico, en una línea

**La consulta inmediata tenía un plazo, pero era el reloj equivocado.** El de la CI **pagada**
existía desde el 09/08 (#384: 30 minutos desde el pago). El del pedido **sin aceptar** — que es
el que cubre este caso — no existía. Eran dos relojes distintos y sólo uno estaba construido.

## La decisión de Diego (21/08/2026)

> "No podemos mandar más de 2 recordatorios. El paciente no espera toda la madrugada. Se avisa
> una vez a los 10 minutos y listo: se cancela el pedido y se invita al paciente a elegir otro
> profesional por mensajería interna de la app. Se lo libera y a ese profesional se le apaga la
> consulta inmediata."

## Lo que se construyó

| PR | Qué | Detalle |
|----|-----|---------|
| #432 (21/08) | El pedido sin aceptar tiene plazo | `resolver-consultas-vencidas` lo cancela e invita al paciente a elegir otro profesional. Primera versión: 15 min. |
| #433 (21/08) | Cada WhatsApp deja registro | `whatsapp_envios` se escribe en cada intento, con resultado y error. El auto-apagado además avisa con sonido. |
| #435 (22/08) | Plazo a 10 min, CI apagada, tope de avisos | Los tres cambios de abajo. |

**Los tres cambios de #435:**

1. **El plazo baja de 15 a 10 minutos**, y el cron pasa de cada 10 a **cada 3 minutos**. Con el
   intervalo viejo, un plazo de 10 se convertía en cualquier cosa entre 10 y 20; ahora el peor
   caso es 13. De paso acelera la resolución de las CI pagadas vencidas, que comparten cron.
2. **Al profesional que no respondió se le apaga la consulta inmediata**, con mensaje interno
   explicando por qué, más push. Mientras siga publicado sin estar frente a la pantalla, el
   próximo paciente lo elige y repite la espera. El que está atendiendo a *otro* paciente no se
   desactiva: el filtro de "profesional ocupado" ya lo excluye antes.
3. **Tope duro de 2 recordatorios por paciente.** Contador `recordatorios_enviados` en
   `sala_espera_entradas`: nace con la espera y muere con ella. El plazo acota uno de los tres
   casos que cubre `repush-esperando`, pero no los otros dos — un turno con el paciente en sala,
   o una CI pagada sin video, pueden seguir vivos horas. Por eso el tope es un contador y no una
   consecuencia del reloj.

**Extensiones de alcance** (reportadas en el PR, aprobadas por Diego el 22/08 con el "aplicalo"):

- `esperando` sale de la lista de "consulta activa" del auto-apagado. Es la causa directa de
  las 14 horas.
- `resolver-consultas-vencidas` **no estaba en la lista de crons vigilados** por el watchdog. Es
  el que dispara reembolsos y el que libera al paciente: si Vercel dejaba de invocarlo, nadie se
  enteraba. Agregado.

## Verificación (22/08)

- **Migración:** aplicada vía Management API y **releída** de `information_schema` — columna
  `integer`, default `0`, `NOT NULL`, con su comentario. No se confió en la respuesta del
  comando.
- **Merge:** #435 en estado `MERGED`, commit `fc8c972` en `main`.
- **Deploy:** Vercel `Ready` en 57 s. Y la prueba que importa: se disparó el watchdog a mano y
  `cron_runs.version-viva` pasó a `fc8c972d18d7` a las 10:08 ART — **ese es el código que está
  sirviendo**, no un "el sitio responde". `deploy-prod = ok`.
- 501/501 tests, 3 nuevos que fijan el plazo como política de producto.

## Lo que queda abierto

- **La etiqueta del cierre de sala.** Cuando es el *sistema* el que libera al paciente por
  plazo, la fila de `sala_espera_entradas` se cierra con un motivo que dice que canceló él, y no
  es cierto. `cerrarEntradaSala` sólo admite tres motivos y ninguno es "venció el plazo". No se
  tocó porque puede mover reportes; **decisión pendiente de Diego.**
- **Avisarle a la profesional del 18/08** que los avisos nocturnos no vuelven a pasar. Es
  comunicación, no código: lo decide Diego (firma Valentina, sin explicación técnica).

## La regla que queda

Antes de endurecer cualquier espera o bloqueo, preguntar **cuál de los relojes** lo libera — y
verificar que ese reloj exista. Un plazo construido para la CI pagada no cubre el pedido sin
aceptar, y viceversa. Y todo aviso repetido lleva un tope explícito: "mientras siga abierto" no
es una condición de corte, es una madrugada de mensajes.
