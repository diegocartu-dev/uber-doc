export const dynamic = "force-dynamic";

// /otorgador — pantalla del OTORGADOR (spec 04). La pantalla real llega en la
// Etapa 2 (contra la API de asignación); esta page es el DESTINO mínimo del
// redirect post-login de rutaOperador(), que existe desde la Etapa 1. Sin
// esto, un operador dado de alta en /admin/operadores aterrizaba en un 404
// sin salida (hallazgo revisión Etapa 1).
// SOLO instancia institucional: en B2C es 404 (mismo gate que /admin/institucion).

import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { esInstitucional } from "@/lib/instancia";
import { resolverOperador } from "@/lib/auth/rol-institucional";
import PantallaEnConstruccion from "@/components/institucional/PantallaEnConstruccion";

export default async function OtorgadorPage() {
  if (!esInstitucional()) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  // Cualquier nivel de operador activo puede otorgar (admin_institucion
  // subsume a otorgador — misma jerarquía que requireOtorgador).
  const operador = await resolverOperador(user.id);
  if (!operador) redirect("/dashboard"); // no-operador: la resolución central lo reencamina

  return (
    <PantallaEnConstruccion
      titulo="Otorgador"
      nombre={operador.nombre}
      detalle="Tu cuenta de operador ya está activa. La pantalla de asignación llega en la próxima etapa: cuando esté lista vas a entrar directo acá con este mismo login."
    />
  );
}
