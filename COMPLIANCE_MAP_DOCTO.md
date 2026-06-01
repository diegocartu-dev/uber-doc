# COMPLIANCE MAP DOCTO

Mapa completo de compliance regulatorio, legal, fiscal y técnico 
para operar comercialmente con médicos y pagos reales.

Basado en: auditoría del repo, investigación de normativa argentina 
vigente, y lectura legal de Dra. Carolina.

Última revisión: 20/05/2026.

---

## RESUMEN EJECUTIVO

### BLOQUEANTES — resolver antes de cobrar

| # | Item | Norma | Estado actual | Esfuerzo |
|---|------|-------|---------------|----------|
| B1 | Consentimiento informado por consulta | Ley 27.553 art. 7, Ley 26.529 art. 5-6 | No existe. Solo hay aceptación de TyC en triage, no CI por consulta | Pantalla + registro en DB |
| B2 | Política de privacidad separada | Ley 25.326 art. 6 | No existe como página dedicada. Solo sección genérica en TyC | Documento legal + página |
| B3 | Bloqueo de recetas controladas | Decreto 63/2024, Ley 17.818, Ley 19.303 | No hay bloqueo. Un médico podría recetar psicotrópicos sin restricción | Lista negra + UI |

### URGENTES — resolver en 30 días

| # | Item | Norma | Estado actual |
|---|------|-------|---------------|
| U1 | Corregir retención datos clínicos en TyC (5→10 años) | Ley 26.529 art. 18 | TyC dicen 5 años, ley exige 10 |
| U2 | Trazabilidad número de receta | Decreto 63/2024 art. 8 | Número aleatorio, no verificable |
| U3 | TyC específicos para médicos | Buena práctica legal | Solo hay declaración profesional en onboarding, no contrato |
| U4 | Acuerdo tratamiento de datos médico-Docto | Ley 25.326 art. 11, 25 | No existe |
| U5 | Declarar transferencia internacional de datos | Ley 25.326 art. 12 | No declarada (Supabase/AWS fuera de Argentina) |
| U6 | Verificar actividad AFIP (CLAE correcto) | Ley 11.683 | No verificado |

### RECOMENDADOS — próximo trimestre

| # | Item | Estado actual |
|---|------|---------------|
| R1 | Seguro RC profesional para Docto | No contratado |
| R2 | Exigir declaración seguro mala praxis a médicos | No se solicita |
| R3 | RL definitivo ReNaPDiS (cargar env vars) | En trámite, env vars vacías |
| R4 | Renovación anual AAIP | Agendar recordatorio |
| R5 | Constitución SRL (opcional, a futuro) | No iniciada — Docto opera como Diego RI persona física; SRL es opción futura con volumen, NO bloqueante (ver §R5 abajo) |
| R6 | Convenio Multilateral IIBB | No inscripto |

---

## 1. REGULATORIO SANITARIO

### 1.1 ReNaPDiS — Inscripción como plataforma

**Estado actual:** Aprobado. RL-2026-48984072-APN-SSVEIYES#MS 
(IF-2026-48984138). ID plataforma: `0270`.

**En código:** Footer de recetas tiene lógica condicional 
(`receta.ts:505-509`). Si `RENAPDIS_RL_NUMBER` está seteada, 
muestra RL definitivo. Si no, muestra expediente en trámite.

**Variables de entorno en Vercel:** `RENAPDIS_RL_NUMBER` y 
`RENAPDIS_EXPEDIENTE` — ambas vacías, pendientes de carga.

**Norma:** Res. 1959/2024 SSVEIYES, Ley 27.553, Decreto 98/2023.

**Obligación:** Inscripción obligatoria para emitir recetas con 
validez nacional. BLOQUEANTE.

**Estado:** CUMPLE (aprobado). Falta cargar env vars para que 
aparezca el RL definitivo en los PDFs.

**Acción:** Cargar `RENAPDIS_RL_NUMBER` en Vercel con el número 
de RL definitivo.

---

### 1.2 Habilitación jurisdiccional adicional

**Norma:** Decreto 98/2023 establece que las plataformas deben 
estar registradas ante la autoridad jurisdiccional competente 
(CABA/provincia) E inscriptas en el Ministerio de Salud (ReNaPDiS).

**Estado actual:** Solo ReNaPDiS (nacional). No hay evidencia de 
registro jurisdiccional (ej: Ministerio de Salud de CABA).

**Lectura legal Carolina:** ZONA GRIS. La práctica regulatoria 
argentina viene tolerando la operación con ReNaPDiS solo, pero 
técnicamente son DOS registros.

**Bloqueante:** NO en la práctica actual, pero investigar si CABA 
exige registro separado.

---

### 1.3 Ley 27.553 — Cumplimiento punto por punto

**Norma:** Ley 27.553 (Telemedicina), arts. 1-13.

| Obligación | Estado | Nota |
|------------|--------|------|
| Facilitar teleconsultas con profesionales habilitados | CUMPLE | Declarado en TyC sección 2 |
| No ejercer medicina directamente (intermediario) | CUMPLE | Bien declarado en TyC |
| Inscripción ReNaPDiS | CUMPLE | Aprobado |
| Verificación matrícula SISA/REFEPS | PARCIAL | Declarado en TyC sec. 4, pero solo simulación en código |
| Consentimiento informado por consulta | NO CUMPLE | **BLOQUEANTE B1** — ver sección 4.2 |
| Seguridad, confidencialidad, integridad datos | CUMPLE | RLS, auth, HTTPS |
| Cumplir Ley 25.326 y Ley 26.529 | PARCIAL | Ver secciones 3 y 4 |

---

### 1.4 Decreto 98/2023 — Reglamentación telemedicina

**Novedades importantes:**
- Crea la **Licencia Sanitaria Federal** basada en REFEPS
- Crea la **Clave Única de Identificación de Profesional Sanitario**
- Exige registro jurisdiccional + nacional (ver 1.2)

**Estado Docto:** No integra Licencia Sanitaria Federal. La 
verificación de matrícula es simulada (SISA_MODE=simulacion).

---

### 1.5 Telemedicina interjurisdiccional

**Pregunta:** ¿Un médico de CABA puede atender paciente de Córdoba?

**Estado normativo:** ZONA GRIS.
- Ley 27.553 habilita telemedicina a nivel nacional
- Pero NO deroga leyes provinciales que exigen matrícula local
- Decreto 98/2023 crea Licencia Sanitaria Federal (en proceso)
- Mayo 2025: Ministerio anunció Matrícula Única Digital y Nacional 
  (implementación en proceso)
- No hay jurisprudencia contra plataformas por atención 
  interjurisdiccional

**Recomendación Carolina:** Solicitar tipo de matrícula 
(nacional/provincial) en onboarding. Si solo provincial, 
disclaimer de alcance limitado.

**Bloqueante:** NO, pero documentar política.

---

### 1.6 Resolución 282/2024 MSAL

**No existe.** Verificado en Boletín Oficial, InfoLEG y 
argentina.gob.ar. Las resoluciones 282 encontradas son 
designaciones de personal, no regulación de telemedicina.

---

## 2. RECETAS DIGITALES

### 2.1 Decreto 63/2024 — Obligaciones

**Norma:** Decreto 63/2024 (reglamentario de Ley 27.553, Título II).

| Requisito | Estado en código | Archivo |
|-----------|-----------------|---------|
| Datos prescriptor (nombre, matrícula, especialidad, domicilio) | CUMPLE | `receta.ts:235-292` |
| Datos paciente (nombre, DNI, sexo, fecha nac, cobertura) | CUMPLE | `receta.ts:295-329` |
| Número de receta único y trazable | PARCIAL — aleatorio, no verificable | `receta.ts:86-94` |
| Firma del profesional | PARCIAL — visual + barcode, no criptográfica | `receta.ts:396-444` |
| Inscripción ReNaPDiS | CUMPLE | Aprobado |
| Barcode con matrícula | CUMPLE | Code128 en `receta.ts:422-443` |

**Hallazgo crítico en número de receta:** `generarNumeroReceta()` 
(línea 86-94) genera `REC-{año}-{8 chars alfanuméricos aleatorios}`. 
No es secuencial ni determinista. El decreto exige trazabilidad.

**Acción urgente U2:** Cambiar a esquema secuencial o basado en 
UUID del documento en Supabase.

---

### 2.2 Firma electrónica vs firma digital

**Estado actual:** Docto usa firma ELECTRÓNICA (barcode de 
matrícula + nombre del médico en PDF). NO es firma digital en 
términos de Ley 25.506.

**Diferencia legal crítica:**
- **Firma electrónica** (lo que Docto tiene): válida por Ley 25.506 
  art. 5, pero con carga de prueba invertida. Si alguien impugna, 
  Docto/el médico deben demostrar autenticidad.
- **Firma digital** (lo que Docto NO tiene): presunción de 
  autenticidad e integridad (art. 7 Ley 25.506). Requiere 
  certificado de autoridad certificante licenciada por ONTI + 
  infraestructura PKI.

**Para recetas comunes:** Firma electrónica es suficiente según 
Decreto 63/2024 art. 4. Docto PUEDE operar con lo que tiene.

**Para recetas controladas:** Se necesita firma digital 
obligatoriamente. Docto NO puede emitirlas. → **BLOQUEANTE B3.**

**Footer del PDF actual** (`receta.ts:495-501`): dice "firmado 
electrónica o digitalmente según corresponda". Esto es correcto 
pero ambiguo — en la práctica es solo electrónica.

**Bloqueante:** NO para recetas comunes. SÍ para controlados 
(resolución: bloquear emisión).

---

### 2.3 CUIR (Código Único de Identificación de Receta)

**Norma:** Decreto 63/2024 art. 8.

**Estado real:** El sistema de asignación de CUIR del Ministerio 
de Salud **NO está operativo a nivel nacional** (mayo 2026). No 
hay API ni proceso de asignación masiva implementado.

**En código:** Docto usa su propio número `REC-YYYY-XXXXXXXX`. 
No hay integración con CUIR nacional.

**Riesgo:** Nulo en práctica actual. Ninguna farmacia exige CUIR 
porque el sistema no existe.

**Bloqueante:** NO. Dejar placeholder para cuando se active.

---

### 2.4 Recetas controladas (psicotrópicos/estupefacientes)

**Estado:** PROHIBIDO para Docto con infraestructura actual.

**Norma:** Ley 17.818 (estupefacientes), Ley 19.303 
(psicofármacos), Decreto 345/2024, disposiciones ANMAT.

**Requisitos que Docto NO cumple:**
- Firma digital del prescriptor (no electrónica)
- Recetario especial numerado (físico o digital certificado)
- Trazabilidad completa ante ANMAT
- Formularios oficializados por Ministerio de Salud

**En código:** No hay ningún bloqueo. Un médico podría recetar 
cualquier medicamento sin restricción.

**Acción BLOQUEANTE B3:** Implementar lista negra de medicamentos 
controlados (listas I-IV ANMAT). Si el médico intenta recetar uno, 
mostrar: "Este medicamento requiere receta especial que no puede 
emitirse por esta plataforma. El paciente deberá consultar 
presencialmente."

---

### 2.5 Farmalink

**Qué es:** Empresa privada (no estatal) que administra 
dispensación de medicamentos en >12.000 farmacias. Conecta 
sistemas emisores de receta con farmacias, valida en línea.

**Estado Docto:** Esperando respuesta (contacto iniciado).

**Bloqueante:** NO. Farmalink opera del lado farmacia/financiador, 
no del emisor de receta. Las recetas de Docto son válidas sin 
Farmalink — simplemente no se dispensan automáticamente en cadenas 
que usan ese sistema.

---

### 2.6 Vademécum

**Estado en código:** Backfill de 8.029/8.038 ítems con 
`forma_farmacéutica` (Sprint Receta PR1, 15/05).

**Verificación pendiente:** Confirmar alineación con ANMAT/PAMI 
actual. No se encontró proceso de actualización periódica.

**Bloqueante:** NO, pero agendar actualización.

---

## 3. DATOS PERSONALES SENSIBLES

### 3.1 AAIP — Estado y obligaciones permanentes

**Estado:** Aprobado.
- Responsable: RL-2026-36086505-APN-DNPDP#AAIP
- Base de Datos: RL-2026-41929595-APN-DNPDP#AAIP 
  (IF-2026-41929601)

**En código:** Footer (`Footer.tsx:82`) muestra "AAIP 
RL-2026-36086505". TyC (`TerminosContent.tsx:89`) referencia 
el legajo.

**Obligaciones permanentes post-aprobación:**

| Obligación | Estado | Norma |
|------------|--------|-------|
| Renovación/confirmación anual de inscripción | No agendada | Disp. AAIP 11/2006 |
| Responder requerimientos AAIP en 10 días hábiles | OK (Diego como responsable) | Ley 25.326 |
| Mantener medidas de seguridad declaradas | OK (RLS, auth, HTTPS) | Ley 25.326 |
| Actualizar inscripción si cambia infraestructura | Pendiente si se migra de Supabase | Ley 25.326 |
| Registro interno de incidentes de seguridad | No implementado | Disp. AAIP 7/2022 |

**Acción R4:** Agendar renovación anual AAIP.

---

### 3.2 DPO (Delegado de Protección de Datos)

**Estado normativo:** NO obligatorio en Argentina.

**Norma:** Ley 25.326 vigente NO exige DPO, ni siquiera para 
datos de salud. El proyecto de reforma (no aprobado) lo contempla.

**En código:** No hay referencia a DPO. Contacto de datos: 
soporte@docto.com.ar.

**Lectura Carolina:** Diego puede ser la persona responsable de 
responder requerimientos como titular de la base inscripta.

**Bloqueante:** NO.

---

### 3.3 Convenios de tratamiento de datos médico-plataforma

**Estado:** NO existe.

**Norma:** Ley 25.326 art. 11, 25.

**Problema:** Cuando el médico usa Docto, Docto actúa como 
"encargado de tratamiento" de datos de salud generados por el 
médico. La ley establece que esta relación debe estar regulada 
contractualmente.

**Riesgo:** Si un paciente reclama ante AAIP, puede haber 
confusión sobre responsabilidad (médico vs Docto) sin cobertura 
contractual.

**Acción U4:** Incluir acuerdo simplificado de tratamiento de 
datos en TyC del médico o como cláusula del onboarding.

---

### 3.4 Notificación de brechas

**Estado normativo:** NO obligatorio en Argentina (Ley 25.326 no 
lo exige). Disposición AAIP 7/2022 es recomendación voluntaria.

**Recomendación Carolina:** Tener protocolo interno: detección → 
contención → evaluación → notificación voluntaria a AAIP si afecta 
datos de salud. Plazo razonable: 72h (estándar GDPR como buena 
práctica).

**Bloqueante:** NO.

---

### 3.5 Derecho de supresión / Right to be forgotten

**Norma:** Ley 25.326 art. 16 vs Ley 26.529 art. 18.

**Tensión legal:**
- Paciente puede pedir supresión (Ley 25.326)
- Datos clínicos deben conservarse 10 años mínimo (Ley 26.529)

**Resolución:** Datos clínicos (diagnósticos, recetas) NO pueden 
suprimirse antes de 10 años. Datos de perfil (email, teléfono) SÍ 
pueden suprimirse a pedido.

**En código:**
- TyC dicen "5 años desde última actividad" → **INSUFICIENTE** 
  para datos clínicos. Debe ser 10 años. → **Acción U1.**
- No hay endpoint ni proceso para solicitudes de supresión
- Doctor tiene soft delete (`dado_de_baja`). Paciente tiene 
  cascade delete (hard delete al borrar auth user)
- Contacto: soporte@docto.com.ar (manual)

**Acción U1:** Corregir TyC: datos clínicos = 10 años (obligación 
legal), datos de perfil = 5 años o hasta supresión.

---

### 3.6 Transferencia internacional de datos

**Norma:** Ley 25.326 art. 12. Prohíbe transferencia a países sin 
protección adecuada salvo excepciones (consentimiento del titular).

**Estado:** Supabase (AWS), Vercel, y otros proveedores tienen 
servidores fuera de Argentina. No está declarado en los TyC.

**Acción U5:** Declarar en política de privacidad e invocar 
excepción de consentimiento del titular.

---

### 3.7 Audit log de accesos a datos sensibles

**En código:**

**Admin audit log:** Existe y es robusto.
- Tabla `admin_audit_log` (migración 055)
- RLS activo, solo server-side con service role key
- Acciones logueadas: aprobar/rechazar/suspender médicos, 
  pausar/bloquear pacientes, forzar cierre consulta, cambiar 
  comisiones, exportar CSV, etc.
- Archivo: `src/lib/admin-audit.ts:75-113`

**Acceso a datos clínicos por médicos:** NO logueado.
- No hay registro de cuándo un médico accede a datos de un paciente
- No hay audit trail de documentos clínicos generados
- eventos_funnel solo trackea eventos de pago (mp_oauth, 
  pago_creado, etc.), no accesos clínicos

**Gap importante:** Para datos de salud (datos sensibles), la 
trazabilidad de accesos es una obligación implícita de la Ley 
25.326 (medidas de seguridad proporcionales a la sensibilidad).

---

## 4. VALIDACIÓN DE IDENTIDAD

### 4.1 SISA / REFEPS — Estado real de integración

**En código:** `src/app/api/sisa/route.ts` (84 líneas)

**Modo actual:** `SISA_MODE` env var → defaults a "simulacion"

**Simulación (líneas 29-52):**
- Matrícula "000000" → no encontrado
- Matrícula "999999" → baja temporal
- Formato válido (4-6 dígitos matrícula, 7-8 DNI) → respuesta 
  activa simulada

**Producción (líneas 79-82):** Retorna "no disponible todavía"

**No hay integración real con SISA/REFEPS.** La verificación de 
matrícula es 100% simulada.

**API de SISA disponible:**
- SOAP: `https://sisa.msal.gov.ar/sisa/services/profesionalService`
- REST: `https://sisa.msal.gov.ar/sisa/services/rest/profesional/obtener`
- Requiere cuenta y permisos — solicitar a soporte@sisa.msal.gov.ar
- Sin costo aparente pero requiere convenio/autorización

**Bloqueante para operar con médicos reales:** SÍ — la verificación 
de matrícula es obligatoria (Decreto 98/2023). Pero puede resolverse 
con verificación manual (Diego verifica matrícula en el buscador 
público de SISA antes de aprobar) para los primeros médicos beta. 
La integración API es para escalar.

---

### 4.2 Verificación continua de matrícula

**Estado:** No implementada. Solo se verifica (simuladamente) al 
momento del alta.

**Riesgo:** Un médico podría ser suspendido por su colegio después 
del alta en Docto y seguir atendiendo.

**Recomendación:** Para beta, verificación manual periódica. A 
escala, integrar API SISA con cron de reverificación.

---

### 4.3 RENAPER

**Estado:** Diferido. No hay integración ni plan inmediato.

**Para qué serviría:** Validar identidad del paciente (DNI real).

**Bloqueante:** NO para operar. Es mejora de seguridad.

---

## 5. CONTRACTUAL Y CONSUMER

### 5.1 Términos y Condiciones

**Archivo:** `src/app/terminos/TerminosContent.tsx`

**Estado:** COMPLETOS para pacientes. Incluyen:
- Identidad responsable (Diego, CUIT, domicilio) ✓
- Naturaleza del servicio (intermediario) ✓
- Disclaimer emergencias ✓
- Política reembolsos detallada ✓
- Jurisdicción y ley aplicable ✓
- Contacto ✓

**Problemas detectados:**

a) **Retención 5 años** (línea 100) → debe ser 10 años para datos 
clínicos (Ley 26.529 art. 18). → **U1**

b) **Comisión fija 15%** (línea 66) → el modelo real tiene 3 tiers 
(5/10/15%). Actualizar. 

c) **"Docto Telemedicina S.A.S."** en copyright (línea 74) → 
Diego opera como RI persona física. Inconsistencia. Corregir.

d) **No hay base legal explícita** para tratamiento de datos 
sensibles (consentimiento expreso, art. 5 inc. 2 Ley 25.326).

---

### 5.2 Política de Privacidad

**Estado:** NO EXISTE como página dedicada. **BLOQUEANTE B2.**

**En código:** Footer (`Footer.tsx:12-17`) tiene link placeholder 
para "Privacidad" pero no hay ruta `/privacidad`.

**Norma:** Ley 25.326 art. 6 exige informar al titular ANTES de 
recoger datos: finalidad, existencia de la base, identidad del 
responsable, derechos ARCO, carácter obligatorio/facultativo.

**Contenido mínimo requerido:**
- Qué datos se recolectan (incluir datos de salud como sensibles)
- Finalidad de cada tipo de dato
- Base legal del tratamiento
- Destinatarios (Supabase, MP, proveedores)
- Transferencia internacional (art. 12)
- Plazo de conservación (10 años clínicos, 5 años perfil)
- Derechos del titular (acceso, rectificación, supresión)
- Contacto del responsable
- Referencia a inscripción AAIP

---

### 5.3 Consentimiento informado para telemedicina

**Estado:** NO EXISTE como flujo dedicado. **BLOQUEANTE B1.**

**Lo que hay:**
- Triage (`src/app/triage/page.tsx:182-390`): scroll-to-unlock + 
  2 checkboxes (TyC + mayor de 18). Incluye lenguaje de CI en el 
  texto scrolleable pero NO es un CI específico por consulta.
- NO hay pantalla de CI antes de entrar a la videollamada.
- NO se registra CI con timestamp por consulta en la base.

**Norma:** Ley 27.553 art. 7, Ley 26.529 art. 5-6.

**Contenido mínimo obligatorio del CI para telemedicina:**
- Que la consulta se realiza a distancia
- Limitaciones de telemedicina vs presencial
- Que el médico puede derivar a presencial
- Que se almacenarán datos de la consulta
- Derecho a interrumpir la teleconsulta
- Que NO es servicio de emergencias

**Implementación requerida:**
- Pantalla previa a cada consulta con aceptación explícita
- Guardar en DB: paciente_id, consulta_id, timestamp, versión 
  del consentimiento

---

### 5.4 Política de reembolsos

**Estado:** EXISTE dentro de TyC (sección 5, líneas 65-84). 
Cumple Ley 24.240.

**Implementación:** Webhook de MP maneja status "refunded" 
(`/api/pago/webhook/route.ts:234`). Refunds son manuales (admin 
o panel MP).

**Nota Ley 24.240 art. 34:** Derecho de revocación 10 días en 
compras no presenciales. Docto puede argumentar excepción (servicio 
en fecha determinada), pero conviene incluir cláusula explícita.

**Bloqueante:** NO.

---

### 5.5 Descargo médico legal

**Estado:** Existe embebido en TyC (sección 2 + disclaimer 
emergencias). No hay página dedicada "/aviso-medico".

**Footer:** Tiene link placeholder para "Aviso médico" sin ruta.

**Bloqueante:** NO (está cubierto en TyC), pero crear página 
dedicada sería mejor práctica.

---

## 6. FISCAL / TRIBUTARIO

### 6.1 Diego como Responsable Inscripto

**Estado:** VÁLIDO para operar.

**Norma:** Ley 11.683, Ley IVA, Ley Ganancias.

Diego puede operar la plataforma como RI persona física. Los 
trámites AAIP y ReNaPDiS a nombre de Diego RI son perfectamente 
válidos.

**Limitación:** Responsabilidad ilimitada y personal. El patrimonio 
de Diego responde por todo sin separación patrimonial.

**Si se crea SRL después:** AAIP y ReNaPDiS requieren nueva 
inscripción a nombre de la SRL + baja de persona física. No es 
automático. Los documentos emitidos durante el período RI siguen 
válidos.

**Recomendación Carolina:** Operar como RI para lanzamiento. 
Constituir SRL en paralelo para limitar responsabilidad cuando haya 
volumen real. Si la SRL se demora 6+ meses, operar con persona 
física y migrar después. Si se crea en 2-3 meses, podría convenir 
esperar para inscribir directamente a nombre de la SRL.

**Bloqueante:** NO.

---

### 6.2 IIBB Convenio Multilateral

**Norma:** Convenio Multilateral 18/8/77, Ley 23.548.

**Aplica si:** Docto tiene pacientes/médicos en más de una 
provincia (genera "sustento territorial").

**Estado:** NO inscripto en CM. Para plataforma 100% digital 
operada desde CABA, hay jurisprudencia divergente.

**Recomendación Carolina:** Para lanzamiento, tributar solo en 
CABA. Cuando haya volumen significativo en otras provincias, 
consultar contador especializado.

**Bloqueante:** NO para lanzamiento. SÍ cuando haya actividad 
comercial efectiva multijurisdiccional.

---

### 6.3 Facturación de comisiones

**Para cobrar comisiones reales Diego necesita:**
- Estar al día como RI en IVA y Ganancias
- Emitir factura electrónica tipo A o B por cada comisión
- Actividad económica correcta en AFIP (CLAE para intermediación 
  en servicios de salud — verificar)
- CBU/alias asociado al CUIT para recibir comisión de MP

**Acción U6:** Verificar CLAE en AFIP antes de primera factura.

---

## 7. TÉCNICO CON IMPLICANCIA REGULATORIA

### 7.1 Retención de historia clínica (10 años)

**Norma:** Ley 26.529 art. 18. Prescripción liberatoria: 10 años 
desde última actuación.

**Estado actual:**
- TyC dicen 5 años → **INSUFICIENTE** → U1
- No hay TTL ni cleanup jobs en código
- Supabase provee backups managed (estándar), pero no hay política 
  custom de retención
- ON DELETE CASCADE en consultas/pacientes → un delete de auth 
  user borra historia clínica permanentemente
- Soft delete solo para médicos (`dado_de_baja`)

**Riesgo:** Si un paciente borra su cuenta (o se borra por admin), 
se pierden datos clínicos que legalmente deben conservarse 10 años.

**Acción:** Cambiar cascade delete de datos clínicos a retención. 
Implementar archivado antes de eliminación.

---

### 7.2 Encriptación

**En TyC declarado:**
- AES-256 at rest ✓ (Supabase/AWS default)
- TLS in transit ✓ (HTTPS enforced por Vercel)

**En código:** No hay encriptación adicional a nivel de campo para 
datos sensibles. Supabase managed encryption cubre el storage.

**Bloqueante:** NO. La configuración actual es adecuada.

---

### 7.3 Inmutabilidad de historia clínica

**Norma:** Ley 26.529 art. 13 exige "medios de almacenamiento no 
reescribibles" y "control de modificaciones".

**Estado:** Los documentos en Supabase son mutables (UPDATE posible). 
No hay versionado ni audit trail de modificaciones a documentos 
clínicos.

**Riesgo:** Bajo en la práctica actual (pocos documentos), pero 
crece con el volumen.

**Recomendación:** Implementar append-only para tabla `documentos` 
(new version instead of update) o audit trigger.

---

### 7.4 Plan de continuidad / disaster recovery

**Estado:** No existe documento formal.

**Bloqueante:** NO para lanzamiento, pero necesario antes de escalar.

---

## 8. SEGUROS

### 8.1 Seguro RC de la plataforma

**Norma:** No hay obligación legal específica. CCyCom art. 1757.

**Estado:** No contratado.

**Riesgo:** Sin seguro + sin SRL = patrimonio personal de Diego 
responde por todo.

**Costo estimado:** USD 500-2.000/año (Tech E&O Insurance).

**Bloqueante:** NO legalmente. Altamente recomendable.

---

### 8.2 Seguro mala praxis del médico

**Estado:** No se solicita en onboarding.

**Norma:** Ley 17.132 art. 19 (no exige seguro explícitamente pero 
la práctica lo requiere).

**Recomendación Carolina:** Exigir declaración jurada de seguro 
vigente en onboarding. No verificar póliza (excesivo), pero tener 
la declaración. Incluir en TyC del médico.

**Bloqueante:** NO.

---

### 8.3 Cyber insurance

**Estado:** No contratado. No obligatorio en Argentina.

**Recomendación:** No prioritario para lanzamiento. Evaluar cuando 
haya >1.000 pacientes.

---

## DIVERGENCIAS ENTRE INVESTIGACIONES

### Registro jurisdiccional (sección 1.2)

- **Investigación normativa:** Decreto 98/2023 exige dos registros 
  (jurisdiccional + nacional). Marcado como BLOQUEANTE.
- **Carolina:** Zona gris. La práctica tolera solo ReNaPDiS. 
  No bloqueante en la práctica.
- **Resolución sugerida:** Investigar si CABA exige registro 
  separado. No frenar lanzamiento por esto.

### Recetas controladas y firma digital

- **Investigación normativa:** Decreto 345/2024 permite recetas 
  digitales de controlados con firma digital. Ambas firmas 
  (electrónica y digital) válidas para todo tipo de receta.
- **Carolina:** Para controlados se necesita firma digital 
  obligatoriamente. Docto NO puede emitirlas.
- **Resolución sugerida:** Adoptar posición conservadora de 
  Carolina. Bloquear controlados.

### Consentimiento informado

- **Investigación normativa:** Ley 27.553 no establece CI 
  específico para telemedicina. Remite a régimen general Ley 26.529. 
  Buenas prácticas (Res. 581/2022) recomiendan CI específico.
- **Carolina:** BLOQUEANTE. Art. 7 Ley 27.553 exige consentimiento 
  previo, informado y documentado antes de cada teleconsulta.
- **Resolución sugerida:** Adoptar posición conservadora de 
  Carolina. Implementar CI por consulta.

---

## LECTURA LEGAL — DRA. CAROLINA

### Clasificación por zona

**PROHIBIDO (no hacer):**
- Emitir recetas de medicamentos controlados con firma electrónica
- Operar sin consentimiento informado documentado por consulta
- Declarar retención de 5 años para datos clínicos (debe ser 10)

**ZONA GRIS (documentar criterio):**
- Telemedicina interjurisdiccional sin matrícula provincial
- Registro jurisdiccional adicional a ReNaPDiS
- CUIR (sistema no operativo nacionalmente)
- IIBB Convenio Multilateral para plataforma digital desde CABA
- Convenios de tratamiento de datos (no obligatorio formalmente 
  pero recomendado)

**PERMITIDO (se puede hacer):**
- Operar como RI persona física
- Firma electrónica para recetas comunes
- Operar sin DPO designado
- Operar sin seguro RC (no obligatorio)
- Operar sin Farmalink (opera del lado farmacia)
- Operar sin CUIR (sistema no operativo)
- Operar con SISA simulado para beta (verificación manual OK)
- Inscripciones AAIP/ReNaPDiS a nombre de Diego RI (válidas)

### Prioridades según Carolina

**Resolver en 1 semana (antes de cobrar):**
1. Consentimiento informado por consulta (pantalla + DB)
2. Política de privacidad separada (documento + página)
3. Bloqueo de recetas controladas (lista negra + UI)

**Resolver en 30 días:**
4. Corregir retención en TyC (5→10 años)
5. Acuerdo tratamiento datos en TyC médico
6. Trazabilidad número de receta
7. Declarar transferencia internacional
8. TyC específicos para médicos
9. Verificar CLAE AFIP

---

*Documento creado el 20/05/2026. Base para el Sprint 
Legal/Administrativo. Revisar con Diego + Carolina antes de 
implementar.*
