/**
 * Componer Video 2: "Como es atender una consulta en Docto"
 *
 * Genera frames compuestos con sharp (screenshots + texto) y luego
 * usa FFmpeg para ensamblar el video con audio.
 *
 * Output: 1080x1920 (9:16 vertical), H.264 + AAC, 30fps
 */

import sharp from 'sharp';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const FFMPEG = '/opt/homebrew/bin/ffmpeg';
const FFPROBE = '/opt/homebrew/bin/ffprobe';
const BASE = '/Users/diegogonzales/uber-doc/video-onboarding';
const AUDIO_DIR = `${BASE}/audio`;
const SCREENSHOTS_DIR = `${BASE}/screenshots`;
const OUTPUT = `${BASE}/video-onboarding-atencion.mp4`;
const TMPDIR = `${BASE}/tmp-render`;
const FONT_BOLD = '/Users/diegogonzales/uber-doc/src/fonts/Inter-Bold.ttf';

const W = 1080;
const H = 1920;

// Colores
const AZUL = '#378ADD';
const NARANJA = '#D85A30';

// Segmentos con duraciones reales del audio
const segments = [
  {
    id: 'intro',
    duration: 4.056,
    type: 'solid' as const,
    bgColor: AZUL,
    centerText: ['Docto', 'Tu consultorio digital'],
    badge: null,
    subtitle: 'Como es atender una consulta en Docto, paso a paso.',
  },
  {
    id: 'disponibilidad-off',
    duration: 3.0,
    type: 'screenshot' as const,
    screenshot: '12-dashboard-ci-off.png',
    badge: { text: 'PASO 1: Activar disponibilidad', color: AZUL },
    subtitle: 'Activas tu disponibilidad con un toque.',
  },
  {
    id: 'disponibilidad-on',
    duration: 4.080,
    type: 'screenshot' as const,
    screenshot: '01-dashboard-estado-actual.png',
    badge: { text: 'PASO 1: Activar disponibilidad', color: AZUL },
    subtitle: 'Activas tu disponibilidad con un toque.',
  },
  {
    id: 'paciente',
    duration: 8.040,
    type: 'screenshot' as const,
    screenshot: '01-dashboard-estado-actual.png',
    badge: { text: 'Paciente esperando', color: NARANJA },
    subtitle: 'Recibis nombre, edad y motivo. Tocas Atender.',
  },
  {
    id: 'workspace-video',
    duration: 9.0,
    type: 'screenshot' as const,
    screenshot: '09-workspace-video.png',
    badge: { text: 'PASO 2: Consulta en vivo', color: AZUL },
    subtitle: 'Videollamada en vivo. Controles abajo.',
  },
  {
    id: 'modo-escritura',
    duration: 7.968,
    type: 'screenshot' as const,
    screenshot: '10-workspace-documentacion.png',
    badge: { text: 'PASO 3: Documentar', color: AZUL },
    subtitle: 'Panel de documentacion. El audio sigue activo.',
  },
  {
    id: 'dictado',
    duration: 8.928,
    type: 'screenshot' as const,
    screenshot: '10-workspace-documentacion.png',
    badge: { text: 'Dictado por voz', color: AZUL },
    subtitle: 'Dictas y Docto transcribe. El mic se pausa solo.',
  },
  {
    id: 'receta',
    duration: 9.528,
    type: 'screenshot' as const,
    screenshot: '11-workspace-receta.png',
    badge: { text: 'Receta con vademecum oficial', color: AZUL },
    subtitle: 'Vademecum nacional. Formato legal automatico.',
  },
  {
    id: 'finalizar',
    duration: 9.744,
    type: 'screenshot' as const,
    screenshot: '10-workspace-documentacion.png',
    badge: { text: 'PASO 4: Finalizar', color: AZUL },
    subtitle: 'Finalizas. Documentos se envian al paciente.',
  },
  {
    id: 'cierre',
    duration: 4.800,
    type: 'solid' as const,
    bgColor: AZUL,
    centerText: ['docto.com.ar'],
    badge: null,
    subtitle: 'Tu consultorio digital, en tu bolsillo.',
  },
];

function createSubtitleSVG(text: string, width: number): Buffer {
  // Banda negra semitransparente de 180px con texto centrado
  const svgText = `<svg width="${width}" height="180">
    <rect x="0" y="0" width="${width}" height="180" fill="rgba(0,0,0,0.7)" />
    <text x="${width / 2}" y="100" text-anchor="middle"
          font-family="Inter, Helvetica, Arial, sans-serif" font-weight="600"
          font-size="34" fill="white">${escapeXml(text)}</text>
  </svg>`;
  return Buffer.from(svgText);
}

function createBadgeSVG(text: string, color: string, width: number): Buffer {
  const textLen = text.length;
  const badgeW = Math.min(Math.max(textLen * 18 + 60, 280), width - 40);
  const badgeH = 58;
  const x = (width - badgeW) / 2;
  const y = 130;
  const r = 14;

  const svgText = `<svg width="${width}" height="220">
    <rect x="${x}" y="${y}" width="${badgeW}" height="${badgeH}" rx="${r}" ry="${r}"
          fill="${color}" fill-opacity="0.95" />
    <text x="${width / 2}" y="${y + 38}" text-anchor="middle"
          font-family="Inter, Helvetica, Arial, sans-serif" font-weight="700"
          font-size="28" fill="white">${escapeXml(text)}</text>
  </svg>`;
  return Buffer.from(svgText);
}

function createCenterTextSVG(lines: string[], width: number, height: number): Buffer {
  const linesSvg = lines.map((line, i) => {
    const isTitle = i === 0;
    const fontSize = isTitle ? (line.length > 15 ? 64 : 90) : 36;
    const weight = isTitle ? '700' : '400';
    const opacity = isTitle ? '1' : '0.8';
    const yOffset = isTitle ? height / 2 - 20 : height / 2 + 50;
    return `<text x="${width / 2}" y="${yOffset}" text-anchor="middle"
            font-family="Inter, Helvetica, Arial, sans-serif" font-weight="${weight}"
            font-size="${fontSize}" fill="white" fill-opacity="${opacity}">${escapeXml(line)}</text>`;
  }).join('\n');

  const svgText = `<svg width="${width}" height="${height}">
    ${linesSvg}
  </svg>`;
  return Buffer.from(svgText);
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

async function scaleScreenshot(inputPath: string): Promise<Buffer> {
  // Escalar a 1080 de ancho, luego crop vertical centrado a 1920
  const img = sharp(inputPath);
  const meta = await img.metadata();
  const srcW = meta.width!;
  const srcH = meta.height!;

  // Escalar ancho a 1080
  const scaledH = Math.round((1080 / srcW) * srcH);

  let processed = img.resize(1080, scaledH, { fit: 'fill' });

  if (scaledH > H) {
    // Crop centrado verticalmente
    const top = Math.round((scaledH - H) / 2);
    processed = sharp(await processed.toBuffer()).extract({
      left: 0, top, width: W, height: H
    });
  } else if (scaledH < H) {
    // Extender con negro
    processed = sharp(await processed.toBuffer()).extend({
      top: Math.round((H - scaledH) / 2),
      bottom: H - scaledH - Math.round((H - scaledH) / 2),
      background: { r: 0, g: 0, b: 0, alpha: 1 }
    });
  }

  return processed.png().toBuffer();
}

async function generateFrame(seg: typeof segments[0], outputPath: string) {
  let base: sharp.Sharp;

  if (seg.type === 'solid') {
    // Fondo solido
    base = sharp({
      create: {
        width: W, height: H, channels: 4,
        background: seg.bgColor!
      }
    });

    // Agregar texto central
    if (seg.centerText) {
      const textOverlay = createCenterTextSVG(seg.centerText, W, H);
      base = sharp(await base.png().toBuffer()).composite([
        { input: textOverlay, top: 0, left: 0 }
      ]);
    }
  } else {
    // Screenshot
    const screenshotPath = path.join(SCREENSHOTS_DIR, seg.screenshot!);
    const scaledBuf = await scaleScreenshot(screenshotPath);
    base = sharp(scaledBuf);
  }

  const composites: sharp.OverlayOptions[] = [];

  // Badge superior
  if (seg.badge) {
    const badgeSvg = createBadgeSVG(seg.badge.text, seg.badge.color, W);
    composites.push({ input: badgeSvg, top: 0, left: 0 });
  }

  // Subtitulo inferior
  if (seg.subtitle) {
    const subSvg = createSubtitleSVG(seg.subtitle, W);
    composites.push({ input: subSvg, top: H - 180, left: 0 });
  }

  if (composites.length > 0) {
    base = sharp(await base.png().toBuffer()).composite(composites);
  }

  await base.png().toFile(outputPath);
}

async function main() {
  // Crear directorio temporal
  if (fs.existsSync(TMPDIR)) {
    fs.rmSync(TMPDIR, { recursive: true });
  }
  fs.mkdirSync(TMPDIR, { recursive: true });

  console.log('=== Paso 1: Generar frames compuestos ===');

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const outputPath = path.join(TMPDIR, `frame-${String(i).padStart(2, '0')}-${seg.id}.png`);
    await generateFrame(seg, outputPath);
    console.log(`  Frame ${i}: ${seg.id} (${seg.duration}s)`);
  }

  console.log('\n=== Paso 2: Ensamblar video con FFmpeg ===');

  // Construir comando FFmpeg: cada frame como input con -loop 1 y duracion
  const inputs: string[] = [];
  const filterParts: string[] = [];
  const concatInputs: string[] = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const framePath = path.join(TMPDIR, `frame-${String(i).padStart(2, '0')}-${seg.id}.png`);
    inputs.push(`-loop 1 -t ${seg.duration} -i "${framePath}"`);
    filterParts.push(`[${i}:v]scale=${W}:${H},setsar=1,fps=30[v${i}]`);
    concatInputs.push(`[v${i}]`);
  }

  const audioIdx = segments.length;
  inputs.push(`-i "${AUDIO_DIR}/narracion-completa.mp3"`);

  const filterComplex = [
    ...filterParts,
    `${concatInputs.join('')}concat=n=${segments.length}:v=1:a=0[vout]`
  ].join('; ');

  const cmd = [
    FFMPEG, '-y',
    inputs.join(' '),
    `-filter_complex "${filterComplex}"`,
    `-map "[vout]" -map ${audioIdx}:a`,
    '-c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p',
    '-c:a aac -b:a 192k',
    '-r 30',
    '-t 69.144',
    '-movflags +faststart',
    `"${OUTPUT}"`
  ].join(' ');

  console.log('Ejecutando FFmpeg...');
  try {
    execSync(cmd, { stdio: 'inherit', shell: '/bin/bash' });
  } catch (e) {
    console.error('FFmpeg fallo. Comando:');
    console.error(cmd);
    process.exit(1);
  }

  console.log('\n=== Video generado ===');
  console.log(`Output: ${OUTPUT}`);

  // Verificar con ffprobe
  const probeOutput = execSync(
    `${FFPROBE} -i "${OUTPUT}" -show_entries format=duration,size -v quiet -print_format json`,
    { encoding: 'utf8' }
  );
  console.log(probeOutput);

  const lsOutput = execSync(`ls -lh "${OUTPUT}"`, { encoding: 'utf8' });
  console.log(lsOutput);

  // Cleanup
  fs.rmSync(TMPDIR, { recursive: true });
  console.log('=== Limpieza completada ===');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
