// Fuente de verdad ÚNICA para el dashboard CEO (/insights): qué es "de prueba" y
// cuánto cobra Docto. Antes cada API decidía por su cuenta → los números no cerraban
// entre pantallas (Atenciones mostraba solo test, Especialidades mezclaba). Esto lo
// unifica: las 6 APIs importan de acá.

import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

// Comisión de Docto por consulta ATENDIDA. Modelo vigente en producción
// (CLAUDE.md — prueba real de pagos 10/06/2026): monto FIJO a GREBA, no un % del
// precio. Si cambia el modelo, se cambia acá y en ningún otro lado.
export const COMISION_DOCTO_POR_CONSULTA = 1500;

export type SetsTest = { testMed: Set<string>; testPac: Set<string> };

// IDs de cuentas de prueba (médicos y pacientes). Una atención es "de prueba" si el
// MÉDICO o el PACIENTE son test. Filtrar solo por médico (lo que se hacía antes)
// dejaba pasar consultas de un médico real contra un paciente test → falseaba GMV.
// consultas.paciente_id = user_id; turnos.paciente_id = pacientes.id → guardamos ambos.
export async function setsDeTest(admin: Admin): Promise<SetsTest> {
  const [{ data: meds }, { data: pacs }] = await Promise.all([
    admin.from("medicos").select("id").eq("es_cuenta_test", true),
    admin.from("pacientes").select("user_id, id").eq("es_cuenta_test", true),
  ]);
  const testMed = new Set<string>((meds ?? []).map((m: { id: string }) => m.id));
  const testPac = new Set<string>();
  for (const p of (pacs ?? []) as { user_id: string | null; id: string | null }[]) {
    if (p.user_id) testPac.add(p.user_id);
    if (p.id) testPac.add(p.id);
  }
  return { testMed, testPac };
}

// ¿Esta fila (consulta o turno) es de prueba? medicoId obligatorio, pacienteId opcional.
export function esTest(
  sets: SetsTest,
  medicoId: string | null | undefined,
  pacienteId?: string | null,
): boolean {
  if (medicoId && sets.testMed.has(medicoId)) return true;
  if (pacienteId && sets.testPac.has(pacienteId)) return true;
  return false;
}

// Lee ?real del query. Default true = "solo reales" (la verdad para decidir).
// ?real=0 = incluir test (modo debug, marcado en ámbar en la UI).
export function leerSoloReales(searchParams: URLSearchParams): boolean {
  return searchParams.get("real") !== "0";
}
