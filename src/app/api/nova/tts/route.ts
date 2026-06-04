import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";
import { getFlag } from "@/lib/feature-flags";

export async function POST(req: NextRequest) {
  try {
    if (!(await getFlag("nova_ai"))) {
      return NextResponse.json({ error: "En este momento estoy en pausa actualizando mis habilidades. Volve en un rato.", code: "FEATURE_DISABLED" }, { status: 503 });
    }
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(
        JSON.stringify({ error: "No autorizado" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const { texto, speed } = await req.json();

    if (!texto) {
      return new Response(
        JSON.stringify({ error: "Falta el campo texto" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Velocidad de la voz (manual de Nova "más despacio"). Clamp conservador a
    // [0.5, 1.5] y default 1.0 si falta o es inválida → retrocompat con los
    // call-sites que no mandan speed.
    const velocidad =
      typeof speed === "number" && speed >= 0.5 && speed <= 1.5 ? speed : 1.0;

    const openai = new OpenAI();

    const response = await openai.audio.speech.create({
      model: "tts-1",
      voice: "nova",
      input: texto,
      response_format: "mp3",
      speed: velocidad,
    });

    const audioBuffer = Buffer.from(await response.arrayBuffer());

    return new Response(audioBuffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": audioBuffer.byteLength.toString(),
      },
    });
  } catch {
    return new Response(
      JSON.stringify({ error: "Error generando audio" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
