export const dynamic = "force-dynamic";

import { createAdminClient } from "@/lib/supabase/admin";
import PacientesClient from "./PacientesClient";

export default async function AdminPacientesPage() {
  const admin = createAdminClient();

  const { data: pacientes, count } = await admin
    .from("pacientes")
    .select("id, user_id, nombre_completo, email, dni, fecha_nacimiento, obra_social, estado_cuenta, motivo_estado, estado_hasta, created_at", { count: "exact" })
    .eq("es_cuenta_test", false)
    .order("created_at", { ascending: false })
    // Se traen TODOS (con techo de seguridad), no una página de 50: el buscador, el orden
    // y el embudo de la vista de tabla trabajan sobre lo que el navegador tiene. Con 50
    // filas cargadas, buscar un paciente que está en la página 3 devolvía "no encontrado"
    // — el buscador mentía. Hoy son ~400 filas / 75 kB: nada para el navegador.
    // DEUDA: pasadas unas pocas miles de filas hay que volver a paginar del lado del
    // servidor y llevar la búsqueda y el filtro con ella.
    .range(0, 4999);

  return (
    <PacientesClient
      pacientes={pacientes ?? []}
      totalInicial={count ?? 0}
    />
  );
}
