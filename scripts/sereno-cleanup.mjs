import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error("[sereno-cleanup] NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son requeridas");
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceKey);

async function cleanup() {
  console.log("[sereno-cleanup] Limpiando datos generados por cuentas de prueba...");

  // Get test medico and paciente IDs
  const { data: testMedicos } = await admin
    .from("medicos")
    .select("id")
    .eq("es_cuenta_test", true);

  const { data: testPacientes } = await admin
    .from("pacientes")
    .select("id, user_id")
    .eq("es_cuenta_test", true);

  const medicoIds = (testMedicos ?? []).map((m) => m.id);
  const pacienteIds = (testPacientes ?? []).map((p) => p.id);
  const pacienteUserIds = (testPacientes ?? []).map((p) => p.user_id);

  if (medicoIds.length === 0 && pacienteIds.length === 0) {
    console.log("[sereno-cleanup] No se encontraron cuentas de prueba");
    return;
  }

  console.log(`[sereno-cleanup] Médicos test: ${medicoIds.length}, Pacientes test: ${pacienteIds.length}`);

  // Delete consultas created by test pacientes
  if (pacienteUserIds.length > 0) {
    const { count } = await admin
      .from("consultas")
      .delete({ count: "exact" })
      .in("paciente_id", pacienteUserIds);
    console.log(`[sereno-cleanup] Consultas eliminadas: ${count ?? 0}`);
  }

  // Delete non-available turnos for test medicos (keep disponible ones for next run)
  if (medicoIds.length > 0) {
    const { count } = await admin
      .from("turnos")
      .delete({ count: "exact" })
      .in("medico_id", medicoIds)
      .neq("estado", "disponible");
    console.log(`[sereno-cleanup] Turnos no-disponibles eliminados: ${count ?? 0}`);
  }

  // Delete turnos reserved by test pacientes
  if (pacienteIds.length > 0) {
    const { count } = await admin
      .from("turnos")
      .delete({ count: "exact" })
      .in("paciente_id", pacienteIds)
      .neq("estado", "disponible");
    console.log(`[sereno-cleanup] Turnos de pacientes test eliminados: ${count ?? 0}`);
  }

  // Delete sala_espera_entradas for test pacientes
  if (pacienteIds.length > 0) {
    const { count } = await admin
      .from("sala_espera_entradas")
      .delete({ count: "exact" })
      .in("paciente_id", pacienteIds);
    console.log(`[sereno-cleanup] Entradas sala de espera eliminadas: ${count ?? 0}`);
  }

  // Delete documentos for test medicos
  if (medicoIds.length > 0) {
    const { count } = await admin
      .from("documentos")
      .delete({ count: "exact" })
      .in("medico_id", medicoIds);
    console.log(`[sereno-cleanup] Documentos eliminados: ${count ?? 0}`);
  }

  // Clean up pagos for test pacientes
  if (pacienteUserIds.length > 0) {
    const { count } = await admin
      .from("pagos")
      .delete({ count: "exact" })
      .in("paciente_id", pacienteUserIds);
    console.log(`[sereno-cleanup] Pagos eliminados: ${count ?? 0}`);
  }

  console.log("[sereno-cleanup] Limpieza completada");
}

cleanup().catch((err) => {
  console.error("[sereno-cleanup] Error:", err);
  process.exit(1);
});
