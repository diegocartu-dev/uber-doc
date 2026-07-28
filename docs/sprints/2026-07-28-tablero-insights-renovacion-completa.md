# Tablero CEO /insights — renovación completa (23–28/07/2026)

Programa "página por página" dirigido por Diego: cada pantalla se rehízo con
sus directivas explícitas + criterio delegado, verificando contra producción.

## Doctrina de plata (rige TODO el tablero)

- **Cobrado** = pagos `mp_status='approved'` reales de MP. **Comisión** = el
  `mp_application_fee` que MP registró (fallback `comision_docto_pct`).
  La regla: **5% founders / 10% socios tradicionales — NUNCA fue $1.500 fijo**
  (era 5%×$30.000 que coincidía). La constante `COMISION_DOCTO_POR_CONSULTA`
  fue **eliminada** con lápida en `filtro-test.ts`.
- **GMV teórico muere** (precio de lista × atendidas reescribía el pasado —
  caso Raphael: cobró $15.600 real, el tablero decía $8.000).
- **Refunds resueltos se excluyen** del cobrado, caminando la cadena
  `turno_origen_id` (la plata de un turno reprogramado vive en la fila
  ORIGINAL — caso Alexandra/Glauciana).
- Helpers compartidos: `src/lib/insights/plata.ts` y `src/lib/insights/fechas.ts`
  (corte de día ARGENTINO: comparar timestamptz con fecha a secas cortaba a las
  21:00 del día anterior — barrido en #301/#302).

## Por página

- **Hoy** (#300, #301): plata real del día, médicos con jurisdicciones y CI
  activa diferenciada, fila de métricas chicas eliminada, día completo con
  turnos pendientes + hechas en criollo.
- **Atenciones** (#307): columna **Provincia (del paciente)** para futuros
  indicadores + fix del join de turnos (`turnos.paciente_id` = `pacientes.id`,
  no `user_id` — los turnos mostraban "—").
- **Médicos** (#309, #310): plata real + Provincia ordenable + buscador (sin
  tildes) + **Valor turno / Valor CI** (precio por canal: último turno con
  precio incl. slots ofrecidos / última CI o precio configurado). Afuera
  Espera CI y Retención ("no es un indicador que hoy nos sirve, no en esta
  página" — datos siguen en DB).
- **Especialidades** (#311): solo las que tenemos (sin médicos solo si hubo
  demanda → señal de reclutamiento), cada card lista médicos con provincias
  (punto verde = disponible), cuenta CI **+ turnos** (antes solo CI), cobrado
  real, badge de demanda se mantiene.
- **Oferta**: verificada contra DB (9 agendas vigentes ✓, 11 médicos con CI en
  el log ✓, heatmaps consistentes) — **sin cambios** por directiva ("lo
  dejamos así"). Única página que siempre manejó bien la zona horaria.
- **Demanda** (ex Funnel, #312, #313): cada búsqueda (sesión de vistas de la
  clínica, gap 30 min) con paciente + provincia + **cuántos médicos
  habilitados para SU provincia** + **CI en línea EN ESE INSTANTE**
  (reconstruido de `disponibilidad_log`) + desenlace en criollo (`se atendió`
  → `sin médicos para su provincia`). Resumen por provincia con sin-match en
  rojo. `clinica_vista` ahora graba la **foto exacta** (provincia,
  medicosVisibles, ciOnline, conAgendaTurnos) — sin migración; lo histórico
  se marca `*`.

## Hallazgo de negocio (Demanda, 30 días al 28/07)

**109 búsquedas → 22 eligieron → 6 pagaron → 2 se atendieron. 70 sin match.**
Causa dominante: "había médicos pero ninguno en línea" (CABA: 22 médicos
habilitados, 0 en línea en la mayoría de las búsquedas). Demanda federal sin
oferta: Salta, San Juan (×2), Catamarca. Pacientes que insistieron y se
fueron: Romina ×6 búsquedas en un día, Franco Enciso ×14 vistas, Luis
Henrique ×23. **La demanda existe; la oferta apagada la pierde.**

## Notas técnicas

- **#313**: `useSearchParams` sin `<Suspense>` → boundary agregado en las 6
  páginas + error state en Demanda. Ojo diagnóstico: una pestaña de Chrome en
  segundo plano **difiere la hidratación** — páginas "muertas" en inspección
  automatizada que andan perfecto para un usuario real (visibility: hidden).
- Verificación E2E de páginas admin: sesión de Diego en Chrome vía extensión.
- Monitor de uptime (#308) nació del 504 del 27/07 — vigila el sitio cada
  minuto con mail rojo/verde; watchdog lo cubre a él.
