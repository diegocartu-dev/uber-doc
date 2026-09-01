"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/admin-auth";
import { enviarDesdeBandeja, type AdjuntoSalida, type DireccionPropia } from "@/lib/correo";

// Tope del lado servidor. El body de una server action de Vercel muere ~4,5 MB
// y base64 infla ~33%: 3 MB de archivos son ~4 MB de payload, que entra con
// margen. El navegador ya comprime las imágenes antes de llegar acá; esto es la
// red de contención para lo que no sea imagen o para un compresor que falle.
const MAX_ADJUNTOS = 3;
const MAX_BYTES_TOTAL = 3 * 1024 * 1024;

// Guard propio de cada action (defensa en profundidad además del layout).
async function usuarioAdmin(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !(await isAdmin(user.id))) return null;
  return user.id;
}

export async function enviarCorreo(params: {
  para: string;
  asunto: string;
  cuerpo: string;
  desde?: DireccionPropia;
  enRespuestaA?: string | null;
  adjuntos?: AdjuntoSalida[];
}): Promise<{ ok: boolean; error?: string }> {
  const uid = await usuarioAdmin();
  if (!uid) return { ok: false, error: "No autorizado" };

  const para = params.para.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(para)) return { ok: false, error: "Email inválido." };
  if (!params.asunto.trim()) return { ok: false, error: "Falta el asunto." };
  if (!params.cuerpo.trim()) return { ok: false, error: "Falta el mensaje." };

  const adjuntos = params.adjuntos ?? [];
  if (adjuntos.length > MAX_ADJUNTOS) {
    return { ok: false, error: `Máximo ${MAX_ADJUNTOS} archivos por respuesta.` };
  }
  // base64 → bytes reales: 4 caracteres representan 3 bytes.
  const bytes = adjuntos.reduce((t, a) => t + Math.floor((a.contenidoBase64.length * 3) / 4), 0);
  if (bytes > MAX_BYTES_TOTAL) {
    return { ok: false, error: "Los archivos pesan demasiado. Probá con una imagen más chica." };
  }
  if (adjuntos.some((a) => !a.nombre.trim() || !a.contenidoBase64)) {
    return { ok: false, error: "Un archivo quedó incompleto. Volvé a adjuntarlo." };
  }

  const r = await enviarDesdeBandeja({
    para,
    asunto: params.asunto.trim(),
    cuerpo: params.cuerpo,
    desde: params.desde === "soporte" ? "soporte" : "contacto",
    enRespuestaA: params.enRespuestaA ?? null,
    enviadoPor: uid,
    adjuntos,
  });
  revalidatePath("/admin/bandeja");
  if (params.enRespuestaA) revalidatePath(`/admin/bandeja/${params.enRespuestaA}`);
  return r;
}

export async function marcarAtendido(correoId: string, atendido: boolean): Promise<{ ok: boolean }> {
  const uid = await usuarioAdmin();
  if (!uid) return { ok: false };
  const admin = createAdminClient();
  await admin.from("correos").update({ atendido }).eq("id", correoId);
  revalidatePath("/admin/bandeja");
  revalidatePath(`/admin/bandeja/${correoId}`);
  return { ok: true };
}
