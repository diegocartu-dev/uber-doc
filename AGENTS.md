<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Docto — traspaso para agentes (Codex u otros)

Escrito el 05/10/2026 para que otro agente pueda seguir el trabajo si Claude
Code se queda sin crédito. **Las reglas que mandan están en `CLAUDE.md`**:
leelo entero antes de tocar nada. Esto es solo el mapa de dónde quedó todo.

## Las reglas que no se negocian (resumen; el texto completo está en CLAUDE.md)

1. **El repo es PÚBLICO.** Nunca escribir en código, commits, PRs ni docs:
   nombres, mails, teléfonos, DNI/CUIT de personas reales, IDs de consultas o
   turnos, montos cobrados ni números de la base de producción. Los casos se
   describen en genérico ("una paciente", "un profesional").
2. **No suponer.** Lo que no se verificó se dice "no verificado". Un hueco
   declarado es información; uno tapado es un bug que sale después.
3. **Migraciones SQL: solo con OK explícito de Diego**, mostrándole el SQL
   completo. Nunca aplicarlas por iniciativa propia.
4. **Un commit por ticket.** Rama desde `origin/main` actualizado (`git fetch`
   y `git log HEAD..origin/main` antes de escribir código).
5. **Nunca `gh pr merge --admin`** ni saltear la protección de rama. Se mergea
   cuando los checks están verdes (`mergeStateStatus` = `CLEAN`).
6. **No escribirle a pacientes ni a profesionales** (mail, WhatsApp) sin OK de
   Diego. Los textos que ve un usuario se proponen y se aprueban antes.
7. Vocabulario: "coste por uso de la plataforma", nunca "comisión".
8. Diego no codea y no toca la terminal: todo lo operativo lo hace el agente.

## Dónde quedó el trabajo (05/10/2026)

- **Plan vigente:** `docs/sprints/2026-10-05-plan-consultas-efectivas.md`.
  Diagnóstico de dónde se pierde cada consulta, cuatro pilares de tickets y
  las decisiones D1–D6 **aprobadas** por Diego (sección 5).
- **Pilar 1:** mergeado y en producción (PR #524). Falta parte de P1.12.
- **Columnas de confianza de `medicos`:** migración
  `supabase/migrations/20261001_medicos_columnas_de_confianza.sql` aplicada en
  la base principal y verificada el 05/10 (PR #525). **No aplicada en la base
  de la instancia institucional**: preguntar a Diego antes.
- **Plantillas WhatsApp de turnos:** enviadas a Meta el 05/10, cableadas en
  `src/lib/whatsapp.ts` (`PLANTILLA_TURNO_RESERVADO`, `PLANTILLA_TURNO_15MIN`).
  Cuando Meta las apruebe empiezan a salir solas.

## Próximos tickets, en este orden

1. **P2.1 Latido del panel del profesional (D1).** El latido del PACIENTE ya
   existe (`/api/consulta-estado`, `sala-espera`); del panel del profesional no
   se encontró uno — verificar antes de crear columna (columna nueva en
   `medicos` = migración + cuidado con los grants de columna, ver CLAUDE.md).
   Necesita plantilla nueva con botón "Sigo disponible" (texto → Diego → Meta).
2. **P2.2 Escalamiento:** WhatsApp a los 3 min y llamada a los 5 min (D2).
3. **P2.3 Ofrecer el pedido a otro profesional a los 4 min (D3).**
4. **P3.1 / P3.2:** plazo de pago desde que el paciente se enteró, techo 30
   min; pagar sobre la misma consulta al volver (D4). Toca plata: revisión
   adversarial antes de mergear.
5. **P3.3:** precio visible antes de pedir (D6).
6. **P4.1–P4.3:** anticipación mínima de 60 min, confirmación semanal de
   agenda, panel de turnos de hoy (D5).
7. **P1.12 resto:** rastro de entrega del push y la medida en el tablero.
8. Aprobados por Diego antes (sin hacer): congelar `nombre_completo` una vez
   validada la identidad (trigger = migración = OK de Diego); sacar el campo
   "número de matrícula" del registro (la matrícula la dice REFEPS); cuando el
   sistema corrige una matrícula **no** se le avisa al profesional.
9. Más adelante, solo si Diego lo pide: PR #522 (destinos de pago).
10. **Medir alrededor del 12/10:** rechazos de Mercado Pago por riesgo,
    pedidos que vencen con el profesional disponible, y si Meta aprobó las
    plantillas. Los números van a Diego por chat, nunca al repo.

## Cómo se opera

- **Chequeos locales:** `npx tsc --noEmit`, `npm run lint`, `npm run test:unit`.
  La CI (`.github/workflows/playwright.yml`) corre unit + Playwright.
- **Deploy:** push/merge a `main` = deploy automático en Vercel (dos
  proyectos: `uber-doc` e `instancia-institucional`). Cambiar una env var
  necesita deploy fresco, no `vercel redeploy`.
- **Consultas a producción:** Supabase Management API,
  `POST https://api.supabase.com/v1/projects/irpupskopjahbqqvckue/database/query`
  con `SUPABASE_ACCESS_TOKEN` de `.env.local` (nunca imprimirlo ni commitearlo).
  Para probar permisos sin dejar rastro: un bloque `DO $$ … $$` con
  `SET LOCAL ROLE authenticated` y `request.jwt.claims`, que termina en
  `RAISE EXCEPTION` con el resultado (todo se revierte).
- **Verificar estado final, no la respuesta:** después de aplicar algo,
  comprobarlo por otra vía (otra query, el flujo real, el navegador).
- **GitHub:** `gh` CLI; si falla por TLS, la API REST con
  `curl -H "Authorization: Bearer $(gh auth token)"`.
- **Scripts de verificación:** `scripts/verify-*.ts` (grants de `medicos`,
  buckets, cobros MP, avisos WhatsApp contra Twilio).
- `.codex/agents/` tiene definiciones de los agentes del equipo (Sofía UX,
  Marcos Eng, Roberto QA, etc.). Carolina (legal) está en pausa: no invocarla.
