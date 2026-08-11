# Rediseño "Cómo atendés" — config de CI y agendas del médico — SPEC APROBADA (Diego, 14/07/2026)

> **Estado: IMPLEMENTADO Y EN PRODUCCIÓN.** Aprobado detalle por detalle por
> Diego el 14/07/2026 (bosquejos) e implementado el 15/07 — ver el doc de cierre
> `docs/sprints/2026-07-15-como-atiende-parte2.md` y la pantalla viva en
> `src/app/medico/como-atendes/`. Parte 2 del rediseño del onboarding médico;
> parte 1 (registro) en `2026-07-14-rediseno-registro-medico.md`.
>
> **Este documento se archiva como registro del criterio de diseño, no como
> trabajo pendiente.** Se mergeó el 10/08/2026, tres semanas tarde: la spec había
> quedado en un PR abierto mientras el código ya estaba desplegado.
>
> Para el estado ACTUAL manda el código, no esta spec: hubo cambios después
> (entre otros, el gate de Mercado Pago al crear agenda, #294).

## Qué resuelve

El registro deja de pedir precio/duración/modalidad (parte 1). Toda la
configuración de "cómo trabajo" vive acá, **post-aprobación**, cuando el médico
abre su consultorio. La **modalidad deja de ser una pregunta abstracta del
registro** y pasa a ser **consecuencia de qué activa** en este hub.

Hallazgo del código actual: el precio YA vive por agenda (`FormularioModelo`,
`precio` editable por modelo) y CI tiene el suyo (`DisponibilidadMedico` →
`precio_consulta`/`duracion_consulta`/`disponible_desde`/`hasta`). El canal ya
existe: `canal_origen ∈ {clinica_virtual, consultorio_privado}`. Esta parte NO
inventa el precio-por-agenda; ordena y hace prolijo el momento de configurarlo.

## Regla transversal (aprobada)

**Nada viene prellenado. Todo campo es placeholder gris y obligatorio.** El
médico decide cada valor a conciencia, nunca hereda un default que no eligió
(evita activarse sin querer con datos que no puso). Valor sugerido: **$50.000
en gris** (placeholder, NO $15.000 — "sugiere una consulta regalada"). Los CTAs
y toggles quedan atenuados/bloqueados hasta completar los campos.

## Hub — "Configurá cómo atendés"

Aparece cuando el médico está aprobado (y con MP + firma listos). Subtítulo:
"Elegí cómo querés recibir pacientes. Podés activar las que quieras." Tres modos:

1. **Consulta inmediata** — "Pacientes que te consultan ahora, sin turno. Te
   avisamos cuando hay uno esperando." → botón "Configurar".
2. **Turnos programados** — "Pacientes reservan día y hora. Armás una o varias
   agendas, cada una con su valor." Dividido en DOS canales (tarjetas hijas):
   - **Clínica virtual** — "Pacientes que ingresan a Docto y ven tu perfil." →
     "Crear agenda".
   - **Consultorio particular** — "Tu consultorio virtual privado: solo te ven
     los pacientes a los que les compartís el link." → "Crear agenda".

Nota al pie: "El precio lo ponés en cada modo: uno para la consulta inmediata, y
uno por cada agenda que crees." Estados vacíos: "Sin configurar" / "Sin agendas".
Pendiente de decisión (no bloqueante): ¿Consulta inmediata también en consultorio
particular, o CI = solo clínica virtual (demanda del marketplace)?

## Configurar Consulta inmediata

- **Valor de la consulta** ($ 50.000 gris) + **Duración** ("Elegí", sin default).
- **Horario en que aceptás consultas** (desde–hasta, `--:--` gris). Hint:
  "Fuera de esa franja no aparecés como disponible, aunque dejes el interruptor
  en sí."
- **Interruptor "Disponible ahora"** — "Mientras esté activo, los pacientes te
  ven en la clínica y te pueden consultar." **Atenuado y apagado hasta completar
  valor, duración y horario** — nota: "Completá valor, duración y horario para
  poder activarte."
- **Guardar** (atenuado hasta completar).

## Crear agenda — MODELO B (decidido con Diego, con pros/contras)

**DECISIÓN: cada agenda tiene UN solo horario, aplicado a uno o varios días.** La
semana se compone apilando varias agendas simples. Se descarta el modelo "rico"
(horario propio por día + varias franjas por día dentro de una agenda).

**Fundamento (registrado para no re-litigar):**
- Editar/pausar es granular: cada bloque es su propia agenda (pausar "tardes" sin
  tocar "mañanas").
- Modelo mental claro: una agenda = un bloque ("Mañanas de consultorio",
  "Guardias"), no "mi semana entera".
- Mucho menos que construir y romper (sin arrays de franjas ni validación
  per-día).
- **Clave: el precio es por agenda** → "Mañanas $50k" y "Guardias $70k" son dos
  agendas con dos precios; el modelo rico (un precio por agenda) no permitiría
  cobrar distinto mañana vs guardia. Como el rediseño nació por el precio, B es
  el coherente.
- Consecuencia aceptada por Diego: atender **mañana y tarde el mismo día** = DOS
  agendas (9-13 y 15-19). Se comunica como ventaja, no límite.

**Formulario (todos los campos vacíos/obligatorios):**
- Chip de canal arriba (Clínica virtual · o · Consultorio particular · privado).
- **Nombre de la agenda** (placeholder "Ej: Mañanas de consultorio").
- **Valor de la consulta** ($ 50.000 gris) + **Duración** ("Elegí").
- **Días que atendés** — multiselección L M X J V S D, **nada preseleccionado**.
- **Horario** — UNO solo, "el mismo para esos días" (`--:--` a `--:--`).
- **Vigencia** (desde–hasta) — **calendario desplegable desde HOY**; las fechas
  pasadas quedan grises/no seleccionables. (Nota implementación: revisar el bug
  de agenda vencida — modelo activo con fecha_fin pasada deja de generar slots
  sin avisar; contemplar renovación/aviso.)
- Tip al pie: "¿Atendés mañana y tarde, o con otro precio? Creá otra agenda — así
  podés pausar o editar cada bloque por separado."
- **Crear agenda** (atenuado hasta completar).

## Consultorio particular (APROBADO — bosquejo aparte)

Pantalla del canal privado (`canal_origen = consultorio_privado`), con el link
como protagonista:

- Header "Consultorio particular" + subtítulo "Tu consultorio virtual privado.
  No aparece en la clínica de Docto."
- **Link para compartir** (destacado, arriba): la URL a NIVEL CONSULTORIO —
  **un solo link para todo el consultorio privado**, no uno por agenda —
  `docto.com.ar/dr/[slug]/consultorio`. Botones **Copiar** (azul) + **Compartir
  por WhatsApp** (verde #25D366, la vía natural de un médico argentino). Hint:
  "Solo quien tenga este link ve tus agendas de acá y puede reservar. Ideal para
  tus pacientes de siempre."
- Sección **"Tus agendas privadas"** + "Crear agenda" → mismo formulario modelo B
  con el chip "Consultorio particular · privado" (la única diferencia con clínica
  virtual). Cada agenda con **interruptor de pausa** ("pausa esta agenda sin
  borrarla") — patrón compartido con clínica virtual.

Decisiones registradas: link a nivel consultorio (no por agenda); Copiar +
WhatsApp como formas de compartir; toggle de pausa por agenda en AMBOS canales.

## Notas de implementación (para cuando Diego dé el GO)

- Reusa `canal_origen`, `precio` por modelo, y las columnas de CI existentes. El
  gran cambio es de UX/estructura, no de datos.
- Al mover precio/duración/modalidad FUERA del registro (parte 1): defaults/null
  en el INSERT del registro; el médico los define acá antes de poder activarse.
- Modelo B: el `FormularioModelo` actual ya es casi B (un horario por modelo) —
  hay que SACAR cualquier personalización per-día/franjas si se agrega, y dejar
  días-multiselect + un horario. Confirmar contra el form vivo.
- Gate de "disponible" (`perfilMedicoCompleto`) sigue exigiendo el resto (MP,
  firma). Este hub es el paso natural DESPUÉS de completar eso.
- Gates obligatorios al implementar: Sofía (UX), Roberto (que no se rompa
  reserva/doble-booking ni el índice parcial de turnos), Martín (lectura médico).
- El link del consultorio privado reusa el slug del médico
  (`dr/[slug]/consultorio`, que ya existe) — verificar que la página privada
  liste solo agendas `consultorio_privado` y no exponga al médico en la clínica.
- Pendiente menor de diseño: el estado "ya configurado" de las tarjetas del hub
  (resumen: precio, horario, agendas activas) — no bloquea la implementación.
