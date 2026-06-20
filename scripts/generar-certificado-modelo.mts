// Genera un CERTIFICADO DE REPOSO LABORAL modelo en PDF para revisión.
// Correr: npx tsx scripts/generar-certificado-modelo.mts
// Datos ficticios — sirve para validar estructura, bloques y leyendas (no es real).

import { writeFileSync } from "node:fs";
import { generarRecetaPDF, type DocumentoPDF } from "../src/lib/pdf/receta";

const doc: DocumentoPDF = {
  id: "00000000-0000-0000-0000-000000000abc",
  tipo: "certificado",
  diagnostico: "Lumbalgia aguda mecánica.",
  contenido: "",
  tratamiento:
    "Reposo relativo. Ibuprofeno 400 mg cada 8 horas por 3 días. Calor local en zona lumbar. Control si los síntomas persisten o empeoran.",
  dias_reposo: 3,
  created_at: new Date().toISOString(),
  medico_nombre: "Pablo Cogliandro",
  medico_especialidad: "Clínica médica",
  medico_matricula: "MN 138169",
  medico_domicilio: "Av. Corrientes 1111 - PB, CABA",
  paciente_nombre: "Juan Pérez",
  paciente_dni: "30.123.456",
  paciente_cuil: "20-30123456-3",
  paciente_sexo_dni: "masculino",
  paciente_fecha_nacimiento: "1985-04-12",
  paciente_tiene_cobertura: true,
  paciente_obra_social: "OSDE",
  paciente_nro_afiliado: "61234567801",
  paciente_plan_obra_social: "210",
  firma: null,
  medico_firma_manuscrita_path: null,
};

const buf = await generarRecetaPDF(doc);
const out = "/Users/diegogonzales/Downloads/certificado-modelo.pdf";
writeFileSync(out, buf);
console.log(`OK — ${out} (${buf.length} bytes)`);
