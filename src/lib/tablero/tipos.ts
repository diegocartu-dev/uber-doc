// Unidades del tablero único (/admin/tablero). Cada número de la pantalla se
// recalcula desde estas unidades con `vista()`; nunca desde totales guardados.
//
// Las unidades salen de `cargar.ts` (servidor, clave de servicio) ya
// clasificadas por el motor del repo (`clasificar.ts`, `plata.ts`,
// `reservas.ts`, `resultado-busqueda.ts`). Ninguna trae PII que no vaya a
// verse en pantalla: de `medicos` viajan booleanos ("tiene celular"), no los
// datos.

import type { Desenlace, Nivel } from "@/lib/consultas/clasificar";
import type { EstadoCuentaMp } from "@/lib/mp-cuenta";

export type Atencion = {
  id: string;
  tipo: "ci" | "turno";
  /** Fecha argentina: la del pedido en la CI, la del turno en el turno. */
  fecha: string;
  semana: string;
  mes: string;
  hora: number;
  min: number;
  medicoId: string;
  medico: string;
  especialidad: string;
  /** Clave del paciente (`pacientes.id`), o null si no se pudo resolver. */
  paciente: string | null;
  canal: "clinica" | "consultorio";
  estado: string;
  nivel: Nivel;
  desenlace: Desenlace;
  origen: "hito" | "inferido" | "no";
  aceptada: boolean;
  pagada: boolean;
  cobrado: number;
  fee: number;
  reintegrado: number;
  reintegroEnCurso: number;
  causa: string | null;
  causaTexto: string | null;
  resueltaPor: string | null;
  minAceptar: number | null;
  minEspera: number | null;
  minDuracion: number | null;
  documentos: string[];
  reservadoEl?: string;
  reservadoMs?: number;
  origenTurno?: boolean;
};

export type Paciente = {
  key: string;
  nombre: string;
  iniciales: string;
  provincia: string | null;
  alta: string;
  altaSemana: string;
  vioClinica: boolean;
  eligio: boolean;
  pidio: boolean;
  consultas: number;
  primeraConsulta: string | null;
};

export type Busqueda = {
  fecha: string;
  semana: string;
  mes: string;
  hora: number;
  min: number;
  paciente: string | null;
  provincia: string | null;
  medicosProv: number;
  ciOnline: number;
  agendaTurnos: number | null;
  fotoExacta: boolean;
  vistas: number;
  eligio: boolean;
  modo: string | null;
  medicoElegido: string | null;
  medicoElegidoId: string | null;
  pidio: boolean;
  llegoAlPago: boolean;
  pago: boolean;
  seAtendio: boolean;
  atenciones: string[];
  resultado: string;
  matchHabia: boolean;
  triage: string | null;
  bloqueo: string | null;
};

/** Lugares de agenda de un profesional en una fecha: publicados (`n`) y los que quedaron libres. */
export type Slot = { medicoId: string; fecha: string; n: number; libres: number };
/** Una hora (o fracción) de consulta inmediata prendida. */
export type CiHora = { medicoId: string; fecha: string; hora: number; horas: number };

export type Medico = {
  id: string;
  nombre: string;
  especialidad: string;
  adicionales: string[];
  provincias: string[];
  categoria: string | null;
  estado: string;
  baja: boolean;
  aprobado: string | null;
  registro: string;
  identidad: boolean;
  faltantes: string[];
  mp: EstadoCuentaMp;
  disponible: boolean;
  disponibleDesde: string | null;
  disponibleHasta: string | null;
  disponibleDesdeAt: string | null;
  agendasActivas: number;
  agendaPausada: boolean;
  slotsFuturos: number;
  ultimoOnline: string | null;
  ausencias: number;
  deuda: number;
  precio: number | null;
  modalidad: string | null;
  ocultoClinica: boolean;
};

export type Esperando = { id: string; medico: string; medicoId: string; paciente: string | null; desde: string; min: number };
export type Refund = { id: string; tipo: string; medico: string; estado: string; intentos: number; desde: string; neto: number; fee: number };
export type Alerta = { id: string; tipo: string; titulo: string; severidad: string; entidad: string | null; fecha: string };
export type Aviso = { medicoId: string; fecha: string; hora: number; min: number; mes: string; disparador: string | null; resultado: string | null; entrega: string | null };
export type Mensaje = { medicoId: string; fecha: string; hora: number; min: number; titulo: string; severidad: string | null; leido: boolean };
export type Ausencia = { medicoId: string; fecha: string; tipo: string; motivo: string | null };
export type Deuda = { medicoId: string; monto: number; origen: string | null; estado: string; recuperado: number; fecha: string };

export type Cobertura = {
  ventana: string;
  lanzamiento: string;
  consultas: string;
  pacientes: string;
  embudo: string;
  oferta: string;
  hito: string;
  foto: string;
  triage: string;
  entrega: string;
};

export type DatosTablero = {
  generado: string;
  hoy: string;
  cobertura: Cobertura;
  ocultos: { consultasTest: number; turnosTest: number; reservasAbandonadas: number; reprogramadosOrigen: number };
  atenciones: Atencion[];
  pacientes: Paciente[];
  busquedas: Busqueda[];
  slots: Slot[];
  ciHoras: CiHora[];
  medicos: Medico[];
  esperando: Esperando[];
  refunds: Refund[];
  alertas: Alerta[];
  avisos: Aviso[];
  mensajes: Mensaje[];
  ausencias: Ausencia[];
  deuda: Deuda[];
};

export type Periodo = { modo: "meses" | "dias"; meses: Set<string>; desde: string; hasta: string };

export type Filtros = {
  tipo: string | null;
  canal: string | null;
  esp: string | null;
  medico: string | null;
  des: string | null;
  prov: string | null;
  motivo: string | null;
};

export type Seleccion = { per: Periodo; f: Filtros; intentos: boolean };

export const FILTROS_VACIOS: Filtros = { tipo: null, canal: null, esp: null, medico: null, des: null, prov: null, motivo: null };
