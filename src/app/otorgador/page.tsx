export const dynamic = "force-dynamic";

// /otorgador — la pantalla del OTORGADOR (04-spec v2, diseño APROBADO de
// Sofía; mock de referencia exacta: docto-institucional/mocks/01-otorgador.html
// + estados de 01b). Server component: guards + branding; la interacción vive
// en OtorgadorClient contra la API real de asignación (spec §4.3).
// SOLO instancia institucional: en B2C es 404.

import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { esInstitucional } from "@/lib/instancia";
import { resolverOperador } from "@/lib/auth/rol-institucional";
import { getBrandingInstitucion } from "@/lib/institucional/config";
import OtorgadorClient from "./OtorgadorClient";

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

  const branding = await getBrandingInstitucion();

  return (
    <OtorgadorClient
      instNombre={branding.nombre}
      instSubnombre={branding.subnombre}
      operadorNombre={operador.nombre}
      operadorRol={operador.nivel === "admin_institucion" ? "Admin institución" : "Otorgador"}
    />
  );
}
