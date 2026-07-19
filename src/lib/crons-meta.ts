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
    impacto: "los pacientes con turno mañana no reciben el recordatorio (más riesgo de ausencias)",
    cadencia: "una vez por día a las 09:00",
    autoRecupera: true,
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
};

/** "45 minutos" / "43 horas" / "3 días" — para mails, sin decimales raros. */
export function duracionHumana(minutos: number): string {
  if (minutos < 120) return `${Math.round(minutos)} minutos`;
  const horas = Math.round(minutos / 60);
  if (horas < 48) return `${horas} horas`;
  return `${Math.round(horas / 24)} días`;
}

/** Hora actual (o de `d`) en formato argentino corto, ej: "18/07 21:15". */
export function horaArgentina(d: Date = new Date()): string {
  return d.toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
