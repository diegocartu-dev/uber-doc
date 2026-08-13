# Docto Institucional — cierre de las Etapas 0 a 6

> Cierre del sprint completo de la unidad institucional (13/08/2026). Seis PRs
> de construcción encadenados, cada uno con su gate de revisión pre-merge
> (#400–#405) y su ronda de correcciones antes de entrar a `main`.
>
> Referencias: `05-spec-tecnica-v1.md`, `04-spec-otorgador-v2.md`,
> `03-spec-diseno-mocks.md` y sus mocks, `06-reglas-operativas.md`.
>
> **Nada de esto corre en el B2C.** Todo entra por `INSTITUCIONAL=true`; con el
> flag apagado el comportamiento es idéntico, y eso lo fija un test automatizado
> (`src/lib/institucional/regla-de-oro.test.ts` + el golden del PDF).
>
> Cierra el hallazgo **S6 del gate #405**. Los cierres por etapa que ya existen
> —Etapa 2 (backlog del otorgador) y Etapa 3 (acceso del paciente)— siguen
> valiendo; este documento es la historia completa y el estado final.

---

## Qué existe hoy, en una pantalla

Una **instancia separada** del producto —mismo código, otro deploy, otra base—
donde una institución opera con sus propios profesionales y su propio padrón:

1. **La institución levanta agendas** de sus profesionales (motor *acordado*) y
   el profesional puede ofrecer las suyas (motor *ofrecido*); la consulta
   inmediata es el motor *espontáneo*.
2. **Un operador de call center asigna** desde `/otorgador`: busca al paciente
   en el padrón, elige especialidad, y la API le devuelve la oferta **ya
   priorizada** (nunca ordena la pantalla). Asigna un turno o una consulta
   inmediata.
3. **El paciente entra por un link** de WhatsApp o mail. Sin usuario, sin
   contraseña, sin app. La sesión se mintea en un POST, después de un gesto.
4. **La atención pasa** por el mismo canal clínico del B2C —LiveKit, workspace,
   receta, firma— sin una línea de código paralela.
5. **Los documentos salen con la marca de la institución** (Etapa 5): el
   ministerio arriba, Docto declarado al pie como efector tecnológico.
6. **El contador cuenta** qué se factura y qué no, con la regla contractual
   textual, y la **bolsa de horas** dice cuánto cumplió cada profesional de su
   acuerdo semanal.
7. **La institución mira su semana** en `/panel`: KPIs, consultas por motor,
   cumplimiento por profesional, facturación del período y ausentismo. Y
   **Nova** reprograma por conversación el día de un profesional que no puede
   atender (Etapa 6).

Lo que **no** existe: pagos. En esta instancia el paciente no paga y no hay
Mercado Pago en ninguna capa — está apagado por env, por endpoint y por cron.

---

## Las seis etapas

### Etapa 0 — el modo, y qué se apaga del B2C

`src/lib/instancia.ts`: un helper y una regla. Tres capas de apagado (spec §9):
**A** el middleware (rutas del marketplace, registro, `/insights`), **B** los
endpoints de pago y MP (404 temprano — el flag `pago_marketplace` en OFF no
alcanza porque *simula* pagos, no los ausenta), **C** los crons de plata y
registro, con early-return por modo porque `vercel.json` es uno por repo.

**Gate #400 → lo que dejó:** la decisión de que el gate por modo vive **adentro**
de cada helper y no en los callers. Un caller que se olvida de gatear es el modo
de falla silencioso que después nadie encuentra.

### Etapa 1 — config, roles y el admin interno

`institucion_config` (tabla singleton) es la marca blanca completa: nombre,
colores, dominio, plantillas de WhatsApp, ventana de CI, duración de slot,
precio y horas de acuerdo. **Sin fila, la instancia tira un error explícito**:
jamás defaults inventados.

Roles nuevos: `otorgador` y `admin_institucion`, integrados a la precedencia
central (`admin > admin_institucion > otorgador > medico > paciente`).

**Gate #401 → hallazgos:** los refunds del cron `resolver-vencidas` había que
gatearlos por modo **antes** de prender nada (encolaba reembolsos imposibles en
una instancia sin MP), y `/auth/callback` auto-creaba una fila de `pacientes`
para cualquiera que entrara por OAuth — incluidos los operadores, que
contaminaban el padrón.

### Etapa 2 — el otorgador

La API de asignación (spec §4) y la pantalla del mock aprobado. Tres decisiones
que ordenaron todo lo demás:

- **La pantalla pinta, la API ordena.** La priorización vive en
  `src/lib/otorgador/oferta.ts` y **cero `sort()` en el cliente**: así una
  operadora IA por API key hereda la misma equidad sin reimplementar nada.
- **El turno asignado saltea el circuito de pago entero** con un solo UPDATE
  atómico contra `estado='disponible'`. El `WHERE` optimista es el que resuelve
  la carrera entre dos operadores (0 filas → 409 "ese horario se acaba de
  ocupar").
- **La CI institucional nace `pagada`.** No es una licencia contable: es el
  estado que ya es conectable, que ya dispara las alertas del profesional y que
  `buscarEncuentroActivo` clasifica como encuentro con compromiso. Inventar un
  estado nuevo obligaba a tocar el canal clínico.

**Gate #402 → hallazgos:** el conteo semanal de asignaciones se truncaba en
silencio a 1000 filas (PostgREST corta sin error); `crearOperador` paginaba
hasta 20.000 usuarios y después mentía "ese email no tiene cuenta"; y reactivar
un operador no re-chequeaba si entretanto se había vuelto profesional.

### Etapa 3 — la entrada del paciente

`/acceso/t/[token]` es un intersticial **mudo**: el GET muestra el turno y un
botón, la sesión se mintea en el POST. El bot de preview de WhatsApp, que hace
GET a todo link que pasa por un chat, no puede quemar el enlace.

Un link que no sirve muestra **siempre la misma pantalla**: no existe, venció,
se revocó o el turno se reprogramó dicen todos "este enlace ya no está activo".
Distinguirlos convertiría la página en un oráculo de tokens ajenos.

**Gate #403 → hallazgos:** el token viajaba en la URL del minteo; revocar un
enlace no echaba al que ya había entrado; el freno de fuerza bruta no frenaba al
que barre tokens; y el cooldown del reenvío contaba también los envíos del
operador. Además nació el **golden test de la regla de oro**, que hasta entonces
se sostenía leyendo los diffs hunk por hunk.

### Etapa 4 — el contador, la bolsa y el panel

- **`encuentros_metering`** — una fila por encuentro terminal, con el reloj que
  la justifica. La regla contractual, textual: *"se factura la consulta con
  ambos participantes en sala al menos 60 segundos y/o documento emitido; las
  ausencias no se facturan"*. Es una tabla y no una vista porque el número tiene
  que quedar **congelado**.
- **La bolsa de horas** (decisión de Diego, 12/08): *"los turnos valen por poner
  la agenda; las consultas inmediatas valen por atender"*. Las dos lecturas
  descartadas —consumo puro y disposición total— quedaron escritas con un test
  negativo cada una, para que no vuelvan por la ventana.
- **`/panel`** — la semana, con la definición contractual a la vista donde se
  factura. Orden alfabético, no por cumplimiento: **el panel informa, no
  escracha**, y "Incompleto" no aparece nunca con la semana abierta.

**Gate #404 → hallazgos:** casi todos de la misma familia, y la más cara del
sprint: **lecturas que fallaban y se veían como "no pasó nada"**. Un `SELECT`
sin paginar que corta en 1000 filas subfactura en silencio; una lectura fallida
que devuelve `[]` hace que el cierre selle cero filas reportando éxito. Se
cerraron con `src/lib/metering/db.ts` (paginado + error propagado) y con la
regla de que **en el metering, un error se grita**.

### Etapa 5 — el documento con la marca de la institución

`generarRecetaPDF(doc, branding?)`. Con branding: isologo y nombre arriba,
acentos del color del config, cobertura del paciente con el nombre de la
institución, y la **Sección C** del pie donde Docto se declara efector
tecnológico (texto **provisorio**, en el config y no en el código: la redacción
final la define el abogado y ese día se cambia un campo).

**Sin branding, el PDF del B2C sale byte a byte idéntico**, y hay un golden test
que lo verifica contra las huellas del generador de `main`. Las leyendas A y B
—firma electrónica art. 5 de la Ley 25.506 y marco regulatorio por tipo— no se
tocaron ni una coma.

### Etapa 6 — Nova

La tab Nova del panel resuelve por conversación el caso que hoy se hace a mano:
*"el Dr. X no puede atender el martes 20"*. Dos fases: **propuesta** (que no
toca la agenda) y **confirmación** (que ejecuta con el motor de reprogramación
que ya existía, con revocación del link viejo, link nuevo y avisos).

Tres cosas que la hacen creíble frente a un ministerio:

1. La propuesta **no cambia nada** hasta el confirm, y Nova lo dice.
2. Lo que no pudo resolver **se muestra**, en naranja, con destino: gestión
   manual del call center. Un 100 % mágico es menos creíble que una propuesta
   que dice qué le falta.
3. El checklist de avisos es **real**: cada línea se pinta con el resultado del
   envío que devolvió la API, el mismo que queda en `asignaciones.detalle`.

**La capa conversacional es honesta:** no hay LLM en runtime. Un parser acotado
entiende el único caso de V1 y todo lo demás lo contesta diciendo que no lo sabe
hacer. La interfaz del motor queda lista para que una IA lo llame con su propia
identidad de operador (`operadores.tipo='ia'` con API key) — no hay un camino
especial para ella.

**Gate #405 → hallazgos (cerrados en esta etapa):**

| # | Hallazgo | Cómo se cerró |
|---|---|---|
| I1 | La CI colgada del domingo esquivaba la precondición del sello: no es terminal el lunes a las 02:00, se sella la semana sin ella, y el martes la factura la cobra igual | `encuentrosSinClasificar` cuenta también los encuentros **vivos** de la semana; los vivos por complemento (un estado desconocido bloquea, no pasa) |
| I2 | `cerrarSemana(semana)` aceptaba el parámetro y nadie se lo pasaba: una semana perdida no se recuperaba nunca | `POST /api/admin/institucional/cerrar-semana` (guard admin de Docto) + `GET` de diagnóstico + `docs/runbooks/institucional-cierre-semanal.md` |
| M1 | Los bordes de `encuentrosSinClasificar` no estaban escritos | Constante `TURNO_SIN_DESTINO` con el porqué de cada estado |
| M2 | El comentario del botón de export decía "no es una acción con efectos" — y ahora **sella** | Corregido, con el porqué de por qué importa |
| S2 | `aporteDelSlot` tenía default "cuenta": un estado nuevo acreditaba horas sin que nadie lo decidiera | Tabla exhaustiva; estado desconocido ⇒ **error explícito** |
| S3 | `TRUNCATE` pasa por arriba de los triggers de fila: se lleva puesta toda la inmutabilidad de las 014 y 015 | Migración **019**: `REVOKE TRUNCATE` + trigger `BEFORE TRUNCATE` (el trigger frena también al dueño, que es el camino real: el SQL Editor) |
| S4 | La 017 preservaba la clasificación humana pero no su `precio_centavos` | Migración **019**, misma función |
| S5 | `componerFila` es pública y no sabía que estaba componiendo el reemplazo de una fila sellada o manual | Parámetro `filaPrevia` + cinturón (el filtro del job sigue siendo el tirante) |
| S6 | Faltaba el cierre de etapas y la batería de ataque a los triggers | Este documento + la sección nueva del README de `migrations-institucional/` |

---

## Las cinco cosas que conviene no volver a discutir

**1. El gate por modo vive adentro del helper.** `esInstitucional()` no se
llama en cada caller: cada función que cambia por modo decide adentro y los
callers llaman siempre. Es lo que hace posible el golden test.

**2. En el metering, una lectura que falla se grita.** Un catch que devuelve `[]`
convierte "la base no contestó" en "no hubo actividad", y las dos cosas se ven
exactamente igual en un panel. Sobre un número que se factura, eso se paga
discutiendo con el cliente.

**3. Lo sellado se defiende en la base, no solo en JS.** El guard de la lib
protege del código que ya conocemos; el trigger protege del que venga después —
un backfill apurado, un `/admin` nuevo, una corrección "que no toca nada".

**4. La pantalla pinta, la API ordena.** Vale para la oferta del otorgador y
vale para Nova: el criterio de equidad tiene un solo lugar.

**5. El panel informa, no escracha.** Orden alfabético, "En curso" mientras la
semana está abierta, y nada de esta vista existe del lado del profesional.

---

## Lo que queda abierto

### Decisiones de Diego (bloquean, cada una, algo concreto)

| Tema | Qué bloquea |
|---|---|
| **Texto legal de la Sección C** (efector tecnológico), junto al DPA | El PDF ya sale; el copy final es legal. Se cambia el config, no el código |
| **Ciclo de vida del link** (§5.4): vigencia, reenvío, matriz de revocación | Los defaults de la migración 011 son la propuesta vigente |
| **Email sintético** para pacientes sin mail | Condiciona el DPA |
| **Gate biométrico** para profesionales institucionales | Onboarding ultraliviano vs. gate prendido en B2C |
| **Dominio del remitente** (subdominio de Docto vs. dominio del cliente) | DNS de la provincia = fricción de contrato |
| **`motivo_consulta`** en la CI asignada | Obligatorio en B2C; el otorgador no lo captura |
| **Captura separada de "Tratamiento indicado"** en el workspace | Toca el canal clínico. V1 degrada al campo de indicaciones |
| **Convivencia operador + paciente** (una operadora que además es paciente del padrón) | La precedencia de rol se come sus flujos de paciente |

### Técnico

| Item | Nota |
|---|---|
| **Plantillas de WhatsApp en Meta** | Camino crítico de la escena 2. Lead time real; se dispara antes que nada |
| **Bucket `institucion-assets`** | Creado en la migración 018 y consumido por el PDF. El panel y el turnero siguen con el hueco reservado del mock |
| **Micrófono de Nova** | El dictado que anda vive dentro del workspace del profesional; extraerlo es un trabajo aparte |
| **Reprogramación masiva fuera de la semana corriente** | La oferta de candidatos es de la semana AR corriente (heredado de `oferta.ts`): por eso el copy dice "sin lugar esta semana" |
| **Aviso al profesional que pierde un turno** | Solo por mail: no hay plantilla aprobada por Meta para ese caso |
| **"Reenviar aviso" del otorgador** | El token pelado no se guarda nunca. O se re-acuña o el operador dicta el link. Decisión pendiente |
| **Los tests cubren funciones, no call sites** | Un gate escrito al revés en un caller nuevo sigue pasando el golden |
| **`/dashboard` y `/consulta` abiertos en la instancia** | `/dashboard` es la casa del profesional (hace falta gate por rol) y `/consulta` es el destino de la CI |
| **Verificación empírica en la instancia real** | Los REVOKE de las RPC y la batería de ataque a los triggers se corren **contra la base de la instancia**, no se dan por buenos porque estén escritos (README de `migrations-institucional/`) |
| **Prueba en el webview real de WhatsApp** (iOS y Android) | La que ningún test reemplaza |

---

## Migraciones de la instancia

`supabase/migrations-institucional/` — se aplican **solo** en la base de la
instancia, encima del schema B2C ya provisionado, en orden numérico. Ninguna se
aplicó desde este sprint: se aplican en la provisión.

| Etapa | Migraciones |
|---|---|
| 1 | 001 config · 002 operadores · 003 asignación · 004 links · 005 disponibilidad · 006 operador único · 007 buscar por email |
| 2 | 008 padrón · 009 plantillas WA · 010 backstops de asignación |
| 3 | 011 ciclo de vida del acceso · 012 reenvío · 013 cerrar sesiones |
| 4 | 014 `encuentros_metering` · 015 `acuerdo_semanas` · 016 `descargas_hc` · 017 manual gana |
| 5 | **018** bucket `institucion-assets` |
| 6 | **019** backstops del metering (`TRUNCATE` + precio de filas manuales) |

## Cómo se verificó esta etapa

- `npm run test:unit` — verde, incluidos el golden de la regla de oro, el golden
  del PDF (cinco documentos sintéticos contra las huellas de `main`) y los tests
  nuevos del parser de Nova y de la tabla exhaustiva de aportes.
- `npx tsc --noEmit` — sin errores nuevos (los de `tests/unit/` son previos).
- `npx eslint` sobre los archivos tocados — sin hallazgos.
- `npx next build` — compilación y TypeScript completos; la corrida entera
  necesita las env de producción, que no viven en el entorno de desarrollo.
- Las huellas del golden del PDF se verificaron **dos veces**: contra el
  generador de `main` antes de tocarlo, y contra `origin/main` después del
  cambio.
