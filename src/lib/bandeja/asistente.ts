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

/** Tope de respuestas automáticas a una misma dirección por 24 h: corta el ping-pong con un autorespondedor. */
export const MAX_ENVIOS_ASISTENTE_POR_DESTINO = 2;

/** Tope de correos que el asistente saca de la vista por 24 h. */
export const MAX_SPAM_ASISTENTE_DIA = 10;

/** Casillas que no lee nadie: contestarles solo es alimentar un bucle. */
const CASILLA_AUTOMATICA = /^(no-?reply|noreply|do-?not-?reply|donotreply|mailer-daemon|postmaster|bounces?|notifications?)([+.-][^@]*)?@/i;

export function esCasillaAutomatica(direccion: string): boolean {
  return CASILLA_AUTOMATICA.test(direccion.trim());
}

export type MotivoNoEnvia =
  | "no_pidio_enviar"
  | "envio_apagado"
  | "direccion_no_probada"
  | "remitente_no_autenticado"
  | "destino_automatico"
  | "ya_atendido"
  | "ya_respondido"
  | "tope_destinatario"
  | "tope_diario";

/**
 * ¿Sale el mail o queda en borrador? El orden importa: primero lo que apaga
 * todo, después lo que protege a un tercero, después lo que frena un bucle.
 */
export function decidirEnvio(p: {
  pidioEnviar: boolean;
  envioHabilitado: boolean;
  /** La dirección es de quien escribió: llegó como correo, o es la de su cuenta con sesión. */
  direccionProbada: boolean;
  /**
   * El remitente no está falsificado: el correo pasó DMARC, o el destino es el
   * mail de una cuenta con sesión. "Llegó un mail" no alcanza: el From se inventa.
   */
  remitenteAutentico: boolean;
  /** El destino es una casilla automática (no-reply, mailer-daemon…). */
  destinoAutomatico: boolean;
  /** El correo original ya figura atendido o archivado. */
  yaAtendido: boolean;
  /** Ya salió una respuesta a este mismo correo (de quien sea). */
  yaRespondido: boolean;
  /** Respuestas automáticas a ESTA dirección en las últimas 24 h. */
  enviadosAlDestinoHoy: number;
  /** Respuestas automáticas en las últimas 24 h. */
  enviadosHoy: number;
}): { enviar: true } | { enviar: false; motivo: MotivoNoEnvia } {
  if (!p.pidioEnviar) return { enviar: false, motivo: "no_pidio_enviar" };
  if (!p.envioHabilitado) return { enviar: false, motivo: "envio_apagado" };
  if (!p.direccionProbada) return { enviar: false, motivo: "direccion_no_probada" };
  if (!p.remitenteAutentico) return { enviar: false, motivo: "remitente_no_autenticado" };
  if (p.destinoAutomatico) return { enviar: false, motivo: "destino_automatico" };
  if (p.yaAtendido) return { enviar: false, motivo: "ya_atendido" };
  if (p.yaRespondido) return { enviar: false, motivo: "ya_respondido" };
  if (p.enviadosAlDestinoHoy >= MAX_ENVIOS_ASISTENTE_POR_DESTINO) return { enviar: false, motivo: "tope_destinatario" };
  if (p.enviadosHoy >= MAX_ENVIOS_ASISTENTE_DIA) return { enviar: false, motivo: "tope_diario" };
  return { enviar: true };
}

export const TEXTO_MOTIVO: Record<MotivoNoEnvia, string> = {
  no_pidio_enviar: "No se pidió enviar",
  envio_apagado: "El envío está apagado (BANDEJA_BOT_ENVIO)",
  direccion_no_probada:
    "La dirección no está comprobada: vino del formulario de ayuda sin sesión iniciada, así que la respuesta la aprueba una persona",
  remitente_no_autenticado:
    "No se pudo comprobar que el mail venga de esa dirección (el remitente se puede falsificar): la respuesta la aprueba una persona",
  destino_automatico: "El remitente es una casilla automática: no se le contesta solo",
  ya_atendido: "Ese correo ya figura atendido o archivado: no se le manda nada solo",
  ya_respondido: "Ese correo ya tiene una respuesta enviada: no se manda otra sola. Si hace falta, la aprueba una persona",
  tope_destinatario: "Ya salieron respuestas automáticas a esa dirección en las últimas 24 h: la siguiente la aprueba una persona",
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
  /** Correos que el asistente ya sacó de la vista en las últimas 24 h. */
  marcadosHoy: number;
}): { ok: true } | { ok: false; motivo: string } {
  if (!p.esEntrada) return { ok: false, motivo: "Solo se marca un correo recibido" };
  if (p.marcadosHoy >= MAX_SPAM_ASISTENTE_DIA) return { ok: false, motivo: "Se llegó al tope diario de correos marcados como spam: el resto lo mira una persona" };
  if (p.conSesion) return { ok: false, motivo: "Lo escribió un usuario con sesión iniciada: no es spam" };
  if (p.tieneCuenta) return { ok: false, motivo: "El remitente tiene cuenta en Docto: no es spam" };
  if (p.leEscribimosAntes) return { ok: false, motivo: "Ya le escribimos a esa dirección: es una conversación, no spam" };
  return { ok: true };
}
