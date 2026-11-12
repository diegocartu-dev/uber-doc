// Los límites del asistente de la Bandeja cuando el envío está prendido
// (12/11/2026, decisión de Diego: prender `BANDEJA_BOT_ENVIO`, que lo que no
// pueda resolver de forma segura lo consulte, y que el spam salga de la vista).
//
// Lo que se decide acá es lógica pura, para poder testearla; la ruta
// (api/bandeja/bot) junta los datos y aplica el resultado.

/** Tope de respuestas automáticas por 24 h. Un día normal no llega ni a diez. */
export const MAX_ENVIOS_ASISTENTE_DIA = 30;

/** Marca que deja el asistente en `correos.datos` de lo que mandó él. */
export const MARCA_ASISTENTE = { enviado_por_asistente: true } as const;

export type MotivoNoEnvia =
  | "no_pidio_enviar"
  | "envio_apagado"
  | "direccion_no_probada"
  | "ya_respondido"
  | "tope_diario";

/**
 * ¿Sale el mail o queda en borrador? El orden importa: primero lo que apaga
 * todo, después lo que protege a un tercero, después lo que frena un bucle.
 */
export function decidirEnvio(p: {
  pidioEnviar: boolean;
  envioHabilitado: boolean;
  direccionProbada: boolean;
  /** Ya salió una respuesta a este mismo correo (de quien sea). */
  yaRespondido: boolean;
  /** Respuestas automáticas en las últimas 24 h. */
  enviadosHoy: number;
}): { enviar: true } | { enviar: false; motivo: MotivoNoEnvia } {
  if (!p.pidioEnviar) return { enviar: false, motivo: "no_pidio_enviar" };
  if (!p.envioHabilitado) return { enviar: false, motivo: "envio_apagado" };
  if (!p.direccionProbada) return { enviar: false, motivo: "direccion_no_probada" };
  if (p.yaRespondido) return { enviar: false, motivo: "ya_respondido" };
  if (p.enviadosHoy >= MAX_ENVIOS_ASISTENTE_DIA) return { enviar: false, motivo: "tope_diario" };
  return { enviar: true };
}

export const TEXTO_MOTIVO: Record<MotivoNoEnvia, string> = {
  no_pidio_enviar: "No se pidió enviar",
  envio_apagado: "El envío está apagado (BANDEJA_BOT_ENVIO)",
  direccion_no_probada:
    "La dirección no está comprobada: vino del formulario de ayuda sin sesión iniciada, así que la respuesta la aprueba una persona",
  ya_respondido: "Ese correo ya tiene una respuesta enviada: no se manda otra sola. Si hace falta, la aprueba una persona",
  tope_diario: "Se llegó al tope diario de respuestas automáticas: desde acá las aprueba una persona",
};

/**
 * ¿Se puede sacar este correo de la vista como spam? Solo lo que no es de nadie
 * nuestro: quien tiene cuenta, quien escribió con sesión o alguien a quien ya le
 * escribimos nunca se archiva solo, diga lo que diga el mail.
 */
export function puedeMarcarSpam(p: {
  esEntrada: boolean;
  conSesion: boolean;
  tieneCuenta: boolean;
  leEscribimosAntes: boolean;
}): { ok: true } | { ok: false; motivo: string } {
  if (!p.esEntrada) return { ok: false, motivo: "Solo se marca un correo recibido" };
  if (p.conSesion) return { ok: false, motivo: "Lo escribió un usuario con sesión iniciada: no es spam" };
  if (p.tieneCuenta) return { ok: false, motivo: "El remitente tiene cuenta en Docto: no es spam" };
  if (p.leEscribimosAntes) return { ok: false, motivo: "Ya le escribimos a esa dirección: es una conversación, no spam" };
  return { ok: true };
}
