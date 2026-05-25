# Limpieza de cuentas de prueba — Pre-F&F

**Fecha:** 2026-05-25
**Ejecutado por:** Claude Code (con OK explícito de Diego)
**Motivo:** Arrancar QA E2E desde cero antes de Friends & Family

## Cuentas eliminadas

### 1. diegocartu@gmail.com — Médico ficticio

| Campo | Valor |
|---|---|
| user_id | `717ff02e-011c-4e64-b877-bc3a35d801a0` |
| medico_id | `acb553ee-43f3-4e77-8176-2f6ceb64b82d` |
| Nombre | Diego Gonzalez |
| Matrícula | MN 122222 (ficticia) |
| Registrado | 26/03/2026 |

**Datos borrados:**
- 71 documentos (recetas, indicaciones, certificados)
- 60 consultas (48 completadas, 11 canceladas, 1 aceptada)
- 785 turnos (487 disponibles, 276 bloqueados, 11 completados, etc.)
- 10 modelos de agenda
- 1 conexión Mercado Pago (mp_user_id: 3404634426)
- 29 eventos de funnel
- 8 mensajes de sistema + 4 mensajes internos
- 7 entradas de sala de espera
- 3 suscripciones push
- 1 registro admin_users (inactivo)
- 1 firma manuscrita en bucket `firmas-medicos` (residuo de test E2E: 3 dots, no firma real)
- Registro auth eliminado (email libre para re-registro)

### 2. mgiselagunther@gmail.com — Paciente

| Campo | Valor |
|---|---|
| user_id | `47b120b4-506e-4795-9fb9-b4a6e21b2ef1` |
| paciente_id | `6c21b099-1afa-422c-8a55-3657c46de9da` |
| Nombre | Gisela Gunther |
| Registrada | 15/04/2026 |

**Datos borrados:**
- 2 consultas (1 completada, 1 cancelada)
- 3 documentos (1 receta, 1 indicaciones, 1 certificado)
- 1 turno (cancelado por médico)
- Perfil de paciente completo
- Registro auth eliminado

### 3. paancogliandro@gmail.com — Paciente

| Campo | Valor |
|---|---|
| user_id | `5986fff4-b37f-4bff-9f75-36cbedd0c220` |
| paciente_id | `8f75f06c-cb4c-4cbf-a40f-9b9df236321e` |
| Nombre | Pablo Antonino Cogliandro |
| Registrado | 01/05/2026 |

**Datos borrados:**
- 1 consulta (completada)
- 3 documentos (1 receta, 1 indicaciones, 1 certificado)
- Perfil de paciente completo
- Registro auth eliminado

## Verificación post-borrado

- Auth users: eliminados (3/3)
- Tablas de datos: zero orphans en todas las tablas verificadas
- Storage buckets: limpios (firmas-medicos, avatars)
- Emails libres para re-registro desde cero

## Notas

- Las demás cuentas de pacientes de prueba (jose2@velez.com, juan@valdez.com, etc.) NO fueron eliminadas en esta pasada. Si se necesita limpiar más cuentas, replicar el mismo procedimiento.
- La cuenta admin real de Diego (distinta de diegocartu@gmail.com) NO fue tocada.
