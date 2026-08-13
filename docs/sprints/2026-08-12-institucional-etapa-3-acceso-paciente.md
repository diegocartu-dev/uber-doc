# Docto Institucional — Etapa 3 · La entrada del paciente por link

> Cierre de la Etapa 3 (12/08/2026). Cuatro commits, uno por ticket, en la rama
> `institucional/etapa-3`. Referencias: 05-spec técnica §5 (identidad por link)
> y §4.6 (reprogramación), 03-spec de diseño §2.3 + mock `02-paciente.html`,
> 06-reglas-operativas R17–R20.
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
4. **La reprogramación** — `reprogramarTurno()`: apaga el link viejo antes de
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

## Migraciones — SIN APLICAR

| Archivo | Qué hace |
|---|---|
| `011_acceso_ciclo_vida.sql` | 4 columnas de política en `institucion_config` + tabla `accesos_intentos` (freno de fuerza bruta) |
| `012_acceso_reenvio.sql` | `accesos_link.creado_por` nullable + columna `origen` + CHECK de coherencia + índice para el cooldown |

Se aplican **solo** en la base de la instancia, después de la 010. El orden
importa: la 012 depende de la 004 y de la 011.

## Pendientes (con destino claro)

| Item | Dónde | Nota |
|---|---|---|
| Reprogramación **masiva** (el caso de Nova) | TODO en `src/lib/otorgador/reprogramar.ts` | Dos fases sobre la función que ya existe: dry-run con la priorización de §4.4 + confirmación turno por turno. Faltan el endpoint y la UI. |
| Aviso al profesional que **pierde** un turno | `avisos.ts` | Solo por mail: no hay plantilla aprobada por Meta para ese caso y por WhatsApp no se manda texto libre. |
| "Reenviar aviso" del otorgador | backlog Etapa 2 | La spec §5.4 dice "reenvía el MISMO token vigente", pero el token pelado no se guarda nunca (en DB va el sha256). O se re-acuña —como hace el self-service— o se acepta que el operador dicte el link que le devuelve la asignación. Decisión pendiente. |
| Pantalla del paciente para la **CI** | — | El destino de la CI sigue siendo `/consulta/[id]/confirmacion` (el clon del B2C). Los seis estados se construyeron para el turno, que es el caso de la demo. |
| Sesión vencida en `/turno/[id]/acceso` | `src/lib/supabase/middleware.ts` | `/turno` es prefijo protegido: un paciente con la sesión vencida (8 h) rebota a `/auth/login`, que para él es un callejón. La página ya sabe mostrar "enlace inactivo" cuando no hay sesión; falta que el middleware la deje llegar. Se arregla con un gate por modo en `protectedPrefixes`. |
| Copy del B2C en la sala de espera vieja | `EsperaTurno.tsx` | Dice "te devolvemos el pago completo": en la instancia nadie pagó. Ya no se ve por el link (la pantalla nueva no la usa), pero sigue viva si alguien llega por `/turno/[id]/espera`. |

## Cómo se verificó

- `npx tsx --test` sobre los 8 archivos de test del repo: 112 casos en verde
  (18 nuevos de la pantalla del paciente + el reenvío, 12 del golden test).
- `npx tsc --noEmit`: sin errores nuevos (los de `tests/unit/` son previos).
- `npx eslint`: sin hallazgos nuevos en los archivos tocados.
- `npx next build`: completo, con las cinco rutas nuevas registradas.

Falta la prueba que ningún test reemplaza y que la spec pide explícitamente
(§11, riesgo técnico 3): **abrir el link dentro del webview de WhatsApp real, en
iOS y en Android**. Es donde vive el usuario y donde murieron las dos
alternativas descartadas.
