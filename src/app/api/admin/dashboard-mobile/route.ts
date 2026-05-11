import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/admin-auth";
import { getAllFlags } from "@/lib/feature-flags";

function getHoyAR(): string {
  const ar = new Date(
    new Date().toLocaleString("en-US", {
      timeZone: "America/Argentina/Buenos_Aires",
    })
  );
  return `${ar.getFullYear()}-${(ar.getMonth() + 1).toString().padStart(2, "0")}-${ar.getDate().toString().padStart(2, "0")}`;
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !(await isAdmin(user.id))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const admin = createAdminClient();
  const hoy = getHoyAR();
  const hace2h = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

  const [
    { count: medicosPendientes },
    { count: alertasPendientes },
    { count: consultasHuerfanas },
    flags,
  ] = await Promise.all([
    admin
      .from("medicos")
      .select("id", { count: "exact", head: true })
      .eq("estado_registro", "pendiente_revision")
      .eq("es_cuenta_test", false),
    admin
      .from("alertas_admin")
      .select("id", { count: "exact", head: true })
      .eq("estado", "pendiente"),
    // Consultas huerfanas: en_curso hace mas de 2h
    admin
      .from("consultas")
      .select("id", { count: "exact", head: true })
      .in("estado", ["aceptada", "pagada", "en_curso"])
      .lt("created_at", hace2h),
    getAllFlags(),
  ]);

  const mp = medicosPendientes ?? 0;
  const ap = alertasPendientes ?? 0;
  const ch = consultasHuerfanas ?? 0;

  // Estado general
  let estado: "verde" | "amarillo" | "rojo" = "verde";
  if (mp > 0 || ap > 0) estado = "amarillo";
  if (ch > 0 || ap > 3) estado = "rojo";

  return NextResponse.json({
    estado,
    pendientes: {
      medicosPendientes: mp,
      alertasPendientes: ap,
      consultasHuerfanas: ch,
      pacientesEsperando: 0, // TODO: implementar cuando exista la logica de sala de espera CI
    },
    flags,
  });
}
