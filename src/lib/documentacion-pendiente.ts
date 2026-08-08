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
/**
 * Vencimiento de la marca local. Pasadas 72 h el cartel dejó de ser accionable y
 * pasa a ser ruido en el dashboard: lo que queda es la notificación de la
 * campanita (persistente, sin vencimiento) y el log del servidor. Sin esto, una
 * marca que nadie resolvió se queda pegada para siempre.
 */
const VENCE_MS = 72 * 60 * 60 * 1000;

/**
 * El cartel del dashboard escucha este evento para releer la marca. Hace falta
 * porque el fallo ocurre DESPUÉS del `router.push('/dashboard')`: cuando el
 * cartel se monta todavía no hay nada escrito, y el evento `storage` del
 * navegador NO se dispara en la misma pestaña que escribe. Sin esto el médico
 * mira un dashboard limpio y no se entera hasta la próxima carga completa —
 * o nunca, si cierra la pestaña.
 */
export const EVENTO_DOCUMENTACION_PENDIENTE = "docto:documentacion-pendiente";

/**
 * Mismo problema, otro canal: la campanita del médico también hace UN solo fetch
 * al montar, así que la notificación persistente que se inserta medio segundo
 * después tampoco se veía. Quien deja el aviso emite este evento y la campanita
 * recarga.
 */
export const EVENTO_NOTIFICACION_MEDICO = "docto:notificacion-medico";

/** Dispara el evento que hace recargar la campanita del dashboard. */
export function avisarNotificacionNueva(): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(EVENTO_NOTIFICACION_MEDICO));
  } catch {
    // Nunca romper el flujo de cierre por no poder avisar a la UI.
  }
}

function disponible(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

/** Avisa a la pestaña actual que la marca cambió (alta o baja). */
function notificarCambio(): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(EVENTO_DOCUMENTACION_PENDIENTE));
  } catch {
    // Nunca romper el flujo de cierre por no poder avisar a la UI.
  }
}

function vigente(p: DocumentacionPendiente): boolean {
  const t = Date.parse(p.detectadoAt);
  if (Number.isNaN(t)) return true; // marca vieja sin fecha válida: no la escondemos
  return Date.now() - t < VENCE_MS;
}

export function leerDocumentacionPendiente(): DocumentacionPendiente[] {
  if (!disponible()) return [];
  try {
    const crudo = window.localStorage.getItem(CLAVE);
    if (!crudo) return [];
    const parsed = JSON.parse(crudo);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (p): p is DocumentacionPendiente =>
          !!p && typeof p.id === "string" && (p.tipo === "consulta" || p.tipo === "turno")
      )
      .filter(vigente);
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
  notificarCambio();
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

/**
 * El aviso de esa atención dejó de aplicar. Se llama desde tres lugares y los
 * tres importan:
 *   - el botón «Ya lo resolví» del cartel;
 *   - el cierre exitoso en el workspace (la entrega finalmente salió bien) —
 *     sin esto el cartel quedaba pegado aunque el paciente ya tuviera todo;
 *   - el chequeo contra el servidor del propio cartel, cuando la atención ya
 *     figura con documentos entregados.
 */
export function descartarDocumentacionPendiente(id: string): void {
  if (!disponible()) return;
  try {
    const restantes = leerDocumentacionPendiente().filter((p) => p.id !== id);
    if (restantes.length === 0) window.localStorage.removeItem(CLAVE);
    else window.localStorage.setItem(CLAVE, JSON.stringify(restantes));
  } catch {
    // idem
  }
  notificarCambio();
}
