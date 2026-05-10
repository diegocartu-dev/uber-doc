import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/admin-auth";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !(await isAdmin(user.id))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: dniDups, error } = await admin.rpc(
    "detectar_dnis_duplicados"
  );

  if (error) {
    return NextResponse.json(
      { error: "Error detectando duplicados" },
      { status: 500 }
    );
  }

  return NextResponse.json({ duplicados: dniDups || [] });
}
