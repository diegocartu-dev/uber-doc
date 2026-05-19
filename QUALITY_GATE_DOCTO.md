# Quality Gate — Docto
## Reglas operativas y políticas inamovibles

---

## POLÍTICAS RLS INAMOVIBLES

### UPDATE en tabla `pacientes` — NUNCA SACAR

```sql
CREATE POLICY "Pacientes pueden actualizar su propio registro"
ON public.pacientes FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
```

**Por qué existe:** El 25/04/2026 el usuario Juan Barril quedó bloqueado en el onboarding con "Ocurrió un error." porque la tabla `pacientes` tenía políticas de SELECT e INSERT pero no de UPDATE. El `upsert` con `onConflict: "user_id"` necesita UPDATE cuando la fila ya existe (usuarios Google OAuth o que intentaron antes). Sin esta política, Supabase devuelve error genérico y el usuario no puede completar su perfil.

**Quién se ve afectado si se saca:** Todo usuario que ya tenga una fila parcial en `pacientes` (creada por Google OAuth en el callback, o por un intento previo de onboarding) queda bloqueado permanentemente.

**Test que lo cubre:** TEST 06 — `tests/e2e/paciente/onboarding.spec.ts`

---

## TESTS ETAPA 1 (bloquean merge a main)

| Test | Qué verifica |
|---|---|
| TEST 01 | Onboarding: campos vacíos → errores inline, no llega al servidor |
| TEST 02 | Onboarding: flujo completo exitoso → redirect sin error |
| TEST 03 | Login: botón Google OAuth visible y funcional |
| TEST 04 | Login médico: email/password → llega al dashboard |
| TEST 05 | Dashboard médico: carga sin errores de consola |
| TEST 06 | Onboarding: usuario con fila parcial completa perfil (regresión RLS UPDATE) |

---

## REGLA DE SEVERIDAD PARA ALERTAS

| Nivel | Áreas | Cuándo se envía email |
|---|---|---|
| CRÍTICO | Onboarding, login, pagos, video, dashboard | Inmediato |
| MEDIO | Emails, push, cancelaciones | A las 7AM |
| BAJO | Performance, detalles visuales | Resumen semanal |

Si todo pasa → no se envía email. Solo log interno.

---

## Prueba E2E MP — 19/05/2026 (Diego, manual en producción)

### Contexto
Diego ejecutó manualmente el flujo completo MP en docto.com.ar desde navegador incógnito (Mac) + iPhone real, con cuentas de test, para validar el Sprint A MP cerrado el 18/05.

### Setup
- Médico: medico.test@docto.com.ar / DoctoTest2026! (Chrome incógnito Mac)
- Paciente: paciente.test1@docto.com.ar / DoctoTest2026! (Safari privado iPhone)
- MP seller: test_user_3273297353879416503@testuser.com / q6SwNPcHOn
- MP user_id whitelist: 3410484183
- Tarjeta test: 5031 7557 3453 0604 / 11/30 / CVV 123 / titular APRO

### Resultados por paso

| Paso | Estado | Detalle |
|------|--------|---------|
| Login médico Docto | OK | Dashboard carga, banner "Conectá MP" visible |
| Clic "Conectar ahora" | OK | Redirect a auth.mercadopago.com |
| Selector país MP | OK | Argentina, Confirmar |
| Login MP seller test | OK | Email + password aceptados |
| Autorización OAuth | OK | Permisos aceptados |
| Callback /api/mp/oauth/callback | OK | Redirect a /medico/perfil?tab=cobros |
| Persistencia BD | OK | mp_user_id 3410484183 guardado, próx renovación 15/11/2026 |
| UI conectada | OK | Banner verde "Tu cuenta MP está conectada" |
| Login paciente Docto (mobile) | OK | Acceso normal |
| Selección turno + ir a pagar | OK | Checkout MP genera preference, $500 |
| Popup iOS "abrir app MP" | Esperado | Diego canceló correctamente para mantener flujo web |
| Selección método "Tarjeta" | OK | Formulario carga |
| Carga datos tarjeta APRO | OK | Validaciones MP pasaron |
| Pantalla "Revisá tu pago" | OK | Tarjeta, cuotas, email, botón Pagar visibles |
| Clic en botón Pagar | FALLÓ | "Algo salió mal. Una de las partes es de prueba" |

### Diagnóstico del fallo
NO es un bug. MP detectó mezcla incompatible:
- Médico: cuenta TESTUSER (test)
- Paciente: tarjeta real desde dispositivo real (no logueado como TESTUSER buyer)

MP bloquea por diseño la mezcla test+real. Es comportamiento esperado. La whitelist MP_TEST_SELLERS_WHITELIST funcionó correctamente (permitió el OAuth seller). El checkout, formulario y validaciones funcionaron.

### Lo que SÍ quedó validado
- OAuth seller con whitelist live_mode
- Generación de preference de pago
- Render correcto del checkout MP con título, precio, item
- Redirección Docto → MP → Docto
- Persistencia BD del mp_user_id y próx_renovacion
- UI dashboard refleja estado conectado correctamente
- Validaciones MP funcionan (rechazo controlado, no crasheo)

### Lo que NO se pudo validar en este flujo
- Pago aprobado end-to-end
- Webhook MP llegando a /api/pago/webhook
- Transición auto pagada→en_curso
- Application fee (split marketplace)
- Acreditación a cuenta seller
- Email comprobante a paciente

### Decisión
Validación de pago aprobado real queda pendiente para Friends & Family testing post Sprint B y C (no se hace con médico beta real).

### Sin acción requerida
No hay bug que corregir. Esta documentación es para referencia futura si algo se rompe — sirve como baseline de "qué funcionaba el 19/05".
