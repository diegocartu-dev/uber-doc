# Backlog — Eventos Funnel

## Optimizaciones futuras (no urgentes)

### Índice compuesto (evento, created_at)
- Propuesto por Elena el 12/05/2026
- Cuándo aplicar: si eventos_funnel supera 100k filas o /insights muestra lentitud en queries filtradas por evento y rango de fechas
- Migración nueva, no editar 056

### user_agent en metadata de mp_oauth_view_tab
- Propuesto por Elena el 12/05/2026
- Cuándo aplicar: cuando tengamos 50+ médicos activos y necesitemos segmentar adopción mobile vs desktop
- Requiere agregar header en fetch del cliente y leerlo en /api/funnel/track
