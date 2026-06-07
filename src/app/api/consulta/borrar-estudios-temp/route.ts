import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { consultaId, tipo = "consulta" } = (await request.json()) as {
      consultaId: string;
      tipo?: "consulta" | "turno";
    };
    if (!consultaId) {
      return NextResponse.json({ error: "Falta consultaId" }, { status: 400 });
    }

    // Canal: turnos usa estado "completado" y NO tiene columna estudios_links.
    const esTurno = tipo === "turno";
    const tabla = esTurno ? "turnos" : "consultas";
    const estadoCompletado = esTurno ? "completado" : "completada";

    // Verify caller is the doctor of this consultation
    const { data: medico } = await supabase
      .from("medicos")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!medico) {
      return NextResponse.json({ error: "No es médico" }, { status: 403 });
    }

    const { data: registro } = await supabase
      .from(tabla)
      .select("id, medico_id, estado")
      .eq("id", consultaId)
      .single();

    if (!registro || registro.medico_id !== medico.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    if (registro.estado !== estadoCompletado) {
      return NextResponse.json(
        { error: "Solo se puede limpiar registros completados" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    // List all files in the folder (bucket compartido, folder por id de registro)
    const { data: files } = await admin.storage
      .from("consultas-temp")
      .list(consultaId);

    if (files && files.length > 0) {
      const paths = files.map((f) => `${consultaId}/${f.name}`);
      await admin.storage.from("consultas-temp").remove(paths);
    }

    // Clear estudios_links array — solo consultas tiene esa columna.
    if (!esTurno) {
      await admin
        .from("consultas")
        .update({ estudios_links: [] })
        .eq("id", consultaId);
    }

    return NextResponse.json({ ok: true, borrados: files?.length ?? 0 });
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
