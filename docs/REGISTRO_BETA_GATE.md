# Beta Gate — Bloqueo de registro (FUENTE DE VERDAD)

> **Por qué existe este doc:** Este mecanismo se malinterpretó ~10 veces. La causa
> raíz era leer la lógica al revés y verificar contra la *config* en vez de contra
> el *sitio en vivo*. Este documento es la fuente de verdad. Si algo contradice esto,
> verificar empíricamente con los comandos de abajo — NO confiar en memoria ni en `.env.local`.
>
> **Última verificación contra producción real: 2026-06-07.** Resultado al pie.

---

## TL;DR (leer esto primero)

- El gate vive en **`src/middleware.ts`** → función `passesBetaGuard`.
- Lo controla **una sola env var: `BETA_PASSWORD`** (en Vercel, scope `production`).
- La cookie que desbloquea se llama **`docto_beta_access`** (constante `BETA_COOKIE`).
- Hoy `BETA_PASSWORD = DoctoTest2026!` → **beta cerrada**: el sitio se puede navegar,
  pero **registro de paciente y de médico** piden la contraseña.

### ⚠️ LA TRAMPA QUE NOS HIZO PERDER HORAS

```js
const password = process.env.BETA_PASSWORD;
if (!password) return false;   // ← sin password: bloquea TODA ruta, no solo registro
```

**`BETA_PASSWORD` vacía/sin setear NO significa "sitio abierto". Significa SITIO ENTERO CAÍDO.**

Cuando no hay password, `passesBetaGuard` devuelve `false` para *cualquier* ruta → todo
redirige a `/beta-access` → y `/beta-access` tampoco pasa el guard → **loop infinito de
redirección** (`ERR_TOO_MANY_REDIRECTS`). El sitio queda oscuro, incluida la propia
pantalla de la contraseña.

> Si Diego alguna vez "no se pudo registrar" o "no cargaba", lo más probable es que
> `BETA_PASSWORD` estuviera vacía en el deploy vivo. La solución NO es tocar el código:
> es **setear `BETA_PASSWORD` y hacer un deploy fresco** (ver abajo).

---

## Los 3 estados reales (no hay más)

| Estado | `BETA_PASSWORD` | Qué pasa | Cuándo usarlo |
|---|---|---|---|
| **Caído (peligro)** | vacía / sin setear | **TODO el sitio** redirige a `/beta-access` en loop. Nadie entra a nada. | Nunca en prod (salvo querer apagar el sitio). |
| **Beta cerrada** (actual) | seteada (`DoctoTest2026!`) | Sitio navegable. Solo `/auth/register` y `/auth/registro-medico` piden la cookie con esa contraseña. | F&F / beta cerrada. **Estado actual.** |
| **Abierto al mundo** | seteada | Requiere **cambio de código**: sacar las rutas de `BETA_PROTECTED` en `middleware.ts` (manteniendo `BETA_PASSWORD` seteada para no apagar el sitio). | Lanzamiento público. |

**Importante:** no existe forma de "abrir el registro a todos" solo con env vars.
Para lanzar al mundo hay que editar `BETA_PROTECTED` en el código. Borrar `BETA_PASSWORD`
**NO** abre nada — apaga todo.

---

## Qué rutas protege exactamente

Solo estas dos (y sus subrutas), definidas en `BETA_PROTECTED`:

```js
const BETA_PROTECTED = [
  "/auth/register",         // registro paciente
  "/auth/registro-medico",  // registro médico
];
```

El resto del sitio (home, login, /admin, etc.) **no** está gateado cuando `BETA_PASSWORD`
está seteada. Login de cuentas ya existentes funciona normal.

La cookie `docto_beta_access` la setea la página `/beta-access` cuando el usuario escribe
la contraseña correcta. A partir de ahí ese browser puede registrarse.

---

## Cómo cambiar la contraseña (procedimiento exacto)

```bash
# 1. Quitar la actual y poner la nueva (scope production)
vercel env rm BETA_PASSWORD production --yes
printf 'NUEVA_PASSWORD' | vercel env add BETA_PASSWORD production

# 2. DEPLOY FRESCO — imprescindible (ver "La otra trampa" abajo)
vercel --prod        # NO uses `vercel redeploy`

# 3. Verificar contra el sitio vivo (no contra la config)
#    ver sección "Verificación empírica"
```

### ⚠️ LA OTRA TRAMPA: `vercel redeploy` NO toma env vars nuevas

`vercel redeploy <url>` **reusa el snapshot viejo de env vars** del deploy original.
Si cambiás `BETA_PASSWORD` (o cualquier env var) y hacés `redeploy`, **el cambio NO se
activa** — la config dice una cosa y el sitio vivo hace otra. Eso genera exactamente la
confusión "ya lo seteé pero no funciona".

Para que un cambio de env var tome efecto hay que crear un **deploy nuevo**:
- `vercel --prod` (deploy desde local), **o**
- `git push` a `main` (auto-deploy de Vercel, toma la config actual).

Regla mental: **cambiaste una env var → deploy fresco, nunca redeploy.**

---

## Verificación empírica (la ÚNICA fuente de verdad)

Verificar SIEMPRE contra `https://www.docto.com.ar`, nunca contra `.env.local` ni contra
`vercel env ls` (eso es la config, no el sitio vivo).

```bash
# A) Sin cookie → debe ir a /beta-access (registro bloqueado)
curl -sS -o /dev/null -w "%{url_effective}\n" -L \
  "https://www.docto.com.ar/auth/register"
# esperado: https://www.docto.com.ar/beta-access?from=%2Fauth%2Fregister

# B) Con la cookie correcta → debe PASAR (queda en /auth/register)
curl -sS -o /dev/null -w "%{url_effective}\n" -L \
  --cookie "docto_beta_access=DoctoTest2026!" \
  "https://www.docto.com.ar/auth/register"
# esperado: https://www.docto.com.ar/auth/register
```

- Si A pasa SIN cookie → el gate está **abierto/roto** (revisar que `BETA_PASSWORD` esté seteada y el deploy sea fresco).
- Si B NO pasa CON la cookie → el deploy vivo tiene otra contraseña (o quedó vacía). Re-setear + deploy fresco.

---

## Resultado de la última verificación — 2026-06-07

Tras setear `BETA_PASSWORD=DoctoTest2026!` + deploy fresco (`vercel --prod`, no redeploy):

| Prueba | Resultado |
|---|---|
| `/auth/register` **sin** cookie | → `/beta-access?from=%2Fauth%2Fregister` ✅ bloqueado |
| `/auth/register` **con** `docto_beta_access=DoctoTest2026!` | → `/auth/register` ✅ pasa |
| Config (`vercel env`) vs sitio vivo | **sincronizados** ✅ |

Estado: **beta cerrada, gateada por `DoctoTest2026!`**. El par de prueba real
(médico `paancogliando@gmail.com`, paciente `pbuenoloco@gmail.com`) se registra
escribiendo esa contraseña en `/beta-access`.

> Nota: `DoctoTest2026!` es también la contraseña de las cuentas del carril de prueba
> (`tests/fixtures`). Para F&F es un gate blando, está bien. Si se quiere endurecer,
> usar una contraseña distinta para el beta gate.

---

## ⚠️ Previews de Vercel — el beta-gate también los rompe (lección 2026-06-07)

El fail-closed (`if (!password) return false`) aplica a **cualquier deployment**, no solo a producción. Los **previews de Vercel** son un scope de env vars **aparte** de Production. Si un preview no tiene `BETA_PASSWORD`:

- **TODO el preview loopea** (`ERR_TOO_MANY_REDIRECTS` en cada ruta) → el **E2E de CI muere** (todos los tests fallan en `page.goto`).
- Esto pasó en CADA PR durante el sprint del 07/06 hasta entenderlo.

### Cómo setear `BETA_PASSWORD` en un preview por-branch (lo que costó horas)
```bash
# 1. La branch TIENE que existir en el remoto PRIMERO (sino: branch_not_found)
git push -u origin <branch>
# 2. Recién ahí, setear la env para esa branch de preview
vercel env add BETA_PASSWORD preview <branch> --value 'DoctoTest2026!' --yes
# 3. Disparar un deploy FRESCO (la env solo la toma un build nuevo)
git commit --allow-empty -m "chore: redeploy con beta-gate env" && git push
```
Notas:
- El CLI (`vercel env add`) corrido con su output **capturado** (`$(...)`) sale flaky/incompleto; correrlo **directo** funciona.
- El deploy que dispara el push inicial se construye ANTES de setear la env → loopea. Por eso el commit vacío de redeploy.

### Fix permanente (recomendado, 1 click)
Setear `BETA_PASSWORD` como **"All Preview"** en el dashboard de Vercel (Settings → Environment Variables → scope *All Preview branches*). Con eso **ningún preview vuelve a loopear** y se termina el baile por-branch. El CLI no permite "all preview branches" no-interactivo (loopea), por eso es manual.

---

## Checklist anti-quilombo (pegar esto cuando se toque el gate)

1. [ ] ¿Quiero **beta cerrada** o **abrir al mundo**?
   - Beta cerrada → solo `BETA_PASSWORD` seteada. Listo.
   - Abrir al mundo → **editar `BETA_PROTECTED`** en `middleware.ts` (no basta con env vars).
2. [ ] Nunca dejar `BETA_PASSWORD` vacía en prod (= sitio caído en loop).
3. [ ] Cambié una env var → **`vercel --prod` (deploy fresco)**, jamás `vercel redeploy`.
4. [ ] Verifiqué con los **dos curls** contra `www.docto.com.ar` (sitio vivo, no config).
5. [ ] Config (`vercel env ls`) y sitio vivo **coinciden**.
