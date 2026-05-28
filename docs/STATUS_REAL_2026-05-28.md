# STATUS REAL — Docto, 28 mayo 2026

**Auditoría de estado con evidencia empírica.**
Cada item verificado contra código, archivos, endpoints, y commits reales.
NO se basa en lo que el ROADMAP dice — se basa en lo que EXISTE.

**Leyenda:**
- ✅ EXISTE / HECHO — implementado y funcionando. Con evidencia.
- ❌ AUSENTE — no existe en el código. Con evidencia negativa.
- 🟡 PARCIAL — existe parte. Con evidencia de qué hay y qué falta.
- ⚪ NO-TÉCNICO — depende de acción legal/admin/fiscal de Diego.

---

# TIER 1 — MÍNIMO VIABLE PARA OPERAR

**ROADMAP dice:** 0/16 completados, 19%
**Realidad:** 2 hechos, 1 parcial, 6 no-técnicos, 7 ausentes

## Bloqueantes regulatorios

### 1. Firma electrónica UI completa (Olas 2-5)
**ROADMAP dice:** ⏳ En curso
**Realidad:** ✅ HECHO — **DISCREPANCIA**

Evidencia:
- Ola 2: `bda920c` Modal OTP firma electrónica (PR #76) — mergeado en main
- Ola 3: `de4f8a3` Config 2FA + banner firma (PR #77) — mergeado en main
- Ola 4: `b631c5a` Sello visual en PDF + motor receta (PR #78) — mergeado en main
- Ola 5: `e31b26b` Página /verificar/{id} + rate limiting (PR #79) — mergeado en main
- Auditoría Roberto: `c8ea2e2` 6 hallazgos corregidos — mergeado
- Firma manuscrita: `9f10a57` (PR #85) — mergeado
- Docs técnicos: `64792d0` — mergeado
- Endpoints: `/api/firma/configurar`, `/api/2fa/generar`, `/api/2fa/validar` existen
- Backend firma: `src/lib/firma/` con `claves.ts`, `crypto.ts`, `otp.ts`, `receta.ts`
- Tabla `firma_logs` con registro no-repudiable (insert en `receta.ts:178`)
- Banner dashboard: `BannerFirmaElectronica.tsx` activo

### 2. Validación REFEPS real
**ROADMAP dice:** ⏳ Esperando
**Realidad:** 🟢 CASI HECHO — **DISCREPANCIA** (corregido 28/05/2026)

> **CORRECCIÓN (28/05/2026):** El status original de este item reportó
> SISA_MODE=simulacion basado en `.env.local`. Eso fue un error: producción
> en Vercel tiene `SISA_MODE=produccion` desde el 23/05/2026. Las
> credenciales son productivas y la validación real funciona.

Evidencia de lo que EXISTE y FUNCIONA en producción:
- Cliente FHIR real: `src/lib/refeps/client.ts` apunta a `bus.msal.gob.ar/fhir`
- Token endpoint: `bus.msal.gob.ar/bus-auth/v2/auth` con JWT HS256
- Validador: `src/lib/refeps/validar.ts` parsea FHIR Practitioner
- Types: `src/lib/refeps/types.ts`
- Admin UI: `src/app/admin/medicos/MedicosClient.tsx` con botón "Validar REFEPS"
- API admin: `src/app/api/admin/medicos/refeps/route.ts` — **NO usa toggle SISA_MODE, va siempre al Bus real**
- Commit: `5271a63` feat(refeps): validación real de matrículas (PR #84) — mergeado en main
- **Vercel Production env vars** (verificado con `vercel env pull`):
  - `SISA_MODE=produccion`
  - `REFEPS_SYSTEM_ID=3623`
  - `REFEPS_CREDENTIAL_ID=2582`
  - `REFEPS_TOKEN_SECRET` presente
- **Validación real ejecutada con éxito el 23/05/2026:**
  - Médica: Sofía Eugenia Fasce (DNI 31852639)
  - REFEPS devolvió 2 matrículas reales del Ministerio:
    - MP 232966 (Buenos Aires, Colegio de Médicos Distrito II, habilitada 22/07/2015)
    - MN 177699 (CABA, Ministerio de Salud de la Nación, habilitada 08/01/2021)
  - REFEPS ID: 541031852639, activa: true
  - Registrado en `admin_audit_log` #15 (IP 186.19.63.66, Safari Mac)
  - Resultado persistido en `medicos.refeps_data` con datos completos
- **Token del Bus funciona hoy (28/05/2026):** autenticación exitosa (status 200, token 422 chars), consultas FHIR con 502 intermitentes del Ministerio

Lo que FALTA (decisión de Diego, 28/05/2026):
- La validación REFEPS durante F&F y Beta es **manual por Diego desde panel admin**
- Cada médico se valida personalmente contra el Bus real al ingresar
- Sprint para integrar REFEPS automático en onboarding del médico: planificado para **PRE-PRODUCCIÓN** (antes de abrir a usuarios reales), no antes
- El Bus tiene 502 intermitentes (problema del Ministerio, no de Docto)

### 3. Endpoint público /verificar/{id}
**ROADMAP dice:** ⏳ En curso
**Realidad:** ✅ HECHO — **DISCREPANCIA**

Evidencia:
- Page: `src/app/verificar/[id]/page.tsx` existe
- Client: `src/app/verificar/[id]/VerificarRecetaClient.tsx` existe
- API: `src/app/api/verificar/[id]/route.ts` existe
- Mergeado en Ola 5: commit `e31b26b` (PR #79)
- Rate limiting + timing constante implementados

## Bloqueantes para captar médicos

### 4. Contrato Docto-Médico formal
**Realidad:** ⚪ NO-TÉCNICO — Depende de Carolina (legal). No verificable en código.

### 5. Política de comisiones formalizada
**Realidad:** 🟡 PARCIAL

Evidencia de lo que EXISTE:
- `src/lib/comisiones.ts` — lógica de comisiones con RPC `get_comision_medico`
- Tabla `comisiones_config` usada en DB
- `src/app/api/pago/crear-v2/route.ts:101` — `getComisionForMedico()` calcula marketplace_fee
- `src/app/api/admin/comisiones/route.ts` — endpoint admin para configurar comisiones

Lo que FALTA:
- Documento formal de política (legal/contractual) — no verificable en código

### 6. Seguro responsabilidad civil plataforma
**Realidad:** ⚪ NO-TÉCNICO — Trámite de Diego. No verificable en código.

### 7. Cuenta institucional @docto.com.ar
**Realidad:** 🟡 PARCIAL

Evidencia:
- El código ya REFERENCIA @docto.com.ar en UI:
  - `src/app/dashboard/PantallaVerificacion.tsx:103` → `mailto:soporte@docto.com.ar`
  - `src/app/dashboard/PantallaVerificacion.tsx:126` → `hola@docto.com.ar`
  - `src/app/medico/perfil/TabCobros.tsx:272` → `soporte@docto.com.ar`
- PERO `RESEND_API_KEY=re_placeholder_agregar_clave_real` en `.env.local` — la clave de Resend es un placeholder
- Sin confirmar si las cuentas @docto.com.ar reciben email realmente (DNS/MX de Diego)

### 8. Landing /medicos funcional
**ROADMAP dice:** ❌ Pausada
**Realidad:** 🟡 PARCIAL — **DISCREPANCIA**

Evidencia:
- `src/app/medicos/page.tsx` existe — 448 líneas, landing completa con secciones, íconos, CTAs
- Componente `MedicosLanding()` renderiza contenido real, no placeholder
- Fue construida pero marcada como "pausada"

### 9. Plan captación 30 médicos seed
**Realidad:** ⚪ NO-TÉCNICO — Estrategia de Diego. No verificable en código.

## Bloqueantes para emitir pagos

### 10. Friends & Family test MP real
**Realidad:** ⚪ NO-TÉCNICO — Es un test operativo con dinero real. No verificable en código.

La infraestructura técnica SÍ está lista:
- OAuth: `src/app/api/mp/oauth/` (start, callback, disconnect)
- Pago: `src/app/api/pago/crear-v2/route.ts` con marketplace_fee
- Webhook: `src/app/api/pago/webhook/route.ts` maneja payment.created, payment.updated, refunded, chargeback
- Auto-transición pagada→en_curso: webhook line 266
- Whitelist live_mode: callback line 126-135

### 11. Facturación automatizada a médicos
**Realidad:** ❌ AUSENTE

Evidencia: `grep -rl "afip|facturacion|factura.electronica" src/` → 0 resultados. No hay integración AFIP ni generación de facturas electrónicas.

### 12. Cancelar app vieja "UberDoc" en MP
**Realidad:** ⚪ NO-TÉCNICO — Acción manual de Diego en panel Mercado Pago.

## Verificaciones administrativas

### 13. Verificar AFIP RI vigente
**Realidad:** ⚪ NO-TÉCNICO — Verificación de Diego en AFIP.

### 14. Verificar IIBB CABA + Convenio Multilateral
**Realidad:** ⚪ NO-TÉCNICO — Verificación de Diego con contador.

### 15. Verificar CLAE para telemedicina
**Realidad:** ⚪ NO-TÉCNICO — Verificación de Diego en AFIP.

### 16. Auditoría de seguridad integral pre-producción
**Realidad:** 🟡 PARCIAL

Evidencia de lo que EXISTE:
- Auditoría Roberto firma electrónica: `c8ea2e2` (6 hallazgos corregidos)
- Doc: `docs/security/AUDITORIA_SEGURIDAD_SPRINT_BUS_FASE_2.md`
- RLS: 108 policies en migraciones
- 93 migraciones SQL aplicadas
- Rate limiting en OTP: commit `5c9b21b`

Lo que FALTA:
- Auditoría INTEGRAL de toda la plataforma (no solo firma)
- Sin pruebas de penetración
- Sin Sentry/monitoreo

---

# TIER 2 — ROADMAP DE CRECIMIENTO

## 1. Mercado Pago

| Item | ROADMAP | Realidad | Evidencia |
|------|---------|----------|-----------|
| 1a. OAuth flow | ✅ | ✅ HECHO | `src/app/api/mp/oauth/` — start, callback, disconnect. 3 rutas funcionales. |
| 1b. Split comisiones | ✅ | ✅ HECHO | `src/app/api/pago/crear-v2/route.ts:118` → `marketplace_fee`. `src/lib/comisiones.ts` con RPC. |
| 1c. Webhook 4 eventos | ✅ | ✅ HECHO | `src/app/api/pago/webhook/route.ts` maneja: payment.created, payment.updated, refunded, chargeback. |
| 1d. Whitelist live_mode | ✅ | ✅ HECHO | `src/app/api/mp/oauth/callback/route.ts:126` — chequea `live_mode`, whitelist test sellers. |
| 1e. Auto-transición | ✅ | ✅ HECHO | `src/app/api/pago/webhook/route.ts:266` — `estado: "en_curso"` automático al aprobar pago. |
| 1f. Rate limiting webhook | ✅ | 🟡 PARCIAL | Idempotencia por pago_id+status (line 217) pero NO hay rate limiting HTTP explícito en el webhook. `grep "rate|limit|throttle" webhook/route.ts` → 0 resultados. |
| 1g. Validación pago real prod | ❌ | ❌ AUSENTE | Test operativo, no código. |
| 1h. Reembolsos automáticos | ❌ | 🟡 PARCIAL | `src/lib/cancelaciones.ts` maneja `reintegro_estado: "reembolsado"` para cancelaciones >48h. Webhook detecta `refunded`. PERO no hay API call automática a MP para iniciar el refund — solo marca estado. |
| 1i. Dashboard comisiones | ❌ | 🟡 PARCIAL | `src/app/api/admin/comisiones/route.ts` existe. Admin panel tiene sección. Pero no hay dashboard público para el médico. |

## 2. Facturación y Fiscal

| Item | ROADMAP | Realidad | Evidencia |
|------|---------|----------|-----------|
| 2a. Definición fiscal RI | ✅ | ⚪ NO-TÉCNICO | Confirmación de Diego. |
| 2b. Integración AFIP | ❌ | ❌ AUSENTE | grep "afip" src/ → 0 resultados. |
| 2c. Reportes contables | ❌ | ❌ AUSENTE | No hay generación de reportes contables. |
| 2d. Asesoramiento contable | ❌ | ⚪ NO-TÉCNICO | Externo a Diego. |
| 2e. Retenciones | ❌ | ❌ AUSENTE | No hay lógica de retenciones. |
| 2f. Pago impuestos | ❌ | ❌ AUSENTE | No hay automatización fiscal. |

## 3. Compliance Regulatorio

| Item | ROADMAP | Realidad | Evidencia |
|------|---------|----------|-----------|
| 3a. AAIP Responsable | ✅ | ⚪ NO-TÉCNICO | Trámite administrativo RL-2026-36086505. |
| 3b. AAIP Base Datos | ✅ | ⚪ NO-TÉCNICO | Trámite administrativo RL-2026-41929595. |
| 3c. ReNaPDiS 0270 | ✅ | ⚪ NO-TÉCNICO | Trámite administrativo RL-2026-48984072. |
| 3d. DPO designado | ✅ | ⚪ NO-TÉCNICO | Resolución 001/2026. |
| 3e. ABM Dominios | ⏳ | ⚪ NO-TÉCNICO | Trámite con Ministerio. |
| 3f. Credenciales REFEPS+RENAPER+PUCO | ⏳ | 🟡 PARCIAL | Credenciales REFEPS en `.env.local` (SYSTEM_ID, CREDENTIAL_ID, TOKEN_SECRET). PERO: RENAPER → 0 integración (`grep "renaper" src/` → solo `validar.ts` parseando respuesta FHIR). PUCO → 0 código (`grep "puco|PUCO" src/` → 0 resultados). |
| 3g. Cliente Bus FHIR | ❌ | ✅ HECHO — **DISCREPANCIA** | `src/lib/refeps/client.ts` — cliente FHIR completo con JWT HS256, token exchange, búsqueda por DNI. Commit `5271a63` (PR #84) mergeado en main. Credenciales productivas en Vercel. Validación real exitosa el 23/05/2026 (Sofía Fasce, 2 matrículas del Ministerio). |
| 3h. Validación RENAPER | ❌ | ❌ AUSENTE | No hay endpoint ni cliente RENAPER. Solo parseo de DNI en respuesta FHIR de REFEPS. |
| 3i. Validación PUCO | ❌ | ❌ AUSENTE | `grep "puco|PUCO" src/` → 0 resultados. |
| 3j. CUIR real | ⏳ | ❌ AUSENTE | `grep "cuir|CUIR" src/` → 0 resultados. DNSISa no publicó API. |
| 3k. Firma electrónica Ola 1 | ✅ | ✅ HECHO | `src/lib/firma/` — claves.ts, crypto.ts, otp.ts, receta.ts. Tabla `medico_claves`. RSA-SHA256 signing en `receta.ts:141`. |
| 3l. Logs no repudiables 5 años | ❌ | 🟡 PARCIAL | `firma_logs` tabla existe con insert inmutable (`receta.ts:177-178`). `admin_audit_log` para acciones admin. PERO: no hay política de retención 5 años configurada, no hay backup verificado. |
| 3m. Plan continuidad operativa | ❌ | ❌ AUSENTE | No hay documento de continuidad. |
| 3n. Farmalink homologación | ⏳ | ⚪ NO-TÉCNICO | Trámite externo. |
| 3o. Informe periódico DNSISa | ❌ | ❌ AUSENTE | No hay generación de informes para DNSISa. |

## 4. Legal

| Item | ROADMAP | Realidad | Evidencia |
|------|---------|----------|-----------|
| 4a. TyC actualizados | ✅ | ✅ HECHO | `src/app/terminos/TerminosContent.tsx` — contenido completo con identidad RI. Commit `1bed413`. |
| 4b. Política Privacidad | ✅ | ✅ HECHO | `src/app/privacidad/PrivacidadContent.tsx` — página separada. |
| 4c. Consentimiento Informado | ✅ | ✅ HECHO | `src/app/api/consentimiento/route.ts` + `src/app/consulta/[id]/consentimiento/page.tsx` + tabla `consentimientos_informados`. |
| 4d. Bloqueo controlados | ✅ | ✅ HECHO | `src/data/controlados.ts` — ~70 IFA. Detección dual con flag CNPM (`vademecum.json` 835 controlados). |
| 4e. Retención HC 10 años | ✅ | 🟡 PARCIAL | No hay DELETE de consultas en el código (evidencia: grep "DELETE.*consulta" → 0). PERO: no hay política explícita de retención configurada en Supabase ni backup verificado a 10 años. Es retención pasiva (no se borra) pero no activa (no hay garantía documental). |
| 4f. Términos F&F | ❌ | ❌ AUSENTE | No hay página ni documento de términos F&F. |
| 4g. Política reembolsos | ⚠️ | 🟡 PARCIAL | `src/app/terminos/TerminosContent.tsx:64-76` — sección "Pagos, aranceles y política de reembolsos" con reglas 48h. `src/lib/cancelaciones.ts` implementa la lógica. FALTA: documento operativo detallado separado. |
| 4h. Cyber insurance | ❌ | ⚪ NO-TÉCNICO | Trámite de Diego. |
| 4i. Asesoramiento legal | ❌ | ⚪ NO-TÉCNICO | Externo. |

## 5. Onboarding de Médicos

| Item | ROADMAP | Realidad | Evidencia |
|------|---------|----------|-----------|
| 5a. Flujo registro médico | ✅ | ✅ HECHO | `src/app/auth/registro-medico/page.tsx` — formulario con especialidades, matrícula, provincia. |
| 5b. Perfil progresivo | ✅ | ✅ HECHO | `src/app/onboarding/page.tsx` + `src/app/dashboard/PanelProgresoPerfil.tsx`. |
| 5c. Validación matrícula real | ❌ | 🟡 PARCIAL | Cliente REFEPS escrito y mergeado (`5271a63`), pero SISA_MODE=simulacion. Admin puede validar manualmente vía UI. No hay validación automática en registro. |
| 5d. 2FA obligatoria | ⏳ | ✅ HECHO — **DISCREPANCIA** | `src/app/api/2fa/generar/route.ts` + `src/app/api/2fa/validar/route.ts` implementados. `src/app/api/firma/configurar/route.ts` configura 2FA. `BannerFirmaElectronica.tsx` en dashboard guía activación. Ola 3 (commit `de4f8a3`) lo implementó completo. |
| 5e. Claves RSA automática | ✅ | ✅ HECHO | `src/lib/firma/claves.ts` — generación RSA. `src/lib/firma/crypto.ts` — encrypt/decrypt. Tabla `medico_claves` con clave_publica + clave_privada_enc. |
| 5f. Conexión MP médico | ✅ | ✅ HECHO | `src/app/api/mp/oauth/start/route.ts` inicia OAuth. `src/app/medico/perfil/TabCobros.tsx` muestra estado. `BannerMercadoPago.tsx` guía conexión. |
| 5g. Onboarding primer médico beta | ❌ | ⚪ NO-TÉCNICO | Tarea operativa de Diego. |
| 5h. Soporte médico | ❌ | 🟡 PARCIAL | No hay canal dedicado. Pero el código referencia `soporte@docto.com.ar` y `hola@docto.com.ar` en UI. |
| 5i. Onboarding psiquiatría/dermatología | ❌ | ❌ AUSENTE | No hay flujo específico por especialidad. |
| 5j. Vía de administración prescrita | ❌ | ❌ AUSENTE | El autocomplete muestra vía del producto, pero no hay selector de vía prescrita por el médico. |
| 5k. Posología por medicamento | ❌ | ❌ AUSENTE | Posología es texto libre global, no vinculada por medicamento. |

## 6. Experiencia de Paciente

| Item | ROADMAP | Realidad | Evidencia |
|------|---------|----------|-----------|
| 6a. Consulta Inmediata | ✅ | ✅ HECHO | `src/app/triage/page.tsx` (602 líneas). `src/app/api/consultas-pendientes/route.ts`. Flujo completo triage→pago→sala→video. |
| 6b. Turnos programados | ✅ | ✅ HECHO | `src/app/turno/[turnoId]/` — pago, consentimiento, espera, video, info-medica. `src/app/medico/agenda/` con modelos y franjas. `src/app/api/cron/generar-slots/route.ts`. |
| 6c. Pago con MP | ✅ | ✅ HECHO | `src/app/api/pago/crear-v2/route.ts` — genera preferencia MP con marketplace_fee. |
| 6d. Sala de espera polling | ✅ | ✅ HECHO | `src/app/sala-espera/[consultaId]/page.tsx`. `src/app/api/consulta-estado/route.ts` para polling. |
| 6e. Video con LiveKit | ✅ | ✅ HECHO | **NOTA: ROADMAP dice "LiveKit" pero CLAUDE.md dice "Daily.co"**. Realidad actual: código usa **LiveKit** (`@livekit/components-react`, `livekit-client`, `livekit-server-sdk`). `src/app/api/livekit/` con token, crear-sala, webhook. `.env.local` tiene DAILY_API_KEY como legacy pero el código activo es LiveKit. `grep "daily-co\|DailyIframe" src/ → 0 resultados`. |
| 6f. Recepción receta PDF | ✅ | ✅ HECHO | `src/app/api/documentos/[id]/pdf/route.ts` genera PDF. `src/app/documentos/DescargarPDF.tsx` para descarga. `src/lib/pdf/receta.ts` motor de rendering. |
| 6g. Historial consultas | ✅ | ✅ HECHO | `src/app/mis-consultas/page.tsx` + `MisConsultasList.tsx`. `src/app/api/historial-inline/route.ts`. |
| 6h. Landing /pacientes | ⚠️ | 🟡 PARCIAL | `src/app/pacientes/page.tsx` existe (7 líneas — redirect). Landing real es la raíz `src/app/page.tsx` (614 líneas) desde commit `4de10c7`. Mobile issues no verificados desde código. |
| 6i. Notificaciones push | ❌ | ✅ HECHO — **DISCREPANCIA** | `src/app/api/push/suscribir/route.ts`, `enviar/route.ts`, `desuscribir/route.ts`, `notificar-documentos/route.ts`. `public/sw.js` service worker existe. `push_subscriptions` tabla en DB. Sprint B commit `4d8341f`. |
| 6j. Email transaccional | ✅ | ✅ HECHO | `src/lib/email.ts` (390 líneas) — turno confirmado, cancelación, documentos enviados, recordatorio mañana. `src/app/api/cron/recordatorios/route.ts` + `recordatorios-10min/route.ts`. **PERO** RESEND_API_KEY es placeholder en `.env.local` — puede que Vercel env vars tengan la real. |
| 6k. Soporte paciente | ❌ | ❌ AUSENTE | No hay canal de soporte dedicado para pacientes. |

## 7. Landings y Marketing

| Item | ROADMAP | Realidad | Evidencia |
|------|---------|----------|-----------|
| 7a. Landing principal | ⚠️ | ✅ HECHO — **DISCREPANCIA** | `src/app/page.tsx` — 614 líneas, landing completa con hero, features, CTAs. Commit `4de10c7` + `b60439d`. |
| 7b. Landing /pacientes | ⚠️ | ✅ HECHO — **DISCREPANCIA** | Landing pacientes unificada como raíz (commit `4de10c7`). `src/app/pacientes/page.tsx` redirige. |
| 7c. SEO básico | ❌ | ❌ AUSENTE | No hay `sitemap.ts`, `robots.ts`, ni meta tags SEO avanzados. |
| 7d. Google Analytics | ❌ | ❌ AUSENTE | `grep "gtag\|GoogleAnalytics\|GA_MEASUREMENT" src/` → 0 resultados. |
| 7e. Pixel Facebook/TikTok | ❌ | ❌ AUSENTE | `grep "fbq\|pixel\|tiktok" src/` → 0 resultados. |
| 7f. Blog/Content | ❌ | ❌ AUSENTE | No hay sección blog. |
| 7g. Email marketing | ❌ | ❌ AUSENTE | No hay sistema de email marketing (solo transaccional). |
| 7h. Brand book | ❌ | ⚪ NO-TÉCNICO | Documento externo. |
| 7i. Go-to-Market | ⚠️ | ⚪ NO-TÉCNICO | Estrategia documentada, ejecución de Diego. |

## 8. Seguridad e Infraestructura

| Item | ROADMAP | Realidad | Evidencia |
|------|---------|----------|-----------|
| 8a. RLS todas tablas | ✅ | ✅ HECHO | 108 CREATE POLICY en migraciones. Tablas con RLS: eventos_funnel, medicos_mp_accounts, mp_oauth_state, obras_sociales, sereno_runs, webhook_failed_attempts, + todas las core. |
| 8b. HTTPS/TLS 1.2+ | ✅ | ✅ HECHO | Vercel default — HTTPS obligatorio. |
| 8c. AES-256 en reposo | ⚠️ | ⚪ NO-TÉCNICO | Supabase Pro plan feature. Verificación de Diego en panel Supabase. |
| 8d. Logs centralizados | ⚠️ | 🟡 PARCIAL | Vercel logs existen por default. `admin_audit_log` tabla para acciones admin. `firma_logs` para firma. No hay agregación tipo Datadog/Sentry. |
| 8e. Backup automático DB | ⚠️ | ⚪ NO-TÉCNICO | Supabase Pro feature. Verificación en panel. |
| 8f. Plan recuperación desastres | ❌ | ❌ AUSENTE | No hay documento. |
| 8g. Pruebas penetración | ❌ | ❌ AUSENTE | No se ejecutaron. Auditorías parciales de Roberto (firma) solamente. |
| 8h. Monitoreo uptime | ❌ | 🟡 PARCIAL | `src/app/api/health/route.ts` existe (endpoint health check). Pero no hay servicio de monitoreo externo (UptimeRobot, etc). |
| 8i. Alertas Sentry | ❌ | ❌ AUSENTE | `grep "sentry\|Sentry" src/ package.json` → 0 resultados. |
| 8j. Separación dev/staging/prod | ⚠️ | 🟡 PARCIAL | Vercel preview deploys para PRs. `.env.local` y `.env.vercel` separados. Pero no hay rama staging ni ambiente staging dedicado. |
| 8k. Ambiente fiscalización | ❌ | ❌ AUSENTE | No hay ambiente para inspección regulatoria. |
| 8l. Rotación secrets/keys | ❌ | ❌ AUSENTE | No hay automatización de rotación. |

## 9. Operaciones y Soporte

| Item | ROADMAP | Realidad | Evidencia |
|------|---------|----------|-----------|
| 9a. Email soporte institucional | ⚠️ | 🟡 PARCIAL | UI referencia `soporte@docto.com.ar` y `hola@docto.com.ar`. RESEND_API_KEY es placeholder local. No verificado si funcionan. |
| 9b. Sistema tickets | ❌ | ❌ AUSENTE | No hay ticketing. |
| 9c. FAQ pública | ❌ | ❌ AUSENTE | `find src/app -path "*faq*"` → 0 resultados. |
| 9d. Documentación interna | ⚠️ | 🟡 PARCIAL | 15+ docs en `docs/` (security, ux, qa, renapdis). CLAUDE.md extenso. Pero no hay wiki/runbook operativo. |
| 9e. Panel admin incidentes | ⚠️ | ✅ HECHO — **DISCREPANCIA** | Panel admin robusto: `src/app/admin/` con dashboard, médicos, pacientes, consultas, alertas, sereno, configuración. Admin sidebar + mobile control center. Admin audit log. Feature flags. Esto es mucho más que "parcial". |
| 9f. Métricas KPIs | ⚠️ | 🟡 PARCIAL | `eventos_funnel` tabla + `src/app/api/funnel/track/route.ts`. `src/app/insights/` con InsightsHoy, funnel, médicos, especialidades. Sereno: `src/app/admin/sereno/SerenoClient.tsx` (248 líneas). PERO: no hay dashboard público/externo, es solo admin. |
| 9g. Reporting stakeholders | ❌ | ❌ AUSENTE | No hay generación de reportes exportables. |

## 10. Estructura Empresarial

| Item | ROADMAP | Realidad | Evidencia |
|------|---------|----------|-----------|
| 10a. Definición fiscal RI | ✅ | ⚪ NO-TÉCNICO | Confirmación Diego. |
| 10b. Evaluar SRL/SAS | ❌ | ⚪ NO-TÉCNICO | Decisión futura Diego. |
| 10c. Contrato team | ❌ | ⚪ NO-TÉCNICO | Legal Diego. |
| 10d. Plan equity | ❌ | ⚪ NO-TÉCNICO | Decisión Diego. |
| 10e. Inversores | ❌ | ⚪ NO-TÉCNICO | Estrategia Diego. |
| 10f. Plan financiero | ❌ | ⚪ NO-TÉCNICO | Estrategia Diego. |
| 10g. Asesor negocio | ❌ | ⚪ NO-TÉCNICO | Externo. |

## 11. Proyectos Estratégicos Post-Launch

| Item | ROADMAP | Realidad | Evidencia |
|------|---------|----------|-----------|
| 11a. Módulo B2B | ❌ | ❌ AUSENTE | No hay código B2B. |
| 11b. Expansión LATAM | ❌ | ❌ AUSENTE | No hay multi-country. |
| 11c. API pública | ❌ | ❌ AUSENTE | No hay API docs ni endpoints públicos (salvo /verificar). |
| 11d. Modo offline/PWA | ❌ | 🟡 PARCIAL | `public/manifest.json` existe. `public/sw.js` existe (para push). Pero no es PWA offline completa. |
| 11e. Integración HCE | ❌ | ❌ AUSENTE | No hay integración con sistemas hospitalarios. |
| 11f. Recetas controlados | ❌ | ❌ AUSENTE | 835 medicamentos bloqueados. Decisión conservadora documentada en ROADMAP y controlados.ts. |

---

# DISCREPANCIAS ENCONTRADAS

Items donde el ROADMAP dice una cosa pero la realidad es otra:

| Item | ROADMAP dice | Realidad | Impacto |
|------|-------------|----------|---------|
| **T1-1** Firma UI Olas 2-5 | ⏳ En curso | ✅ HECHO | Tier 1 completado sin registrar |
| **T1-3** /verificar/{id} | ⏳ En curso | ✅ HECHO | Tier 1 completado sin registrar |
| **T1-2** REFEPS real | ⏳ Esperando | 🟢 CASI HECHO (cliente en prod, validación real ejecutada, manual durante F&F) | Mucho más avanzado de lo registrado |
| **T1-8** Landing /medicos | ❌ Pausada | 🟡 PARCIAL (448 líneas, landing existe) | Trabajo hecho sin registrar |
| **T2-3g** Cliente Bus FHIR | ❌ Pendiente | ✅ HECHO (PR #84 mergeado) | Completado sin registrar |
| **T2-5d** 2FA obligatoria | ⏳ Sofía diseñando | ✅ HECHO (Ola 3, commit de4f8a3) | Completado sin registrar |
| **T2-6i** Push notifications | ❌ Pendiente | ✅ HECHO (SW + endpoints + Sprint B) | Completado sin registrar |
| **T2-7a** Landing principal | ⚠️ Sin work focalizado | ✅ HECHO (614 líneas) | Completado sin registrar |
| **T2-7b** Landing /pacientes | ⚠️ Parcial | ✅ HECHO (unificada como raíz) | Completado sin registrar |
| **T2-9e** Panel admin | ⚠️ Existe parcial | ✅ HECHO (robusto, 7+ secciones) | Subestimado |
| **T2-6e** Video | "LiveKit" en ROADMAP | LiveKit en código, Daily.co en CLAUDE.md | CLAUDE.md desactualizado (dice Daily.co, es LiveKit) |

---

# TRABAJO NO REGISTRADO EN ROADMAP

Features que EXISTEN en producción pero NO aparecen en ningún item del ROADMAP:

| Feature | Evidencia | Líneas aprox |
|---------|-----------|-------------|
| **Nova AI** — asistente médico con chat, confirmación, TTS | `src/app/api/nova/` (3 endpoints, 997 líneas). `src/app/medico/nova/`. Toggle en perfil. | ~1200 |
| **Triage inteligente** | `src/app/triage/page.tsx` — 602 líneas, selección de especialidad para CI | ~600 |
| **Consultorio virtual público** (dr/[slug]) | `src/app/dr/[slug]/` — página pública del médico + consultorio privado | ~400 |
| **Clínica / grilla especialidades** | `src/app/clinica/` — selección de especialidad + turnos | ~300 |
| **Sistema de alertas admin** | `src/app/admin/alertas/` + `src/app/api/admin/alertas/` | ~200 |
| **Sereno (monitoreo nocturno)** | `src/app/admin/sereno/SerenoClient.tsx` — 248 líneas + API | ~350 |
| **Feature flags** | `src/app/api/admin/feature-flags/route.ts` + tabla `feature_flags` | ~100 |
| **Beta access + registro cerrado** | `src/app/beta-access/` + `src/app/api/beta-login/` + whitelist email (PR #87) | ~200 |
| **Insights dashboard** | `src/app/insights/` — hoy, funnel, médicos, especialidades | ~500 |
| **Lista de espera pre-launch** | `src/app/api/lista-espera/route.ts` — captura emails médicos/pacientes | ~50 |
| **Canal de documentación** (estudios, envío docs) | `src/app/api/consulta/subir-estudio/`, `enviar-documento-medico/`, `estudios/` | ~400 |
| **Info médica paciente** | `src/app/consulta/[id]/info-medica/` + `src/app/turno/[turnoId]/info-medica/` | ~300 |
| **Perfil médico completo** | `src/app/medico/perfil/` — 6 archivos incl. firma manuscrita, cobros, baja, nova toggle | ~600 |
| **Vademécum CNPM** (16,878 meds) | `src/data/vademecum.json` — 2.8MB, migrado de estático a CNPM con lazy-load | ~17000 entradas |
| **Receta estructurada Rp/IFA** | `src/lib/pdf/receta.ts` — rendering AAIP/ReNaPDiS compliant | ~300 |
| **6 cron jobs Vercel** | `vercel.json` — generar-slots, cerrar-huérfanas, recordatorios, limpieza-estudios, sala-espera-diaria | 6 jobs |
| **Historial paciente por médico** | `src/app/medico/paciente/[pacienteId]/page.tsx` + `src/app/medico/historial/` | ~300 |
| **Obras sociales** | `src/app/api/obras-sociales/route.ts` + tabla obras_sociales | ~100 |

---

# PRs ABIERTOS

### PR #56 — fix: 4 ajustes post-producción canal de documentación + dictado
- **Estado:** OPEN desde 7 mayo 2026 (3 semanas)
- **Rama:** `claude/fixes-canal-doc-post`
- **Tamaño:** +198 / -40
- **Contenido:** 4 fixes post-deploy del canal de documentación
- **Diagnóstico:** Probablemente vivo pero sin review. Los fixes pueden haber sido superados por merges posteriores. Requiere verificación de Diego si sigue siendo relevante.

### PR #57 — feat: historia clínica + nova evolución
- **Estado:** OPEN desde 7 mayo 2026 (3 semanas)
- **Rama:** `claude/festive-lamport-421dac`
- **Tamaño:** +824 / -35
- **Contenido:** Campo evolución obligatorio, Nova Evolución (Groq Whisper + Claude Sonnet), historia clínica unificada, patología crónica, toggle Nova en perfil
- **Diagnóstico:** Feature significativo sin mergear. Parte del contenido (toggle Nova en perfil) ya existe en main por otro merge. Requiere decisión de Diego: mergear, rebaser, o descartar.

---

# RESUMEN CUANTITATIVO

## TIER 1 (16 items)

| Estado real | Cantidad | Items |
|-------------|----------|-------|
| ✅ HECHO | 2 | #1 Firma UI, #3 /verificar |
| 🟡 PARCIAL | 4 | #2 REFEPS, #5 Comisiones, #7 @docto.com.ar, #8 Landing médicos, #16 Auditoría |
| ❌ AUSENTE | 1 | #11 Facturación |
| ⚪ NO-TÉCNICO | 9 | #4, #6, #9, #10, #12, #13, #14, #15 |

Corrección: 5 parciales, contando #16.

**Score real Tier 1: 2/16 completados = 12.5%**
(pero 5 parciales y 9 dependen de Diego, no de código)

## TIER 2 (94 items declarados)

| Estado real | Cantidad |
|-------------|----------|
| ✅ HECHO | ~30 |
| 🟡 PARCIAL | ~15 |
| ❌ AUSENTE | ~28 |
| ⚪ NO-TÉCNICO | ~21 |

## Discrepancias detectadas: 11
## Features no registradas: 17+

---

*Generado por auditoría de código real, 28 mayo 2026.*
*Corregido el mismo día: REFEPS estaba reportado como simulación pero producción usa Bus real.*
*No se modificó el ROADMAP_OPERATIVO.md — este documento es la foto honesta para que Diego decida.*
