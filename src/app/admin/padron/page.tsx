export const dynamic = "force-dynamic";

// /admin/padron — import del padrón de pacientes por CSV (alta provisionada,
// spec institucional §5.1). Pantalla INTERNA de Docto, SOLO en la instancia
// institucional — en B2C es 404 (mismo gate que /admin/operadores).

import { notFound, redirect } from "next/navigation";
import { esInstitucional } from "@/lib/instancia";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/admin-auth";
import PadronClient from "./PadronClient";

export default async function PadronPage() {
  if (!esInstitucional()) notFound();

  // Defensa en profundidad: no depender solo del guard del layout de /admin.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !(await isAdmin(user.id))) redirect("/dashboard");

  // Contexto de la pantalla: tamaño actual del padrón.
  const admin = createAdminClient();
  const { count } = await admin
    .from("pacientes")
    .select("id", { count: "exact", head: true });

  return <PadronClient totalPadron={count ?? 0} />;
}
