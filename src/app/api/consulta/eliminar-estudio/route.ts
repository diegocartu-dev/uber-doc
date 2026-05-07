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

    const { consultaId, tipo, valor } = (await request.json()) as {
      consultaId: string;
      tipo: "archivo" | "link";
      valor: string; // file path or link entry
    };

    if (!consultaId || !tipo || !valor) {
      return NextResponse.json({ error: "Faltan datos" }, { status: 400 });
    }

    // Verify patient owns consultation
    const { data: consulta } = await supabase
      .from("consultas")
      .select("id, paciente_id, estado, estudios_links")
      .eq("id", consultaId)
      .single();

    if (!consulta || consulta.paciente_id !== user.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    if (!["esperando", "aceptada", "pagada", "en_curso"].includes(consulta.estado)) {
      return NextResponse.json(
        { error: "No se pueden eliminar estudios después de finalizar" },
        { status: 400 }
      );
    }

    if (tipo === "archivo") {
      // Path traversal guard: el path debe empezar con `${consultaId}/`
      // y no contener `..`
      if (!valor.startsWith(`${consultaId}/`) || valor.includes("..")) {
        return NextResponse.json({ error: "Path inválido" }, { status: 400 });
      }

      const admin = createAdminClient();
      const { error: deleteError } = await admin.storage
        .from("consultas-temp")
        .remove([valor]);

      if (deleteError) {
        return NextResponse.json({ error: "Error al eliminar archivo" }, { status: 500 });
      }
    } else {
      // Remove link from array
      const currentLinks: string[] = consulta.estudios_links ?? [];
      const updatedLinks = currentLinks.filter((l) => l !== valor);

      const { error: updateError } = await supabase
        .from("consultas")
        .update({ estudios_links: updatedLinks })
        .eq("id", consultaId);

      if (updateError) {
        return NextResponse.json({ error: "Error al eliminar link" }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
