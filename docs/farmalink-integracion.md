# Integración Farmalink — Preparación y plan

> **Propósito:** dejar todo mapeado para ser eficientes cuando el equipo de
> seguridad de Farmalink nos contacte con los accesos a TEST. Incluye lo que
> tenemos de nuestro lado **y** lo que probablemente nos pidan.
>
> **Estado (2026-06-03):** Catálogo de APIs (documentación) recibido. Esperando
> accesos a TEST para construir y probar. **NO bloqueante para lanzar.**

---

## 1. Qué es Farmalink y por qué nos suma

Empresa privada (no estatal) que administra y audita la **dispensación de
medicamentos ambulatorios** en **+11.000 farmacias** en tiempo real, para agentes
del Seguro de salud. Conecta sistemas **emisores de receta** con las farmacias y
valida la dispensación en línea.

**Valor para Docto:** las recetas de Docto pasarían a ser **dispensables
automáticamente** en las farmacias de la red, con validación del origen de la
prescripción y trazabilidad del circuito de dispensa.

**No es bloqueante para el lanzamiento:** las recetas de Docto ya son **válidas
sin Farmalink** (firma electrónica con validez legal). Farmalink opera del lado
farmacia/financiador; sin él, simplemente no se dispensan automáticamente en las
cadenas que usan ese sistema. Es una mejora **post-MVP**.

## 2. Estado actual del trámite de homologación

| Paso | Estado |
|---|---|
| (a) Solicitud de homologación enviada | ✅ |
| (b) **Acceso al Catálogo de APIs** (documentación) | ✅ Recibido — portal Axway/Joomla `https://catalogo-srv.farmalink.com.ar/` |
| (c) **Accesos a TEST** (sandbox) | ⏳ **Próximo paso** — los envía el equipo de seguridad de Farmalink |
| (d) Construir + probar contra TEST | ⬜ Pendiente |
| (e) Homologación (validación de Farmalink) | ⬜ Pendiente |
| (f) Producción | ⬜ Pendiente |

> **Credenciales del catálogo:** en el mail de Farmalink ("[FARMALINK] [DOCTO]
> Acceso a Catalogo de APIs") / gestor de secretos. **NO se commitean al repo.**
> El catálogo requiere login en el portal (`/sign-in`) — la doc real está detrás
> del login + se renderiza por JS (leer con navegador, no curl).

## 3. Lo que YA tenemos listo de nuestro lado

La emisión de recetas de Docto ya produce todo lo que una integración de
dispensación necesita:

- **Tabla `recetas`** (cols clave): `datos_prescripcion` (Rp/IFA **estructurado**),
  `firma_digital`, `cuir`, `medico_id`, `paciente_id`, `consulta_id`/`turno_id`,
  `tipo_receta`, `fecha_emision`, `fecha_vencimiento`, `hash_pdf`, `plataforma_id`.
- **Receta estructurada** formato AAIP/ReNaPDiS (Rp/IFA).
- **Firma electrónica** con validez legal (módulo de firma — `src/lib/firma/`).
- **Validación REFEPS real** de la matrícula del médico (Bus FHIR en producción).
- **PDF de receta con espacio de QR reservado** — placeholder ya existente, listo
  para alojar el **código/QR de dispensación de Farmalink**.

## 4. Diseño tentativo de la integración (a confirmar con doc + TEST)

Flujo previsto (fire-and-forget, NO acoplar la emisión a Farmalink):

1. Docto **genera la receta firmada** (flujo actual, sin cambios).
2. En background, **POST a la API de Farmalink** con el payload mapeado desde
   `recetas.datos_prescripcion` + datos del médico (matrícula/REFEPS) + paciente.
3. Farmalink devuelve un **código/QR de dispensación** → se guarda en columnas
   nuevas de `recetas` (tentativo: `farmalink_id`, `farmalink_codigo`,
   `farmalink_estado`, `farmalink_payload`) → se **pinta en el QR reservado** del PDF.
4. El paciente dispensa en cualquier farmacia de la red; valida online.

**Regla de oro:** si Farmalink falla o está caído, **la receta sigue siendo
válida** y se entrega igual. La integración nunca bloquea la emisión.

## 5. Lo que probablemente nos pidan (tener a mano para ir rápido)

Para no frenar cuando nos contacten:

- **Datos de Docto como emisor:** CUIT, razón social, inscripciones fiscales.
- **Datos/validación de los médicos:** matrícula + validación REFEPS (ya lo tenemos).
- **Certificados / firma** para el circuito de seguridad (a confirmar qué esquema usan).
- **Formato exacto del payload de receta** → mapear contra nuestro
  `datos_prescripcion` (puede requerir transformación).
- **Vademécum / códigos de medicamento** — confirmar si usan su propio catálogo o
  el nuestro (CNPM: 16.878 medicamentos oficiales ya cargados).
- **Endpoint de callback/webhook** nuestro, si lo requieren para estados de dispensa.
- **Datos de prueba** (médico/paciente/receta de TEST) para la homologación.

## 6. Trigger y próximo paso

**Cuando el equipo de seguridad de Farmalink envíe los accesos a TEST** → arrancar
el sprint Farmalink completo:
1. Leer la doc completa del catálogo (con navegador, portal logueado).
2. Confirmar/ajustar el diseño de §4 contra la doc real.
3. Construir + probar contra el sandbox.
4. Homologar → producción.

Referencias de código relevantes para la integración: `src/lib/firma/receta.ts`
(generación de receta), `supabase/migrations/20260520_tabla_recetas.sql` (esquema).
