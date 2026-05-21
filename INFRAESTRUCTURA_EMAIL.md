# Infraestructura de Email — Docto

Ultima actualizacion: 2026-05-20

---

## 1. Recepcion de Emails (@docto.com.ar)

| Campo | Valor |
|-------|-------|
| Servicio | ImprovMX (free tier) |
| Dominio | docto.com.ar |
| Cuenta administrador | diegocartu@me.com |
| Panel | https://app.improvmx.com |
| Catch-all | SI (`*@docto.com.ar` -> diegocartu@me.com) |
| Plan | Free (hasta 25 aliases por dominio) |

### Aliases configurados

| Alias | Destino | Uso |
|-------|---------|-----|
| dpo@docto.com.ar | diegocartu@me.com | Data Protection Officer (compliance) |
| soporte@docto.com.ar | diegocartu@me.com | Soporte al usuario |
| hola@docto.com.ar | diegocartu@me.com | Contacto general |

El catch-all ya cubre cualquier direccion, pero los aliases individuales estan configurados para claridad operativa.

---

## 2. Envio desde Gmail ("Send mail as")

| Campo | Valor |
|-------|-------|
| Cuenta Gmail | diegocartu@gmail.com |
| SMTP Server | smtp.resend.com |
| Puerto | 587 |
| Conexion | TLS |
| Username | resend |
| Password | Variable de entorno `RESEND_API_KEY` en Vercel (NO incluir valor aqui) |
| "Tratar como alias" | DESMARCADO |

### Direcciones configuradas

| Direccion | Nombre visible | Estado |
|-----------|---------------|--------|
| dpo@docto.com.ar | Docto | Verificada |
| soporte@docto.com.ar | Docto | Verificada |
| hola@docto.com.ar | Docto | Verificada |

Cuando se responde desde Gmail usando cualquiera de estas direcciones, el destinatario ve el email como proveniente de esa direccion (ej: `dpo@docto.com.ar`), no de la cuenta Gmail personal.

---

## 3. Envio Transaccional de Docto (via Resend API)

| Campo | Valor |
|-------|-------|
| Servicio | Resend (https://resend.com) |
| Dominio verificado | docto.com.ar |
| API key | Env var `RESEND_API_KEY` en Vercel (All Environments) |
| SDK | `resend` v6.12.0 (package.json) |
| Feature flag | `email_transaccional` (si falla el check, default: enviar) |
| Retry | 2 intentos, delay 500ms x N, no retry en 4xx salvo 429 |

### Direcciones "From"

| Direccion From | Uso | Archivo |
|---------------|-----|---------|
| `Docto <no-reply@docto.com.ar>` | Emails transaccionales a pacientes | `src/lib/email.ts:14` |
| `Docto Alertas <alertas@docto.com.ar>` | Alertas internas al admin | `src/lib/alertas.ts:15` |

### Tipos de email que envia Docto

| Tipo | Funcion | Archivo | Destinatario |
|------|---------|---------|-------------|
| Confirmacion de turno | `enviarEmailTurnoConfirmado()` | `src/lib/email.ts` | Paciente |
| Cancelacion de turno | `enviarEmailTurnoCancelado()` | `src/lib/email.ts` | Paciente |
| Documento medico | `enviarDocumentoMedico()` | `src/lib/email.ts` | Paciente |
| Recordatorio 24h | `enviarEmailRecordatorio24h()` | `src/lib/email.ts` | Paciente |
| Codigo OTP (2FA firma) | Inline en route handler | `src/app/api/2fa/generar/route.ts` | Medico |
| Alertas de sistema | `sendDoctoAlert()` | `src/lib/alertas.ts` | Admin (diegocartu@gmail.com, diegocartu@me.com) |

### Templates

Los emails transaccionales usan HTML inline dentro de `src/lib/email.ts` (no archivos de template separados). Caracteristicas:

- Layout centrado de 600px max-width con header azul (#378ADD)
- Branding "Docto" con subtitulo en header
- Footer con link a docto.com.ar
- Tipografia: system fonts (-apple-system, BlinkMacSystemFont, Segoe UI, Roboto)
- Adjuntos ICS (RFC 5545) para confirmaciones y cancelaciones de turno

### Callers

| Archivo que invoca | Funcion invocada |
|-------------------|-----------------|
| `src/app/clinica/[medicoId]/turnos/actions.ts` | `enviarEmailTurnoConfirmado()` |
| `src/lib/cancelaciones.ts` | `enviarEmailTurnoCancelado()` |
| `src/app/api/consulta/enviar-documento-medico/route.ts` | `enviarDocumentoMedico()` |
| `src/app/api/cron/recordatorios/route.ts` | `enviarEmailRecordatorio24h()` |
| `src/app/api/pago/webhook/route.ts` | `sendDoctoAlert()` |
| `src/app/api/pago/crear-v2/route.ts` | `sendDoctoAlert()` |
| `src/app/api/mp/oauth/callback/route.ts` | `sendDoctoAlert()` |

---

## 4. Configuracion DNS en Vercel

| Campo | Valor |
|-------|-------|
| Provider DNS | Vercel |
| Nameservers | ns1.vercel-dns.com, ns2.vercel-dns.com |
| Panel | https://vercel.com/diegocartu-devs-projects/~/domains/docto.com.ar |

### Registros DNS relacionados a email

| Name | Type | Value | Priority | TTL | Proposito |
|------|------|-------|----------|-----|-----------|
| @ | MX | mx1.improvmx.com | 10 | 60 | Recepcion de email (ImprovMX primario) |
| @ | MX | mx2.improvmx.com | 20 | 60 | Recepcion de email (ImprovMX secundario) |
| send | MX | feedback-smtp.sa-east-1.amazonses.com | 10 | 60 | Bounce handling de Resend |
| @ | TXT | `v=spf1 include:spf.improvmx.com ~all` | — | 60 | SPF para ImprovMX (recepcion/forwarding) |
| send | TXT | `v=spf1 include:amazonses.com ~all` | — | 60 | SPF para Resend (envio transaccional) |
| resend._domainkey | TXT | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4G...` (clave publica RSA) | — | 3600 | DKIM para Resend |
| _dmarc | TXT | `v=DMARC1; p=none;` | — | 3600 | DMARC (modo monitor, no rechaza) |

### Nota sobre SPF y subdominios

Resend usa el subdominio `send.docto.com.ar` como envelope sender (Return-Path). Por eso el SPF de Resend (`include:amazonses.com`) esta en el subdominio `send`, no en el root. El SPF del root domain solo necesita cubrir ImprovMX para el forwarding. Esto es correcto y no requiere cambios.

---

## 5. Flujo Completo

### Recepcion de email externo

```
Alguien envia a dpo@docto.com.ar
  -> DNS MX apunta a mx1.improvmx.com
  -> ImprovMX recibe el email
  -> Catch-all forwarding a diegocartu@me.com
  -> Diego lo lee en Apple Mail (iCloud)
```

### Respuesta manual desde Gmail

```
Diego abre Gmail, elige "From: dpo@docto.com.ar"
  -> Gmail usa SMTP smtp.resend.com:587
  -> Resend envia el email con From: dpo@docto.com.ar
  -> Destinatario ve dpo@docto.com.ar como remitente
  -> DKIM firma con resend._domainkey.docto.com.ar
```

### Email transaccional automatico

```
App Next.js (Vercel) invoca Resend API
  -> Resend envia desde no-reply@docto.com.ar (o alertas@)
  -> Envelope sender: send.docto.com.ar (SPF pasa por amazonses.com)
  -> DKIM firma con resend._domainkey.docto.com.ar
  -> Destinatario recibe email de Docto
```

---

## 6. Principios de Seguridad y Mantenimiento

- **API key de Resend**: almacenada SOLO en Vercel env vars (`RESEND_API_KEY`). No commitear nunca en codigo. Rotar periodicamente.
- **Backup DNS**: mantener copia de los registros DNS en gestor de contrasenas o equivalente. Si se migra DNS, actualizar todos los registros de email.
- **DMARC**: actualmente en `p=none` (modo monitor). Cuando el volumen de email sea estable, considerar migrar a `p=quarantine` o `p=reject`.
- **ImprovMX free tier**: limite de 25 aliases y sin SLA. Si el volumen crece, evaluar upgrade a Premium ($9/mes) o migrar a Google Workspace.
- **Feature flag**: `email_transaccional` permite desactivar envios sin deploy. Default: activado.

---

## 7. Delegacion a Futuros Empleados

Cuando el equipo crezca y necesite acceso independiente a soporte@docto.com.ar:

| Opcion | Descripcion | Costo | Recomendacion |
|--------|------------|-------|---------------|
| A. Compartir Gmail | Dar acceso a la cuenta Gmail personal | $0 | NO — mezcla personal con laboral |
| B. Google Workspace | Cuentas independientes tipo soporte@docto.com.ar | ~$7/usuario/mes | SI para equipos de 2-5 personas |
| C. Zoho Mail Lite | Cuentas independientes, plan gratuito limitado | $0-$1/usuario/mes | SI para arrancar con 1-2 personas |
| D. Helpdesk dedicado | Freshdesk, Zendesk, Intercom | $15+/agente/mes | SI cuando haya volumen de tickets |

**TODO**: Evaluar migracion cuando se sume la primera persona de soporte. Implica:
1. Crear cuenta en el servicio elegido
2. Cambiar MX records (si se deja ImprovMX, solo agregar forwarding al nuevo destino)
3. Actualizar este documento

---

## Comandos de Verificacion

```bash
# MX records (recepcion)
dig docto.com.ar MX +short
# Esperado:
# 10 mx1.improvmx.com.
# 20 mx2.improvmx.com.

# SPF root (ImprovMX)
dig docto.com.ar TXT +short
# Esperado: "v=spf1 include:spf.improvmx.com ~all"

# SPF subdominio send (Resend)
dig send.docto.com.ar TXT +short
# Esperado: "v=spf1 include:amazonses.com ~all"

# DKIM (Resend)
dig resend._domainkey.docto.com.ar TXT +short
# Esperado: clave publica RSA

# DMARC
dig _dmarc.docto.com.ar TXT +short
# Esperado: "v=DMARC1; p=none;"

# MX subdominio send (Resend bounce handling)
dig send.docto.com.ar MX +short
# Esperado: 10 feedback-smtp.sa-east-1.amazonses.com.
```

---

## Historial de Cambios

| Fecha | Cambio |
|-------|--------|
| 2026-05-20 | Documento creado. ImprovMX configurado, MX/SPF agregados en Vercel DNS, Gmail "Send mail as" configurado para 3 direcciones. |
