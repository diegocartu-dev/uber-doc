# Bandeja de correo — canal Mail en el panel admin (30/07/2026)

Correo tradicional adentro de Docto: `contacto@docto.com.ar` y
`soporte@docto.com.ar` se **reciben, leen y responden en `/admin/bandeja`**.
Los mails personales de Diego quedaron fuera del circuito (decisión 30/07).

## Arquitectura

```
mail a *@docto.com.ar
  → MX raíz: inbound-smtp.sa-east-1.amazonaws.com (prio 9, Resend Inbound)
  → webhook POST /api/correo/entrante?clave=<CORREO_WEBHOOK_CLAVE>
  → pide cuerpo completo a GET api.resend.com/emails/receiving/{id}
  → INSERT en tabla `correos` (idempotente por resend_id)
  → aviso corto a diegocartu@gmail.com con link a la Bandeja
```

- Envío: `src/lib/correo.ts` — from `Docto <contacto@|soporte@docto.com.ar>`,
  reply-to igual, firma sobria; TODO envío se registra (aun fallido → chip
  "NO SALIÓ"). Responder desde el detalle sale automáticamente DESDE la
  dirección a la que llegó el original y lo marca atendido.
- Pantallas: `/admin/bandeja` (Recibidos con contador sin-leer / Enviados /
  Redactar con selector de remitente) y `/admin/bandeja/[id]` (abrir marca
  leído; HTML recibido JAMÁS se renderiza — texto plano o desetiquetado).
- Tabla `correos`: RLS activado SIN políticas (solo service role).

## Cambios de infraestructura (30/07)

- **ImprovMX eliminado**: se borraron mx1/mx2.improvmx.com del DNS (Vercel,
  OK explícito de Diego). `soporte@` ya NO reenvía al Gmail personal. Los
  códigos de recuperación del Instagram (login soporte@) entran a la Bandeja.
- Todo el correo a **cualquier** dirección @docto.com.ar cae en la Bandeja
  (catch-all de facto) — nada se pierde.
- **RESEND_API_KEY rotada** a "docto-server-bandeja" (full access): la vieja
  "Onboarding" era solo-envío y el webhook no podía leer cuerpos. Actualizada
  en Vercel prod (deploy fresco hecho) + .env.local. La key vieja sigue
  activa en Resend (revocable cuando se quiera).
- Cuenta Resend de Docto: **diegocartu@gmail.com**, equipo "diegocartu"
  (NO confundir con la @me.com de Validdar).

## Verificación E2E (30/07)

- Webhook: clave mala → 401; clave ok + type falso → ignorado. ✓
- `dig MX docto.com.ar` → inbound-smtp.sa-east-1.amazonaws.com (CF y Google). ✓
- Mail a contacto@ → en tabla 15:06. ✓ (sin cuerpo — key vieja; motivó la rotación)
- Mail a soporte@ → en tabla 15:12 **con cuerpo completo**. ✓

## Operación

- Prospección: pocos mails por día y personalizados — el volumen masivo
  quema la reputación del dominio (consejo transmitido de Validdar).
- El aviso por mail a Diego es apagable (en `src/lib/correo.ts`).
