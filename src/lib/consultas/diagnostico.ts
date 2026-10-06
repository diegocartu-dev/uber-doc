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
