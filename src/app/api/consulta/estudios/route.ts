import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const SIGNED_URL_EXPIRY = 4 * 60 * 60; // 4 hours

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const consultaId = request.nextUrl.searchParams.get("consultaId");
    if (!consultaId) {
      return NextResponse.json({ error: "Falta consultaId" }, { status: 400 });
    }

    // Check if user is the patient or the assigned doctor
    const { data: consulta } = await supabase
      .from("consultas")
      .select("id, paciente_id, medico_id, estudios_links")
      .eq("id", consultaId)
      .single();

    if (!consulta) {
      return NextResponse.json({ error: "Consulta no encontrada" }, { status: 404 });
    }

    // Check if user is the doctor
    const { data: medico } = await supabase
      .from("medicos")
      .select("id")
      .eq("user_id", user.id)
      .single();

    const isDoctor = medico && consulta.medico_id === medico.id;
    const isPatient = consulta.paciente_id === user.id;

    if (!isDoctor && !isPatient) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    // List files in bucket
    const admin = createAdminClient();
    const { data: files } = await admin.storage
      .from("consultas-temp")
      .list(consultaId);

    const archivos = [];
    for (const f of files ?? []) {
      if (f.name === ".emptyFolderPlaceholder") continue;
      const filePath = `${consultaId}/${f.name}`;
      const { data: signedUrlData } = await admin.storage
        .from("consultas-temp")
        .createSignedUrl(filePath, SIGNED_URL_EXPIRY);

      archivos.push({
        name: f.name.replace(/^\d+_/, ""), // Remove timestamp prefix
        path: filePath,
        size: f.metadata?.size ?? 0,
        type: f.metadata?.mimetype ?? "",
        uploadedAt: f.created_at,
        signedUrl: signedUrlData?.signedUrl ?? null,
      });
    }

    // Parse links
    const links = (consulta.estudios_links ?? []).map((entry: string) => {
      if (entry.includes("|||")) {
        const [nombre, url] = entry.split("|||");
        return { nombre, url };
      }
      return { nombre: "", url: entry };
    });

    return NextResponse.json({ ok: true, archivos, links });
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
