# 13/07/2026 — Incidente Didit (causa raíz) + auditoría de fallas silenciosas + watchdog

## Resumen ejecutivo

El "Didit no valida a nadie" que bloqueó a 14 médicos entre el 22/06 y el 12/07 **no era un problema de Didit**: era nuestra URL de webhook apuntando al dominio pelado. A partir de ese hallazgo se corrió una auditoría integral de fallas silenciosas del camino paciente/plata (28 hallazgos, 18 confirmados con evidencia empírica contra producción) y se ejecutó un plan de 3 tickets aprobado por Diego. Resultado: la validación de identidad quedó verificada end-to-end en producción, la plataforma tiene por primera vez una capa de alarma (watchdog de crons), y se revivieron dos redes de seguridad que estaban muertas.

## 1. Causa raíz del incidente Didit (12-13/07)

**Síntoma:** mail de la Dra. Andrezza Siqueira ("la pantalla de validación queda horas y no avanza"). Nuestra DB decía `didit_status="Not Started"` para todos → conclusión inicial (equivocada) "Didit está roto, nadie lo inicia".

**Realidad (verificada en el panel de Didit):** los médicos SÍ completaban la biometría — Andrezza figuraba APROBADA ×4, Mario RECHAZADO. El panel de webhooks de Didit mostró **24 entregas, TODAS con respuesta HTTP 307, "0% errores"** (un 3xx no es error para su métrica).

**Causa raíz:** el webhook estaba configurado a `https://docto.com.ar/api/didit/webhook` (dominio pelado/apex). Vercel redirige apex→`www.docto.com.ar` con 307, y Didit —como casi todos los senders de webhooks— no sigue redirecciones. El POST con el resultado moría en el 307 y nunca llegaba a nuestro handler. Evidencia reproducible:

```
POST https://docto.com.ar/api/didit/webhook      → 307  location: https://www.docto.com.ar/...
POST https://www.docto.com.ar/api/didit/webhook  → 401  {"error":"firma"}   (handler vivo, fail-closed)
```

**Regla sistémica que deja el incidente:** todo webhook **server-to-server** debe apuntar a `https://www.docto.com.ar/...`, NUNCA al apex. Los redirects de browser (callbacks) sí toleran el apex (el navegador sigue el 307). Mercado Pago está a salvo (usa `req.nextUrl.origin`). **Pendiente: verificar la config del webhook de LiveKit en su consola.**

**Fixes:**
- URL del webhook corregida a `www` en la consola de Didit (config, 13/07). Test de entrega verificó transporte + secreto + firma.
- **PR #258** — cron `/api/cron/reconciliar-identidad` (cada 10 min): backstop que re-consulta a Didit por los pendientes con sesión y aplica el MISMO cruce anti-suplantación que el webhook (helper único `src/lib/didit/reconciliar.ts`; el webhook se refactorizó para usarlo). Regla del cruce: `identidad_validada=true` SOLO si decisión re-consultada "Approved" + DNI-Didit == DNI-registrado + matrícula del DNI en REFEPS. Timeout de REFEPS ≠ "no figura": ante fallo transitorio del Bus no se decide (retriable), no se marca In Review.
- **Backfill verificado contra prod** (primera corrida del cron, 17:51Z): Andrezza `Approved`→validada, Veronica `Approved`→validada, Mario `Declined`→NO validado (correcto). Gates: revisión adversarial (13 hallazgos, 5 confirmados, todos low, ninguno viola la invariante) + Roberto APROBADO.

**El gate `identidad_gate_activa` se re-prendió el 14/07 (PR #263, verificado) y se volvió a APAGAR el mismo día**, tras la prueba en vivo de Diego (dogfooding con cuenta propia): la biometría funcionó de punta a punta, pero la UX de espera del resultado (spinner esperando a Didit + banner que no refleja "en revisión") confunde, y Diego decidió un rediseño integral del registro con la biometría DENTRO del registro, pre-aprobación — spec aprobada en `docs/specs/2026-07-14-rediseno-registro-medico.md`. El gate queda APAGADO hasta implementar ese rediseño. Rediseño sin muro (banner en el dashboard + página dedicada `/medico/identidad` con salida "Volver al panel"), recordatorio dinámico al médico por mail (identidad + MP + firma según falte; corre en el cron reconciliar-identidad solo con flag ON), y aviso al admin por badge en `/admin/medicos` (no mail). Candado crítico (gate Roberto): el trigger `proteger_verificacion_medico` se extendió para que `identidad_validada`/`biometria_exenta`/`didit_*`/`refeps_validado`/`es_cuenta_test` NO sean auto-escribibles por el médico — sin esto el gate era decorativo (un médico podía marcarse validado). Decisión Diego: sin exención amplia (los 13 aprobados sin validar estaban todos offline → eximir no preservaba oferta y debilitaba el control); solo Carina/Pablo exentos. Verificado: perfil público muestra a validados/exentos y oculta a los no-validados; clínica no crashea; el candado bloquea el self-set (probado en prod). Detalle en `[[project_gate_medico_identidad]]`.

## 2. Auditoría de fallas silenciosas (camino paciente + plata)

Workflow de 36 agentes con verificación empírica contra producción (curl + SQL read-only). 28 hallazgos, 18 confirmados. **Sin plata perdida activa** (los 6 pagos reales aterrizaron bien): el problema es falta de red y de detección.

**Mordiendo hoy:**
1. **Oferta CI real = 0** — los 16 médicos reales aprobados están `disponible=false`; los únicos 2 "disponibles" son cuentas test. Un paciente real no puede tomar Consulta Inmediata. Acciones: campaña de activación (decisión Diego) + monitor de oferta (P1).
2. **Slot evaporado al cancelar** (ticket B, abajo).

**Latentes principales:** ningún cron alertaba al fallar ni al dejar de correr (ticket A); `cerrar-huerfanas` muerto ~3 meses (ticket D); `getFlag()` degrada a "todo apagado" si falla la lectura de flags; sin conciliación MP↔DB para pagos perdidos; guardado de receta fire-and-forget sin chequeo de error; CI sin motor de reembolso por médico-ausente (F2-4 pendiente).

## 3. Plan ejecutado (aprobado por Diego, "en orden de seguridad")

### Ticket D — cerrar-huerfanas revivido (PR #259, MERGED)
La rama de `consultas` filtraba por `updated_at`, columna que NO existe en esa tabla → la query erroraba en cada corrida desde ~abril (red muerta ~3 meses) y la ruta devolvía 200 igual (invisible). Fix: `en_curso_at` con umbral **4 h** (10 min habría echado a un paciente de una CI viva — `en_curso_at` es inicio fijo, no actividad; los cortes de conexión los maneja `rejoin-expirar`); bloque "pagadas" corregido a `created_at` (mismo bug, lo encontró Roberto en el gate — su versión inicial habría generado una falsa alarma diaria); ante error la ruta devuelve 500 + `sendDoctoAlert`.

### Ticket A — watchdog de crons (PR #260)
- `withCron(key, handler)` (`src/lib/cron-guard.ts`): auth fail-closed única (antes 10/13 crons quedaban fail-open si `CRON_SECRET` quedaba vacía), heartbeat por corrida en `cron_runs`, alerta por mail ante throw o HTTP ≥ 500 **con throttle de 6 h por cron** (sin throttle, un cron de 10 min roto = ~144 mails/día = fatiga = se ignoran).
- Cron guardián `/api/cron/watchdog` (cada 30 min): mail si un cron lleva >1.5×intervalo+30 min sin latido — única detección de "Vercel dejó de invocarlo". Mapa `ESPERADOS` espejo de vercel.json (**mantener en sync**). Anti-spam 6 h. Limitación lógica conocida: el watchdog no puede auto-avisar si él mismo muere; follow-up barato: ping externo o exponer su latido en `/insights`.
- Migración `20260713_cron_runs.sql` (aplicada): tabla solo-service-role (RLS on sin policies + `REVOKE ALL ... FROM anon, authenticated` — hardening del gate).
- Los 13 route handlers de cron envueltos (12 agendados + `recordatorios-10min`, que sigue sin agendar — decisión de producto pendiente, tiene bug de TZ conocido).

### Ticket B — slot evaporado al cancelar (pendiente de PR al cierre de este doc)
Al cancelar un turno, el sistema re-ofrece el horario insertando una fila `disponible` nueva — pero el índice único TOTAL `turnos_medico_fecha_hora_uq (medico_id, fecha, hora_inicio)` choca con la fila cancelada (histórico) y el insert fallaba **al 100%, sin chequeo de error**: 9 slots vendibles evaporados.

Fix en 3 partes con **orden de deploy estricto (código primero, migración después)**:
1. `cancelarTurnoPorPaciente`: chequear el error del insert + alerta si falla (la cancelación/reembolso NO se aborta). `cancelarTurnoPorMedico` no re-crea el slot a propósito (el médico no puede atender a esa hora).
2. `generar-slots`: **hallazgo crítico del diseño** — usaba `upsert onConflict "medico_id,fecha,hora_inicio"`, que REQUIERE el índice único total; con el índice parcial rompería cada corrida. Se reemplazó por select-de-activos + filtro + insert (compatible con AMBOS índices; degradación fila-por-fila ante carrera 23505). Bonus: pasa a regenerar solo los slots cuya única fila es terminal dentro del horizonte del modelo → los 9 perdidos se reponen sin backfill manual.
3. Migración `20260713_indice_parcial_turnos.sql`: índice único PARCIAL (`WHERE estado NOT IN ('cancelado_paciente','cancelado_medico','ausente_paciente','ausente_medico','completado')`) — sigue garantizando un solo turno activo por slot (sin doble booking), pero el histórico convive con el slot re-ofrecido.

## 4. Pendientes que deja este sprint

- **Activación de oferta**: campaña a los 16 médicos aprobados con `disponible=false` (decisión/acción Diego) + monitor "oferta real = 0 en horario hábil" (P1, watchdog de negocio).
- **Watchdog de negocio (P1)**: mail diario con oferta=0 / consultas cerradas sin documentos / estados colgados >30 min / pagos MP sin consulta (requiere conciliación MP↔DB).
- **Verificar webhook de LiveKit** (consola LiveKit): si apunta al apex tiene el mismo agujero 307.
- getFlag() resiliente (no pisar el último valor bueno ante error de lectura).
- Guardado de receta: chequear error + detector de "consulta cerrada con 0 documentos".
- Motor de reembolso médico-ausente para CI (F2-4).
- `recordatorios-10min`: decidir si se agenda (y arreglar su bug de TZ antes).
- Monitor de Axiom sobre level=error (el token ingesta desde hace 62 días; falta el monitor).
