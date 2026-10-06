// La etiqueta de cada consulta inmediata que se cae, escrita sola (Diego,
// 06/10/2026): "no queremos alarmas de sucesos, queremos alarmas de procesos
// que fallan" — "sino siempre corremos detrás del error y abrimos una
// investigación, y eso es muy improductivo".
//
// Tres clases:
// · suceso    → lo decidió una persona (el paciente no pagó, se retiró; el
//               profesional rechazó). Se describe en una línea. NO suena.
// · falla     → un paso de nuestra cadena (o de MP, o de Twilio) que tenía que
//               funcionar y no funcionó. Suena.
// · sin_datos → falta la evidencia para decir cuál de las dos. También suena:
//               es un dato que hay que empezar a registrar, una sola vez.
//
// Pagada y alguien no entró es "raro, ahí hay que investigar problemas
// nuestros" (Diego): falla siempre. Pura a propósito, para discutir la regla
// sin levantar la base. Se apoya en `clasificarAtencion` (la escalera) y en la
// caja negra que se escribe al cerrar (`cierre_evidencia`).

import { clasificarAtencion, MOTIVO, type FilaAtencion } from "./clasificar";
import type { EvidenciaCierre } from "./evidencia-cierre";
import type { EvidenciaTurno } from "./evidencia-turno";

export type ClaseDiagnostico = "atendida" | "en_curso" | "suceso" | "falla" | "sin_datos";
export type Diagnostico = { clase: ClaseDiagnostico; texto: string };
export type FilaDiagnostico = FilaAtencion & { cierre_evidencia?: Partial<EvidenciaCierre> | null };

const suceso = (texto: string): Diagnostico => ({ clase: "suceso", texto });
const falla = (texto: string): Diagnostico => ({ clase: "falla", texto });
const sinDatos = (texto: string): Diagnostico => ({ clase: "sin_datos", texto });
const NO_LLEGO = new Set(["undelivered", "failed"]);

/** ¿Suena? Las fallas y los huecos de evidencia, nunca los sucesos. */
export function suena(d: Diagnostico): boolean {
  return d.clase === "falla" || d.clase === "sin_datos";
}

export function diagnosticarConsulta(fila: FilaDiagnostico): Diagnostico {
  const c = clasificarAtencion(fila);
  const ev = fila.cierre_evidencia ?? null;

  switch (c.desenlace) {
    case "atendida":
      return { clase: "atendida", texto: "Atendida" };
    case "en_progreso":
      return { clase: "en_curso", texto: "En curso" };
    case "retirado":
      return fila.resolucion_motivo === MOTIVO.CAMBIO_PROFESIONAL
        ? suceso("El paciente eligió a otro profesional")
        : suceso("El paciente se retiró antes de que lo aceptaran");
    case "sin_respuesta":
      return nadieAcepto(fila, ev);
    case "abandono":
      return aceptadaSinPago(fila, ev);
    case "medico_se_fue":
      return falla(fila.estado === "medico_ausente" ? "Pagó y el profesional no entró a la sala" : "Pagó y el profesional canceló");
    case "paciente_se_fue":
      return falla(fila.estado === "no_show_paciente" ? "Pagó y el paciente no entró a la sala" : "Pagó y el paciente canceló");
    case "sin_datos":
      return sinDatos("Pagada y cerrada sin registro de quién la cerró");
  }
}

function nadieAcepto(fila: FilaDiagnostico, ev: Partial<EvidenciaCierre> | null): Diagnostico {
  if (fila.resuelta_por === "medico" || fila.estado === "rechazada") return suceso("El profesional rechazó el pedido");
  if (fila.resuelta_por === "admin") return suceso("Cancelada desde el panel de administración");
  if (!ev || ev.aviso_medico === undefined) return sinDatos("Nadie la aceptó y no quedó registro del aviso al profesional");
  if (!ev.aviso_medico) return falla("Nadie la aceptó: al profesional no le salió el aviso por WhatsApp");
  if (ev.aviso_medico !== "enviado") return falla(`Nadie la aceptó: el aviso al profesional no salió (${ev.aviso_medico})`);
  if (NO_LLEGO.has(ev.aviso_medico_entrega ?? "")) return falla("Nadie la aceptó: el aviso al profesional no le llegó");
  if (ev.aviso_medico_entrega === "read") return suceso("El profesional leyó el aviso y no respondió");
  if (ev.aviso_medico_entrega === "delivered") return suceso("Al profesional le llegó el aviso y no respondió");
  return sinDatos("Nadie la aceptó: el aviso salió y no sabemos si le llegó");
}

function aceptadaSinPago(fila: FilaDiagnostico, ev: Partial<EvidenciaCierre> | null): Diagnostico {
  // Primero lo que falló al intentar pagar: si intentó y no pudo, eso explica
  // la caída aunque después haya cancelado él o el profesional.
  if (ev?.rechazo_mp) return falla(`Mercado Pago rechazó el pago (${ev.rechazo_mp})`);
  if (fila.mp_status === "rejected") return falla("Mercado Pago rechazó el pago");
  if (ev?.rechazo_docto) return falla(`Tocó Pagar y nuestro servidor no lo dejó pagar (${ev.rechazo_docto})`);
  if (ev?.toco_boton && !ev.intento_llego_al_servidor) return falla("Tocó Pagar y el pedido no llegó a nuestro servidor");
  if (ev?.intento_llego_al_servidor && ev.cobro_creado === false) return falla("Tocó Pagar y no se pudo crear el cobro en Mercado Pago");

  if (fila.resuelta_por === "admin") return suceso("Cancelada desde el panel de administración");
  if (fila.resuelta_por === "paciente") return suceso("El paciente canceló después de que lo aceptaran");

  // Si canceló el profesional, la pregunta sigue siendo por qué el paciente no
  // pagó: antes del cierre automático (10/09) el profesional esperaba y
  // cancelaba a mano, y "canceló el profesional" tapaba la causa.
  const canceloMedico = fila.resuelta_por === "medico";
  const t = (texto: string) => (canceloMedico ? `El profesional canceló; ${texto[0].toLowerCase()}${texto.slice(1)}` : texto);

  if (!ev) {
    return sinDatos(
      canceloMedico
        ? "El profesional canceló antes del pago; no quedó evidencia de lo que vio el paciente"
        : "Aceptada y sin pagar: no quedó evidencia de lo que vio el paciente"
    );
  }
  if (ev.intento_llego_al_servidor) return suceso(t("El paciente no completó el pago en Mercado Pago"));
  if (ev.vio_boton) return suceso(t("El paciente vio el botón de pago y no lo tocó"));

  // Nunca llegó a ver el botón: ¿se enteró de que lo habían aceptado?
  if ((ev.errores_cliente ?? 0) > 0) return falla(t(`La pantalla del paciente dio ${ev.errores_cliente} error(es) y no llegó a ver el botón de pago`));
  if (ev.aviso_whatsapp_entrega === "read") return suceso(t("El paciente leyó el aviso de que lo aceptaron y no volvió a la sala"));
  if (ev.aviso_whatsapp_entrega === "delivered") return suceso(t("Al paciente le llegó el aviso de que lo aceptaron y no volvió a la sala"));
  if (ev.aviso_whatsapp && ev.aviso_whatsapp !== "enviado") return falla(t(`El paciente nunca se enteró de que lo aceptaron: el aviso no salió (${ev.aviso_whatsapp})`));
  if (NO_LLEGO.has(ev.aviso_whatsapp_entrega ?? "")) return falla(t("El paciente nunca se enteró de que lo aceptaron: el aviso no le llegó"));
  if (!ev.aviso_whatsapp) return falla(t("El paciente nunca se enteró de que lo aceptaron: no estaba en la sala y no se le avisó"));
  return sinDatos(t("El paciente no volvió a la sala: el aviso salió y no sabemos si le llegó"));
}

// ── Turnos (caso "d", Diego 06/10/2026) ─────────────────────────────────────
// "Hay que diferenciar bien ausencias (médico o paciente) de algún fallo de
// proceso que impida acceder." Una ausencia se describe y no suena SOLO si hay
// prueba de que al ausente le llegó el aviso y de que la otra parte estaba.
// Si el aviso no salió o no llegó, o alguien estaba y no pudo entrar al video,
// es falla. Si el profesional cancela un turno pago, suena (Diego, 06/10).

/** Pagó de verdad: aprobado, o devuelto/contracargado después de entrar. */
const TURNO_PAGO = new Set(["approved", "refunded", "charged_back"]);
const TURNO_VIVO = new Set(["confirmado", "en_espera", "en_curso", "reservado_pendiente"]);
const LLEGO = new Set(["read", "delivered"]);

export function diagnosticarTurno(
  fila: { estado: string; mp_status?: string | null },
  ev: Partial<EvidenciaTurno> | null
): Diagnostico {
  const pago = TURNO_PAGO.has(fila.mp_status ?? "");
  if (fila.estado === "completado") return { clase: "atendida", texto: "Atendido" };
  if (TURNO_VIVO.has(fila.estado)) return { clase: "en_curso", texto: "En curso" };
  if (fila.estado === "cancelado_paciente") return suceso("El paciente canceló el turno");
  if (fila.estado === "cancelado_medico") {
    return pago ? falla("Pagó y el profesional canceló el turno") : suceso("El profesional canceló el turno");
  }
  if (fila.estado === "ausente_medico") return ausenciaDelProfesional(ev);
  if (fila.estado === "ausente_paciente") return ausenciaDelPaciente(ev);
  return sinDatos(`Turno en estado "${fila.estado}": no hay regla para explicarlo`);
}

function ausenciaDelProfesional(ev: Partial<EvidenciaTurno> | null): Diagnostico {
  if (!ev) return sinDatos("El profesional no entró y no quedó evidencia del turno");
  if (!LLEGO.has(ev.aviso_medico_entrega ?? "")) {
    if (NO_LLEGO.has(ev.aviso_medico_entrega ?? "")) return falla("El profesional no entró: el aviso del turno no le llegó");
    if (!ev.aviso_medico) return falla("El profesional no entró y no se le mandó ningún aviso por WhatsApp");
    if (ev.aviso_medico !== "enviado") return falla(`El profesional no entró: el aviso del turno no salió (${ev.aviso_medico})`);
    return sinDatos("El profesional no entró: el aviso salió y no sabemos si le llegó");
  }
  if (ev.paciente_en_sala || ev.paciente_en_video) {
    return suceso("Ausencia del profesional: le llegó el aviso y el paciente lo esperó en la sala");
  }
  return sinDatos("El profesional no entró y no hay registro de que el paciente haya estado en la sala");
}

function ausenciaDelPaciente(ev: Partial<EvidenciaTurno> | null): Diagnostico {
  if (!ev) return sinDatos("El paciente no entró y no quedó evidencia del turno");
  if (ev.paciente_en_sala && !ev.paciente_en_video) {
    return falla("El paciente estaba en la sala de espera y no llegó a entrar al video");
  }
  if (ev.medico_en_video) {
    // No registramos los recordatorios al paciente: sin eso no se puede probar
    // que se enteró, así que no se lo da por ausente.
    return sinDatos("El paciente no entró (el profesional estaba); no registramos si le llegó el recordatorio");
  }
  return sinDatos("El paciente no entró y no hay registro de que el profesional haya estado");
}
