import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

const ROOT = join(__dirname, "..");
const OUTPUT_DIR = join(ROOT, "video-onboarding", "audio");

// --- Guion ---
const SEGMENTOS = [
  {
    id: "00-intro",
    texto:
      "En este video vas a ver cómo es atender una consulta en Docto, paso a paso.",
  },
  {
    id: "01-disponibilidad",
    texto:
      "Desde tu dashboard, activás tu disponibilidad con un toque. A partir de ese momento los pacientes te pueden encontrar.",
  },
  {
    id: "02-paciente",
    texto:
      "Cuando un paciente solicita consulta, recibís una notificación con su nombre, edad y motivo. Tocás Atender y entrás a la consulta.",
  },
  {
    id: "03-workspace-video",
    texto:
      "Ya estás en videollamada con tu paciente. Lo ves en pantalla completa, vos aparecés en la esquina. Abajo tenés los controles de audio y cámara.",
  },
  {
    id: "04-modo-escritura",
    texto:
      "Tocás Escribir y pasás al panel de documentación. Completás diagnóstico y evolución mientras seguís hablando: el audio no se corta.",
  },
  {
    id: "05-dictado",
    texto:
      "Si preferís, podés dictar. Tocás el micrófono, hablás, y Docto transcribe automáticamente. Tu micrófono de la llamada se silencia para no interferir.",
  },
  {
    id: "06-receta",
    texto:
      "Para la receta, buscás el medicamento en el vademécum nacional. Docto completa automáticamente la droga, presentación y vía. Todo queda en formato legal.",
  },
  {
    id: "07-finalizar",
    texto:
      "Cuando terminás, tocás Finalizar. Docto genera automáticamente la receta y los documentos. Se los envía al paciente y vos volvés al dashboard, listo para la próxima.",
  },
  {
    id: "08-cierre",
    texto:
      "Eso es todo. Tu consultorio digital, en tu bolsillo. Registrate en docto.com.ar.",
  },
];

// --- Leer API key ---
function getApiKey(): string {
  const envContent = readFileSync(join(ROOT, ".env.local"), "utf-8");
  const match = envContent
    .split("\n")
    .find((line) => line.startsWith("OPENAI_API_KEY="));
  if (!match) {
    throw new Error("OPENAI_API_KEY no encontrada en .env.local");
  }
  return match.replace("OPENAI_API_KEY=", "").trim();
}

// --- Generar audio con OpenAI TTS ---
async function generarAudio(
  apiKey: string,
  texto: string,
  outputPath: string
): Promise<void> {
  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "tts-1",
      voice: "nova",
      input: texto,
      response_format: "mp3",
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `OpenAI TTS error ${response.status}: ${errorBody}`
    );
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  writeFileSync(outputPath, buffer);
}

// --- Main ---
async function main() {
  const apiKey = getApiKey();
  const archivos: string[] = [];

  for (const seg of SEGMENTOS) {
    const outputPath = join(OUTPUT_DIR, `${seg.id}.mp3`);
    process.stdout.write(`Generando ${seg.id}...`);
    await generarAudio(apiKey, seg.texto, outputPath);
    archivos.push(outputPath);
    process.stdout.write(" OK\n");
  }

  // Concatenar con FFmpeg
  const listFile = join(OUTPUT_DIR, "concat-list.txt");
  const listContent = archivos
    .map((f) => `file '${f}'`)
    .join("\n");
  writeFileSync(listFile, listContent);

  const outputCompleta = join(OUTPUT_DIR, "narracion-completa.mp3");
  process.stdout.write("Concatenando narracion-completa.mp3...");
  execSync(
    `/opt/homebrew/bin/ffmpeg -y -f concat -safe 0 -i "${listFile}" -c copy "${outputCompleta}"`,
    { stdio: "pipe" }
  );
  process.stdout.write(" OK\n");

  // Limpiar archivo temporal
  execSync(`rm "${listFile}"`);

  // Reportar duraciones
  console.log("\n--- Duraciones ---");
  const todosLosArchivos = [...archivos, outputCompleta];
  for (const f of todosLosArchivos) {
    const nombre = f.split("/").pop();
    const duracion = execSync(
      `/opt/homebrew/bin/ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${f}"`
    )
      .toString()
      .trim();
    const segs = parseFloat(duracion);
    console.log(`  ${nombre}: ${segs.toFixed(1)}s`);
  }
}

main().catch((err) => {
  console.error("Error fatal:", err.message);
  process.exit(1);
});
