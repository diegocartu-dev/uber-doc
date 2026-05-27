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
- Video: Daily.co (integrado con DailyIframe JS SDK `@daily-co/daily-js`)
- Pagos: Mercado Pago (simulado)
- Hosting: Vercel (auto-deploy desde GitHub)
- Repo: github.com/diegocartu-dev/uber-doc
- Producción: uber-doc.vercel.app
- Dominio: docto.com.ar

## Reglas de desarrollo
- SIEMPRE diseñar y validar arquitectura antes de implementar.
- Supabase RLS activo. Usar supabaseAdmin para bypass.
- Realtime: filtros en non-PK fallan. Escuchar sin filtros, filtrar en JS.
- Video Daily.co: Safari OK, Chrome iPhone NO.
- UX simple para médico de 70 años.
- Todo se prueba en docto.com.ar, NUNCA en localhost.
- Push a main = redeploy automático en Vercel.
- Simplificación bold > debugging incremental.
- NO usar `window.confirm()` ni `window.alert()` — Chrome los suprime en páginas con iframes cross-origin. Usar dialogs React inline con zIndex alto.
- Migraciones SQL: Marcos no puede ejecutar desde CLI (falta SUPABASE_ACCESS_TOKEN en el entorno). Usar la Management API con el token `sbp_2a46...` para ejecutar DDL directo. Nunca pedir a Diego que toque la terminal.
- Storage buckets: verificar con `npx tsx scripts/verify-storage-buckets.ts` post-deploy. Buckets críticos: avatars (público), credenciales-medicos, consultas-temp, firmas-medicos (privados).

## Auditoría de seguridad — Regla de evidencia empírica
Toda auditoría de seguridad (puntual o integral) debe incluir evidencia empírica reproducible por hallazgo: el comando exacto que reproduce el problema, el output real, y clasificación clara entre "explotable hoy" / "vulnerabilidad latente" / "buena práctica pendiente". Reportes basados solo en lectura de código o policies sin tests reales no son accionables y no disparan sprints de fixes.

## Protocolo de sprint
- **Un commit por ticket.** Sin excepción. Permite revertir tickets individuales si algo rompe.
- **No merge sin OK explícito de los gates de auditoría.** Si un ticket tiene gate (Roberto, Sofía, Diego), el código espera en rama hasta recibir OK. Tickets sin gate pueden ir a main independientemente.
- **Extensión de alcance se reporta SIEMPRE.** Aunque sea consecuencia técnica obligatoria de otro ticket, se documenta en el reporte con razonamiento. La decisión de aprobar la extensión la toma Diego, no el implementador.

## Design system
- Verde #1D9E75 — SOLO para indicadores de estado (dots EN CURSO, badge Disponible, badge Activa). NUNCA en botones, marcos, ni controles UI.
- Azul #378ADD — Botones de acción, marcos de cards, toggles, links interactivos, CTAs secundarios.
- Naranja #D85A30 (alerta)
- Gris #888780 (bloqueado, links secundarios)
- Rojo #E24B4A (cancelado/error) — Botones de cancelar: borde rojo, fondo transparente.
- Amarillo #BA7517 (pendiente)
- Tipografía: Inter en todo el producto, incluyendo PDFs.

## Arquitectura de video — Daily.co

### Integración actual
Los dos componentes de video (`WorkspaceConsulta.tsx` para médico, `SalaConsultaPaciente.tsx` para paciente) usan **DailyIframe JS SDK** (`@daily-co/daily-js`) con `DailyIframe.createFrame()` sobre un elemento `<iframe>` con ref. El SDK controla el iframe completo — no se usa `src` en el tag HTML.

### Listener left-meeting (CRÍTICO)
Ambos componentes escuchan `callFrame.on("left-meeting")` para ocultar el iframe inmediatamente (`setIframeVisible(false)`). Sin esto, Daily.co muestra su pantalla interna "Has abandonado la llamada" antes de que React pueda reaccionar.

### Flujo de finalización del médico
1. Médico toca "Finalizar consulta" → dialog React inline (NO `window.confirm`)
2. Confirma → `setIframeVisible(false)` oculta iframe con CSS `display: none`
3. `router.push('/dashboard')` — redirect inmediato sin esperar Supabase
4. Guardado de documentos + update estado `completada` ocurre en background (fire-and-forget IIFE)
5. Si el guardado falla, el médico ya está en el dashboard — falla silenciosamente

### Flujo de detección del paciente
1. **Realtime** (Supabase channel) escucha UPDATE en consultas por PK → detecta `completada` → `setIframeVisible(false)` + muestra pantalla de cierre con documentos
2. **Polling de respaldo** cada 5s a `/api/consulta-estado` → detecta `completada` → `setIframeVisible(false)` + `router.push('/mis-consultas')`
3. El polling usa `useRef` (yaRedirigioRef) como flag, NO estado en dep array — si `estado` estuviera en deps, el useEffect se destruiría al cambiar y la guard lo mataría

### Problemas conocidos y aprendizajes
- **`window.confirm()` + iframe cross-origin = SILENCIOSAMENTE SUPRIMIDO** en Chrome/HTTPS. El confirm devuelve `false` sin mostrar nada. Toda confirmación destructiva debe usar dialog React.
- **setState es async**: `setIframeVisible(false)` no hace efecto hasta el siguiente render. Si el redirect ocurre antes del repaint, el iframe sigue visible un instante. Por eso el SDK escucha `left-meeting` — es la señal más temprana posible.
- **Archivo DEPRECATED**: `src/app/consulta/[id]/video/VideoLlamada.tsx` tiene la implementación original correcta con DailyIframe SDK. Fue la referencia para migrar los componentes activos.
- **Supabase client no lanza excepciones**: devuelve `{data, error}`. Siempre verificar `error` antes de asumir éxito. El loop de finalización ocurría porque el update fallaba silenciosamente y el redirect no se ejecutaba.

### Lo que NO se debe hacer
- NUNCA usar `<iframe src={url}>` directo para Daily — el SDK debe controlar el frame con `createFrame()` + `join()`
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

## Estado actual (16 Abril 2026)
- MVP scope locked. Flujos core funcionando.
- Sprint estabilización completado: polling funciona, finalización sin loop, colores corregidos.
- PENDIENTE: Sprint perfil médico + receta (reimplementar desde main limpio), Vercel Cron, password reset, beta cerrada.
- BUGS RESUELTOS: (1) Polling reemplazó Realtime en sala de espera. (2) Finalización usa dialog React + fire-and-forget. (3) Daily.co integrado con SDK para detectar left-meeting.
