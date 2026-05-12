# Diagnóstico — Tests Playwright rotos (TEST 04 y TEST 05)

**Fecha:** 2026-05-12

---

## Pregunta 1: ¿Dónde viven los tests?

- `tests/e2e/medico/login.spec.ts` — TEST 04
- `tests/e2e/medico/dashboard.spec.ts` — TEST 05
- `tests/helpers/auth.ts` — helper `loginWithEmail` (usado por ambos)
- `tests/fixtures/cuentas-prueba.ts` — credenciales hardcodeadas

---

## Pregunta 2: ¿Qué hacen paso a paso?

### TEST 04 — Login médico email/password
1. Navega a `/auth/login`
2. Llena campo "Email" con `medico.test@docto.com.ar`
3. Llena campo "Contraseña" con `DoctoTest2026!`
4. Click en botón "Ingresar"
5. **Espera que la URL contenga `/dashboard`** (timeout 15s) ← FALLA ACÁ
6. Verifica que el body no contenga la palabra "error"

### TEST 05 — Dashboard médico carga sin errores
1. Ejecuta `loginWithEmail` (mismos pasos 1-5 de TEST 04) ← FALLA ACÁ
2. Verifica que la URL contenga `/dashboard`
3. Espera networkidle (15s)
4. Verifica que `nav` o `header` sea visible
5. Verifica que el body tenga >50 caracteres
6. Verifica que no haya errores en consola (excepto favicon/third-party/net::ERR)

---

## Pregunta 3: ¿Qué credenciales usan?

Hardcodeadas en `tests/fixtures/cuentas-prueba.ts`:
- Email: `medico.test@docto.com.ar`
- Password: `DoctoTest2026!`
- User ID (auth): `05d6af2c-bcf9-48c5-a423-40648cc4d7d2`
- Médico ID: `f52f79f9-0526-4b6a-a4c0-837f26fe7e19`

Verificado en DB:
- ✅ Usuario existe en `auth.users`
- ✅ `email_confirmed_at` está seteado
- ✅ `encrypted_password` existe (has_password = true)
- ✅ Médico asociado con `es_cuenta_test = true`

---

## Pregunta 4: ¿En qué línea exacta hace timeout?

`tests/helpers/auth.ts:8`:
```typescript
await page.waitForURL("**/dashboard**", { timeout: 15000 });
```

Después de hacer click en "Ingresar", espera hasta 15 segundos a que la URL cambie a algo que contenga `/dashboard`. El timeout indica que el browser sigue en `/auth/login` cuando se agotan los 15 segundos.

---

## Pregunta 5: ¿Cuándo fue el último CI verde?

| Fecha | Branch | Resultado | Tests |
|-------|--------|-----------|-------|
| 2026-05-12 08:34 | main (cron) | FAILURE | 8 pass, 2 fail |
| 2026-05-11 12:35 | priceless-jemison (PR) | SUCCESS | 10 pass |
| 2026-05-11 09:33 | main (cron) | FAILURE* | 10 pass, git error |
| 2026-05-10 22:50 | priceless-jemison (PR) | SUCCESS | 10 pass |

**Hallazgo clave:** Los tests son **flaky** — a veces pasan, a veces no. El May 11 cron pasó los 10 tests pero el job falló por un error de git en upload-artifact. El May 12 cron falló genuinamente en TEST 04 y TEST 05.

Los runs de main marcados como "failure" tienen dos causas distintas:
1. Tests genuinamente fallidos (timeout en login) — intermitente
2. Error de git en upload-artifact (ajeno a los tests)

---

## Pregunta 6: ¿Qué cambió que pudo romperlos?

**No es un cambio de código el problema.** Los tests son flaky por diseño:

### Causa raíz: race condition en el flujo de login

El flujo es:
1. Playwright hace click en "Ingresar"
2. La app ejecuta `supabase.auth.signInWithPassword()` (API call a Supabase Auth)
3. Si éxito: `window.location.href = "/dashboard"` (full page navigation)
4. El servidor procesa `/dashboard` (server component):
   - `supabase.auth.getUser()` valida el JWT vía cookies
   - Si no hay user → `redirect("/auth/login")` (loop!)
5. Playwright espera que la URL contenga `/dashboard`

### Por qué falla intermitentemente:

- **Latencia de Supabase Auth**: `signInWithPassword()` llama a la API de Supabase. Desde GitHub Actions (US) a Supabase (puede estar en otra región), la latencia varía. Si es lento, el timeout de 15s puede no alcanzar.
- **Cookie propagation gap**: Supabase SSR guarda tokens en cookies. El `window.location.href` causa una navegación completa. Si las cookies no se persisten antes de que el browser inicie la navegación, el servidor no las ve → redirige a login.
- **Cold start de Vercel**: A las 3 AM (hora del cron), la función serverless de `/dashboard` puede estar cold. Startup de ~2-5 segundos extra.
- **Timeout ajustado**: 15 segundos es tight para: API call a Supabase Auth + cookie set + full page navigation + Vercel cold start + server-side auth validation.

### Evidencia:
- Los tests de pacientes (onboarding, clínica virtual) pasan consistentemente porque no dependen de este flujo de login con password.
- TEST 03 (Login Google OAuth — botón visible) pasa porque solo verifica que el botón exista, no ejecuta el login completo.

---

## Hipótesis y fix propuesto

### Hipótesis
Los 15 segundos de timeout no alcanzan consistentemente para cubrir la cadena completa: Supabase Auth API call → cookie persistence → full page navigation → Vercel cold start → server-side auth validation → render.

### Fix propuesto (simple, <30 min)

1. **Aumentar timeout de `waitForURL` a 30 segundos** en el helper `loginWithEmail`
2. **Agregar `waitForLoadState("networkidle")` antes del `waitForURL`** para dar tiempo a que la cookie se setee
3. **Usar `waitForURL` con `waitUntil: "networkidle"`** en vez del default `"load"` para esperar a que la página esté completamente cargada

```typescript
export async function loginWithEmail(page: Page, email: string, password: string) {
  await page.goto("/auth/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.waitForURL("**/dashboard**", { timeout: 30000, waitUntil: "networkidle" });
}
```

Esto le da el doble de tiempo y espera a que la red esté idle (cookies seteadas, API calls completados) antes de considerar la navegación exitosa.

**Riesgo del fix:** Si el login genuinamente falla (password incorrecta, usuario no existe), el test esperará 30 segundos en vez de 15 antes de fallar. Esto es aceptable — mejor un test lento que un false negative.
