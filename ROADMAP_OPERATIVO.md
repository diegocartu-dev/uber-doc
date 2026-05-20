# ROADMAP OPERATIVO — Docto al 100% al Mundo

**Ultima actualizacion:** 21 de mayo de 2026

**Progreso operativo: 20% (Tier 1)**
**Tier 1 — Items completados:** 0 de 15
**Tier 1 — Items en curso:** 3
**Tier 1 — Items pendientes:** 12

Tier 2 — Inventario de crecimiento futuro: 94 items

Documento vivo. Se actualiza con cada PR que cierre un item.

---

# TIER 1 — MINIMO VIABLE PARA OPERAR AL MUNDO

Los 15 bloqueantes reales. La metrica de progreso del proyecto se calcula sobre esto.
No se agregan ni quitan items sin aprobacion de Diego.

## Bloqueantes regulatorios

| # | Item | Estado | Dependencia |
|---|------|--------|-------------|
| 1 | Firma electronica UI completa (Olas 2-5) | ⏳ En curso | Sofia OK, esperando Carolina + Roberto + implementacion Marcos |
| 2 | Validacion REFEPS real | ⏳ Esperando | ABM Dominios en evaluacion |
| 3 | Endpoint publico /verificar/{id} | ⏳ En curso | Parte de las Olas de firma |

## Bloqueantes para captar medicos

| # | Item | Estado | Dependencia |
|---|------|--------|-------------|
| 4 | Contrato Docto-Medico formal | ❌ Pendiente | Carolina |
| 5 | Politica de comisiones formalizada | ❌ Pendiente | — |
| 6 | Seguro responsabilidad civil plataforma | ❌ Pendiente | — |
| 7 | Cuenta institucional @docto.com.ar | ❌ Pendiente | — |
| 8 | Landing /medicos funcional | ❌ Pausada | — |
| 9 | Plan captacion 30 medicos seed | ❌ Pendiente | — |

## Bloqueantes para emitir pagos

| # | Item | Estado | Dependencia |
|---|------|--------|-------------|
| 10 | Friends & Family test MP real | ❌ Pendiente | — |
| 11 | Facturacion automatizada a medicos | ❌ Pendiente | — |
| 12 | Cancelar app vieja "UberDoc" en MP | ❌ Pendiente | — |

## Verificaciones administrativas

| # | Item | Estado | Dependencia |
|---|------|--------|-------------|
| 13 | Verificar AFIP RI vigente | ❌ Pendiente | — |
| 14 | Verificar IIBB CABA + Convenio Multilateral | ❌ Pendiente | — |
| 15 | Verificar CLAE para telemedicina | ❌ Pendiente | — |

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
| 1f. Rate limiting webhook | ✅ Sprint A MP cerrado |
| 1g. Validacion pago real aprobado en prod | ❌ Pendiente |
| 1h. Reembolsos automaticos por consulta no realizada | ❌ Pendiente |
| 1i. Dashboard de comisiones para Docto | ❌ Pendiente |

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
| 3f. Credenciales REFEPS + RENAPER + PUCO | ⏳ Esperando ABM |
| 3g. Integracion cliente Bus FHIR | ❌ Pendiente |
| 3h. Validacion identidad RENAPER | ❌ Pendiente |
| 3i. Validacion cobertura PUCO | ❌ Pendiente |
| 3j. CUIR real (API Repositorio DNSISa) | ⏳ DNSISa no publico |
| 3k. Firma electronica interna Ola 1 (backend) | ✅ En prod |
| 3l. Logs no repudiables 5 anios | ❌ Pendiente |
| 3m. Plan continuidad operativa documentado | ❌ Pendiente |
| 3n. Farmalink homologacion | ⏳ Esperando respuesta |
| 3o. Informe periodico de profesionales a DNSISa | ❌ Pendiente |

## 4. Legal

| Subtarea | Estado |
|---|---|
| 4a. TyC actualizados con identidad Diego RI | ✅ Sprint Legal |
| 4b. Politica de Privacidad separada | ✅ Sprint Legal |
| 4c. Consentimiento Informado por consulta | ✅ Sprint Legal |
| 4d. Bloqueo recetas controladas (~70 sustancias) | ✅ Sprint Legal |
| 4e. Retencion HC 10 anios | ✅ Sprint Legal |
| 4f. Terminos para Friends & Family | ❌ Pendiente |
| 4g. Politica de reembolsos detallada operativa | ⚠️ Parcial |
| 4h. Cyber insurance | ❌ Pendiente |
| 4i. Asesoramiento legal continuo | ❌ Pendiente |

## 5. Onboarding de Medicos

| Subtarea | Estado |
|---|---|
| 5a. Flujo de registro medico | ✅ Implementado |
| 5b. Perfil progresivo con onboarding panel | ✅ Implementado |
| 5c. Validacion matricula real | ❌ Pendiente (REFEPS) |
| 5d. Activacion 2FA obligatoria | ⏳ Sofia disenando |
| 5e. Generacion claves RSA automatica | ✅ Backend listo |
| 5f. Conexion MP del medico | ✅ Implementado |
| 5g. Onboarding personalizado primer medico beta | ❌ Pendiente |
| 5h. Soporte medico (canal de comunicacion) | ❌ Pendiente |
| 5i. Onboarding de psiquiatria y dermatologia | ❌ Pendiente |

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
| 6h. Landing /pacientes | ⚠️ Parcial, mobile issues |
| 6i. Notificaciones push (Web Push) | ❌ Pendiente |
| 6j. Email transaccional pre/post consulta | ✅ Implementado |
| 6k. Soporte paciente (canal) | ❌ Pendiente |

## 7. Landings y Marketing

| Subtarea | Estado |
|---|---|
| 7a. Landing principal docto.com.ar | ⚠️ Sin work focalizado |
| 7b. Landing /pacientes | ⚠️ Parcial |
| 7c. SEO basico | ❌ Pendiente |
| 7d. Google Analytics / Tracking | ❌ Pendiente |
| 7e. Pixel de Facebook / TikTok | ❌ Pendiente |
| 7f. Blog / Content marketing | ❌ Pendiente |
| 7g. Email marketing (lista, segmentacion) | ❌ Pendiente |
| 7h. Brand book oficial | ❌ Pendiente |
| 7i. Plan de Go-to-Market 4 fases | ⚠️ Documentado, sin ejecutar |

## 8. Seguridad e Infraestructura

| Subtarea | Estado |
|---|---|
| 8a. RLS en todas las tablas | ✅ Implementado |
| 8b. HTTPS / TLS 1.2+ | ✅ Vercel default |
| 8c. AES-256 en reposo (Supabase) | ⚠️ Verificar |
| 8d. Logs centralizados | ⚠️ Vercel logs, sin agregacion |
| 8e. Backup automatico de DB | ⚠️ Supabase default, sin verificar |
| 8f. Plan de recuperacion ante desastres | ❌ Pendiente |
| 8g. Pruebas de penetracion | ❌ Pendiente |
| 8h. Monitoreo de uptime (SLA 99.8%) | ❌ Pendiente |
| 8i. Alertas automaticas (Sentry o similar) | ❌ Pendiente |
| 8j. Separacion dev/staging/prod (Anexo I) | ⚠️ Parcial |
| 8k. Ambiente de fiscalizacion | ❌ Pendiente |
| 8l. Rotacion de secrets / keys | ❌ Pendiente |

## 9. Operaciones y Soporte

| Subtarea | Estado |
|---|---|
| 9a. Email de soporte institucional | ⚠️ diegocartu@me.com, no institucional |
| 9b. Sistema de tickets / soporte | ❌ Pendiente |
| 9c. FAQ publica | ❌ Pendiente |
| 9d. Documentacion interna de procesos | ⚠️ Parcial |
| 9e. Panel admin para gestionar incidentes | ⚠️ Existe parcial |
| 9f. Metricas de operacion (KPIs) | ⚠️ eventos_funnel sin dashboard |
| 9g. Reporting mensual a stakeholders | ❌ Pendiente |

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
| 11d. Modo offline / PWA | ❌ Roadmap |
| 11e. Integracion con HCE de hospitales | ❌ Roadmap |

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
