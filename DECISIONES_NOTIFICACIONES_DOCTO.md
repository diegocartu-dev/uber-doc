# Notificaciones — Docto
## Decisiones de producto, diseño y reglas técnicas
### Documento oficial — No rediscutir

---

## 1. ARQUITECTURA DE 3 CAPAS

El sistema de notificaciones de Docto funciona con tres capas complementarias. Cada una tiene un rol específico y no se superponen.

```
CAPA 1 — Polling interno (ya existe)
↓ Mientras el usuario está dentro de Docto
Globito rojo en navbar + badges + contadores en tiempo real
Polling cada 5 segundos — sin Realtime Supabase
Sin costo adicional, sin configuración nueva

CAPA 2 — Web Push (sprint de notificaciones)
↓ Cuando el usuario NO está en Docto
Alerta nativa en el celular/browser
Suena aunque estén en Instagram o con pantalla bloqueada
Opt-in explícito — el usuario activa el permiso
Tecnología: Service Worker + claves VAPID

CAPA 3 — Email fallback (Resend — ya decidido)
↓ Cuando no hay push activo o el evento lo requiere siempre
Recordatorios de turno al paciente
Cancelaciones siempre
Fallback si el médico lleva 30min sin actividad con mensajes sin leer
```

---

## 2. WEB PUSH — REGLAS DE ACTIVACIÓN

### 2.1 El médico

**Cuándo activa:** Durante el onboarding al habilitarse en Docto.
El permiso se solicita como parte del proceso de configuración inicial — no en frío, en el momento donde el médico tiene máxima motivación para activarlo.

**Mensaje de onboarding:**
> *"Solo te notificamos cuando tenés un paciente esperando y estás disponible. Si estás en consulta, no te interrumpimos."*

Esta promesa es inamovible — el médico confía en que no va a ser bombardeado.

**Eventos que disparan push al médico:**

| Evento | Condición | Push |
|---|---|---|
| Paciente entró a sala de espera | Médico NO está `en_curso` | ✅ Sí |
| Paciente entró a sala de espera | Médico está `en_curso` | ❌ No — ya está atendiendo |
| Nova completó una acción solicitada | Siempre | ✅ Sí |
| Nuevo turno reservado | Siempre | ✅ Sí |
| Turno cancelado por paciente | Siempre | ✅ Sí |

**Regla crítica:** Si el médico está en estado `en_curso` (videollamada activa), **nunca** se le envía push. El paciente nuevo simplemente ve su posición en la cola y espera.

### 2.2 El paciente

**Cuándo activa:** En el momento de reservar un turno o solicitar una consulta inmediata (CI). Es el momento de mayor motivación — el paciente acaba de comprometerse con una consulta y quiere estar conectado.

**El permiso se pide una sola vez.** Si el paciente ya lo activó antes, no se vuelve a pedir.

**Eventos que disparan push al paciente:**

| Evento | Push |
|---|---|
| Médico inició la consulta — "Tu médico está listo, ingresá ahora" | ✅ Sí |
| Turno cancelado por el médico | ✅ Sí |
| Documentos disponibles post-consulta | ✅ Sí |
| Recordatorio 10 minutos antes del turno | ✅ Sí (complementa el email) |

---

## 3. POLLING INTERNO — LO QUE YA EXISTE

No requiere sprint nuevo. Es la capa base que funciona mientras el usuario tiene Docto abierto.

**Componentes:**
- Globito rojo en el ícono de sobre (navbar) cuando hay mensajes sin leer — tanto médico como paciente
- Badge con número de pacientes en sala de espera en el dashboard del médico
- Contador de posición en cola en la sala de espera del paciente
- Actualización de estado del turno (pagado → en_espera → en_curso → completado)

**Regla técnica:** Todo con polling de 5 segundos vía API routes internas con `credentials: 'include'`. **Nunca Supabase Realtime.**

---

## 4. EMAIL FALLBACK — REGLAS

El email es el canal de último recurso para el médico y el canal principal externo para el paciente. Ya está definido en `DECISIONES_PRODUCTO_DOCTO.md` — se resume acá para tener todo junto.

**El médico recibe email fallback solo si:**
- Lleva más de 30 minutos sin actividad en `/medico/*`
- Y tiene mensajes sin leer en mensajería interna

El email dice: *"Tenés mensajes sin leer en Docto"* + link al dashboard. **Nunca incluye el contenido del mensaje.**

**El paciente recibe email siempre para:**
- Turno confirmado (+ .ics)
- Recordatorio 24hs antes
- Recordatorio 10 minutos antes
- Cancelación (+ .ics + link reprogramar)
- Documentos disponibles

---

## 5. DISEÑO UX — ACTIVACIÓN DEL PUSH

### 5.1 Médico — onboarding

El botón de activación aparece como parte del setup inicial del médico en Docto. No es un popup intrusivo — es un paso del flujo de configuración.

**Texto del botón:** "Activar notificaciones"
**Subtexto:** *"Solo te avisamos cuando tenés un paciente esperando y estás libre."*

Si Safari o el browser no soporta push → se oculta el botón sin mostrar error.
Si el médico rechaza el permiso → no se insiste, se registra como `push_rechazado` en su perfil.

**Importante — Safari iOS:**
El permiso NUNCA se pide automáticamente al cargar la página. Solo desde un click del usuario (restricción del browser). El botón es siempre explícito.

### 5.2 Paciente — momento de reserva

Después de confirmar el pago del turno o solicitar CI, aparece:

> *"¿Querés que te avisemos cuando tu médico esté listo?"*
> [Activar notificaciones] [Ahora no]

Si ya tiene el permiso activado → no se muestra, se suscribe automáticamente.
Si rechaza → no se insiste en esa sesión.

### 5.3 Textos de las notificaciones push

**Al médico — paciente esperando:**
> 🟢 Docto — *"[Nombre paciente] está esperando tu consulta"*

**Al paciente — médico listo:**
> 🟢 Docto — *"El Dr. [nombre] está listo. Ingresá ahora a tu consulta."*

**Al paciente — turno cancelado:**
> 🔴 Docto — *"Tu turno del [fecha] fue cancelado. Podés reprogramar."*

**Al paciente — recordatorio 10 min:**
> 🟡 Docto — *"Tu consulta con Dr. [nombre] empieza en 10 minutos."*

**Al paciente — documentos listos:**
> ✅ Docto — *"Tus documentos de la consulta ya están disponibles."*

---

## 6. TÉCNICO — IMPLEMENTACIÓN WEB PUSH

### 6.1 Stack

- **Service Worker** registrado en `/public/sw.js`
- **Claves VAPID** generadas una vez, guardadas en Vercel como variables de entorno:
  - `VAPID_PUBLIC_KEY`
  - `VAPID_PRIVATE_KEY`
- **Suscripciones** guardadas en Supabase — nueva tabla `push_subscriptions`
- **Envío** desde server (Next.js API route) usando librería `web-push`

### 6.2 Tabla push_subscriptions

```sql
CREATE TABLE push_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rol TEXT CHECK (rol IN ('medico', 'paciente')),
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  activa BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS: cada usuario solo ve y modifica sus propias suscripciones
```

### 6.3 Endpoints API

```
POST /api/push/suscribir      → guarda suscripción del usuario
POST /api/push/desuscribir    → marca activa = false
POST /api/push/enviar         → server-only, envía push a un user_id
```

### 6.4 Lógica de envío — regla en_curso

Antes de enviar push al médico por paciente en sala de espera:

```
1. Verificar estado del médico en DB
2. Si tiene consulta con estado 'en_curso' → NO enviar push
3. Si está libre → enviar push
4. Si no tiene suscripción activa → silencio (el polling lo mostrará cuando vuelva)
```

### 6.5 Compatibilidad

| Browser/OS | Soporte |
|---|---|
| Chrome Android | ✅ Completo |
| Chrome Desktop | ✅ Completo |
| Safari iOS 16.4+ | ✅ Requiere agregar a pantalla de inicio (PWA) |
| Safari iOS < 16.4 | ❌ No soportado — usar email fallback |
| Firefox | ✅ Completo |
| Samsung Internet | ✅ Completo |

**Para iOS Safari:** el push solo funciona si el usuario agregó Docto a su pantalla de inicio como PWA. Hay que informarlo claramente en el onboarding del médico.

---

## 7. REGLAS INAMOVIBLES

1. **Nunca pedir permiso de push automáticamente** — siempre desde un click del usuario.
2. **Nunca notificar al médico si está `en_curso`** — no se interrumpe una consulta activa.
3. **El médico no recibe emails** — todo por mensajería interna + push.
4. **Push al paciente solo en el momento de reserva/CI** — no en frío.
5. **Polling de 5 segundos siempre como base** — el push es complemento, no reemplazo.
6. **Nunca incluir datos clínicos en notificaciones** — solo datos logísticos.
7. **Si el push falla → silencio** — no mostrar errores al usuario, el polling cubre.
8. **Una sola suscripción activa por usuario** — si cambia de dispositivo, reemplazar.

---

*Documento generado el 16/04/2026. No requiere rediscusión — decisiones cerradas.*
