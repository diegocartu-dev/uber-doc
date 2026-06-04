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
| (c) **Accesos a TEST** (OAuth, sandbox) | ✅ **Recibidos (04/06/2026)** — Jira SOL-3426. Cliente OAuth + usuario, en 2 mails ("Creación de usuario Client OAUTH Test 1/2 y 2/2"). |
| (d) Construir + probar contra TEST | 🔵 En curso — spec mapeada (ver §6.bis) |
| (e) Homologación (validación de Farmalink) | ⬜ Pendiente |
| (f) Producción | ⬜ Pendiente |

> **Credenciales del catálogo:** en el mail de Farmalink ("[FARMALINK] [DOCTO]
> Acceso a Catalogo de APIs") / gestor de secretos. **NO se commitean al repo.**
> El catálogo requiere login en el portal — la doc real está detrás del login + se
> renderiza por JS (leer con navegador, no curl).

> **Credenciales TEST (OAuth) — NUNCA al repo.** Van al gestor de secretos y a
> env vars de Vercel del entorno de prueba. Son DOS pares: un **cliente OAuth**
> (→ header `Authorization: Basic`) y un **usuario** (→ headers `username`/`password`).
> Nombres de env var sugeridos: `FARMALINK_TEST_CLIENT_ID`,
> `FARMALINK_TEST_CLIENT_SECRET`, `FARMALINK_TEST_USER`, `FARMALINK_TEST_PASSWORD`.

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

## 4.bis Spec REAL de la API (leída del catálogo, TEST — 04/06/2026)

Host TEST de servicios: **`https://test-servicios.farmalink.com.ar`**

### Autenticación — API "Token" (REST, OAS 3.0, BasicToken)
`POST https://test-servicios.farmalink.com.ar/api/oauth/token` → devuelve un
access token que se usa en las demás APIs. **Todos los parámetros van en HEADERS:**

| Header | Qué es |
|---|---|
| `Authorization` | `Basic base64(<CLIENT_ID>:<CLIENT_SECRET>)` — el **cliente OAuth** (`FARMALINK_TEST_CLIENT_ID/SECRET`) |
| `grant_type` * | tipo de permiso del proceso OAUTH |
| `username` * | usuario del cliente (`FARMALINK_TEST_USER`) |
| `password` * | password del usuario (`FARMALINK_TEST_PASSWORD`) |
| `scope` * | contexto/API a autorizar (ej. la API de receta) |

Respuesta 200: `{ access_token, token_type, expires_in, scope, id }`.
También hay `GET /validate` (ValidateAccessToken) con header `X-OAUTH-IDENTITY-DOMAIN-NAME`.
> Falta confirmar el valor exacto de `grant_type` y `scope` (probar en el "Try it out" del catálogo).

### Receta — API "RecetaElectRest" (REST v3.0.0)
Server TEST: **`https://test-servicios.farmalink.com.ar/api/recetaElect/v3`**

| Método | Operación |
|---|---|
| `POST /altaReceta` | crear una receta electrónica (genera nro de receta) |
| `POST /bajaReceta` | anular una receta |
| `POST /consultaReceta` | consultar una receta |

### Payload de `altaReceta` (estructura real)
```jsonc
{ "altaRecetaElectRq": {
  "infoCabeceraRq": { "idOrganizacion", "tipoOrganizacion", "ipOrigen", "infoBrowser" },
  "puntoEmisor": { "id" },
  "recElectronica": {
    "tipoReceta", "fechaVigenciaDesde", "fechaVigenciaHasta", "tipoTratamiento",
    "afiliado": { "nombre","apellido","sexo","fechaNacimiento","cuil","mail",
                  "tipoDocumento","numeroDocumento","datosOfuscado",
                  "credencial": { "codEntidad","pan","plan","token" } },
    "medico": { "nombre","apellido","sexo","fechaNacimiento","cuil","mail",
                "tipoDocumento","numeroDocumento",
                "firma" /* PNG base64 */, "domicilioAtencion",
                "codigoReFeps", "matricula": { "tipo","provincia","numero",
                  "especialidad": { "textoLibre" }, "asociada": {...} } },
    "diagnostico": { "clasificador" /* 10=CIE-10 */, "codigo" /* ej "I20.9" */ },
    "detalleRecElectronica": { "item": [ { "cantidad","codProducto","codDroga", ... } ] }
  } } }
```

### Mapeo Docto → Farmalink (qué ya tenemos)
- **medico.firma** ← firma electrónica (PNG, `src/lib/firma/`). ✅
- **medico.codigoReFeps / matricula** ← REFEPS validado (Bus FHIR) + matrícula. ✅
- **afiliado** ← perfil del paciente (fecha_nacimiento, sexo_dni) + **credencial** ← obra_social / nro_afiliado / plan. ✅ (campos ya agregados)
- **diagnostico** ← CIE-10 de la consulta.
- **detalle.item** (codProducto/codDroga) ← **vademécum CNPM** (16.878 medicamentos). ✅
- `infoCabeceraRq` / `puntoEmisor` ← datos de Docto como emisor (a confirmar idOrganizacion/puntoEmisor con Farmalink).

> **Lo que falta confirmar:** `grant_type` + `scope` exactos del token; `idOrganizacion`/
> `tipoOrganizacion`/`puntoEmisor.id` de Docto; el mapeo fino de códigos de producto
> (CNPM vs catálogo Farmalink); y los schemas de `bajaReceta`/`consultaReceta`.

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
