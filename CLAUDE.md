# Docto — Plataforma de Telemedicina Argentina

## Qué es Docto
Plataforma de telemedicina que conecta pacientes con médicos para consultas virtuales inmediatas y programadas. Target: Argentina primero, luego LATAM.

## Equipo y roles
- **Diego** — CEO, fundador, domain expert. Toma decisiones de producto y negocio. NO codea.
- **Claude (Cortana)** — Tech Lead, Arquitecto General y Coordinador.
- **Claude Code** — Desarrollador ejecutor. Implementa código, hace push a GitHub.
- **Agentes** en `.claude/agents/`: @sofia (UX), @marcos (Eng), @elena (PM), @roberto (QA).

## Stack
- Frontend: Next.js (App Router)
- Backend/DB: Supabase (PostgreSQL + RLS + Realtime)
- Video: LiveKit (`@livekit/components-react` + `livekit-client` + `livekit-server-sdk`)
- Pagos: Mercado Pago (OAuth + split comisiones en produccion)
- Hosting: Vercel (auto-deploy desde GitHub)
- Repo: github.com/diegocartu-dev/uber-doc
- Producción: uber-doc.vercel.app
- Dominio: docto.com.ar

## Reglas de desarrollo
- SIEMPRE diseñar y validar arquitectura antes de implementar.
- Supabase RLS activo. Usar supabaseAdmin para bypass.
- **Grants de columna (NO confundir con RLS de fila):** `medicos` tiene columnas SIN `GRANT SELECT` para `authenticated` (PII/internas: `celular_personal`, `dni`, `cuit`, `email_personal`, `refeps_*`, `notas_admin`, etc.). Si un `SELECT` con el cliente RLS incluye **una sola** de esas columnas, PostgREST falla la query ENTERA (`permission denied for column`) y devuelve `null` SILENCIOSO. Para leer la **fila propia** con columnas sensibles, usar **service role** (`createAdminClient`) filtrando por `user_id`, NUNCA el cliente RLS. NO grantear PII a `authenticated`: la policy pública de `medicos` la expondría a cualquier paciente. Caso real: outage del dashboard médico 19-24/06 (ver `docs/sprints/2026-06-24-outage-dashboard-medico-y-diagnostico-oferta.md`).
- Realtime: filtros en non-PK fallan. Escuchar sin filtros, filtrar en JS.
- Video LiveKit: Safari OK, Chrome iPhone revisar.
- UX simple para médico de 70 años.
- Todo se prueba en docto.com.ar, NUNCA en localhost.
- Push a main = redeploy automático en Vercel.
- Simplificación bold > debugging incremental.
- NO usar `window.confirm()` ni `window.alert()` — Chrome los suprime en páginas con iframes cross-origin. Usar dialogs React inline con zIndex alto.
- Migraciones SQL: usar la Supabase Management API con SUPABASE_ACCESS_TOKEN (guardado en .env.local) para ejecutar DDL directo. Endpoint: `POST https://api.supabase.com/v1/projects/irpupskopjahbqqvckue/database/query`. Nunca pedir a Diego que toque la terminal.
- Storage buckets: verificar con `npx tsx scripts/verify-storage-buckets.ts` post-deploy. Buckets críticos: avatars (público), credenciales-medicos, consultas-temp, firmas-medicos (privados).

## Auditoría de seguridad — Regla de evidencia empírica
Toda auditoría de seguridad (puntual o integral) debe incluir evidencia empírica reproducible por hallazgo: el comando exacto que reproduce el problema, el output real, y clasificación clara entre "explotable hoy" / "vulnerabilidad latente" / "buena práctica pendiente". Reportes basados solo en lectura de código o policies sin tests reales no son accionables y no disparan sprints de fixes.

## Verificación contra producción real
Cualquier status, auditoría o reporte de estado debe verificar contra el entorno productivo real: Vercel env vars de producción (`npx vercel env pull`), DB de producción (queries con service role key), endpoints en vivo. NO contra archivos `.env.local`, NO contra documentación, NO de memoria.

Suposiciones derivadas de archivos locales o lectura de documentación sin confirmar contra producción son inválidas y deben rehacerse.

Casos detectados que motivan esta regla:
- **28/05/2026 — Auditoría Roberto:** Reportó hallazgos críticos basados en lectura de policies RLS sin probar empíricamente contra producción. Tests manuales de Diego mostraron que los hallazgos no eran reproducibles.
- **28/05/2026 — Status report Marcos:** Reportó REFEPS en `SISA_MODE=simulacion` basado en `.env.local`. Producción tenía `SISA_MODE=produccion` en Vercel desde hacía 5 días, con validaciones reales ejecutadas y persistidas en DB.

## Protocolo de sprint
- **Un commit por ticket.** Sin excepción. Permite revertir tickets individuales si algo rompe.
- **No merge sin OK explícito de los gates de auditoría.** Si un ticket tiene gate (Roberto, Sofía, Diego), el código espera en rama hasta recibir OK. Tickets sin gate pueden ir a main independientemente.
- **Extensión de alcance se reporta SIEMPRE.** Aunque sea consecuencia técnica obligatoria de otro ticket, se documenta en el reporte con razonamiento. La decisión de aprobar la extensión la toma Diego, no el implementador.

## Documentación al cierre
Cada vez que se termina algo (sprint, decisión de producto, hallazgo, fix, validación), se documenta en el archivo correspondiente del repo ANTES de considerarse cerrado. La memoria de Diego no es la fuente de verdad. El repo lo es.

Reglas concretas:
- **Cierre de sprint** → reporte en repo (`docs/sprints/` o donde corresponda)
- **Decisión de producto** → registrar en CLAUDE.md o ROADMAP_OPERATIVO.md según alcance
- **Hallazgo regulatorio o legal** → documento en `docs/legal/` o referencia cruzada en CLAUDE.md
- **Validación importante** (ej: REFEPS de Sofía Fasce) → registrar en STATUS_REAL o doc específico
- **Cambio de estado de un item del ROADMAP** → actualizar ROADMAP_OPERATIVO.md en el mismo commit que cierra el trabajo

Un sprint o tarea NO se considera cerrado hasta que la documentación esté actualizada. "Hecho" sin doc = no hecho a efectos del registro.

## Una atención por vez — la regla del Uber (decisión Diego, 09/08/2026)
*"Como usar un Uber y querer pedir otro."*

**Si el paciente YA PAGÓ**, esa atención es la suya: no puede abrir otra, y la pantalla lo lleva ahí en vez de mostrarle un cartel. **Si todavía NO pagó**, es libre de dejar a ese profesional y elegir otro — igual que cancelarle a un chofer antes de que llegue.

Fuente de verdad: **`src/lib/consultas/encuentro-activo.ts`**. Todo guard nuevo que pregunte "¿el paciente ya está en una atención?" usa `buscarEncuentroActivo`, no una lista de estados escrita a mano.

- **Bloquean** (hay plata comprometida): consulta en `pagada` o `en_curso`; turno en `en_espera` o `en_curso`.
- **No bloquean**: consulta en `esperando` o `aceptada` (pedida sin pagar), y **cualquier turno agendado** (`confirmado`, `reservado_pendiente`). Un turno para el jueves no es un viaje en progreso y no impide una consulta inmediata hoy.
- **Impago con el MISMO profesional** = volver, no pedir de nuevo: redirect a su sala de espera, sin carteles.
- **Impago con OTRO profesional** = se le pregunta antes de cancelar (nunca callado: puede haber entrado por error), y al profesional que queda esperando le llega *"El paciente canceló esta consulta"* — cartel de 5 minutos que se va solo, más la fila permanente en la campana. Sin ese aviso se reproduce el problema de las reservas abandonadas descrito abajo.
- **La liberación no se fuerza**: cuando el paciente no asiste o vence el plazo, el encuentro cambia de estado y deja de figurar. No hay código de vencimiento en el guard.

**Historia del bug (no repetirlo):** el guard viejo de `crearConsulta` miraba `["esperando","aceptada","en_curso"]` y **se olvidaba de `pagada`** — tenía las dos mitades al revés: bloqueaba a los impagos (que deberían poder irse) y dejaba pasar a los pagos (los únicos a blindar). Encima el mensaje se pintaba arriba de un formulario largo, fuera de la vista del paciente, y sin ningún link a su consulta.

**Los plazos (actualizado 22/08/2026 — acá decía que la CI "no tiene ninguno", y era falso desde el 09/08):** el turno tiene plazo (cron `resolver-turnos-vencidos` cada 10 min, 20 de gracia → `ausente_paciente`). La consulta inmediata tiene **dos relojes distintos**, y confundirlos ya costó una madrugada:
- **CI pagada** (#384/#388, 09/08): 30 min desde el pago, con el profesional libre. El profesional no entró → `medico_ausente` + reintegro del 100%; el paciente nunca entró → `no_show_paciente`, sin reintegro. La señal de que el profesional no entró es `sala_video_url IS NULL`, **no el estado** (un pago real salta de `aceptada` a `en_curso`; `pagada` solo la escriben las cuentas test).
- **Pedido SIN aceptar** (#432/#435, 21-22/08): **10 min** sin respuesta → se cancela, al paciente se lo invita a elegir otro profesional, y al profesional que no respondió **se le apaga la CI** (mensaje interno + push). `resolver-consultas-vencidas` corre cada 3 min (peor caso, 13). Además **nadie recibe más de 2 recordatorios** por el mismo paciente (`sala_espera_entradas.recordatorios_enviados`), y un pedido sin contestar **ya no bloquea** el auto-apagado de disponibilidad. Caso que lo motivó: 18/08, un pedido colgado 11 h y 17 WhatsApp encadenados a una profesional dormida — `docs/sprints/2026-08-22-ci-sin-aceptar-plazo-y-tope-avisos.md`.
- `cerrar-huerfanas` queda como barrido de última instancia, **a las 00:00 ART** (`0 3 * * *`: los crons de Vercel se programan en UTC).

## Reportes — las reservas abandonadas NO se muestran (decisión Diego, 06/08/2026)
Cuando un paciente toma un turno, el slot queda en `reservado_pendiente` con `reservado_hasta` = ahora + ~15 min (retención para pagar). Si paga, el webhook de MP lo pasa a `confirmado` con `mp_status='approved'`. Si no paga, la retención vence y el lugar se libera.

**El pago es fundacional (decisión Diego, 10/08/2026):** *"el pago es fundacional para decir este paciente consume este turno"*. Sin pago, a los 15 minutos el lugar vuelve a la oferta — la liberación la hace el cron `liberar-reservas` (cada 10 min), **sin margen de gracia** (había 45 min extra "por si un pago de MP aprueba tarde"; Diego los sacó: es una rareza que no justifica oferta invisible, y desde #375 el checkout solo ofrece medios instantáneos). El cron nunca toca un turno con estado de pago vivo o `pago_id`. En pantallas, un `reservado_pendiente` se llama **"Pendiente de pago"** — nunca "Pagado" ni un monto a secas: ese monto es el precio del lugar, no plata que entró.

**Decisión de Diego:** *"si la reserva fue por ese motivo perezoso y está liberado el turno, yo NO debo ver eso en los reportes. Guardalo en la base si querés, pero no es algo que nadie necesite ver: las vueltas que da un paciente indeciso."* Caso que la motivó: un paciente reservó las 14:30, se arrepintió, reservó las 15:00, y finalmente reservó las 15:30 y pagó — el panel mostraba TRES solicitudes cuando hubo UNA.

Reglas:
- **Reserva abandonada** = `reservado_pendiente` + retención vencida + sin pago (ni acreditado ni en vuelo). **No se muestra ni se cuenta en NINGÚN reporte** (`/insights` y `/admin`). **No se borra de la base.**
- **Reserva viva** = retención vigente y todavía sin pago acreditado. Se puede **listar** con etiqueta clara ("Reservando…"), pero **no cuenta como actividad real** en KPIs ni totales.
- Fuente de verdad única: **`src/lib/insights/reservas.ts`** (`esReservaAbandonada` / `esReservaViva` / `sinReservasAbandonadas` para listados / `soloActividadReal` para KPIs). Todo reporte nuevo que toque `turnos` usa estos helpers, y su `SELECT` debe traer `reservado_hasta` y `mp_status`.
- **La plata nunca se filtra:** ninguna de las dos exclusiones puede sacar una fila con `mp_status='approved'`, y todas las métricas de dinero filtran por `approved`. Delta de importes: cero.
- **Deuda conocida:** el badge "N pendientes" de la agenda del médico (`src/app/medico/agenda/PanelDerecho.tsx`) sigue contando reservas muertas. No se tocó porque su query usa el cliente RLS y sumarle columnas tiene el riesgo de grants documentado arriba.

## Un pedido NO es una consulta hasta que lo aceptan (decisión Diego, 19/08/2026)
*"Sino es consulta, es Intento de consulta o Búsqueda."*

La frontera entre un **intento** y una **consulta** es que **un profesional la acepte**. Antes de eso el paciente buscó y pidió, pero del otro lado todavía no hubo nadie. Contar los intentos como consultas mezcla la demanda con lo que efectivamente entregamos, y esconde el número que importa: **cuántos pedidos acepta un profesional** — el termómetro directo de la oferta.

Aceptada, la consulta tiene dos caminos —paga o no paga— y si paga, tres desenlaces.

```
Búsqueda → Elección → Intento ──┬── nadie lo aceptó   (falla de OFERTA, nuestra)
                                └── se retiró          (ruido normal del paciente)
                     Consulta ──┬── abandono           (aceptada, sin pagar: se fue
                                │                       o se cayó en el checkout de MP)
                                └── pagada ──┬── atendida
                                             ├── el profesional no sostuvo
                                             └── el paciente no llegó
```

Fuente de verdad única: **`src/lib/consultas/clasificar.ts`** (`clasificarAtencion` para CI, `clasificarTurno` para turnos, `esConsulta` / `esAtencionReal` para KPIs). Todo reporte o filtro nuevo que necesite decir "esto fue una consulta" usa esos helpers, **nunca** una lista de estados escrita a mano.

- **El hito es `aceptada_at`**, que escribe `aceptarConsulta`. Sin él no hay clasificación: `aceptada` es un estado de PASO y al terminar la consulta no queda rastro de que alguien se hiciera cargo.
- **Toda cancelación registra `resuelta_por` + `resuelta_at` + `resolucion_motivo`.** Los tres caminos (el paciente se retira, el paciente se va con otro profesional, el profesional cancela) hacían `update({estado:'cancelada'})` a secas y el porqué se perdía.
- **El turno no tiene aceptación**: la agenda publicada ES la aceptación. Ahí la frontera es el **pago** (coherente con "el pago es fundacional", 10/08). Sus estados ya distinguen quién dejó caer la atención, así que se traducen en vez de deducirse.
- **Un reembolso cuenta como pago hecho**: para devolver la plata, primero entró. Tratar `refunded` como "no pagó" clasificaría una consulta cobrada y devuelta como abandono. El *ingreso* lo sigue midiendo `lib/insights/plata.ts`, que filtra solo por `approved`.
- **Sin registro no se inventa un culpable**: una consulta paga y cancelada sin `resuelta_por` cae en `sin_datos`, no en "el paciente no llegó".
- **Los estados NO cambian.** Hay ~20 archivos que los interpretan (guard de "una atención por vez", crons, pantallas del paciente y del profesional). La clasificación vive en columnas que se escriben ADEMÁS del estado y se computa al leer.

**Límite del histórico:** las filas anteriores al 19/08/2026 no tienen el hito. Se infiere —el pago y la sala sólo existen después de aceptar, así que cualquiera prueba la aceptación— pero el caso inverso es indistinguible: sin pago ni sala, "no la aceptó nadie" y "la aceptó y no pagó" son la misma fila. Por eso la clasificación expone `origenAceptacion` y el tablero marca esos desenlaces como **deducidos**.

**Consecuencia esperada:** el total de "consultas" BAJA respecto de lo que mostraba el tablero antes. Lo que se fue son los pedidos que nunca tuvieron a nadie del otro lado, que ahora se cuentan como intentos en vez de figurar como si hubieran sido atenciones.

## Design system
- Verde #1D9E75 — SOLO para indicadores de estado (dots EN CURSO, badge Disponible, badge Activa). NUNCA en botones, marcos, ni controles UI.
- Azul #378ADD — Botones de acción, marcos de cards, toggles, links interactivos, CTAs secundarios.
- Naranja #D85A30 (alerta)
- Gris #888780 (bloqueado, links secundarios)
- Rojo #E24B4A (cancelado/error) — Botones de cancelar: borde rojo, fondo transparente.
- Amarillo #BA7517 (pendiente)
- Tipografía: Inter en todo el producto, incluyendo PDFs.

## Arquitectura de video — LiveKit

> **Nota (28/05/2026):** Migrado de Daily.co a LiveKit. El código ya NO usa Daily.co.
> `@daily-co/daily-js` fue eliminado. DAILY_API_KEY en .env.local es legacy sin uso.

### Integración actual
Los componentes de video usan **LiveKit React SDK** (`@livekit/components-react`) con `LiveKitRoom` + tracks de `livekit-client`. Backend genera tokens con `livekit-server-sdk` en `src/app/api/livekit/token/route.ts`. Salas se crean via `src/app/api/livekit/crear-sala/route.ts`. Webhook LiveKit en `src/app/api/livekit/webhook/route.ts`.

### Flujo de finalización del médico
1. Médico toca "Finalizar consulta" → dialog React inline (NO `window.confirm`)
2. Confirma → desconecta de la sala LiveKit
3. `router.push('/dashboard')` — redirect inmediato sin esperar Supabase
4. Guardado de documentos + update estado `completada` ocurre en background (fire-and-forget IIFE)
5. Si el guardado falla, el médico ya está en el dashboard — falla silenciosamente

### Flujo de detección del paciente
1. **Polling** cada 5s a `/api/consulta-estado` → detecta `completada` → muestra pantalla de cierre con documentos
2. El polling usa `useRef` (yaRedirigioRef) como flag, NO estado en dep array — si `estado` estuviera en deps, el useEffect se destruiría al cambiar y la guard lo mataría

### Problemas conocidos y aprendizajes
- **`window.confirm()` + iframe cross-origin = SILENCIOSAMENTE SUPRIMIDO** en Chrome/HTTPS. El confirm devuelve `false` sin mostrar nada. Toda confirmación destructiva debe usar dialog React.
- **Supabase client no lanza excepciones**: devuelve `{data, error}`. Siempre verificar `error` antes de asumir éxito.
- **iOS exige gesto del usuario para el prompt de mic/cám** (Safari y PWA). `getUserMedia` fuera de un toque (ej: `audio={true}` al conectar LiveKitRoom) se deniega EN SILENCIO y WebKit cachea la denegación para toda la sesión — después ningún toggle funciona. Fix (10/06/2026): pantalla pre-join en `SalaConsultaPaciente` cuyo botón pide el permiso dentro del gesto; recién después se monta LiveKitRoom. Android PWA necesita lo contrario (pedido temprano) — el pre-join resuelve ambos. NO volver a `audio={true}` con connect directo.
- **`window.open()` después de un `await` = bloqueado en Safari iOS** (queda fuera del gesto). Para abrir PDFs/archivos usar `<a href target="_blank">` nativo (fix en `DescargarPDF.tsx`, 10/06/2026).
- **Mensajes de error de permisos deben ser por plataforma**: iOS no tiene candadito ni barra de direcciones en PWA. Usar `instruccionesPermiso()` de `SalaConsultaPaciente.tsx`.

### Lo que NO se debe hacer
- NUNCA depender solo de Realtime para transiciones críticas del paciente — siempre polling como respaldo
- NUNCA poner `estado` como dependencia del useEffect de polling — mata el interval justo cuando más se necesita
- NUNCA hacer el guardado de documentos bloqueante para el redirect del médico — fire-and-forget

## Sprint Perfil Médico + Receta (pendiente de implementar)

### Contexto
Las specs están completas (diseño de Sofía aprobado). La migración 040 ya fue aplicada en Supabase. La rama `elastic-perlman` tiene una implementación pero fue descartada por regresiones. Hay que reimplementar desde main limpio.

### Migración 040 (ya aplicada en DB)
```sql
ALTER TABLE pacientes
  ADD COLUMN IF NOT EXISTS fecha_nacimiento DATE,
  ADD COLUMN IF NOT EXISTS sexo_dni TEXT CHECK (sexo_dni IN ('masculino', 'femenino')),
  ADD COLUMN IF NOT EXISTS tiene_cobertura BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS obra_social TEXT,
  ADD COLUMN IF NOT EXISTS nro_afiliado TEXT,
  ADD COLUMN IF NOT EXISTS perfil_medico_completado BOOLEAN DEFAULT false;
```

### Pantalla "Tu información médica"
- Ruta: `/consulta/[id]/info-medica` (CI) y `/turno/[turnoId]/info-medica` (turnos)
- Aparece después del pago, antes de sala de espera
- 3 estados: A (primera vez), B (datos completos — confirmación rápida), C (datos parciales)
- Campos: fecha_nacimiento (date picker nativo), sexo_dni (dos botones táctiles 50/50), toggle cobertura médica con animación
- Estado B no hace POST innecesario — solo confirma y redirige
- CTA sticky bottom en mobile

### PDF de receta actualizado
- Tipografía Inter (no Georgia)
- Botón explícito "Imprimir / Guardar como PDF" visible en pantalla, oculto en @media print
- Bloque paciente con datos nuevos (sexo, fecha nacimiento, cobertura)
- Espacio QR reservado (placeholder sin QR real — SISA/REFEPS pendiente)
- Marca de agua DUPLICADO si fue generado más de una vez

### Regla de implementación
Los SELECTs que incluyan columnas nuevas (`fecha_nacimiento`, `sexo_dni`, etc.) SOLO deben estar en archivos nuevos o en archivos que se modifican explícitamente para este sprint. NUNCA agregar columnas nuevas a SELECTs existentes que funcionan en producción — Supabase PostgREST falla si la columna no existe y el redirect al dashboard rompe toda la página.

## Beta Gate — bloqueo de registro (NO volver a confundir)
Mecanismo en `src/middleware.ts` → `passesBetaGuard`, controlado por la env var **`BETA_PASSWORD`** (cookie `docto_beta_access`). Fuente de verdad completa: **`docs/REGISTRO_BETA_GATE.md`**.
- **`BETA_PASSWORD` vacía = TODO el sitio caído** (loop de redirección), NO "abierto". Nunca dejarla vacía en prod.
- Seteada = beta cerrada: solo `/auth/register` y `/auth/registro-medico` piden la contraseña. Hoy `DoctoTest2026!`.
- **Cambiar una env var requiere DEPLOY FRESCO** (`vercel --prod`/`git push`), nunca `vercel redeploy`.
- **Previews:** cada preview necesita `BETA_PASSWORD` o loopea y el CI E2E muere. Fix permanente: setear "All Preview" en el dashboard de Vercel. Por-branch: la branch debe existir en el remoto ANTES del `vercel env add`.

## Estado actual (24 Junio 2026)
- MVP completo. Flujos core (CI + turnos + pagos + video + receta) en produccion.
- Firma electronica completa: Olas 1-5 mergeadas, auditoria Roberto OK, firma manuscrita OK.
- REFEPS real: Bus FHIR en produccion (SISA_MODE=produccion). **Gate duro (10/06/2026): un médico real NO puede quedar `aprobado` sin `refeps_validado=true`, jamás.** Las acciones `aprobar`/`reactivar` en `/api/admin/medicos` validan contra REFEPS en el momento (`asegurarRefepsParaAprobar`) y bloquean si la matrícula no figura encontrada+activa. Backstop a nivel DB: constraint `medicos_aprobado_requiere_refeps` (cuentas `es_cuenta_test` exentas). El botón "Validar REFEPS" del panel admin sigue para re-validar.
- Vademecum CNPM: 16.878 medicamentos oficiales con lazy-load y deteccion dual de controlados.
- Receta estructurada Rp/IFA: formato AAIP/ReNaPDiS compliant.
- **LANZADO AL PÚBLICO (10/06/2026):** registro abierto (`BETA_PROTECTED` vacío en middleware; `BETA_PASSWORD` sigue seteada — fail-closed, NUNCA vaciarla) + cobro real general ON (`pago_marketplace` activo desde 10/06 19:15 ART). Prueba real de pagos validada (3 consultas con plata real, split OK: médico ~$27k, Docto $1.500/consulta a GREBA). Cuentas test SIEMPRE simulan el pago (guard en crear-v2). Para re-cerrar beta: re-agregar rutas a `BETA_PROTECTED`.
- **Sprint 07/06/2026 — Evoluciones + HC + Orden + Alertas:** evolución auto-compuesta determinística (formato `tema: contenido`) + validación humana ("Revisé y confirmo"); "Mis pacientes" + timeline unificado CI+turnos; **unificación de canales** (`WorkspaceConsulta` channel-aware — los turnos guardan igual que CI); panel HC durante la llamada + reorden Documentar + campo Orden (`documentos.tipo='orden'`); pantalla de cierre del paciente sin preview; alertas del médico (sonido + popup "paciente listo" para CI pagada y turno en sala de espera). Detalle: `docs/sprints/2026-06-07-evoluciones-hc-orden-alertas.md`.
- **Maratón 23/06/2026 (15 PRs #199-#213):** Dashboard CEO `/insights` (datos coherentes + toggle "Solo reales"), funnel del paciente instrumentado, **guard de rol central** (`src/lib/auth/rol.ts`, admin>médico>paciente), médicos no-validados grisados en la clínica, Matrícula Nacional como requisito + aviso en registro, canal de notificaciones admin→médico, reembolsos (refund total revierte el fee + bug del fee corregido), landing cita Ley 27.802. (Falta el doc de sprint dedicado.)
- **24/06/2026 — Outage dashboard médico + diagnóstico de oferta:** un grant de columna faltante (`celular_personal`) tiraba a TODOS los médicos a la vista de paciente y trababa el toggle "disponible" → causa real del colapso de oferta (0 médicos disponibles). Fixes PR #214 (auto-apagar disponibilidad 4h), #215 (mail bienvenida sin "fundador/5%"), #216 (dashboard/actions/onboarding vía service role + guard). Campaña de reactivación a 6 médicas. Detalle: `docs/sprints/2026-06-24-outage-dashboard-medico-y-diagnostico-oferta.md`.
- Ver docs/STATUS_REAL_2026-05-28.md para estado detallado con evidencia por item.
- Ver ROADMAP_OPERATIVO.md para progreso Tier 1 (4/15 completados, 27%).
- **Camino al lanzamiento:** `docs/CAMINO_A_LANZAMIENTO_V1.md` — **COMPLETADO 10/06/2026**. Prueba real de pagos OK, registro abierto, cobro real general ON. Queda: prueba con 2 testers externos (`docs/PRUEBA_PRE_LANZAMIENTO.md`) y separación GREBA→SRL (las comisiones hoy caen en GREBA).

## Repositorio PÚBLICO — nunca publicar datos de personas reales
`github.com/diegocartu-dev/uber-doc` es **público**. En código, comentarios,
mensajes de commit, PRs, comentarios de PR e issues **NUNCA** van: nombres de
pacientes o médicos reales, emails, teléfonos, DNI/CUIT, IDs de consultas o
turnos, montos cobrados, ni resultados de consultas a la base de producción
(conteos de filas, estados de médicos, etc.).

Los casos reales se describen en genérico: "una paciente", "un médico", "un
reclamo del 01/08". El detalle con nombres vive en la conversación con Diego y
en el panel admin, nunca en el repo.

Vale también para los agentes: todo prompt de trabajo delegado debe incluir esta
regla. Incidente que la motiva (07/08/2026): agentes publicaron en PRs el nombre
de un paciente con el monto que pagó, y el DNI real de un médico quedó escrito
en `docs/pruebas/`. Corregido, pero el historial de git conserva las versiones
viejas: por eso lo importante es no escribirlo nunca.
