// ¿Quién puede atender AHORA, y qué turnos vivos hay? — fuente única para el
// MENÚ DE RESCATE (sprint 31/08: alternativas cuando un pedido vence sin
// aceptar o un turno pago se cae por médico ausente).
//
// ── POR QUÉ ESTA LIB EXISTE ──────────────────────────────────────────────────
// La regla de "está ofertado" vive ensamblada inline en la página de la clínica
// (src/app/clinica/page.tsx) y son SEIS filtros que ya costaron bugs pagados:
// aprobado + no oculto + carril test bilateral + gate de identidad + PUEDE
// COBRAR (caso 07/08: visible, aceptando, incobrable) + R2 (la CI no se ofrece
// en el bloque de un turno reservado). Un menú de alternativas que no reúse esa
// regla la va a duplicar, y la copia se va a olvidar de algo — la apuesta
// obvia: del filtro de cobros, y volvemos al paciente que descubre al final
// que no hay forma de pagar.
//
// La página de la clínica NO se refactoriza a propósito: es el SELECT que llena
// el listado (lección del outage 22/06) y no se toca por prolijidad. Esta lib
// calca su regla con las mismas piezas importadas (puedeAtenderAhora,
// identidadHabilitada, estadoCuentaMp, habilitadoEnProvincia) y deja migas de
// pan en los dos archivos: si tocás los filtros allá, tocá acá.
//
// Reglas de producto que este archivo respeta (decisiones Diego 31/08):
// - Jurisdicción del PACIENTE, para CI y turnos por igual. Sin provincia no hay
//   ruteo posible → sin alternativas (fail-safe legal, mismo criterio que la
//   clínica, que pide provincia antes de listar).
// - El profesional que acaba de fallar (excluirMedicoId) NO aparece: ofrecerle
//   al paciente al que lo dejó plantado es el peor resultado posible del rescate.
// - Especialidad: `mismaEspecialidad` en cada alternativa para que la pantalla
//   rotule ("no hay X en línea; estos profesionales de Clínica Médica pueden
//   orientarte"). Jamás mezclar sin decirlo. Cuenta la principal Y las
//   adicionales (#451).

import { createAdminClient } from "@/lib/supabase/admin";
import { getFlag } from "@/lib/feature-flags";
import { identidadHabilitada } from "@/lib/perfil-medico";
import { estadoCuentaMp } from "@/lib/mp-cuenta";
import { normalizarJurisdiccion } from "@/lib/jurisdicciones";
import { parsearEspecialidadesAdicionales } from "@/lib/especialidades";
import {
  puedeAtenderAhora,
  habilitadoEnProvincia,
  type Medico,
} from "@/app/clinica/disponibilidad";

/** Card de "disponible ahora". Solo campos públicos: esto viaja al cliente. */
export type AlternativaCI = {
  medicoId: string;
  nombre: string;
  titulo: string | null;
  especialidad: string;
  precio: number | null;
  duracionMin: number;
  fotoUrl: string | null;
  mismaEspecialidad: boolean;
};

/** Card de "próximo turno". Solo campos públicos. */
export type AlternativaTurno = {
  medicoId: string;
  nombre: string;
  titulo: string | null;
  especialidad: string;
  precio: number | null;
  fecha: string; // YYYY-MM-DD
  horaInicio: string; // HH:MM:SS
  mismaEspecialidad: boolean;
};

export type Alternativas = { ciAhora: AlternativaCI[]; turnos: AlternativaTurno[] };

type MedicoPreparado = Medico & {
  fotoUrl: string | null;
  especialidadesTodas: string[]; // principal + adicionales (#451)
  enEspera: number;
};

const norm = (s: string | null | undefined) => (s ?? "").trim().toLocaleLowerCase("es");

function atiendeEspecialidad(m: MedicoPreparado, especialidad: string | null): boolean {
  if (!especialidad) return false;
  const e = norm(especialidad);
  return m.especialidadesTodas.some((x) => norm(x) === e);
}

/**
 * Selección PURA sobre datos ya preparados (testeable sin base): filtra por
 * jurisdicción y exclusión, rankea y corta. La parte con IO vive en
 * `alternativasVivas`, que arma los insumos calcando la clínica.
 */
export function seleccionarAlternativas(params: {
  medicos: MedicoPreparado[];
  turnosDisponibles: { medico_id: string; fecha: string; hora_inicio: string }[];
  jurisdiccion: string;
  especialidad: string | null;
  excluirMedicoId: string | null;
  maxCI?: number;
  maxTurnos?: number;
}): Alternativas {
  const { jurisdiccion, especialidad, excluirMedicoId } = params;
  const maxCI = params.maxCI ?? 2;
  const maxTurnos = params.maxTurnos ?? 2;

  const elegibles = params.medicos.filter(
    (m) => m.id !== excluirMedicoId && habilitadoEnProvincia(m, jurisdiccion)
  );
  const porId = new Map(elegibles.map((m) => [m.id, m]));

  // CI: puede atender ahora, misma especialidad primero, menor cola, FIFO de
  // encendido, id como desempate determinístico.
  const ciAhora = elegibles
    .filter((m) => puedeAtenderAhora(m))
    .sort((a, b) => {
      const ea = atiendeEspecialidad(a, especialidad) ? 0 : 1;
      const eb = atiendeEspecialidad(b, especialidad) ? 0 : 1;
      if (ea !== eb) return ea - eb;
      if (a.enEspera !== b.enEspera) return a.enEspera - b.enEspera;
      const fa = a.disponible_desde_at ?? "";
      const fb = b.disponible_desde_at ?? "";
      if (fa !== fb) return fa < fb ? -1 : 1;
      return a.id < b.id ? -1 : 1;
    })
    .slice(0, maxCI)
    .map((m) => ({
      medicoId: m.id,
      nombre: m.nombre_completo,
      titulo: m.titulo ?? null,
      especialidad: m.especialidad,
      precio: m.precio_consulta,
      duracionMin: m.duracion_consulta,
      fotoUrl: m.fotoUrl,
      mismaEspecialidad: atiendeEspecialidad(m, especialidad),
    }));

  // Turnos: vienen ordenados por fecha+hora. El más próximo de la MISMA
  // especialidad y el más próximo del resto (rotulado) — "lo más cercano que
  // haya en las dos opciones" (Diego 31/08), sin repetir profesional.
  const turnos: AlternativaTurno[] = [];
  const vistos = new Set<string>();
  const tomar = (mismaEsp: boolean) => {
    for (const t of params.turnosDisponibles) {
      const m = porId.get(t.medico_id);
      if (!m || vistos.has(m.id)) continue;
      if (!m.habilitadoIdentidad) continue;
      if (atiendeEspecialidad(m, especialidad) !== mismaEsp) continue;
      vistos.add(m.id);
      turnos.push({
        medicoId: m.id,
        nombre: m.nombre_completo,
        titulo: m.titulo ?? null,
        especialidad: m.especialidad,
        precio: m.precio_consulta,
        fecha: t.fecha,
        horaInicio: t.hora_inicio,
        mismaEspecialidad: mismaEsp,
      });
      return;
    }
  };
  tomar(true);
  if (turnos.length < maxTurnos) tomar(false);

  return { ciAhora, turnos };
}

/**
 * Junta los insumos contra la base (service role, columnas whitelisted) y
 * delega la selección en `seleccionarAlternativas`.
 */
export async function alternativasVivas(params: {
  provincia: string | null;
  especialidad: string | null;
  excluirMedicoId: string | null;
  pacienteEsTest: boolean;
  maxCI?: number;
  maxTurnos?: number;
}): Promise<Alternativas> {
  const jurisdiccion = normalizarJurisdiccion(params.provincia);
  if (!jurisdiccion) return { ciAhora: [], turnos: [] };

  const admin = createAdminClient();
  const flagIdentidadGate = await getFlag("identidad_gate_activa");

  // Hoy en AR (mismo cómputo que la clínica).
  const ahoraAR = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
  const hoy = `${ahoraAR.getFullYear()}-${(ahoraAR.getMonth() + 1).toString().padStart(2, "0")}-${ahoraAR.getDate().toString().padStart(2, "0")}`;

  const [{ data: medicosRaw }, { data: cuentasMpRaw }, { data: esperaRaw }, { data: reservadosHoy }, { data: turnosDisp }] =
    await Promise.all([
      // Con SERVICE ROLE a propósito: jurisdicciones y especialidades_adicionales
      // no tienen GRANT SELECT para authenticated, y con el cliente RLS una sola
      // columna sin grant falla la query ENTERA en silencio (outage 22/06). Solo
      // columnas que terminan whitelisted en los tipos públicos de arriba.
      admin
        .from("medicos")
        .select("id, especialidad, especialidades_adicionales, modalidad_atencion, nombre_completo, titulo, disponible, disponible_desde, disponible_hasta, disponible_desde_at, precio_consulta, duracion_consulta, foto_url, identidad_validada, biometria_exenta, es_cuenta_test, jurisdicciones")
        .eq("oculto_clinica", false)
        .eq("verificado", true)
        .eq("estado_registro", "aprobado")
        .eq("es_cuenta_test", params.pacienteEsTest),
      admin.from("medicos_mp_accounts").select("medico_id, estado, expires_at"),
      admin.from("consultas").select("medico_id").in("estado", ["esperando", "en_curso"]),
      admin.from("turnos").select("medico_id, hora_inicio, hora_fin").in("estado", ["confirmado", "en_espera", "en_curso"]).eq("fecha", hoy),
      admin
        .from("turnos")
        .select("medico_id, fecha, hora_inicio")
        .eq("estado", "disponible")
        .eq("canal_origen", "clinica_virtual")
        .gte("fecha", hoy)
        .order("fecha", { ascending: true })
        .order("hora_inicio", { ascending: true })
        .limit(500),
    ]);

  // ¿Puede cobrar? El vencido se auto-renueva en el checkout; el no-conectado no.
  const puedeCobrar = new Map<string, boolean>(
    (cuentasMpRaw ?? []).map((c) => [c.medico_id as string, estadoCuentaMp(c) !== "no_conectado"])
  );

  const enEsperaPorMedico = new Map<string, number>();
  for (const c of esperaRaw ?? []) {
    if (c.medico_id) enEsperaPorMedico.set(c.medico_id, (enEsperaPorMedico.get(c.medico_id) ?? 0) + 1);
  }

  // R2: la CI no se ofrece dentro del bloque (±30 min) de un turno reservado.
  const aMin = (h: string) => { const [a, b] = h.split(":").map(Number); return a * 60 + b; };
  const ahoraMin = ahoraAR.getHours() * 60 + ahoraAR.getMinutes();
  const GRACIA_TURNO_MIN = 30;
  const ciBloqueada = new Set<string>();
  for (const t of reservadosHoy ?? []) {
    if (!t.medico_id || !t.hora_inicio || !t.hora_fin) continue;
    if (ahoraMin >= aMin(t.hora_inicio) - GRACIA_TURNO_MIN && ahoraMin <= aMin(t.hora_fin) + GRACIA_TURNO_MIN) {
      ciBloqueada.add(t.medico_id);
    }
  }

  const medicos: MedicoPreparado[] = (medicosRaw ?? []).map((m) => ({
    id: m.id,
    especialidad: m.especialidad,
    modalidad_atencion: m.modalidad_atencion,
    nombre_completo: m.nombre_completo,
    titulo: m.titulo,
    disponible: m.disponible && puedeCobrar.get(m.id) === true,
    disponible_desde: m.disponible_desde,
    disponible_hasta: m.disponible_hasta,
    disponible_desde_at: m.disponible_desde_at,
    precio_consulta: m.precio_consulta,
    duracion_consulta: m.duracion_consulta,
    foto_url: m.foto_url,
    fotoUrl: m.foto_url,
    habilitadoIdentidad:
      !flagIdentidadGate ||
      identidadHabilitada({
        identidad_validada: m.identidad_validada,
        biometria_exenta: m.biometria_exenta,
        es_cuenta_test: m.es_cuenta_test,
      }),
    ciBloqueadaPorTurno: ciBloqueada.has(m.id),
    jurisdicciones: (m.jurisdicciones ?? []) as string[],
    especialidadesTodas: [m.especialidad, ...parsearEspecialidadesAdicionales(m.especialidades_adicionales)],
    enEspera: enEsperaPorMedico.get(m.id) ?? 0,
  }));

  return seleccionarAlternativas({
    medicos,
    turnosDisponibles: (turnosDisp ?? []).filter((t) => t.medico_id) as { medico_id: string; fecha: string; hora_inicio: string }[],
    jurisdiccion,
    especialidad: params.especialidad,
    excluirMedicoId: params.excluirMedicoId,
    maxCI: params.maxCI,
    maxTurnos: params.maxTurnos,
  });
}
