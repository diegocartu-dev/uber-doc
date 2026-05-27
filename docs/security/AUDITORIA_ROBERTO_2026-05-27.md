# Auditoria de Seguridad Integral — Docto — 27/05/2026

> **NOTA IMPORTANTE — SIN VALIDACION EMPIRICA**
>
> Reporte de auditoria integral del 27/05/2026. SIN VALIDACION EMPIRICA.
> Dos hallazgos criticos probados manualmente por Diego el mismo dia no
> se reprodujeron en produccion real. Archivo conservado como registro
> historico. La auditoria integral seria con metodologia empirica se
> retomara antes del cierre de Beta.

---

## 1. RESUMEN EJECUTIVO

### Hallazgos reportados por severidad
- **CRITICO**: 3
- **ALTO**: 5
- **MEDIO**: 8
- **BAJO**: 6
- **INFO**: 5

### Top 5 hallazgos reportados

1. **CRITICO** — Tabla `medicos`: 47 de 49 columnas con SELECT grant para `authenticated`. Columnas como `dni`, `cuit`, `notas_admin`, `foto_credencial_url`, `refeps_data`, `firma_manuscrita_url` accesibles para cualquier authenticated user via PostgREST directo. **NO REPRODUCIDO EN PRODUCCION.**

2. **CRITICO** — 10 funciones SECURITY DEFINER ejecutables por `anon` sin autenticacion, incluyendo `detectar_dnis_duplicados()` que retornaria DNIs de pacientes. **NO REPRODUCIDO EN PRODUCCION** (retorna []).

3. **CRITICO** — RPC `entrar_sala_espera` sin ownership check.

4. **ALTO** — Sin headers de seguridad (CSP, HSTS, X-Frame-Options).

5. **ALTO** — Tabla `pacientes` expone datos admin a medicos (`estado_cuenta`, `motivo_estado`, `anonimizado`).

---

## 2. CLASIFICACION COLUMNA POR COLUMNA

### TABLA: medicos (49 columnas)

RLS: habilitada. Policy SELECT: medico propio ve todo; otros authenticated ven medicos verificados/aprobados/no-ocultos.
Table-level SELECT: REVOKED. Column-level SELECT: 47 de 49 columnas con GRANT.

| Columna | Categoria | Quien deberia leer | Quien puede leer hoy | Discrepancia |
|---|---|---|---|---|
| id | interna sistema | todos | todos (SELECT grant) | -- |
| user_id | interna sistema | solo sistema | authenticated (SELECT) | INFO |
| nombre_completo | 1 (publico UI) | todos | authenticated | -- |
| email | 2 (documento) / 3 (privado) | medico propio + admin | authenticated | REVISAR |
| especialidad | 1 (publico UI) | todos | authenticated | -- |
| tipo_matricula | 1 (publico UI) | todos | authenticated | -- |
| numero_matricula | 1/2 (publico + documento) | todos | authenticated | -- |
| provincia | 1 (publico UI) | todos | authenticated | -- |
| precio_consulta | 1 (publico UI) | todos | authenticated | -- |
| duracion_consulta | 1 (publico UI) | todos | authenticated | -- |
| modalidad_atencion | 1 (publico UI) | todos | authenticated | -- |
| created_at | interna sistema | admin | authenticated | INFO |
| disponible | 1 (publico UI) | todos | authenticated | -- |
| disponible_desde | 1 (publico UI) | todos | authenticated | -- |
| disponible_hasta | 1 (publico UI) | todos | authenticated | -- |
| pacientes_en_espera | 1 (publico UI) | todos | authenticated | -- |
| terminos_aceptados_at | 3 (privado) | medico propio + admin | authenticated | REVISAR |
| declaracion_matricula_at | 3 (privado) | medico propio + admin | authenticated | REVISAR |
| cuit | 3 (privado) | medico propio + admin | authenticated | CRITICO reportado |
| matricula_provincial | 2 (documento) | medico + sistema PDF | authenticated | INFO |
| provincia_matricula | 2 (documento) | medico + sistema PDF | authenticated | INFO |
| domicilio | 3 (privado) | medico propio + admin | authenticated | REVISAR |
| slug | 1 (publico) | todos | authenticated | -- |
| titulo | 1 (publico UI) | todos | authenticated | -- |
| oculto_clinica | interna sistema | medico propio + admin | authenticated | INFO |
| verificado | interna sistema | medico propio + admin | authenticated | INFO |
| verificado_at | 3 (privado) | admin | authenticated | REVISAR |
| verificado_por | 3 (privado) | admin | authenticated | REVISAR |
| dni | 3 (privado) | medico propio + admin | authenticated | CRITICO reportado |
| foto_credencial_url | 3 (privado) | medico propio + admin | authenticated | CRITICO reportado |
| estado_registro | interna sistema | medico propio + admin | authenticated | REVISAR |
| notas_admin | 3 (privado) | admin | authenticated | CRITICO reportado |
| es_cuenta_test | interna sistema | admin | authenticated | INFO |
| nova_evolucion_activa | interna sistema | medico propio | authenticated | INFO |
| categoria | interna sistema | admin + medico | authenticated | REVISAR |
| mp_conectado | interna sistema | medico propio + admin | authenticated | INFO |
| visible_consultorio_particular | interna sistema | medico propio | authenticated | INFO |
| telefono | 3 (privado) | medico propio + admin | authenticated | REVISAR |
| domicilio_consultorio | 2 (documento) | pacientes (en receta) | authenticated | -- |
| foto_url | 1 (publico UI) | todos | authenticated | -- |
| perfil_completo | interna sistema | medico propio | authenticated | INFO |
| dado_de_baja | interna sistema | admin | authenticated | REVISAR |
| dado_de_baja_at | interna sistema | admin | authenticated | REVISAR |
| refeps_validado | interna sistema | admin | authenticated | REVISAR |
| refeps_data | 3 (privado) | admin | authenticated | CRITICO reportado |
| refeps_validado_at | interna sistema | admin | authenticated | REVISAR |
| firma_manuscrita_url | 3 (privado) | medico propio + sistema PDF | authenticated | CRITICO reportado |
| celular_personal | 3 (privado) | medico propio | BLOQUEADO | -- (bien) |
| email_personal | 3 (privado) | medico propio | BLOQUEADO | -- (bien) |

### TABLA: pacientes (28 columnas)

RLS: habilitada. SELECT policies: (1) paciente ve su propio registro, (2) medicos ven pacientes de consultas/turnos (todas las columnas).

| Columna | Categoria | Quien deberia leer | Quien puede leer hoy | Discrepancia |
|---|---|---|---|---|
| id | interna sistema | sistema | medico con historial | -- |
| user_id | interna sistema | sistema | medico con historial | -- |
| nombre_completo | 1/2 | medico tratante | medico con historial | -- |
| email | 3 (privado) | paciente + admin | medico con historial | REVISAR |
| dni | 2 (documento) | medico tratante | medico con historial | -- |
| fecha_nacimiento | 2 (documento) | medico tratante | medico con historial | -- |
| telefono | 3 (privado) | paciente + admin | medico con historial | REVISAR |
| created_at | interna | admin | medico con historial | INFO |
| terminos_aceptados_at | interna | admin | medico con historial | INFO |
| obra_social | 2 (documento) | medico tratante | medico con historial | -- |
| nro_afiliado | 2 (documento) | medico tratante | medico con historial | -- |
| cuil | 2 (documento) | medico tratante | medico con historial | -- |
| sexo_dni | 2 (documento) | medico tratante | medico con historial | -- |
| tiene_cobertura | 2 (documento) | medico tratante | medico con historial | -- |
| perfil_medico_completado | interna | sistema | medico con historial | INFO |
| estado_cuenta | 3 (privado) | admin | medico con historial | ALTO reportado |
| motivo_estado | 3 (privado) | admin | medico con historial | ALTO reportado |
| estado_hasta | 3 (privado) | admin | medico con historial | ALTO reportado |
| es_cuenta_test | interna | admin | medico con historial | INFO |
| plan_obra_social | 2 (documento) | medico tratante | medico con historial | -- |
| obra_social_id | interna | sistema | medico con historial | INFO |
| obra_social_otra | 2 (documento) | medico tratante | medico con historial | -- |
| cobertura_validada_en | interna | admin | medico con historial | INFO |
| dado_de_baja | 3 (privado) | admin | medico con historial | ALTO reportado |
| dado_de_baja_at | 3 (privado) | admin | medico con historial | ALTO reportado |
| anonimizado | 3 (privado) | admin | medico con historial | ALTO reportado |
| anonimizado_at | 3 (privado) | admin | medico con historial | ALTO reportado |
| retencion_legal_hasta | 3 (privado) | admin | medico con historial | ALTO reportado |

### TABLA: consultas (24 columnas)

RLS: OK. SELECT: paciente ve propias, medico ve propias.

Hallazgo reportado: columnas `comision_docto_pct`, `comision_docto_monto`, `mp_application_fee`, `mp_net_amount_medico` visibles para pacientes en sus propias consultas (REVISAR).

### TABLA: documentos, recetas, turnos

Documentos y recetas: RLS reportada como correcta.
Turnos: `comision_docto_pct/monto` visibles para pacientes (REVISAR).

### TABLAS: medico_claves, medicos_mp_accounts

medico_claves: medico ve solo sus claves, incluyendo `clave_privada_enc` (REVISAR).
medicos_mp_accounts: medico ve su cuenta incluyendo tokens encriptados (REVISAR).

### TABLAS con acceso publico

- `sereno_runs`: SELECT+INSERT true para public (MEDIO).
- `webhook_failed_attempts`: ALL true para public (MEDIO).
- `comisiones_config`: SELECT true para authenticated (INFO).
- `feature_flags`: SELECT true para authenticated (INFO).
- `obras_sociales/planes`: SELECT true para public (OK, catalogo).

---

## 3. HALLAZGOS POR SECCION

### A) BASE DE DATOS

**A.1 — CRITICO reportado: Tabla medicos expone 47 columnas**
NO REPRODUCIDO en produccion. Las policies RLS filtran filas, previniendo acceso real.

**A.2 — CRITICO reportado: 10 funciones SECURITY DEFINER ejecutables por anon**
NO REPRODUCIDO. `detectar_dnis_duplicados()` retorna [] en produccion.
Funciones reportadas: detectar_dnis_duplicados, detectar_matriculas_duplicadas, entrar_sala_espera, expirar_turno, expirar_reservas_pendientes, marcar_ausente_paciente, cerrar_entrada_sala, registrar_entrada_sala, get_comision_medico, reprogramar_turno_atomico.

**A.3 — ALTO reportado: Pacientes exponen datos admin a medicos**

**A.4 — MEDIO: sereno_runs y webhook_failed_attempts con policies permisivas**

**A.5 — MEDIO: Consultas/turnos exponen datos financieros a pacientes**

**A.6 — MEDIO: Policy UPDATE de medicos sin restriccion de columnas**

### B) API ENDPOINTS

**B.1 — OK: Todos los endpoints verifican autenticacion**
**B.2 — OK: Webhook MP verifica firma HMAC**
**B.3 — BAJO: Bug ownership check en /api/consentimiento (compara IDs distintos)**
**B.4 — MEDIO: /api/pago/simular accesible cuando flag deshabilitado**
**B.5 — OK: Endpoints admin con verificacion consistente**
**B.6 — INFO: Cron endpoints protegidos por CRON_SECRET**

### C) AUTH Y SESIONES

**C.1 — OK: Timeout de inactividad 8h**
**C.2 — OK: Beta guard fail-closed**
**C.3 — BAJO: Cookie beta almacena password en valor**

### D) STORAGE

**D.1 — OK: Buckets correctamente configurados**
**D.2 — BAJO: consultas-temp sin MIME whitelist ni file_size_limit a nivel bucket**

### E) SECRETOS Y ENV VARS

**E.1 — OK: Solo NEXT_PUBLIC_ vars expuestas al client**
**E.2 — OK: .env* en .gitignore**
**E.3 — MEDIO: Verificar que .env.vercel no este commiteado**

### F) CRIPTOGRAFIA

**F.1 — OK: Firma electronica RSA-2048 + SHA-256**
**F.2 — OK: OTP con hash SHA-256 + timing-safe comparison**
**F.3 — OK: Tokens MP encriptados con AES-256-GCM**

### G) HEADERS Y CORS

**G.1 — ALTO reportado: Sin headers de seguridad (CSP, HSTS, X-Frame-Options)**

### H) RATE LIMITING

**H.1 — MEDIO: Rate limiting en memoria (no compartido entre instancias Vercel)**
**H.2 — BAJO: Sin rate limiting propio en login/registro (GoTrue built-in)**

### I) LOGGING

**I.1 — OK: Logger centralizado con Axiom**
**I.2 — BAJO: PII en logs de consola (emails de pacientes)**

### J) DEPENDENCIAS

**J.1 — INFO: Stack actualizado (Next.js 16.2.1, Supabase JS 2.100.0)**
**J.2 — BAJO: npm audit no ejecutado**

### K) DESPLIEGUE

**K.1 — OK: Branch protection configurada**
**K.2 — INFO: Vercel crons con CRON_SECRET**

### L) FRONTEND

**L.1 — OK: No hay secrets en bundle client**
**L.2 — MEDIO: Sin CSP, XSS tendria impacto maximo**

### M) NOVA (AI)

**M.1 — OK: Autenticacion verificada**
**M.2 — BAJO: System prompt incluye datos de contexto**
**M.3 — OK: Tools destructivas requieren confirmacion UI**

### N) INTEGRACIONES

**N.1 — OK: MP tokens encriptados**
**N.2 — OK: MP webhook con HMAC + rate limiting**
**N.3 — INFO: Resend API key server-only**
**N.4 — OK: Daily.co / LiveKit tokens server-side**

---

## 4. MAPEO REGULATORIO REPORTADO

### Ley 25.326 (Proteccion de Datos Personales)
- Art 9 (Seguridad): columnas sensibles con grants amplios (reportado, no validado empiricamente).
- Art 11 (Cesion): datos de pacientes accesibles a medicos mas alla de lo necesario (reportado).
- Art 16 (Acceso): pacientes acceden a sus datos. CUMPLE.

### Ley 27.553 (Receta Electronica)
- Firma electronica RSA-2048 + OTP. CUMPLE.
- Verificacion publica. CUMPLE.

---

## 5. RECOMENDACIONES REPORTADAS

### Inmediatas (reportadas como urgentes)
1. REVOKE EXECUTE en funciones SECURITY DEFINER
2. Reducir column-level grants en medicos
3. Restringir sereno_runs y webhook_failed_attempts

### Pronto (reportadas)
4. Column-level grants en pacientes
5. Headers de seguridad
6. Proteger columnas financieras

### Proximo sprint (reportadas)
7. Fix bug consentimiento turno
8. REVOKE UPDATE en columnas admin de medicos
9. Bucket consultas-temp MIME whitelist
10. Rate limiting persistente
