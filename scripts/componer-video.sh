#!/bin/bash
set -euo pipefail

# ============================================================================
# Componer Video 2: "Como es atender una consulta en Docto"
# Output: 1080x1920 (9:16 vertical), H.264 + AAC, 30fps
# ============================================================================

FFMPEG="/opt/homebrew/bin/ffmpeg"
FFPROBE="/opt/homebrew/bin/ffprobe"
BASE="/Users/diegogonzales/uber-doc/video-onboarding"
AUDIO_DIR="$BASE/audio"
SCREENSHOTS_DIR="$BASE/screenshots"
OUTPUT="$BASE/video-onboarding-atencion.mp4"
TMPDIR="$BASE/tmp-render"
FONT_BOLD="/Users/diegogonzales/uber-doc/src/fonts/Inter-Bold.ttf"
FONT_SEMI="/Users/diegogonzales/uber-doc/src/fonts/Inter-SemiBold.ttf"
FONT_REGULAR="/Users/diegogonzales/uber-doc/src/fonts/Inter-Regular.ttf"

# Colores
AZUL="0x378ADD"
NARANJA="0xD85A30"
BLANCO="0xFFFFFF"

# Timestamps (acumulados desde duraciones reales del audio)
# 00-intro:          0.000 - 4.056
# 01-disponibilidad: 4.056 - 11.136
# 02-paciente:       11.136 - 19.176
# 03-workspace:      19.176 - 28.176
# 04-modo-escritura: 28.176 - 36.144
# 05-dictado:        36.144 - 45.072
# 06-receta:         45.072 - 54.600
# 07-finalizar:      54.600 - 64.344
# 08-cierre:         64.344 - 69.144

mkdir -p "$TMPDIR"

echo "=== Paso 1: Preparar screenshots escalados ==="

# Screenshots 1179x2556 -> escalar a 1080x1920
# Ratio original: 1179/2556 = 0.4613
# Target: 1080/1920 = 0.5625
# Original es mas alto proporcionalmente, asi que escalamos ancho a 1080,
# height sera 1080*(2556/1179) = 2344, luego crop vertical centrado a 1920
scale_screenshot() {
    local input="$1"
    local output="$2"
    $FFMPEG -y -i "$input" \
        -vf "scale=1080:-1,crop=1080:1920:(iw-1080)/2:(ih-1920)/2" \
        -frames:v 1 "$output" 2>/dev/null
    echo "  Escalado: $(basename "$input") -> $(basename "$output")"
}

scale_screenshot "$SCREENSHOTS_DIR/12-dashboard-ci-off.png" "$TMPDIR/sc-ci-off.png"
scale_screenshot "$SCREENSHOTS_DIR/01-dashboard-estado-actual.png" "$TMPDIR/sc-dashboard.png"
scale_screenshot "$SCREENSHOTS_DIR/09-workspace-video.png" "$TMPDIR/sc-workspace-video.png"
scale_screenshot "$SCREENSHOTS_DIR/10-workspace-documentacion.png" "$TMPDIR/sc-workspace-doc.png"
scale_screenshot "$SCREENSHOTS_DIR/11-workspace-receta.png" "$TMPDIR/sc-workspace-receta.png"

echo "=== Paso 2: Generar video completo con filtergraph ==="

# Estrategia: un solo comando FFmpeg con complex filtergraph.
# - Inputs: screenshots como imagenes, audio completo
# - Cada screenshot se convierte en video segment con duracion exacta
# - Intro y cierre son color solidos con drawtext
# - Todos los segmentos se concatenan
# - Subtitulos y carteles via drawtext sobre el video concatenado

# Duraciones de cada segmento
D0="4.056"    # intro
D1="7.080"    # disponibilidad (split: 3s ci-off, 4.08s dashboard)
D2="8.040"    # paciente
D3="9.000"    # workspace video
D4="7.968"    # modo escritura
D5="8.928"    # dictado
D6="9.528"    # receta
D7="9.744"    # finalizar
D8="4.800"    # cierre

# Para el segmento 1 (disponibilidad), hacemos split: 3s en ci-off, resto en dashboard
D1A="3.0"
D1B="4.080"

TOTAL="69.144"

# Escapar texto para drawtext (FFmpeg requiere escapar : y ')
# Usamos text= con comillas simples dentro del filtergraph

$FFMPEG -y \
  -f lavfi -i "color=c=#378ADD:s=1080x1920:d=$D0:r=30" \
  -loop 1 -i "$TMPDIR/sc-ci-off.png" \
  -loop 1 -i "$TMPDIR/sc-dashboard.png" \
  -loop 1 -i "$TMPDIR/sc-workspace-video.png" \
  -loop 1 -i "$TMPDIR/sc-workspace-doc.png" \
  -loop 1 -i "$TMPDIR/sc-workspace-receta.png" \
  -f lavfi -i "color=c=#378ADD:s=1080x1920:d=$D8:r=30" \
  -i "$AUDIO_DIR/narracion-completa.mp3" \
  -filter_complex "
    [0:v]drawtext=fontfile=$FONT_BOLD:text='Docto':fontsize=90:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2-40,
          drawtext=fontfile=$FONT_REGULAR:text='Tu consultorio digital':fontsize=36:fontcolor=white@0.8:x=(w-text_w)/2:y=(h/2)+40,
          setpts=PTS-STARTPTS[v0];

    [1:v]scale=1080:-1,crop=1080:1920:(iw-1080)/2:(ih-1920)/2,setsar=1,trim=duration=$D1A,setpts=PTS-STARTPTS[v1a];
    [2:v]scale=1080:-1,crop=1080:1920:(iw-1080)/2:(ih-1920)/2,setsar=1,trim=duration=$D1B,setpts=PTS-STARTPTS[v1b];
    [v1a][v1b]concat=n=2:v=1:a=0[v1];

    [2:v]scale=1080:-1,crop=1080:1920:(iw-1080)/2:(ih-1920)/2,setsar=1,trim=duration=$D2,setpts=PTS-STARTPTS[v2];
    [3:v]scale=1080:-1,crop=1080:1920:(iw-1080)/2:(ih-1920)/2,setsar=1,trim=duration=$D3,setpts=PTS-STARTPTS[v3];
    [4:v]scale=1080:-1,crop=1080:1920:(iw-1080)/2:(ih-1920)/2,setsar=1,trim=duration=$D4,setpts=PTS-STARTPTS[v4];
    [4:v]scale=1080:-1,crop=1080:1920:(iw-1080)/2:(ih-1920)/2,setsar=1,trim=duration=$D5,setpts=PTS-STARTPTS[v5];
    [5:v]scale=1080:-1,crop=1080:1920:(iw-1080)/2:(ih-1920)/2,setsar=1,trim=duration=$D6,setpts=PTS-STARTPTS[v6];
    [4:v]scale=1080:-1,crop=1080:1920:(iw-1080)/2:(ih-1920)/2,setsar=1,trim=duration=$D7,setpts=PTS-STARTPTS[v7];

    [6:v]drawtext=fontfile=$FONT_BOLD:text='docto.com.ar':fontsize=72:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2-20,
          setpts=PTS-STARTPTS[v8];

    [v0][v1][v2][v3][v4][v5][v6][v7][v8]concat=n=9:v=1:a=0[vraw];

    [vraw]
    drawbox=x=0:y=ih-200:w=iw:h=200:color=black@0.65:t=fill:enable='1',

    drawtext=fontfile=$FONT_SEMI:text='Como es atender una consulta en Docto, paso a paso.':fontsize=32:fontcolor=white:x=(w-text_w)/2:y=h-130:enable='lt(t,4.056)',

    drawtext=fontfile=$FONT_SEMI:text='Activas tu disponibilidad con un toque.':fontsize=32:fontcolor=white:x=(w-text_w)/2:y=h-130:enable='between(t,4.056,11.136)',

    drawtext=fontfile=$FONT_SEMI:text='Recibis nombre, edad y motivo. Tocas Atender.':fontsize=32:fontcolor=white:x=(w-text_w)/2:y=h-130:enable='between(t,11.136,19.176)',

    drawtext=fontfile=$FONT_SEMI:text='Videollamada en vivo. Controles abajo.':fontsize=32:fontcolor=white:x=(w-text_w)/2:y=h-130:enable='between(t,19.176,28.176)',

    drawtext=fontfile=$FONT_SEMI:text='Panel de documentacion. El audio sigue activo.':fontsize=32:fontcolor=white:x=(w-text_w)/2:y=h-130:enable='between(t,28.176,36.144)',

    drawtext=fontfile=$FONT_SEMI:text='Dictas y Docto transcribe. El mic se pausa solo.':fontsize=32:fontcolor=white:x=(w-text_w)/2:y=h-130:enable='between(t,36.144,45.072)',

    drawtext=fontfile=$FONT_SEMI:text='Vademecum nacional. Formato legal automatico.':fontsize=32:fontcolor=white:x=(w-text_w)/2:y=h-130:enable='between(t,45.072,54.600)',

    drawtext=fontfile=$FONT_SEMI:text='Finalizas. Documentos se envian al paciente.':fontsize=32:fontcolor=white:x=(w-text_w)/2:y=h-130:enable='between(t,54.600,64.344)',

    drawtext=fontfile=$FONT_SEMI:text='Tu consultorio digital, en tu bolsillo.':fontsize=32:fontcolor=white:x=(w-text_w)/2:y=h-130:enable='between(t,64.344,69.144)',

    drawbox=x=(w-500)/2:y=120:w=500:h=64:color=#378ADD@0.95:t=fill:enable='between(t,4.056,11.136)',
    drawtext=fontfile=$FONT_BOLD:text='PASO 1\\: Activar disponibilidad':fontsize=28:fontcolor=white:x=(w-text_w)/2:y=138:enable='between(t,4.056,11.136)',

    drawbox=x=(w-420)/2:y=120:w=420:h=64:color=#D85A30@0.95:t=fill:enable='between(t,11.136,19.176)',
    drawtext=fontfile=$FONT_BOLD:text='Paciente esperando':fontsize=28:fontcolor=white:x=(w-text_w)/2:y=138:enable='between(t,11.136,19.176)',

    drawbox=x=(w-440)/2:y=120:w=440:h=64:color=#378ADD@0.95:t=fill:enable='between(t,19.176,28.176)',
    drawtext=fontfile=$FONT_BOLD:text='PASO 2\\: Consulta en vivo':fontsize=28:fontcolor=white:x=(w-text_w)/2:y=138:enable='between(t,19.176,28.176)',

    drawbox=x=(w-340)/2:y=120:w=340:h=64:color=#378ADD@0.95:t=fill:enable='between(t,28.176,36.144)',
    drawtext=fontfile=$FONT_BOLD:text='PASO 3\\: Documentar':fontsize=28:fontcolor=white:x=(w-text_w)/2:y=138:enable='between(t,28.176,36.144)',

    drawbox=x=(w-340)/2:y=120:w=340:h=64:color=#378ADD@0.95:t=fill:enable='between(t,36.144,45.072)',
    drawtext=fontfile=$FONT_BOLD:text='Dictado por voz':fontsize=28:fontcolor=white:x=(w-text_w)/2:y=138:enable='between(t,36.144,45.072)',

    drawbox=x=(w-500)/2:y=120:w=500:h=64:color=#378ADD@0.95:t=fill:enable='between(t,45.072,54.600)',
    drawtext=fontfile=$FONT_BOLD:text='Receta con vademecum oficial':fontsize=28:fontcolor=white:x=(w-text_w)/2:y=138:enable='between(t,45.072,54.600)',

    drawbox=x=(w-340)/2:y=120:w=340:h=64:color=#378ADD@0.95:t=fill:enable='between(t,54.600,64.344)',
    drawtext=fontfile=$FONT_BOLD:text='PASO 4\\: Finalizar':fontsize=28:fontcolor=white:x=(w-text_w)/2:y=138:enable='between(t,54.600,64.344)'

    [vfinal]
  " \
  -map "[vfinal]" -map 7:a \
  -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p \
  -c:a aac -b:a 192k \
  -r 30 \
  -t "$TOTAL" \
  -movflags +faststart \
  "$OUTPUT"

echo ""
echo "=== Video generado ==="
echo "Output: $OUTPUT"
echo ""
$FFPROBE -i "$OUTPUT" -show_entries format=duration,size -v quiet -print_format json
echo ""
ls -lh "$OUTPUT"

# Cleanup
rm -rf "$TMPDIR"
echo "=== Limpieza completada ==="
