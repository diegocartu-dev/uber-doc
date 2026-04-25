import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SECRET_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PASSWORD = "DoctoTest2026!";

const MEDICO = {
  email: "medico.test@docto.com.ar",
  nombre: "Dr. Docto Test",
  especialidad: "Clínica Médica",
  slug: "docto-test",
  precio: 10,
  duracion: 30,
};

const PACIENTES = [
  { email: "paciente.test1@docto.com.ar", nombre: "Paciente Test Normal", dni: "30000001", sexo: "femenino", fecha: "1990-05-15" },
  { email: "paciente.test2@docto.com.ar", nombre: "Paciente Test Sin Obra Social", dni: "30000002", sexo: "masculino", fecha: "1985-03-20" },
  { email: "paciente.test3@docto.com.ar", nombre: "Paciente Test Incompleto", dni: "30000003", sexo: "femenino", fecha: null },
  { email: "paciente.test4@docto.com.ar", nombre: "Paciente Test Distraido", dni: "30000004", sexo: "masculino", fecha: "1992-11-08" },
  { email: "paciente.test5@docto.com.ar", nombre: "Paciente Test Canceladora", dni: "30000005", sexo: "femenino", fecha: "1988-07-25" },
  { email: "paciente.test6@docto.com.ar", nombre: "Paciente Test Reprogramadora", dni: "30000006", sexo: "femenino", fecha: "1995-01-12" },
  { email: "paciente.test7@docto.com.ar", nombre: "Paciente Test Interior", dni: "30000007", sexo: "femenino", fecha: "1983-09-30" },
  { email: "paciente.test8@docto.com.ar", nombre: "Paciente Test Ansiosa", dni: "30000008", sexo: "femenino", fecha: "1997-06-18" },
  { email: "paciente.test9@docto.com.ar", nombre: "Paciente Test DNI Invalido", dni: "30000009", sexo: "masculino", fecha: "1991-12-05" },
  { email: "paciente.test10@docto.com.ar", nombre: "Paciente Test Mobile", dni: "30000010", sexo: "femenino", fecha: "1994-04-22" },
];

async function createAuthUser(email) {
  const { data: existingUsers } = await supabase.auth.admin.listUsers();
  const existing = existingUsers?.users?.find((u) => u.email === email);
  if (existing) {
    console.log(`  ↳ Auth user already exists: ${email} (${existing.id})`);
    return existing.id;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: email.includes("medico") ? MEDICO.nombre : "Test" },
  });

  if (error) {
    if (error.message?.includes("already been registered")) {
      const { data: users2 } = await supabase.auth.admin.listUsers();
      const found = users2?.users?.find((u) => u.email === email);
      if (found) return found.id;
    }
    console.error(`  ✗ Error creating auth user ${email}:`, error.message);
    return null;
  }

  console.log(`  ✓ Auth user created: ${email} (${data.user.id})`);
  return data.user.id;
}

async function main() {
  console.log("═══ CREANDO CUENTAS DE PRUEBA ═══\n");

  // --- Médico ---
  console.log("1. Médico de prueba:");
  const medicoUserId = await createAuthUser(MEDICO.email);
  if (!medicoUserId) {
    console.error("No se pudo crear el médico. Abortando.");
    process.exit(1);
  }

  const { error: medicoErr } = await supabase.from("medicos").upsert(
    {
      user_id: medicoUserId,
      nombre_completo: MEDICO.nombre,
      especialidad: MEDICO.especialidad,
      slug: MEDICO.slug,
      precio_consulta: MEDICO.precio,
      duracion_consulta: MEDICO.duracion,
      disponible: true,
      verificado: true,
      estado_registro: "aprobado",
      es_cuenta_test: true,
    },
    { onConflict: "user_id" }
  );

  if (medicoErr) {
    console.error("  ✗ Error insertando médico:", medicoErr.message);
  } else {
    console.log(`  ✓ Médico insertado: ${MEDICO.nombre} (slug: ${MEDICO.slug})`);
  }

  // --- Pacientes ---
  console.log("\n2. Pacientes de prueba:");
  for (let i = 0; i < PACIENTES.length; i++) {
    const p = PACIENTES[i];
    console.log(`\n  [${i + 1}/10] ${p.email}`);

    const userId = await createAuthUser(p.email);
    if (!userId) continue;

    const isIncomplete = i === 2; // paciente.test3 = perfil incompleto

    const { error: pacErr } = await supabase.from("pacientes").upsert(
      {
        user_id: userId,
        nombre_completo: p.nombre,
        email: p.email,
        dni: p.dni,
        sexo_dni: p.sexo,
        fecha_nacimiento: isIncomplete ? null : p.fecha,
        tiene_cobertura: i === 0,
        obra_social: i === 0 ? "OSDE" : null,
        nro_afiliado: i === 0 ? "TEST-001" : null,
        perfil_medico_completado: !isIncomplete,
        es_cuenta_test: true,
      },
      { onConflict: "user_id" }
    );

    if (pacErr) {
      console.error(`  ✗ Error insertando paciente:`, pacErr.message);
    } else {
      console.log(`  ✓ Paciente insertado: ${p.nombre}`);
    }
  }

  console.log("\n═══ LISTO ═══");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
