# Gap Analysis: Bus de Interoperabilidad — Docto vs. Resolución 2214/2025

**Fecha**: 20 de mayo de 2026
**Autor**: Claude Code (Tech Lead)
**Para**: Diego González (CEO)
**Estado**: Borrador para revisión conjunta

---

## Resumen ejecutivo

Docto (plataforma 0270) fue aceptada en el Bus de Interoperabilidad (expediente TAD EX-2026-41816871). Este documento mapea cada requisito técnico de los 5 documentos normativos contra el estado actual del repositorio.

| Clasificación | Cantidad | Descripción |
|---------------|----------|-------------|
| **BLOQUEANTE** | 12 | Sin esto no se puede operar legalmente ni conectar al Bus |
| **URGENTE** | 8 | Necesario para cumplimiento pleno, puede ir en sprint inmediato |
| **DESEABLE** | 5 | Mejoras que fortalecen compliance pero no bloquean operación |

**Conclusión**: El repo tiene buena base (RLS, audit log, consentimientos, controlados), pero falta toda la integración real con el Bus, la generación de CUIR, firma digital, y validación real de profesionales.

---

## Área 1: Entorno de Fiscalización (Anexo I)

### 1.1 Identificación de la plataforma

| Requisito | Anexo dice | Repo tiene | Gap | Clasif. | Complejidad |
|-----------|-----------|------------|-----|---------|-------------|
| Código plataforma 4 dígitos | Cada receta debe llevar código de plataforma (0270) | No existe constante ni uso de 0270 en el código | Agregar constante `PLATFORM_CODE = "0270"` y usarla en generación de recetas | BLOQUEANTE | Baja |
| Registro ante DNSISa | Plataforma debe estar empadronada | ABM Dominios enviado 20/05/2026, pendiente respuesta | Esperar credenciales de test del Bus | BLOQUEANTE (externo) | N/A |

### 1.2 Datos mínimos de la receta electrónica

| Requisito | Anexo dice | Repo tiene | Gap | Clasif. | Complejidad |
|-----------|-----------|------------|-----|---------|-------------|
| Datos del profesional (nombre, matrícula, tipo, jurisdicción) | Obligatorio en cada receta | `medicos` tabla tiene `matricula`, `tipo_matricula`, `provincia_matricula` | Incluir estos campos en el PDF de receta. Hoy `receta.ts` solo muestra nombre del médico | URGENTE | Baja |
| Datos del paciente (nombre, DNI, fecha nac, sexo, cobertura) | Obligatorio | Migración 040 agrega `fecha_nacimiento`, `sexo_dni`, `tiene_cobertura`, `obra_social`, `nro_afiliado` a `pacientes` | Sprint Perfil Médico pendiente — los campos existen en DB pero no se usan en el PDF | URGENTE | Media |
| Datos del medicamento (nombre genérico, forma, concentración, cantidad, diagnóstico CIE-10) | Cada ítem con droga, forma farmacéutica, dosis | `medicamentos_structured` tiene `droga`, `nombre`, pero no `forma_farmaceutica`, `concentracion`, `cantidad_envases`, ni código CIE-10 | Ampliar estructura de medicamentos y agregar campo diagnóstico CIE-10 | BLOQUEANTE | Media |
| Fecha de emisión y vencimiento | Receta válida 30 días (común) o según tipo | PDF tiene fecha emisión. No tiene fecha de vencimiento | Agregar cálculo de vencimiento según tipo de receta | URGENTE | Baja |
| Número de receta único | CUIR de 41 caracteres (ver Área 3) | `receta.ts` genera `REC-YYYY-XXXXXXXX` con `Math.random()` | Reemplazar con CUIR real del Repositorio | BLOQUEANTE | Alta |

### 1.3 Tipos de receta y regímenes

| Requisito | Anexo dice | Repo tiene | Gap | Clasif. | Complejidad |
|-----------|-----------|------------|-----|---------|-------------|
| Tipo y subtipo (4 dígitos en CUIR) | Receta simple (0100), archivada (0200), de estupefacientes (0300), etc. | No hay concepto de tipo de receta | Implementar enum de tipos y subtipo, usar en flujo de prescripción | BLOQUEANTE | Media |
| Receta de controlados requiere firma digital | Controlados = firma digital obligatoria | `esControlado()` bloquea en borrador (422) pero no hay flujo de firma digital | Implementar firma digital para controlados o mantener bloqueo total | BLOQUEANTE | Alta |

### 1.4 Fiscalización activa (Fase 4)

| Requisito | Anexo dice | Repo tiene | Gap | Clasif. | Complejidad |
|-----------|-----------|------------|-----|---------|-------------|
| Endpoint de consulta de recetas para ANMAT/jurisdicciones | Plataforma debe exponer API para fiscalización | No existe | Futuro — no bloquea Fase 1 | DESEABLE | Alta |
| Bloqueo remoto de receta por autoridad sanitaria | Mecanismo para invalidar receta emitida | No existe | Futuro — no bloquea Fase 1 | DESEABLE | Alta |

---

## Área 2: Validación de Profesionales (Anexo II — REFEPS)

### 2.1 Validación de matrícula en REFEPS

| Requisito | Anexo dice | Repo tiene | Gap | Clasif. | Complejidad |
|-----------|-----------|------------|-----|---------|-------------|
| Consultar REFEPS antes de permitir prescripción | Profesional debe estar habilitado en REFEPS | `src/app/api/sisa/route.ts` — SIMULADO (`SISA_MODE` env var). No consulta REFEPS real | Integrar endpoint FHIR `/fhir/Practitioner?identifier={matricula}` del Bus | BLOQUEANTE | Media |
| Validar especialidad habilitante | Profesional debe tener especialidad registrada para el acto | No se valida especialidad | Cruzar especialidad del médico contra respuesta REFEPS | URGENTE | Media |
| Cache de validación con TTL | Evitar consulta por cada receta | No existe cache | Implementar cache en DB o Redis con TTL configurable (ej: 24h) | DESEABLE | Media |

### 2.2 Datos del profesional en receta

| Requisito | Anexo dice | Repo tiene | Gap | Clasif. | Complejidad |
|-----------|-----------|------------|-----|---------|-------------|
| CUIL/CUIT del profesional | Identificador único del prescriptor | No se almacena CUIL/CUIT del médico | Agregar campo `cuil` a tabla `medicos`, requerirlo en registro | BLOQUEANTE | Baja |
| Jurisdicción de matrícula | Provincia donde está matriculado | `provincia_matricula` existe en DB | Ya cubierto — solo falta incluir en PDF | URGENTE | Baja |

### 2.3 Empadronamiento de profesionales (Fase 2)

| Requisito | Anexo dice | Repo tiene | Gap | Clasif. | Complejidad |
|-----------|-----------|------------|-----|---------|-------------|
| Sincronización periódica con REFEPS | Plataforma debe mantener registro actualizado | No existe proceso batch | Implementar cron job que revalide médicos activos contra REFEPS | DESEABLE | Media |

---

## Área 3: CUIR y Seguridad (Anexo III)

### 3.1 Estructura del CUIR

El CUIR es un identificador de 41 caracteres numéricos:

```
PPPP RRRR JJ TTSS GGGGGGGGGGGGGGGGGGGGGGGGG II
│    │    │  │    │                           └─ Ítem (2)
│    │    │  │    └─ Grupo prescripción (25) — asignado por Repositorio
│    │    │  └─ Tipo (2) + Subtipo (2)
│    │    └─ Jurisdicción (2)
│    └─ Repositorio (4) — asignado por DNSISa
└─ Plataforma (4) — 0270 para Docto
```

| Requisito | Anexo dice | Repo tiene | Gap | Clasif. | Complejidad |
|-----------|-----------|------------|-----|---------|-------------|
| CUIR generado por el Repositorio | Plataforma envía datos, Repositorio devuelve CUIR | `receta.ts` genera ID local con `Math.random()` | Integrar API del Repositorio para obtener CUIR. Hasta tener acceso, usar formato provisional marcado como "NO VÁLIDO" | BLOQUEANTE | Alta |
| Almacenar CUIR en DB | Trazabilidad completa | No existe columna `cuir` en `consultas` ni tabla de recetas | Crear tabla `recetas` con `cuir`, `estado`, `datos_prescripcion`, `firma_digital` | BLOQUEANTE | Media |
| CUIR inmutable una vez asignado | No se puede modificar | No aplica aún (no existe) | Implementar con constraint en DB | URGENTE | Baja |

### 3.2 Firma digital

| Requisito | Anexo dice | Repo tiene | Gap | Clasif. | Complejidad |
|-----------|-----------|------------|-----|---------|-------------|
| Firma digital del profesional | Ley 25.506 — firma digital con certificado válido | No existe infraestructura de firma | Integrar proveedor de firma digital (ej: Firma Digital Remota de AC-ONTI, Encode, etc.) | BLOQUEANTE | Muy alta |
| Hash de integridad del documento | Garantizar que el PDF no fue alterado | No existe hash ni verificación | Generar hash SHA-256 del PDF y almacenarlo junto al CUIR | URGENTE | Baja |

### 3.3 Seguridad de la plataforma

| Requisito | Anexo dice | Repo tiene | Gap | Clasif. | Complejidad |
|-----------|-----------|------------|-----|---------|-------------|
| Contraseñas ≥10 caracteres con complejidad | Requisito de seguridad | `registro-medico/actions.ts` exige 8 caracteres, sin complejidad | Subir a 10 chars, exigir mayúscula + número + especial | URGENTE | Baja |
| Timeout de sesión por inactividad | Sesión debe expirar tras inactividad | `middleware.ts` solo refresca token Supabase, no hay timeout por inactividad | Implementar inactivity timeout (ej: 30 min) | URGENTE | Media |
| Registro de auditoría inmutable | Todas las acciones relevantes deben quedar registradas | `055_admin_audit_log.sql` existe con tabla immutable | Cubierto parcialmente — extender para cubrir prescripciones, validaciones REFEPS, accesos a recetas | DESEABLE | Media |
| Cifrado de datos sensibles | Datos en tránsito y en reposo | HTTPS en Vercel + Supabase. `mp-crypto.ts` usa AES-256-GCM para tokens MP | Cubierto para tránsito. En reposo depende de Supabase (cifra por defecto). OK | — | — |

---

## Área 4: Cliente del Bus de Interoperabilidad (Instructivo)

### 4.1 Autenticación

El Bus ofrece dos modalidades:

| Modalidad | Endpoint test | Auth | Uso |
|-----------|--------------|------|-----|
| **FHIR** | `bus-test.msal.gob.ar/bus-auth/v2/auth` | JWT HS256 clientAssertion (clientId + secret) | REFEPS, RENAPER (datos FHIR) |
| **No-FHIR** | `bus-test.msal.gob.ar/masterfile-federacionservice/api/usuarios/aplicacion/login` | nombre + clave + codDominio | RENAPER, PUCO, REFES (JSON plano) |

**Recomendación**: Usar **FHIR** como modalidad principal. Es el estándar internacional de salud, las respuestas son estructuradas, y DNSISa está migrando todo a FHIR. Implementar No-FHIR solo como fallback para servicios que aún no tengan endpoint FHIR.

| Requisito | Anexo dice | Repo tiene | Gap | Clasif. | Complejidad |
|-----------|-----------|------------|-----|---------|-------------|
| Cliente HTTP para Bus FHIR | JWT HS256 → token → llamadas autenticadas | No existe | Crear `src/lib/bus/auth.ts` con generación de clientAssertion JWT y manejo de token | BLOQUEANTE | Media |
| Manejo de tokens (TTL, refresh) | Token tiene expiración, renovar antes de vencer | No existe | Implementar cache de token con auto-refresh | URGENTE | Baja |
| Variables de entorno para credenciales | clientId, secret, codDominio por ambiente | No existen | Agregar `BUS_CLIENT_ID`, `BUS_CLIENT_SECRET`, `BUS_COD_DOMINIO`, `BUS_BASE_URL` | BLOQUEANTE | Baja |

### 4.2 Servicios a integrar

| Servicio | Endpoint FHIR | Para qué | Prioridad |
|----------|--------------|----------|-----------|
| **REFEPS** | `/fhir/Practitioner?identifier={mat}` | Validar que médico está habilitado para prescribir | P0 — BLOQUEANTE |
| **RENAPER** | `/fhir/Patient?identifier={dni}` | Validar identidad del paciente | P1 — segunda fase |
| **PUCO** | No-FHIR: `/api/personas/puco` | Verificar cobertura del paciente (obra social) | P2 — deseable |
| **REFES** | No-FHIR: `/api/establecimientos` | Validar establecimiento de salud | P3 — futuro |
| **Repositorio de recetas** | Pendiente publicación de API | Obtener CUIR, registrar receta | P0 — BLOQUEANTE (cuando esté disponible) |

### 4.3 Manejo de errores y resiliencia

| Requisito | Repo tiene | Gap | Clasif. |
|-----------|------------|-----|---------|
| Retry con backoff exponencial | No existe | Implementar para llamadas al Bus (servicios pueden tener latencia alta) | URGENTE |
| Fallback cuando Bus no disponible | No existe | Definir política: ¿bloquear prescripción o permitir con flag "pendiente validación"? | URGENTE |
| Logging de cada interacción con Bus | `eventos_funnel` existe pero no cubre Bus | Agregar eventos específicos: `bus_refeps_ok`, `bus_refeps_fail`, `bus_token_refresh` | DESEABLE |

---

## Área 5: Prescripción Electrónica (Guía de Prescripción)

### 5.1 Flujo de prescripción completo

El flujo normativo es:

```
Médico prescribe → Plataforma valida (REFEPS + controlados) → 
Plataforma envía al Repositorio → Repositorio genera CUIR → 
Plataforma genera PDF con CUIR + firma → Paciente recibe receta
```

| Paso | Repo tiene | Gap | Clasif. |
|------|------------|-----|---------|
| 1. Médico prescribe | `WorkspaceConsulta.tsx` con formulario de receta | Falta estructura completa de medicamento (forma, concentración, CIE-10) | BLOQUEANTE |
| 2. Validación REFEPS | Simulada | Integrar Bus real | BLOQUEANTE |
| 3. Validación controlados | `esControlado()` server-side | Cubierto para bloqueo. Falta flujo alternativo con firma digital | URGENTE |
| 4. Envío al Repositorio | No existe | Implementar cuando API esté disponible | BLOQUEANTE (externo) |
| 5. CUIR en PDF | No existe | Integrar CUIR en `receta.ts` | BLOQUEANTE |
| 6. Firma digital | No existe | Ver punto 3.2 | BLOQUEANTE |
| 7. Entrega al paciente | PDF descargable post-consulta | Cubierto | — |

### 5.2 Dispensación (farmacia)

| Requisito | Repo tiene | Gap | Clasif. |
|-----------|------------|-----|---------|
| Código de barras / QR con CUIR | Placeholder QR en PDF (sin datos reales) | Generar QR con CUIR real cuando esté disponible | URGENTE |
| API para que farmacia valide receta | No existe | Futuro — requiere definición de API pública | DESEABLE |

---

## Orden de implementación recomendado

### Sprint 1: Fundaciones (2-3 semanas)
1. **Constante plataforma 0270** + tipos de receta enum
2. **Campo CUIL en médicos** + migración + formulario de registro
3. **Contraseña ≥10 con complejidad**
4. **Timeout de sesión por inactividad**
5. **Estructura medicamento ampliada** (forma, concentración, cantidad, CIE-10)
6. **Tabla `recetas`** en DB (cuir, estado, datos, firma, hash)

### Sprint 2: Bus de Interoperabilidad (2-3 semanas)
7. **Cliente Bus FHIR** (`src/lib/bus/auth.ts`) — JWT HS256, token management
8. **Integración REFEPS** — validación real de matrícula vía `/fhir/Practitioner`
9. **Reemplazar SISA simulado** por REFEPS real
10. **Retry + fallback** para llamadas al Bus
11. **Env vars** para credenciales Bus (test + prod)

### Sprint 3: CUIR + Firma (3-4 semanas, depende de API Repositorio)
12. **Integración Repositorio** — obtener CUIR (cuando API esté publicada)
13. **Firma digital** — integrar proveedor (AC-ONTI, Encode, etc.)
14. **Hash SHA-256** del PDF
15. **QR con CUIR** en PDF de receta
16. **PDF actualizado** con todos los datos normativos

### Sprint 4: Completitud (2 semanas)
17. **Integración RENAPER** — validación identidad paciente
18. **Integración PUCO** — verificación cobertura
19. **Auditoría extendida** — eventos de prescripción y validación
20. **Cron revalidación REFEPS** para médicos activos

### Dependencias externas (fuera de nuestro control)
- Credenciales de test del Bus (esperando respuesta a ABM Dominios del 20/05)
- API del Repositorio de recetas (no publicada aún)
- Proveedor de firma digital (requiere evaluación + contrato)
- Homologación por DNSISa (post-implementación)

---

## Notas importantes

1. **No implementar nada hasta tener credenciales de test** del Bus. Sin ellas, todo el código de integración sería especulativo.

2. **El CUIR no lo genera Docto** — lo genera el Repositorio. Docto envía datos de la prescripción y recibe el CUIR. Hasta que la API del Repositorio esté disponible, se puede avanzar con todo lo demás.

3. **Firma digital es el item de mayor complejidad**. Requiere:
   - Elegir proveedor (AC-ONTI para firma remota, o proveedor privado)
   - Integración técnica (API del proveedor)
   - Posiblemente token/certificado por médico
   - Evaluación legal sobre firma digital vs. firma electrónica

4. **El bloqueo actual de controlados (`esControlado()`) es correcto** como medida interina. El Anexo I confirma que controlados requieren firma digital — nuestro bloqueo previene que se emitan sin firma, lo cual es el comportamiento correcto hasta implementar firma digital.

5. **Fases de la resolución**: Docto puede operar en Fase 1 (CUIR + fiscalización básica) sin necesidad de completar todas las fases. Esto permite un go-to-market más rápido.
