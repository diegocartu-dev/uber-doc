export const dynamic = "force-dynamic";

// /admin/operadores — alta/baja de operadores de la institución (otorgadores
// y admins del panel). Pantalla INTERNA de Docto, SOLO en la instancia
// institucional — en B2C es 404 (la tabla `operadores` ni existe).

import { notFound, redirect } from "next/navigation";
import { esInstitucional } from "@/lib/instancia";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/admin-auth";
import OperadoresClient, { type OperadorFila } from "./OperadoresClient";

export default async function OperadoresPage() {
  if (!esInstitucional()) notFound();

  // Defensa en profundidad: NO depender solo del guard del layout de /admin —
  // en App Router layout y page renderizan en paralelo, y esta page sirve
  // emails de operadores leídos con service role. Mismo patrón que las
  // server actions: el check pegado al dato.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !(await isAdmin(user.id))) redirect("/dashboard");

  const admin = createAdminClient();
  const { data: operadores } = await admin
    .from("operadores")
    .select("id, user_id, nombre, tipo, nivel, activo")
    .order("activo", { ascending: false })
    .order("nombre");

  // Email desde auth.users (patrón /api/admin/administradores). Pocos
  // operadores por instancia: el N+1 no duele.
  const filas: OperadorFila[] = [];
  for (const o of operadores ?? []) {
    let email: string | null = null;
    if (o.user_id) {
      const { data: authUser } = await admin.auth.admin.getUserById(o.user_id);
      email = authUser?.user?.email ?? null;
    }
    filas.push({
      id: o.id,
      nombre: o.nombre,
      tipo: o.tipo,
      nivel: o.nivel,
      activo: o.activo,
      email,
    });
  }

  return <OperadoresClient operadores={filas} />;
}
