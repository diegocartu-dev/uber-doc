import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import Anthropic from "@anthropic-ai/sdk";
import { getFlag } from "@/lib/feature-flags";

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function fechaLegible(fechaISO: string): string {
  const d = new Date(fechaISO + "T12:00:00");
  return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`;
}

function getAhoraAR(): { fecha: string; horaISO: string; contexto: string } {
  // Construir fecha/hora en zona Argentina (GMT-3, sin DST)
  const ahora = new Date();
  const ar = new Date(ahora.toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));

  const diaSemana = DIAS[ar.getDay()];
  const dia = ar.getDate();
  const mes = MESES[ar.getMonth()];
  const anio = ar.getFullYear();
  const hh = ar.getHours().toString().padStart(2, "0");
  const mm = ar.getMinutes().toString().padStart(2, "0");

  const fecha = `${ar.getFullYear()}-${(ar.getMonth() + 1).toString().padStart(2, "0")}-${dia.toString().padStart(2, "0")}`;
  const horaISO = `${hh}:${mm}`;
  const contexto = `${diaSemana} ${dia} de ${mes} de ${anio}, ${hh}:${mm} hs (Argentina, GMT-3)`;

  return { fecha, horaISO, contexto };
}

const novaTools: Anthropic.Tool[] = [
  {
    name: "ver_agenda",
    description:
      "Consulta los turnos del médico para una fecha específica (cualquier fecha, no solo hoy). Devuelve la lista de turnos con horario, estado y datos del paciente si aplica. SIEMPRE usar esta herramienta antes de afirmar que un día no tiene turnos o antes de cancelar/modificar turnos.",
    input_schema: {
      type: "object" as const,
      properties: {
        fecha: {
          type: "string",
          description: "Fecha en formato YYYY-MM-DD",
        },
      },
      required: ["fecha"],
    },
  },
  {
    name: "crear_slots",
    description:
      "Crea slots de disponibilidad para que pacientes puedan reservar turnos. Requiere confirmación del médico antes de ejecutar.",
    input_schema: {
      type: "object" as const,
      properties: {
        fecha: {
          type: "string",
          description: "Fecha en formato YYYY-MM-DD",
        },
        hora_inicio: {
          type: "string",
          description: "Hora de inicio en formato HH:MM",
        },
        hora_fin: {
          type: "string",
          description: "Hora de fin en formato HH:MM",
        },
        duracion: {
          type: "number",
          description: "Duración de cada slot en minutos (20, 30 o 45)",
        },
        canal_origen: {
          type: "string",
          description: "Canal del turno: 'clinica_virtual' para la clínica virtual de Docto, 'consultorio_privado' para el consultorio presencial del médico. Inferir del mensaje del médico.",
          enum: ["clinica_virtual", "consultorio_privado"],
        },
      },
      required: ["fecha", "hora_inicio", "hora_fin", "duracion", "canal_origen"],
    },
  },
  {
    name: "bloquear_agenda",
    description:
      "Bloquea un rango horario para que no se puedan reservar turnos. Requiere confirmación del médico antes de ejecutar.",
    input_schema: {
      type: "object" as const,
      properties: {
        fecha: {
          type: "string",
          description: "Fecha en formato YYYY-MM-DD",
        },
        hora_inicio: {
          type: "string",
          description: "Hora de inicio del bloqueo en formato HH:MM",
        },
        hora_fin: {
          type: "string",
          description: "Hora de fin del bloqueo en formato HH:MM",
        },
      },
      required: ["fecha", "hora_inicio", "hora_fin"],
    },
  },
  {
    name: "cancelar_turno",
    description:
      "Cancela un turno específico por su ID. Requiere confirmación del médico antes de ejecutar. IMPORTANTE: siempre incluí paciente_nombre, fecha y hora para que la confirmación sea clara.",
    input_schema: {
      type: "object" as const,
      properties: {
        turno_id: {
          type: "string",
          description: "UUID del turno a cancelar",
        },
        motivo: {
          type: "string",
          description: "Motivo de la cancelación (opcional, si el médico lo mencionó)",
        },
        paciente_nombre: {
          type: "string",
          description: "Nombre del paciente del turno (para mostrar en la confirmación)",
        },
        fecha: {
          type: "string",
          description: "Fecha del turno YYYY-MM-DD (para mostrar en la confirmación)",
        },
        hora: {
          type: "string",
          description: "Hora del turno HH:MM (para mostrar en la confirmación)",
        },
      },
      required: ["turno_id"],
    },
  },
  {
    name: "cancelar_turnos_dia",
    description:
      "Cancela TODOS los turnos confirmados/en_espera de un día completo. Usar cuando el médico pide cancelar la agenda de un día entero. Requiere confirmación del médico. Nova debe primero usar ver_agenda para saber cuántos turnos con paciente hay, informar el resumen al médico, y luego llamar esta herramienta.",
    input_schema: {
      type: "object" as const,
      properties: {
        fecha: {
          type: "string",
          description: "Fecha del día a cancelar en formato YYYY-MM-DD",
        },
        motivo: {
          type: "string",
          description: "Motivo de la cancelación (opcional)",
        },
        resumen: {
          type: "string",
          description: "Resumen legible de los turnos que se van a cancelar, para mostrar en la confirmación. Ej: '2 turnos: Juan Perez 19:00 y Jose Velez 19:20'",
        },
      },
      required: ["fecha", "resumen"],
    },
  },
  {
    name: "ver_estado_pago",
    description:
      "Consulta el estado de pago de un turno específico.",
    input_schema: {
      type: "object" as const,
      properties: {
        turno_id: {
          type: "string",
          description: "UUID del turno",
        },
      },
      required: ["turno_id"],
    },
  },
  {
    name: "mostrar_opciones",
    description:
      "Muestra botones clickeables al médico para que elija entre opciones. Usá esta herramienta cuando necesités una respuesta entre opciones concretas: disambiguación de fechas, sí/no, elegir entre acciones, etc. SIEMPRE usá esta herramienta en vez de preguntar verbalmente.",
    input_schema: {
      type: "object" as const,
      properties: {
        opciones: {
          type: "array",
          items: { type: "string" },
          description: "Lista de opciones que el médico puede elegir. Ej: ['29 de abril', '29 de mayo'] o ['Sí, cancelar', 'No, mantener']",
        },
      },
      required: ["opciones"],
    },
  },
];

const TOOLS_SOLO_LECTURA = ["ver_agenda", "ver_estado_pago", "mostrar_opciones"];

async function ejecutarTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  medicoId: string,
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<unknown> {
  if (toolName === "ver_agenda") {
    const fecha = toolInput.fecha as string;
    const { data: turnos, error } = await supabase
      .from("turnos")
      .select("id, fecha, hora_inicio, hora_fin, estado, monto, paciente_id, canal_origen")
      .eq("medico_id", medicoId)
      .eq("fecha", fecha)
      .order("hora_inicio", { ascending: true });

    if (error) return { error: error.message };

    if (!turnos || turnos.length === 0)
      return { mensaje: `No hay turnos para ${fecha}`, turnos: [] };

    const pacienteIds = turnos
      .map((t) => t.paciente_id)
      .filter(Boolean) as string[];

    let pacMap = new Map<string, string>();
    if (pacienteIds.length > 0) {
      const { data: pacs } = await supabase
        .from("pacientes")
        .select("id, nombre_completo")
        .in("id", pacienteIds);
      pacMap = new Map(
        (pacs ?? []).map((p) => [p.id, p.nombre_completo])
      );
    }

    return {
      fecha,
      turnos: turnos.map((t) => ({
        id: t.id,
        hora_inicio: t.hora_inicio,
        hora_fin: t.hora_fin,
        estado: t.estado,
        monto: t.monto,
        paciente: t.paciente_id ? pacMap.get(t.paciente_id) ?? "Paciente" : null,
        canal_origen: t.canal_origen,
      })),
    };
  }

  if (toolName === "ver_estado_pago") {
    const turnoId = toolInput.turno_id as string;
    const { data: turno, error } = await supabase
      .from("turnos")
      .select("id, estado, monto, pago_id, reintegro_estado")
      .eq("id", turnoId)
      .eq("medico_id", medicoId)
      .single();

    if (error || !turno)
      return { error: "Turno no encontrado o no pertenece a este médico" };

    return {
      turno_id: turno.id,
      estado_turno: turno.estado,
      monto: turno.monto,
      pago_id: turno.pago_id,
      reintegro_estado: turno.reintegro_estado,
    };
  }

  if (toolName === "mostrar_opciones") {
    return { mostradas: true, opciones: toolInput.opciones };
  }

  return { error: "Herramienta no reconocida" };
}

export async function POST(req: NextRequest) {
  try {
    // Feature flag: Nova AI
    if (!(await getFlag("nova_ai"))) {
      return NextResponse.json(
        { error: "En este momento estoy en pausa actualizando mis habilidades. Volve en un rato.", code: "FEATURE_DISABLED" },
        { status: 503 }
      );
    }

    const { mensajes: historial, medico_id } = await req.json();

    if (!historial || !Array.isArray(historial) || historial.length === 0 || !medico_id) {
      return new Response(
        JSON.stringify({ error: "Faltan campos requeridos" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || user.id !== medico_id) {
      return new Response(
        JSON.stringify({ error: "No autenticado" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    // --- Contexto dinámico ---

    const { fecha: hoy, contexto: ahoraContexto } = getAhoraAR();

    // Lookup medicos.id (PK) desde auth user_id — turnos.medico_id referencia medicos.id, NO auth.users.id
    const { data: medicoRow } = await supabase
      .from("medicos")
      .select("id, nombre_completo, titulo")
      .eq("user_id", medico_id)
      .single();

    if (!medicoRow) {
      return new Response(
        JSON.stringify({ error: "Perfil médico no encontrado" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const medicoDbId = medicoRow.id;

    // Fecha límite: 45 días (horizonte máximo de turnos programados)
    const limite45d = new Date(new Date(hoy).getTime() + 45 * 86400000);
    const padD = (n: number) => n.toString().padStart(2, "0");
    const fechaLimite = `${limite45d.getFullYear()}-${padD(limite45d.getMonth() + 1)}-${padD(limite45d.getDate())}`;

    const [perfilResult, agendaResult, slotsResult, proximosResult] = await Promise.all([
      supabase.from("nova_perfiles").select("*").eq("medico_id", medico_id).single(),
      supabase.from("turnos")
        .select("id, hora_inicio, hora_fin, estado, paciente_id")
        .eq("medico_id", medicoDbId).eq("fecha", hoy)
        .order("hora_inicio", { ascending: true }),
      supabase.from("turnos")
        .select("id, hora_inicio, hora_fin")
        .eq("medico_id", medicoDbId).eq("fecha", hoy).eq("estado", "disponible")
        .order("hora_inicio", { ascending: true }),
      supabase.from("turnos")
        .select("fecha, estado")
        .eq("medico_id", medicoDbId)
        .gt("fecha", hoy).lte("fecha", fechaLimite)
        .in("estado", ["disponible", "confirmado", "en_espera", "reservado_pendiente"])
        .order("fecha", { ascending: true }),
    ]);

    let perfilNova = perfilResult.data;
    if (!perfilNova) {
      const { data: nuevoPerfil } = await supabase
        .from("nova_perfiles")
        .insert({ medico_id, es_primera_sesion: true })
        .select()
        .single();
      perfilNova = nuevoPerfil;
    }

    const agendaHoy = agendaResult.data;
    const slotsDisponibles = slotsResult.data;
    const proximosTurnos = proximosResult.data;

    const tituloDr = medicoRow.titulo ?? "Dr.";
    const nombreMedico = medicoRow.nombre_completo ?? "Doctor/a";
    const apellidoMedico = nombreMedico.trim().split(/\s+/).slice(-1)[0];

    const agendaResumen =
      agendaHoy && agendaHoy.length > 0
        ? agendaHoy.map((t) => `${t.hora_inicio}-${t.hora_fin} (${t.estado})`).join(", ")
        : "Sin turnos hoy";

    const slotsResumen =
      slotsDisponibles && slotsDisponibles.length > 0
        ? slotsDisponibles.map((s) => `${s.hora_inicio}-${s.hora_fin}`).join(", ")
        : "Sin slots disponibles hoy";

    // Resumen compacto próximos 45 días: agrupar por fecha con conteo por estado
    let proximosResumen = "Sin turnos futuros";
    if (proximosTurnos && proximosTurnos.length > 0) {
      const porFecha = new Map<string, { disponibles: number; confirmados: number }>();
      for (const t of proximosTurnos) {
        const entry = porFecha.get(t.fecha) ?? { disponibles: 0, confirmados: 0 };
        if (t.estado === "disponible") entry.disponibles++;
        else entry.confirmados++;
        porFecha.set(t.fecha, entry);
      }
      proximosResumen = Array.from(porFecha.entries())
        .map(([f, c]) => {
          const parts: string[] = [];
          if (c.confirmados > 0) parts.push(`${c.confirmados} confirmado${c.confirmados > 1 ? "s" : ""}`);
          if (c.disponibles > 0) parts.push(`${c.disponibles} disponible${c.disponibles > 1 ? "s" : ""}`);
          return `${f}: ${parts.join(", ")}`;
        })
        .join(" | ");
    }

    const systemPrompt = `Sos Nova, la asistente personal del ${tituloDr} ${nombreMedico} dentro de Docto. No sos un chatbot genérico — sos su asistente de confianza dentro de la plataforma de telemedicina.

IDENTIDAD Y TONO
Usás usted siempre, sin excepción. Cálida pero profesional. Nunca confianzuda ni efusiva. Sin exclamaciones exageradas. Concisa: nunca una palabra de más. Español rioplatense natural — decís "turnos", nunca "slots". Nunca usés markdown, asteriscos, negritas, bullets, guiones ni formato especial. Texto plano conversacional siempre. Tu respuesta se muestra en un chat de celular, no en un documento.
Cuando te dirigís al médico, usás su título y apellido. Ejemplo: "Dr. González" o "Dra. Martínez". Nunca solo el nombre de pila.

ALCANCE
Solo hablás de Docto y de la situación real de este médico. Nunca compartís información de otros profesionales ni datos internos de la plataforma. Si alguien pregunta sobre otros médicos, métricas globales o datos que no sean del médico autenticado, respondés: "Eso está fuera de lo que puedo contarle. ¿En qué le ayudo con su agenda?"
Si la conversación se desvía hacia temas que no son de Docto, la reencaminás con gracia y sin sermonear. Ejemplo: si pregunta por el clima, el fútbol, o cualquier cosa ajena, respondés algo como: "Esos temas los manejo menos que los turnos. ¿En qué le puedo ayudar hoy?"

JUSTIFICACIÓN SIEMPRE
Cada vez que no podés hacer algo, o que tomás una decisión, explicás el motivo. Nunca decís solo "no puedo" o "no se puede". Siempre explicás por qué, de forma breve y clara.
Ejemplos:
- "No puedo modificar el precio porque eso se gestiona desde la configuración de su perfil."
- "No creo esos turnos porque tiene otra agenda con pacientes asignados en ese horario — tiene que revisarla manualmente."
- "Necesito saber cuánto dura cada consulta para poder calcular cuántos turnos entran en ese rango."

ACCIONES QUE PODÉS EJECUTAR
1. Crear turnos programados — ejecutás directo, después confirmás lo que hiciste y por qué lo hiciste así.
2. Ver agenda del día o la semana — ejecutás directo.
3. Activar disponibilidad inmediata ("estoy disponible ahora") — ejecutás directo.
4. Cancelar turnos — Dos herramientas disponibles:
   - cancelar_turno: para cancelar UN turno específico.
   - cancelar_turnos_dia: para cancelar TODOS los turnos con paciente de un día entero. Usá esta cuando el médico pide cancelar "la agenda del día X" o "todos los turnos del martes". Primero usá ver_agenda para saber cuántos turnos con paciente hay, después informá el resumen ("Hay 3 turnos confirmados: Juan 10:00, María 10:30, Pedro 11:00. Voy a cancelarlos y cada paciente va a recibir la notificación para reprogramar.") y llamá cancelar_turnos_dia. La interfaz muestra confirmación al médico. No preguntés verbalmente.
5. Desactivar disponibilidad inmediata — Describís lo que vas a hacer ("Voy a desactivar su disponibilidad — los pacientes no van a poder encontrarle hasta que la reactive"). La interfaz maneja la confirmación.

LO QUE SOLO INFORMÁS, NUNCA MODIFICÁS
El valor de la consulta del médico: podés decirle cuánto cobra, pero si pide cambiarlo le explicás que eso se hace desde la configuración de su perfil, no a través tuyo.

REGLA DE CONFIRMACIÓN — UNA SOLA VEZ
Creación y consultas: ejecutás directo, después avisás qué hiciste.
Cancelaciones, modificaciones y desactivar disponibilidad: describís lo que vas a hacer e INMEDIATAMENTE llamás la herramienta. La interfaz muestra botones Confirmar/Cancelar automáticamente. NUNCA pidas confirmación verbal ("¿avanzamos?", "¿confirma?", "¿está seguro?", "¿cancelamos?") — eso lo manejan los botones de la UI. Si describiste la acción, llamá la herramienta en el mismo turno. El médico confirma con UN SOLO toque en el botón.
Ejemplo correcto: "Hay un turno de José Vélez el 29/04 a las 19:20. Voy a cancelarlo y él va a recibir una notificación para reprogramar." → [llamás cancelar_turnos_dia] → UI muestra [Confirmar] [Cancelar]
Ejemplo INCORRECTO: "¿Avanzamos con la cancelación?" (sin llamar la herramienta) → médico escribe "sí" → recién ahí llamás la herramienta. Esto NUNCA debe pasar.

CREAR TURNOS — DATO OBLIGATORIO
Cuando el médico pide crear turnos y no menciona la duración de cada consulta, siempre preguntás antes de crear: "¿Cuánto dura cada turno?" Explicás brevemente por qué lo necesitás. Si ya tenés ese dato en el perfil, lo usás sin preguntar.

BOTONES SIEMPRE — HERRAMIENTA mostrar_opciones
Cuando necesités que el médico elija entre opciones concretas (fecha ambigua, sí/no, qué acción tomar), SIEMPRE usá la herramienta mostrar_opciones. NUNCA hagas una pregunta de opciones solo con texto — el médico debe poder tocar un botón para responder.
Ejemplos de cuándo usar mostrar_opciones:
- "¿Se refiere al 29 de abril o al 29 de mayo?" → mostrar_opciones(["29 de abril", "29 de mayo"])
- "¿Quiere crear turnos para Clínica Virtual o Consultorio Particular?" → mostrar_opciones(["Clínica Virtual", "Consultorio Particular"])
- "¿Quiere que le cuente sobre su agenda o crear turnos nuevos?" → mostrar_opciones(["Ver mi agenda", "Crear turnos"])
El médico siempre puede escribir en vez de tocar el botón, pero el botón debe estar ahí.

AMBIGÜEDAD INMEDIATA VS PROGRAMADO
Si el médico pide algo que puede interpretarse como disponibilidad inmediata o como turno programado, siempre preguntás antes de actuar usando mostrar_opciones. Una sola pregunta, clara y directa. Nunca asumís.
Ejemplos de pedidos ambiguos: "quiero atender hoy a las 6", "poneme para ahora", "abrí un turno para dentro de una hora".

CONFLICTOS DE AGENDA
Si los horarios nuevos se pisan con una agenda que ya tiene pacientes asignados: no creás nada. Avisás que hay otra agenda con pacientes en ese horario y que tiene que revisarla manualmente. Explicás siempre el motivo.
Si los horarios nuevos no se pisan con nada ocupado: creás la agenda sin problema, aunque sea el mismo día.

"CANCELÁ TODO" O PEDIDOS DE CIERRE TOTAL
Si el médico pide cerrar todo, parar, desconectarse o cancelar todo: interpretás que quiere tanto bloquear los turnos programados disponibles como desactivar la disponibilidad inmediata. Describís lo que vas a hacer ("Voy a bloquear sus turnos disponibles y desactivar la disponibilidad inmediata"). La interfaz pide confirmación. Una vez confirmado, ejecutás ambas acciones y le recordás que cuando quiera volver a atender tiene que reactivar su disponibilidad manualmente.

INTERPRETACIÓN FLEXIBLE
El médico puede pedir lo mismo de muchas formas. Todas estas expresiones llevan a la misma acción:
"habilitá / abrí / poneme / quiero / necesito / creá turnos" → crear turnos programados
"estoy disponible / me conecto / atiendo ahora / arranco / abrí para ya" → activar disponibilidad inmediata
"me desconecto / cerrá / no atiendo más / pará todo / apagá" → desactivar disponibilidad (con confirmación)
"qué tengo / mostrá mi agenda / cómo estoy / qué turnos hay / qué me queda" → ver agenda
"cancelá / borrá / sacá ese turno / eliminá" → cancelar (con confirmación)
Si el pedido no encaja en ninguna categoría, preguntás con una sola pregunta amable qué necesita exactamente.

CUANDO NO ENTENDÉS O NO PODÉS AYUDAR
Si el médico pregunta algo que no entendés o que está fuera de tu alcance, respondés de forma amena que ese tema no es tuyo, y siempre ofrecés en qué sí podés ayudarlo. Nunca dejás al médico sin una salida.
Ejemplo: "Ese tema no es lo mío. Lo que sí puedo hacer es ayudarle con su agenda, sus turnos o su disponibilidad. ¿Necesita algo de eso?"

CUANDO PREGUNTAN QUÉ PODÉS HACER
Respondés en una o dos oraciones cortas, con tu voz natural, cubriendo las cinco cosas que podés hacer. Nunca en formato lista.
Ejemplo: "Puedo ayudarle con todo lo de su agenda — crear turnos programados, ver qué tiene para hoy o la semana, activar o cerrar su disponibilidad para atención inmediata, y contarle cuánto vale su consulta. ¿Por dónde arrancamos?"

PRIMERA SESIÓN
Si es_primera_sesion es true: "Hola ${tituloDr} ${apellidoMedico}, soy Nova, su asistente personal en Docto. No soy un menú de opciones ni un bot — estoy acá para entenderle y ayudarle de verdad con su agenda. ¿Le cuento cómo?"
Si dice sí: respondés con tu personalidad, en una o dos oraciones, cubriendo las cinco cosas que podés hacer. Cálida, natural, sin sonar a manual.
Si dice no: "Perfecto, aquí estoy cuando me necesite." Sin insistir.

CANALES DE ATENCIÓN
Los turnos tienen un campo canal_origen que puede ser 'clinica_virtual' o 'consultorio_privado'. Cuando respondás sobre agenda, diferenciá los canales cuando corresponda: los turnos de 'consultorio_privado' son del consultorio particular del médico, los de 'clinica_virtual' son de la Clínica Virtual de Docto. Ejemplos: "Tenés 3 turnos en tu Consultorio Particular esta semana y 5 en la Clínica Virtual." o "Estás oculto de la Clínica Virtual, solo tus pacientes particulares pueden verte."

REGLA CRÍTICA: VERIFICAR ANTES DE ASUMIR
Antes de decir que un día no tiene turnos, SIEMPRE usá la herramienta ver_agenda para verificar. El resumen de contexto es orientativo — la herramienta es la fuente de verdad. Si el médico menciona una fecha futura (ej: "el 29", "el martes"), usá ver_agenda con esa fecha antes de responder.
Si el médico dice solo "el 29" y hay turnos tanto el 29 de este mes como el del próximo, usá mostrar_opciones(["29 de abril", "29 de mayo"]) para que elija.

CONTEXTO ACTUAL
Fecha y hora: ${ahoraContexto}
Perfil: ${JSON.stringify(perfilNova)}
Agenda de hoy: ${agendaResumen}
Turnos disponibles hoy: ${slotsResumen}
Próximos 45 días (resumen): ${proximosResumen}`;

    // --- Claude API con streaming ---

    const anthropic = new Anthropic();

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Convertir historial del frontend a formato Claude API
          let messages: Anthropic.MessageParam[] = historial.map(
            (m: { role: string; content: string }) => ({
              role: m.role === "nova" ? "assistant" as const : "user" as const,
              content: m.content,
            })
          );

          // Loop para manejar tool use iterativo con streaming real
          let continuar = true;
          while (continuar) {
            // stream() emite tokens de texto en cuanto llegan (~300ms TTFT vs ~2-4s sin streaming)
            const msgStream = anthropic.messages.stream({
              model: "claude-sonnet-4-6",
              max_tokens: 1024,
              system: systemPrompt,
              tools: novaTools,
              messages,
            });

            // Emitir cada delta de texto inmediatamente al cliente
            msgStream.on("text", (textDelta) => {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: "text", content: textDelta })}\n\n`
                )
              );
            });

            // Esperar la respuesta completa para manejar tool_use
            const response = await msgStream.finalMessage();

            if (response.stop_reason === "tool_use") {
              const toolBlock = response.content.find((b) => b.type === "tool_use");
              if (!toolBlock || toolBlock.type !== "tool_use") {
                continuar = false;
              } else {
                const toolName = toolBlock.name;
                const toolInput = toolBlock.input as Record<string, unknown>;

                if (TOOLS_SOLO_LECTURA.includes(toolName)) {
                  const resultado = await ejecutarTool(toolName, toolInput, medicoDbId, supabase);

                  if (toolName === "mostrar_opciones") {
                    controller.enqueue(
                      encoder.encode(
                        `data: ${JSON.stringify({ type: "opciones", opciones: toolInput.opciones })}\n\n`
                      )
                    );
                    continuar = false;
                  } else {
                    messages = [
                      ...messages,
                      { role: "assistant", content: response.content },
                      {
                        role: "user",
                        content: [
                          {
                            type: "tool_result",
                            tool_use_id: toolBlock.id,
                            content: JSON.stringify(resultado),
                          },
                        ],
                      },
                    ];
                  }
                  // continuar = true para tools de lectura normales, false para mostrar_opciones
                } else {
                  // Herramienta destructiva: el texto ya se emitió vía streaming.
                  // Solo emitir evento de confirmación para la UI.
                  const accionDescripcion: Record<string, string> = {
                    crear_slots: `Crear turnos el ${fechaLegible(toolInput.fecha as string)} de ${toolInput.hora_inicio} a ${toolInput.hora_fin} cada ${toolInput.duracion} minutos (${toolInput.canal_origen === "clinica_virtual" ? "Clínica Virtual" : "Consultorio Particular"})`,
                    bloquear_agenda: `Bloquear agenda el ${toolInput.fecha} de ${toolInput.hora_inicio} a ${toolInput.hora_fin}`,
                    cancelar_turno: toolInput.paciente_nombre
                      ? `Cancelar turno de ${toolInput.paciente_nombre} el ${toolInput.fecha ? fechaLegible(toolInput.fecha as string) : "?"} a las ${toolInput.hora ?? "?"}`
                      : `Cancelar turno ${toolInput.turno_id}`,
                    cancelar_turnos_dia: `Cancelar turnos del ${toolInput.fecha ? fechaLegible(toolInput.fecha as string) : "?"}: ${toolInput.resumen ?? ""}`,
                  };
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({
                        type: "confirmacion",
                        requiere_confirmacion: true,
                        accion: toolName,
                        descripcion: accionDescripcion[toolName] ?? toolName,
                        datos: toolInput,
                      })}\n\n`
                    )
                  );
                  continuar = false;
                }
              }
            } else {
              // end_turn — respuesta completa sin tool_use
              continuar = false;
            }
          }

          // Marcar primera sesión como completada
          if (perfilNova?.es_primera_sesion) {
            await supabase
              .from("nova_perfiles")
              .update({ es_primera_sesion: false })
              .eq("medico_id", medico_id);
          }

          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`)
          );
          controller.close();
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : "Error interno";
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "error", content: errorMsg })}\n\n`
            )
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch {
    return new Response(
      JSON.stringify({ error: "Error interno del servidor" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
