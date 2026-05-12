import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error("[sereno-reset] NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son requeridas");
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceKey);

const MEDICO_TEST_ID = "f52f79f9-0526-4b6a-a4c0-837f26fe7e19";

const TEST_PASSWORD = "DoctoTest2026!";
const MEDICO_TEST_AUTH_ID = "05d6af2c-bcf9-48c5-a423-40648cc4d7d2";

async function resetPasswords() {
  const { data: testUsers } = await admin
    .from("medicos")
    .select("user_id")
    .eq("es_cuenta_test", true);

  const { data: testPacientes } = await admin
    .from("pacientes")
    .select("user_id")
    .eq("es_cuenta_test", true);

  const userIds = [
    ...(testUsers || []).map((u) => u.user_id),
    ...(testPacientes || []).map((u) => u.user_id),
  ];

  let resetCount = 0;
  for (const uid of userIds) {
    const { error } = await admin.auth.admin.updateUserById(uid, {
      password: TEST_PASSWORD,
    });
    if (!error) resetCount++;
  }
  console.log(`[sereno-reset] ${resetCount}/${userIds.length} passwords reseteados`);
}

async function reset() {
  console.log("[sereno-reset] Reseteando cuentas de prueba...");

  await resetPasswords();

  // Reset pacientes test al estado base
  const { data: pacientes } = await admin
    .from("pacientes")
    .select("id, user_id")
    .eq("es_cuenta_test", true);

  if (pacientes?.length) {
    console.log(`[sereno-reset] ${pacientes.length} pacientes de prueba encontrados`);
  }

  // Generar turnos disponibles para el médico test (próximos 7 días, 9-17h)
  const hoy = new Date().toISOString().slice(0, 10);
  const { data: existentes } = await admin
    .from("turnos")
    .select("id", { count: "exact", head: true })
    .eq("medico_id", MEDICO_TEST_ID)
    .eq("estado", "disponible")
    .gte("fecha", hoy);

  const turnosExistentes = existentes ?? 0;
  console.log(`[sereno-reset] Turnos disponibles existentes: ${turnosExistentes}`);

  if (typeof turnosExistentes === "number" && turnosExistentes < 10) {
    const turnos = [];
    for (let d = 0; d < 7; d++) {
      const fecha = new Date();
      fecha.setDate(fecha.getDate() + d);
      const fechaStr = fecha.toISOString().slice(0, 10);
      for (let h = 9; h <= 17; h++) {
        turnos.push({
          medico_id: MEDICO_TEST_ID,
          fecha: fechaStr,
          hora_inicio: `${h.toString().padStart(2, "0")}:00:00`,
          hora_fin: `${(h + 1).toString().padStart(2, "0")}:00:00`,
          estado: "disponible",
          monto: 5000,
          canal_origen: "clinica_virtual",
        });
      }
    }

    const { error } = await admin.from("turnos").upsert(turnos, {
      onConflict: "medico_id,fecha,hora_inicio",
      ignoreDuplicates: true,
    });

    if (error) {
      console.log(`[sereno-reset] Insertando turnos uno a uno (upsert no disponible)...`);
      let inserted = 0;
      for (const t of turnos) {
        const { error: e } = await admin.from("turnos").insert(t);
        if (!e) inserted++;
      }
      console.log(`[sereno-reset] ${inserted} turnos nuevos creados`);
    } else {
      console.log(`[sereno-reset] Turnos generados para 7 días`);
    }
  }

  console.log("[sereno-reset] Reset completado");
}

reset().catch((err) => {
  console.error("[sereno-reset] Error:", err);
  process.exit(1);
});
