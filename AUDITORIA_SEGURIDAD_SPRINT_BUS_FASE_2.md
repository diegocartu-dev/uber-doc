# Auditoria de Seguridad — Sprint Bus Fase 2: Firma Electronica Interna

**Fecha:** 21 de mayo de 2026
**Auditor:** Roberto (QA y Seguridad)
**Alcance:** Conjunto completo — backend criptografico + UI + textos legales aprobados por Carolina
**Auditoria previa:** Ola 1 backend (20/05) — 4 fixes aplicados (scope OTP, column grant, timingSafeEqual, optimistic lock)

---

## Resumen Ejecutivo

**Veredicto: OK CON FIXES — Marcos puede arrancar Olas 2-5 aplicando los fixes CRITICO antes de que el codigo llegue a produccion.**

La Ola 1 (backend criptografico) esta solida en lo fundamental: RSA-2048, AES-256-GCM, SHA-256, timingSafeEqual, optimistic lock en estado. Los 4 fixes de la auditoria anterior estan aplicados correctamente. Sin embargo, al auditar el conjunto completo con vision de integracion, encontre hallazgos que requieren atencion antes de que esto vea datos reales.

---

## PUNTO 1: Modal OTP — Vectores de Ataque

### 1.1 Rate Limiting [CRITICO]

**Hallazgo:** El rate limiting actual es insuficiente para brute force real.

El sistema tiene:
- Cooldown de 30 segundos entre generaciones de OTP nuevos
- Maximo 5 intentos por OTP individual
- OTP expira en 5 minutos

**Problema:** Un atacante puede generar un OTP, hacer 5 intentos fallidos (queda marcado como `usado`), esperar 30 segundos, generar otro OTP, hacer 5 intentos mas. En 5 minutos puede hacer ~50 intentos. Con un espacio de 900.000 codigos posibles (100000-999999), la probabilidad de acertar en 50 intentos es ~0.0056%. Bajo, pero:

1. **No hay rate limiting global por medico_id.** Si el atacante automatiza el ciclo generar-intentar-esperar-generar, no hay nada que lo detenga despues de miles de ciclos.
2. **No hay rate limiting por IP.** Mil requests desde la misma IP no disparan ninguna alerta.
3. **No hay lockout temporal del medico.** Despues de 20 OTPs fallidos consecutivos, el medico deberia quedar bloqueado por 1 hora como minimo.

**Donde aplicarlo:** `src/lib/firma/otp.ts`, funciones `generarOTP` y `validarOTP`.

**Fix recomendado:**
- Agregar contador global de OTPs fallidos por medico_id en las ultimas 24 horas. Si supera 10 OTPs invalidados (50 intentos totales), bloquear generacion por 1 hora.
- Agregar campo `intentos_fallidos_24h` o consultar count de `otp_firma` con `usado=true` y `intentos >= MAX_INTENTOS` en las ultimas 24h.

**Criterio de listo:** Un script que llame a `/api/2fa/generar` + `/api/2fa/validar` en loop recibe 429 y queda bloqueado despues de 10 ciclos fallidos.

### 1.2 Reuso de OTP [OK]

El OTP se marca como `usado: true` inmediatamente despues de validacion exitosa en `validarOTP`. La query filtra por `usado: false`. Un OTP consumido no puede reutilizarse. Correcto.

### 1.3 Race Condition — Dos Ventanas Simultaneas [IMPORTANTE]

**Hallazgo:** Si el medico abre dos pestanas y firma dos recetas casi simultaneamente, y el frontend omite `consultaId` en la llamada a validar, el OTP de CUALQUIER consulta del medico seria aceptado. El filtro de scope es condicional:

```typescript
if (consultaId) query = query.eq("consulta_id", consultaId);
if (turnoId) query = query.eq("turno_id", turnoId);
```

Si `consultaId` es `undefined`, el filtro no se aplica.

**Donde aplicarlo:** `src/app/api/2fa/validar/route.ts` — validar que `consultaId` o `turnoId` esten presentes en el body, rechazar si ambos son undefined.

**Criterio de listo:** Request a `/api/2fa/validar` sin `consultaId` ni `turnoId` devuelve 400.

### 1.4 Email Hijacking [SUGERIDO]

Si un atacante toma control del email del medico Y su sesion de Supabase Auth, puede firmar recetas. Este es un riesgo inherente a OTP por email. Para Fase 2 es aceptable. En el futuro, migrar a TOTP con authenticator app.

**Criterio de listo:** Documentar el riesgo en el threat model. No es bloqueante para deploy.

---

## PUNTO 2: Pagina /verificar/{id} — Privacidad y Ataques

### 2.1 Enumeracion de IDs [CRITICO]

**Hallazgo:** Cuando se implemente `/verificar/{id}`:

1. Confirmar que la tabla `recetas` usa `gen_random_uuid()` (UUID v4) como PK — espacio de 2^122 hace enumeracion impracticable.
2. Agregar rate limiting: maximo 30 requests por IP por minuto.
3. El response para ID inexistente debe ser identico en timing y formato al de ID existente pero no firmado. Misma estructura, mismo HTTP status.

**Criterio de listo:** Test que mide timing de response para ID existente vs inexistente — diferencia menor a 50ms.

### 2.2 Datos Sensibles en Response [OK]

La decision de Carolina (no mostrar medicacion) es correcta. Las iniciales + 3 ultimos digitos del DNI son suficientes para que el farmaceutico confirme que el documento corresponde a la persona que tiene enfrente.

### 2.3 Anti-Scraping [SUGERIDO]

- Header `X-Robots-Tag: noindex` para paginas de verificacion
- `robots.txt` con `Disallow: /verificar/`
- Captcha opcional si se detectan mas de 100 requests/hora desde la misma IP

---

## PUNTO 3: Sello PDF — Integridad Visual y Criptografica

### 3.1 Falsificacion Visual del Sello [IMPORTANTE]

El sello visual en el PDF es texto plano. Cualquiera puede copiarlo o editarlo. La proteccion NO es visual — es criptografica. El QR/link a `/verificar/{id}` es lo que permite verificar autenticidad.

**Fix:** Cuando se implemente el QR, debe apuntar a `https://docto.com.ar/verificar/{receta_id}`. La pagina recalcula el hash y lo compara con la firma RSA.

**Criterio de listo:** Test donde se modifica `datos_prescripcion` post-firma y `verificarFirma()` devuelve `alterada: true`.

### 3.2 Deteccion de Alteracion [OK]

El flujo en `verificarFirma()` es correcto: obtiene datos, recalcula hash, compara con hash original, verifica firma RSA.

### 3.3 Hash sobre JSON.stringify — Determinismo [CRITICO]

**Hallazgo:** `hashSHA256(JSON.stringify(receta.datos_prescripcion))` — `JSON.stringify` NO garantiza orden estable de keys. Si PostgreSQL JSONB reordena keys, el hash podria diferir aunque los datos sean identicos. Esto generaria un falso positivo de "documento alterado".

**Donde aplicarlo:** `src/lib/firma/receta.ts`, funciones `firmarReceta` y `verificarFirma`.

**Fix recomendado:** Usar canonicalizacion explicita antes de hashear. Ordenar keys recursivamente o usar `json-stable-stringify`.

**Criterio de listo:** Test donde se graba un objeto con keys en un orden, se lee de la DB, y el hash coincide. Test donde se pasa el objeto con keys en orden diferente y el hash sigue coincidiendo.

---

## PUNTO 4: Recuperacion de Clave — Proceso Seguro

### 4.1 Proceso de 4 Pasos de Carolina [OK con observaciones]

Solido en lo fundamental.

### 4.2 Riesgo de Suplantacion en Recuperacion Manual [IMPORTANTE]

**Hallazgo:** El proceso de recuperacion no define quien autoriza ni que evidencia se requiere con precision suficiente.

**Fix recomendado:**
- El proceso NUNCA cambia el email del medico automaticamente.
- Verificacion debe incluir: foto del DNI, credencial de matricula, videollamada con documento visible.
- Solo personal autorizado (Diego o designado) puede ejecutar la regeneracion.

**Criterio de listo:** Documentar SOP con checklist de verificacion.

### 4.3 Integridad del Log de 10 Anos [IMPORTANTE]

**Hallazgo:** La tabla `otp_firma` no tiene restricciones de DELETE/UPDATE mas alla de RLS. Un admin con `service_role` podria borrar logs.

**Fix recomendado:** Trigger que impida DELETE y bloquee UPDATE de campos criticos:

```sql
CREATE OR REPLACE FUNCTION prevent_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Los registros de auditoría no pueden modificarse ni eliminarse';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER no_modify_otp_firma
  BEFORE UPDATE OR DELETE ON public.otp_firma
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();
```

**Criterio de listo:** `DELETE FROM otp_firma WHERE id = '...'` ejecutado como service_role falla.

### 4.4 UNIQUE en medico_id Impide Modelo Activa/Revocada [IMPORTANTE]

**Hallazgo:** La tabla `medico_claves` tiene `UNIQUE` en `medico_id`. Un medico puede tener UNA SOLA fila de claves. Esto contradice la decision de Carolina: "claves anteriores NUNCA se eliminan".

**Fix recomendado:**
1. Eliminar constraint UNIQUE de `medico_id`.
2. Agregar columna `estado TEXT NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa', 'revocada'))`.
3. Agregar columna `revocada_at TIMESTAMPTZ`.
4. Crear partial unique index: `CREATE UNIQUE INDEX idx_medico_clave_activa ON medico_claves(medico_id) WHERE estado = 'activa'`.
5. En `verificarFirma`, buscar la clave correcta segun `medico_id` y `created_at <= firmado_at`.

**Criterio de listo:** Un medico puede tener 2+ filas en `medico_claves`, una activa y las demas revocadas.

---

## PUNTO 5: Flujo Completo — Integracion

### 5.1 firmarReceta() No Verifica OTP [CRITICO]

**Hallazgo:** `firmarReceta()` NO verifica que exista un OTP validado antes de firmar. Recibe `recetaId` y `medicoId`, firma, y actualiza la DB. En ningun momento consulta `otp_firma`. **Cualquier codigo server-side que llame a `firmarReceta()` puede firmar sin 2FA.**

**Donde aplicarlo:** `src/lib/firma/receta.ts`, funcion `firmarReceta`.

**Fix recomendado:** `firmarReceta` debe recibir `otpId` como parametro obligatorio y verificar:
1. El OTP existe y esta marcado como `usado: true`
2. Su `medico_id` coincide
3. Su `consulta_id`/`turno_id` coincide con la receta
4. Fue validado hace menos de 2 minutos

**Criterio de listo:** Llamar a `firmarReceta(recetaId, medicoId)` sin `otpId` no compila. Llamar con `otpId` invalido devuelve error.

### 5.2 Endpoint que Permite Firma sin OTP [CRITICO]

Resuelto por el fix de 5.1. Al exigir `otpId` dentro de `firmarReceta`, no importa desde donde se llame.

### 5.3 RLS de Supabase [OK]

`medico_claves` y `otp_firma` correctamente protegidas. Cuando se cree la tabla `recetas`, necesita RLS que:
1. Medico solo ve sus recetas
2. Paciente solo ve recetas de sus consultas
3. UPDATE solo por service_role (cambio de estado debe ser server-side)

### 5.4 Logs para Auditoria Forense [IMPORTANTE]

**Falta:**
- IP de origen de la firma
- User-Agent
- otp_id utilizado (link explicito entre firma y OTP)

**Fix:** Agregar `ip_origen`, `user_agent`, `otp_id` al JSONB `firma_digital` en cada receta. Requiere que `firmarReceta` reciba estos datos del request.

**Criterio de listo:** Cada receta firmada tiene en `firma_digital` los campos `ip_origen`, `user_agent`, `otp_id` poblados.

### 5.5 Tabla Recetas No Existe [IMPORTANTE]

El codigo de `receta.ts` referencia `supabase.from("recetas")` pero no existe migracion que la cree. Marcos necesita crear la tabla o adaptar el codigo a la tabla `documentos` existente.

---

## Resumen de Hallazgos

| # | Hallazgo | Severidad | Fix aplicable en |
|---|----------|-----------|------------------|
| 1.1 | Sin rate limiting global por medico_id ni lockout temporal | CRITICO | `src/lib/firma/otp.ts` |
| 1.3 | OTP scope bypasseable si frontend omite consultaId/turnoId | IMPORTANTE | `src/app/api/2fa/validar/route.ts` |
| 1.4 | Email hijacking permite firmar si se toma sesion + email | SUGERIDO | Documentar threat model |
| 2.1 | /verificar/{id} necesita rate limiting y timing constante | CRITICO | Implementar con la Ola correspondiente |
| 2.3 | Anti-scraping (robots.txt, noindex) | SUGERIDO | Implementar con /verificar |
| 3.3 | JSON.stringify no garantiza orden de keys — hash fragil | CRITICO | `src/lib/firma/receta.ts` |
| 4.2 | Suplantacion en proceso de recuperacion manual | IMPORTANTE | SOP operativo |
| 4.3 | Log de auditoria modificable por service_role | IMPORTANTE | Nueva migracion SQL |
| 4.4 | UNIQUE en medico_id impide modelo activa/revocada | IMPORTANTE | Nueva migracion SQL |
| 5.1 | `firmarReceta()` no verifica OTP — se puede firmar sin 2FA | CRITICO | `src/lib/firma/receta.ts` |
| 5.4 | Faltan IP, User-Agent y otp_id en registro de firma | IMPORTANTE | `src/lib/firma/receta.ts` |
| 5.5 | Tabla `recetas` no existe en migraciones | IMPORTANTE | Nueva migracion SQL |

---

## Decision Final

**Marcos puede arrancar Olas 2-5** con las siguientes condiciones:

### Antes de produccion (CRITICO — bloquean deploy):

| Fix | Esfuerzo estimado | Cuando |
|-----|-------------------|--------|
| 3.3 Canonicalizacion JSON | ~30 min | Primera tarea Ola 2 |
| 5.1 firmarReceta exige otpId | ~1 hora | Primera tarea Ola 2 |
| 1.1 Rate limiting global + lockout | ~2 horas | Ola 3 (OTP hardening) |
| 2.1 Rate limiting /verificar + timing constante | ~1 hora | Con la Ola de /verificar |

### Durante Olas 2-5 (IMPORTANTE — antes de produccion):

| Fix | Cuando |
|-----|--------|
| 1.3 Validacion obligatoria consultaId/turnoId | Ola 2 |
| 4.3 Trigger anti-modificacion logs | Migracion SQL |
| 4.4 Modelo activa/revocada en medico_claves | Migracion SQL |
| 5.4 IP + User-Agent + otp_id en firma | Ola 2 |
| 5.5 Tabla recetas o adaptacion a documentos | Ola 2 |

### Backlog post-implementacion (SUGERIDO):

| Fix | Cuando |
|-----|--------|
| 1.4 Documentar threat model email hijacking | Pre-launch |
| 2.3 Anti-scraping /verificar | Con /verificar |
| 4.2 SOP de recuperacion con checklist | Pre-launch |

---

**Archivos auditados:**
- `src/lib/firma/crypto.ts`
- `src/lib/firma/claves.ts`
- `src/lib/firma/receta.ts`
- `src/lib/firma/otp.ts`
- `src/app/api/2fa/generar/route.ts`
- `src/app/api/2fa/validar/route.ts`
- `supabase/migrations/20260520_firma_electronica.sql`
- `AUDITORIA_LEGAL_FIRMA_ELECTRONICA.md`
