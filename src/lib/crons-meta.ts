// Ficha humana de cada cron, para que las alertas del watchdog y los mails de
// recuperación hablen en criollo (pedido Diego 18/07: "no puedo recibir esto y
// no saber qué significa"). Cada alerta debe decir QUÉ es la tarea, QUÉ impacto
// tiene que no corra, y si Diego tiene que HACER algo o solo esperar.
//
// Mantener en sincronía con vercel.json y con ESPERADOS del watchdog al
// agregar/sacar crons. Horarios expresados en hora argentina (los schedules de
// vercel.json están en UTC; ART = UTC-3).

export interface CronMeta {
  /** Nombre corto y entendible de la tarea. */
  nombre: string;
  /** Qué hace, en una frase sin jerga. */
  queHace: string;
  /** Qué deja de pasar (y a quién afecta) mientras la tarea no corre. */
  impacto: string;
  /** Cadencia en texto humano, con hora argentina si es diaria. */
  cadencia: string;
  /**
   * true = tarea diaria: una corrida perdida suele ser un evento puntual
   * (deploy/outage justo en su horario) y reintenta sola al día siguiente →
   * el mail recomienda ESPERAR el mail verde de recuperación.
   * false = tarea frecuente (cada 10-30 min): si el watchdog alerta es porque
   * ya falló varios intentos seguidos → el mail recomienda AVISAR ya.
   */
  autoRecupera: boolean;
  /**
   * Texto especial para "¿Tenés que hacer algo?" cuando ninguna de las dos
   * ramas genéricas aplica. Caso que lo motivó (auditoría Roberto PR #287):
   * `recordatorios` es diario PERO su trabajo perdido NO se recupera solo
   * (consulta "turnos de mañana" con fecha exacta — la cohorte salteada queda
   * sin aviso para siempre), y correrlo a mano el mismo día todavía la salva.
   */
  accion?: string;
}

export const CRONS_META: Record<string, CronMeta> = {
  "generar-slots": {
    nombre: "Generación de turnos reservables",
    queHace: "crea cada madrugada los turnos libres a partir de las agendas de los médicos",
    impacto: "los pacientes dejan de ver turnos nuevos para reservar",
    cadencia: "una vez por día a las 03:00",
    autoRecupera: true,
  },
  "cerrar-huerfanas": {
    nombre: "Cierre de consultas colgadas",
    queHace: "rescata o cierra consultas que quedaron a medio camino (pagadas sin iniciar, abiertas sin cerrar)",
    impacto: "consultas fantasma quedan abiertas y ensucian los tableros",
    cadencia: "una vez por día a las 00:00",
    autoRecupera: true,
  },
  recordatorios: {
    nombre: "Recordatorios de turnos a pacientes",
    queHace: "manda por mail el recordatorio de 24 horas a cada paciente con turno confirmado para mañana",
    impacto: "los pacientes con turno mañana no reciben el recordatorio (más riesgo de ausencias) — y OJO: esa tanda perdida no se recupera sola al día siguiente",
    cadencia: "una vez por día a las 09:00",
    autoRecupera: false,
    accion:
      "Sí, avisá HOY: esta tarea busca los turnos de mañana con fecha exacta, así que la tanda salteada no se recupera sola — pero si se corre a mano antes de medianoche, esos pacientes todavía reciben su recordatorio. Abrí Claude Code y decime: \"investigá el cron recordatorios y corré la tanda perdida\".",
  },
  "limpieza-estudios-temp": {
    nombre: "Limpieza de archivos temporales",
    queHace: "borra los archivos temporales de estudios que ya no se usan",
    impacto: "solo acumulación interna de archivos; nadie lo nota de inmediato",
    cadencia: "una vez por día a las 03:00",
    autoRecupera: true,
  },
  "sala-espera-diaria": {
    nombre: "Cierre nocturno de salas de espera",
    queHace: "cierra a fin de día las entradas de sala de espera y turnos que quedaron abiertos (red de seguridad)",
    impacto: "quedan filas fantasma de \"pacientes esperando\" en los tableros",
    cadencia: "una vez por día a las 23:59",
    autoRecupera: true,
  },
  "reintentar-refunds": {
    nombre: "Reintento de reembolsos",
    queHace: "reintenta los reembolsos de Mercado Pago que fallaron y escala a cobertura manual los que no salen",
    impacto: "un paciente al que le debemos plata espera más tiempo su reembolso",
    cadencia: "una vez por día a la 01:00",
    autoRecupera: true,
  },
  "rejoin-expirar": {
    nombre: "Cierre de consultas cortadas",
    queHace: "cierra las consultas cuya videollamada se cortó y nadie volvió a entrar (red de seguridad diaria)",
    impacto: "consultas cortadas quedan abiertas sin resolverse",
    cadencia: "una vez por día a las 00:30",
    autoRecupera: true,
  },
  "repush-esperando": {
    nombre: "Aviso al médico de pacientes esperando",
    queHace: "le recuerda al médico por push y WhatsApp que tiene pacientes esperando en la sala",
    impacto: "un médico puede no enterarse de que lo esperan → riesgo de plantón con plata de por medio (caso Romina)",
    cadencia: "cada 10 minutos",
    autoRecupera: false,
  },
  "apagar-disponibilidad": {
    nombre: "Apagado automático de disponibilidad",
    queHace: "apaga la disponibilidad de consulta inmediata de médicos que la dejaron prendida más de 4 horas",
    impacto: "médicos figuran \"disponibles ahora\" sin estar frente a la pantalla → pacientes pagan y nadie los atiende",
    cadencia: "cada 30 minutos",
    autoRecupera: false,
  },
  "validar-refeps-pendientes": {
    nombre: "Validación de matrículas (REFEPS)",
    queHace: "resuelve la validación de matrícula de los médicos recién registrados cuando el Bus del Ministerio falló",
    impacto: "médicos nuevos quedan trabados en la verificación sin poder avanzar",
    cadencia: "cada 10 minutos",
    autoRecupera: false,
  },
  "resolver-consultas-vencidas": {
    nombre: "Plazo de la consulta inmediata (30 min pagada · 10 min sin aceptar)",
    queHace: "cierra las CI pagadas que nadie tomó (reintegro del 100% si faltó el profesional, sin reintegro si faltó el paciente) y libera a los 10 min al paciente cuyo pedido nadie aceptó, desactivando de CI al profesional que no respondió",
    impacto: "un paciente que pagó y no fue atendido no recibe su devolución y queda sin poder consultar con otro; y el que pidió sin que nadie acepte se queda esperando frente a una sala que no va a abrir",
    cadencia: "cada 3 minutos",
    autoRecupera: false,
  },
  "resolver-turnos-vencidos": {
    nombre: "Resolución de turnos vencidos",
    queHace: "marca las ausencias (médico o paciente) y dispara el reembolso automático cuando corresponde",
    impacto: "un paciente plantado no recibe su reembolso automático",
    cadencia: "cada 10 minutos",
    autoRecupera: false,
  },
  "reconciliar-identidad": {
    nombre: "Reconciliación de identidad biométrica",
    queHace: "trae los resultados de verificación de identidad (Didit) que el webhook no entregó",
    impacto: "médicos que ya se verificaron no avanzan en el alta",
    cadencia: "cada 10 minutos",
    autoRecupera: false,
  },
  "aviso-agenda-vencida": {
    nombre: "Aviso de agenda vencida a médicos",
    queHace: "invita a renovar la agenda al médico cuya agenda venció ese día",
    impacto: "médicos con agenda vencida no se enteran → menos oferta de turnos",
    cadencia: "una vez por día a las 09:00",
    autoRecupera: true,
  },
  uptime: {
    nombre: "Monitor de disponibilidad del sitio",
    queHace: "golpea docto.com.ar y la base de datos cada minuto; si algo no responde manda UN mail rojo (y silencia las alertas individuales), reinicia la base solo si está colgada, y manda el verde cuando vuelve",
    impacto: "sin esto, el sitio puede estar caído y nos enteramos solo si un usuario avisa (caso 504 del 27/07 que vio Diego)",
    cadencia: "cada minuto",
    autoRecupera: true,
  },
  "liberar-reservas": {
    nombre: "Liberar turnos reservados sin pagar",
    queHace: "cada 10 minutos devuelve a 'disponible' los turnos que un paciente reservó y no pagó dentro de los 15 minutos de retención",
    impacto: "sin esto el turno queda bloqueado para siempre y ningún paciente puede tomarlo (4 turnos bloqueados al 06/08, dos de ellos del mismo día)",
    cadencia: "cada 10 minutos",
    autoRecupera: true,
  },
  "documentos-sin-sello": {
    nombre: "Control de documentos sin firmar",
    queHace:
      "cada hora cuenta cuántas recetas, certificados, indicaciones y órdenes de las últimas 24 horas quedaron sin sello electrónico, y avisa si aparecen",
    impacto:
      "si la firma se rompe, los documentos salen igual pero con la leyenda 'sin sello' y el QR no puede confirmar el contenido — sin este control nadie se entera hasta que una farmacia o un empleador pregunta",
    cadencia: "cada hora",
    autoRecupera: true,
  },
  "provisionar-claves": {
    nombre: "Claves de firma electrónica",
    queHace: "revisa todos los días que cada médico aprobado tenga sus claves de firma electrónica y se las crea si le faltan",
    impacto: "sin claves el médico no puede ponerse disponible ni abrir agenda, y el cartel solo dice 'completá tu perfil' (15 médicos trabados al 06/08)",
    cadencia: "una vez por día a las 02:00",
    autoRecupera: true,
  },
  "recuperar-registros": {
    nombre: "Recupero de registros médicos abandonados",
    queHace: "le escribe un único mail al médico que creó su cuenta y no completó el registro (invitándolo a retomarlo) y avisa si hay médicos esperando aprobación hace más de 24 horas",
    impacto: "los médicos que abandonan el registro no reciben ningún recordatorio (14 perdidos en 20 días al 06/08) y la cola de aprobación puede estancarse sin que nadie se entere",
    cadencia: "una vez por día a las 10:00",
    autoRecupera: true,
  },
  "verificar-cuentas-mp": {
    nombre: "Chequeo del país de las cuentas de cobro",
    queHace:
      "revisa todos los días que la cuenta de Mercado Pago de cada médico sea argentina (una cuenta de otro país cobra en otra moneda y ningún paciente argentino puede pagarle)",
    impacto:
      "un médico puede tener la cuenta de cobros de otro país sin que nadie se entere: figura disponible, acepta consultas y el pago falla siempre (caso 07/08)",
    cadencia: "una vez por día a las 08:00",
    autoRecupera: true,
  },
  "saldo-servicios": {
    nombre: "Vigía de saldos de servicios",
    queHace: "chequea todos los días el saldo de Didit (verificación de identidad) y Twilio (WhatsApp) y avisa antes de que se agoten",
    impacto: "un saldo puede agotarse en silencio y frenar verificaciones o WhatsApps sin que nadie lo sepa (caso Didit 20/07)",
    cadencia: "una vez por día a las 09:00",
    autoRecupera: true,
  },
  // El guardián no se monitorea a sí mismo (no está en ESPERADOS del watchdog),
  // pero sus propias fallas al correr sí alertan vía cron-guard — con ficha.
  // Solo trabaja en una instancia institucional (en el B2C corta en la primera
  // línea y responde 200). La ficha existe igual: si la tarea falla EN LA
  // INSTITUCIÓN, el mail tiene que explicar por qué importa.
  "metering-clasificar": {
    nombre: "Contador de consultas facturables (institucional)",
    queHace:
      "revisa las consultas que ya terminaron y anota cuáles se facturan, según el tiempo que estuvieron juntos el profesional y el paciente y los documentos que se emitieron",
    impacto:
      "el panel de la institución deja de actualizarse y la factura del mes se arma con datos viejos",
    cadencia: "cada 10 minutos",
    autoRecupera: false,
  },
  "acuerdo-cerrar-semana": {
    nombre: "Cierre semanal del acuerdo (institucional)",
    queHace:
      "congela cuántas horas cumplió cada profesional en toda semana terminada que siga abierta",
    impacto:
      "la semana pasada sigue mostrándose 'en curso' y sus números podrían moverse si cambia una agenda vieja",
    cadencia: "todos los días a las 04:00 (solo tiene trabajo cuando terminó una semana)",
    autoRecupera: true,
    accion:
      "Puede esperar: la tarea vuelve a intentarlo mañana y sella igual la semana que faltó. Si la misma semana falla varios días seguidos, abrí Claude Code y decime: \"investigá el cierre semanal del acuerdo\".",
  },
  "metering-cerrar-mes": {
    nombre: "Cierre mensual de la facturación (institucional)",
    queHace:
      "congela la factura de todo mes terminado que siga abierto, para que el detalle que se le pasa a la institución no cambie nunca más",
    impacto:
      "el mes queda sin cerrar: la institución puede seguir mirándolo y descargándolo, pero sus números todavía se pueden mover",
    cadencia: "todos los días a las 04:00 (solo tiene trabajo cuando terminó un mes)",
    autoRecupera: true,
    accion:
      "Puede esperar: la tarea vuelve a intentarlo mañana y cierra igual el mes que faltó. Si el mismo mes falla varios días seguidos, abrí Claude Code y decime: \"investigá el cierre mensual de la facturación\".",
  },
  watchdog: {
    nombre: "Guardián de tareas automáticas",
    queHace: "vigila que todas las demás tareas automáticas sigan corriendo y te avisa si alguna se calla",
    impacto: "si una tarea se cae, nadie te avisa (volvemos a las fallas silenciosas)",
    cadencia: "cada 30 minutos",
    autoRecupera: false,
  },
};

/** "45 minutos" / "43 horas" / "3 días" — para mails, sin decimales raros. */
export function duracionHumana(minutos: number): string {
  if (minutos < 120) return `${Math.round(minutos)} minutos`;
  const horas = Math.round(minutos / 60);
  if (horas < 48) return `${horas} horas`;
  return `${Math.round(horas / 24)} días`;
}

/** Hora actual (o de `d`) en formato argentino corto 24 h, ej: "18/07, 21:15". */
export function horaArgentina(d: Date = new Date()): string {
  return d.toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
