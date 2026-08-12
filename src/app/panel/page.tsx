export const dynamic = "force-dynamic";

// /panel — panel de la INSTITUCIÓN (spec §6.5, Etapa 4). Esta page es el
// DESTINO mínimo del redirect post-login de rutaOperador() para el rol
// admin_institucion, que existe desde la Etapa 1. Sin esto, un admin de la
// institución dado de alta en /admin/operadores aterrizaba en un 404 sin
// salida (hallazgo revisión Etapa 1).
// SOLO instancia institucional: en B2C es 404 (mismo gate que /admin/institucion).

import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { esInstitucional } from "@/lib/instancia";
import { resolverOperador } from "@/lib/auth/rol-institucional";
import PantallaEnConstruccion from "@/components/institucional/PantallaEnConstruccion";

export default async function PanelPage() {
  if (!esInstitucional()) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const operador = await resolverOperador(user.id);
  if (!operador) redirect("/dashboard"); // no-operador: la resolución central lo reencamina
  // El panel es SOLO para admin_institucion; un otorgador va a su pantalla.
  if (operador.nivel !== "admin_institucion") redirect("/otorgador");

  return (
    <PantallaEnConstruccion
      titulo="Panel de la institución"
      nombre={operador.nombre}
      detalle="Tu cuenta de administración ya está activa. El panel (resumen semanal, consultas, facturación) llega en una etapa posterior: cuando esté listo vas a entrar directo acá con este mismo login."
    />
  );
}
