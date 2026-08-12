# Docto Institucional — Etapa 2 · Backlog visible de la pantalla del otorgador

> Salido de la revisión pre-merge de la Etapa 2 (12/08/2026). Ninguno de estos
> items bloquea la demo ni la operación; están acá para que no vivan SOLO en el
> comentario de `src/app/otorgador/OtorgadorClient.tsx`. Referencias: 04-spec
> del otorgador (diseño aprobado) y su mock `01-otorgador.html`.

## Fidelidad al mock aprobado — pendientes

| Item | Referencia | Estado |
|---|---|---|
| Formateo de DNI con puntos ("12.345.678") en dropdown y banda fijada | 04-spec §1.2.1 | ✅ Resuelto en esta revisión (`formatearDNI`, solo presentación — el padrón sigue guardando dígitos) |
| Buscadores compactos "Buscar especialidad" / "Buscar profesional" | mock `.buscar-compacto` (b-esp y of-head) | Pendiente |
| "Ver la semana completa →" del acordeón de slots | mock `.slots-mas` | Pendiente (hoy se listan todos los días de la semana AR corriente, sin paginado) |
| Lápiz de edición de contacto visible solo en hover | 04-spec §1.2.3 | Pendiente (hoy siempre visible, mismo patrón inline) |
| "Reenviar aviso" del éxito | 04-spec §1.7 | Deshabilitado a propósito: reenviar necesita la landing del link (Etapa 3). El link ya se emite SIEMPRE y el éxito lo muestra como fallback manual cuando el envío automático falla. |
| "Registrale el pedido" de especialidad sin oferta | 04-spec §1.5.6 | Pendiente: el registro del pedido de oferta no existe todavía — se muestra sin acción |

## Decisión de letra pendiente (para Diego)

- **R6 vs. 05-spec §4.4.5:** R6 dice "acuerdo semanal completo → no recibe más
  asignaciones esa semana" (bloquea SIEMPRE); la spec técnica §4.4.5 dice
  "acuerdo completo Y sin slots → al final". La implementación (oferta +
  guards server-side de asignar-turno/asignar-ci) sigue la redacción de R6.
  Si se prefiere la letra de la spec técnica, se ajusta en un solo lugar:
  `acuerdoSemanalDelMedico` + `priorizarOferta`.
