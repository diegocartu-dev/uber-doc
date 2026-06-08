// Generador de sonidos con Web Audio API — sin archivos externos

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  }
  return audioCtx;
}

/**
 * Desbloquea el audio dentro de un gesto del usuario.
 * iOS Safari no alcanza con ctx.resume(): exige reproducir efectivamente un nodo
 * dentro del handler del gesto. Por eso disparamos un tono inaudible (volumen 0).
 * Llamar desde un click/pointerdown real (toggle "Disponible", primer tap, etc.).
 */
export function unlockAudio() {
  const ctx = getCtx();
  if (!ctx) return;

  if (ctx.state === "suspended") ctx.resume();

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, ctx.currentTime);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.02);
}

function playTone(frequency: number, duration: number, type: OscillatorType = "sine", volume = 0.3) {
  const ctx = getCtx();
  if (!ctx) return;

  // Resume si está suspendido (requiere interacción del usuario)
  if (ctx.state === "suspended") ctx.resume();

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(frequency, ctx.currentTime);

  gain.gain.setValueAtTime(volume, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + duration);
}

/** Timbre suave de sala de espera — para el médico cuando hay pacientes */
export function soundPacienteEsperando() {
  playTone(880, 0.15, "sine", 0.15);
  setTimeout(() => playTone(1047, 0.15, "sine", 0.12), 180);
}

/** Confirmación — médico aceptó la consulta */
export function soundConsultaAceptada() {
  playTone(523, 0.15, "sine", 0.25);
  setTimeout(() => playTone(659, 0.15, "sine", 0.25), 150);
  setTimeout(() => playTone(784, 0.2, "sine", 0.25), 300);
}

/** Videollamada lista para unirse — más prominente */
export function soundVideoLista() {
  playTone(784, 0.12, "sine", 0.3);
  setTimeout(() => playTone(988, 0.12, "sine", 0.3), 140);
  setTimeout(() => playTone(1175, 0.12, "sine", 0.3), 280);
  setTimeout(() => playTone(1319, 0.25, "sine", 0.35), 420);
}
