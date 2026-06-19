// Completitud del perfil del médico — single source of truth.
//
// Define qué datos (los que dependen del médico) deben estar cargados para que
// pueda ATENDER. Lo usan el gate del toggle "disponible" (cliente + servidor) y
// el banner permanente del dashboard. Antes esto dependía del flag DB
// `perfil_completo`, que quedaba desactualizado (true aunque faltaran datos) →
// el médico podía ponerse disponible sin el perfil completo. Ahora se calcula
// SIEMPRE desde los campos reales.

export type MedicoCompletitud = {
  nombre_completo?: string | null;
  especialidad?: string | null;
  tipo_matricula?: string | null;
  numero_matricula?: string | null;
  telefono?: string | null;
  domicilio_consultorio?: string | null;
  foto_url?: string | null;
  es_cuenta_test?: boolean | null;
};

// Onboarding operativo que NO vive en la fila de `medicos` (decisión Diego
// 18/06/2026): sin Mercado Pago no puede cobrar y sin firma electrónica no puede
// emitir recetas → no debe poder ponerse disponible. Estos dos los computa el
// caller desde sus tablas: MP = `medicos_mp_accounts` (estado='activo'),
// firma = existencia de fila en `medico_claves`.
export type OnboardingMedico = {
  mpConectado: boolean;
  firmaConfigurada: boolean;
};

export type CampoMedicoFaltante = { label: string; anchor: string };

const lleno = (v?: string | null) => typeof v === "string" && v.trim().length > 0;

/**
 * Campos requeridos para atender que el médico aún no completó.
 * Vacío = perfil completo. El `anchor` apunta a la sección de /medico/perfil.
 */
export function camposFaltantesMedico(m: MedicoCompletitud, onb: OnboardingMedico): CampoMedicoFaltante[] {
  const faltantes: CampoMedicoFaltante[] = [];
  if (!lleno(m.nombre_completo)) faltantes.push({ label: "Nombre completo", anchor: "nombre" });
  if (!lleno(m.especialidad)) faltantes.push({ label: "Especialidad", anchor: "especialidad" });
  if (!lleno(m.tipo_matricula) || !lleno(m.numero_matricula))
    faltantes.push({ label: "Matrícula", anchor: "matricula" });
  if (!lleno(m.telefono)) faltantes.push({ label: "Teléfono profesional", anchor: "telefono" });
  if (!lleno(m.domicilio_consultorio))
    faltantes.push({ label: "Domicilio del consultorio", anchor: "domicilio" });
  if (!lleno(m.foto_url)) faltantes.push({ label: "Foto de perfil", anchor: "foto" });
  if (!onb.mpConectado) faltantes.push({ label: "Cobros (Mercado Pago)", anchor: "cobros" });
  if (!onb.firmaConfigurada) faltantes.push({ label: "Firma electrónica", anchor: "firma" });
  return faltantes;
}

/**
 * ¿El médico tiene el 100% de los datos que dependen de él para atender?
 * Las cuentas de test quedan exentas (infra interna), igual que el gate REFEPS.
 */
export function perfilMedicoCompleto(m: MedicoCompletitud, onb: OnboardingMedico): boolean {
  if (m.es_cuenta_test) return true;
  return camposFaltantesMedico(m, onb).length === 0;
}
