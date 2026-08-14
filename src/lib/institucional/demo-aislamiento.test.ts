// EL AISLAMIENTO DE LA REUNIÓN — que lo de la demo no se mezcle con lo real.
// Runner: node:test + node:assert con tsx (`npm run test:unit`).
//
// ── POR QUÉ ESTE ARCHIVO LEE CÓDIGO FUENTE Y NO EJECUTA NADA ─────────────────
// Lo que hay que fijar acá es un PREDICADO DE UNA QUERY: que el SELECT de
// `medicos` que arma la oferta del call center excluya las fichas de
// demostración, que el padrón del panel de cumplimiento haga lo mismo, y que el
// KPI de slots sin asignar no cuente la escenografía. Ninguna de las tres se
// puede probar sin una base — y la que importa es justamente la línea del
// filtro, que es lo que un refactor se lleva puesto sin que ningún test rojo lo
// note.
//
// Es la misma disciplina que `correcciones.test.ts` usa con el SQL de la 022:
// leer el archivo y exigir que la línea esté. Feo y efectivo.
//
// ── QUÉ PASA SI ESTO SE ROMPE ────────────────────────────────────────────────
// El participante de una reunión de venta —que no está matriculado— aparece en
// la pantalla del call center como candidato PREFERENTE (cuenta cero asignados,
// y el reparto parejo pone primero al que menos lleva). Un paciente real del
// padrón provincial termina atendido por él, con una receta que dice
// "DEMOSTRACIÓN — SIN VALIDEZ LEGAL", fuera del contador contractual, y con su
// historia clínica borrada cuando alguien toque "limpiar reunión".

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { HORAS_ACCESO_DEMO } from "@/lib/institucional/accesos";
import { mundosIncompatibles } from "@/lib/otorgador/asignar-turno";

/**
 * El archivo SIN comentarios. Hace falta: los comentarios de este repo tienen
 * puntos y comas adentro, y el recorte de abajo termina cada query en el primer
 * `;` — un `//` explicando por qué existe el filtro cortaba la query justo
 * antes del filtro.
 */
function fuente(ruta: string): string {
  return readFileSync(resolve(process.cwd(), ruta), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/**
 * El cuerpo de UNA función: desde su declaración hasta la siguiente declaración
 * de nivel superior del archivo.
 *
 * ⚠️ POR QUÉ ESTE HELPER EXISTE (y por qué hay que usarlo SIEMPRE que se busque
 * algo "adentro de tal función"): las aserciones de este archivo son `indexOf`
 * sobre texto, y un `indexOf` sobre el archivo ENTERO encuentra la ocurrencia de
 * CUALQUIER función. Pasó de verdad: `reprogramar.ts` sumó un segundo
 * `mundosIncompatibles(` en `registrarGestionManual` —que está más arriba que
 * `reprogramarTurnoInstitucional`— y la aserción "el guard va antes del UPDATE"
 * se volvió una tautología. Borrando el guard crítico, la suite entera seguía en
 * verde. Un test que no se pone rojo cuando el agujero se abre no cuida nada.
 */
function cuerpoDe(codigo: string, declaracion: string): string {
  const i = codigo.indexOf(declaracion);
  assert.ok(i >= 0, `ya no está \`${declaracion}\`: revisá este test`);
  const resto = codigo.slice(i + declaracion.length);
  const siguiente = resto.match(/^(?:export\s+)?(?:async\s+)?function\s/m);
  return declaracion + (siguiente ? resto.slice(0, siguiente.index) : resto);
}

/**
 * Los bloques de query que arrancan en `.from("<tabla>")` y terminan en el
 * primer `;` — que es donde termina el encadenamiento de PostgREST.
 */
function queriesDe(codigo: string, tabla: string): string[] {
  const marca = `.from("${tabla}")`;
  const bloques: string[] = [];
  let desde = 0;
  for (;;) {
    const i = codigo.indexOf(marca, desde);
    if (i === -1) break;
    const fin = codigo.indexOf(";", i);
    bloques.push(codigo.slice(i, fin === -1 ? codigo.length : fin));
    desde = i + marca.length;
  }
  return bloques;
}

test("la oferta del call center nunca cruza los dos mundos", () => {
  const codigo = fuente("src/lib/otorgador/oferta.ts");
  const queries = queriesDe(codigo, "medicos");
  assert.ok(queries.length >= 2, "cambió la forma de oferta.ts: revisá este test");
  for (const q of queries) {
    assert.match(
      q,
      /mundo\s*\n?\s*\)/,
      "un SELECT de médicos de la oferta dejó de pasar por `acotarAlMundo`: el participante " +
        "de una reunión vuelve a ser candidato para un paciente real (y con cero asignados, " +
        "o sea PRIMERO de la lista)"
    );
  }
  assert.match(
    codigo,
    /demoSesionId[\s\S]{0,80}filtro\.eq\("demo_sesion_id", demoSesionId\)[\s\S]{0,40}filtro\.is\("demo_sesion_id", null\)/,
    "acotarAlMundo dejó de separar los dos mundos"
  );
});

test("asignar exige que el paciente y el profesional sean del mismo mundo", () => {
  // La oferta separa los mundos, pero es el filtro de UNA pantalla y esta API
  // tiene clientes que no pasan por ninguna: un operador IA, Nova, un curl.
  assert.equal(mundosIncompatibles(null, null), null);
  assert.equal(mundosIncompatibles("reunion-1", "reunion-1"), null);
  assert.ok(mundosIncompatibles(null, "reunion-1"), "un paciente real con un profesional de demo");
  assert.ok(mundosIncompatibles("reunion-1", null), "un paciente de demo con un profesional real");
  assert.ok(mundosIncompatibles("reunion-1", "reunion-2"), "dos reuniones distintas");

  // Los TRES caminos que escriben un `paciente_id` en un encuentro. `reprogramar`
  // faltaba, y por eso este test daba verde con la puerta abierta: su único guard
  // era `estado_registro !== 'aprobado'` y el profesional de demo nace aprobado.
  // Se busca adentro de la FUNCIÓN que escribe, nunca en el archivo entero:
  // `reprogramar.ts` tiene otro `mundosIncompatibles(` más arriba (la gestión
  // manual), y con la búsqueda global esta aserción pasaba igual aunque la
  // puerta crítica no existiera.
  const PUERTAS: [string, string][] = [
    ["src/lib/otorgador/asignar-turno.ts", "export async function asignarTurno"],
    ["src/lib/otorgador/asignar-ci.ts", "export async function asignarCI"],
    ["src/lib/otorgador/reprogramar.ts", "export async function reprogramarTurnoInstitucional"],
  ];
  for (const [ruta, declaracion] of PUERTAS) {
    assert.match(
      cuerpoDe(fuente(ruta), declaracion),
      /mundosIncompatibles\(/,
      `${declaracion} dejó de comprobar el mundo antes de escribir la asignación`
    );
  }
});

test("la reprogramación comprueba el mundo ANTES de tomar el horario nuevo", () => {
  // Comprobarlo después del UPDATE no sirve de nada: el turno ya quedaría con el
  // paciente adentro y el trigger de la 025 ya le habría estampado `es_demo`.
  //
  // ⚠️ Se recorta la función ANTES de buscar. Con `indexOf` sobre el archivo
  // entero, la primera ocurrencia de `mundosIncompatibles(` pasó a ser la de
  // `registrarGestionManual` —que está más arriba— y la comparación quedó
  // siempre verdadera: borrando el guard de ESTA función la suite daba verde con
  // el agujero abierto.
  const cuerpo = cuerpoDe(
    fuente("src/lib/otorgador/reprogramar.ts"),
    "export async function reprogramarTurnoInstitucional"
  );
  const guard = cuerpo.indexOf("mundosIncompatibles(");
  const update = cuerpo.indexOf('estado: "confirmado"');
  assert.ok(
    guard > 0,
    "reprogramarTurnoInstitucional dejó de comprobar el mundo: un POST con el turno de un " +
      "paciente real y un slot del participante lo deja atendido por alguien no matriculado"
  );
  assert.ok(update > 0, "cambió la forma de reprogramar.ts: revisá este test");
  assert.ok(guard < update, "el guard de mundos quedó DESPUÉS del UPDATE que toma el horario");
});

test("el padrón del panel de cumplimiento excluye a los profesionales de demostración", () => {
  const codigo = fuente("src/lib/metering/bolsa.ts");
  // Solo las que arman un UNIVERSO (filtran por estado y especialidad). La otra
  // query de `medicos` de este archivo lee nombres de ids YA SELLADOS: filtrarla
  // dejaría filas selladas sin nombre, que es el bug contrario.
  const queries = queriesDe(codigo, "medicos").filter((q) => q.includes("estado_registro"));
  assert.ok(queries.length >= 1, "cambió la forma de bolsa.ts: revisá este test");
  for (const q of queries) {
    assert.match(
      q,
      /\.is\("demo_sesion_id", null\)/,
      "el universo del cumplimiento volvió a incluir fichas de demostración"
    );
  }
});

test("los slots de la escenografía no se cuentan como oferta que nadie tomó", () => {
  const codigo = fuente("src/lib/metering/panel.ts");
  const queries = queriesDe(codigo, "turnos");
  assert.ok(queries.length >= 1, "cambió la forma de panel.ts: revisá este test");
  for (const q of queries) {
    assert.match(
      q,
      /\.not\("es_demo", "is", true\)/,
      "el KPI de slots sin asignar volvió a contar la agenda de una demo"
    );
  }
});

test("los KPI del panel de la provincia no cuentan las consultas de una reunión", () => {
  // Entre la reunión y la limpieza, el panel REAL mostraba consultas que no
  // existieron; y para los encuentros que la firma retiene —que la limpieza no
  // borra— la mentira era permanente.
  const codigo = fuente("src/lib/metering/panel.ts");
  const kpi = queriesDe(codigo, "encuentros_metering").filter((q) => q.includes("clasificacion"));
  assert.ok(kpi.length >= 1, "cambió la forma de panel.ts: revisá este test");
  assert.match(
    kpi[0],
    /\.eq\("es_demo", false\)/,
    "el resumen semanal del panel volvió a contar las consultas de una reunión de venta"
  );
});

test("el detalle del panel muestra la consulta de la demo, pero marcada", () => {
  // Excluirla del listado rompería la escena 6 ("el panel refleja lo que acaba
  // de pasar"). Mostrarla sin marca es lo que hacía que el panel mintiera.
  const codigo = fuente("src/lib/metering/panel.ts");
  assert.match(
    codigo,
    /segundos_ambos_en_sala, es_demo/,
    "el detalle de la tab Consultas dejó de leer la marca de demostración"
  );
  assert.match(
    codigo,
    /esDemo: f\.es_demo === true/,
    "las filas del detalle dejaron de viajar con la marca: la pantalla no puede pintar el chip"
  );
  assert.match(
    fuente("src/app/panel/TabConsultas.tsx"),
    /e\.esDemo &&[\s\S]{0,200}Demostración/,
    "la tab Consultas dejó de pintar el chip: una consulta de una reunión de venta vuelve a " +
      "verse igual que una de la provincia"
  );
});

test("la facturación no lee una sola fila del contador sin excluir la demostración", () => {
  const codigo = fuente("src/lib/metering/facturacion.ts");
  const queries = queriesDe(codigo, "encuentros_metering");
  assert.ok(queries.length >= 5, "cambió la forma de facturacion.ts: revisá este test");
  for (const q of queries) {
    assert.match(
      q,
      /\.eq\("es_demo", false\)/,
      "una query de facturación perdió el filtro de demostración: la provincia " +
        "recibiría una factura con consultas de una reunión de venta"
    );
  }
});

test("el clasificador escribe la marca de demostración en la fila del contador", () => {
  const codigo = fuente("src/lib/metering/clasificar.ts");
  assert.match(
    codigo,
    /es_demo: encuentro\.es_demo === true/,
    "la fila del contador dejó de llevar la marca: la facturación no la puede filtrar"
  );
});

test('"limpiar reunión" nunca borra por médico a secas: exige la marca de demostración', () => {
  const codigo = fuente("src/lib/institucional/demo-invitacion.ts");
  // La recolección tiene que TRAER la marca y decidir con ella. Si vuelve a
  // seleccionar solo `id`, no hay forma de distinguir el turno de un paciente
  // real asignado por error al participante — y se borra con su historia.
  for (const tabla of ["turnos", "consultas"]) {
    for (const q of queriesDe(codigo, tabla).filter((x) => x.includes(".select("))) {
      assert.match(
        q,
        /\.select\("id, es_demo"\)/,
        `la recolección de ${tabla} de la limpieza dejó de leer es_demo`
      );
    }
  }
  assert.match(
    codigo,
    /if \(f\.es_demo !== true\)/,
    "la limpieza dejó de excluir los encuentros sin marca de demostración"
  );
});

test("el sello de un documento de demostración no lleva el nombre de nadie", () => {
  // La raíz del problema: el snapshot de identidad es INMUTABLE (entra al hash),
  // lo sirve `/verificar/{id}` —pública y sin auth— y la limpieza no lo puede
  // tocar porque `firma_logs` retiene por FK al documento. Lo que no se escribe
  // no hay que anonimizarlo después.
  const codigo = fuente("src/lib/firma/identidad.ts");
  assert.match(
    codigo,
    /medico_nombre: demo\.medico \? NOMBRE_UTILERIA\.profesional/,
    "el snapshot volvió a congelar el nombre real del profesional de una reunión"
  );
  // Del paciente ya no se elige campo por campo qué se anonimiza: se elige el
  // BLOQUE entero. Elegir campo por campo fue exactamente cómo se quedaron
  // adentro del sello la fecha de nacimiento y el sexo reales. El contenido de
  // cada campo lo recorre `src/lib/firma/identidad-demo.test.ts`.
  assert.match(
    codigo,
    /\.\.\.\(demo\.paciente\s*\n?\s*\?\s*pacienteCongeladoParaDemo\(\)/,
    "el snapshot volvió a congelar datos reales del paciente de una reunión"
  );
});

test("el registro de firma tampoco guarda a la persona ni su dispositivo", () => {
  // `firma_logs` es append-only por trigger: lo que se escribe ahí es para
  // siempre, incluso después de "limpiar reunión".
  const codigo = fuente("src/lib/firma/documento.ts");
  assert.match(
    codigo,
    /nombre_completo: esDemo \? NOMBRE_UTILERIA\.profesional/,
    "el snapshot del firmante volvió a guardar el nombre real del participante"
  );
  assert.match(
    codigo,
    /ip: demoFirmante \? null : log\.ip/,
    "el log de firma volvió a guardar la IP del participante de una reunión"
  );
});

test("la página pública no muestra la identidad de un documento de demostración", () => {
  const codigo = fuente("src/app/api/verificar/[id]/route.ts");
  assert.match(
    codigo,
    /medico: demostracion[\s\S]{0,120}NOMBRE_UTILERIA\.profesional/,
    "/verificar volvió a exponer al firmante de un documento de demostración: esa página " +
      "es pública, sin auth, y su UUID quedó impreso en el papel proyectado"
  );
});

test("la limpieza borra los documentos fila por fila, no de un saque", () => {
  // Un DELETE con `.in()` es UNA sentencia: el 23503 del documento firmado
  // abortaba la sentencia entera y sobrevivían también la evolución y la orden,
  // que ni firma tienen.
  const codigo = fuente("src/lib/institucional/demo-invitacion.ts");
  assert.match(
    codigo,
    /if \(paso\.tabla === "documentos"\) \{[\s\S]{0,120}borrarDocumentosUnoPorUno/,
    "los documentos volvieron al DELETE con .in(): un solo documento firmado se lleva puesto " +
      "el borrado entero"
  );
  assert.match(
    codigo,
    /from\("documentos"\)\.delete\(\)\.eq\("id"/,
    "borrarDocumentosUnoPorUno dejó de borrar por id"
  );
});

test("la limpieza no intenta borrar evidencia de firma", () => {
  const codigo = fuente("src/lib/institucional/demo-invitacion.ts");
  for (const tabla of ["recetas", "firma_logs", "otp_firma", "medico_claves"]) {
    assert.equal(
      queriesDe(codigo, tabla).length,
      0,
      `la limpieza volvió a tocar ${tabla}: tiene trigger anti-DELETE y la operación entera falla`
    );
  }
});

test("la reunión no se marca como cerrada si quedó algo por reintentar", () => {
  const codigo = fuente("src/lib/institucional/demo-invitacion.ts");
  const i = codigo.indexOf("cerrada_at: new Date().toISOString()");
  assert.ok(i > 0, "cambió la forma del cierre de la reunión: revisá este test");
  const antes = codigo.slice(Math.max(0, i - 400), i);
  assert.match(
    antes,
    /if \(problemas\.length === 0\)/,
    "volvió a cerrarse la reunión con problemas abiertos: la pantalla esconde el botón " +
      "de limpiar y no queda forma de reintentar"
  );
});

test("el enlace de una reunión vence en horas, no en la retención de documentos", () => {
  const codigo = fuente("src/lib/institucional/accesos.ts");
  assert.match(
    codigo,
    /params\.origen === "demo"[\s\S]{0,160}HORAS_ACCESO_DEMO \* HORA_MS/,
    "el enlace de demo volvió a vencer con `vigencia_documentos_dias` (30 días por " +
      "default): es política de retención de documentos del paciente, no el TTL de un " +
      "acceso bearer al dashboard clínico que se proyecta en una pared"
  );
  assert.ok(HORAS_ACCESO_DEMO <= 24, "el enlace de la reunión no puede durar más de un día");
});

test("regenerar el QR echa al que ya había entrado con el anterior", () => {
  // El corte de antes era un COMENTARIO ("// ─── Limpiar la reunión"), y
  // `fuente()` borra los comentarios: el `indexOf` devolvía -1 y el cuerpo era
  // todo el resto del archivo, limpieza incluida.
  const codigo = fuente("src/lib/institucional/demo-invitacion.ts");
  const cuerpo = cuerpoDe(codigo, "export async function regenerarEnlace");
  const revoca = cuerpo.indexOf("revocarAccesosDeSujeto");
  const acuna = cuerpo.indexOf("crearAccesoLink");
  assert.ok(revoca > 0, "regenerar el QR volvió a revocar solo el token: la sesión que ese " +
    "token minteó se renueva sola y no se echa a nadie");
  assert.ok(acuna > 0, "regenerarEnlace dejó de acuñar un enlace: revisá este test");
  assert.ok(revoca < acuna, "se revoca DESPUÉS de acuñar: mata el enlace recién emitido");
});

test("la cookie del acceso también acota la sesión del profesional", () => {
  const codigo = fuente("src/lib/institucional/accesos.ts");
  assert.match(
    codigo,
    /return data\.medico_id === params\.medicoId/,
    "accesoSigueVivo volvió a comparar solo por paciente_id: para una fila de profesional " +
      "eso es `null !== <id>` y el acceso queda vivo pase lo que pase"
  );
  const dashboard = fuente("src/app/dashboard/page.tsx");
  assert.match(
    dashboard,
    /profesionalDemoSigueAdentro/,
    "el dashboard del profesional dejó de mirar si su acceso sigue vivo"
  );
});

test("el enlace revocado cierra TODAS las pantallas del profesional, no solo el dashboard", () => {
  // Con el JWT todavía vivo (cerca de una hora después de revocar), el que
  // fotografió el QR seguía entrando a la agenda, a "mis pacientes" y al
  // workspace de una consulta — historia clínica de la institución.
  assert.match(
    fuente("src/app/medico/layout.tsx"),
    /exigirProfesionalHabilitado\(\)/,
    "el layout de /medico dejó de mirar si el acceso de la reunión sigue vivo: la agenda, " +
      "mis pacientes y el workspace vuelven a quedar abiertos"
  );
  // Nova además ESCRIBE: crea agendas y bloquea períodos.
  for (const ruta of ["chat", "confirmar", "tts"]) {
    assert.match(
      fuente(`src/app/api/nova/${ruta}/route.ts`),
      /profesionalSigueHabilitado\(\)/,
      `/api/nova/${ruta} dejó de mirar si el acceso de la reunión sigue vivo`
    );
  }
});

/**
 * Las APIs que sirven o entregan contenido clínico, y que un access token vivo
 * alcanza SIN pasar por ninguna pantalla. Es la lista que hace verdadera la
 * promesa del módulo: la puerta no está en el layout, está donde se sirve el
 * dato. Sumar una ruta de esta clase implica sumarla acá.
 */
const APIS_CON_DATO_CLINICO = [
  // El papel entero, con el gate puesto en el cliente RLS — que para la sesión
  // del participante dice que sí, porque la sesión es suya.
  "src/app/api/documentos/[id]/pdf/route.ts",
  // Historia clínica de la institución, con service role.
  "src/app/api/panel/hc/[documentoId]/route.ts",
  // Provisiona claves de firma del profesional (ESCRIBE).
  "src/app/api/firma/configurar/route.ts",
  // Cancela una consulta con service role (ESCRIBE).
  "src/app/api/consultas/cancelar-solicitud/route.ts",
  // El timeline de atenciones del profesional.
  "src/app/api/historial-inline/route.ts",
  // Entrega URLs firmadas de 4 horas a los estudios subidos.
  "src/app/api/consulta/estudios/route.ts",
];

test("el enlace revocado también cierra las APIs que sirven datos clínicos", () => {
  // El agujero que quedaba: el guard estaba en las PANTALLAS y en la API que
  // escribe (Nova), pero `GET /api/documentos/{id}/pdf` no necesita pantallas.
  // Con el access token vivo —cerca de una hora después de revocar, o sea
  // exactamente la ventana que el fix dice tapar— quien fotografió el QR seguía
  // bajando documentos y HC por API.
  for (const ruta of APIS_CON_DATO_CLINICO) {
    assert.match(
      fuente(ruta),
      /respuestaSiAccesoDemoMuerto\(\)/,
      `${ruta} dejó de mirar si el acceso de la reunión sigue vivo: con el token todavía ` +
        `válido, el que fotografió el QR proyectado vuelve a poder leer esto`
    );
  }
});

test("la puerta de la API mira a los DOS sujetos, no solo al profesional", () => {
  // El enlace de una reunión se emite igual para el que entra como paciente y
  // se proyecta en la misma pared. Mirando solo `medicos`, el mismo agujero
  // quedaba abierto del otro lado.
  const codigo = fuente("src/lib/institucional/demo-puerta.ts");
  const cuerpo = cuerpoDe(codigo, "export async function sujetoDemoSigueHabilitado");
  assert.match(cuerpo, /\.from\("medicos"\)/, "la puerta de la API dejó de mirar al profesional");
  assert.match(cuerpo, /\.from\("pacientes"\)/, "la puerta de la API dejó de mirar al paciente");
  assert.match(
    cuerpo,
    /accesoSigueVivo\(\{ accesoId, pacienteId: paciente\.id \}\)/,
    "la puerta de la API dejó de comprobar el acceso del participante-paciente"
  );
});

test("las dos fases sueltas de la reprogramación masiva también miran los mundos", () => {
  // FASE 3 (`cerrar_dia`) es la única fase que CANCELA slots, y aceptaba
  // cualquier medico_id: un POST apuntado al profesional equivocado le cierra
  // el día entero de agenda. FASE 2b escribe una fila de auditoría con el par
  // paciente/profesional del turno — si ese par ya cruza los dos mundos, la
  // fila legitima un estado que no debería existir y el call center llama.
  const codigo = fuente("src/lib/otorgador/reprogramar.ts");

  const cuerpoCerrar = cuerpoDe(codigo, "export async function marcarDiaSinAtencionDelProfesional");
  assert.match(
    cuerpoCerrar,
    /\.eq\("es_demo", esDemo\)/,
    "cerrar el día volvió a tocar turnos de cualquier mundo: un cierre pedido para el " +
      "participante de una reunión puede cancelar slots reales de esa misma ficha, y al revés"
  );

  // `slice(iGestion)` llegaba hasta el FINAL del archivo, o sea que el
  // `mundosIncompatibles(` de `reprogramarTurnoInstitucional` —que está más
  // abajo— hacía pasar esta aserción sola.
  const cuerpoGestion = cuerpoDe(codigo, "export async function registrarGestionManual");
  assert.match(
    cuerpoGestion,
    /mundosIncompatibles\(/,
    "la gestión manual volvió a registrar cualquier turno, incluso uno que cruza los dos mundos"
  );
});

test("el texto que el participante escribió a mano no sobrevive en los retenidos", () => {
  // El sello nunca llevó nombres, pero `documentos.contenido` es lo que la
  // persona TIPEÓ en el workspace delante de la sala. Si escribió el nombre de
  // un tercero, ese nombre quedaba en la base para siempre: la fila retenida
  // por `firma_logs` no se puede borrar.
  const codigo = fuente("src/lib/institucional/demo-invitacion.ts");
  assert.match(
    codigo,
    /borrarContenidoClinicoRetenido\(retenidosIds, problemas\)/,
    "la limpieza dejó de borrar el contenido clínico de los documentos retenidos"
  );
  // Ventana de 900 caracteres antes: si la función crecía, las columnas de más
  // abajo se buscaban en el aire (y si encogía, se buscaban en la función
  // siguiente). El recorte va por declaración.
  const cuerpo = cuerpoDe(codigo, "async function borrarContenidoClinicoRetenido");
  for (const columna of ["contenido", "diagnostico", "tratamiento"]) {
    assert.match(
      cuerpo,
      new RegExp(`${columna}: TEXTO_BORRADO`),
      `\`documentos.${columna}\` es texto libre del participante y volvió a quedarse en la base`
    );
  }
  // Y la consecuencia se DICE: al vaciar el contenido, el sello deja de
  // verificar. Un "reunión limpia" que no lo aclare es una sorpresa esperando.
  assert.match(
    fuente("src/app/admin/demo/DemoClient.tsx"),
    /alterado/,
    "el diálogo de limpiar reunión dejó de avisar que la verificación pasa a decir 'alterado'"
  );
});

test("emitir un enlace nuevo SIEMPRE se pregunta, aunque figure como invitado", () => {
  // `marcarParticipanteEntro` es best-effort (nunca lanza, nunca frena el
  // minteo), así que "Invitado" no prueba que la persona no haya entrado.
  // Confirmar solo cuando el semáforo dice que entró echaba en silencio a quien
  // entró y no quedó anotado — justo el caso de la pantalla recargada, que es
  // cuando "Ver QR" cae solo en este camino.
  const codigo = fuente("src/app/admin/demo/DemoClient.tsx");
  const i = codigo.indexOf("function pedirEnlaceNuevo");
  const j = codigo.indexOf("function regenerar", i);
  assert.ok(i > 0 && j > i, "cambió la forma de DemoClient: revisá este test");
  const cuerpo = codigo.slice(i, j);
  assert.ok(
    !/estado !== "invitado"/.test(cuerpo),
    "volvió el atajo: con el semáforo en 'Invitado' se emite un enlace nuevo sin preguntar"
  );
  assert.match(cuerpo, /setConfirmarRegenerar\(/, "dejó de pedir confirmación");

  const iWa = codigo.indexOf("function pedirWhatsApp");
  const cuerpoWa = codigo.slice(iWa, codigo.indexOf("function mandarWhatsApp", iWa));
  assert.ok(
    !/estado !== "invitado"/.test(cuerpoWa),
    "WhatsApp emite un enlace nuevo igual que Regenerar: tiene que preguntar siempre"
  );
});

test("preparar el escenario comprueba que el profesional sea de ESA reunión", () => {
  const codigo = fuente("src/lib/institucional/demo-escenario.ts");
  assert.match(
    codigo,
    /ficha\.demo_sesion_id !== params\.sesionId/,
    "prepararEscenario volvió a aceptar cualquier medicoId: apuntado a un profesional real " +
      "le llena la agenda de turnos a precio 0, le sienta pacientes de utilería, marca esos " +
      "slots como demo de forma irreversible y después la limpieza se los borra"
  );
});

test("la marca de demostración del papel no depende de que el branding se pueda armar", () => {
  const archivo = fuente("src/lib/institucional/branding-pdf.ts");
  const codigo = archivo.slice(archivo.indexOf("export async function brandingParaPDF"));
  const iDemo = codigo.indexOf("const demo = await documentoEsDemo(documentoId)");
  const iTry = codigo.indexOf("try {");
  assert.ok(iDemo > 0, "brandingParaPDF dejó de resolver la marca de demostración");
  assert.ok(
    iDemo < iTry,
    "la marca de demostración volvió adentro del try: un blip bajando el isologo del " +
      "Storage devuelve undefined y el papel firmado en una reunión sale limpio"
  );
  assert.match(
    codigo,
    /if \(demo\) return \{ nombre: "", efectorTexto: "", demo: true \}/,
    "el catch dejó de conservar la marca de demostración"
  );
});
