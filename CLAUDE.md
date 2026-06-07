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
Mecanismo en `src/middleware.ts` → `passesBetaGuard`. Controlado por **una env var: `BETA_PASSWORD`** (Vercel, scope production). Cookie de desbloqueo: `docto_beta_access`.
- **`BETA_PASSWORD` vacía = SITIO ENTERO CAÍDO** (loop de redirección a /beta-access), NO "abierto". Nunca dejarla vacía en prod.
- **`BETA_PASSWORD` seteada = beta cerrada**: solo `/auth/register` y `/auth/registro-medico` piden la contraseña; el resto del sitio navega libre. Estado actual: `DoctoTest2026!`.
- **Abrir registro al mundo = cambio de código** (sacar rutas de `BETA_PROTECTED`), NO se logra con env vars.
- **Cambiar una env var requiere DEPLOY FRESCO** (`vercel --prod` o `git push`). `vercel redeploy` reusa el snapshot viejo y NO toma el cambio.
- **Verificar SIEMPRE contra el sitio vivo** con curl (no contra `vercel env ls` ni `.env.local`).
- Detalle completo, procedimiento y comandos: **`docs/REGISTRO_BETA_GATE.md`**.

## Estado actual (28 Mayo 2026)
- MVP completo. Flujos core (CI + turnos + pagos + video + receta) en produccion.
- Firma electronica completa: Olas 1-5 mergeadas, auditoria Roberto OK, firma manuscrita OK.
- REFEPS real: Bus FHIR en produccion (SISA_MODE=produccion), validacion manual durante F&F.
- Vademecum CNPM: 16.878 medicamentos oficiales con lazy-load y deteccion dual de controlados.
- Receta estructurada Rp/IFA: formato AAIP/ReNaPDiS compliant.
- Beta cerrada: registro gateado por `BETA_PASSWORD=DoctoTest2026!` (no whitelist de emails). Verificado contra prod 2026-06-07. Ver `docs/REGISTRO_BETA_GATE.md`.
- Ver docs/STATUS_REAL_2026-05-28.md para estado detallado con evidencia por item.
- Ver ROADMAP_OPERATIVO.md para progreso Tier 1 (4/15 completados, 27%).
