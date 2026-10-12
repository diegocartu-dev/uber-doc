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

## Buzón de Sara (12/10/2026)

Pedido de AC Ai (`AC Ai/ac-ai/docs/pedido-docto-buzon-sara.md`), decidido por
Diego: Sara —la secretaria de pacientes que atiende AC Ai— deja en el panel los
contactos que tiene que seguir una persona (una institución interesada, un
profesional que el registro todavía no admite). Diego: *"claramente no sería un
mail"*, y que **no se mezcle con soporte**: van en la pestaña **Sara** de la
Bandeja (`/admin/bandeja?buzon=sara`), con su propio contador de sin leer.

- **Misma tabla, otro origen.** `correos.origen = 'sara'` (el resto es
  `'correo'`), los datos validados en `correos.datos` y el id de Sara en
  `id_externo` (único por origen: un reintento no duplica). El día que un solo
  agente atienda soporte y Sara, unificar es sacar un filtro, no mover datos.
- **La puerta:** `POST /api/bandeja/sara`, de un solo verbo (escribir un
  contacto). Clave propia guardada como sha256 en `claves_externas`; un error de
  base responde 401, no regala acceso. Rotar = insertar una nueva y poner
  `activa = false` en la vieja. En la instancia institucional responde 404.
- **Las reglas** (`src/lib/bandeja/sara.ts`, con tests) son las del buzón de la
  demo de Sara: sin `acepta_contacto: true` no entra nada, mail con forma de
  mail, teléfono con al menos 8 dígitos, interés con tope de 300. Todo campo
  fuera del contrato se descarta. Que no viajen datos de salud lo garantiza Sara.
- **Grokbot no lo ve:** los cuatro verbos de `api/bandeja/bot` filtran
  `origen = 'correo'`. Un texto que escribió cualquiera a través de un modelo no
  tiene que llegarle a otro modelo que puede mandar mails.
- **En el detalle** no hay "Responder" a Sara: "Escribirle" sale al mail que dio
  la persona (desde contacto@, queda en el hilo y marca el contacto atendido),
  más "Llamar" y WhatsApp cuando el número se puede llevar a celular argentino.
- **Migración** `20261012_buzon_sara.sql`, aplicada en las DOS bases (espejo
  `migrations-institucional/034_buzon_sara.sql`; la página
  de la Bandeja también existe en la instancia y lee estas columnas).
- **Contrato para AC Ai:** `docs/respuesta-docto-buzon-sara.md`.
