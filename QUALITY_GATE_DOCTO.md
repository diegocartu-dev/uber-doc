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
