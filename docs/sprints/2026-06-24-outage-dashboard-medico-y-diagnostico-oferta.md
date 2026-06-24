# Cierre 2026-06-24 — Outage dashboard médico + diagnóstico de oferta + reactivación

Sesión de diagnóstico y fixes disparada por dos observaciones de Diego: (1) un médico
"siempre disponible" en el dashboard CEO, y (2) un médico cayendo en la vista de paciente.
Terminó destapando la causa real del colapso de oferta. Todo verificado contra producción.

## 1. Incidente P0 — el médico caía en la vista de PACIENTE (PR #216)

**Síntoma:** todo médico que entraba a `/dashboard` veía la vista de paciente (navbar
"Paciente", "Mis datos / Mis consultas / Ayuda", card "Consultá un médico ahora") en lugar
de su panel.

**Causa raíz (verificada empíricamente):** el SELECT de la fila propia del médico en
`/dashboard` incluía `celular_personal`, columna **sin `GRANT SELECT` para el rol
`authenticated`**. PostgREST falla la query ENTERA (`permission denied for column
celular_personal`) → `data = null` → la variable `medico` queda `null` → el render de médico
(gated por `role === "medico" && medico`) no corre → cae al render de PACIENTE (fallback al
final del archivo).

- RLS de fila NO era el problema: la policy permite la fila propia (`user_id = auth.uid()`).
  Era el **grant a nivel de columna**.
- Introducido en el commit `644e9a8` ("Gate médico: celular obligatorio", ~19/06).
  **Afectó a TODOS los médicos durante ~5 días.**

**Hermanos del mismo commit (hallazgo de @roberto en el review):**
- `dashboard/actions.ts` (`actualizarDisponibilidad`): mismo SELECT con cliente RLS →
  `previo = null` → **el gate duro de activación (MP + firma) se salteaba** (un médico podía
  ponerse `disponible` sin cobros ni firma) + se rompía el desempate FIFO y el log de oferta.
- `medico/onboarding/page.tsx`: mismo patrón → `medico = null` → el wizard de onboarding
  (mergeado el 19/06) **rebotaba al dashboard: feature muerta en prod**.

**Fix (PR #216):** leer la fila propia del médico con el **service role**
(`createAdminClient`), no con el cliente RLS, en los 3 lugares. Más un **guard defensivo**:
si `role === "medico"` pero la fila no carga, `throw` (falla ruidosa) en vez de renderizar
silenciosamente la vista de otro rol.

**Por qué NO se grantea `celular_personal` a `authenticated`:** la policy pública de
`medicos` (`verificado AND aprobado AND NOT oculto_clinica`) deja que cualquier paciente
autenticado lea filas de médicos. Granteársela expondría el **celular personal (PII)** de
todos los médicos a cualquier paciente.

### Regla aprendida (reusar)
Cualquier `SELECT` con el cliente **RLS** sobre `medicos` (u otra tabla con grants de columna
parciales) que incluya una columna **sin grant para `authenticated`** rompe **toda** la query
→ resultado `null` silencioso. Columnas de `medicos` sin grant hoy: `celular_personal`, `dni`,
`cuit`, `email_personal`, `refeps_data/validado/validado_at`, `notas_admin`, `mp_conectado`,
`matricula_provincial`, `provincia_matricula`, `didit_session_id`, etc. **Para leer la fila
propia con columnas sensibles, usar service role (`createAdminClient`), nunca el cliente RLS.**
El patrón correcto de referencia ya vive en `medico/perfil/page.tsx` (RLS para campos
públicos + admin separado para PII).

## 2. Diagnóstico del colapso de oferta (por qué nadie consulta)

Disparado por "es raro que nadie consultó". Verificado contra prod:
- **La máquina funciona:** 3 consultas reales completas el 09/06 (pago `approved` + sala de
  video + completada). NO está roto. El acceso del paciente funciona.
- **Cero consultas reales desde el lanzamiento (10/06).** 90 pacientes reales registrados,
  **1 solo inició una consulta en toda la historia.** 7 registros nuevos en los últimos 4
  días, 0 consultas.
- **El cuello es la OFERTA EN VIVO, no la demanda ni el software.** De 9 médicos reales, solo
  Carina figuraba "disponible" — y fue un **toggle olvidado** (lo prendió el 18/06 y no lo
  apagó). Los otros se pusieron disponibles **0 veces**.
- **Conexión con el incidente #1:** los médicos no podían ponerse disponibles porque **su
  dashboard estaba roto** (caían en vista de paciente, sin toggle). Carina zafó porque se
  activó el 18/06, **un día antes** de que el outage entrara (`644e9a8`, 19/06).
- **Por qué 6 de 8 médicos no pueden atender aunque quieran:** `perfilMedicoCompleto` exige
  MP + firma electrónica + celular + foto + domicilio + firma manuscrita. 5 médicas tienen
  solo la matrícula validada (abandonaron el setup); 1 (Veronica) está a un dato (celular).
  Solo Carina y Pablo tienen el perfil completo.

## 3. Auto-apagado de disponibilidad a las 4h (PR #214)

El toggle `disponible` no caducaba: un médico que lo dejaba prendido aparecía "disponible
ahora" en la cartilla sin estar frente a la pantalla (riesgo de no-show + oferta fantasma en
el dashboard CEO). Caso real: Carina, 6 días prendido.

- Nuevo cron `/api/cron/apagar-disponibilidad` (cada 30 min): apaga a quien lleve >4h
  encendido (`disponible_desde_at`), registra la transición en `disponibilidad_log` y avisa
  al médico (push + mensaje interno).
- Guardas: no toca cuentas test (E2E); no apaga a un médico con consulta activa
  (esperando/aceptada/en_curso); fila sin ancla de tiempo → se reporta, no se apaga.
- UPDATE idempotente (`.eq("disponible", true).not("disponible_desde_at","is",null)`) por
  review de @roberto.
- Carina apagada a mano en el momento.

## 4. Mail de bienvenida sin "médico fundador / comisión 5%" (PR #215)

`enviarEmailMedicoAprobado` mostraba chip "Médico fundador", "comisión del 5%" en el cuerpo y
"Tu cuenta de médico fundador está activa" en el asunto. Contradice la regla de no comunicar
el cupo founder ni la comisión (anti-venta). Reemplazado por copy neutro (chip "Cuenta
verificada", asunto "Tu cuenta ya está activa", cuerpo sin el régimen fundador).

## 5. Campaña de reactivación a 6 médicas

Mail desde `soporte@docto.com.ar` (reenvío a Gmail de Diego confirmado vía ImprovMX — el
correo entrante del dominio lo maneja ImprovMX, NO Resend que es solo envío), con
`Reply-To: soporte@`. Copy aprobado por Diego y validado por @martin y @lucia: trato de
usted, sin "sin intermediarios" (overclaim — Docto cobra comisión), transparencia de comisión,
sin prometer volumen, firma "Valentina · Equipo Docto". 5 médicas reciben "completá tu perfil"
(CTA → `/medico/perfil`, que funciona); Veronica recibe "solo te falta el celular".
Script: `scripts/enviar-reactivacion-medicos.mjs` (modos `preview`/`send`).

## Pendientes / follow-ups

- **Activación:** ver quién de las 6 completa el perfil y se pone disponible (la métrica que
  importa) ahora que el dashboard quedó arreglado.
- **Deuda de rol:** migrar la resolución de `/dashboard` (y `/`, `/auth/callback`) a
  `resolverRol` — hoy `/dashboard` confía en `user_metadata.role` antes que en las tablas.
- **Aviso por mail al médico** ("paciente esperando"): no existe (solo push + WhatsApp); los
  médicos sin celular no reciben nada. Build nuevo si se decide.
- **Cuenta de prueba real** `diegocartu+cartilla@gmail.com` (es_cuenta_test=false): borrar
  cuando no se use (ensucia métricas como 1 paciente real).
- **`aceptada_at`** está NULL en todas las consultas → la métrica "Espera prom. CI" del
  dashboard siempre da "Sin datos". Bug menor de instrumentación.
