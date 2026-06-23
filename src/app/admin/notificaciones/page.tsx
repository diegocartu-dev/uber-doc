export const dynamic = "force-dynamic";

import { createAdminClient } from "@/lib/supabase/admin";
import NotificacionesComposeClient from "./NotificacionesComposeClient";

// Compose de notificaciones admin → médico. /admin/layout ya gatea isAdmin.
export default async function NotificacionesAdminPage() {
  const admin = createAdminClient();
  const { data: medicos } = await admin
    .from("medicos")
    .select("id, nombre_completo, estado_registro, identidad_validada, biometria_exenta")
    .eq("es_cuenta_test", false)
    .order("nombre_completo", { ascending: true });

  const lista = (medicos ?? []).map((m) => ({
    id: m.id as string,
    nombre: (m.nombre_completo as string) ?? "—",
    estado: (m.estado_registro as string) ?? "",
  }));
  const totalNoValidados = (medicos ?? []).filter(
    (m) => !m.identidad_validada && !m.biometria_exenta
  ).length;

  return (
    <div className="p-6 lg:p-8">
      <h1 className="text-xl font-bold text-gray-900">Notificaciones</h1>
      <p className="mt-1 text-sm text-gray-500">
        Enviá un aviso a la campanita del médico. Llega a cualquier inscripto (pendiente,
        aprobado o rechazado). Es unidireccional: el médico lo lee, no responde.
      </p>
      <div className="mt-6">
        <NotificacionesComposeClient
          medicos={lista}
          totalInscriptos={lista.length}
          totalNoValidados={totalNoValidados}
        />
      </div>
    </div>
  );
}
