import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { emitirConstanciaDelTurno, textoMotivoSinConstancia } from "@/lib/documentos/emitir-constancia";
import { firmarDocumentoPorSesion } from "@/lib/firma/documento";
import { provisionarClaves, tieneClaves } from "@/lib/firma/claves";
import { sendDoctoAlert } from "@/lib/alertas";

// Motivos que el profesional tiene que saber: tildó la casilla y la constancia
// no salió. Los demás (ya emitida, turno ajeno, sesión sin cerrar) no son
// novedad para él o ya tienen su propio aviso.
const MOTIVOS_PARA_AVISAR = new Set(["paciente_no_entro", "sin_datos_de_presencia", "faltan_datos", "reembolsado", "no_habilitado", "error"]);

// Constancia de atención de un turno de psicología (13/10/2026). La pide el
// espacio de trabajo al finalizar, si el profesional dejó la casilla tildada.
// Todo se decide acá: que el profesional sea el del turno y psicólogo, que el
// paciente haya entrado a la sesión, el texto y que no esté emitida. La firma
// es la misma que la del resto de los documentos y nunca frena la entrega.
export async function POST(req: NextRequest, { params }: { params: Promise<{ turnoId: string }> }) {
  const { turnoId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Tu sesión venció." }, { status: 401 });

  const admin = createAdminClient();
  const { data: medico } = await admin.from("medicos").select("id").eq("user_id", user.id).maybeSingle();
  if (!medico) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 403 });

  const r = await emitirConstanciaDelTurno(admin, { turnoId, medicoId: medico.id });
  if (!r.ok) {
    // El cierre ya pasó y el profesional está en su panel: el aviso queda en su
    // bandeja (el cierre normal solo lo veía en la consola del navegador).
    if (MOTIVOS_PARA_AVISAR.has(r.motivo)) {
      const { error: errMsj } = await admin.from("mensajes_internos_medicos").insert({
        medico_id: medico.id,
        titulo: "La constancia de atención no se emitió",
        cuerpo: textoMotivoSinConstancia(r.motivo),
        severidad: r.motivo === "paciente_no_entro" ? "info" : "media",
      });
      if (errMsj) console.error("[constancia] no se pudo dejar el aviso al profesional:", errMsj.message);
    }
    if (r.motivo === "error") {
      await sendDoctoAlert(
        "⚠️ Una constancia de atención no se pudo emitir",
        `Un profesional de psicología pidió la constancia de una sesión y falló la emisión (error de base). Turno: ${turnoId}.\n\nQUÉ HACER: revisar los logs de /api/turno/[turnoId]/constancia.`
      ).catch(() => {});
    }
    const status = r.motivo === "turno_ajeno" || r.motivo === "no_es_psicologia" ? 403 : 200;
    return NextResponse.json({ ok: false, motivo: r.motivo, error: textoMotivoSinConstancia(r.motivo) }, { status });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "no-informada";
  const userAgent = req.headers.get("user-agent") || "no-informado";
  let firmada = false;
  try {
    if (!(await tieneClaves(medico.id))) await provisionarClaves(medico.id);
    const f = await firmarDocumentoPorSesion(r.documentoId, medico.id, { userId: user.id, ip, userAgent });
    firmada = f.ok;
    if (!f.ok) console.error("[constancia] quedó sin firmar:", f.error);
  } catch (err) {
    console.error("[constancia] fallo de firma:", err instanceof Error ? err.message : err);
  }
  return NextResponse.json({ ok: true, documentoId: r.documentoId, firmada });
}
