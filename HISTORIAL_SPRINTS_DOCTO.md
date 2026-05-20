# HISTORIAL DE SPRINTS DOCTO

Registro cronológico de sprints cerrados, decisiones técnicas y 
PRs mergeados. Este documento es la línea de tiempo del producto 
desde su consolidación operativa.

Los sprints en curso o futuros NO viven acá — viven en la memoria 
de trabajo activa de Claude.

---

## 2026

### Abril

#### 04/04 — Tendencia de diseño aprobada
**Decisión visual** que define la línea del producto:
- Hemisferios con identidad de color: azul #378ADD = turnos, 
  verde #1D9E75 = consultas inmediatas
- Historiales full-width dentro de cada columna
- Badges de tipo en fichas
- Bordes izquierdos de color
- Headers con fondo sutil

Esta línea visual se mantiene en todo el producto.

---

#### 05/04 — Nova operativa en producción
**Asistente AI médico** activado en producción.

**Stack:**
- Claude Sonnet 4.6 (tool use)
- OpenAI TTS (voz "nova")
- Web Speech API (dictado del médico)

**Rutas:**
- `/api/nova/chat`
- `/api/nova/tts`
- `/api/nova/confirmar`

**Tools de Nova:**
- `ver_agenda`
- `crear_slots`
- `bloquear_agenda`
- `cancelar_turno`
- `ver_estado_pago`

**Frontend:**
- `/medico/nova` con chat + dictado + audio + botones
- Widget + FAB en dashboard
- Grilla agenda adaptativa

**Keys:** `ANTHROPIC_API_KEY` y `OPENAI_API_KEY` en Vercel.

**Decisión:** se creó cuenta Inworld pero se usa OpenAI TTS 
(mejor español LATAM, ~$0.005/mes).

---

#### 06/04 — Fase 1 Seguridad completada
**4 fixes críticos** pusheados y migraciones SQL aplicadas:

| Item | Descripción |
|------|-------------|
| C1 | Bypass de pago cerrado: webhook MP + estado "pagada" en enum + video solo si pagada/en_curso |
| C2 | Leak de sala cerrado: ownership check en `/api/consulta-estado` |
| C3 | Meeting tokens Daily.co: salas private + tokens firmados por usuario |
| C4 | RLS paciente restringido: solo puede cancelar consultas en "esperando" + documentos FK cambiada a RESTRICT |

**Bug historial cfda7d3** verificado como YA RESUELTO.

---

#### 07/04 — Workspace unificado del médico completado
**Video Daily.co embebido en iframe dentro de Docto** (no salida 
a app externa).

**Médico:**
- Ruta: `/medico/consulta/[id]/workspace`
- Mobile con dos modos: video (75vh) y escritura (barra 80px)
- Botones separados:
  - En video: Documentar + Finalizar
  - En escritura: Guardar + Volver
- Diagnóstico obligatorio
- Auto-save JSONB cada 5s
- "Saltar docs" eliminado

**Paciente:**
- Ruta: `/consulta/[id]/sala`
- Polling 5s
- Ve "Consulta finalizada" + documentos automáticamente

**Patrón crítico:** el iframe de video NUNCA se desmonta (CSS 
hiding) — esto fix problemas de WebRTC en navegadores.

---

#### 08/04 — Consultorio Particular completado
**Página `/dr/[slug]`** operativa para cada médico.

**Fix de logo (09/04):**
- Si paciente ingresó por `/dr/[slug]`, el logo vuelve a 
  `/dr/[slug]` (vía `sessionStorage docto_origin_slug`)
- Si ingresó por Clínica Virtual, el logo va a `/`

Aplica en: sala de espera, sala de consulta, flujo de pago.

---

#### 09/04 — OrigenBadge unificado completado
**Componente único `OrigenBadge`** que muestra de dónde viene 
cada consulta/turno.

**Columna `canal_origen`** en tablas `consultas` y `turnos`. 
Tres valores posibles:

| Valor | Significado | Color |
|-------|-------------|-------|
| `null` | Consulta Inmediata | Verde #1D9E75 |
| `clinica_virtual` | Clínica Virtual | Azul #378ADD |
| `consultorio_privado` | Consultorio Particular | Naranja #D85A30 |

Se muestra en: dashboard médico, historial inline, ficha 
paciente, documentos.

---

#### 16/04 — Estabilización general
**Patrones técnicos consolidados:**
- Polling migrado a `setInterval` 5s (Supabase Realtime abandonado)
- `window.confirm()` reemplazado por dialog React (fix Safari)
- Verde #1D9E75 eliminado de UI general — SOLO se usa para 
  estados activos
- Botones primarios: azul #378ADD
- "Continuar consulta" + "Cancelar consulta": con borde rojo
- Historial: `ORDER BY DESC`

---

#### 16/04 — Decisión de video: migrar a LiveKit
**Daily.co roto en producción:**
- Video negro en ambas pantallas (médico y paciente)
- Pantalla "Has abandonado la llamada" no suprimible
- Alto CPU en Safari

**Decisión firme:** migrar a LiveKit Cloud.

**LiveKit Cloud:**
- Gratis hasta 5.000 minutos/mes
- $0.0004/min después
- Control total sobre la UI

**Regla:** NO cancelar Daily.co hasta tener LiveKit estable en 
producción.

---

#### 16/04 — Sprint Receta diseñado
**Migración 040** aplicada en Supabase. Nuevas columnas:
- `fecha_nacimiento`
- `sexo_dni`
- `tiene_cobertura`
- `obra_social`
- `nro_afiliado`
- `perfil_medico_completado`

Rama `elastic-perlman` descartada. Briefs listos para Sofía y 
Marcos. Implementación pospuesta hasta cerrar estabilización.

---

### Mayo

#### 10/05 — Estructura fiscal aclarada
**Corrección importante:** Make Sense SRL NO existe como entidad 
de Docto. Fue descartado.

**Estructura real:** Diego opera como **Responsable Inscripto** 
(persona física con su CUIT). Toda la estructura regulatoria 
(AAIP, ReNaPDiS) va a nombre de Diego persona física.

Facturación se trata como sprint aparte futuro.

---

#### 10/05 — Modelo Mercado Pago definitivo
**Médico conecta SU MP** vía OAuth. Paciente paga directo a 
cuenta MP del médico. MP descuenta comisión Docto 
automáticamente (5/10/15% según perfil) y la deposita en cuenta 
MP de Docto vía `application_fee`.

**Ejemplo:**
- Paciente paga $30.000
- Médico recibe $27.000 directo
- Docto recibe $3.000 directo

**Importante:** Docto NUNCA toca plata bruta. Facturación 
mensual al médico = sprint aparte.

---

#### 11/05 — Setup completo Mercado Pago
**App "Docto"** en MP developers:
- Client ID: `8893156415936925`
- Cuenta: Diego RI, User ID `28443305`
- Sub-identidad: "DIEGO Docto"
- Tipo: Checkout API + API de Pagos
- Redirect OAuth: `docto.com.ar/api/mp/oauth/callback`
- Permisos: read + write + offline_access + APIs
- Webhook prod+test: `/api/pago/webhook` con 4 eventos
- Claves en Vercel

**App vieja "UberDoc"** (`681547995541212`) sigue en producción 
hasta validar Marketplace.

Documentación detallada: `MERCADOPAGO_CONFIGURACION_DOCTO.md`.

---

#### 15/05 — Sprint Receta PR1 mergeado
**PR #62 en main.**

**Cambios:**
- Motor PDF: `pdfkit` + Inter, server-side
- Backfill vademécum: `forma_farmacéutica` en 8.029/8.038 ítems
- Modal cobertura con lógica:
  - Firma directa por default
  - Ícono lápiz para ingreso manual
  - Modal automático solo si datos incompletos
- Form medicamento: solo Forma + Presentación (se eliminaron 
  Cantidad, Posología y Vía)
- Footer PDF: SOLO leyendas ReNaPDiS textuales (sin AAIP — se 
  detectó sobre-cumplimiento y se sacó)

**Env vars vacías** pendientes de carga:
- `RENAPDIS_RL_NUMBER`
- `RENAPDIS_EXPEDIENTE`

**Migraciones SQL en prod:** 2 aplicadas.

**Auditorías:** Roberto + Sofía OK.

---

#### 18/05 — Regulatorio: aprobaciones completadas

| Trámite | Estado | Número |
|---------|--------|--------|
| AAIP Responsable | Aprobado | RL-2026-36086505-APN-DNPDP#AAIP |
| AAIP Base de Datos | Aprobado | RL-2026-41929595-APN-DNPDP#AAIP (IF-2026-41929601) |
| ReNaPDiS | Aprobado | RL-2026-48984072-APN-SSVEIYES#MS (IF-2026-48984138) |
| ABM Dominios | En evaluación | — |
| Farmalink | Esperando respuesta | — |
| RENAPER | Diferido | — |

**ID plataforma Docto:** `0270`

---

#### 18/05 — Sprint A MP cerrado
**6 items en producción:**

1. `RENAPDIS_RL_NUMBER` verificado en PDF
2. Whitelist live_mode OAuth (`MP_TEST_SELLERS_WHITELIST`) + 
   email alerta
3. Transición automática `pagada → en_curso` (webhook + cron 
   fallback)
4. Cleanup de `mp_oauth_state` > 1h
5. Rate limiting webhook (tabla `webhook_failed_attempts`)
6. "Darme de baja" removido

**Cambios adicionales:**
- Sweep "Dr. Dr." en 22 archivos vía `formatNombreMedico()`
- Ruta `/api/pago` eliminada
- CI sin previews automáticos
- 7 consultas stale canceladas

**PRs mergeados:** #64 y #67

---

#### 18/05 — Beta Guard Fase 2 cerrado
**Hallazgo:** el vector real de creación de cuentas no era el 
signUp directo, sino Google OAuth.

**Estado de cuentas (77 total):**
- 22 internas/test
- 1 médica real (`sofia_fasce@hotmail.com`)
- 44 pacientes vía Google OAuth (entre 15/04 y 18/05)

**PR #63 mergeado:**
- `disable_signup=true`
- `external_google_enabled=false`
- Middleware, flags y beta-login en fail-closed

**Decisión:** las 44 cuentas externas SE DEJAN (no pidieron 
turno, son prospects orgánicos).

**Reapertura del beta** requiere:
- Reactivar signup + Google OAuth
- Nuevo gate (whitelist o invitación)

---

#### 18/05 — Sprints menores mergeados (mismo día)

- **PR2 OOSS** (obras sociales)
- **Mini UX:** toggle CI, botones Aceptar/Rechazar, acordeón, 
  colapsar panel
- **Perfil Médico:** onboarding progresivo, panel de progreso, 
  banner MP, dropdown del avatar, perfil editable, soft delete, 
  PDF con `domicilio_consultorio` real

---

#### 19/05 — E2E Mercado Pago validado parcialmente
**Test ejecutado por Diego** en navegación incógnita contra 
producción.

**OK:**
- OAuth seller TESTUSER funcionó
- Cuenta MP `3410484183` conectada
- Checkout MP cargó correctamente
- Formulario de tarjeta funcionó

**Falló:** pago final con mensaje "Una de las partes es de 
prueba".

**Diagnóstico:** Diego pagó como buyer real (no logueado como 
TESTUSER buyer). MP bloquea mezcla test+real por diseño.

**No es un bug** — es comportamiento esperado.

**Validación de pago aprobado real** queda pendiente para 
Friends & Family.

---

#### 19/05 — Sprint B cerrado (6 de 8 items)

| # | Item | Estado |
|---|------|--------|
| 1 | Push notifications + 3 sub-items | PR #68 |
| 2 | CI health (sereno-report) | Mergeado |
| 3 | Schema migrations | Backlog (sync rota CLI) |
| 4 | Drift audit | Backlog (depende de 3) |
| 5 | Backlog menor | Mergeado |
| 6 | Validar LiveKit estable | GO para deprecar Daily |
| 7 | Daily.co cleanup | PR #68 |
| 8 | Cancelar servicio Daily.co | Email a `delete@daily.co` |

**PR #68 incluye:**
- Hardening server-side `crearConsulta()` (RLS con check de 
  `disponible`, `verificado`, `aprobado`, `!es_cuenta_test`)
- Niveles silent/agresiva en push notifications
- Push agresiva cuando paciente entra a sala CI
- Eliminación de paquetes Daily.co

**Auditorías:** Roberto OK en los 3 sub-items.

---

#### 19/05 — Sprint C arrancado: arquitectura 3 páginas
**PR #69 mergeado.**

**Nueva arquitectura:**

| Ruta | Contenido |
|------|-----------|
| `/` | Entrada general con dos botones "Soy médico" / "Soy paciente" |
| `/pacientes` | Landing paciente (movida sin cambios) |
| `/medicos` | Landing médico (ya existía con copy "Monetizá tu tiempo libre") |

**Auditorías:** Sofía + Roberto OK.

---

*Documento creado el 19/05/2026. Actualizar al cierre de cada 
sprint con scope, PRs y decisiones técnicas asociadas.*
