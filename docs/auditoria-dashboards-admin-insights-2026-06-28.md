# Auditoría de dashboards — Admin + CEO/insights (28/06/2026)

Auditoría **read-only** (no se tocó código ni datos) de las pantallas de gestión, con lente de
**datos + gestión**, disparada por: *"es muy difícil auditar el sistema / saber qué pasa en el
día con la oferta; se ven cosas que no llevan a ninguna conclusión; los números no dicen si son
oferta o realizadas, ni de qué médico/especialidad"*. Cada afirmación está fundada en el código
real y verificada contra producción.

Método: 6 agentes (mapeo de cada métrica contra su query + auditoría por pantalla + síntesis).

---

## 1. Diagnóstico de fondo

No se puede "ver de una mirada qué pasa en Docto" por **4 defectos de raíz que se repiten en las
6 pantallas**, no por un bug puntual:

1. **Los números no declaran si son OFERTA o REALIZADA**, y casi siempre muestran *oferta
   disfrazada de demanda*. El gráfico "Total consultas" del admin grafica filas creadas/agendadas
   (incluye slots vacíos en estado `disponible`), no atenciones hechas — el código incluso calcula
   `completadas` y lo descarta.
2. **La oferta es anónima.** Salvo dos tarjetas, ninguna métrica dice de qué médico ni qué
   especialidad sale el número. El heatmap de "Oferta por horario" colapsa la identidad a un
   `Set(...).size`; el API ni siquiera selecciona `nombre`/`especialidad`.
3. **El filtro de cuentas test es inconsistente y silencioso.** Unas métricas excluyen test, otras
   no, y donde excluye no avisa. Con "Solo reales" (default) casi todo se va a 0 porque la base
   real es minúscula, y un 0 "no pasó nada" no se distingue de un 0 "lo único que hubo fue test".
4. **Hay métricas estructuralmente muertas e instrumentación faltante** que pintan semáforos
   verdes imposibles de poner en rojo. El CEO ve tranquilidad fabricada.

> Efecto neto: los dashboards son **logs abstractos sin conciliación**, no un tablero.

---

## 2. Los problemas más graves (verificados contra prod, ordenados por impacto)

1. **El gráfico "Total consultas" (admin) miente ~24x.** `src/app/admin/page.tsx:119-125` +
   `DashboardAdminClient.tsx:106` grafican `consultas creadas + turnos agendados de cualquier
   estado`, dominado por turnos en estado `disponible` (slots VACÍOS). Verificado: 7 días con ~92
   en barras, pero solo **6 consultas + 1 turno** realmente completados. El 26/06 la barra marca
   **24**; las realizadas fueron **1**. El dato correcto (`completadas`) ya se calcula pero no se
   grafica.
2. **GMV y comisión son plata teórica, no la que entró.** En las 4 pestañas: `GMV = completadas ×
   precio_consulta` (precio de LISTA actual) y `Comisión = completadas × $1.500`. Empírico: 26
   "completada" pero solo 5 con `mp_status='approved'`. "Diego Gonzalez": GMV lista $150.000,
   cobrado real $65.000.
3. **Los turnos cobrados aparecen TODOS como "Pendiente".** `atenciones/route.ts:42-43`: `cobroDe`
   marca pagado solo si `mp_status === 'approved'`, valor que ningún turno tiene (7 "completado", 0
   approved, $50.000 c/u). El canal turnos reporta cobranza cero.
4. **Dos semáforos verdes imposibles de poner en rojo.** "No-show médicos" filtra
   `estado='no_show'` (`hoy/route.ts:104`) y "Cancel. tardías" filtra `estado='cancelado'`
   (`:120`) — **ninguno de esos estados existe en `turnos`** (los reales: `cancelado_paciente`,
   `cancelado_medico`, etc.). Siempre 0 → siempre "OK". Un no-show o cancelación real nunca aparece.
5. **"Retención 100% vuelven" (verde "Buena") es n=1.** `hoy/route.ts:92-101`: con "Solo reales" la
   base de 30 días es **1 paciente real** (Pablo, 3 consultas) → 100%. Sin umbral mínimo de muestra.
6. **"Consultas hoy: 1" (admin) es una cuenta test** + mezcla zonas horarias. `page.tsx:68-69,131`
   suma consultas+turnos de cualquier estado, sin filtro test; el único "1" de hoy es de Dr. Docto
   Test. Además `consultas` filtra por `created_at` (UTC) y `turnos` por `fecha` (date AR) en la
   misma tarjeta.
7. **Toda la oferta de Docto = 2 médicas de Clínica médica, y ninguna pantalla lo dice.** Admin
   "Turnos libres" muestra "81 slots · 1 médico" sin nombre (todos de Veronica Pereira); Oferta por
   horario muestra "3 con agenda" anónimo (2 reales: Carina Gianserra, Veronica Pereira, ambas
   Clínica médica). Concentración de riesgo invisible.
8. **Bug de timezone sistémico en "Hoy"/"Historial".** Las ventanas de CI castean `'YYYY-MM-DD'`
   como timestamptz = medianoche UTC = 21:00 AR del día anterior (`admin/consultas/route.ts`,
   `hoy/route.ts:37`). "Hoy" arranca a las 21hs de ayer-AR.

---

## 3. Las preguntas que el CEO NO puede responder hoy

- ¿Cuántas consultas **reales** (no test, no slots vacíos) se completaron hoy / esta semana?
- De las de hoy, ¿cuántas fueron **CI y cuántas turno, y de qué especialidad**? — El split CI/Turno
  es ficticio (`canal_origen` es siempre `'clinica_virtual'`); la especialidad de turnos no existe
  como columna.
- ¿Cuánta **plata real** entró hoy/este mes y cuánto se llevó Docto de comisión?
- ¿Qué médico ofreció **Consulta Inmediata** hoy y por cuántas horas? — El log de disponibilidad CI
  tiene 10 eventos en toda su historia; el heatmap no distingue "nadie se puso disponible" de "no
  se instrumenta".
- ¿Qué **especialidades tienen oferta 0** ahora mismo? (conclusión de reclutamiento)
- ¿Hubo **no-shows o cancelaciones tardías** esta semana? — Imposible: métricas muertas.
- ¿La **retención** real es buena? — No: es n=1 pintado de verde.
- ¿Cuál fue el **embudo real** de hoy (iniciaron pago → pagaron → se atendieron → se cancelaron)? —
  No existe esa conciliación; "pagó" tiene 3 definiciones distintas en 3 pantallas que no concilian.

---

## 4. Recomendaciones (conceptuales — decidir ANTES de tocar nada)

### Quick-wins (alto impacto, acotado, sin migración de datos)

1. **Graficar `completadas`, no `consultas`,** en el chart del admin (el dato ya se calcula).
   Renombrar a "Consultas realizadas"; si se quiere ver oferta, como serie aparte "Slots ofertados".
2. **Filtrar cuentas test en TODA métrica de actividad** + badge "Solo reales" en el admin (como en
   /insights) + cartel "N ocultas por ser test" para no confundir día vacío con día sin actividad.
3. **Arreglar o sacar las 2 métricas muertas** (No-show / Cancel. tardías): mapear a los estados
   reales (`cancelado_paciente`/`cancelado_medico` + el estado real de no-presentación) o quitarlas.
4. **Umbral de muestra en Retención** (n<10 → "muestra insuficiente"; nunca verde con n=1).
5. **Renombrar GMV a "GMV teórico (precio lista)"** mientras no haya cobrado real (cambio de rótulo).
6. **Poner el número en el QuickLink "Reembolsos"** (pendientes / monto) para que alerte sin click.

### Cambios de fondo (requieren decisión sobre el modelo de datos)

7. **Separar y rotular SIEMPRE 4 cosas:** OFERTA TEÓRICA (plantilla de agenda) → SLOTS BOOKEABLES
   (`turnos` disponibles) → RESERVADO (turno con paciente) → REALIZADO/COBRADO (completado +
   `mp_status approved`).
8. **Cobranza real por transacción** (no precio de lista) + unificar la definición de "cobrado" en
   una sola función compartida (hoy hay 3 que no concilian); resolver por qué los turnos no setean
   `mp_status='approved'`.
9. **Agregar médico + especialidad a la oferta** (el API de Oferta por horario no selecciona esos
   campos) + un resumen "de una mirada": # médicos ofertando, # especialidades cubiertas, qué
   especialidades están en 0.
10. **Unificar zona horaria** a America/Argentina/Buenos_Aires en consultas y turnos.
11. **Una sola vista "¿Qué pasó hoy?"** con encabezado de conciliación (`X atendidas → $Y cobrado
    real → $Z comisión Docto`), igual en todas las pestañas, con drill-down (especialidad → médicos
    → atenciones).
12. **Instrumentar de verdad CI vs Turno** (`canal_origen` hoy es constante) y poblar
    `aceptada_at`/`completada_at` (hoy NULL → "Espera prom CI" es permanentemente "Sin datos").

---

## 4-bis. Estado de implementación (29/06/2026)

Se atacaron primero los **bugs de correctitud** (los que mostraban datos falsos). 3 PRs mergeados:

- **#222** — este doc (referencia).
- **#223** — `fix(dashboards): graficar realizadas + revivir métricas muertas`:
  - ✅ Quick-win 1: el chart del admin grafica **realizadas** (sólido) vs creadas (tenue), no slots.
  - ✅ Quick-win 3: "No-show médicos" → `ausente_medico`; "Cancel. tardías" → `cancelado_paciente`/
    `cancelado_medico` (estados reales; antes `no_show`/`cancelado` inexistentes = verde falso).
  - Extensión de alcance: mismo bug arreglado en `insights/medicos`.
- **#224** — `fix(admin): filtrar cuentas test en métricas de actividad`:
  - ✅ Quick-win 2 (parcial): "Consultas hoy" / "En curso" / chart ahora **filtran cuentas test**
    (reusa `setsDeTest`/`esTest`). "Consultas hoy" pasó de `1` (Dr. Docto Test) a `0` (real).
  - Extensión de alcance: "Consultas hoy" y el chart **excluyen slots vacíos** (un slot no es una
    consulta) + `.limit(5000)` en las queries del chart (evita truncado silencioso de PostgREST).
- **#226** — `fix(insights): retención no-verde con muestra chica + GMV teórico`:
  - ✅ Quick-win 4: Retención con n<10 ya no pinta verde "Buena"; muestra "X% · n=N" + badge gris
    "muestra chica". La ruta devuelve `retencionBase`. (Hoy n=1 → antes verde "Buena", ahora gris.)
  - ✅ Quick-win 5: GMV rotulado "teórico (precio de lista)" + "falta conciliar cobrado real".
- **#227** — `fix(admin): oferta de turnos con identidad`:
  - ✅ Quick-win 9 (admin): "Turnos libres" desglosa por especialidad **los médicos con
    sus slots** (filas, diseño Sofía) + resumen "N médicos · M especialidades". Deja a la vista la
    concentración real (hoy 1 médica, 1 especialidad).
- **#229** — `fix(insights): identidad en Oferta por horario`:
  - ✅ Quick-win 9 (insights): el heatmap "Oferta por horario" suma "Quién oferta" (médicos con CI
    horas y/o turnos, con nombre+especialidad; la brecha "N de M" como número grande con semáforo) y
    "Cobertura por especialidad" (especialidades con médicos registrados pero **sin oferta** — hoy
    Neumonología, Ortopedia). `turnosMedicoSet` se deriva del mismo cómputo del heatmap (respeta
    vigencia de fechas → no puede divergir del mapa; fix de Roberto a un modelo vencido que inflaba).

- **#231** — `fix(admin): badge "solo reales" + número de reembolsos`:
  - ✅ Quick-win 2 (resto): badge "Métricas: solo cuentas reales · N de prueba ocultas hoy" en el
    header del admin.
  - ✅ Quick-win 6: el QuickLink "Reembolsos" muestra el # de pendientes (cola `refunds_pendientes`
    no resueltos, misma que /admin/reembolsos) y salta en rojo cuando hay >0.

> **✅ TODOS los quick-wins (1–6, 9) cerrados.** El tablero pasó de "logs abstractos" a una foto
> real y honesta. Quedan solo los cambios de fondo.

**Pendiente** (cambios de fondo — requieren decisión de producto/modelo de datos):
- **Cobranza real por transacción** (8): hoy GMV = precio de lista; los turnos no setean
  `mp_status=approved` → resolver si es bug de conciliación o de display. El de mayor valor.
- Separar/rotular los 4 estados oferta→reservado→realizado→cobrado (7).
- Timezone unificado AR (10) en consultas y turnos.
- Vista única "¿Qué pasó hoy?" con conciliación (11): X atendidas → $ cobrado real → $ comisión.
- Instrumentar CI vs Turno real (12): `canal_origen` es constante + poblar `aceptada_at`/`completada_at`.
- "Especialidades en 0" **aspiracional**: definir el universo de especialidades objetivo sin médicos aún.
- Refinamiento del set de estados de "En curso" (aceptada/pagada no son llamada activa).
- **Data-hygiene** (Roberto #231): drift entre `consultas.reintegro_estado` y `refunds_pendientes.estado`
  (2 consultas quedaron en `pendiente`/`fee_pendiente` aunque el refund está `resuelto`). Reconciliar.

---

## 5. Observación de gestión (no de dashboard)

La auditoría confirma que el problema no es solo cómo se muestran los números — es que **la
actividad real es muy chica** (3 consultas reales completadas en toda la historia, 1 paciente
recurrente, oferta sostenida por 2 médicas de una sola especialidad, CI prácticamente sin uso). Los
dashboards rotos lo tapaban con oferta+test. Arreglarlos da una foto más honesta pero más dura — y
apunta a la palanca ya identificada: **activación de los registrados y oferta más allá de Clínica
médica** (ver `project_conversion_registro_consulta`).

---

## Archivos clave

`src/app/admin/page.tsx`, `src/app/admin/DashboardAdminClient.tsx`,
`src/app/api/insights/hoy/route.ts`, `src/app/api/insights/oferta/route.ts`,
`src/app/api/insights/atenciones/route.ts`, `src/app/api/insights/medicos/route.ts`,
`src/app/api/insights/especialidades/route.ts`, `src/app/api/admin/consultas/route.ts`,
`src/lib/insights/filtro-test.ts`.
