# Modulo de Firma Electronica — Docto

**Version:** 1.0
**Fecha:** 22 de mayo de 2026
**Estado:** Infraestructura completa. Pendiente integracion UI (sprint separado).
**Plataforma:** 0270 — ReNaPDiS RL-2026-48984072-APN-SSVEIYES#MS

---

# PARTE 1 — ADMINISTRATIVO / NO TECNICO

*Para Diego, organismos, abogados, auditores.*

---

## 1. Que es el modulo

El modulo de firma electronica de Docto permite que los medicos firmen recetas digitales de forma segura, verificable y con validez legal. Cada receta firmada queda protegida contra alteraciones: si alguien modifica el contenido despues de la firma, el sistema lo detecta automaticamente. Cualquier persona (farmaceutico, paciente, organismo regulador) puede verificar la autenticidad de una receta escaneando el codigo QR impreso en el PDF, sin necesidad de crear una cuenta ni ingresar datos personales.

## 2. Marco legal aplicable

### Ley 25.506 — Firma Digital (Art. 5)

> *"Se entiende por firma electronica al conjunto de datos electronicos integrados, ligados o asociados de manera logica a otros datos electronicos, utilizado por el signatario como su medio de identificacion, que carezca de alguno de los requisitos legales para ser considerada firma digital."*

Docto implementa **firma electronica** (Art. 5), no firma digital (Art. 2). La diferencia es que la firma digital requiere certificado emitido por un certificador licenciado por la Jefatura de Gabinete. La firma electronica tiene validez legal pero la carga probatoria recae sobre quien la invoca. Ambas son validas para recetas electronicas segun la normativa vigente.

### Ley 27.553 — Receta Electronica y Telematica

> *"Autorizase la prescripcion y dispensacion de medicamentos y toda otra prescripcion medica [...] a traves de plataformas de teleasistencia en salud [...] mediante el uso de la firma digital o electronica."*

Esta ley habilita expresamente la emision de recetas por via electronica a traves de plataformas de telemedicina. Docto opera bajo este marco como plataforma registrada.

### Decreto 63/2024 — Reglamentacion de Ley 27.553

Reglamenta la Ley 27.553 y establece los requisitos tecnicos para plataformas de telemedicina que emitan prescripciones electronicas. Establece la obligacion de inscripcion en el Registro Nacional de Plataformas Digitales Sanitarias (ReNaPDiS).

### Decreto 98/2023 — Desburocratizacion de recetas

Simplifica requisitos para prescripciones medicas y habilita el uso de medios electronicos como alternativa al papel. Complementa la Ley 27.553 en cuanto a formatos aceptados.

### Resolucion 2214/2025 — Requisitos tecnicos de receta electronica

Establece los requisitos tecnicos especificos que deben cumplir las recetas electronicas: identificacion del emisor, trazabilidad, integridad del documento, y condiciones de verificacion.

## 3. Como funciona desde la perspectiva del medico

1. **Configuracion inicial (una sola vez):** Al entrar al dashboard, el medico ve un aviso que le indica que debe activar la firma electronica. Hace clic en "Activar" y el sistema genera automaticamente las claves criptograficas asociadas a su cuenta. No necesita instalar nada ni entender el proceso tecnico.

2. **Durante la consulta:** El medico atiende al paciente por videollamada. Al finalizar, crea la receta (diagnostico + prescripcion) desde su workspace.

3. **Firma de la receta:** Al confirmar la receta, el sistema le envia un codigo de 6 digitos a su email registrado. El medico ingresa ese codigo en un modal dentro de la plataforma. Si el codigo es correcto, la receta queda firmada electronicamente.

4. **Resultado:** La receta pasa de "borrador" a "emitida". El PDF que descargue el paciente incluye un codigo QR de verificacion y la fecha/hora de firma.

## 4. Como funciona desde la perspectiva del paciente

1. El paciente recibe la receta como PDF al finalizar la consulta.
2. El PDF incluye todos los datos clinicos (diagnostico, prescripcion, datos del medico y del paciente) y un codigo QR en la esquina inferior izquierda.
3. Si necesita verificar la autenticidad, escanea el QR con la camara del celular. Se abre una pagina web publica (sin login) que confirma si la receta es autentica, muestra quien la firmo y cuando.
4. La pagina de verificacion **no muestra datos medicos del paciente** por razones de privacidad — solo confirma la autenticidad.

## 5. Como funciona desde la perspectiva de una farmacia o verificador

1. El farmaceutico recibe el PDF del paciente (impreso o digital).
2. Escanea el codigo QR con cualquier celular.
3. La pagina `docto.com.ar/verificar/{id}` muestra uno de cuatro estados:
   - **Verificada:** La receta es autentica y no fue alterada. Muestra nombre del medico, especialidad, matricula, y fecha de firma.
   - **Alterada:** La receta fue modificada despues de ser firmada. La firma ya no es valida.
   - **Firma no valida:** La firma no corresponde al contenido.
   - **No encontrada:** No existe una receta con ese identificador.
4. En ningun caso la pagina muestra datos del paciente, diagnostico ni medicamentos prescriptos.

## 6. Que se ve en el PDF

El PDF de receta incluye los siguientes elementos, cada uno con su justificacion:

- **Header:** Tipo de documento (RECETA MEDICA), nombre de la plataforma (Docto — Telemedicina), fecha y hora de emision.
- **Bloque PROFESIONAL:** Nombre del medico, especialidad, matricula con codigo de barras Code128, domicilio profesional. Justificacion: Resolucion 2214/2025 requiere identificacion completa del emisor.
- **Bloque PACIENTE:** Nombre, DNI, CUIL, sexo, fecha de nacimiento, cobertura medica. Justificacion: identificacion del destinatario de la prescripcion.
- **Diagnostico y prescripcion:** Contenido clinico del documento.
- **Firma manuscrita (derecha):** Linea de firma + nombre del medico + codigo de barras de matricula. Simula la firma manuscrita tradicional.
- **Sello QR (izquierda):** Codigo QR que apunta a `docto.com.ar/verificar/{id}` + fecha y hora de firma electronica (DD/MM/YYYY HH:mm). No incluye texto legal redundante — la ley se cita en el footer.
- **Seccion A (leyendas obligatorias):** "Este documento ha sido firmado —electronica o digitalmente segun corresponda— por [nombre del medico]." + Referencia al Registro de Recetarios Electronicos del Ministerio de Salud de la Nacion con numero RL. Justificacion: redaccion interna alineada con formularios tipo del Ministerio de Salud.
- **Seccion B (marco regulatorio):** "Documento emitido por Docto — Plataforma 0270, ReNaPDiS — Ley 27.553 y Decreto 63/2024. Firma electronica con validez legal segun Ley 25.506." Justificacion: identifica la plataforma emisora y el marco legal habilitante.
- **Disclaimer:** "Este documento no reemplaza una consulta presencial cuando sea necesaria."
- **Codigo de barras de receta:** Numero determinístico basado en el UUID del documento (formato REC-YYYY-XXXXXXXX).

## 7. Que se ve en /verificar

**Lo que muestra:**
- Estado de verificacion (verificada / alterada / invalida / no encontrada)
- Nombre del medico firmante
- Especialidad del medico
- Numero de matricula
- Fecha y hora de la firma
- Algoritmo criptografico utilizado (RSA-SHA256)
- Primeros 16 caracteres del hash del documento (referencia tecnica)

**Lo que NO muestra (y por que):**
- Nombre del paciente — privacidad, Ley 25.326 (Proteccion de Datos Personales)
- DNI o CUIL del paciente — dato sensible
- Diagnostico — dato de salud protegido
- Medicamentos prescriptos — dato de salud protegido
- Contenido de la receta — todo el contenido clinico esta excluido

La pagina de verificacion muestra un disclaimer: "Este documento no muestra informacion medica del paciente por razones de privacidad."

## 8. Validaciones aplicadas por Carolina (auditoria legal interna)

Carolina (asesora legal interna de Docto) reviso y aprobo:

- Textos publicos del PDF (Secciones A y B) — aprobados con ajuste de redaccion
- Sello QR: aprobado sin titulo redundante ("FIRMADO ELECTRONICAMENTE" eliminado por redundancia con Seccion A)
- Inclusion de hora junto a fecha en sello (recomendacion de Carolina: HH:mm junto a DD/MM/YYYY)
- Seccion B: "Plataforma 0270, ReNaPDiS" sin "inscripta en" (Carolina: sobre-cumplimiento innecesario)
- Pagina /verificar: aprobado que no muestre datos medicos
- Respuesta generica (404) para IDs inexistentes — aprobado para evitar enumeracion
- Retencion de logs de firma: 10 anos (recomendacion de Carolina)

## 9. Limitacion: pendiente revision por abogado matriculado

Todos los textos con efecto legal vinculante (footer del PDF, Seccion A, Seccion B, disclaimer de verificacion) fueron redactados y validados por el equipo interno de Docto con asistencia de Carolina. **No constituyen asesoramiento legal profesional.** Antes del lanzamiento publico se requiere revision por un abogado matriculado especialista en derecho digital / salud, que confirme:

- Que los textos no generan responsabilidad inadvertida
- Que el nivel de firma electronica (Art. 5) es suficiente para el tipo de documentos emitidos
- Que la politica de privacidad de /verificar cumple con Ley 25.326
- Que el consentimiento implicito del medico al firmar es suficiente (vs. contrato explicito)

---

# PARTE 2 — TECNICO

*Para Marcos, desarrolladores futuros.*

---

## 1. Arquitectura: tablas, columnas, RLS

### Tabla `medico_claves`
Almacena el par de claves RSA de cada medico.

| Columna | Tipo | Descripcion |
|---------|------|-------------|
| `id` | UUID PK | Identificador unico de la clave |
| `medico_id` | UUID FK→medicos | Medico propietario (UNIQUE parcial donde `activa=true`) |
| `clave_publica` | TEXT | Clave publica RSA en formato PEM (SPKI) |
| `clave_privada_enc` | TEXT | Clave privada encriptada con AES-256-GCM + FIRMA_MASTER_KEY |
| `algoritmo` | TEXT | 'RSA-SHA256' |
| `key_size` | INTEGER | 2048 |
| `activa` | BOOLEAN | `true` = clave en uso, `false` = revocada |
| `revocada_at` | TIMESTAMPTZ | Fecha de revocacion (NULL si activa) |
| `motivo_revocacion` | TEXT | Motivo de revocacion (NULL si activa) |
| `created_at` | TIMESTAMPTZ | Fecha de creacion |
| `rotada_at` | TIMESTAMPTZ | Reservado para rotacion periodica |

**RLS:** SELECT solo para el medico propietario. Column-level grant: `clave_privada_enc` excluida del GRANT a authenticated. Sin INSERT/UPDATE/DELETE para authenticated — solo service role.

**Trigger:** `trg_no_delete_medico_claves` — BEFORE DELETE que lanza RAISE EXCEPTION. Las claves nunca se borran.

### Tabla `otp_firma`
Codigos OTP de un solo uso para 2FA en firma.

| Columna | Tipo | Descripcion |
|---------|------|-------------|
| `id` | UUID PK | Identificador del OTP |
| `medico_id` | UUID FK→medicos | Medico que lo solicito |
| `hash_codigo` | TEXT | Hash SHA-256 del codigo de 6 digitos |
| `expira_at` | TIMESTAMPTZ | Expiracion (5 minutos desde creacion) |
| `usado` | BOOLEAN | `true` = validado correctamente |
| `intentos` | INTEGER | Contador de intentos de validacion (max 5) |
| `consulta_id` | UUID FK→consultas | Scope: consulta inmediata |
| `turno_id` | UUID FK→turnos | Scope: turno programado |
| `consumido_para_receta_id` | UUID FK→recetas | Receta que firmo (UNIQUE parcial, NULL = disponible) |
| `validado_at` | TIMESTAMPTZ | Momento exacto de validacion |
| `created_at` | TIMESTAMPTZ | Fecha de creacion |

**RLS:** Sin policies para authenticated — solo service role. El medico no puede leer/modificar sus OTPs via cliente.

**Trigger:** `trg_no_delete_otp_firma` — BEFORE DELETE, RAISE EXCEPTION.

### Tabla `firma_logs`
Registro inmutable e independiente de cada acto de firma. No-repudio.

| Columna | Tipo | Descripcion |
|---------|------|-------------|
| `id` | UUID PK | Identificador del log |
| `receta_id` | UUID FK→recetas | Receta firmada |
| `medico_id` | UUID FK→medicos | Medico firmante |
| `hash` | TEXT | Hash SHA-256 del contenido al momento de firmar |
| `algoritmo` | TEXT | 'RSA-SHA256' |
| `firmado_at` | TIMESTAMPTZ | Momento de la firma |
| `otp_id` | UUID FK→otp_firma | OTP usado para autorizar la firma |
| `ip` | TEXT | IP del medico al momento de firmar (nullable) |
| `user_agent` | TEXT | User-Agent del browser (nullable) |
| `clave_id` | UUID FK→medico_claves | Clave especifica usada (para verificacion historica) |
| `created_at` | TIMESTAMPTZ | Fecha de creacion del registro |

**RLS:** Habilitada. Sin policies para authenticated — solo service role puede insertar. Nadie puede UPDATE ni DELETE.

**Trigger:** `trg_no_delete_firma_logs` — BEFORE DELETE, RAISE EXCEPTION.

### Tabla `recetas` (columnas relevantes a firma)

> **Nota terminologica:** La columna se llama `firma_digital` por convencion tecnica del schema original. Esto NO implica firma digital en los terminos del Art. 2 de la Ley 25.506. Docto implementa firma **electronica** (Art. 5). El nombre de la columna es legacy y no tiene implicancia legal.

| Columna | Tipo | Descripcion |
|---------|------|-------------|
| `firma_digital` | JSONB | Objeto con hash, firma, algoritmo, firmado_at, medico_id, otp_id |
| `hash_pdf` | TEXT | Hash SHA-256 del contenido para verificacion rapida |
| `estado` | TEXT | 'borrador' → 'emitida' (al firmar) |
| `fecha_emision` | TIMESTAMPTZ | Timestamp de firma |

**Trigger:** `trg_no_delete_recetas` — BEFORE DELETE, RAISE EXCEPTION.

## 2. Stack criptografico

Todo en `src/lib/firma/crypto.ts`.

| Componente | Algoritmo | Detalle |
|------------|-----------|---------|
| Par de claves | RSA-2048 | SPKI/PKCS8 PEM, generado con `crypto.generateKeyPairSync` |
| Proteccion clave privada | AES-256-GCM | IV aleatorio (16 bytes) + auth tag (16 bytes) por operacion |
| Master key | 256 bits | Env var `FIRMA_MASTER_KEY` (64 hex chars), nunca en el repo |
| Hash de contenido | SHA-256 | Sobre `canonicalJSON(datos_prescripcion)` |
| Firma | RSA-SHA256 | `crypto.createSign('RSA-SHA256')` sobre el hash |
| Verificacion | RSA-SHA256 | `crypto.createVerify('RSA-SHA256')` con clave publica |
| Hash de OTP | SHA-256 | El codigo de 6 digitos nunca se guarda en texto plano |
| Comparacion OTP | timingSafeEqual | Previene timing attacks en la comparacion de hashes |

**Formato de clave privada encriptada:** `base64(IV[16] + AuthTag[16] + CiphertextAES)`

## 3. Flujo de generacion de claves

Archivo: `src/lib/firma/claves.ts` → `provisionarClaves(medicoId)`

1. Buscar si el medico ya tiene una clave activa (`activa=true`).
2. Si existe, retornar la clave publica (idempotente).
3. Si no, generar par RSA-2048 con `generarParRSA()`.
4. Encriptar clave privada con `encriptarClavePrivada()` (AES-256-GCM + FIRMA_MASTER_KEY).
5. Insertar en `medico_claves`.
6. Si hay unique violation (23505 — race condition de dos requests simultaneos), buscar la clave activa que gano la carrera y retornarla.

**Revocacion:** `revocarClaves(medicoId, motivo)` marca la clave actual como `activa=false`, registra `revocada_at` y `motivo_revocacion`, y genera un nuevo par de claves. La clave revocada se mantiene para verificar firmas historicas. El trigger anti-DELETE impide borrarla.

## 4. Flujo de firma

Archivo: `src/lib/firma/receta.ts` → `firmarReceta(recetaId, medicoId, otpId, meta?)`

Validaciones previas (todas deben pasar):
1. OTP existe, fue validado (`usado=true`), pertenece al medico, no fue consumido para otra receta, y no expiro (<5 minutos).
2. Receta existe, pertenece al medico, esta en estado `borrador`, no fue firmada previamente, tiene consulta o turno asociado.
3. Scope: el OTP debe corresponder a la misma consulta/turno que la receta.
4. Claves activas existen para el medico.

Proceso de firma:
1. Serializar `datos_prescripcion` con `canonicalJSON()` (orden determinístico de keys).
2. Calcular `hashSHA256(contenido)`.
3. Desencriptar clave privada con `desencriptarClavePrivada()`.
4. Firmar el hash con `firmar(hash, clavePrivada)` → RSA-SHA256, resultado en base64.
5. UPDATE atomico en `recetas`: `firma_digital` (JSONB), `hash_pdf`, `estado='emitida'`, `fecha_emision`. El UPDATE incluye `.eq("estado", "borrador")` como guard contra doble firma concurrente.
6. Marcar OTP como consumido: `consumido_para_receta_id = recetaId`. Unique index en DB es el guard real; se verifica el resultado del UPDATE.
7. Insertar en `firma_logs`: receta_id, medico_id, hash, otp_id, ip, user_agent, clave_id.

## 5. Flujo de verificacion

Archivo: `src/lib/firma/receta.ts` → `verificarFirma(recetaId)`

1. Buscar receta por ID. Si no tiene `firma_digital`, retornar `{valida: false, datos: null}`.
2. Buscar la clave publica que firmo: primero en `firma_logs` (por `clave_id`), luego fallback a la ultima clave del medico (para firmas anteriores al sistema de logs).
3. Recalcular el hash del contenido actual con `canonicalJSON()` + `hashSHA256()`.
4. Comparar hash actual vs hash original de la firma. Si difieren → `alterada: true`.
5. Verificar la firma RSA con la clave publica. Si no verifica → `valida: false`.
6. Retornar resultado con hash_original, hash_actual, algoritmo, firmado_at, medico_id.

## 6. Endpoints publicos y privados

### Privados (requieren autenticacion)

| Endpoint | Metodo | Descripcion | Archivo |
|----------|--------|-------------|---------|
| `/api/firma/configurar` | GET | Verifica si el medico tiene claves | `src/app/api/firma/configurar/route.ts` |
| `/api/firma/configurar` | POST | Provisiona claves RSA (idempotente) | `src/app/api/firma/configurar/route.ts` |
| `/api/2fa/generar` | POST | Genera OTP de 6 digitos, lo envia por email | `src/app/api/2fa/generar/route.ts` |
| `/api/2fa/validar` | POST | Valida OTP ingresado por el medico | `src/app/api/2fa/validar/route.ts` |
| `/api/documentos/[id]/pdf` | GET | Genera PDF con sello QR si hay firma | `src/app/api/documentos/[id]/pdf/route.ts` |

### Publicos (sin autenticacion)

| Endpoint | Metodo | Descripcion | Archivo |
|----------|--------|-------------|---------|
| `/api/verificar/[id]` | GET | Verifica autenticidad de receta por UUID | `src/app/api/verificar/[id]/route.ts` |
| `/verificar/[id]` | GET | Pagina publica de verificacion (SSR) | `src/app/verificar/[id]/page.tsx` |

### Pendiente de crear

| Endpoint | Metodo | Descripcion |
|----------|--------|-------------|
| `/api/firma/firmar` | POST | Ejecuta `firmarReceta()` (conecta OTP validado con firma) |

## 7. Rate limiting y timing constante

Endpoint `/api/verificar/[id]` (`src/app/api/verificar/[id]/route.ts`):

- **Rate limiting:** 10 requests por minuto por IP. Implementado con Map en memoria. Per-instance en Vercel serverless (aceptable para MVP, migrar a Vercel KV/Upstash al escalar).
- **Timing constante:** Toda respuesta tarda al menos 500ms (`withConstantTime()`). Evita que un atacante infiera si un UUID existe o no por diferencia de latencia.
- **Validacion UUID:** Regex estricto antes de consultar la base de datos. UUIDs invalidos reciben respuesta generica "Receta no encontrada" (404) con el mismo delay.
- **Try/catch dentro de withConstantTime:** Si `verificarFirma()` lanza excepcion, el timing constante se mantiene.

OTP rate limiting (`src/lib/firma/otp.ts`):

- **Cooldown:** 30 segundos entre generaciones de OTP.
- **Max intentos:** 5 intentos por OTP. Al 5to intento fallido, el OTP se invalida.
- **Lockout global:** 10 OTPs invalidados en 24h → bloqueo de 1 hora para ese medico.

## 8. Middleware: timeout y exenciones

Archivo: `src/middleware.ts`

- **Inactivity timeout:** 8 horas (Anexo I). Si no hay actividad, la sesion se invalida y redirige a login con `?reason=inactivity`.
- **Exenciones de timeout:** Las rutas de `/verificar/`, `/api/`, `/auth/`, `/medico/consulta/`, `/sala-espera`, `/beta-access` estan exentas del timeout.
- **X-Robots-Tag:** Las rutas `/dr/` y `/verificar/` envian `noindex, nofollow` via header HTTP.
- **Impacto en firma:** El flujo de firma ocurre dentro de `/medico/consulta/` (exento) y llama a `/api/` (exento). No hay riesgo de que el timeout interrumpa una firma.

## 9. Decisiones de diseno no obvias

**¿Por que canonicalJSON y no JSON.stringify?**
PostgreSQL JSONB reordena las keys alfabeticamente al almacenar. Si usamos `JSON.stringify` para hashear al firmar y al verificar, el orden de keys puede diferir, produciendo hashes distintos para el mismo contenido. `canonicalJSON()` ordena keys recursivamente antes de serializar, garantizando hashes reproducibles.

**¿Por que AES-256-GCM y no solo guardar la clave privada encriptada con la password del medico?**
La clave privada se usa server-side (el medico nunca la ve). Si usaramos una derivacion de password, necesitariamos la password del medico en cada firma, lo cual es impractico con auth de Supabase. La master key (`FIRMA_MASTER_KEY`) permite desencriptar server-side sin interaccion del usuario. GCM proporciona autenticacion de integridad ademas de confidencialidad.

**¿Por que firma electronica (Art. 5) y no firma digital (Art. 2)?**
La firma digital requiere un certificado emitido por un certificador licenciado (ej: AFIP, ONTI). Esto implica un proceso largo de homologacion y costos recurrentes por certificado. La Ley 27.553 habilita explicitamente "firma digital o electronica" para recetas. La firma electronica es viable para MVP y se puede migrar a firma digital en el futuro si es necesario. La diferencia practica es la carga probatoria (en firma electronica, quien la invoca debe probar su validez; en firma digital, se presume valida).

**¿Por que el QR no tiene texto legal?**
El sello anterior incluia "FIRMADO ELECTRONICAMENTE", "Art. 5 Ley 25.506", hash truncado y URL como texto. Diego decidio adoptar estilo RCTA (minimalista): solo QR + fecha. La justificacion legal ya esta en la Seccion A y B del footer. Duplicarla en el sello es redundante y ensucia visualmente el documento (Carolina aprobo la remocion).

**¿Por que OTP por email y no por SMS o app authenticator?**
Email es el canal que ya tenemos verificado para cada medico (se usa para crear la cuenta). SMS tiene costo por mensaje y dependencia de proveedor. App authenticator (TOTP) requiere onboarding adicional que complica la UX para medicos de 70 anos. Email es el balance correcto para MVP.

**¿Por que el numero de receta es SHA-256 del UUID y no secuencial?**
Un numero secuencial expone cuantas recetas se emitieron (informacion comercial sensible) y es predecible. SHA-256 del UUID es determinístico (misma receta = mismo numero en cada descarga), no revela el volumen de emision, y tiene 4 mil millones de combinaciones con 8 hex chars.

## 10. Tests: que cubren y como correrlos

### Ejecucion

```bash
# Todos los tests
for f in tests/unit/*.test.ts; do npx tsx "$f"; done

# Test especifico
npx tsx tests/unit/fixes-auditoria-final.test.ts
```

### Cobertura por archivo

| Archivo | Tests | Que cubre |
|---------|-------|-----------|
| `canonical-json.test.ts` | 14 | Serializacion determinística, edge cases (null, nested, arrays) |
| `firma-crypto.test.ts` | 12 | RSA keygen, encrypt/decrypt, sign/verify, SHA-256 |
| `firma-receta-otp.test.ts` | 9 | Validacion OTP pre-firma: expirado, scope, medico incorrecto |
| `otp-rate-limiting.test.ts` | 9 | Cooldown, lockout 24h, max intentos |
| `modal-otp-firma.test.ts` | 19 | Estados del modal, timer countdown, reenvio |
| `banner-firma-electronica.test.ts` | 18 | Estados del banner, auto-hide, visibilidad |
| `sello-firma-pdf.test.ts` | 31 | QR URL HTTPS, fecha DD/MM/YYYY, Section B texto, no hash/titulo/ley en sello |
| `verificar-publica.test.ts` | 23 | Rate limiting, timing constante, UUID validation, response shape, no medical data |
| `fixes-auditoria-final.test.ts` | 26 | OTP one-use, nro receta deterministico, modelo activa/revocada, ventana 5min, firma_logs shape, anti-DELETE |
| `cuil.test.ts` | 9 | Validacion de formato CUIL |
| **Total** | **170** | |

---

# PARTE 3 — REGULATORIO / TRAZABILIDAD

*Para organismos (AAIP, ReNaPDiS, Ministerio de Salud, auditores).*

---

## 1. Identificacion de recetas en el sistema

Cada receta tiene un UUID v4 unico generado por la base de datos (`gen_random_uuid()`). Este UUID es el identificador primario e inmutable del documento.

Para presentacion visual, se genera un numero de receta determinístico con formato `REC-YYYY-XXXXXXXX` donde `XXXXXXXX` es un derivado SHA-256 del UUID. Este numero aparece en el PDF junto con un codigo de barras Code128.

**CUIR (Codigo Unico de Identificacion de Receta):** Pendiente de implementacion. Requiere integracion con DNSISa/REFEPS para obtener el formato y validacion oficiales. El UUID actual funciona como identificador unico interino.

## 2. Integridad del documento

La integridad se garantiza mediante hash criptografico:

1. Al firmar, se serializa el contenido clinico (`datos_prescripcion`) con `canonicalJSON()` (orden deterministico de keys) y se calcula `SHA-256(contenido)`.
2. El hash se almacena en `recetas.firma_digital.hash` y en `firma_logs.hash`.
3. Al verificar, se recalcula el hash del contenido actual y se compara con el hash original.
4. Si los hashes difieren, el documento fue alterado despues de la firma. La pagina de verificacion lo indica explicitamente.

El hash es irreversible: no se puede reconstruir el contenido clinico a partir del hash.

## 3. Identidad del firmante

La identidad del firmante se establece en tres capas:

1. **Autenticacion de sesion:** El medico esta autenticado via Supabase Auth (email + password). Solo medicos verificados con rol `medico` pueden firmar.
2. **Par de claves RSA-2048:** Cada medico tiene un par de claves unico. La clave privada esta encriptada con AES-256-GCM y solo se puede usar server-side con la master key.
3. **Segundo factor (OTP):** Antes de cada firma, el medico recibe un codigo de 6 digitos por email y lo ingresa en la plataforma. El codigo expira en 5 minutos, permite maximo 5 intentos, y solo puede usarse para firmar una receta.

## 4. No repudio

El no repudio se garantiza mediante la tabla `firma_logs`, que es independiente de la tabla `recetas`:

| Dato registrado | Proposito |
|-----------------|-----------|
| `receta_id` | Que receta se firmo |
| `medico_id` | Quien firmo |
| `hash` | Hash del contenido al momento de firmar |
| `firmado_at` | Cuando se firmo (timestamp con timezone) |
| `otp_id` | Con que codigo OTP se autorizo |
| `ip` | Desde que IP se firmo |
| `user_agent` | Con que navegador |
| `clave_id` | Con que clave especifica se firmo |

**Inmutabilidad:** La tabla tiene trigger BEFORE DELETE que impide borrar registros. No tiene policies de UPDATE para authenticated. Solo service role puede insertar.

**Politica de retencion:** 10 anos (recomendacion de Carolina, alineado con plazos de prescripcion de responsabilidad medica).

## 5. Cumplimiento Anexo II del Ministerio

El Anexo II establece que las recetas electronicas deben incluir "firma electronica O hash de integridad". Docto implementa **ambos**:

- **Firma electronica:** RSA-SHA256 con par de claves por medico + OTP como segundo factor. Conforme al Art. 5 de la Ley 25.506.
- **Hash de integridad:** SHA-256 sobre el contenido serializado con `canonicalJSON()`. Almacenado en `recetas.firma_digital.hash` y verificable publicamente via `/verificar/{id}`.

## 6. Politica de retencion de claves revocadas

Las claves revocadas **nunca se borran** de la tabla `medico_claves`. El trigger `trg_no_delete_medico_claves` (BEFORE DELETE, RAISE EXCEPTION) impide el borrado incluso con service role.

Una clave revocada se marca con:
- `activa = false`
- `revocada_at = timestamp de revocacion`
- `motivo_revocacion = texto libre`

La clave publica de una clave revocada sigue disponible para verificar firmas historicas que fueron emitidas con esa clave. La verificacion usa `firma_logs.clave_id` para encontrar la clave especifica que se uso al firmar.

Solo puede haber una clave activa por medico (unique index parcial `WHERE activa = true`).

## 7. Politica de retencion de logs

Los registros de `firma_logs` se retienen **10 anos** desde la fecha de firma. Este plazo esta alineado con:
- Plazo de prescripcion de responsabilidad medica en Argentina
- Recomendacion de Carolina (asesora legal interna)
- Requisitos de trazabilidad de la Resolucion 2214/2025

Los registros de `otp_firma` se retienen indefinidamente como evidencia de los actos de autenticacion de segundo factor.

La implementacion de purgado automatico despues de 10 anos queda como tarea futura. Actualmente, ningun registro se borra (triggers anti-DELETE activos).

## 8. Plataforma ID 0270 — ReNaPDiS

- **Plataforma:** Docto
- **Numero de plataforma:** 0270
- **Registro:** ReNaPDiS (Registro Nacional de Plataformas Digitales Sanitarias)
- **Numero RL:** RL-2026-48984072-APN-SSVEIYES#MS
- **Expediente original:** EX-2026-41816871-APN-SSVEIYES#MS
- **Estado:** Inscripta y validada (RL recibido 18/05/2026)
- **Variable de entorno:** `RENAPDIS_RL_NUMBER` (configurada en Vercel produccion)

---

# PARTE 4 — PENDIENTES PRE-LANZAMIENTO

---

## 1. Revision por abogado matriculado

Todos los textos con efecto legal vinculante requieren revision profesional antes de que el modulo este disponible para usuarios reales. Esto incluye:

- Footer del PDF (Secciones A y B)
- Textos de la pagina publica /verificar
- Disclaimer de privacidad
- Implicancias legales de usar firma electronica (Art. 5) vs firma digital (Art. 2)
- Responsabilidad de Docto como plataforma emisora

## 2. Contrato Docto-Medico

Actualmente, el medico acepta la firma electronica de forma implicita al configurarla y usarla. Se necesita un contrato o addendum explicito que incluya:

- Aceptacion especifica de que las recetas seran firmadas electronicamente
- Reconocimiento de que la clave privada es personal e intransferible
- Procedimiento ante compromiso de credenciales
- Responsabilidad sobre el contenido firmado
- Clausula de revocacion

Sprint separado.

## 3. Consentimiento del paciente

Validar con Carolina si se requiere un consentimiento explicito del paciente para recibir documentos firmados electronicamente. Posibles formatos:

- Checkbox en el onboarding del paciente
- Mencion en los terminos y condiciones generales
- Informacion previa a la consulta

## 4. Pentest externo

Sugerido (no obligatorio para MVP). Un pentest externo verificaria:

- Resistencia del rate limiting en endpoint publico
- Intentos de enumeracion de UUIDs
- Seguridad de la master key y claves privadas
- Correcta implementacion de timing constante

## 5. Endpoint `/api/firma/firmar`

La funcion `firmarReceta()` existe y esta completa, pero no tiene ruta HTTP que la invoque. El endpoint POST que conecta el frontend con el backend de firma es el ultimo paso para activar la funcionalidad. Sprint de integracion UI.

## 6. Integracion ModalOTPFirma en WorkspaceConsulta

El componente `ModalOTPFirma.tsx` existe y funciona, pero no esta importado en ningun componente de la app. Debe integrarse en `WorkspaceConsulta.tsx` para que el medico pueda firmar recetas desde la interfaz. Sprint de integracion UI.

## 7. Numero de receta persistente

Actualmente, el numero de receta se genera deterministicamente a partir del UUID (SHA-256), por lo que es el mismo en cada descarga. Sin embargo, no se almacena en la base de datos. Para trazabilidad completa, deberia guardarse en `recetas.numero_receta` al momento de emision. Deuda tecnica menor.

---

*Documento generado el 22 de mayo de 2026. Ultima actualizacion: 22/05/2026.*
*Docto — Plataforma 0270, ReNaPDiS. Sprint Bus Fase 1 + 2.*
