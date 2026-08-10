# PPM 1.2 Docto — pieza para médicos · ángulo SIMPLICIDAD · 1080×1920 (WhatsApp)

> **Estado (13/06/2026): renderizada y completa.** Segunda pieza de la serie PPM,
> mismo formato y manual de marca que [PPM 1.1](../PPM-1.1-Docto/NOTAS.md). Concepto
> de Diego: "Nova tu secretaria IA, Docto hace que atender sea simple, para que tu
> energía esté en lo que te gusta." Copy borrador propuesto por Code (sustituible).
> Diego la envía él mismo — no se manda por mail desde acá.

## Archivos

| Archivo | Qué es |
|---|---|
| `template-1080x1920.html` | Fuente editable. URL cerrada; resto con copy borrador. |
| `PPM 1.2 Docto.png` | Render completo (sin placeholders). Lo que se envía. |
| `capturas/captura-nova-agenda.*` | Reusada de PPM 1.1 (Nova arma agenda). Datos ficticios. |
| `capturas/captura-paciente-listo.*` | **Nueva.** Réplica fiel del popup real de aviso (`src/components/NotificacionPacienteListo.tsx`). Paciente ficticio "Laura Giménez". |
| `render.mjs` | `node docs/marketing/PPM-1.2-Docto/render.mjs`. Avisa si desborda 1920px. |

## Copy borrador (propuesto por Code, sustituible)

- **Gancho:** "Vos atendé. De lo demás se encarga Docto."
- **Subtítulo:** "Nova, tu secretaria con IA, te ordena la agenda y Docto se encarga
  de la gestión. Tu energía, en lo que te gusta: tus pacientes."
- **3 ítems:** Tu agenda ("Le hablás a Nova y arma los turnos por vos.") · Los avisos
  ("Docto te avisa cuando el paciente está listo. Vos solo tocás Iniciar.") · La
  historia clínica ("La evolución se arma sola y queda guardada en la ficha del paciente.")
- **Bloque Nova:** "Nova · tu secretaria con IA" / "Tu agenda, en una frase" / "Le
  decís cuándo y a cuánto querés atender. Nova crea los turnos."
- **Bloque avisos:** "Sin estar pendiente" / "Te avisamos cuando el paciente está
  listo" / "Suena, aparece el aviso y entrás a la consulta de un toque."
- **CTA:** "Sumate como médico fundador." → `docto.com.ar/medicos` → "Sin abono, sin
  contrato. Te registrás en minutos."

## Fidelidad de producto (verificado en código, 13/06/2026)

- **Nova = solo agenda** (chat/voz). NO se le atribuyen avisos ni documentos.
- **Avisos "paciente listo"** = popup real `NotificacionPacienteListo.tsx` (check
  verde, "{Nombre} pagó/llegó", "Listo para la consulta", botón "Iniciar consulta").
  Son de la plataforma, no de Nova → por eso el copy dice "Docto te avisa".
- **Evolución clínica** = auto-compuesta (`componerEvolucion`); el médico la genera
  (esa generación ES la validación humana, no hay paso "Revisé y confirmo" aparte).
  El claim "se arma sola y queda en la ficha" es fiel.

## Antes de enviar (decisiones de Diego)

1. Captura "paciente listo": paciente ficticio, cero datos reales. OK como ilustración.
2. Gate legal de claims antes de publicar (regla del doc). Diego decide.
3. URL y medición: igual que PPM 1.1 — usar UTM `utm_campaign=medicos-founders-v1`
   con `utm_medium=imagen` (ver [NOTAS de 1.1](../PPM-1.1-Docto/NOTAS.md), sección Medición).
   Si se quiere distinguir esta pieza de la 1.1 en las métricas, usar
   `utm_content=ppm-1.2-simplicidad` vs `utm_content=ppm-1.1`.

Contexto de marca: `docs/marketing/DOCTO_GTM_FUNDACIONAL.md`.
