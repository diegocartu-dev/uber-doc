# Diagnóstico — Manejo de sesiones de médicos en CI

**Fecha:** 2026-05-12
**Contexto:** Riesgo potencial de sesión expirada para médicos esperando pacientes en Consulta Inmediata

---

## Pregunta 1: Duración del JWT access token

**Respuesta: 3600 segundos (1 hora) — default de Supabase.**

No hay configuración custom de JWT expiry en el código ni en archivos de config del proyecto. Supabase usa 3600s como default. Para confirmar el valor exacto configurado, habría que verlo en Supabase Dashboard → Authentication → Configuration → JWT expiry.

---

## Pregunta 2: Duración del refresh token

**Respuesta: No configurado explícitamente — default de Supabase.**

El default de Supabase para refresh tokens es muy largo (típicamente no expiran o tienen TTL de meses). El refresh token se almacena en cookies del browser vía `@supabase/ssr`. No hay configuración custom en el proyecto.

---

## Pregunta 3: ¿autoRefreshToken está habilitado?

**Respuesta: SÍ — por default del SDK.**

El cliente browser (`src/lib/supabase/client.ts`) usa `createBrowserClient` de `@supabase/ssr` sin pasar opciones adicionales:

```typescript
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

`createBrowserClient` de `@supabase/ssr` v0.9.0 hereda los defaults de `@supabase/supabase-js` v2.100.0, donde `autoRefreshToken` es `true` por defecto. El SDK agenda un refresh automático del access token antes de que expire.

**Sin embargo**, hay un matiz importante: el auto-refresh del SDK funciona con un timer JavaScript interno. Si el browser/tab entra en estado de bajo consumo (throttled background tab), el timer puede no ejecutarse a tiempo.

---

## Pregunta 4: ¿Se escucha onAuthStateChange?

**Respuesta: NO — no hay listeners de auth state change en todo el codebase.**

Búsqueda exhaustiva: cero ocurrencias de `onAuthStateChange`, `TOKEN_REFRESHED`, ni `SIGNED_OUT` en ningún archivo del proyecto. El frontend no reacciona a cambios de estado de autenticación.

**Implicación:** Si el token expira y el refresh falla (por cualquier motivo), el frontend no tiene forma de saber que perdió la sesión. No hay redirect a login, no hay modal de "sesión expirada", no hay re-intentos. El polling simplemente empieza a recibir 401s que se tragan silenciosamente.

---

## Pregunta 5: ¿Hay heartbeat para mantener la sesión activa?

**Respuesta: SÍ, implícitamente — el polling del dashboard ES el heartbeat.**

El `DashboardMedicoProvider.tsx` hace `fetch("/api/medico/dashboard-estado")` cada 5 segundos con `credentials: "include"`. Cada request pasa por el middleware de Next.js que ejecuta `updateSession()`:

```typescript
// middleware.ts
const response = await updateSession(request);

// lib/supabase/middleware.ts
const { data: { user } } = await supabase.auth.getUser();
```

`auth.getUser()` en el middleware server-side valida el JWT y, si está a punto de expirar, refresca la sesión actualizando las cookies en la response. El matcher del middleware incluye rutas `/api/*`:

```typescript
matcher: ["/((?!_next/static|_next/image|favicon.ico|auth/callback|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"]
```

**Esto significa que cada poll (cada 5s) refresca la sesión server-side.** Mientras el polling funcione, la sesión no debería expirar.

**No hay heartbeat explícito separado.** El polling cumple esa función colateralmente.

---

## Pregunta 6: ¿Cómo detecta el dashboard nuevos pacientes?

**Respuesta: Polling cada 5s + Realtime como trigger para poll inmediato.**

### Polling (principal)
- Endpoint: `GET /api/medico/dashboard-estado`
- Intervalo: 5000ms (5 segundos)
- Retorna: consultas_pendientes, consultas_en_curso, turnos_espera, disponible, turnos_activos_hoy
- Auth: 401 si no autenticado, 403 si no es médico

### Realtime (acelerador)
- Canal Supabase escuchando `consultas` y `turnos`
- Sin filtro en el canal (medico_id no es PK)
- Cuando detecta cambio, dispara `poll()` inmediatamente en vez de esperar al siguiente tick

### ¿Qué pasa si el JWT expiró?
Si el JWT expira y el refresh falla:
1. El poll a `/api/medico/dashboard-estado` devuelve 401
2. El código hace `if (!res.ok) return;` — sale silenciosamente
3. Los datos del dashboard se congelan en el último estado conocido
4. El médico sigue viéndose como "Disponible" en la UI (estado React no cambia)
5. Nuevos pacientes no aparecen (el poll no actualiza)
6. El Realtime channel también falla (necesita JWT válido para suscribirse)

**Riesgo concreto:** Un médico con sesión expirada sigue "Disponible" en la base de datos. Pacientes nuevos se asignan, pagan, y entran a sala de espera. El médico nunca ve la notificación porque el poll falla silenciosamente.

---

## Pregunta 7: Comportamiento con sesión expirada

**Respuesta: La UI queda congelada silenciosamente. No hay feedback al médico.**

Flujo cuando la sesión expira:

1. **Polling silently fails:** `catch {}` en el poll handler traga errores de red. `if (!res.ok) return;` traga 401s. No hay log, no hay alerta, no hay counter de errores consecutivos.

2. **Dashboard se congela:** Los datos React (pendientes, en curso, disponible) mantienen su último valor. El médico ve exactamente lo mismo que hace 5 minutos — solo que ya no se actualiza.

3. **No hay redirect a login:** No existe `onAuthStateChange` ni detección de 401 en el frontend. El médico puede estar mirando un dashboard congelado durante horas sin saberlo.

4. **Si hace una acción manual** (aceptar consulta, cambiar disponibilidad), la server action fallará. Las server actions usan `createClient()` server-side que valida auth. El error probablemente se traga o muestra un error genérico, pero NO redirige a login.

5. **El médico solo se entera si:** navega a otra página (middleware detecta sesión inválida y redirige a login), o recarga la página manualmente.

---

## Pregunta 8: ¿Hay reportes de errores 401 en CI?

**Respuesta: No hay infraestructura de error reporting configurada.**

- No hay Sentry, LogRocket, ni similar en el proyecto
- Los errores de polling se tragan con `catch {}` — no llegan a console.error
- Los 401 se manejan con `if (!res.ok) return;` — no se loguean
- No hay endpoint de error reporting propio
- Los logs de Vercel capturarían los 401 server-side en `/api/medico/dashboard-estado`, pero solo si alguien los revisa activamente

**No hay forma de saber históricamente si esto ya pasó.** Si algún médico tuvo sesión expirada, no hay registro.

---

## Resumen de riesgos

| Factor | Estado | Riesgo |
|--------|--------|--------|
| autoRefreshToken | ON (default SDK) | BAJO — el SDK intenta refrescar |
| Polling como heartbeat | Cada 5s, refresca sesión server-side | BAJO — mientras funcione |
| onAuthStateChange | NO existe | ALTO — sin detección de pérdida de sesión |
| Error handling en poll | `catch {}` silencioso | ALTO — sesión muerta = dashboard congelado |
| Redirect a login | Solo vía middleware en navegación | ALTO — si no navega, nunca se entera |
| Background tab throttling | No mitigado | MEDIO — Chrome throttlea timers a 1/min |
| Error reporting | No existe | ALTO — no sabemos si ya pasó |

### Escenario más probable de fallo

1. Médico deja tab abierta horas en dashboard CI
2. Browser throttlea la tab (background o power saving)
3. Timers del SDK se retrasan, token expira sin refresh
4. Polling empieza a recibir 401 → se traga silenciosamente
5. Médico sigue "Disponible" en DB
6. Paciente paga, entra a sala de espera
7. Médico no ve notificación → paciente abandonado

### Mitigación natural existente

El polling cada 5 segundos actúa como heartbeat y refresca la sesión server-side vía middleware. **Mientras la tab esté en foreground y el polling funcione, la sesión se renueva indefinidamente.** El riesgo real está en:
- Tab en background prolongado (Chrome throttle)
- Pérdida de conectividad temporal
- Laptop entra en sleep y se reanuda
