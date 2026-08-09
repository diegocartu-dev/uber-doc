// Lógica pura de disponibilidad de médicos en la Clínica Virtual, extraída de
// GrillaEspecialidades para reusarla en el listado plano (ruteo por jurisdicción) sin
// duplicar. Toda la honestidad de disponibilidad (semáforo, cola, prioridad de turno R2,
// orden FIFO) vive acá — es por-médico, así que se conserva igual al aplanar.

import { type AreaAtencion, areasCoincidenBusqueda } from "@/lib/areas-atencion";

export type Medico = {
  id: string;
  especialidad: string;
  modalidad_atencion: string;
  nombre_completo: string;
  // Tratamiento que el médico eligió en su registro ("Dr." / "Dra."). Opcional
  // porque el listado nunca debe romperse por falta de este dato: sin él se
  // muestra el nombre pelado, que es mejor que inventar el tratamiento.
  titulo?: string | null;
  disponible: boolean;
  disponible_desde: string | null;
  disponible_hasta: string | null;
  disponible_desde_at: string | null;
  precio_consulta: number | null;
  duracion_consulta: number;
  foto_url: string | null;
  habilitadoIdentidad: boolean;
  ciBloqueadaPorTurno: boolean;
  // Jurisdicciones habilitadas del médico (para el ruteo). Vacío = sin resolver → fail-safe.
  jurisdicciones: string[];
  // Áreas de atención adicionales declaradas por el médico (ej: Adolescencia 10-19).
  // Informativas: se muestran y se pueden buscar, NO filtran ni bloquean nada.
  // Opcional a propósito: un médico sin el dato sigue funcionando igual que siempre.
  areasAtencion?: AreaAtencion[];
};

export type ConsultaEspera = { medico_id: string };
export type TurnoClinicaVirtual = {
  medico_id: string;
  fecha: string; // YYYY-MM-DD
  hora_inicio: string; // HH:MM:SS
};

export function normalizeTime(t: string): string {
  return t.slice(0, 5);
}

export function estaEnHorario(medico: Medico): boolean {
  if (!medico.disponible) return false;
  if (!medico.disponible_desde || !medico.disponible_hasta) return medico.disponible;
  const ahora = new Date();
  const hh = ahora.getHours().toString().padStart(2, "0");
  const mm = ahora.getMinutes().toString().padStart(2, "0");
  const horaActual = `${hh}:${mm}`;
  return horaActual >= normalizeTime(medico.disponible_desde) && horaActual <= normalizeTime(medico.disponible_hasta);
}

// "Reservable AHORA": en su horario, habilitado por identidad, sin turno reservado
// ±30min, y CON precio de CI cargado. El chequeo de precio es la defensa en la
// clínica contra el modelo nuevo (precio_consulta nullable): un médico sin precio
// nunca aparece reservable a "$0" (backup del gate del toggle "disponible").
export function puedeAtenderAhora(medico: Medico): boolean {
  return (
    medico.habilitadoIdentidad &&
    !!medico.precio_consulta &&
    medico.precio_consulta > 0 &&
    estaEnHorario(medico) &&
    !medico.ciBloqueadaPorTurno
  );
}

// Color semáforo del conteo de cola: 0 verde, 1-3 amarillo, 4+ naranja.
export function semaforoEspera(enEspera: number): { color: string; texto: string } {
  if (enEspera === 0) return { color: "#1D9E75", texto: "Sin espera" };
  const sufijo = `${enEspera} en sala de espera`;
  if (enEspera <= 3) return { color: "#BA7517", texto: sufijo };
  return { color: "#D85A30", texto: sufijo };
}

export function proximoTurnoPorMedico(
  turnos: TurnoClinicaVirtual[]
): Map<string, TurnoClinicaVirtual> {
  const map = new Map<string, TurnoClinicaVirtual>();
  for (const t of turnos) {
    const actual = map.get(t.medico_id);
    if (!actual || t.fecha < actual.fecha || (t.fecha === actual.fecha && t.hora_inicio < actual.hora_inicio)) {
      map.set(t.medico_id, t);
    }
  }
  return map;
}

export function formatFechaTurno(fecha: string, horaInicio: string): string {
  const [y, mo, d] = fecha.split("-").map(Number);
  const dt = new Date(y, (mo ?? 1) - 1, d ?? 1);
  const dia = dt.toLocaleDateString("es-AR", { day: "numeric", month: "short" });
  return `${dia} - ${normalizeTime(horaInicio)} h`;
}

// Versión relativa en criollo para el BOTÓN de turno (pedido Diego 28/07):
// "Hoy 16:00", "Mañana 09:30", después "jue 30 jul 16:00".
export function formatFechaTurnoCorta(fecha: string, horaInicio: string): string {
  const hoy = new Date();
  const hoyISO = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;
  const man = new Date(hoy.getTime() + 86_400_000);
  const manISO = `${man.getFullYear()}-${String(man.getMonth() + 1).padStart(2, "0")}-${String(man.getDate()).padStart(2, "0")}`;
  const hora = normalizeTime(horaInicio);
  if (fecha === hoyISO) return `Hoy ${hora}`;
  if (fecha === manISO) return `Mañana ${hora}`;
  const [y, mo, d] = fecha.split("-").map(Number);
  const dt = new Date(y, (mo ?? 1) - 1, d ?? 1);
  return `${dt.toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short" })} ${hora}`;
}

export function formatPrecio(precio: number | null): string {
  // precio_consulta puede ser NULL (modelo nuevo sin config). En ese caso no
  // mostramos "$0" (engañoso) sino un placeholder; igual esos médicos no son
  // reservables por CI (ver puedeAtenderAhora).
  if (precio == null) return "Precio a confirmar";
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(precio);
}

export function normalizeTexto(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Buscador del listado: nombre, especialidad y —desde 07/08/2026— las áreas de atención
// declaradas ("adolescencia", "adolescentes"…). SUMA formas de encontrar al médico; no
// saca a ninguno de los que ya aparecían con el término tipeado.
export function coincideConBusqueda(medico: Medico, termino: string): boolean {
  const t = normalizeTexto(termino).trim();
  if (!t) return true;
  return (
    normalizeTexto(medico.especialidad).includes(t) ||
    normalizeTexto(medico.nombre_completo).includes(t) ||
    areasCoincidenBusqueda(medico.areasAtencion, termino)
  );
}

// Orden macro del listado plano por disponibilidad (Sofía): reservables ahora → con espera
// → solo turno (más cercano) → sin nada. Dentro de cada grupo, el orden fino existente
// (menos cola asc; FIFO por disponible_desde_at; id como desempate determinístico).
export function ordenarMedicos(
  medicos: Medico[],
  esperasPorMedico: Map<string, number>,
  turnoMasCercano: Map<string, TurnoClinicaVirtual>,
  medicosConTurnos: Set<string>
): Medico[] {
  // Rango macro: 0 reservable ahora, 1 con espera (online con cola), 2 solo turno, 3 nada.
  const rango = (m: Medico): number => {
    if (puedeAtenderAhora(m)) {
      return (esperasPorMedico.get(m.id) ?? 0) === 0 ? 0 : 1;
    }
    if (medicosConTurnos.has(m.id)) return 2;
    return 3;
  };
  return [...medicos].sort((a, b) => {
    const ra = rango(a), rb = rango(b);
    if (ra !== rb) return ra - rb;
    // Dentro del grupo "solo turno": por turno más cercano.
    if (ra === 2) {
      const ta = turnoMasCercano.get(a.id), tb = turnoMasCercano.get(b.id);
      if (ta && tb) {
        if (ta.fecha !== tb.fecha) return ta.fecha < tb.fecha ? -1 : 1;
        if (ta.hora_inicio !== tb.hora_inicio) return ta.hora_inicio < tb.hora_inicio ? -1 : 1;
      } else if (ta) return -1;
      else if (tb) return 1;
    }
    // Menos cola primero.
    const ea = esperasPorMedico.get(a.id) ?? 0, eb = esperasPorMedico.get(b.id) ?? 0;
    if (ea !== eb) return ea - eb;
    // FIFO por disponible_desde_at; id como desempate estable (NO aleatorio).
    const da = a.disponible_desde_at, db = b.disponible_desde_at;
    if (da && db) { if (da !== db) return da < db ? -1 : 1; }
    else if (da) return -1;
    else if (db) return 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

// Filtro de ruteo por jurisdicción (Regla A) con FAIL-SAFE: se oculta un médico SOLO si
// tiene jurisdicciones conocidas Y la provincia del paciente NO está entre ellas. Un médico
// con jurisdicciones vacías (sin resolver) se MUESTRA — nunca se esconde por falta de dato.
export function habilitadoEnProvincia(medico: Medico, provincia: string): boolean {
  if (!medico.jurisdicciones || medico.jurisdicciones.length === 0) return true; // fail-safe
  return medico.jurisdicciones.includes(provincia);
}
