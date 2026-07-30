export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import DetalleCorreoClient from "./DetalleCorreoClient";
import { direccionPropiaDe } from "@/lib/correo";

// Detalle de un correo. Abrirlo lo marca leído. /admin/layout ya gatea isAdmin.
// SEGURIDAD: el HTML recibido NUNCA se renderiza — texto plano o HTML desetiquetado.
function desetiquetar(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export default async function DetalleCorreoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = createAdminClient();

  const { data: c } = await admin.from("correos").select("*").eq("id", id).maybeSingle();
  if (!c) notFound();

  if (!c.leido) {
    await admin.from("correos").update({ leido: true }).eq("id", id);
  }

  const { data: respuestas } = await admin
    .from("correos")
    .select("id, creado_en, asunto, direccion, error_envio")
    .eq("en_respuesta_a", id)
    .order("creado_en", { ascending: true });

  const cuerpo =
    (c.cuerpo_texto as string | null)?.trim() ||
    (c.cuerpo_html ? desetiquetar(c.cuerpo_html as string) : "") ||
    "(sin cuerpo — solo llegaron los metadatos)";

  const adjuntos = Array.isArray(c.adjuntos)
    ? (c.adjuntos as { filename?: string; name?: string }[]).map((a) => a.filename ?? a.name ?? "adjunto").filter(Boolean)
    : [];

  return (
    <DetalleCorreoClient
      correo={{
        id: c.id as string,
        creadoEn: c.creado_en as string,
        direccion: c.direccion as "entrada" | "salida",
        de: (c.de as string) ?? "",
        para: (c.para as string) ?? "",
        asunto: (c.asunto as string) ?? "(sin asunto)",
        cuerpo,
        atendido: !!c.atendido,
        errorEnvio: (c.error_envio as string) ?? null,
        adjuntos,
        responderDesde: direccionPropiaDe(c.para as string | null),
      }}
      respuestas={(respuestas ?? []).map((r) => ({
        id: r.id as string,
        creadoEn: r.creado_en as string,
        asunto: (r.asunto as string) ?? "",
        errorEnvio: (r.error_envio as string) ?? null,
      }))}
    />
  );
}
