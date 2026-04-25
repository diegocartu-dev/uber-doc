export const MEDICO_TEST = {
  email: "medico.test@docto.com.ar",
  password: "DoctoTest2026!",
  nombre: "Dr. Docto Test",
  especialidad: "Clínica Médica",
  slug: "docto-test",
};

export const PACIENTES_TEST = [
  { email: "paciente.test1@docto.com.ar", password: "DoctoTest2026!", perfil: "Normal", dni: "30000001" },
  { email: "paciente.test2@docto.com.ar", password: "DoctoTest2026!", perfil: "Sin obra social", dni: "30000002" },
  { email: "paciente.test3@docto.com.ar", password: "DoctoTest2026!", perfil: "Perfil incompleto", dni: "30000003" },
  { email: "paciente.test4@docto.com.ar", password: "DoctoTest2026!", perfil: "El distraído", dni: "30000004" },
  { email: "paciente.test5@docto.com.ar", password: "DoctoTest2026!", perfil: "La canceladora", dni: "30000005" },
  { email: "paciente.test6@docto.com.ar", password: "DoctoTest2026!", perfil: "La reprogramadora", dni: "30000006" },
  { email: "paciente.test7@docto.com.ar", password: "DoctoTest2026!", perfil: "La del interior", dni: "30000007" },
  { email: "paciente.test8@docto.com.ar", password: "DoctoTest2026!", perfil: "La ansiosa", dni: "30000008" },
  { email: "paciente.test9@docto.com.ar", password: "DoctoTest2026!", perfil: "DNI inválido primero", dni: "30000009" },
  { email: "paciente.test10@docto.com.ar", password: "DoctoTest2026!", perfil: "Mobile Safari", dni: "30000010" },
] as const;

export const PACIENTE_NORMAL = PACIENTES_TEST[0];
export const PACIENTE_INCOMPLETO = PACIENTES_TEST[2];
export const PACIENTE_DNI_INVALIDO = PACIENTES_TEST[8];
