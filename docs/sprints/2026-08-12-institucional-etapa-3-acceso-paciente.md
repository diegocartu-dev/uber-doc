# Docto Institucional — Etapa 3 · La entrada del paciente por link

> Cierre de la Etapa 3 (12/08/2026). Cuatro commits de construcción + once de
> corrección tras la revisión pre-merge, en la rama `institucional/etapa-3`.
> Referencias: 05-spec técnica §5 (identidad por link) y §4.6 (reprogramación),
> 03-spec de diseño §2.3 + mock `02-paciente.html`, 06-reglas-operativas R17–R20.
>
> **Nada de esto corre en el B2C.** Todo entra por `INSTITUCIONAL=true`; con el
> flag apagado el comportamiento es idéntico, y desde este sprint eso lo fija un
> test automatizado (T19).

## Qué quedó funcionando

El paciente recibe un link por WhatsApp, lo toca y está en su consulta. Sin
usuario, sin contraseña, sin descargar nada (R18).

1. **La puerta** — `/acceso/t/[token]`. El GET es un intersticial mudo (muestra
   el turno y un botón); la sesión se mintea en el POST del botón. El bot de
   preview de WhatsApp, que hace GET a todo link del chat, no puede quemar nada.
2. **La pantalla** — `/turno/[turnoId]/acceso`, los seis estados del mock en un
   solo layout, sin menú y sin salidas de navegación.
3. **El reenvío** — `/acceso/reenviar`, para que "este enlace ya no está activo"
   no sea un callejón.
4. **La reprogramación** — `reprogramarTurnoInstitucional()`: apaga el link viejo antes de
   mandar el nuevo.

## Las cinco decisiones que conviene recordar

**1. La sesión se mintea con el patrón impersonate, en un solo request.**
`generateLink` solo para quedarse con el OTP (el mail nunca se envía) +
`verifyOtp` server-side escribiendo cookies en el response. Es lo único de este
tipo probado en producción en el repo. El par de rutas del admin está partido en
dos solo para poder mandarle un link al navegador del admin; acá no hay viaje,
así que no hace falta el sobre firmado con la service key viajando por URL.

**2. Un link que no sirve muestra SIEMPRE la misma pantalla.** No existe, venció,
se revocó, el turno se reprogramó: los cuatro dicen "Este enlace ya no está
activo". Distinguirlos convertiría la página en un oráculo de tokens ajenos.

**3. Los números del ciclo de vida son del config, no del código.** Migración
011: `vigencia_documentos_dias` (30), `reenvio_cooldown_minutos` (10),
`reenvio_max_por_dia` (5), `ventana_entrada_min` (10). Los defaults SON la
propuesta vigente de la spec §5.4 — pendiente #3 de Diego. Cuando la cierre, se
edita la fila desde `/admin/institucion`; no se vuelve a tocar código.
Las dos constantes que se quedaron en el código son el techo anti-abuso del
freno de intentos (10 por IP+token cada 15 min): un campo editable que afloje
una defensa es un botón para apagarla sin que nadie lo note.

**4. El reenvío manda al contacto del padrón, jamás al que se escribe.** El DNI y
el celular tipeados son una llave para encontrar la fila, no un destino. La
respuesta es siempre la misma exista o no el DNI: sin eso, una pantalla pública
sería un buscador del padrón provincial.

**5. Reprogramar toma primero y suelta después.** Si soltara primero y otro
operador se llevara el horario nuevo, el paciente quedaría sin ninguno. El peor
caso del orden elegido es un turno tomado de más: visible y arreglable.

## Lo que corrigió la revisión pre-merge

La revisión encontró 25 hallazgos; los que cambiaron decisiones de diseño, y no
solo código, son estos.

**El enlace se revocaba, la sesión no.** `revocarAccesosDe()` escribía
`revocado_at` y nada más. Los dos casos que ese código dice cubrir son teléfono
robado y error de padrón: en los dos, el que tiene el enlace ya tocó "Entrar",
así que apagar el token le cerraba una puerta por la que no pensaba volver a
pasar. Se arregla en dos capas: cerrar las sesiones del paciente en los motivos
de seguridad (migración 013, porque el SDK no sabe hacerlo por `user_id`) y una
**cookie httpOnly con el id del acceso** que las pantallas comprueban en cada
request. La segunda capa además cierra el agujero grande: todo el scoping del
token vivía SOLO en la puerta, así que la sesión minteada servía para cualquier
otro encuentro del paciente y sobrevivía al vencimiento del enlace.

**El token viajaba en el path del POST.** La promesa "nunca se guarda ni se
loguea" valía para la base y para nuestros logs, no para los del proveedor, que
registra el path completo de cada request — y cada fallo lo devolvía además en
el header `Location`. El minteo pasó a `/acceso/entrar`, path fijo, con el token
en un campo oculto. El GET de la landing lo sigue llevando en la URL porque es
un link y no hay alternativa; para eso están el `Referrer-Policy: no-referrer` y
el `noindex` que ahora pone `next.config.ts`.

**El minteo aceptaba un POST de otro sitio.** No lee cookies, las escribe: por
eso `SameSite` no protegía nada y cualquiera del padrón podía dejar logueado
como él a quien abriera una página con un form auto-submit. Chequeo de `Origin`
y `Sec-Fetch-Site`, los dos opcionales para no dejar afuera a un webview viejo.

**El freno de fuerza bruta frenaba a quien no debía.** La clave era
sha256(ip + token), así que quien probaba tokens distintos estrenaba bucket cada
vez y el techo no se disparaba nunca; el único alcanzado era el paciente
legítimo. Y como el bucket se tocaba antes de validar, cada request con basura
insertaba una fila. Ahora son dos frenos (uno por enlace, otro por IP contando
solo fallos), el bucket por enlace se escribe después de validar, y el barrido
que la migración prometía existe.

**El middleware desalojaba la sesión recién creada.** `/turno/[id]/acceso` no
estaba exenta del timeout de inactividad, así que un paciente que tocó el enlace
la noche anterior y lo vuelve a tocar al día siguiente terminaba en el login de
Docto, donde no tiene ni usuario ni contraseña. Sumado a eso, sin sesión las
rutas del paciente iban al login en vez de al reenvío, y `/turno/[id]/sala`
rebotaba —vía la sala de espera vieja— al dashboard del B2C.

**Las ausencias tenían el copy de la consulta feliz.** A quien nadie atendió se
le decía "Tu consulta terminó" y "no quedó documentación cargada". Ahora
`ausente_medico` y `ausente_paciente` tienen pantalla propia y una salida real.

**El golden test no lo corría nadie.** `npm test` es playwright y su `testDir`
es `tests/e2e`: los archivos `node:test` solo corrían a mano. Ahora hay
`npm run test:unit` y un step en el CI. El test nuevo del matcher del middleware
—el cambio de más riesgo para el B2C de toda la etapa— encontró un bug al primer
intento: la exclusión de `/acceso` era un prefijo pelado y se comía también
`/accesorios` y compañía, que habrían quedado sin beta gate ni timeout.

El resto (orden de emisión del enlace, avisos que salían con el dominio pelado,
cooldown del reenvío contando los enlaces del operador, dos listas de estados
muertos que divergían, `finMs` muerto, marca blanca en la preview de WhatsApp,
el 0800 escondido, `reprogramarTurnoInstitucional`) está en los mensajes de los
once commits de corrección.

## Migraciones — SIN APLICAR

| Archivo | Qué hace |
|---|---|
| `011_acceso_ciclo_vida.sql` | 4 columnas de política en `institucion_config` + tabla `accesos_intentos` (freno de fuerza bruta) |
| `012_acceso_reenvio.sql` | `accesos_link.creado_por` nullable + columna `origen` + CHECK de coherencia + índice para el cooldown |
| `013_cerrar_sesiones.sql` | Función `cerrar_sesiones_de_usuario` (SECURITY DEFINER, solo service role): revocar un enlace también cierra la sesión que ya había abierto |

Se aplican **solo** en la base de la instancia, después de la 010. El orden
importa: la 012 depende de la 004 y de la 011.

⚠ Hasta que se aplique la 013, la llamada a esa función falla y queda en los
logs: la revocación sigue apagando el token y la cookie del acceso sigue
echando al que ya entró, pero la sesión del navegador no se cierra del lado del
servidor.

## Pendientes (con destino claro)

| Item | Dónde | Nota |
|---|---|---|
| Reprogramación **masiva** (el caso de Nova) | TODO en `src/lib/otorgador/reprogramar.ts` | Dos fases sobre la función que ya existe: dry-run con la priorización de §4.4 + confirmación turno por turno. Faltan el endpoint y la UI. |
| Aviso al profesional que **pierde** un turno | `avisos.ts` | Solo por mail: no hay plantilla aprobada por Meta para ese caso y por WhatsApp no se manda texto libre. |
| "Reenviar aviso" del otorgador | backlog Etapa 2 | La spec §5.4 dice "reenvía el MISMO token vigente", pero el token pelado no se guarda nunca (en DB va el sha256). O se re-acuña —como hace el self-service— o se acepta que el operador dicte el link que le devuelve la asignación. Decisión pendiente. |
| Pantalla del paciente para la **CI** | — | El destino de la CI sigue siendo `/consulta/[id]/confirmacion` (el clon del B2C). Los seis estados se construyeron para el turno, que es el caso de la demo. |
| Copy del B2C en la sala de espera vieja | `EsperaTurno.tsx` | Dice "te devolvemos el pago completo": en la instancia nadie pagó. Ya no se ve por el link (los rebotes vuelven a la pantalla del paciente), pero el componente sigue vivo. |
| `/dashboard` y `/consulta` siguen abiertos en la instancia | `src/lib/instancia.ts` | La Capa A bloquea `/mis-consultas`, `/mis-datos` y `/documentos`, pero no esas dos: `/dashboard` es la casa del **profesional** (hace falta un gate por rol, no por ruta) y `/consulta` es el destino de la CI hasta que tenga pantalla propia. Consecuencia aceptada: los links a `/documentos` y `/mis-consultas` de la pantalla de cierre de la CI hoy dan 404. |
| Los tests cubren las funciones, no los call sites | `regla-de-oro.test.ts` | Si mañana alguien escribe `if (!permiteAutoCrearPaciente())` en un callback, los casos siguen pasando. Falta un chequeo que recorra los usos, no solo las decisiones. |
| Ventana de hasta 1 h al revocar por seguridad | migración 013 | El access token que ese navegador ya tiene sigue siendo válido hasta que expira. La cookie del acceso tapa el hueco en las pantallas del paciente; una API que no la mire, no. |

## Cómo se verificó

- `npm run test:unit` (nuevo, y ahora también en el CI): 137 casos en verde
  sobre los 22 archivos de test del repo.
- `npx tsc --noEmit`: sin errores nuevos (los de `tests/unit/` son previos).
- `npx eslint`: sin hallazgos nuevos en los archivos tocados (los de
  `EsperaTurno.tsx`, `email.ts` e `historia-clinica.ts` son previos y están en
  archivos que esta rama no toca).
- `npx next build`: completo, con las seis rutas del paciente registradas
  (`/acceso/t/[token]`, `/acceso/entrar`, `/acceso/invalido`,
  `/acceso/reenviar`, `/acceso/reenviar/enviar`, `/turno/[turnoId]/acceso`).

Falta la prueba que ningún test reemplaza y que la spec pide explícitamente
(§11, riesgo técnico 3): **abrir el link dentro del webview de WhatsApp real, en
iOS y en Android**. Es donde vive el usuario y donde murieron las dos
alternativas descartadas.
