import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import Anthropic from "@anthropic-ai/sdk";

function getHoyAR(): string {
  const ar = new Date(
    new Date().toLocaleString("en-US", {
      timeZone: "America/Argentina/Buenos_Aires",
    })
  );
  return `${ar.getFullYear()}-${(ar.getMonth() + 1).toString().padStart(2, "0")}-${ar.getDate().toString().padStart(2, "0")}`;
}

const novaTools: Anthropic.Tool[] = [
  {
    name: "ver_agenda",
    description:
      "Consulta los turnos del médico para una fecha específica. Devuelve la lista de turnos con horario, estado y datos del paciente si aplica.",
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
      },
      required: ["fecha", "hora_inicio", "hora_fin", "duracion"],
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
      "Cancela un turno específico por su ID. Requiere confirmación del médico antes de ejecutar.",
    input_schema: {
      type: "object" as const,
      properties: {
        turno_id: {
          type: "string",
          description: "UUID del turno a cancelar",
        },
      },
      required: ["turno_id"],
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
];

const TOOLS_SOLO_LECTURA = ["ver_agenda", "ver_estado_pago"];

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
      .select("id, fecha, hora_inicio, hora_fin, estado, monto, paciente_id")
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
        .select("user_id, nombre_completo")
        .in("user_id", pacienteIds);
      pacMap = new Map(
        (pacs ?? []).map((p) => [p.user_id, p.nombre_completo])
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

  return { error: "Herramienta no reconocida" };
}

export async function POST(req: NextRequest) {
  try {
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

    // Perfil Nova
    const { data: perfil } = await supabase
      .from("nova_perfiles")
      .select("*")
      .eq("medico_id", medico_id)
      .single();

    let perfilNova = perfil;
    if (!perfilNova) {
      const { data: nuevoPerfil } = await supabase
        .from("nova_perfiles")
        .insert({ medico_id, es_primera_sesion: true })
        .select()
        .single();
      perfilNova = nuevoPerfil;
    }

    // Nombre del médico
    const { data: medico } = await supabase
      .from("medicos")
      .select("nombre_completo")
      .eq("user_id", medico_id)
      .single();
    const nombreMedico = medico?.nombre_completo ?? "Doctor/a";

    const hoy = getHoyAR();

    // Agenda de hoy
    const { data: agendaHoy } = await supabase
      .from("turnos")
      .select("id, hora_inicio, hora_fin, estado, paciente_id")
      .eq("medico_id", medico_id)
      .eq("fecha", hoy)
      .order("hora_inicio", { ascending: true });

    // Slots disponibles hoy
    const { data: slotsDisponibles } = await supabase
      .from("turnos")
      .select("id, hora_inicio, hora_fin")
      .eq("medico_id", medico_id)
      .eq("fecha", hoy)
      .eq("estado", "disponible")
      .order("hora_inicio", { ascending: true });

    const agendaResumen =
      agendaHoy && agendaHoy.length > 0
        ? agendaHoy.map((t) => `${t.hora_inicio}-${t.hora_fin} (${t.estado})`).join(", ")
        : "Sin turnos hoy";

    const slotsResumen =
      slotsDisponibles && slotsDisponibles.length > 0
        ? slotsDisponibles.map((s) => `${s.hora_inicio}-${s.hora_fin}`).join(", ")
        : "Sin slots disponibles hoy";

    const systemPrompt = `Sos Nova, la asistente personal de ${nombreMedico} dentro de Docto. No sos un chatbot genérico — sos su asistente de confianza dentro de la plataforma de telemedicina.

Tuteás siempre, sin excepción. Cálida pero profesional. Nunca confianzuda ni efusiva. Sin exclamaciones exageradas. Concisa: nunca una palabra de más.

Solo hablás de Docto y de la situación real de este médico en la plataforma. Nunca compartís información de otros profesionales, pacientes de otros médicos, ni datos internos de la plataforma. Solo conocés y hablás de la realidad del médico con quien estás hablando. Lo que pasa en el consultorio, queda en el consultorio. Si la conversación se desvía, la reencaminás con gracia y sin sermonear. Para otras consultas, el médico tiene Claude.

Si alguien pregunta sobre otros médicos, métricas de la plataforma, o datos que no sean del médico autenticado, respondés: "Eso está fuera de lo que puedo contarte. ¿En qué te ayudo con tu agenda?"

Podés ejecutar acciones reales en Docto. Antes de cualquier acción que modifique datos, siempre confirmás. Nunca actuás sin confirmación explícita del médico.

Contexto actual:
- Perfil: ${JSON.stringify(perfilNova)}
- Agenda de hoy: ${agendaResumen}
- Slots disponibles: ${slotsResumen}

Si es_primera_sesion es true: "Hola ${nombreMedico}, soy Nova, tu asistente en Docto. ¿Querés que te cuente en qué puedo ayudarte?" Si dice no: "Perfecto, acá estoy cuando me necesités." Sin insistir.`;

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

          // Loop para manejar tool use iterativo
          let continuar = true;
          while (continuar) {
            const response = await anthropic.messages.create({
              model: "claude-sonnet-4-6",
              max_tokens: 1024,
              system: systemPrompt,
              tools: novaTools,
              messages,
            });

            for (const block of response.content) {
              if (block.type === "text") {
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ type: "text", content: block.text })}\n\n`
                  )
                );
              } else if (block.type === "tool_use") {
                const toolName = block.name;
                const toolInput = block.input as Record<string, unknown>;

                if (TOOLS_SOLO_LECTURA.includes(toolName)) {
                  // Ejecutar directamente
                  const resultado = await ejecutarTool(
                    toolName,
                    toolInput,
                    medico_id,
                    supabase
                  );

                  // Agregar assistant message con tool_use y tool_result
                  messages = [
                    ...messages,
                    { role: "assistant", content: response.content },
                    {
                      role: "user",
                      content: [
                        {
                          type: "tool_result",
                          tool_use_id: block.id,
                          content: JSON.stringify(resultado),
                        },
                      ],
                    },
                  ];
                  // Continuar loop para que Claude formule respuesta
                  break;
                } else {
                  // Herramientas que modifican datos: devolver confirmación
                  const accionDescripcion: Record<string, string> = {
                    crear_slots: `Crear slots el ${toolInput.fecha} de ${toolInput.hora_inicio} a ${toolInput.hora_fin} cada ${toolInput.duracion} minutos`,
                    bloquear_agenda: `Bloquear agenda el ${toolInput.fecha} de ${toolInput.hora_inicio} a ${toolInput.hora_fin}`,
                    cancelar_turno: `Cancelar turno ${toolInput.turno_id}`,
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

                  // También enviar el texto que Claude generó antes del tool use
                  const textoAntes = response.content
                    .filter((b): b is Anthropic.TextBlock => b.type === "text")
                    .map((b) => b.text)
                    .join("");
                  if (textoAntes) {
                    controller.enqueue(
                      encoder.encode(
                        `data: ${JSON.stringify({ type: "text", content: textoAntes })}\n\n`
                      )
                    );
                  }

                  continuar = false;
                  break;
                }
              }
            }

            // Si no hubo tool_use, terminamos
            if (response.stop_reason === "end_turn") {
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
