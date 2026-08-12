export const dynamic = "force-dynamic";

// /admin/institucion — editor de la config de la institución (marca blanca).
// Pantalla INTERNA de Docto (no es marca blanca): la ven solo admins de Docto,
// y SOLO en la instancia institucional — en B2C es 404. El precio por consulta
// es visible únicamente acá (columna comercial sin grant, lectura service role).

import { notFound, redirect } from "next/navigation";
import { esInstitucional } from "@/lib/instancia";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/admin-auth";
import type { ConfigInstitucion } from "@/lib/institucional/config";
import ConfigInstitucionForm from "./ConfigInstitucionForm";

export default async function InstitucionPage() {
  if (!esInstitucional()) notFound();

  // Defensa en profundidad: NO depender solo del guard del layout de /admin —
  // en App Router layout y page renderizan en paralelo, y esta page lee la
  // fila ENTERA con service role (incluye las columnas comerciales). Mismo
  // patrón que las server actions: el check pegado al dato.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !(await isAdmin(user.id))) redirect("/dashboard");

  // Lectura directa (no getConfigInstitucion): esta pantalla tiene que poder
  // abrir con la instancia SIN provisionar — es justamente donde se crea la fila.
  const admin = createAdminClient();
  const { data } = await admin
    .from("institucion_config")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  return <ConfigInstitucionForm inicial={(data as ConfigInstitucion) ?? null} />;
}
