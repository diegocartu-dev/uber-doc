import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import Anthropic from "@anthropic-ai/sdk";

const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const NOVA_EVOLUCION_ENABLED = process.env.NOVA_EVOLUCION_ENABLED === "true";

const SYSTEM_PROMPT = `Sos un asistente médico especializado en documentación clínica argentina. Tu tarea es generar el campo Evolución de una Historia Clínica a partir de la transcripción de una videoconsulta médica.

Reglas estrictas:
- Escribí en tercera persona médica formal: 'Paciente refiere...', 'Al interrogatorio...', 'Se indica...'
- Máximo 4 líneas de texto. Breve y preciso.
- Incluí solo hechos clínicos relevantes: síntomas, tiempo de evolución, hallazgos, plan terapéutico mencionado.
- Ignorá saludos, charla administrativa, problemas técnicos de la llamada y cualquier contenido no clínico.
- No inventes información que no esté explícitamente en la transcripción.
- Si la transcripción contiene información clínica suficiente para generar una Evolución precisa → generá el texto.
- Si la transcripción:
  - Tiene menos de 100 palabras clínicas útiles
  - Contiene mayormente saludos o charla no clínica
  - El audio fue de mala calidad y hay muchas palabras ininteligibles [inaudible]
  - No podés identificar con certeza síntomas, diagnóstico o plan terapéutico
  → Retorná exactamente el string vacío: ''
  → NUNCA completes con información que no esté explícitamente en la transcripción
  → NUNCA supongas diagnósticos o medicamentos
  → Es mejor dejar vacío que equivocarse
- No uses bullets ni markdown. Solo texto corrido.
- Tono profesional médico argentino.`;

export async function POST(request: NextRequest) {
  if (!NOVA_EVOLUCION_ENABLED) {
    return NextResponse.json({ error: "Feature no disponible" }, { status: 404 });
  }

  if (!GROQ_API_KEY) {
    return NextResponse.json({ error: "Groq no configurado" }, { status: 500 });
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { data: medico } = await supabase
      .from("medicos")
      .select("id, nova_evolucion_activa")
      .eq("user_id", user.id)
      .single();

    if (!medico || !medico.nova_evolucion_activa) {
      return NextResponse.json({ error: "Nova Evolución no activada" }, { status: 403 });
    }

    const formData = await request.formData();
    const audioFile = formData.get("audio") as File | null;
    const consultaId = formData.get("consulta_id") as string | null;

    if (!audioFile || !consultaId) {
      return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
    }

    if (audioFile.size > 25 * 1024 * 1024) {
      return NextResponse.json({ error: "Audio excede 25 MB" }, { status: 400 });
    }

    // Verify consulta belongs to this medico
    const { data: consulta } = await supabase
      .from("consultas")
      .select("medico_id")
      .eq("id", consultaId)
      .single();

    if (!consulta || consulta.medico_id !== medico.id) {
      return NextResponse.json({ error: "Consulta no encontrada" }, { status: 404 });
    }

    // Step 1: Transcribe with Groq Whisper
    const groqForm = new FormData();
    groqForm.append("file", audioFile, "audio.webm");
    groqForm.append("model", "whisper-large-v3-turbo");
    groqForm.append("language", "es");

    const groqRes = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
      body: groqForm,
    });

    if (!groqRes.ok) {
      console.error("Groq Whisper error:", groqRes.status, await groqRes.text());
      return NextResponse.json({ evolucion: "" });
    }

    const groqData = await groqRes.json();
    const transcripcion = groqData.text?.trim() || "";

    if (!transcripcion || transcripcion.length < 20) {
      return NextResponse.json({ evolucion: "" });
    }

    // Step 2: Generate evolution with Claude
    const anthropic = new Anthropic();
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Transcripción de la consulta:\n${transcripcion}\n\nGenerá el campo Evolución.`,
        },
      ],
    });

    const evolucion =
      msg.content[0]?.type === "text" ? msg.content[0].text.trim() : "";

    return NextResponse.json({ evolucion });
  } catch (err) {
    console.error("Error en generar-evolucion:", err);
    return NextResponse.json({ evolucion: "" });
  }
}
