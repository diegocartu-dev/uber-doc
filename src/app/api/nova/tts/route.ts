import { NextRequest } from "next/server";
import OpenAI from "openai";

export async function POST(req: NextRequest) {
  try {
    const { texto } = await req.json();

    if (!texto) {
      return new Response(
        JSON.stringify({ error: "Falta el campo texto" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const openai = new OpenAI();

    const response = await openai.audio.speech.create({
      model: "tts-1",
      voice: "nova",
      input: texto,
      response_format: "mp3",
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
