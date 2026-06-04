# ROADMAP OPERATIVO — Docto al 100% al Mundo

**Ultima actualizacion:** 28 de mayo de 2026
**Cruzado contra:** docs/STATUS_REAL_2026-05-28.md (auditoría con evidencia empírica)

**Progreso operativo: 27% (Tier 1)**
**Tier 1 — Items completados:** 4 de 15
**Tier 1 — Items en curso / casi hechos:** 2
**Tier 1 — Items pendientes:** 9

Tier 2 — Inventario de crecimiento futuro: 111 items (94 originales + 17 features no registradas)

Documento vivo. Se actualiza con cada PR que cierre un item.

---

# TIER 1 — MINIMO VIABLE PARA OPERAR AL MUNDO

Los 15 bloqueantes reales. La metrica de progreso del proyecto se calcula sobre esto.
No se agregan ni quitan items sin aprobacion de Diego.

> **Nota (28/05/2026):** Item 6 (Seguro RC) movido a Tier 2 por decision de Diego —
> no bloqueante para F&F. Se retoma antes de pacientes reales. Tier 1 pasa de 16 a 15 items.

## Bloqueantes regulatorios

| # | Item | Estado | Dependencia |
|---|------|--------|-------------|
| 1 | Firma electronica UI completa (Olas 2-5) | ✅ Completado | Olas 2-5 mergeadas, auditoria Roberto OK, firma manuscrita OK |
| 2 | Validacion REFEPS real | ⏳ Casi hecho | Bus real en prod, validacion manual Diego durante F&F. Sprint automatico: pre-produccion |
| 3 | Endpoint publico /verificar/{id} | ✅ Completado | Ola 5 mergeada (PR #79) |

> **Item 1 — Evidencia (28/05/2026):** Ola 2 (PR #76), Ola 3 (PR #77), Ola 4 (PR #78),
> Ola 5 (PR #79). Auditoria Roberto 6 hallazgos corregidos (c8ea2e2). Firma manuscrita
> (PR #85). Doc tecnico definitivo (64792d0).
>
> **Item 2 — Decision Diego (28/05/2026):** SISA_MODE=produccion en Vercel Production.
> Credenciales productivas del Bus FHIR cargadas. Validacion real ejecutada con exito:
> Sofia Fasce (DNI 31852639, 23/05/2026), 2 matriculas del Ministerio (MP 232966 Buenos
> Aires + MN 177699 CABA). Durante F&F y Beta, Diego valida manualmente cada medico
> desde panel admin. Sprint para REFEPS automatico en onboarding: PRE-PRODUCCION.
>
> **Item 3 — Evidencia (28/05/2026):** src/app/verificar/[id]/page.tsx +
> VerificarRecetaClient.tsx + API route. Rate limiting + timing constante.

## Bloqueantes para captar medicos

| # | Item | Estado | Dependencia |
|---|------|--------|-------------|
| 4 | Contrato Docto-Medico formal | ❌ Pendiente | Carolina |
| 5 | Politica de comisiones formalizada | ⚠️ Parcial | Codigo OK (src/lib/comisiones.ts), falta documento legal |
| 7 | Cuenta institucional @docto.com.ar | ✅ Completado | Diego confirmo 28/05/2026 |
| 8 | Landing /medicos funcional | ⚠️ Parcial | src/app/medicos/page.tsx existe (448 lineas), revisar contenido |
| 9 | Plan captacion 30 medicos seed | ❌ Pendiente | — |

> **Item 5 — Evidencia:** src/lib/comisiones.ts con RPC get_comision_medico. Tabla
> comisiones_config. API admin en /api/admin/comisiones. Falta documento contractual.
>
> **Item 8 — Evidencia:** Landing construida con secciones, iconos, CTAs. Estaba
> marcada "pausada" pero el codigo existe. Requiere revision de contenido final.

## Bloqueantes para emitir pagos

| # | Item | Estado | Dependencia |
|---|------|--------|-------------|
| 10 | Friends & Family test MP real | ❌ Pendiente | Infraestructura tecnica lista (OAuth, webhook, split) |
| 11 | Facturacion automatizada a medicos | ❌ Pendiente | — |
| 12 | Cancelar app vieja "UberDoc" en MP | ❌ Pendiente | Accion manual Diego en panel MP |

## Verificaciones administrativas

| # | Item | Estado | Dependencia |
|---|------|--------|-------------|
| 13 | Verificar AFIP RI vigente | ❌ Pendiente | — |
| 14 | Verificar IIBB CABA + Convenio Multilateral | ❌ Pendiente | — |
| 15 | Verificar CLAE para telemedicina | ❌ Pendiente | — |
| 16 | Auditoria de seguridad integral pre-produccion | ⚠️ Parcial | Auditorias parciales hechas (Roberto firma, RLS), falta integral |

> **Item 16 — Evidencia:** Auditoria Roberto firma electronica (c8ea2e2, 6 hallazgos).
> Rate limiting OTP (5c9b21b). 108 RLS policies. Falta auditoria integral de toda
> la plataforma + pruebas de penetracion.

---

# TIER 2 — ROADMAP DE CRECIMIENTO

Inventario de items para empresa madura. No afectan la metrica principal de progreso.
Se actualizan cuando se cierran, pero no bloquean la operacion.

## 1. Mercado Pago

| Subtarea | Estado |
|---|---|
| 1a. OAuth flow conexion medico-MP | ✅ Implementado |
| 1b. Split de comisiones automatico (application_fee) | ✅ Implementado |
| 1c. Webhook prod + test con 4 eventos | ✅ Implementado |
| 1d. Whitelist live_mode OAuth | ✅ Sprint A MP cerrado |
| 1e. Auto-transicion pagada→en_curso | ✅ Sprint A MP cerrado |
| 1f. Rate limiting webhook | ⚠️ Idempotencia por pago_id+status, sin rate limit HTTP |
| 1g. Validacion pago real aprobado en prod | ❌ Pendiente |
| 1h. Reembolsos automaticos por consulta no realizada | ⚠️ Logica de reintegro en cancelaciones.ts, sin API call automatica a MP |
| 1i. Dashboard de comisiones para Docto | ⚠️ Admin endpoint existe (/api/admin/comisiones), sin dashboard medico |

## 2. Facturacion y Fiscal

| Subtarea | Estado |
|---|---|
| 2a. Definicion fiscal (RI persona fisica) | ✅ Confirmado |
| 2b. Integracion AFIP (factura electronica via API) | ❌ Pendiente |
| 2c. Reportes contables mensuales | ❌ Pendiente |
| 2d. Asesoramiento contable mensual (contador) | ❌ Pendiente |
| 2e. Manejo de retenciones (Ganancias, IVA, IIBB) | ❌ Pendiente |
| 2f. Pago de impuestos automatizado | ❌ Pendiente |

## 3. Compliance Regulatorio

| Subtarea | Estado |
|---|---|
| 3a. AAIP Responsable inscripto | ✅ RL-2026-36086505 |
| 3b. AAIP Base de Datos inscripta | ✅ RL-2026-41929595 |
| 3c. ReNaPDiS Plataforma 0270 | ✅ RL-2026-48984072 |
| 3d. DPO designado | ✅ Resolucion 001/2026 |
| 3e. ABM Dominios (acceso Bus) | ⏳ En evaluacion |
| 3f. Credenciales REFEPS + RENAPER + PUCO | ⚠️ REFEPS productivas y funcionando; RENAPER y PUCO sin implementar |
| 3g. Integracion cliente Bus FHIR | ✅ En prod (PR #84, validacion real 23/05/2026) |
| 3h. Validacion identidad RENAPER | ❌ Pendiente |
| 3i. Validacion cobertura PUCO | ❌ Pendiente |
| 3j. CUIR real (API Repositorio DNSISa) | ⏳ DNSISa no publico |
| 3k. Firma electronica interna Ola 1 (backend) | ✅ En prod |
| 3l. Logs no repudiables 5 anios | ⚠️ firma_logs + admin_audit_log existen, sin politica de retencion 5 anios |
| 3m. Plan continuidad operativa documentado | ❌ Pendiente |
| 3n. Farmalink homologacion | ⏳ Catálogo de APIs recibido — esperando accesos a TEST (ver docs/farmalink-integracion.md) |
| 3o. Informe periodico de profesionales a DNSISa | ❌ Pendiente |

> **3g — Evidencia (28/05/2026):** src/lib/refeps/client.ts apunta a bus.msal.gob.ar/fhir.
> JWT HS256, token exchange, busqueda por DNI. Credenciales productivas en Vercel Production.
> Validacion real exitosa de Sofia Fasce (2 matriculas del Ministerio). Commit 5271a63.

## 4. Legal

| Subtarea | Estado |
|---|---|
| 4a. TyC actualizados con identidad Diego RI | ✅ Sprint Legal |
| 4b. Politica de Privacidad separada | ✅ Sprint Legal |
| 4c. Consentimiento Informado por consulta | ✅ Sprint Legal |
| 4d. Bloqueo recetas controladas (~835 medicamentos CNPM + ~70 IFA fallback) | ✅ Sprint Legal + Sprint Vademecum CNPM |
| 4e. Retencion HC 10 anios | ⚠️ Retencion pasiva (no se borra), sin politica activa documental |
| 4f. Terminos para Friends & Family | ❌ Pendiente |
| 4g. Politica de reembolsos detallada operativa | ⚠️ Parcial — TyC seccion 5 + cancelaciones.ts, falta doc operativo separado |
| 4h. Cyber insurance | ❌ Pendiente |
| 4i. Asesoramiento legal continuo | ❌ Pendiente |
| 4j. Seguro responsabilidad civil plataforma | ❌ Pendiente (movido de Tier 1, decision Diego 28/05) |

> **4d — Actualizado (28/05/2026):** Sprint Vademecum CNPM agrego deteccion dual:
> flag controlado en vademecum.json (835 PSICOTROPICO/ESTUPEFACIENTE/SUCCINILCOLINA)
> + fallback esControlado() con ~70 IFA manuales. Tramadol y pregabalina cubiertos
> por fallback (CNPM los clasifica como VENTA VIGILADA, no PSICOTROPICO).
>
> **4j — Nota:** Movido de Tier 1 #6 a Tier 2 por decision de Diego (28/05/2026).
> No bloqueante para F&F. Se retoma antes de abrir a pacientes reales.

## 5. Onboarding de Medicos

| Subtarea | Estado |
|---|---|
| 5a. Flujo de registro medico | ✅ Implementado |
| 5b. Perfil progresivo con onboarding panel | ✅ Implementado |
| 5c. Validacion matricula real | ⚠️ Manual por Diego via admin (Bus real), sprint automatico pre-produccion |
| 5d. Activacion 2FA obligatoria | ✅ Implementado (Ola 3, commit de4f8a3) |
| 5e. Generacion claves RSA automatica | ✅ Backend listo |
| 5f. Conexion MP del medico | ✅ Implementado |
| 5g. Onboarding personalizado primer medico beta | ❌ Pendiente |
| 5h. Soporte medico (canal de comunicacion) | ⚠️ UI referencia soporte@docto.com.ar, sin canal dedicado |
| 5i. Onboarding de psiquiatria y dermatologia | ❌ Pendiente |
| 5j. Via de administracion prescrita por medicamento | ❌ Pendiente |
| 5k. Posologia vinculada a cada medicamento (no texto libre global) | ❌ Pendiente |

> **5c — Decision Diego (28/05/2026):** Validacion REFEPS manual desde panel admin
> durante F&F y Beta. Sprint automatico para onboarding: PRE-PRODUCCION.
>
> **5d — Evidencia:** src/app/api/2fa/generar + validar. src/app/api/firma/configurar.
> BannerFirmaElectronica.tsx en dashboard. Completado en Ola 3 (PR #77).
>
> **5j — Contexto (observacion #2 Martin, 28/05/2026):** La receta muestra la via que admite el producto
> (ej: "inyectable IM/IV") en vez de la via que el medico prescribio (ej: solo "IM"). Requiere que el
> medico elija via al prescribir cada medicamento.
>
> **5k — Contexto (observacion #4 Martin, 28/05/2026):** La posologia hoy es texto libre global al final
> de la receta. Con muchos medicamentos puede confundir al paciente. Migrar a un campo de indicacion
> por medicamento vinculado a cada item Rp/.

## 6. Experiencia de Paciente

| Subtarea | Estado |
|---|---|
| 6a. Consulta Inmediata (on-demand) | ✅ Implementado |
| 6b. Turnos programados | ✅ Implementado |
| 6c. Pago con MP | ✅ Implementado |
| 6d. Sala de espera con polling | ✅ Implementado |
| 6e. Video con LiveKit | ✅ En produccion |
| 6f. Recepcion de receta PDF | ✅ Implementado |
| 6g. Historial de consultas | ✅ Implementado |
| 6h. Landing /pacientes | ✅ Unificada como landing raiz (commit 4de10c7) |
| 6i. Notificaciones push (Web Push) | ✅ Implementado (Sprint B, commit 4d8341f) |
| 6j. Email transaccional pre/post consulta | ✅ Implementado |
| 6k. Soporte paciente (canal) | ❌ Pendiente |
| 6l. Grilla Clínica Virtual — cards honestas + orden de médicos (CI/turnos) + dato de espera | ⏳ En curso (sprint 03/06, ver DECISIONES_PRODUCTO §11) |

> **6h — Evidencia:** src/app/page.tsx (614 lineas). Landing pacientes unificada como
> pagina raiz. src/app/pacientes/page.tsx redirige. Commit 4de10c7 + b60439d.
>
> **6i — Evidencia:** src/app/api/push/ (suscribir, enviar, desuscribir, notificar-documentos).
> public/sw.js service worker. Tabla push_subscriptions. Sprint B commit 4d8341f.

## 7. Landings y Marketing

| Subtarea | Estado |
|---|---|
| 7a. Landing principal docto.com.ar | ✅ Implementada (614 lineas, hero + features + CTAs) |
| 7b. Landing /pacientes | ✅ Unificada como raiz (commit 4de10c7) |
| 7c. SEO basico | ❌ Pendiente (sin sitemap, robots.txt, meta tags avanzados) |
| 7d. Google Analytics / Tracking | ❌ Pendiente |
| 7e. Pixel de Facebook / TikTok | ❌ Pendiente |
| 7f. Blog / Content marketing | ❌ Pendiente |
| 7g. Email marketing (lista, segmentacion) | ❌ Pendiente |
| 7h. Brand book oficial | ❌ Pendiente |
| 7i. Plan de Go-to-Market 4 fases | ⚠️ Documentado, sin ejecutar |

## 8. Seguridad e Infraestructura

| Subtarea | Estado |
|---|---|
| 8a. RLS en todas las tablas | ✅ Implementado (108 policies) |
| 8b. HTTPS / TLS 1.2+ | ✅ Vercel default |
| 8c. AES-256 en reposo (Supabase) | ⚠️ Verificar en panel Supabase |
| 8d. Logs centralizados | ⚠️ Vercel logs + admin_audit_log + firma_logs, sin agregacion externa |
| 8e. Backup automatico de DB | ⚠️ Supabase default, sin verificar |
| 8f. Plan de recuperacion ante desastres | ❌ Pendiente |
| 8g. Pruebas de penetracion | ❌ Pendiente |
| 8h. Monitoreo de uptime (SLA 99.8%) | ⚠️ /api/health existe, sin servicio de monitoreo externo |
| 8i. Alertas automaticas (Sentry o similar) | ❌ Pendiente |
| 8j. Separacion dev/staging/prod (Anexo I) | ⚠️ Vercel preview deploys, sin staging dedicado |
| 8k. Ambiente de fiscalizacion | ❌ Pendiente |
| 8l. Rotacion de secrets / keys | ❌ Pendiente |

## 9. Operaciones y Soporte

| Subtarea | Estado |
|---|---|
| 9a. Email de soporte institucional | ⚠️ UI referencia @docto.com.ar, RESEND_API_KEY placeholder local |
| 9b. Sistema de tickets / soporte | ❌ Pendiente |
| 9c. FAQ publica | ❌ Pendiente |
| 9h. Ayuda in-app — Nova manual ilustrado | 🔵 Diseño cerrado, en construcción (piloto "Armar un turno") — `docs/nova-manual-ilustrado.md`, DECISIONES §12 |
| 9d. Documentacion interna de procesos | ⚠️ 15+ docs en docs/, CLAUDE.md extenso, sin wiki/runbook |
| 9e. Panel admin para gestionar incidentes | ✅ Implementado (admin con 7+ secciones: dashboard, medicos, pacientes, consultas, alertas, sereno, config) |
| 9f. Metricas de operacion (KPIs) | ⚠️ eventos_funnel + insights dashboard (hoy, funnel, medicos, especialidades), sin dashboard publico |
| 9g. Reporting mensual a stakeholders | ❌ Pendiente |

> **9e — Evidencia:** src/app/admin/ con AdminShell, AdminSidebar, MobileControlCenter.
> Secciones: dashboard, medicos (con REFEPS), pacientes, consultas (cancelaciones, espera),
> alertas, sereno (monitoreo), configuracion (feature flags). admin_audit_log para trazabilidad.

## 10. Estructura Empresarial

| Subtarea | Estado |
|---|---|
| 10a. Definicion fiscal actual (RI persona fisica) | ✅ Confirmado |
| 10b. Evaluar SRL/SAS cuando crezca | ❌ Decision futura |
| 10c. Contrato con team virtual / freelancers | ❌ Pendiente |
| 10d. Plan de Equity / Stock options | ❌ Pendiente |
| 10e. Inversores / Capital | ❌ Pendiente |
| 10f. Plan financiero 12-24 meses | ❌ Pendiente |
| 10g. Asesor de negocio | ❌ Pendiente |

## 11. Proyectos Estrategicos Post-Launch

| Subtarea | Estado |
|---|---|
| 11a. Modulo B2B para municipalidades/obras sociales | ❌ Roadmap |
| 11b. Expansion LATAM | ❌ Roadmap |
| 11c. API publica para terceros | ❌ Roadmap |
| 11d. Modo offline / PWA | ⚠️ manifest.json + sw.js existen (push), no es PWA offline completa |
| 11e. Integracion con HCE de hospitales | ❌ Roadmap |
| 11f. Recetas de controlados (psicotropicos/estupefacientes) | ❌ Roadmap |

> **11f — Contexto (decision Diego, 28/05/2026):** La Res. 2214/2025 + Ley 27.553 SI habilitan
> receta electronica de controlados en plataformas ReNaPDiS (Docto es Plataforma 0270). El bloqueo
> actual (835 medicamentos) es decision conservadora, NO impedimento legal. Habilitar requiere
> implementar circuito de trazabilidad especial: constancia de autorizacion + trazabilidad especial
> segun Res. 2214/2025. Habilita especialidades clave: psiquiatria, neurologia, dolor cronico,
> paliativos. Requiere validacion legal Carolina + circuito constancia de autorizacion. Trigger: post-F&F.

## 12. Features completados no registrados

Features en produccion que no estaban en el ROADMAP original. Detectados en auditoria 28/05/2026.

| Subtarea | Estado | Evidencia |
|---|---|---|
| 12a. Nova AI — asistente medico (chat + confirmacion + TTS) | ✅ En prod | src/app/api/nova/ (3 endpoints, ~1000 lineas), src/app/medico/nova/, toggle en perfil |
| 12b. Triage inteligente (seleccion especialidad CI) | ✅ En prod | src/app/triage/page.tsx (602 lineas) |
| 12c. Consultorio virtual publico (dr/[slug]) | ✅ En prod | src/app/dr/[slug]/ — pagina publica del medico + consultorio privado |
| 12d. Clinica / grilla de especialidades | ✅ En prod | src/app/clinica/ — seleccion de especialidad + turnos |
| 12e. Sistema de alertas admin | ✅ En prod | src/app/admin/alertas/ + src/app/api/admin/alertas/ |
| 12f. Sereno (monitoreo nocturno automatizado) | ✅ En prod | src/app/admin/sereno/SerenoClient.tsx (248 lineas) + API |
| 12g. Feature flags | ✅ En prod | src/app/api/admin/feature-flags/ + tabla feature_flags |
| 12h. Beta access + registro cerrado + whitelist | ✅ En prod | src/app/beta-access/ + api/beta-login/ + whitelist email (PR #87) |
| 12i. Insights dashboard (hoy, funnel, medicos, especialidades) | ✅ En prod | src/app/insights/ — 4 vistas |
| 12j. Lista de espera pre-launch | ✅ En prod | src/app/api/lista-espera/ — captura emails medicos/pacientes |
| 12k. Canal de documentacion (estudios, envio docs medico) | ✅ En prod | api/consulta/subir-estudio, enviar-documento-medico, estudios, eliminar-estudio |
| 12l. Info medica paciente (pre-consulta) | ✅ En prod | src/app/consulta/[id]/info-medica/ + turno/[turnoId]/info-medica/ |
| 12m. Perfil medico completo (firma manuscrita, cobros, baja, nova) | ✅ En prod | src/app/medico/perfil/ — 6 archivos |
| 12n. Vademecum CNPM (16.878 medicamentos oficiales) | ✅ En prod | src/data/vademecum.json (2.8MB), lazy-load, deteccion dual controlados |
| 12o. Receta estructurada Rp/IFA (formato AAIP/ReNaPDiS) | ✅ En prod | src/lib/pdf/receta.ts — renderRecetaEstructurada() |
| 12p. 6 cron jobs Vercel | ✅ En prod | vercel.json: generar-slots, cerrar-huerfanas, recordatorios, recordatorios-10min, limpieza-estudios, sala-espera-diaria |
| 12q. Historial paciente por medico | ✅ En prod | src/app/medico/paciente/[pacienteId]/ + src/app/medico/historial/ |
| 12r. Obras sociales (catalogo + selector) | ✅ En prod | src/app/api/obras-sociales/ + tabla obras_sociales |
| 12s. Consentimiento informado por consulta | ✅ En prod | src/app/consulta/[id]/consentimiento/ + api/consentimiento/ + tabla consentimientos_informados |
| 12t. Landing /medicos | ⚠️ Existe, revisar contenido | src/app/medicos/page.tsx (448 lineas) |

---

## Convenciones

- ✅ Listo: item completamente cerrado y en produccion
- ⏳ En curso / esperando: trabajandose ahora o esperando dependencia externa
- ⚠️ Parcial: implementado pero falta completar o ajustar
- ❌ Pendiente: no se empezo

## Protocolo de actualizacion

- Cualquier PR que cierre un item de **Tier 1** actualiza este documento en el mismo PR
- Items de **Tier 2** tambien se actualizan cuando se cierran, pero NO afectan la metrica principal
- Nuevos bloqueantes para operar se evaluan con Diego antes de moverlos a Tier 1
- Recalcular header (progreso, completados, en curso, pendientes) con cada actualizacion
- **Regla de cierre (28/05/2026):** El ROADMAP debe coincidir con produccion real, verificada
  contra Vercel env vars, DB y endpoints en vivo. No contra .env.local ni de memoria.
