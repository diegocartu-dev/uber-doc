// src/lib/crons-esperados.ts
// Cada cuánto tiene que latir cada tarea automática, para el watchdog.
//
// Vive acá y no adentro de la ruta del watchdog para que el test
// tests/unit/crons-agendados.test.ts la pueda importar: una ruta de Next solo
// puede exportar handlers. Ese test no deja mergear un cron que tenga carpeta
// en src/app/api/cron y le falte su línea en vercel.json, acá o en CRONS_META
// (el recordatorio de 10 minutos al paciente estuvo escrito y sin agendar desde
// marzo hasta el 12/10, y nadie lo supo porque nadie lo vigilaba).

// cron_key → intervalo esperado en minutos (según schedule en vercel.json).
export const ESPERADOS: Record<string, number> = {
  "generar-slots": 1440,
  "cerrar-huerfanas": 1440,
  recordatorios: 1440,
  "limpieza-estudios-temp": 1440,
  "sala-espera-diaria": 1440,
  "reintentar-refunds": 1440,
  "rejoin-expirar": 1440,
  "repush-esperando": 10,
  // Aviso al médico 15 min antes del turno: corre cada minuto. Del que un médico
  // no se pierda un paciente depende que este cron esté vivo, así que se vigila.
  "recordatorio-medico-15min": 1,
  // Recordatorio al PACIENTE 10 min antes del turno. Estuvo escrito y sin
  // agendar desde marzo hasta el 12/10: nadie lo vigilaba, así que nadie supo
  // que no corría. Desde entonces tests/unit/crons-agendados.test.ts no deja
  // mergear un cron que falte acá, en vercel.json o en CRONS_META.
  "recordatorios-10min": 1,
  // La ventana de pago de la CI aceptada: estaba agendada pero no vigilada.
  "ci-aceptada-sin-pago": 1,
  "apagar-disponibilidad": 30,
  "validar-refeps-pendientes": 10,
  // Faltaba: el cron que resuelve las CI vencidas —el que dispara reembolsos y
  // el que libera al paciente cuyo pedido nadie aceptó— no estaba vigilado. Si
  // Vercel dejaba de invocarlo, nadie se enteraba. Cada 3 min desde el 21/08:
  // es el dueño del plazo de 10 minutos, y con el intervalo de 10 que tenía ese
  // plazo se estiraba hasta 20.
  "resolver-consultas-vencidas": 3,
  "resolver-turnos-vencidos": 10,
  // El revisor de caídas: si deja de correr, las fallas vuelven a ser invisibles.
  "revisar-caidas": 5,
  "reconciliar-identidad": 10,
  "aviso-agenda-vencida": 1440,
  "saldo-servicios": 1440,
  "provisionar-claves": 1440,
  "liberar-reservas": 10,
  "recuperar-registros": 1440,
  "verificar-cuentas-mp": 1440,
  "renovar-tokens-mp": 360,
  "documentos-sin-sello": 60,
  // Corre en los dos deploys (vercel.json es uno solo): en el B2C responde
  // "no aplica" en la primera línea, pero LATE igual — así que el watchdog lo
  // vigila en los dos lados sin ninguna excepción por modo.
  "metering-clasificar": 10,
  // El cierre del acuerdo corre TODOS LOS DÍAS a las 04:00 ART, aunque solo
  // tenga trabajo los lunes: es su propio reintento (el lunes aborta
  // legítimamente cuando quedó una consulta viva del domingo, y antes nadie
  // volvía a pasar). Declarado semanal, el umbral daba ~10,6 días —`1,5 ×
  // intervalo + 30 min`— o sea que "Vercel dejó de invocarlo" se avisaba ~3,5
  // días tarde; diario da ~1,5 días.
  "acuerdo-cerrar-semana": 24 * 60,
  // El cierre de la facturación corre TODOS LOS DÍAS a las 04:00 ART, aunque
  // solo tenga trabajo el día 1: es su propio reintento (el día 1 aborta
  // legítimamente cuando quedó una consulta viva del 31, y antes nadie volvía a
  // pasar). Al ser diario, el umbral vuelve a ser útil: `1,5 × 1440 + 30` ≈ 1,5
  // días, así que "Vercel dejó de invocarlo" se avisa dentro del mismo mes y no
  // a los ~46 días como cuando se declaraba mensual.
  "metering-cerrar-mes": 24 * 60,
  // Horario (minuto 17). Como los del metering, late en los dos deploys: en el
  // B2C responde "no aplica" pero el latido queda escrito.
  "demo-cerrar-abiertas": 60,
  uptime: 1,
};
