import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarDesdeBandeja, type DireccionPropia } from "@/lib/correo";
import { estadoCuentaMp } from "@/lib/mp-cuenta";
import { identidadHabilitada, camposFaltantesMedico } from "@/lib/perfil-medico";
import { estaEnHorario } from "@/app/clinica/disponibilidad";
import { tieneClaves } from "@/lib/firma/claves";
import { logInfo, logWarn } from "@/lib/logger";
import { assertNoInstitucional } from "@/lib/instancia";

// ─── Acceso acotado a la Bandeja para un asistente externo ───────────────────
//
// POR QUÉ EXISTE (pedido de Diego, 11/09/2026): se quiere que un asistente
// externo lea los mails que entran a la bandeja y proponga respuestas, SIN
// darle acceso a la plataforma ni a la base de datos.
//
// Esta ruta es la única puerta. El asistente nunca ve el panel, ni `consultas`,
// ni `turnos`, ni nada que no devuelvan estos cuatro verbos: la bandeja entera
// (`correos`), y el ESTADO de quien escribió, sin la PII que no hace falta para
// contestarle. Ver `quienEscribio` más abajo para los tres límites de eso.
//
// ── LOS TRES CANDADOS ───────────────────────────────────────────────────────
//
// 1. TOKEN PROPIO (`BANDEJA_BOT_TOKEN`). No se reusa CRON_SECRET ni ninguna
//    otra clave: si este token se filtra, se rota solo y no toca nada más.
//    Sin la variable seteada la ruta entera responde 404, como si no existiera.
//
// 2. NO PUEDE ESCRIBIRLE A CUALQUIERA. Solo puede responder a un correo que ya
//    existe en la bandeja, y la dirección de destino la resuelve el servidor
//    leyendo ese correo. El asistente no elige el destinatario: si lo manda, se
//    ignora. Así no puede usarse para mandar mail a nadie que no nos haya
//    escrito primero.
//
// 3. NO ENVÍA POR DEFECTO. `enviar: true` solo funciona si además está
//    `BANDEJA_BOT_ENVIO=on` en el entorno. Sin eso, la respuesta se devuelve
//    como borrador —exactamente lo que se mandaría— y no sale ningún mail.
//    Es el interruptor para entrenarlo sin riesgo y prenderlo cuando se confíe.
//
// ── LO QUE ESTA RUTA NO RESUELVE ────────────────────────────────────────────
// El contenido de estos mails incluye datos personales de pacientes y
// profesionales, y sale hacia un tercero. Eso exige que el proveedor esté
// declarado en la Política de Privacidad (art. 12 inc. a, Ley 25.326), igual
// que Didit. Ese requisito es legal, no técnico, y este archivo no lo cumple
// por sí solo.

export const dynamic = "force-dynamic";

// Campos que el asistente puede ver. `cuerpo_html` queda afuera, pero que quede
// claro que eso NO es una protección: `cuerpo_texto` trae el mismo contenido del
// mismo mail. Lo único que se evita es mandarle marcado que no necesita.
//
// Y esto sí importa: `cuerpo_texto` es texto que escribió cualquiera. Del otro
// lado hay un modelo que lo lee. Tratarlo como dato y nunca como instrucción es
// una regla del asistente, no algo que esta ruta pueda garantizar.
const CAMPOS = "id, creado_en, direccion, de, para, asunto, cuerpo_texto, leido, atendido, en_respuesta_a, sistema";

/** Tope de mails por pedido, para que una sola llamada no se lleve la bandeja entera. */
const MAX_LISTA = 50;

/** Tope del cuerpo de una respuesta, el mismo que el formulario de ayuda. */
const MAX_CUERPO = 4000;

function autorizado(req: NextRequest): boolean {
  const esperado = process.env.BANDEJA_BOT_TOKEN;
  if (!esperado) return false;
  const header = req.headers.get("authorization") ?? "";
  return header === `Bearer ${esperado}`;
}

/** Sin la variable seteada, la ruta no existe: ni siquiera admite que hay algo acá. */
function sinConfigurar(): boolean {
  return !process.env.BANDEJA_BOT_TOKEN;
}

const UNA_DIRECCION = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/;

/**
 * Saca la dirección real del campo `de`, que se guarda crudo tal como vino en la
 * cabecera From del mail.
 *
 * OJO CON ESTO, que es la trampa que tiene: el nombre para mostrar lo escribe
 * quien manda el mail, y puede contener una dirección. Una regex que busque "el
 * primer arroba del string" devuelve ESA en vez de la del remitente:
 *
 *     "otra.persona@docto.com.ar <atacante@ejemplo.test>"
 *      ^^^^^^^^^^^^^^^^^^^^^^^^^ la primera, que no es quien escribió
 *
 * Con eso, el que manda el mail elige a quién se le consulta el estado y a quién
 * le sale la respuesta. Por eso se parsea como parsea el correo: **lo que vale
 * es lo que está entre los últimos < >**, y si no hay ninguno, el string entero
 * tiene que ser una dirección y nada más.
 */
function direccionDe(campoDe: string | null | undefined): string | null {
  const crudo = String(campoDe ?? "").trim();
  const entreAngulos = crudo.match(/<([^<>]+)>\s*$/);
  const candidato = (entreAngulos ? entreAngulos[1] : crudo).trim();
  return UNA_DIRECCION.test(candidato) ? candidato : null;
}

/** En LIKE, `%` y `_` son comodines y los dos son legales en un mail. */
function sinComodines(texto: string): string {
  return texto.replace(/([\\%_])/g, "\\$1");
}

// ── LEER ────────────────────────────────────────────────────────────────────
// GET ?accion=pendientes            → lo que entró y todavía nadie atendió
// GET ?accion=hilo&id=<uuid>        → un correo y todo su hilo
// GET ?accion=quien&correoId=<uuid> → el estado de quien escribió ese correo
export async function GET(req: NextRequest) {
  if (!assertNoInstitucional() || sinConfigurar()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!autorizado(req)) {
    logWarn("[bandeja-bot]", "Intento no autorizado");
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const admin = createAdminClient();
  const accion = req.nextUrl.searchParams.get("accion") ?? "pendientes";

  if (accion === "pendientes") {
    // Solo lo que ENTRÓ, sin atender y que no sea un mail automático nuestro.
    const { data, error } = await admin
      .from("correos")
      .select(CAMPOS)
      .eq("direccion", "entrada")
      .eq("atendido", false)
      .or("sistema.is.null,sistema.eq.false")
      .order("creado_en", { ascending: false })
      .limit(MAX_LISTA);

    if (error) return NextResponse.json({ error: "No se pudo leer la bandeja" }, { status: 500 });
    logInfo("[bandeja-bot]", "Pendientes", { cantidad: (data ?? []).length });
    return NextResponse.json({ correos: data ?? [] });
  }

  if (accion === "hilo") {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });

    const { data: correo, error: errCorreo } = await admin
      .from("correos")
      .select(CAMPOS)
      .eq("id", id)
      .maybeSingle();

    // Un fallo de base NO es un correo inexistente. Sin este corte, los dos se
    // veían igual desde afuera.
    if (errCorreo) return NextResponse.json({ error: "No se pudo leer el correo" }, { status: 502 });
    if (!correo) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

    // El hilo: lo que se escribió en respuesta a este correo.
    const { data: respuestas, error: errRespuestas } = await admin
      .from("correos")
      .select(CAMPOS)
      .eq("en_respuesta_a", id)
      .order("creado_en", { ascending: true });

    // Idem: devolver el hilo vacío haría creer que nadie contestó nunca.
    if (errRespuestas) return NextResponse.json({ error: "No se pudo leer el hilo" }, { status: 502 });

    return NextResponse.json({ correo, respuestas: respuestas ?? [] });
  }

  if (accion === "quien") {
    return await quienEscribio(admin, req.nextUrl.searchParams.get("correoId"));
  }

  return NextResponse.json({ error: "Acción desconocida" }, { status: 400 });
}

// ── QUIÉN ESCRIBIÓ ──────────────────────────────────────────────────────────
//
// La segunda puerta (pedido de Diego, 11/09/2026). Casi toda la bandeja son
// profesionales preguntando por su registro, su validación o su cobro, y las
// tres cosas se miran en el panel de administración. Sin esto el asistente
// tiene que escalar el grueso de los mails.
//
// Devuelve el ESTADO de quien escribió. Tres límites, a propósito:
//
// 1. NO SE BUSCA POR CORREO LIBRE. Se entra por el id de un mail de la bandeja
//    y el servidor resuelve la dirección leyéndolo, igual que en el camino de
//    responder. El asistente no puede preguntar por una persona cualquiera:
//    solo por alguien que nos escribió.
//
// 2. NO VIAJA PII QUE NO HAGA FALTA PARA CONTESTAR. Quedan afuera DNI, CUIT,
//    celular personal, domicilio, notas internas de admin, la foto de la
//    credencial y el crudo de REFEPS. Lo que va es el ESTADO: en qué paso
//    quedó, si la matrícula figura validada, si puede cobrar, si firmó.
//
// 3. NO VIAJA LA CATEGORÍA COMERCIAL. El coste por uso depende de ella, y la
//    regla de la casa es que un porcentaje no se dice nunca sin verificarlo
//    caso por caso. Dándole la categoría, el asistente podría deducirlo. Ese
//    tema sigue escalando a una persona.
//
// De un paciente se devuelve solamente si está registrado y desde cuándo. Nada
// clínico: ni consultas, ni documentos, ni diagnósticos. Para eso no hay puerta.
async function quienEscribio(
  admin: ReturnType<typeof createAdminClient>,
  correoId: string | null,
): Promise<NextResponse> {
  if (!correoId) return NextResponse.json({ error: "Falta correoId" }, { status: 400 });

  const { data: correo, error: errCorreo } = await admin
    .from("correos")
    .select("id, de, direccion, resend_id")
    .eq("id", correoId)
    .maybeSingle();

  if (errCorreo) return NextResponse.json({ error: "No se pudo leer el correo" }, { status: 502 });
  if (!correo) return NextResponse.json({ error: "Correo no encontrado" }, { status: 404 });
  // La misma guarda que el POST. Sin esto se puede preguntar por el id de una
  // fila de SALIDA, cuyo `de` es una casilla nuestra.
  if (correo.direccion !== "entrada") {
    return NextResponse.json({ error: "Solo se consulta sobre un correo recibido" }, { status: 400 });
  }

  const email = direccionDe(correo.de);
  if (!email) {
    return NextResponse.json({ error: "El correo no tiene remitente válido" }, { status: 422 });
  }
  const buscado = email.toLowerCase();

  // QUÉ TAN PROBADA ESTÁ ESTA DIRECCIÓN. Una fila `entrada` no siempre viene de
  // un mail: el formulario público de /ayuda escribe una con la dirección que la
  // persona tipeó, sin sesión y sin comprobar que sea suya. El que sí llegó como
  // correo tiene `resend_id`. La diferencia viaja en la respuesta para que del
  // otro lado no se trate igual a una dirección tipeada que a una que escribió.
  const direccionProbada = !!correo.resend_id;

  // `ilike` acerca candidatos sin depender de la capitalización guardada, con los
  // comodines escapados para no arrastrar direcciones ajenas. Igual NO decide: la
  // igualdad real se compara abajo en minúsculas.
  const patron = sinComodines(buscado);
  const [medicos, pacientes] = await Promise.all([
    admin
      .from("medicos")
      // `celular_personal`, `domicilio_consultorio` y `foto_url` entran SOLO para
      // computar qué le falta al profesional. Nunca se devuelven: lo que sale es
      // la ETIQUETA ("Celular personal"), no el valor.
      .select(
        "id, email, titulo, nombre_completo, especialidad, tipo_matricula, numero_matricula, estado_registro, verificado, dado_de_baja, disponible, disponible_desde, disponible_hasta, precio_consulta, refeps_validado, refeps_validado_at, jurisdicciones, identidad_validada, biometria_exenta, firma_manuscrita_url, celular_personal, domicilio_consultorio, foto_url, es_cuenta_test, created_at",
      )
      .ilike("email", patron),
    admin.from("pacientes").select("email, nombre_completo, created_at").ilike("email", patron),
  ]);

  // NUNCA contestar un negativo que no se verificó. Si la base falló, `data`
  // queda en null y sin este corte la ruta diría "no está registrado" —
  // convirtiendo una falla nuestra en un hecho sobre una persona.
  if (medicos.error || pacientes.error) {
    logWarn("[bandeja-bot]", "Falló la consulta de estado", { correoId });
    return NextResponse.json({ error: "No se pudo consultar el estado" }, { status: 502 });
  }

  const medico = (medicos.data ?? []).find((m) => (m.email ?? "").toLowerCase() === buscado);

  if (medico) {
    const [claves, cuentaMp] = await Promise.all([
      // La fuente de verdad del repo para "¿tiene firma electrónica?": filtra por
      // clave ACTIVA, así que una revocada no cuenta.
      tieneClaves(medico.id),
      admin.from("medicos_mp_accounts").select("estado, expires_at").eq("medico_id", medico.id).maybeSingle(),
    ]);

    if (cuentaMp.error) {
      logWarn("[bandeja-bot]", "Falló la consulta de Mercado Pago", { correoId });
      return NextResponse.json({ error: "No se pudo consultar el estado" }, { status: 502 });
    }

    const firmaElectronica = claves;
    const firmaManuscrita = !!medico.firma_manuscrita_url?.trim();
    const mpConectado = estadoCuentaMp(cuentaMp.data) === "conectado";

    // La lista canónica de lo que le falta, con las mismas etiquetas que ve el
    // profesional en su propio perfil. Son ETIQUETAS, no valores: acá no sale
    // ningún dato personal nuevo.
    const faltantes = camposFaltantesMedico(medico, {
      mpConectado,
      firmaConfigurada: firmaElectronica,
    }).map((c) => c.label);

    logInfo("[bandeja-bot]", "Quién escribió: profesional", { correoId, direccionProbada });
    return NextResponse.json({
      registrado: true,
      rol: "profesional",
      direccion_probada: direccionProbada,
      cuenta_de_prueba: !!medico.es_cuenta_test,
      // "Dr." o "Dra.", que es como se lo saluda.
      tratamiento: medico.titulo ?? null,
      nombre: medico.nombre_completo,
      alta: medico.created_at,
      // Lo que le falta para poder atender. Vacío = no le falta nada de su lado.
      faltantes,
      registro: {
        estado: medico.estado_registro,
        // La baja es blanda y NO toca `estado_registro` ni `verificado`: sin
        // mirarla, alguien dado de baja figura como aprobado.
        aprobado: !!medico.verificado && !medico.dado_de_baja,
        dado_de_baja: !!medico.dado_de_baja,
      },
      matricula: {
        tipo: medico.tipo_matricula,
        numero: medico.numero_matricula,
        especialidad: medico.especialidad,
        // OJO con el vacío: en el producto, "sin jurisdicciones resueltas" NO
        // significa que no atiende en ninguna provincia, significa que todavía
        // no se resolvieron y se lo muestra en todas. Por eso va null y no [],
        // que se leería exactamente al revés.
        jurisdicciones: medico.jurisdicciones?.length ? medico.jurisdicciones : null,
        validada_en_refeps: !!medico.refeps_validado,
        validada_el: medico.refeps_validado_at ?? null,
      },
      // Helper compartido: además de lo obvio, exime a las cuentas de prueba,
      // igual que los demás gates de identidad.
      identidad: { validada: identidadHabilitada(medico) },
      // "conectado" es lo ÚNICO que cobra. "no_conectado" es que nunca la
      // conectó o la revocó, y ahí sí tiene que reconectarla él. "expirado" NO
      // se arregla del lado del profesional: el token se renueva solo (cron cada
      // 6 h más la auto-reparación del checkout), así que si persiste el
      // problema es nuestro y se escala.
      cobro: { mercado_pago: estadoCuentaMp(cuentaMp.data) },
      // Son DOS cosas distintas y se piden por separado: la imagen de su firma
      // la sube él, las claves electrónicas se las provisiona Docto. Fundirlas
      // en un solo "completa" hacía que se le pidiera trabajo que no es suyo.
      firma: { manuscrita: firmaManuscrita, electronica: firmaElectronica },
      // NO se llama "disponible_ahora" a propósito: el interruptor solo no
      // alcanza para que un paciente lo vea. Hacen falta además la franja
      // horaria (en hora argentina, no la del servidor) y el precio cargado.
      // Se devuelven las tres piezas por separado en vez de un sí/no que
      // prometería algo que este endpoint no puede saber del todo.
      aparecer_en_la_clinica: {
        interruptor_encendido: !!medico.disponible,
        // `estaEnHorario` solo mira estos tres campos, y compara contra la hora
        // ARGENTINA: el runtime de Vercel está en UTC, así que hacerlo a mano
        // acá evaluaría una ventana de 09 a 12 como si fuera de 12 a 15.
        en_horario: estaEnHorario({
          disponible: !!medico.disponible,
          disponible_desde: medico.disponible_desde,
          disponible_hasta: medico.disponible_hasta,
        } as Parameters<typeof estaEnHorario>[0]),
        precio_cargado: !!medico.precio_consulta && medico.precio_consulta > 0,
      },
    });
  }

  const paciente = (pacientes.data ?? []).find((p) => (p.email ?? "").toLowerCase() === buscado);
  if (paciente) {
    logInfo("[bandeja-bot]", "Quién escribió: paciente", { correoId, direccionProbada });
    return NextResponse.json({
      registrado: true,
      rol: "paciente",
      direccion_probada: direccionProbada,
      nombre: paciente.nombre_completo,
      alta: paciente.created_at,
      // A propósito no hay nada más. Las consultas, los documentos y todo lo
      // clínico de un paciente no salen por esta puerta.
      nota: "De un paciente sale solo el nombre, si está registrado y desde cuándo. Sus consultas y documentos no salen por acá: eso se escala.",
    });
  }

  logInfo("[bandeja-bot]", "Quién escribió: no está en la base", { correoId });
  return NextResponse.json({
    registrado: false,
    direccion_probada: direccionProbada,
    nota: "No lo encuentro registrado con esa dirección. Puede no tener cuenta, o haber escrito desde otra.",
  });
}

// ── RESPONDER ───────────────────────────────────────────────────────────────
// POST { correoId, cuerpo, asunto?, desde?, enviar? }
//
// `enviar` sin `BANDEJA_BOT_ENVIO=on` NO envía: devuelve el borrador.
export async function POST(req: NextRequest) {
  if (!assertNoInstitucional() || sinConfigurar()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!autorizado(req)) {
    logWarn("[bandeja-bot]", "Intento no autorizado (POST)");
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  let body: { correoId?: string; cuerpo?: string; asunto?: string; desde?: string; enviar?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { correoId, cuerpo } = body;
  if (!correoId || !cuerpo?.trim()) {
    return NextResponse.json({ error: "Faltan correoId y cuerpo" }, { status: 400 });
  }
  // El mismo tope que el formulario de ayuda. Una respuesta de soporte no llega
  // ni cerca, así que un cuerpo enorme es una falla, no un caso de uso.
  if (cuerpo.length > MAX_CUERPO) {
    return NextResponse.json({ error: `El cuerpo no puede pasar de ${MAX_CUERPO} caracteres` }, { status: 400 });
  }

  const admin = createAdminClient();

  // El destinatario NO lo elige el asistente: sale del correo original. Es lo
  // que impide que esta ruta sirva para escribirle a cualquiera.
  const { data: original, error: errOriginal } = await admin
    .from("correos")
    .select("id, de, para, asunto, direccion, resend_id")
    .eq("id", correoId)
    .maybeSingle();

  if (errOriginal) return NextResponse.json({ error: "No se pudo leer el correo" }, { status: 502 });
  if (!original) return NextResponse.json({ error: "Correo no encontrado" }, { status: 404 });
  if (original.direccion !== "entrada") {
    return NextResponse.json({ error: "Solo se responde a un correo recibido" }, { status: 400 });
  }

  const destino = direccionDe(original.de);
  if (!destino) {
    return NextResponse.json({ error: "El correo original no tiene remitente válido" }, { status: 422 });
  }

  const asunto = (body.asunto?.trim() || `Re: ${original.asunto ?? ""}`).slice(0, 200);
  const desde: DireccionPropia = body.desde === "soporte" ? "soporte" : "contacto";

  // SEGUNDO CANDADO DEL ENVÍO, y es el que tapa un agujero real. Una fila
  // `entrada` no prueba que alguien escribió: el formulario público de /ayuda
  // inserta una con la dirección que la persona tipeó, sin sesión y sin
  // comprobar que sea suya. Con eso, cualquiera plantaba una fila con la
  // dirección de un tercero y hacía que Docto le mandara un mail.
  //
  // Un correo que llegó de verdad tiene `resend_id`. Al resto se le puede
  // redactar un borrador, pero no se le manda nada solo: lo aprueba una persona.
  const direccionProbada = !!original.resend_id;

  // El interruptor. Sin él, el asistente propone y no manda nada.
  const envioHabilitado = process.env.BANDEJA_BOT_ENVIO === "on";
  if (!body.enviar || !envioHabilitado || !direccionProbada) {
    logInfo("[bandeja-bot]", "Borrador propuesto", {
      correoId,
      pidioEnviar: Boolean(body.enviar),
      envioHabilitado,
      direccionProbada,
    });
    const motivo = !body.enviar
      ? "No se pidió enviar"
      : !envioHabilitado
        ? "El envío está apagado (BANDEJA_BOT_ENVIO)"
        : "La dirección no está comprobada: este mail no llegó como correo, así que la respuesta la aprueba una persona";
    return NextResponse.json({
      enviado: false,
      motivo,
      direccion_probada: direccionProbada,
      borrador: { para: destino, asunto, cuerpo, desde },
    });
  }

  const r = await enviarDesdeBandeja({
    para: destino,
    asunto,
    cuerpo,
    desde,
    enRespuestaA: correoId,
    // No hay persona detrás. Ojo: `null` acá NO distingue al asistente — el
    // formulario de ayuda también manda null cuando el pedido es anónimo. Para
    // saber cuál salió del asistente, el registro fiable son los logs de esta
    // ruta, no la fila.
    enviadoPor: null,
    adjuntos: [],
  });

  if (!r.ok) {
    // El texto crudo del proveedor de mail suele citar la dirección de destino y
    // detalle interno suyo. Se registra, no se reenvía.
    logWarn("[bandeja-bot]", "Falló el envío", { correoId, error: r.error });
    return NextResponse.json({ enviado: false, error: "No se pudo enviar" }, { status: 502 });
  }

  // `enviarDesdeBandeja` ya marca el original como atendido al registrar la
  // salida con `enRespuestaA`. Repetirlo acá sería escribir dos veces lo mismo.
  logInfo("[bandeja-bot]", "Respuesta enviada", { correoId, desde });
  return NextResponse.json({ enviado: true, para: destino, asunto });
}
