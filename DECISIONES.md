# Decisiones y pendientes — Docto

**Es la puerta de entrada.** Toda sesión lo lee al arrancar (por lo menos §1). Corte: 12/10/2026.

Cómo se usa:
- Una decisión pendiente **nunca** vive en un comentario del código ni solo en la memoria de una sesión: va a §1 con fecha.
- Cuando Diego decide, la línea sale de §1 y entra a §5 (vigentes) con la fecha de la decisión. Si una decisión reemplaza a otra, la vieja pasa a §6.
- Cada entrada dice **dónde vive** (archivo de código o documento) y si se **verificó** contra producción.
- Repo público: sin nombres, mails, teléfonos, DNI, IDs, montos cobrados ni conteos de producción. Los casos se describen en genérico.

---

## 1. Pendientes de Diego (solo él puede decidirlos)

| # | Desde | Qué hay que decidir | Dónde está el detalle | Verificado |
|---|---|---|---|---|
| 1.1 | 07/08 | **Consentimiento de firma electrónica del profesional.** Texto de los T&C del profesional donde conste que su clic es su firma, y el punto de aceptación. Hoy no existe: la firma por sesión queda sin consentimiento documentado (dictamen del 07/08, punto 3). | `src/lib/firma/documento.ts` (snapshot del firmante) | 12/10: no hay ninguna aceptación ni versión `tyc_medico` |
| 1.4 | 01/09 | **Política de categorías founder / tradicional.** (1) ¿La primera plantada avisa o ya baja de categoría? (2) ¿Hay camino de vuelta a founder? (3) ¿Cuentan las cancelaciones repetidas de turnos pagos? (4) ¿Se usa el recupero del reembolso además o en vez de la escalera? (5) ~~Un degradado que se registra con otro mail vuelve a founder~~: cerrado el 14/10, toda ficha nueva entra como Tradicional. (6) Suspender a alguien con turnos pagos deja pacientes sin atender. | esta tabla (antes solo en memoria) | sin verificar en código |
| 1.5 | 11/08 | **Respaldos.** PITR (recuperación a un punto, USD 100/mes): sin él, un incidente a media tarde pierde hasta 24 h. Copia semanal del Storage (firmas manuscritas, credenciales) fuera de Supabase. Y la restauración **nunca se probó**. | `docs/infra/2026-08-11-respaldos-y-recuperacion.md` | 12/10: PITR apagado en las dos bases; 8 respaldos diarios en cada una |
| 1.6 | 11/09 | **Bajas de profesionales que no se activaron** tras el empujón del 01/09 (dos avisos documentados = baja no arbitraria). Se iban a revisar resultados el 11/09. | — | no hay registro de que se haya decidido |
| 1.7 | 08/10 | **¿La especialidad declarada se contrasta con REFEPS?** Hoy no: un caso real figuraba en una especialidad que REFEPS no tenía. | `docs/sprints/2026-10-01-la-matricula-la-dice-refeps.md` | 08/10 |
| 1.8 | 04/09 | **Frases del tablero** propuestas por Sofía (títulos de las preguntas; cambiar "no sostuvo" / "no llegó", que son las etiquetas de `clasificar.ts`, por "no entró", como ya dice `diagnostico.ts`). | `docs/sprints/2026-09-04-tablero-unico.md` | — |
| 1.9 | 13/08 | **Receta institucional, con el abogado y el DPA:** el pie completo de la receta, el texto de identificación del efector (hoy provisorio, en `institucion_config.pdf_efector_texto`), y la captura separada de la posología en el workspace (toca el canal clínico). | `src/lib/pdf/receta.ts`, `docs/sprints/2026-08-13-institucional-cierre-etapas-0-6.md` | — |
| 1.10 | 15/09 | **Proteger `firma_manuscrita_url`** en el trigger `proteger_verificacion_medico` (hoy el profesional la puede cambiar directo). Migración lista para pedir; necesita el OK y revisar antes cómo sube la firma el profesional. | #495/#496 (capacitación en video) | 12/10: el trigger protege `dado_de_baja`, no la firma |
| 1.11 | 30/09 | **Plan de pagos desde Docto, en pausa** (Diego cerró #522 el 12/10; la rama `feat/destinos-de-pago` quedó guardada). Antes de retomarlo: Sprint 0 a cargo de Diego, habilitar pagos salientes en la cuenta de Mercado Pago y entregar la clave pública. | `docs/sprints/2026-09-29-plan-pagos-desde-docto.md` | no sé si se hizo el Sprint 0 |
| 1.12 | 10/06 | **Separación GREBA → SRL.** Las comisiones caen en GREBA; la app en las tiendas también espera la SRL. | — | — |
| 1.15 | 13/10 | **Términos del profesional (los que nombran a los psicólogos): ¿se avisa con 15 días?** Su §11 promete avisar por mail con al menos 15 días de anticipación cualquier modificación. A los médicos la versión nueva solo les cambia el lenguaje (médico → profesional) y les suma orientar al paciente al servicio de emergencias de su zona. Propuesta: mail corto a los profesionales (firma Valentina, texto a aprobar) y que para ellos rija 15 días después; quien se registre desde el aviso la acepta al registrarse. Se decide recién cuando se quiera abrir el registro de psicólogos; hasta entonces no se publica nada y no hay nada que decidir. En esa misma revisión, "comisión" pasa a "coste por uso de la plataforma" en los términos y en la landing. | `docs/sprints/2026-10-13-psicologos-textos-legales.md` §3 | los T&C del paciente no lo piden: rigen desde su publicación (§1) |
| 1.13 | 10/06 | **¿Se hizo la prueba con 2 testers externos?** Quedó como pendiente del lanzamiento. | `docs/PRUEBA_PRE_LANZAMIENTO.md` | sin registro de que se haya hecho |

### Pedidos de la agencia de marketing (12/10), para el relanzamiento del 15/10

Detalle y por qué de cada uno: `~/EMPRESA SE MARKETING/reportes/2026-10-12-pendientes-producto.md`, la auditoría web del mismo día y `~/EMPRESA SE MARKETING/campanas/docto/2026-10-relanzamiento-ig/revision-legal.md` §8. La agencia no toca este repo: los implementa esta sesión cuando Diego los pase.

| Prioridad | Qué |
|---|---|
| 🔴 antes del 15/10 | La sala del paciente dice que el médico "está grabando" sus indicaciones cuando dicta → "está dictando" (`src/app/consulta/[id]/sala/SalaConsultaPaciente.tsx`). La marca dice, con razón, que las videollamadas no se graban. |
| 🔴 antes del 15/10 | Redirección `docto.com.ar/ig` → home con UTMs del relanzamiento (link de la bio de Instagram). |
| 🔴 si se usa la frase "ni Docto puede aprobar a alguien que no figure" | Revalidar contra REFEPS a todos los médicos aprobados antes del 05/10 (hasta esa fecha se podía crear una ficha con `refeps_validado=true` sin consultar REFEPS). |
| 🟠 | Recetas sin CUIR (Res. MS 2214/2025, art. 6): la columna `cuir` está vacía "hasta integración". |
| 🟠 | `/medicos` dice "comisión" → "coste por uso de la plataforma". |
| 🟠 | `/medicos` dice que Nova confecciona recetas dictadas: Nova hace solo agenda. |
| 🟠 | Mockups de la home con matrícula ficticia, "~4 min" y un precio. |
| 🟡 | El resto de la auditoría web (orden de `/medicos`, certificado en el hero, FAQ del médico). |
| 🟠 (revisión legal del relanzamiento, §8) | **Política de privacidad:** no identifica la razón social ni el domicilio del responsable de los datos (Ley 25.326, art. 6), no declara a Twilio ni el reconocimiento de voz del dictado. |
| 🟠 (ídem) | **Términos vs. código:** los T&C dicen que si el médico cancela "elegís vos: reprogramás o te reembolsamos", pero el código reembolsa directo (`TerminosContent.tsx` vs. `cancelaciones.ts`). Hay que alinearlos (decisión de Diego: cuál de los dos manda). |
| 🟠 (ídem) | **Reintegro manual:** cuando el médico no tiene saldo o token, el reintegro termina en una transferencia manual y la carga del CVU del paciente no está hecha (`api/admin/reembolsos`). Para sostener "la plata vuelve sola", en esos casos Docto tiene que poder pagar. Ligado al plan de pagos en pausa (1.11). |
| — (ídem) | El comprobante para pedir reintegro a la obra social no existe (solo queda el registro de pago de Mercado Pago): no se promete. |

## 2. Aprobado y sin implementar (no espera decisión: espera trabajo)

- **Plan de consultas efectivas** (`docs/sprints/2026-10-05-plan-consultas-efectivas.md`, decisiones del 05/10):
  - **D1 Presencia:** 15 min sin señal → WhatsApp "¿Seguís disponible?"; sin respuesta → disponibilidad apagada.
  - **D2 Llamada** automática al profesional a los 5 min de un pedido sin respuesta.
  - **D3 Otro profesional** a los 4 min, con el paciente avisado y su consentimiento.
  - **D4, la parte que falta:** pagar sobre la misma consulta al volver tarde.
  - **D5 Turnos:** anticipación mínima de 60 min y confirmación semanal de agenda.
  - **P1.12:** rastro de entrega del push y la medida en el tablero.
  - D1 y D5 necesitan plantillas de WhatsApp nuevas: el texto va a Diego antes de pedirlas a Meta.

## 3. En pausa o en carpeta (decidido no hacerlo por ahora)

| Desde | Qué | Por qué / cuándo se retoma |
|---|---|---|
| 12/10 | WhatsApp al paciente 10 min antes del turno; hora límite de pago en el WhatsApp de aceptación; link directo a Mercado Pago | alcanza con mail y notificación; la sala ya muestra la hora. Opciones, texto y costo: `docs/sprints/2026-10-12-recordatorio-10m-nunca-agendado.md` |
| 12/10 | Compensar un turno que el paciente no tomó por un aviso nuestro que no salió | se actúa solo si el paciente reclama |
| 12/10 | Destinos de pago (#522) | ver 1.11 |
| 01/09 | Piloto "despertar oferta" | en pausa, no empujar |
| 31/08 | Pantalla para cargar especialidades adicionales | se evalúa cuando aparezcan más casos (hoy por SQL) |
| 11/09 | Envío automático de respuestas de Grokbot | apagado: la cadena /ayuda → modelo → mail no es segura |
| 09/08 | Agente legal (@carolina) | en pausa: lo legal va directo a Diego |
| — | App en las tiendas | sin SRL no se puede (apps de salud) |

## 4. Deudas técnicas conocidas (no esperan decisión; se priorizan)

**Pueden fallar:**
- **Base institucional desalineada (12/10).** Le faltan columnas de tablas compartidas que existen en la principal: `consultas.cierre_evidencia`, `turnos.cierre_evidencia`, `correos.remitente_user_id`, `medicos.agenda_pausada_at`, `medicos.avisos_demanda_optin`, `medicos.especialidades_adicionales`, `pacientes.nombre`, `pacientes.apellido`, `sala_espera_entradas.ultimo_latido_at`. Y su trigger `proteger_verificacion_medico` no tiene las columnas de confianza del 01/10. En 7 días de logs no hubo errores por esas columnas; el riesgo es una pantalla de la instancia que las lea. Además (visto el 13/10 en la revisión de psicólogos F1): en la institucional `authenticated` conserva el permiso y la policy de INSERT en `medicos` que el 01/10 se sacaron en la principal, así que una sesión logueada allá podría crearse una ficha con columnas de confianza propias. Se cierra con la migración del 01/10 aplicada también allá.
- **Bloqueo por WhatsApp:** `disponible`, `oculto_clinica` y `visible_consultorio_particular` no están en el trigger; un profesional que escriba directo contra la API podría prenderlas (latente, no probado).
- **Gate de disponibilidad** (`dashboard/actions.ts`): mira el `estado` de la cuenta de MP y no su vencimiento.
- **La consulta inmediata no se revierte** si el paciente nunca entró a la sala (su `en_curso` lo escribe el pago, no la sala).
- **`revocarClaves()` rota:** nadie la llama; el día que haya que rotar una clave, el profesional queda sin poder firmar.
- **La CI de PRs no prueba Safari móvil** (solo Chromium).

- **Si falla la lectura del porcentaje, se cobra 5 % (14/10, revisión de #573).** `getComisionForMedico` (`src/lib/comisiones.ts`) devuelve 5 ante un error y `get_comision_medico` cae a 5 con `COALESCE`. Con profesionales Tradicional, un error les cobra la mitad (la diferencia la pierde Docto, no el profesional). Viene de antes; no frena ningún pago.
- **`medicos` no se upsertea con `categoria` (14/10, revisión de #573).** El trigger del 14/10 pisa la categoría en todo INSERT, y un upsert con ON CONFLICT DO UPDATE que incluya `categoria` (o la fila entera) bajaría a un fundador a Tradicional. Hoy no hay ningún camino así (latente).
- **El vigilante de firma (`documentos-sin-sello`) excluye solo al profesional de prueba (14/10, revisión de #574).** Un documento de un paciente de prueba con un profesional real, creado por script, todavía dispararía la alerta (la convención de `src/lib/insights/filtro-test.ts` filtra los dos lados). Hoy no hay ningún caso así.

**Prolijidad:**
- `cerrar-huerfanas` en la instancia loguea una vez por día `column mp_oauth_state.id does not exist` (el cron da ok).
- Badge "N pendientes" de la agenda del profesional (`src/app/medico/agenda/PanelDerecho.tsx`): cuenta reservas muertas.
- Tres variables VAPID en Vercel tienen un salto de línea pegado (el código lo limpia).
- `verificarFirmaDocumento` (`src/lib/firma/documento.ts`) no tiene llamadores.

- **El aviso "documento enviado" nunca se guarda (13/10, visto en la revisión de psicólogos F3).** `src/app/api/enviar-documento-medico/route.ts` inserta en `documentos` con `tipo: "documento_medico"`, y el CHECK de `documentos.tipo` no lo admite: el insert falla en silencio y el tope `MAX_DOCS_PER_CONSULTA` nunca cuenta nada. Viene de antes.
- **La clínica escondía profesionales (13/10, cerrado el mismo día).** La clínica y el menú de rescate miraban solo los primeros 500 turnos libres de todos, que con las agendas actuales alcanzaban apenas hasta el día siguiente: quien tenía la consulta inmediata apagada y turnos recién desde pasado mañana no aparecía. Ahora se pide el turno libre más cercano de cada profesional (`proximo_turno_libre_por_medico`, en las dos bases; `lib/turnos/proximo-libre.ts`). Lo encontró la revisión de psicólogos F2.
- **Un paciente puede confirmarse un turno sin pagar (13/10, en arreglo).** Probado en una transacción que se deshizo, con cuentas de prueba: con su propia sesión, un paciente logueado pasa un turno libre a `confirmado` con `mp_status = 'approved'` por un UPDATE directo (la policy "Pacientes actualizan sus turnos" y el permiso de UPDATE sobre todas las columnas lo dejan). Rompe "sin pago no hay turno". Se cierra con un trigger que deja a la sesión del paciente solo las transiciones que la aplicación usa.

- **Consentimiento del turno: no es obligatorio y la info médica acepta cualquier destino (13/10, revisión de #566).** Nada exige el consentimiento del turno (espera, sala y confirmación no lo miran): quien vuelve de Mercado Pago por "pendiente" o entra por el panel no lo firma. Y `/turno/[id]/info-medica` y `/consulta/[id]/info-medica` usan `?redirect=` sin pasarlo por `sanitizeRedirect` (las páginas de consentimiento sí): un link armado puede mandar afuera después de guardar la info médica. Arreglo: sanitizar en las dos, y si el consentimiento tiene que ser obligatorio, pedirlo en `/turno/[id]/espera`.

## 5. Decisiones vigentes — índice

- **23/10 — Lo primero que se ve en el admin es qué pasó, no cuánto.** Diego: "tableros con muchísima información que no dicen nada; necesito tarjetas claras donde ver qué está pasando de un solo vistazo", y "siempre primero hoy". La tarjeta «Qué pasó» (Hoy con la línea Ahora, Ayer, Últimos 7 días) abre `/admin` y `/admin/tablero`, una línea por atención con su desenlace y su porqué, la misma fila que el Historial (`src/lib/consultas/que-paso.ts`). Se fueron del Dashboard los contadores y el gráfico que contaban sin decir qué pasó. `docs/sprints/2026-10-23-tarjeta-que-paso.md`, PR #584.

- **20/10 — Pedidos de consulta inmediata sin respuesta: aviso, después revisión del nivel, después suspensión.** Diego, ante una profesional que dejó pasar dos pedidos en dos días figurando disponible (avisos entregados y no leídos): primero un aviso por mail (enviado el 20/10, firmado Valentina); si se repite, se revisa el nivel Fundador; si sigue, se suspende el perfil. Hoy no está automatizado: lo decide Diego caso por caso y con más casos a la vista ("no quiero ser reactivo", 19/10). Responde en parte a 1.4.

- **14/10 — La página de Médicos dice "¿Qué te da Docto?".** Texto de Diego, ajustado para que cada línea sea cierta: libertad ("trabajás para vos, el tiempo que elijas"), tu precio, cobrás antes de atender, todo en un solo lugar "sin salir de Docto" (no "sin herramientas externas": el cobro usa la cuenta de Mercado Pago propia), Nova como secretaria virtual, y documentar simple ("la historia clínica se arma sola con lo que ya cargaron vos y el paciente": `componerEvolucion` no inventa nada). Se publicó el mismo 14/10, dentro del congelamiento: el texto lo fue armando Diego en el chat y la decisión de no esperar al 23 fue mía. En la misma página, "comisión" pasó a "coste por uso de la plataforma". Se sumó "Coste claro" (texto de Diego): "Docto cobra el 10 % de cada consulta solo cuando vos cobrás. Nada más: sin abono ni costos ocultos. Mercado Pago descuenta aparte su cargo por procesar el pago. Lo elegimos porque te permite cobrar antes de atender y recibir la plata directo en tu cuenta." El porcentaje sale de `comisiones_config`; el cargo de Mercado Pago no se publica en números (depende del plazo que elige cada profesional y lo fija Mercado Pago). Dónde: `src/app/medicos/page.tsx` (#576, #578).

- **14/10 — Las categorías del profesional se llaman Fundador (5 %) y Oro (10 %).** Diego: "le podríamos poner esa categoría que les da nivel… los metales es un buen indicador; el top es Fundador por ahora". Lo guardado no cambia (`founder` / `tradicional`); el nombre se pone al mostrar (`src/lib/categorias.ts`). El profesional lo ve en Mi perfil ("Categoría: Fundador 5 %") y en "Cómo atendés" y "Consultorio particular", con el texto de Diego: "El pago del paciente va directo a tu Mercado Pago. A Docto por uso de la plataforma: solo N % por consulta realizada" (`src/components/CosteCategoria.tsx`; "sesión" en psicología; no se muestra en la instancia institucional). Con esto el panel deja de decir "comisión".

- **14/10 — Se cierra el ingreso de fundadores: todo profesional que se registre desde hoy entra como Tradicional (10 %).** Diego: "eliminamos el ingreso de nuevos médicos fundadores, ahora todos entran con 10%". Los que ya tenían ficha conservan su categoría (Fundador, 5 %). Hasta hoy el "Régimen para nuevos médicos" del admin no lo leía nadie (la ficha nacía `founder` por el default de la columna); ahora un trigger le pone a cada ficha nueva la categoría de ese régimen, y el régimen está en Tradicional. El admin muestra el porcentaje junto a la categoría. Ningún texto público ni mail prometía el 5 % a los nuevos (verificado el 14/10). Dónde: `supabase/migrations/20261014_nuevos_medicos_tradicional.sql`, aplicada y probada en la base principal el 14/10.

- **14/10 — Lo que Farmalink exige de nuestro lado, sin tocar lo que funciona.** Diego (13/10): "4, 5 y 6 hay que hacerlos, con cuidado de que no se rompa nada… no toquemos más de lo necesario". Hecho: la receta guarda la lista de medicamentos (`documentos.medicamentos`, solo si coincide con el texto firmado); el profesional elige la cantidad de envases ("Envases", 1 por defecto; con más de uno la receta dice "Cantidad: N envases", con uno sale igual que antes); y la fecha de nacimiento y el sexo del profesional se guardan aparte (`medicos_identidad`, desde Didit). Detalle: `docs/farmalink-integracion.md`.

- **13/10 — La CUIR queda fuera del congelamiento.** Diego: "esto es urgente". Se integra Farmalink (repositorio de recetas de pacientes particulares) para que cada receta lleve su CUIR. Estado y plan: `docs/farmalink-integracion.md` (arriba de todo).

- **13/10 — Congelamiento hasta el 22/10 inclusive.** Diego: "no quiero más cambios ni hallazgos que decidir"; le propuse no sumar nada nuevo hasta una semana después del relanzamiento del 15/10, salvo lo que haga perder consultas, y respondió "me parece lo mejor". Los hallazgos van a §4 sin traérselos. Regla en `CLAUDE.md` (Protocolo de trabajo).

- **13/10 — Psicólogos, textos y constancia (Diego: "aprueba los textos y dejar la constancia, ok lo legal").** Los textos de F1-F4 quedan como están (listados en `docs/sprints/2026-10-13-psicologos.md`); la constancia queda como está: tildada por defecto, con su texto aprobado (incluida la línea "Firmado electrónicamente en Docto."), y sin registro de que el paciente entró no se emite; lo legal propuesto en `docs/sprints/2026-10-13-psicologos-textos-legales.md` se implementa (consentimiento `psi-v1`, T&C del paciente neutros, y pie y landing condicionados al flag `registro_psicologos`, como decía el doc; los T&C del profesional esperan 1.15). Quedan sin decidir, no bloquean: si el paciente puede leer el borrador y la evolución de su propio turno por la API, y cómo se corrige una constancia con el nombre o el DNI mal.

- **13/10 — Emergencias: no se atienden en ninguna especialidad; los textos nuevos no publican números y todos remiten al servicio de emergencias de la zona.** Diego: "no damos números porque no sabemos si están actualizados; recomendamos el servicio de emergencias de su zona" y después "dejá eso (los números que ya están) y sumá 'o el servicio de emergencias de tu zona'". Aplicado al triage y al consentimiento médico (agregado, sin cambiar la versión v1: es una opción más, no una menos; si el abogado quiere v2, es una línea). El remate está en `src/lib/legal/lineas-emergencia.ts` y `tests/unit/emergencias-zona.test.ts` no deja mergear un 107 o un 911 sin la zona cerca. El texto de cada versión del consentimiento queda fijado por su huella (`consentimiento-version.test.ts`): cambiarlo obliga a decidir la versión.

- **13/10 — La sala del paciente espera a que exista la sala** (#560). Un pago real deja la consulta lista para entrar antes de que el profesional abra la sala; la pantalla del paciente la espera y se conecta sola, con un aviso mientras tanto. Textos aprobados por Diego el 13/10 tal como están. A la paciente y a la profesional del caso se les escribió el mismo día desde soporte@ (disculpas, resuelto; a la profesional, además, gracias por esperar). Detalle: `docs/sprints/2026-10-13-sala-paciente-sin-sala.md`.

Las reglas operativas están en `CLAUDE.md`; acá, la fecha y dónde está el porqué.

| Fecha | Decisión | Dónde |
|---|---|---|
| 12/10 | **Norma suprema:** lo terminado se impacta sin pedir permiso | `CLAUDE.md` → Protocolo de trabajo |
| 13/10 | **Psicólogos en Docto:** atienden solo con turno (nunca consulta inmediata); emiten evolución en la historia clínica y una constancia de atención (nunca receta, orden, certificado ni indicaciones); aparecen en una sección propia "Psicología" de la clínica, con título "Lic."; solo pacientes adultos al principio; matrícula validada con REFEPS como la del médico (profesión de psicología); coste por uso igual que los médicos. Texto de la constancia aprobado. | `docs/sprints/2026-10-13-psicologos.md` |
| 12/10 | **Medicamentos controlados:** por Docto se receta cualquier medicamento excepto psicotrópicos y estupefacientes (Leyes 19.303 y 17.818; los antibióticos no entran). Término aparte, con su propio tilde, **dinámico**: aparece solo a quien todavía no lo aceptó (paciente antes de pagar; profesional al registrarse o desde su panel, posponible). | `src/lib/legal/controlados-texto.ts` |
| 12/10 | Recordatorios al paciente: 24 h y 10 min por mail y notificación, sin WhatsApp | `docs/sprints/2026-10-12-recordatorio-10m-nunca-agendado.md` |
| 12/10 | Se borró la firma con código por mail (nunca se usó) | #545 |
| 08/10 | Profesional que no recibe los avisos no atiende ni oferta | `src/lib/medicos/bloqueo-whatsapp.ts` |
| 08/10 | El profesional puede pasar su especialidad a Medicina general; atención general = una sola puerta | `src/lib/especialidades.ts` |
| 08/10 | D4: el plazo de pago corre desde que el paciente se enteró (techo 30 min) · D6: el precio se ve antes de pedir | `src/lib/consultas/aceptada-sin-pago.ts` |
| 06/10 | Se paga solo con cuenta de Mercado Pago; el modo binario se queda | `CLAUDE.md` → Reglas de producto |
| 06/10 | Alarmas de procesos que fallan, no de sucesos | `src/lib/consultas/diagnostico.ts` |
| 05/10 | D1–D6 aprobadas | `docs/sprints/2026-10-05-plan-consultas-efectivas.md` §5 |
| 05/10 | WhatsApp al profesional también al reservar un turno y 15 min antes | `src/lib/whatsapp.ts` (plantillas aprobadas por Meta, en uso desde el 07/10) |
| 01/10 | La matrícula la dice REFEPS; no pedir a mano lo que una fuente oficial entrega | `docs/sprints/2026-10-01-la-matricula-la-dice-refeps.md` |
| 01/10 | Columnas de confianza de `medicos` | `docs/sprints/2026-10-01-hallazgo-columnas-de-confianza-medicos.md` |
| 30/09 | Una sala sin paciente no es una atención | `docs/sprints/2026-09-30-hallazgo-devolucion-externa-y-cierre-sin-paciente.md` |
| 30/09 | Plan de pagos: D-a a D-e | `docs/sprints/2026-09-29-plan-pagos-desde-docto.md` §3 |
| 08/09 | Mandato de tablas y listados | `docs/sprints/2026-09-09-mandato-tablas.md` |
| 04/09 | Un solo tablero | `docs/sprints/2026-09-04-tablero-unico.md`, `MANUAL-TABLEROS.md` |
| 01/09 | Vocabulario: "coste por uso de la plataforma", nunca "comisión" | esta línea |
| 24/08 | Ruteo por jurisdicción ratificado (el ejercicio no vale en cualquier provincia) | `docs/sprints/2026-07-02-plan-ruteo-jurisdiccional.md` |
| 23/08 | No suponer, no rellenar | `CLAUDE.md` → Reglas base |
| 23/08 | Correcciones de proceso no se le avisan al profesional | `docs/sprints/2026-08-23-nombre-apellido-y-rectificacion-identidad.md` |
| 22/08 | Pedido sin aceptar: 10 min y tope de 2 recordatorios | `docs/sprints/2026-08-22-ci-sin-aceptar-plazo-y-tope-avisos.md` |
| 19/08 | Un pedido no es una consulta hasta que lo aceptan | `src/lib/consultas/clasificar.ts` |
| 10/08 | El pago es fundacional (15 min sin gracia) | `docs/sprints/2026-08-10-pago-fundacional-regla-uber-y-nova.md` |
| 09/08 | Una atención por vez (regla del Uber) · CI pagada: 30 min | `src/lib/consultas/encuentro-activo.ts` |
| 09/08 | Si la falla es nuestra, la plata sale de Docto | `POLITICA_REEMBOLSOS_DOCTO.md` |
| 07/08 | Firma por sesión del profesional (ninguna norma exige OTP por documento) | `src/lib/firma/documento.ts` (encabezado) |
| 06/08 | Las reservas abandonadas no se muestran en reportes | `src/lib/insights/reservas.ts` |
| 24-25/07 | En el B2C el profesional no reprograma turnos otorgados: solo el paciente | — |
| 10/06 | Lanzamiento: registro abierto, cobro real, gate duro de REFEPS | `docs/CAMINO_A_LANZAMIENTO_V1.md` |
| 06/06 | Comunicaciones, cancelaciones, pagos y agenda | `DECISIONES_PRODUCTO_DOCTO.md` (lo posterior de esta tabla manda) |
| 30/05 | Política de reembolsos | `POLITICA_REEMBOLSOS_DOCTO.md` |

## 6. Superadas (no aplicar)

| Era | La reemplazó |
|---|---|
| 45 min de gracia después de la retención de un turno | sin gracia (10/08) |
| "Exigir Matrícula Nacional" | ruteo por la unión de jurisdicciones REFEPS (02/07) |
| WhatsApp al profesional solo para aceptar CI y paciente esperando (17/07) | también turno reservado y 15 min antes (05/10) |
| Plazo de la aceptada sin pagar desde la aceptación | desde que el paciente se enteró (08/10) |
| Pagar como invitado (tarjeta sin cuenta de MP) | solo con cuenta (06/10) |
| Firma con código por mail (Ola 2, junio) | firma por sesión; el código se borró (12/10) |

## 7. Mapa de documentos

**Vigentes:** `CLAUDE.md` (reglas), este archivo, `docs/sprints/` (detalle por fecha), `MANUAL-TABLEROS.md`, `POLITICA_REEMBOLSOS_DOCTO.md`, `DECISIONES_PRODUCTO_DOCTO.md` (06/06: lo posterior manda), `docs/REGISTRO_BETA_GATE.md`, `supabase/migrations-institucional/README.md`.

**Historia** (no se actualizan; no tomarlos como estado actual):
- `ROADMAP_OPERATIVO.md` (estado al 24/06)
- `ESTADO_ACTUAL_DOCTO.md` (snapshot del 04/09)
- `HISTORIAL_SPRINTS_DOCTO.md` (hasta junio)
- `PENDIENTES_PARA_PROXIMO_SPRINT.md` (mayo)
- `docs/STATUS_REAL_2026-05-28.md`
- `DECISIONES_NOTIFICACIONES_DOCTO.md` (abril, en parte superado)
- `PRINCIPIOS_OPERATIVOS_DOCTO.md` (mayo)
- `COMPLIANCE_MAP_DOCTO.md` (junio)
- `docs/archivo/CLAUDE-version-larga-2026-10-12.md` (el CLAUDE.md largo, con el porqué de cada regla)
