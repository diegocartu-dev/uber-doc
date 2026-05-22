# Auditoría Final — Módulo Firma Electrónica Docto

**Auditor:** Roberto (QA y Seguridad)
**Fecha:** 22 de mayo de 2026
**Alcance:** Conjunto completo — PRs #71, #75, #76, #77, #78, #80, #79
**Tests:** 144 pasando, 0 fallos

---

## Resumen ejecutivo

El módulo de firma electrónica tiene una base criptográfica sólida: RSA-2048 con AES-256-GCM para protección de clave privada en reposo, canonicalJSON determinístico para hashing, OTP hasheado con SHA-256 y comparación timing-safe, y RLS bien aplicada con column-level grants que excluyen `clave_privada_enc` del rol authenticated. La infraestructura completa está implementada (claves, OTP, firma, verificación, sello PDF con QR, página pública). Quedan pendientes: el endpoint HTTP que expone `firmarReceta()` y la integración del modal de firma en la UI del médico — ambos previstos como último paso del flujo. Se identifican hallazgos de seguridad a resolver antes del lanzamiento.

---

## Hallazgos CRÍTICOS — Resolver antes de lanzar

### C-1. Endpoint `/api/firma/firmar` no existe

La función `firmarReceta()` en `src/lib/firma/receta.ts` es correcta y completa, pero no hay ruta HTTP que la invoque. Sin este endpoint, el flujo médico → OTP → firma no puede ejecutarse desde la UI.

- **Archivos:** Debe crearse `src/app/api/firma/firmar/route.ts`
- **Riesgo:** Funcionalidad de firma inaccesible vía HTTP
- **Remediación:** Crear endpoint POST que reciba `{recetaId, otpId}`, verifique auth + rol médico, y llame a `firmarReceta()`
- **Nota:** Previsto como parte del sprint de integración UI

### C-2. ModalOTPFirma no integrado en WorkspaceConsulta

`src/components/ModalOTPFirma.tsx` se exporta correctamente pero no se importa ni renderiza en ningún componente de la app. En particular, no está en `WorkspaceConsulta.tsx` donde el médico genera documentos.

- **Archivos:** `src/components/ModalOTPFirma.tsx`, `src/app/medico/consulta/[id]/workspace/WorkspaceConsulta.tsx`
- **Riesgo:** El médico no tiene forma de firmar recetas desde la interfaz
- **Remediación:** Integrar modal en WorkspaceConsulta, conectar callback `onFirmado` con endpoint de firma
- **Nota:** Previsto como parte del sprint de integración UI

### C-3. No existe tabla `firma_logs` — sin no-repudio independiente

No hay tabla `firma_logs` ni mecanismo de logging independiente de firmas. El único rastro es el campo `firma_digital` JSONB dentro de la tabla `recetas`, que incluye `otp_id` y `firmado_at` pero no IP, User-Agent ni metadata de sesión.

Sin tabla separada de logs, no se puede demostrar ante terceros (farmacia, juez, organismo) que la firma fue emitida sin manipulación posterior.

- **Archivos:** Debe crearse migración SQL
- **Riesgo:** Ante cuestionamiento legal, no hay evidencia inmutable e independiente
- **Remediación:** Crear tabla `firma_logs` con policy INSERT-only (sin UPDATE/DELETE). Registrar: receta_id, medico_id, hash, firmado_at, otp_id, ip, user_agent, clave_publica_id
- **Confirma fix 5.4 del sprint:** IP + User-Agent + otp_id en registro de firma

### C-4. Sin protección anti-DELETE en tablas críticas

Las tablas `recetas`, `medico_claves` y `otp_firma` no tienen triggers que impidan borrado. Si la service role key se compromete, un atacante puede borrar evidencia criptográfica y destruir el no-repudio.

- **Archivos:** Debe crearse migración SQL con triggers BEFORE DELETE
- **Riesgo:** Destrucción de evidencia ante compromiso de service role key
- **Remediación:** Triggers `RAISE EXCEPTION 'No se permite borrar registros de esta tabla'` en las 3 tablas
- **Confirma fix 4.3 del sprint**

---

## Hallazgos IMPORTANTES — Resolver en este sprint

### I-1. OTP reutilizable para múltiples firmas

`firmarReceta()` verifica que `otp.usado === true` (OTP validado) pero no marca que el OTP ya fue CONSUMIDO para una firma específica. Un médico podría firmar dos recetas con el mismo OTP dentro de la ventana de 2 minutos.

- **Archivos:** `src/lib/firma/receta.ts` (línea 63), `src/lib/firma/otp.ts`
- **Riesgo:** Un acto de verificación de identidad firma múltiples documentos
- **Remediación:** Agregar campo `consumido_para_receta_id UUID` a `otp_firma`. En `firmarReceta()`, verificar que es NULL y hacer UPDATE atómico al firmar

### I-2. Número de receta no determinístico

`generarNumeroReceta()` en `src/lib/pdf/receta.ts` (línea 86-94) genera un código aleatorio de 8 caracteres ignorando el parámetro `_id`. Cada descarga del PDF genera un número diferente. El barcode Code128 también cambia.

- **Archivos:** `src/lib/pdf/receta.ts`
- **Riesgo:** Trazabilidad rota — una farmacia no puede verificar el número contra una segunda descarga
- **Remediación:** Generar número determinístico basado en UUID del documento (ej: hash del ID) o guardarlo en tabla `recetas` al emitirlo

### I-3. Sin mecanismo de revocación de claves

La tabla `medico_claves` tiene columna `rotada_at` pero no hay código que la use. No existe flujo para revocar claves comprometidas ni rotar periódicamente.

- **Archivos:** `src/lib/firma/claves.ts`, migración SQL
- **Riesgo:** Claves comprometidas no pueden invalidarse
- **Remediación:** Endpoint de revocación que marque clave con `revocada_at`, genere nuevo par, registre en firma_logs
- **Confirma fix 4.4 del sprint**

### I-5. Ventana OTP firma inconsistente

`firmarReceta()` mide la edad del OTP desde `created_at` (2 min), pero el médico puede tardar hasta 5 min en ingresar el código (OTP_EXPIRY_MS). Si el médico valida a los 3 min y confirma firma a los 3:30 min, la firma se rechaza porque `otpAge > 2min`.

- **Archivos:** `src/lib/firma/receta.ts` (línea 71-73)
- **Riesgo:** Rechazos falsos — médico valida OTP exitosamente pero firma falla
- **Remediación:** Medir desde `validado_at` (agregar campo a `otp_firma`) o ampliar `OTP_VENTANA_MS` a 5 min

---

## Hallazgos MENORES — Backlog

### M-1. Rate limiting per-instance en Vercel

El Map en memoria de `/api/verificar/[id]` se reinicia por instancia serverless. Aceptable para MVP.

- **Remediación futura:** Migrar a Vercel KV o Upstash Redis

### M-2. Tests sin integración end-to-end

144 tests unitarios, 0 tests de integración que encadenen generar OTP → validar → firmar → verificar.

- **Remediación futura:** Test de integración con mocks de Supabase

### M-3. Math.random() en generarNumeroReceta

`Math.random()` no es criptográficamente seguro. Para un número con relevancia regulatoria, usar `crypto.randomInt()`.

- **Archivos:** `src/lib/pdf/receta.ts` línea 91

---

## Lo que está bien implementado

- **RSA-2048 + AES-256-GCM:** IV aleatorio por operación, auth tag GCM, master key validada a 32 bytes (`src/lib/firma/crypto.ts`)
- **canonicalJSON:** Resuelve JSONB key reordering. Tests exhaustivos (`tests/unit/canonical-json.test.ts`)
- **OTP hasheado + timingSafeEqual:** Nunca en texto plano, comparación timing-safe
- **RLS + column-level grants en medico_claves:** `clave_privada_enc` excluida de GRANT a authenticated
- **Scope obligatorio de OTP:** consulta_id o turno_id requerido (defense-in-depth)
- **Race condition en provisionarClaves:** Catch de error 23505 (unique violation)
- **Update atómico en firmarReceta:** `.eq("estado", "borrador")` previene doble firma
- **Sello PDF con QR:** HTTPS hardcoded, UUID completo, error correction "M"
- **Página /verificar:** Rate limiting, timing constante 500ms, sin datos médicos del paciente
- **Middleware:** Timeout 8h con exenciones correctas para /verificar, /api, workspace médico

---

## Conclusión

**Se puede lanzar la infraestructura** — la base criptográfica y regulatoria es sólida. **No se puede activar la funcionalidad de firma para médicos** hasta resolver C-1 (endpoint) y C-2 (integración UI), que están previstos como sprint separado.

**Antes de activar firma**, resolver:
1. C-1 + C-2: endpoint + integración UI (sprint integración)
2. C-3: tabla firma_logs (este sprint)
3. C-4: triggers anti-DELETE (este sprint)
4. I-1: OTP one-time-use por firma (este sprint)
5. I-5: ventana OTP consistente (este sprint)

**Deuda técnica aceptada para post-lanzamiento:**
- I-2: número de receta determinístico
- I-3: revocación de claves (fix 4.4)
- M-1 a M-3: menores

---

*Auditoría realizada por Roberto — QA y Seguridad, Docto*
