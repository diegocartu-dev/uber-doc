import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/admin-auth";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !(await isAdmin(user.id))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const limit = parseInt(
    req.nextUrl.searchParams.get("limit") || "20",
    10
  );
  const recursoTipo = req.nextUrl.searchParams.get("recursoTipo");
  const recursoId = req.nextUrl.searchParams.get("recursoId");

  const admin = createAdminClient();

  let query = admin
    .from("admin_audit_log")
    .select("id, accion, recurso_tipo, recurso_id, motivo, desde_mobile, creado_en, admin_user_id")
    .order("creado_en", { ascending: false })
    .limit(limit);

  if (recursoTipo) {
    query = query.eq("recurso_tipo", recursoTipo);
  }
  if (recursoId) {
    query = query.eq("recurso_id", recursoId);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Enriquecer con email del admin
  const adminIds = [...new Set((data ?? []).map((d) => d.admin_user_id))];
  const adminEmails = new Map<string, string>();

  if (adminIds.length > 0) {
    const { data: admins } = await admin
      .from("admin_users")
      .select("id, user_id")
      .in("id", adminIds);

    for (const a of admins ?? []) {
      const { data: authUser } = await admin.auth.admin.getUserById(
        a.user_id
      );
      adminEmails.set(a.id, authUser?.user?.email ?? "—");
    }
  }

  const enriched = (data ?? []).map((entry) => ({
    ...entry,
    admin_email: adminEmails.get(entry.admin_user_id) ?? "—",
  }));

  return NextResponse.json({ entries: enriched });
}
