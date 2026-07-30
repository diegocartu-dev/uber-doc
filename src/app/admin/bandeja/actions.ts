"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/admin-auth";
import { enviarDesdeBandeja, type DireccionPropia } from "@/lib/correo";

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
}): Promise<{ ok: boolean; error?: string }> {
  const uid = await usuarioAdmin();
  if (!uid) return { ok: false, error: "No autorizado" };

  const para = params.para.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(para)) return { ok: false, error: "Email inválido." };
  if (!params.asunto.trim()) return { ok: false, error: "Falta el asunto." };
  if (!params.cuerpo.trim()) return { ok: false, error: "Falta el mensaje." };

  const r = await enviarDesdeBandeja({
    para,
    asunto: params.asunto.trim(),
    cuerpo: params.cuerpo,
    desde: params.desde === "soporte" ? "soporte" : "contacto",
    enRespuestaA: params.enRespuestaA ?? null,
    enviadoPor: uid,
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
