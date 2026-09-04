# ESTADO ACTUAL DOCTO

Snapshot del producto al día de hoy. Stack técnico, infraestructura, 
integraciones, situación regulatoria, fiscal y comercial.

Este documento se actualiza cuando cambia el estado del sistema.
Última revisión: 04/09/2026 (sección 13; el resto sigue al 19/05/2026).

---

## 1. PRODUCTO

### 1.1 Qué es Docto

Plataforma argentina de telemedicina que conecta pacientes con 
médicos vía consultas virtuales.

**Dominio:** docto.com.ar

**Propuesta de valor para médicos:**
- Consultorio virtual con marca propia (link personal `/dr/[slug]`)
- Cobran antes de atender (Mercado Pago directo)
- Sin obra social de por medio
- Sin abono mensual
- Comisión solo cuando hay consulta efectiva
- Nova (asistente AI) elimina burocracia administrativa
- Compliance regulatorio cubierto por la plataforma

**Propuesta de valor para pacientes:**
- Tres modalidades de atención (Consulta Inmediata, Turnos 
  Programados, Consultorio Particular)
- Pago seguro por Mercado Pago
- Recetas digitales con validez legal
- Historia clínica accesible

### 1.2 Modalidades de atención

| Modalidad | Descripción | Color |
|-----------|-------------|-------|
| Consulta Inmediata | On-demand, médico disponible ahora | Verde #1D9E75 |
| Turnos Programados | Reserva con anticipación | Azul #378ADD |
| Consultorio Particular | Link personal del médico (`/dr/[slug]`) | Naranja #D85A30 |

---

## 2. STACK TÉCNICO

### 2.1 Resumen de servicios

| Capa | Servicio | Función |
|------|----------|---------|
| Frontend + Backend | Next.js 14 (App Router) en Vercel | Aplicación completa |
| Base de datos + Auth | Supabase (PostgreSQL) | Datos, usuarios, RLS, autenticación |
| Video | LiveKit Cloud | Videollamadas |
| Pagos | Mercado Pago | OAuth marketplace, checkout, webhooks |
| Email transaccional | Resend | Notificaciones a pacientes |
| Asistente AI (Nova) | Anthropic Claude + OpenAI TTS | Chat, tool use, voz |
| Repositorio | GitHub | `diegocartu-dev/uber-doc` |

### 2.2 Datos clave de infraestructura

**Supabase:**
- Project ref: `irpupskopjahbqqvckue`

**Vercel:**
- Team: `diegocartu-devs-projects`

**GitHub:**
- Repo: `github.com/diegocartu-dev/uber-doc`
- Local del repo: `~/Documents/uber-doc` (Mac de Diego)

**LiveKit:**
- URL: `wss://docto-video-d4i6thna.livekit.cloud`

**Mercado Pago:**
- App "Docto" Client ID: `8893156415936925`
- Cuenta: Diego RI, User ID `28443305`
- Sub-identidad: "DIEGO Docto"
- App vieja "UberDoc" (`681547995541212`) sigue en prod hasta 
  validar Marketplace

### 2.3 Arquitectura

**Monolito Next.js + Supabase.** No hay servidor backend separado.

Todo el backend vive **dentro de Next.js en Vercel** como:
- API Routes (`/api/*`)
- Server Actions
- Supabase para BD, auth, RLS, almacenamiento

**Escalabilidad:** el stack soporta cómodamente miles de médicos 
activos y decenas de miles de consultas mensuales. La elección 
de tecnologías estándar y portables permite migrar componentes 
individuales en el futuro sin reescribir Docto.

### 2.4 Patrones técnicos críticos

Ver `PRINCIPIOS_OPERATIVOS_DOCTO.md` sección 8 para detalle. 
Resumen:
- Supabase Realtime NO se usa — todo polling 5s
- Filtros Supabase solo en primary keys
- iframe de video nunca se desmonta (CSS hiding)
- `paciente_id` referencia distinta en `consultas` vs `documentos`

---

## 3. NOVA — ASISTENTE AI MÉDICO

**Estado:** operativo en producción desde 05/04/2026.

**Stack:**
- Claude Sonnet 4.6 (tool use)
- OpenAI TTS (voz "nova", español LATAM, ~$0.005/mes)
- Web Speech API (dictado del médico)

**Rutas:**
- `/api/nova/chat`
- `/api/nova/tts`
- `/api/nova/confirmar`

**Tools disponibles:**
- `ver_agenda`
- `crear_slots`
- `bloquear_agenda`
- `cancelar_turno`
- `ver_estado_pago`

**Frontend:**
- Página dedicada: `/medico/nova`
- Widget + FAB en dashboard del médico
- Funcionalidades: chat, dictado por voz, respuesta en audio, 
  botones de acción

**Keys en Vercel:** `ANTHROPIC_API_KEY` y `OPENAI_API_KEY`

**Cuenta Inworld:** creada pero NO se usa (OpenAI TTS quedó mejor 
para español LATAM).

---

## 4. SITUACIÓN REGULATORIA

### 4.1 Trámites aprobados

| Trámite | Estado | Número |
|---------|--------|--------|
| AAIP Responsable | Aprobado | RL-2026-36086505-APN-DNPDP#AAIP |
| AAIP Base de Datos | Aprobado | RL-2026-41929595-APN-DNPDP#AAIP (IF-2026-41929601) |
| ReNaPDiS | Aprobado | RL-2026-48984072-APN-SSVEIYES#MS (IF-2026-48984138) |

**ID plataforma Docto en ReNaPDiS:** `0270`

### 4.2 Trámites en curso

| Trámite | Estado | Próximo paso |
|---------|--------|--------------|
| ABM Dominios | En evaluación | Esperar respuesta |
| Farmalink | Catálogo de APIs recibido — esperando accesos a TEST | Construir/probar al recibir TEST (ver docs/farmalink-integracion.md) |
| RENAPER | Diferido | Retomar en sprint legal post B y C |

### 4.3 Marco legal aplicable

- **Ley 25.506** — Firma digital y firma electrónica
- **Ley 27.553** — Telemedicina
- **Ley 26.529** — Derechos del paciente, historia clínica, 
  consentimiento informado
- **Ley 25.326** — Protección de datos personales
- **Decreto 63/2024** — Recetas digitales
- **Decreto 98/2023** — Reglamentación telemedicina

### 4.4 Variables de entorno regulatorias

Estado en Vercel:
- `RENAPDIS_RL_NUMBER` — vacía, pendiente carga
- `RENAPDIS_EXPEDIENTE` — vacía, pendiente carga

---

## 5. ESTRUCTURA FISCAL Y LEGAL

### 5.1 Estructura actual

**Diego opera como Responsable Inscripto (persona física con su CUIT).**

NO hay SRL. NO hay Make Sense ni ninguna otra entidad. Toda la 
estructura regulatoria (AAIP, ReNaPDiS) está a nombre de Diego 
persona física.

### 5.2 Pendientes fiscales

- **Facturación a médicos:** sprint aparte futuro
- **Estructura societaria:** no definida, se evaluará cuando el 
  volumen lo justifique
- **Cuenta bancaria empresarial:** no aplica todavía (todo opera 
  por cuenta MP de Diego RI)

### 5.3 Antes de mencionar entidad legal en cualquier contexto

**Confirmar con Diego** la situación actual. Make Sense SRL ha 
sido mencionado erróneamente en el pasado — no existe como 
entidad de Docto.

---

## 6. MERCADO PAGO

### 6.1 Modelo de pagos

**Marketplace con application_fee:**

**Ejemplo concreto** (médico al 10%):
- Paciente paga $30.000
- Médico recibe $27.000 directo
- Docto recibe $3.000 directo

**Importante:** Docto **NUNCA toca plata bruta.** El split es 
automático vía `application_fee`.

### 6.2 Comisiones

| Tier | Comisión | Aplica a |
|------|----------|----------|
| Founder Beta | 5% | Primeros médicos beta |
| Estándar | 10% | Post-beta |
| Premium | 15% | Médicos con funciones avanzadas |

### 6.3 Configuración técnica

- Redirect OAuth: `docto.com.ar/api/mp/oauth/callback`
- Permisos: read + write + offline_access + APIs
- Webhook: `/api/pago/webhook` con 4 eventos
- Claves en Vercel
- Whitelist live_mode: `MP_TEST_SELLERS_WHITELIST`

Documentación detallada: `MERCADOPAGO_CONFIGURACION_DOCTO.md`

---

## 7. ESTADO BETA

### 7.1 Acceso cerrado

**Sprint Beta Guard Fase 2 cerrado el 18/05/2026.**

Estado actual:
- `disable_signup=true`
- `external_google_enabled=false`
- Middleware en fail-closed
- No se pueden crear cuentas nuevas

### 7.2 Cuentas existentes (77 total)

| Tipo | Cantidad |
|------|----------|
| Internas / test | 22 |
| Médica real (Sofía Fasce) | 1 |
| Pacientes vía Google OAuth (orgánicos) | 44 |

**Las 44 cuentas externas se mantienen** — son prospects orgánicos 
que no pidieron turno todavía.

### 7.3 Reapertura del beta

**Requiere:**
- Reactivar signup + Google OAuth
- Implementar nuevo gate (whitelist o invitación)
- Probablemente después de F&F testing

---

## 8. ROADMAP

### 8.1 Sprints en curso

**Sprint C — Landings** (arrancado 19/05):
- PR #69: Arquitectura 3 páginas mergeada
- Audit y refinamiento de `/medicos`
- Fixes mobile pendientes en `/pacientes`

### 8.2 Próximos sprints en orden

1. **Cerrar Sprint C** (landings refinadas y mobile-ready)
2. **Sprint Legal / Compliance:**
   - Validación de médicos (SISA / REFEPS — hoy en simulación)
   - Firma digital para recetas (CUIR real, post-ReNaPDiS aprobado)
   - Proceso de validación previo a aprobación del médico
3. **Friends & Family testing:**
   - Conocidos NO médicos
   - MP real, montos chicos
   - Validación end-to-end del flujo de pago
4. **Onboarding del primer médico beta real** (post F&F exitoso)
5. **Items en backlog técnico:**
   - Schema migrations sync (Sprint B item 3)
   - Drift audit general (Sprint B item 4)

### 8.3 Backlog menor (no urgente)

- Capitalizar nombres en código (dead code)
- Edge case `formatNombreMedico("Dr.Carlos")` sin espacio
- Push CI: mover dentro de `registrarEntradaSala()` para evitar 
  re-envío al recargar (sugerencia de Roberto, no bloqueante)

---

## 9. DECISIONES DE PRODUCTO ACTIVAS

### 9.1 Sistema de notificaciones

**Niveles definidos (19/05):**

| Evento | Tipo |
|--------|------|
| Paciente reserva turno futuro | Silenciosa |
| Paciente cancela turno futuro | Silenciosa |
| Paciente entra a sala de CI (médico ON) | Agresiva |
| Paciente entra a sala de turno con pago iniciado | Agresiva |

**Implementado en PR #68.**

### 9.2 Disponibilidad para Consulta Inmediata

- Toggle de "Disponible para CI" filtra **routing**, no notificaciones
- Si médico está OFF, las CIs no aparecen como opción al paciente 
  (client-side)
- Server-side hardening implementado en RLS de `consultas` (PR #68):
  - Solo se crean consultas con médicos que cumplan:
    - `disponible = true`
    - `verificado = true`
    - `estado_registro = 'aprobado'`
    - `es_cuenta_test = false`

### 9.3 Canal de origen de consultas

Columna `canal_origen` en tablas `consultas` y `turnos`:
- `null` → Consulta Inmediata
- `clinica_virtual` → Clínica Virtual
- `consultorio_privado` → Consultorio Particular (vía `/dr/[slug]`)

Visible en: dashboard médico, historial inline, ficha paciente, 
documentos generados.

---

## 10. PERFIL ADMIN DE DOCTO

**Email admin:** `diegocartu@gmail.com`

**Accesos:**
- Owner único Supabase
- Owner único Vercel team
- Admin único GitHub repo
- Owner MP app
- Owner Anthropic + OpenAI APIs

**Recovery:** sin co-owners definidos. Pendiente armar plan de 
sucesión / acceso de emergencia.

---

## 11. INTEGRACIONES PENDIENTES

| Integración | Estado | Bloquea a |
|-------------|--------|-----------|
| SISA / REFEPS (validación matrículas) | En simulación | Onboarding médico real |
| Firma digital recetas (CUIR) | Pendiente | Recetas con validez plena |
| Farmalink | Catálogo de APIs recibido — esperando accesos a TEST | Recetas dispensables en cadenas (ver docs/farmalink-integracion.md) |
| RENAPER | Diferido | Validación identidad paciente |

---

## 12. DOCUMENTACIÓN RELACIONADA

Para profundizar en cada área, ver:

- `EQUIPO_VIRTUAL_DOCTO.md` — Perfiles del equipo
- `PRINCIPIOS_OPERATIVOS_DOCTO.md` — Cómo trabaja el equipo
- `HISTORIAL_SPRINTS_DOCTO.md` — Línea de tiempo del producto
- `DECISIONES_PRODUCTO_DOCTO.md` — Decisiones de producto detalladas
- `DECISIONES_NOTIFICACIONES_DOCTO.md` — Sistema de notificaciones
- `ACCESOS_PROCEDIMIENTOS_DOCTO.md` — Accesos y comandos técnicos
- `MERCADOPAGO_CONFIGURACION_DOCTO.md` — Setup completo de MP
- `QUALITY_GATE_DOCTO.md` — Pruebas E2E históricas
- `ARQUITECTURA_VIDEO_DOCTO.md` — Setup LiveKit
- `DOCUMENTACION_ADMIN_DOCTO.md` — Panel admin
- `DOCUMENTACION_TECNICA_DOCTO.md` — Detalles técnicos
- `GO_MARKET_DOCTO.md` — Estrategia comercial

---

*Documento creado el 19/05/2026. Actualizar cuando cambie estado 
del sistema, infraestructura, regulatorio o roadmap principal.*

---

## 13. TABLEROS NUEVOS — /insights "Hoy" + /admin "Dashboard" → UN SOLO TABLERO (04/09/2026)

**Estado:** en producción como ítem nuevo del menú del admin
(`/admin/tablero`, "Tablero"), **conviviendo** con el Dashboard y con
Insights mientras Diego lo valida. Decisión literal (04/09): *"podemos
aplicarlo a un nuevo ITEM consulta en el menu, sin quitar lo que hoy esta?
osea mientras validamos conviven los dos?"* Detalle técnico en
`docs/sprints/2026-09-04-tablero-unico.md`. El manual que rige es `MANUAL-TABLEROS.md` (raíz
del repo): la forma de construir tableros que salió de Validdar.

**Regla del repo público:** los números reales de producción que Diego
pasó para diseñar a escala NO se escriben en este archivo ni en el mock
que vaya al repo. Viven en la conversación y en la memoria de la sesión.

### Decisiones de Diego (frase literal)

- **Rehacer desde cero, no parchar:** *"Quiero rehacer desde cero los
  tableros de Docto (el "Hoy" del CEO en /insights y el "Dashboard" del
  admin en /admin). Hoy son un desastre: la información está repartida en
  dos lugares, ninguno es interactivo y no veo lo que necesito ver."*
- **Un solo tablero:** *"Un solo tablero, no dos: el "Hoy" y el
  "Dashboard" se reemplazan por este."*
- **Misma forma que Validdar, datos y paleta de Docto:** *"Quiero eso mismo
  en Docto, con la dinámica y los datos de Docto y con la paleta y los
  componentes de Docto (el manual pide mapear los roles de color a la
  paleta del proyecto, no copiar los colores de Validdar)."*
- **Los números grandes son de crecimiento y conversión, no totales del
  día:** *"Docto está en etapa de mucha oferta y poca demanda. Un tablero
  de totales grandes miente por omisión. Los números grandes tienen que
  ser de crecimiento y conversión (pacientes nuevos, consultas por
  semana/mes, conversión del embudo, cancelaciones, oferta vs. demanda, la
  plata cobrada y el fee), con series mensuales y semanales, no "0
  consultas hoy"."*
- **El proceso, en este orden:** *"Proponeme las tres preguntas del dueño
  para Docto y los cinco números de la franja de arriba, cada uno con su
  fórmula en palabras y de qué tabla/columna sale. Esperá mi OK. Después,
  un mock HTML navegable con estos datos reales para que lo valide en
  pantalla. Recién con mi OK: una capa de datos separada del componente
  (una sola función que agrega, los mismos números en todas las
  pantallas), un script de identidades contra la base real, y producción.
  [...] Antes de publicar, una revisión adversarial (correctitud +
  textos)."*
- **Sin suponer:** *"Respetá las reglas de la casa de CLAUDE.md, sobre todo
  "no suponer, no rellenar": si un dato no lo verificaste, decilo."*
- **Este archivo es el registro:** *"Anotá cada decisión mía con mi frase
  literal en ESTADO_ACTUAL_DOCTO.md."*

### Lo que se verificó contra producción el 04/09 (definiciones, sin cifras)

- Columnas de `consultas`, `turnos`, `pacientes`, `medicos`,
  `eventos_funnel`, `medicos_mp_accounts`, `refunds_pendientes`,
  `alertas_admin`, `disponibilidad_log`, `agenda_modelos`,
  `agenda_franjas`, `ausencias_medico`, `medicos_deuda`,
  `mensajes_internos_medicos`, `notificaciones_medico`, `whatsapp_envios`
  leídas de `information_schema` (solo lectura). Las fórmulas de la
  propuesta citan solo columnas que existen.
- "Médicos aprobados" tal como Diego lo contó **incluye cuentas de
  prueba**; con el filtro "solo reales" del tablero el número es menor.
  Pendiente que Diego elija la definición.
- "Slots disponibles" tal como Diego lo contó incluye **fechas ya
  pasadas** (lugares que vencieron sin que nadie los tome). El tablero
  separa "todavía reservables" de "vencidos sin reserva".
- El embudo que Diego pasó cuenta **eventos**; la pantalla Demanda cuenta
  **búsquedas** (sesiones del mismo paciente con huecos de hasta 30 min).
  La propuesta usa búsquedas; pendiente OK.

### Cobertura de datos (desde cuándo se mide cada cosa — regla 5 del manual)

| Dato | Se registra desde | Antes de esa fecha |
|---|---|---|
| Vistas de clínica y elección de profesional (`clinica_vista`, `medico_elegido`) | 22/06/2026 | "—" (no se medía) |
| Foto exacta de oferta en cada búsqueda (metadata de `clinica_vista`) | 28/07/2026 | reconstruido (marca °) |
| Hito de aceptación (`consultas.aceptada_at`) y quién/por qué cerró | 20/08/2026 | deducido del pago o la sala (marca °) |
| Estado de entrega de WhatsApp (`whatsapp_envios.twilio_status`) | 31/08/2026 | solo "Twilio aceptó el envío" |
| Pasos del triage (`triage_paso`, `triage_bloqueado`) | 31/08/2026 | "—" |

### Decisiones de Diego del 04/09 (segunda ronda, frase literal)

- **Pensar como dueño, no como plantilla:** *"que preguntas le harias vos a
  Docto como dueño al ver un tablero? y despues de esas 3,4 primeras
  preguntas que repreguntarias en cada una?"* → el tablero quedó en CUATRO
  preguntas (giró / dónde se pierde la demanda / se atendió bien y quedó la
  plata / qué hago hoy) y cada repregunta es una fila plegable con su tabla.
- **Una sola página, orden crítico, todo toca y amplía:** *"no quiero varias
  pantallas, si quiero un orden critico y estetico de que mostrar primero y
  quiero un tablero final interactivo que en cada repregunta de dato toque y
  se amplie la info."*
- **Tablas tipo Excel:** *"filtros en todas las tablas (Tipo Excel) y
  buscador si hace falta."* → toda tabla del mock ordena por columna, filtra
  por columna y tiene buscador.

### Cómo se construyó el mock (para reproducirlo)

- `datos.mts` (scratch de la sesión) extrae de producción en solo lectura y
  clasifica con el MISMO motor del repo: `clasificar.ts`, `plata.ts`,
  `reservas.ts`, `fechas.ts`, `resultado-busqueda.ts`, `mp-cuenta.ts`,
  `perfil-medico.ts`. Cuentas de prueba excluidas (bilateral). Pacientes
  anonimizados (iniciales + provincia). Profesionales con nombre.
- La página calcula todo desde las unidades (atención, paciente, búsqueda,
  lugar de agenda, hora de CI) con UNA función `vista(meses)`; los filtros
  se acumulan; el mes en curso se mide hasta hoy; las variaciones comparan
  tasas por día cubierto; sin cobertura se muestra "—".
- Hallazgo del armado: un turno reprogramado dos veces; la plata vive en la
  RAÍZ de la cadena `turno_origen_id`, no un nivel arriba. La capa de datos
  de producción tiene que caminar la cadena completa.

### Diferencias entre el motor y la tabla que pasó Diego (a resolver con él)

- **Cobrado de julio y de septiembre:** el motor cuenta como cobrado un
  turno pago en el que el paciente no se presentó y no hubo reintegro (la
  plata entró y no volvió), y un turno pago en curso el día de hoy. La tabla
  de Diego no los incluía. Definición en juego: "cobrado" = aprobado y no
  devuelto (la de `plata.ts`) vs. "cobrado" = solo atenciones completadas.
- **Reservas de julio:** la tabla de Diego cuenta las filas `reprogramado`
  de origen; el motor las pliega en el turno final. Mismo hecho, contado
  distinto.
- **Embudo:** la tabla de Diego cuenta eventos; el mock cuenta búsquedas
  (sesiones con huecos de hasta 30 min, la definición de Demanda). No pude
  reproducir sus cifras con ninguna ventana obvia; no sé qué filtro usó.
  Además `pago_aprobado` se registra sin `paciente_id`, así que la sesión lo
  detecta por el pago de la consulta, no por el evento.

### Ronda de especialistas (04/09, tarde) — cascada para un CEO que mira a diario

Diego, literal: *"ahora quiero que llames un equipo que le sugeriría a un CEO
super ejecutivo que ver en cascada, primer vista, con la posibilidad de
profundizar. Ese tablero no es para alguien que lo mira esporádicamente, lo
ve a diario entonces el filtro por día desde hasta (días) debe existir. Si
aplico un filtro debo poder verlo en todo el reporte filtrado, porque una
interacción en un dato debe poder mostrar todas las vistas y aristas de esa
selección. Quiero saber quién, quiénes, cómo y cuándo... entonces saber qué
médico, quién es, su historia dentro de la plataforma es un dato muy
necesario aunque solo esté viendo una consulta."*

Se convocó a Sofía (diseño), Fede (métricas), Elena (producto), Tomás
(marketplace) y Marcos (arquitectura). Sus informes completos viven en la
sesión (tienen cifras y nombres); acá va lo que quedó aplicado en el mock v3
y lo que espera decisión de Diego.

**Aplicado en el mock v3:**
- Período por **rango de días** (hoy · ayer · 7 · 14 · 30 · desde/hasta) además
  de los chips de mes; tocar un punto de la curva elige ese día, semana o mes.
- **Lo fijo se redujo a la barra de período y el estado de los filtros**; la
  franja de números scrollea. Con filtros activos la barra cambia de color y
  cada filtro declara a qué vistas no llega.
- **Seis números:** consultas · pacientes nuevos · búsquedas con alguien
  (liquidez: de las búsquedas con provincia, cuántas encontraron un
  profesional habilitado y en línea) · conversión con oferta (pagaron ÷
  encontraron a alguien) · cobrado con fee · esperan acción.
- **Regla de base chica** (Fede): con menos de 10 casos, diferencia absoluta
  en gris y sin flecha; color solo si la diferencia supera 2·√(a+b); tasas en
  puntos solo con ≥ 30 en el denominador y ≥ 5 éxitos; la plata juzga la base
  por cantidad de consultas cobradas; la pastilla de estado solo con ≥ 7 días
  y ≥ 10 consultas. Los pacientes registrados antes del lanzamiento (10/06)
  no se comparan con los de después.
- **"Esperan acción" cuenta solo lo que tiene reloj** (pedidos sin responder,
  no sostuvo ayer u hoy, pacientes que buscaron ayer u hoy sin encontrar a
  nadie, por revisar, prendidos hace más de 4 h, MP vencido, reembolsos,
  alertas). Los listos que no ofertan son una **campaña de activación**
  aparte, ordenada por "prendió alguna vez" y por demanda perdida en su zona.
- **Bloque "Hoy y ahora"** en la primera pantalla: en línea ahora, agenda de
  hoy, tira horaria de hoy y ayer (en línea por hora, búsquedas caídas en
  huecos), resumen de ayer; al lado, "a quién le escribo hoy".
- **Ficha de la atención**: búsqueda → elección → pedido → avisos →
  aceptación → pago → atención → cierre → documentos → después; con el
  profesional (quién es y su historia) y el paciente a un toque, y pila de
  fichas para volver.
- Composición y motivos en una sola lista; embudo con el escalón "encontraron
  a alguien" y las búsquedas sin provincia fuera del embudo; mapa hora × día
  de semana en lugar de las dos barras de 24 horas; ranking ordenado por
  atendidas; escenario en la unidad del resultado ("serían N pagos más");
  "prendidos sin pedidos" sin nombres en la narrativa; bloque al pie "lo que
  todavía no se mide" con lo que hace falta para cada hueco.
- Repreguntas podadas: se fueron precio, ticket, duración, espera (miden un
  cambio de estado, no la sala), conformidad y "qué buscaban" (a "no se
  mide").

**Trampas de medición encontradas por Fede y corregidas en la extracción del
mock (a llevar a producción):** los lugares "ofrecidos" eran solo los que
quedaron libres; un checkout abierto contaba como pago; los turnos no
entraban al resultado de una búsqueda; un pago podía acreditarse a dos
búsquedas; minutos ausentes en la línea de tiempo.

**Bugs del motor a corregir en producción (no en el mock):**
- `clasificar.ts` decide "aceptada, sin pagar" antes de mirar `resuelta_por`:
  una cancelación del profesional sin pago se lee como abandono del paciente.
- `resultado-busqueda.ts` ignora `conAgendaTurnos`: "había médicos pero
  ninguno en línea" es cota superior (incluye a quien venía por un turno).
- `minEspera` y `minDuracion` no miden espera ni duración: falta la hora de
  entrada a la sala.
- Tres glosarios de motivos (`MOTIVO`, `CAUSA_EN_CRIOLLO`, el del mock): uno
  solo.

**Arquitectura propuesta por Marcos (para la etapa de producción):** unidades
clasificadas en el servidor con service role y una sola función `vista()`
pura en el cliente; `traerTodo` con `.range()` y `count: exact`; cadena
completa de `turno_origen_id`; cobertura declarada en `cobertura.ts` y
verificada por el script; estado en la URL con `replaceState`; `/admin`
renderiza el tablero y `/insights` redirige; el `/admin` móvil actual
(`MobileControlCenter`) hardcodea un cero y es la única UI del kill switch:
mover el kill switch antes de borrarlo. Lista de archivos en la sesión.

**Corrección de Diego sobre el mock v3 (04/09, literal):** *"fijate que no
sé de quién estamos hablando, no sé de qué médico, de qué paciente, de qué
provincia. (toda esta info dentro del cuadro debe ser eliminada, no sirve
para nadie (+1 vs. período previo a igual cantidad de días · base chica (1
vs. 0)) y debe ser reemplazada por información!!! si esto no es intuitivo
no sirve. Muchas letras no sirve, menos texto más info!!!"*
→ **Regla que queda:** cada cuadro nombra QUIÉN (profesional, paciente con
iniciales, provincia); con pocos casos, uno por uno y tocable; con muchos,
los que más pesan. La variación se reduce a un glifo con tooltip; el texto
metodológico ("base chica", "período previo a igual cantidad de días") sale
de la pantalla y vive en tooltips. Los párrafos explicativos se recortan a
una línea o a un tooltip. Aplicado en el mock v4.

**Revisión adversarial (04/09, antes del PR):** Sofía revisó los textos y se
aplicó lo que no contradice frases de Diego ni el glosario del repo (detalle
en `docs/sprints/2026-09-04-tablero-unico.md`). Roberto encontró un XSS almacenado (nombres de pacientes y metadata de
eventos sin escapar) y una puerta que dependía solo del layout: los dos
corregidos antes del PR, con paginación por cursor, lugares deduplicados y
período por defecto calculado. Colaterales para auditar aparte: ocho páginas
de `/admin` sin gate propio y grants de UPDATE amplios en `pacientes` y
`medicos`. Quedan para Diego los títulos
de sección ("¿Giró…?", "…¿se atendió bien…?") y las etiquetas "no sostuvo" /
"no llegó" de `clasificar.ts`, que Sofía propone cambiar por "no entró".

**Decisiones que esperan a Diego:**
1. Seis números en la franja, o cinco: si son cinco, la liquidez desplaza a
   pacientes nuevos (Fede, Tomás) o queda en contexto (Sofía).
2. Rango contiguo de días en lugar de meses salteados (Marcos, Sofía): con
   días, "período previo equivalente" solo existe para rangos contiguos.
3. Definición de "cobrado" (aprobado y no devuelto, o solo atenciones
   completadas) y de "aprobados" (61 reales, 60 sin la baja).
4. Registrar `#235391` como `brand-deep` en el sistema de diseño (hoy no
   existe en `globals.css`).
5. Frenar el empuje de agenda y de reclutamiento en CABA/PBA hasta que la
   liquidez sostenga 80 % (propuesta de Tomás, no una decisión tomada).

### Qué sigue

1. Validación de Diego del mock en pantalla (correcciones se anotan acá
   con su frase) y su definición de "cobrado" y de "aprobados".
2. Con OK: `src/lib/tablero/` (una función agrega por mes, misma
   fuente que `clasificar.ts`, `plata.ts`, `reservas.ts`,
   `filtro-test.ts`, `fechas.ts`), un componente cliente, script de
   identidades contra prod, revisión adversarial, producción.
