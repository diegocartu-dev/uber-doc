/**
 * Script temporal para generar PDF de prueba con RL aprobado.
 * Ejecutar: RENAPDIS_RL_NUMBER="RL-2026-48984072-APN-SSVEIYES#MS" npx tsx scripts/test-pdf-renapdis.ts
 */
import { generarRecetaPDF, DocumentoPDF } from "../src/lib/pdf/receta";
import { writeFileSync } from "fs";

const testDoc: DocumentoPDF = {
  id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  tipo: "receta",
  diagnostico: "Faringitis aguda (J02.9)",
  contenido: "1. AMOXICILINA 500 mg\nForma farmacéutica: Comprimidos\nPresentación: 500 mg comp. x 21\n\n2. IBUPROFENO 400 mg\nForma farmacéutica: Comprimidos\nPresentación: 400 mg comp. x 20",
  created_at: new Date().toISOString(),
  medico_nombre: "Juan Carlos Pérez",
  medico_especialidad: "Cardiología",
  medico_matricula: "MN 48.221",
  medico_domicilio: "Av. Corrientes 1234, CABA",
  paciente_nombre: "María Fernanda López",
  paciente_dni: "28.456.789",
  paciente_cuil: "27-28456789-4",
  paciente_sexo_dni: "femenino",
  paciente_fecha_nacimiento: "1980-03-15",
  paciente_tiene_cobertura: true,
  paciente_obra_social: "OSDE",
  paciente_nro_afiliado: "12345678-01",
  paciente_plan_obra_social: "210",
};

async function main() {
  console.log("Generando PDF con RENAPDIS_RL_NUMBER:", process.env.RENAPDIS_RL_NUMBER);
  const buffer = await generarRecetaPDF(testDoc);
  const outPath = "/tmp/receta-renapdis-rl-test.pdf";
  writeFileSync(outPath, buffer);
  console.log(`PDF generado: ${outPath}`);
}

main().catch(console.error);
