# RLS Sweep — Schema Public Completo

**Auditor:** Roberto (QA/Seguridad)
**Fecha:** 2026-05-11
**Veredicto:** 0 hallazgos activos — todas las policies son correctas

---

## Contexto

La asimetría clave en el modelado de Docto:
- `consultas.paciente_id` → referencia `auth.users(id)` → `auth.uid()` directo es CORRECTO
- `documentos.paciente_id` y `turnos.paciente_id` → referencian `pacientes(id)` → requieren subquery
- `medico_id` en todas las tablas → referencia `medicos(id)` → siempre requiere subquery

---

## Tablas analizadas (22 total, incluyendo 3 de storage)

### medicos
- Policies usan `auth.uid() = user_id` → **OK** (user_id es auth.users(id) directo)

### pacientes
- Policies usan `auth.uid() = user_id` → **OK**

### consultas
- Paciente: `auth.uid() = paciente_id` → **OK** (paciente_id es auth.users(id))
- Médico: `medico_id IN (SELECT id FROM medicos WHERE user_id = auth.uid())` → **OK**

### documentos
- Paciente: `paciente_id = (SELECT id FROM pacientes WHERE user_id = auth.uid())` → **OK**
- Médico: `medico_id = (SELECT id FROM medicos WHERE user_id = auth.uid())` → **OK**

### turnos
- Médico: `medico_id = (SELECT id FROM medicos WHERE user_id = auth.uid())` → **OK**
- Paciente: `paciente_id = paciente_id_for_current_user()` (SECURITY DEFINER) → **OK**

### agenda_modelos
- `medico_id IN (SELECT id FROM medicos WHERE user_id = auth.uid())` → **OK**

### agenda_franjas
- Acceso indirecto via `modelo_id IN (SELECT id FROM agenda_modelos WHERE medico_id IN (...))` → **OK**

### turnos_espera
- Paciente: `paciente_id IN (SELECT id FROM pacientes WHERE user_id = auth.uid())` → **OK**
- Médico: via `turno_id IN (SELECT id FROM turnos WHERE medico_id IN (...))` → **OK**

### medicos_mp_accounts
- `medico_id = (SELECT id FROM medicos WHERE user_id = auth.uid())` → **OK** (corregido en migr 055)

### mp_oauth_state
- Solo service_role → **OK**

### mensajes_sistema
- Paciente: `paciente_id IN (SELECT id FROM pacientes WHERE user_id = auth.uid())` → **OK**
- Médico: `medico_id IN (SELECT id FROM medicos WHERE user_id = auth.uid())` → **OK**

### sala_espera_entradas
- Paciente: `paciente_id IN (SELECT id FROM pacientes WHERE user_id = auth.uid())` → **OK**
- Médico: `medico_id IN (SELECT id FROM medicos WHERE user_id = auth.uid())` → **OK**

### mensajes_internos_medicos
- `medico_id IN (SELECT id FROM medicos WHERE user_id = auth.uid())` → **OK**

### push_subscriptions
- `auth.uid() = user_id` → **OK** (user_id es auth.users(id) directo)

### Tablas solo service_role (RLS habilitado, 0 policies)
- `alertas_admin` — OK (inaccesible desde client)
- `sereno_runs` — OK (inaccesible desde client)

### Tablas con lectura pública
- `feature_flags` — SELECT USING (true) — datos no sensibles → **OK**
- `comisiones_config` — SELECT USING (true) — datos no sensibles → **OK**
- `regimen_nuevos_medicos` — SELECT USING (true) → **OK**
- `lista_espera` — INSERT público (formulario captación) → **OK**

### Storage (credenciales-medicos)
- Carpeta por auth.uid() → **OK**

### Storage (consultas-temp)
- Paciente via `consultas WHERE paciente_id = auth.uid()` → **OK**
- Médico via JOIN medicos → **OK**

---

## Resumen

| Categoría | Cantidad |
|-----------|----------|
| Tablas analizadas | 22 |
| Policies revisadas | ~45 |
| BUG CONFIRMADO activo | 0 |
| SOSPECHOSA | 0 |
| Bug ya corregido | 1 (medicos_mp_accounts, migr 055) |

**Nota:** `alertas_admin` tiene RLS habilitado pero 0 policies (inaccesible desde client). No es bug pero si se necesita leer desde el front admin, habrá que agregar policy.
