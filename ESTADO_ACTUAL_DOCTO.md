# ESTADO ACTUAL DOCTO

Snapshot del producto al día de hoy. Stack técnico, infraestructura, 
integraciones, situación regulatoria, fiscal y comercial.

Este documento se actualiza cuando cambia el estado del sistema.
Última revisión: 19/05/2026.

---

## 1. PRODUCTO

### 1.1 Qué es Docto

Plataforma argentina de telemedicina que conecta pacientes con 
médicos vía consultas virtuales.

**Dominio:** docto.com.ar

**Propuesta de valor para médicos:**
- Consultorio virtual con marca propia (link personal `/dr/[slug]`)
- Cobran antes de atender (Mercado Pago directo)
- Sin obra social de por medio
- Sin abono mensual
- Comisión solo cuando hay consulta efectiva
- Nova (asistente AI) elimina burocracia administrativa
- Compliance regulatorio cubierto por la plataforma

**Propuesta de valor para pacientes:**
- Tres modalidades de atención (Consulta Inmediata, Turnos 
  Programados, Consultorio Particular)
- Pago seguro por Mercado Pago
- Recetas digitales con validez legal
- Historia clínica accesible

### 1.2 Modalidades de atención

| Modalidad | Descripción | Color |
|-----------|-------------|-------|
| Consulta Inmediata | On-demand, médico disponible ahora | Verde #1D9E75 |
| Turnos Programados | Reserva con anticipación | Azul #378ADD |
| Consultorio Particular | Link personal del médico (`/dr/[slug]`) | Naranja #D85A30 |

---

## 2. STACK TÉCNICO

### 2.1 Resumen de servicios

| Capa | Servicio | Función |
|------|----------|---------|
| Frontend + Backend | Next.js 14 (App Router) en Vercel | Aplicación completa |
| Base de datos + Auth | Supabase (PostgreSQL) | Datos, usuarios, RLS, autenticación |
| Video | LiveKit Cloud | Videollamadas |
| Pagos | Mercado Pago | OAuth marketplace, checkout, webhooks |
| Email transaccional | Resend | Notificaciones a pacientes |
| Asistente AI (Nova) | Anthropic Claude + OpenAI TTS | Chat, tool use, voz |
| Repositorio | GitHub | `diegocartu-dev/uber-doc` |

### 2.2 Datos clave de infraestructura

**Supabase:**
- Project ref: `irpupskopjahbqqvckue`

**Vercel:**
- Team: `diegocartu-devs-projects`

**GitHub:**
- Repo: `github.com/diegocartu-dev/uber-doc`
- Local del repo: `~/Documents/uber-doc` (Mac de Diego)

**LiveKit:**
- URL: `wss://docto-video-d4i6thna.livekit.cloud`

**Mercado Pago:**
- App "Docto" Client ID: `8893156415936925`
- Cuenta: Diego RI, User ID `28443305`
- Sub-identidad: "DIEGO Docto"
- App vieja "UberDoc" (`681547995541212`) sigue en prod hasta 
  validar Marketplace

### 2.3 Arquitectura

**Monolito Next.js + Supabase.** No hay servidor backend separado.

Todo el backend vive **dentro de Next.js en Vercel** como:
- API Routes (`/api/*`)
- Server Actions
- Supabase para BD, auth, RLS, almacenamiento

**Escalabilidad:** el stack soporta cómodamente miles de médicos 
activos y decenas de miles de consultas mensuales. La elección 
de tecnologías estándar y portables permite migrar componentes 
individuales en el futuro sin reescribir Docto.

### 2.4 Patrones técnicos críticos

Ver `PRINCIPIOS_OPERATIVOS_DOCTO.md` sección 8 para detalle. 
Resumen:
- Supabase Realtime NO se usa — todo polling 5s
- Filtros Supabase solo en primary keys
- iframe de video nunca se desmonta (CSS hiding)
- `paciente_id` referencia distinta en `consultas` vs `documentos`

---

## 3. NOVA — ASISTENTE AI MÉDICO

**Estado:** operativo en producción desde 05/04/2026.

**Stack:**
- Claude Sonnet 4.6 (tool use)
- OpenAI TTS (voz "nova", español LATAM, ~$0.005/mes)
- Web Speech API (dictado del médico)

**Rutas:**
- `/api/nova/chat`
- `/api/nova/tts`
- `/api/nova/confirmar`

**Tools disponibles:**
- `ver_agenda`
- `crear_slots`
- `bloquear_agenda`
- `cancelar_turno`
- `ver_estado_pago`

**Frontend:**
- Página dedicada: `/medico/nova`
- Widget + FAB en dashboard del médico
- Funcionalidades: chat, dictado por voz, respuesta en audio, 
  botones de acción

**Keys en Vercel:** `ANTHROPIC_API_KEY` y `OPENAI_API_KEY`

**Cuenta Inworld:** creada pero NO se usa (OpenAI TTS quedó mejor 
para español LATAM).

---

## 4. SITUACIÓN REGULATORIA

### 4.1 Trámites aprobados

| Trámite | Estado | Número |
|---------|--------|--------|
| AAIP Responsable | Aprobado | RL-2026-36086505-APN-DNPDP#AAIP |
| AAIP Base de Datos | Aprobado | RL-2026-41929595-APN-DNPDP#AAIP (IF-2026-41929601) |
| ReNaPDiS | Aprobado | RL-2026-48984072-APN-SSVEIYES#MS (IF-2026-48984138) |

**ID plataforma Docto en ReNaPDiS:** `0270`

### 4.2 Trámites en curso

| Trámite | Estado | Próximo paso |
|---------|--------|--------------|
| ABM Dominios | En evaluación | Esperar respuesta |
| Farmalink | Catálogo de APIs recibido — esperando accesos a TEST | Construir/probar al recibir TEST (ver docs/farmalink-integracion.md) |
| RENAPER | Diferido | Retomar en sprint legal post B y C |

### 4.3 Marco legal aplicable

- **Ley 25.506** — Firma digital y firma electrónica
- **Ley 27.553** — Telemedicina
- **Ley 26.529** — Derechos del paciente, historia clínica, 
  consentimiento informado
- **Ley 25.326** — Protección de datos personales
- **Decreto 63/2024** — Recetas digitales
- **Decreto 98/2023** — Reglamentación telemedicina

### 4.4 Variables de entorno regulatorias

Estado en Vercel:
- `RENAPDIS_RL_NUMBER` — vacía, pendiente carga
- `RENAPDIS_EXPEDIENTE` — vacía, pendiente carga

---

## 5. ESTRUCTURA FISCAL Y LEGAL

### 5.1 Estructura actual

**Diego opera como Responsable Inscripto (persona física con su CUIT).**

NO hay SRL. NO hay Make Sense ni ninguna otra entidad. Toda la 
estructura regulatoria (AAIP, ReNaPDiS) está a nombre de Diego 
persona física.

### 5.2 Pendientes fiscales

- **Facturación a médicos:** sprint aparte futuro
- **Estructura societaria:** no definida, se evaluará cuando el 
  volumen lo justifique
- **Cuenta bancaria empresarial:** no aplica todavía (todo opera 
  por cuenta MP de Diego RI)

### 5.3 Antes de mencionar entidad legal en cualquier contexto

**Confirmar con Diego** la situación actual. Make Sense SRL ha 
sido mencionado erróneamente en el pasado — no existe como 
entidad de Docto.

---

## 6. MERCADO PAGO

### 6.1 Modelo de pagos

**Marketplace con application_fee:**

**Ejemplo concreto** (médico al 10%):
- Paciente paga $30.000
- Médico recibe $27.000 directo
- Docto recibe $3.000 directo

**Importante:** Docto **NUNCA toca plata bruta.** El split es 
automático vía `application_fee`.

### 6.2 Comisiones

| Tier | Comisión | Aplica a |
|------|----------|----------|
| Founder Beta | 5% | Primeros médicos beta |
| Estándar | 10% | Post-beta |
| Premium | 15% | Médicos con funciones avanzadas |

### 6.3 Configuración técnica

- Redirect OAuth: `docto.com.ar/api/mp/oauth/callback`
- Permisos: read + write + offline_access + APIs
- Webhook: `/api/pago/webhook` con 4 eventos
- Claves en Vercel
- Whitelist live_mode: `MP_TEST_SELLERS_WHITELIST`

Documentación detallada: `MERCADOPAGO_CONFIGURACION_DOCTO.md`

---

## 7. ESTADO BETA

### 7.1 Acceso cerrado

**Sprint Beta Guard Fase 2 cerrado el 18/05/2026.**

Estado actual:
- `disable_signup=true`
- `external_google_enabled=false`
- Middleware en fail-closed
- No se pueden crear cuentas nuevas

### 7.2 Cuentas existentes (77 total)

| Tipo | Cantidad |
|------|----------|
| Internas / test | 22 |
| Médica real (Sofía Fasce) | 1 |
| Pacientes vía Google OAuth (orgánicos) | 44 |

**Las 44 cuentas externas se mantienen** — son prospects orgánicos 
que no pidieron turno todavía.

### 7.3 Reapertura del beta

**Requiere:**
- Reactivar signup + Google OAuth
- Implementar nuevo gate (whitelist o invitación)
- Probablemente después de F&F testing

---

## 8. ROADMAP

### 8.1 Sprints en curso

**Sprint C — Landings** (arrancado 19/05):
- PR #69: Arquitectura 3 páginas mergeada
- Audit y refinamiento de `/medicos`
- Fixes mobile pendientes en `/pacientes`

### 8.2 Próximos sprints en orden

1. **Cerrar Sprint C** (landings refinadas y mobile-ready)
2. **Sprint Legal / Compliance:**
   - Validación de médicos (SISA / REFEPS — hoy en simulación)
   - Firma digital para recetas (CUIR real, post-ReNaPDiS aprobado)
   - Proceso de validación previo a aprobación del médico
3. **Friends & Family testing:**
   - Conocidos NO médicos
   - MP real, montos chicos
   - Validación end-to-end del flujo de pago
4. **Onboarding del primer médico beta real** (post F&F exitoso)
5. **Items en backlog técnico:**
   - Schema migrations sync (Sprint B item 3)
   - Drift audit general (Sprint B item 4)

### 8.3 Backlog menor (no urgente)

- Capitalizar nombres en código (dead code)
- Edge case `formatNombreMedico("Dr.Carlos")` sin espacio
- Push CI: mover dentro de `registrarEntradaSala()` para evitar 
  re-envío al recargar (sugerencia de Roberto, no bloqueante)

---

## 9. DECISIONES DE PRODUCTO ACTIVAS

### 9.1 Sistema de notificaciones

**Niveles definidos (19/05):**

| Evento | Tipo |
|--------|------|
| Paciente reserva turno futuro | Silenciosa |
| Paciente cancela turno futuro | Silenciosa |
| Paciente entra a sala de CI (médico ON) | Agresiva |
| Paciente entra a sala de turno con pago iniciado | Agresiva |

**Implementado en PR #68.**

### 9.2 Disponibilidad para Consulta Inmediata

- Toggle de "Disponible para CI" filtra **routing**, no notificaciones
- Si médico está OFF, las CIs no aparecen como opción al paciente 
  (client-side)
- Server-side hardening implementado en RLS de `consultas` (PR #68):
  - Solo se crean consultas con médicos que cumplan:
    - `disponible = true`
    - `verificado = true`
    - `estado_registro = 'aprobado'`
    - `es_cuenta_test = false`

### 9.3 Canal de origen de consultas

Columna `canal_origen` en tablas `consultas` y `turnos`:
- `null` → Consulta Inmediata
- `clinica_virtual` → Clínica Virtual
- `consultorio_privado` → Consultorio Particular (vía `/dr/[slug]`)

Visible en: dashboard médico, historial inline, ficha paciente, 
documentos generados.

---

## 10. PERFIL ADMIN DE DOCTO

**Email admin:** `diegocartu@gmail.com`

**Accesos:**
- Owner único Supabase
- Owner único Vercel team
- Admin único GitHub repo
- Owner MP app
- Owner Anthropic + OpenAI APIs

**Recovery:** sin co-owners definidos. Pendiente armar plan de 
sucesión / acceso de emergencia.

---

## 11. INTEGRACIONES PENDIENTES

| Integración | Estado | Bloquea a |
|-------------|--------|-----------|
| SISA / REFEPS (validación matrículas) | En simulación | Onboarding médico real |
| Firma digital recetas (CUIR) | Pendiente | Recetas con validez plena |
| Farmalink | Catálogo de APIs recibido — esperando accesos a TEST | Recetas dispensables en cadenas (ver docs/farmalink-integracion.md) |
| RENAPER | Diferido | Validación identidad paciente |

---

## 12. DOCUMENTACIÓN RELACIONADA

Para profundizar en cada área, ver:

- `EQUIPO_VIRTUAL_DOCTO.md` — Perfiles del equipo
- `PRINCIPIOS_OPERATIVOS_DOCTO.md` — Cómo trabaja el equipo
- `HISTORIAL_SPRINTS_DOCTO.md` — Línea de tiempo del producto
- `DECISIONES_PRODUCTO_DOCTO.md` — Decisiones de producto detalladas
- `DECISIONES_NOTIFICACIONES_DOCTO.md` — Sistema de notificaciones
- `ACCESOS_PROCEDIMIENTOS_DOCTO.md` — Accesos y comandos técnicos
- `MERCADOPAGO_CONFIGURACION_DOCTO.md` — Setup completo de MP
- `QUALITY_GATE_DOCTO.md` — Pruebas E2E históricas
- `ARQUITECTURA_VIDEO_DOCTO.md` — Setup LiveKit
- `DOCUMENTACION_ADMIN_DOCTO.md` — Panel admin
- `DOCUMENTACION_TECNICA_DOCTO.md` — Detalles técnicos
- `GO_MARKET_DOCTO.md` — Estrategia comercial

---

*Documento creado el 19/05/2026. Actualizar cuando cambie estado 
del sistema, infraestructura, regulatorio o roadmap principal.*
