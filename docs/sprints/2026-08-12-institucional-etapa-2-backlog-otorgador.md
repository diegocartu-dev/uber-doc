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

## Decisión de letra — RESUELTA por Diego el 13/08

- **R6 vs. 05-spec §4.4.5:** la implementación seguía la lectura dura de R6
  ("acuerdo semanal completo → no recibe más asignaciones esa semana", bloquea
  SIEMPRE), mientras la spec técnica §4.4.5 decía "acuerdo completo Y sin slots
  → al final".
- **Diego decidió la lectura flexible (13/08):** *mientras el profesional tenga
  un turno publicado, ese turno se puede tomar*. El acuerdo es el **piso** de
  servicio comprometido, no un techo. El que ya cumplió **baja de prioridad**
  (va al final de la oferta), pero su horario publicado se puede asignar.
- Implementado en la Etapa 8: `priorizarOferta` (`seleccionable` pasó a
  significar "tiene algo que ofrecer" y los slots viajan siempre) y se cayeron
  los guards duros de `asignar-turno`, `asignar-ci` y `reprogramar`. El cupo del
  plan de reprogramación masiva quedó como preferencia de reparto, no como tope.
  Regla actualizada en `06-reglas-operativas.md` §R6.
