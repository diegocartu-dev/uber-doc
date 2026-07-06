# Validación REFEPS automática — cierre (05/07/2026, PR #250)

**Problema (Diego):** el admin aprobaba a ciegas. El botón de la card pendiente solo linkeaba a SISA; la validación REFEPS real vivía en el detalle post-aprobación, con otro click. Modelo pedido: *"yo debería encontrarme con un médico nuevo validado o no en REFEPS, listo para ver la credencial y aprobar o no. Nada más."*

## Qué quedó en producción

**Capa 1 — al registrarse:** `waitUntil` (`@vercel/functions`) dispara `validarYPersistirRefeps` en background después del alta ([registro-medico/actions.ts](../../src/app/auth/registro-medico/actions.ts)). No demora el registro; si explota, no lo afecta (catch adjunto antes del waitUntil).

**Capa 2 — cron [`validar-refeps-pendientes`](../../src/app/api/cron/validar-refeps-pendientes/route.ts)** (cada 10 min, `vercel.json`): resuelve lo que la capa 1 no pudo (Bus caído). **Cadencia (decisión Diego): cada 10 min la primera hora (6 intentos) → después cada 6 horas hasta resolver.** Nunca se rinde mientras el médico siga pendiente. Solo reintenta lo NO-definitivo (`REFEPS_TIMEOUT/AUTH/INTERNO` o sin dato); un "no figura" real es definitivo. Tracking `auto_intentos`/`ultimo_intento_at` dentro de `refeps_data` (sin migración). Fail-closed sin `CRON_SECRET`. `maxDuration=60`, lote 10 ordenado por `created_at`, excluye cuentas test.

**Compartido:** [`src/lib/refeps/persistir.ts`](../../src/lib/refeps/persistir.ts) — misma semántica que el gate #246: ✓ (encontrado+activo → `refeps_validado=true` + jurisdicciones derivadas) y ✗ (no figura/inactiva → `false`) son definitivos; error de SISTEMA no toca `refeps_validado` (evita el falso negativo pegado, caso Ana Belén).

**Panel admin (card pendiente):** `BloqueRefeps` con estado ternario único (`estadoRefeps`) que leen card Y diálogo de aprobar (nunca cuentan historias distintas — gate Sofía):
- 🟢 "Verificado en REFEPS — matrícula activa · Habilitado para atender en: X, Y" (si quedó sin jurisdicciones derivadas, avisa que va a aparecer para todas las provincias — fail-open de la clínica).
- 🟡 "No verificado — no figura / INACTIVA / sin matrícula. No se puede aprobar así." + pista del DNI mal cargado + "Re-verificar" + link "Ver en SISA" (el link viejo de la fila de acciones se eliminó).
- ⚪ "Verificación pendiente — se reintenta solo (10 min la primera hora, después cada 6 h)" + botón manual (único caso donde existe).

**Mail de bienvenida** ([email.ts](../../src/lib/email.ts)): bloque "Dónde estás habilitado a atender" con las jurisdicciones REFEPS y encuadre de alcance maximizado (copy aprobado por Diego: "Cualquier persona que se encuentre en esas jurisdicciones puede atenderse con vos… sin límite de distancia"). Sin jurisdicciones → el bloque no se muestra.

## Hallazgo de seguridad corregido (Roberto)

El endpoint manual `/api/admin/medicos/refeps` marcaba `refeps_validado=true` con solo `encontrado`, **sin chequear `activo`** (pre-existente): una matrícula INACTIVA podía quedar verde y el gate de aprobar la dejaba pasar por el early-return. Corregido a `encontrado && activo` — mismo criterio que el gate duro del 10/06.

## Gates
- **Roberto:** APROBADO. Verificado contra prod: registro irrompible, semántica idéntica a #246 (13 estados simulados), cron idempotente sin loop pegado, mail sin trampa de grants, races sin estado corrupto. 1 IMPORTANTE (endpoint manual, arriba) + 4 menores — todos aplicados.
- **Sofía:** fiel al pedido. 1 bloqueante (diálogo binario vs card ternaria) + pulidos (link SISA ruidoso, pista DNI, aviso fail-open, ícono Clock) — todos aplicados.

## Deuda registrada (menor, no urgente)
- El gate de aprobar y el endpoint manual pisan el tracking `auto_intentos` al escribir `refeps_data` (solo causa reintentos rápidos de más).
- Hardening `CRON_SECRET` fail-closed en los otros 9 crons (este ya lo tiene).
- Mensaje ámbar impreciso si el DNI se edita a un valor inválido post-registro.
