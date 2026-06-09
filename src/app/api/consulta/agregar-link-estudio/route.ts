import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { consultaId, url, nombre } = (await request.json()) as {
      consultaId: string;
      url: string;
      nombre?: string;
    };

    if (!consultaId || !url) {
      return NextResponse.json({ error: "Faltan datos" }, { status: 400 });
    }

    // Basic URL validation
    try {
      new URL(url);
    } catch {
      return NextResponse.json({ error: "URL inválida" }, { status: 400 });
    }

    // Verify patient owns consultation and it's active (RLS: paciente can SELECT own rows)
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
        { error: "No se pueden agregar links después de finalizar la consulta" },
        { status: 400 }
      );
    }

    // Store as JSON string: "nombre|||url"
    const linkEntry = nombre ? `${nombre}|||${url}` : url;
    const currentLinks: string[] = consulta.estudios_links ?? [];
    const updatedLinks = [...currentLinks, linkEntry];

    // Use admin client: RLS only allows patient UPDATE when estado='esperando',
    // but links can be added during en_curso. Auth already verified above.
    const admin = createAdminClient();
    const { error: updateError } = await admin
      .from("consultas")
      .update({ estudios_links: updatedLinks })
      .eq("id", consultaId);

    if (updateError) {
      return NextResponse.json({ error: "Error al guardar link" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, links: updatedLinks });
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
