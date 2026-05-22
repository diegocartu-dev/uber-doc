# Revertir antes de lanzamiento publico

Cambios aplicados durante beta cerrada que deben revisarse/revertirse antes de abrir Docto al publico.

**Fecha:** 22 de mayo de 2026
**PR:** fix/limpiar-datos-publicos
**Motivo:** En beta cerrada no hay usuarios reales a quienes dar soporte. Se removieron canales de contacto publicos y datos personales del footer para evitar exposicion innecesaria.

---

## 1. Footer — datos personales removidos

**Archivo:** `src/components/Footer.tsx:75`

**Antes:**
```
© 2026 Docto — Diego Oscar González, CUIT 20-25086458-3 · Puerto Madero, CABA
```

**Ahora:**
```
© 2026 Docto — Hecho en Argentina
```

**Decision pre-launch:** Definir version definitiva del footer. Opciones:
- Persona fisica: restaurar nombre + CUIT (obligatorio si opera como PF)
- SRL constituida: reemplazar con razon social + CUIT de la SRL
- La identificacion legal completa (nombre, CUIT, domicilio) sigue presente en TyC y Politica de Privacidad

---

## 2. Email soporte en login — removido

**Archivo:** `src/app/auth/login/page.tsx:160-165`

**Antes:** Link "Escribinos a soporte@docto.com.ar" debajo de "Olvidaste tu contraseña?"

**Ahora:** Removido (comentario HTML marcador)

**Decision pre-launch:** Decidir canal de soporte definitivo:
- Restaurar email soporte@
- Implementar chat in-app
- Formulario de contacto con rate limiting
- Password reset automatico (elimina la necesidad del email aca)

---

## 3. Emails que SIGUEN visibles (post-login, no publicos)

Estos emails se mantuvieron porque estan detras de autenticacion y son necesarios para la medica real en beta:

| Email | Archivo | Contexto |
|-------|---------|----------|
| soporte@docto.com.ar | PantallaVerificacion.tsx:103 | Contacto para medicos pendientes |
| hola@docto.com.ar | PantallaVerificacion.tsx:125 | Contacto alternativo medicos |
| soporte@docto.com.ar | TabCobros.tsx:271,303 | Ayuda cobros medicos |
| soporte@docto.com.ar | OnboardingForm.tsx:169 | Mensaje de error |

**Decision pre-launch:** Unificar a un solo email de soporte o reemplazar con sistema de tickets.

---

## 4. Emails que SIGUEN visibles en documentos legales

| Email | Archivo | Contexto |
|-------|---------|----------|
| soporte@docto.com.ar | TerminosContent.tsx:100,137,146 | Ejercicio derechos ARCO + contacto |
| soporte@docto.com.ar | PrivacidadContent.tsx:12,73,92 | Responsable de datos + derechos |

**Decision pre-launch:** Mantener o reemplazar con dpo@docto.com.ar (ver punto 7).

---

## 5. Emails backend (no tocar)

| Email | Archivo | Uso |
|-------|---------|-----|
| no-reply@docto.com.ar | lib/email.ts:14 | From transaccional |
| no-reply@docto.com.ar | api/2fa/generar/route.ts:52 | From OTP |
| alertas@docto.com.ar | lib/alertas.ts:15 | From alertas |
| soporte@docto.com.ar | lib/push.ts:11 | VAPID details |

---

## 6. Beta guard

**Estado actual:** Signup cerrado (PR #63, 18/05). Solo usuarios invitados pueden registrarse.

**Decision pre-launch:** Decidir gate definitivo:
- Whitelist por email
- Abierto sin restriccion
- Abierto con CAPTCHA/verificacion
- Invitacion por link

---

## 7. Pendientes regulatorios pre-launch

| Item | Estado | Prioridad |
|------|--------|-----------|
| dpo@docto.com.ar activo y visible en Politica de Privacidad | No existe | ALTA (obligacion AAIP) |
| Revision legal por abogado matriculado | Pendiente | ALTA |
| REFEPS/SISA integracion real | Pendiente | MEDIA |
| Contrato Docto-Medico (TyC especificos) | Pendiente | ALTA |
| Farmalink habilitado | Pendiente | BAJA (post-MVP) |
| Consentimiento informado por consulta | Pendiente | ALTA (Ley 26.529) |
| Constitucion SRL | Pendiente | ALTA (antes de facturar) |
| F&F (Friends & Family) testing completado | Pendiente | ALTA |
