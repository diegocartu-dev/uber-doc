// ---------------------------------------------------------------------------
// Documentación que quedó sin entregar — marca local en el navegador del médico
// ---------------------------------------------------------------------------
//
// POR QUÉ EXISTE
// El guardado de documentos al finalizar una consulta corre DESPUÉS del redirect
// al dashboard (fire-and-forget, ver WorkspaceConsulta). Cuando falla no hay
// pantalla donde mostrar el error: el médico ya se fue, convencido de que
// entregó. Un caso de junio pasó dos meses sin que nadie se enterara.
//
// Esta marca es la mitad OFFLINE del aviso. La otra mitad es la notificación
// persistente en la campanita (/api/medico/documentos-pendientes). Van juntas
// a propósito: la causa más común de que la entrega falle es que se cayó la red,
// y en ese escenario el POST de la notificación también falla — pero
// localStorage no. Al contrario, si el médico vuelve desde otro dispositivo o
// con el historial limpio, la marca local no está y la campanita sí.
//
// Se escribe SOLO en el navegador del médico y no contiene datos clínicos ni del
// paciente: id de la atención, canal, hora de inicio y motivo.

export type MotivoPendiente = "documentos" | "cierre";

export type DocumentacionPendiente = {
  /** id de la consulta (CI) o del turno */
  id: string;
  tipo: "consulta" | "turno";
  /** ISO del inicio de la atención — el aviso muestra la hora, no el id */
  hora: string;
  motivo: MotivoPendiente;
  detectadoAt: string;
};

const CLAVE = "docto_documentacion_pendiente";
/** Techo defensivo: el aviso es para actuar hoy, no un historial. */
const MAX_ITEMS = 3;

function disponible(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

export function leerDocumentacionPendiente(): DocumentacionPendiente[] {
  if (!disponible()) return [];
  try {
    const crudo = window.localStorage.getItem(CLAVE);
    if (!crudo) return [];
    const parsed = JSON.parse(crudo);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p): p is DocumentacionPendiente =>
        !!p && typeof p.id === "string" && (p.tipo === "consulta" || p.tipo === "turno")
    );
  } catch {
    return [];
  }
}

/**
 * Deja la marca. Si ya había una para la misma atención, la reemplaza (no
 * duplica): un reintento fallido no debe llenar el dashboard de carteles.
 */
export function marcarDocumentacionPendiente(
  item: Omit<DocumentacionPendiente, "detectadoAt">
): void {
  if (!disponible()) return;
  try {
    const previos = leerDocumentacionPendiente().filter((p) => p.id !== item.id);
    const siguiente = [{ ...item, detectadoAt: new Date().toISOString() }, ...previos].slice(
      0,
      MAX_ITEMS
    );
    window.localStorage.setItem(CLAVE, JSON.stringify(siguiente));
  } catch {
    // localStorage lleno o bloqueado (modo privado): la campanita sigue siendo
    // el respaldo. Nunca romper por esto.
  }
}

/**
 * "14:30" a partir de lo que guarda el workspace en `hora`. Sirve para los dos
 * canales: en turnos es un `time` de PostgreSQL ("14:30:00", ya en hora
 * argentina) y en consultas inmediatas un ISO con zona.
 */
export function horaCorta(hora: string | null | undefined): string {
  if (!hora) return "";
  if (/^\d{2}:\d{2}/.test(hora)) return hora.slice(0, 5);
  const d = new Date(hora);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Adónde tiene que volver el médico para reenviar lo que escribió. */
export function urlDeAtencion(item: Pick<DocumentacionPendiente, "id" | "tipo">): string {
  return item.tipo === "turno"
    ? `/turno/${item.id}/video`
    : `/medico/consulta/${item.id}/workspace`;
}

/** El médico resolvió (o descartó) el aviso de esa atención. */
export function descartarDocumentacionPendiente(id: string): void {
  if (!disponible()) return;
  try {
    const restantes = leerDocumentacionPendiente().filter((p) => p.id !== id);
    if (restantes.length === 0) window.localStorage.removeItem(CLAVE);
    else window.localStorage.setItem(CLAVE, JSON.stringify(restantes));
  } catch {
    // idem
  }
}
