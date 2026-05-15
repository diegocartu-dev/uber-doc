import { generarRecetaPDF } from "../src/lib/pdf/receta";
import fs from "fs";

const base = {
  id: "12345678-abcd-1234-efgh-123456789012",
  tipo: "receta" as const,
  diagnostico: "Infección urinaria baja",
  contenido:
    "1. AMOXICILINA (Amoxidal)\n   Forma farmacéutica: Comprimidos\n   Presentación: 500 mg comp. x 21\n\n2. IBUPROFENO (Ibupirac)\n   Forma farmacéutica: Comprimidos\n   Presentación: 400 mg comp. x 10",
  created_at: "2026-05-14T15:30:00Z",
  medico_nombre: "Juan Carlos Pérez",
  medico_especialidad: "Medicina General",
  medico_matricula: "MN 12345",
  medico_domicilio: "Av. Corrientes 1234, CABA",
  paciente_nombre: "María Soledad García López",
  paciente_dni: "30123456",
  paciente_cuil: "27-30123456-3",
  paciente_sexo_dni: "femenino",
  paciente_fecha_nacimiento: "1990-03-15",
};

const dir = "/Users/diegogonzales/Downloads/recetas-test";

async function main() {
  fs.mkdirSync(dir, { recursive: true });

  const doc1 = { ...base, paciente_tiene_cobertura: true, paciente_obra_social: "OSDE", paciente_nro_afiliado: "12345678-01", paciente_plan_obra_social: "Plan 210" };
  const buf1 = await generarRecetaPDF(doc1);
  fs.writeFileSync(`${dir}/receta-ooss-plan.pdf`, buf1);
  console.log("1. OOSS+Plan:", buf1.length, "bytes");

  const doc2 = { ...base, id: "22345678-abcd-1234-efgh-123456789012", paciente_tiene_cobertura: true, paciente_obra_social: "OSECAC", paciente_nro_afiliado: "99887766", paciente_plan_obra_social: null };
  const buf2 = await generarRecetaPDF(doc2);
  fs.writeFileSync(`${dir}/receta-ooss-sin-plan.pdf`, buf2);
  console.log("2. OOSS sin plan:", buf2.length, "bytes");

  const doc3 = { ...base, id: "32345678-abcd-1234-efgh-123456789012", paciente_tiene_cobertura: false, paciente_obra_social: null, paciente_nro_afiliado: null, paciente_plan_obra_social: null };
  const buf3 = await generarRecetaPDF(doc3);
  fs.writeFileSync(`${dir}/receta-particular.pdf`, buf3);
  console.log("3. Particular:", buf3.length, "bytes");

  for (const f of ["receta-ooss-plan.pdf", "receta-ooss-sin-plan.pdf", "receta-particular.pdf"]) {
    console.log(require("child_process").execSync(`file ${dir}/${f}`).toString().trim());
  }
}

main().catch(console.error);
