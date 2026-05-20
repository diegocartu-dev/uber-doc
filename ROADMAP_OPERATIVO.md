# ROADMAP OPERATIVO — Docto al 100% al Mundo

**Última actualización:** 21 de mayo de 2026
**Total de items:** 109
**Items listos:** 35 (32%)
**Items en curso/esperando:** 12 (11%)
**Items parciales:** 13 (12%)
**Items pendientes:** 49 (45%)

Documento vivo. Se actualiza con cada PR que cierre un item.

---

## 1. Mercado Pago

| Subtarea | Estado |
|---|---|
| 1a. OAuth flow conexión médico-MP | ✅ Implementado |
| 1b. Split de comisiones automático (application_fee) | ✅ Implementado |
| 1c. Webhook prod + test con 4 eventos | ✅ Implementado |
| 1d. Whitelist live_mode OAuth | ✅ Sprint A MP cerrado |
| 1e. Auto-transición pagada→en_curso | ✅ Sprint A MP cerrado |
| 1f. Rate limiting webhook | ✅ Sprint A MP cerrado |
| 1g. Friends & Family test (no médicos) | ❌ Pendiente |
| 1h. Validación pago real aprobado en prod | ❌ Pendiente |
| 1i. Cancelación app vieja "UberDoc" | ❌ Pendiente |
| 1j. Reembolsos automáticos por consulta no realizada | ❌ Pendiente |
| 1k. Dashboard de comisiones para Docto | ❌ Pendiente |

## 2. Facturación y Fiscal

| Subtarea | Estado |
|---|---|
| 2a. Definición fiscal (RI persona física) | ✅ Confirmado |
| 2b. Verificar CLAE correcto para telemedicina | ❌ Pendiente |
| 2c. Verificar IIBB CABA + Convenio Multilateral | ❌ Pendiente |
| 2d. Facturación automatizada de comisiones a médicos | ❌ Pendiente |
| 2e. Integración AFIP (factura electrónica via API) | ❌ Pendiente |
| 2f. Reportes contables mensuales | ❌ Pendiente |
| 2g. Asesoramiento contable mensual (contador) | ❌ Pendiente |
| 2h. Manejo de retenciones (Ganancias, IVA, IIBB) | ❌ Pendiente |
| 2i. Pago de impuestos automatizado | ❌ Pendiente |

## 3. Compliance Regulatorio

| Subtarea | Estado |
|---|---|
| 3a. AAIP Responsable inscripto | ✅ RL-2026-36086505 |
| 3b. AAIP Base de Datos inscripta | ✅ RL-2026-41929595 |
| 3c. ReNaPDiS Plataforma 0270 | ✅ RL-2026-48984072 |
| 3d. DPO designado | ✅ Resolución 001/2026 |
| 3e. ABM Dominios (acceso Bus) | ⏳ En evaluación |
| 3f. Credenciales REFEPS + RENAPER + PUCO | ⏳ Esperando ABM |
| 3g. Integración cliente Bus FHIR | ❌ Pendiente |
| 3h. Validación matrícula real REFEPS | ❌ Pendiente (hoy simulado) |
| 3i. Validación identidad RENAPER | ❌ Pendiente |
| 3j. Validación cobertura PUCO | ❌ Pendiente |
| 3k. CUIR real (API Repositorio DNSISa) | ⏳ DNSISa no publicó |
| 3l. Firma electrónica interna Ola 1 (backend) | ✅ En prod |
| 3m. Firma electrónica Olas 2-5 (UI) | ⏳ Sofía diseñando |
| 3n. Endpoint público /verificar/{id} | ❌ Pendiente |
| 3o. Logs no repudiables 5 años | ❌ Pendiente |
| 3p. Plan continuidad operativa documentado | ❌ Pendiente |
| 3q. Farmalink homologación | ⏳ Esperando respuesta |
| 3r. Informe periódico de profesionales a DNSISa | ❌ Pendiente |

## 4. Legal

| Subtarea | Estado |
|---|---|
| 4a. TyC actualizados con identidad Diego RI | ✅ Sprint Legal |
| 4b. Política de Privacidad separada | ✅ Sprint Legal |
| 4c. Consentimiento Informado por consulta | ✅ Sprint Legal |
| 4d. Bloqueo recetas controladas (~70 sustancias) | ✅ Sprint Legal |
| 4e. Retención HC 10 años | ✅ Sprint Legal |
| 4f. Contrato Docto-Médico (relación comercial) | ❌ Pendiente |
| 4g. Política de comisiones formalizada | ❌ Pendiente |
| 4h. Términos para Friends & Family | ❌ Pendiente |
| 4i. Política de reembolsos detallada operativa | ⚠️ Parcial |
| 4j. Seguro responsabilidad civil plataforma | ❌ Pendiente |
| 4k. Cyber insurance | ❌ Pendiente |
| 4l. Asesoramiento legal continuo | ❌ Pendiente |

## 5. Onboarding de Médicos

| Subtarea | Estado |
|---|---|
| 5a. Flujo de registro médico | ✅ Implementado |
| 5b. Perfil progresivo con onboarding panel | ✅ Implementado |
| 5c. Validación matrícula real | ❌ Pendiente (REFEPS) |
| 5d. Activación 2FA obligatoria | ⏳ Sofía diseñando |
| 5e. Generación claves RSA automática | ✅ Backend listo |
| 5f. Conexión MP del médico | ✅ Implementado |
| 5g. Plan de captación 30 médicos seed | ❌ Pendiente |
| 5h. Onboarding personalizado primer médico beta | ❌ Pendiente |
| 5i. Soporte médico (canal de comunicación) | ❌ Pendiente |
| 5j. Onboarding de psiquiatría y dermatología | ❌ Pendiente |

## 6. Experiencia de Paciente

| Subtarea | Estado |
|---|---|
| 6a. Consulta Inmediata (on-demand) | ✅ Implementado |
| 6b. Turnos programados | ✅ Implementado |
| 6c. Pago con MP | ✅ Implementado |
| 6d. Sala de espera con polling | ✅ Implementado |
| 6e. Video con LiveKit | ✅ En producción |
| 6f. Recepción de receta PDF | ✅ Implementado |
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
| 7c. Landing /medicos | ❌ Pausada |
| 7d. SEO básico | ❌ Pendiente |
| 7e. Google Analytics / Tracking | ❌ Pendiente |
| 7f. Pixel de Facebook / TikTok | ❌ Pendiente |
| 7g. Blog / Content marketing | ❌ Pendiente |
| 7h. Email marketing (lista, segmentación) | ❌ Pendiente |
| 7i. Brand book oficial | ❌ Pendiente |
| 7j. Plan de Go-to-Market 4 fases | ⚠️ Documentado, sin ejecutar |

## 8. Seguridad e Infraestructura

| Subtarea | Estado |
|---|---|
| 8a. RLS en todas las tablas | ✅ Implementado |
| 8b. HTTPS / TLS 1.2+ | ✅ Vercel default |
| 8c. AES-256 en reposo (Supabase) | ⚠️ Verificar |
| 8d. Logs centralizados | ⚠️ Vercel logs, sin agregación |
| 8e. Backup automático de DB | ⚠️ Supabase default, sin verificar |
| 8f. Plan de recuperación ante desastres | ❌ Pendiente |
| 8g. Pruebas de penetración | ❌ Pendiente |
| 8h. Monitoreo de uptime (SLA 99.8%) | ❌ Pendiente |
| 8i. Alertas automáticas (Sentry o similar) | ❌ Pendiente |
| 8j. Separación dev/staging/prod (Anexo I) | ⚠️ Parcial |
| 8k. Ambiente de fiscalización | ❌ Pendiente |
| 8l. Rotación de secrets / keys | ❌ Pendiente |

## 9. Operaciones y Soporte

| Subtarea | Estado |
|---|---|
| 9a. Cuenta institucional @docto.com.ar | ❌ Pendiente |
| 9b. Email de soporte institucional | ⚠️ diegocartu@me.com, no institucional |
| 9c. Sistema de tickets / soporte | ❌ Pendiente |
| 9d. FAQ pública | ❌ Pendiente |
| 9e. Documentación interna de procesos | ⚠️ Parcial |
| 9f. Panel admin para gestionar incidentes | ⚠️ Existe parcial |
| 9g. Métricas de operación (KPIs) | ⚠️ eventos_funnel sin dashboard |
| 9h. Reporting mensual a stakeholders | ❌ Pendiente |

## 10. Estructura Empresarial

| Subtarea | Estado |
|---|---|
| 10a. Definición fiscal actual (RI persona física) | ✅ Confirmado |
| 10b. Evaluar SRL/SAS cuando crezca | ❌ Decisión futura |
| 10c. Contrato con team virtual / freelancers | ❌ Pendiente |
| 10d. Plan de Equity / Stock options | ❌ Pendiente |
| 10e. Inversores / Capital | ❌ Pendiente |
| 10f. Plan financiero 12-24 meses | ❌ Pendiente |
| 10g. Asesor de negocio | ❌ Pendiente |

## 11. Proyectos Estratégicos Post-Launch

| Subtarea | Estado |
|---|---|
| 11a. Módulo B2B para municipalidades/obras sociales | ❌ Roadmap |
| 11b. Expansión LATAM | ❌ Roadmap |
| 11c. API pública para terceros | ❌ Roadmap |
| 11d. Modo offline / PWA | ❌ Roadmap |
| 11e. Integración con HCE de hospitales | ❌ Roadmap |

---

## Los 10 bloqueantes prioritarios para "operar al mundo"

En orden de criticidad para activar Docto al 100%:

1. ❌ Friends & Family de MP (sin esto, no se prueba pago real)
2. ❌ Facturación automatizada a médicos (cobrar comisiones legalmente)
3. ❌ Validación REFEPS real (esperando ABM Dominios)
4. ⏳ Firma electrónica completa (Olas 2-5 esperando Sofía)
5. ⏳ CUIR real (esperando DNSISa publique API)
6. ❌ Seguro responsabilidad civil (médicos lo van a pedir)
7. ❌ Landing /medicos funcional (captar médicos)
8. ❌ Plan captación 30 médicos seed
9. ❌ Cuenta institucional @docto.com.ar
10. ❌ Contrato Docto-Médico formal

---

## Convenciones del documento

- ✅ Listo: item completamente cerrado y en producción
- ⏳ En curso / esperando: trabajándose ahora o esperando dependencia externa
- ⚠️ Parcial: implementado pero falta completar o ajustar
- ❌ Pendiente: no se empezó

Cualquier PR que cierre un item debe actualizar este documento
en el mismo PR. Sin excepciones.
