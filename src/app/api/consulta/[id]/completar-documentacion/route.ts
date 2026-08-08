// POST /api/consulta/[id]/completar-documentacion
//
// Emite la documentación que faltó en una atención YA CERRADA y se la manda al
// paciente. Es el camino de reparación del agujero medido el 08/08/2026: cuatro
// caminos cierran una consulta sin que el médico toque "Finalizar" y ninguno mira
// el borrador, así que hubo atenciones pagadas donde el profesional escribió todo
// y el paciente no recibió nada.
//
// QUÉ HACE: inserta los documentos faltantes con la fecha REAL de hoy, los firma
// por el MISMO camino que el cierre normal (`firmarDocumentoPorSesion`, RSA-SHA256
// + log en firma_logs) y avisa al paciente por push y por mail.
//
// QUÉ NO HACE, nunca:
//   - tocar un documento ya emitido (no update, no delete: lo firmado es inmutable),
//   - emitir dos veces el mismo tipo para la misma atención,
//   - cambiar el estado de la atención (sigue cerrada; no se reabre nada),
//   - antedatar: `created_at` es hoy, y queda marcado `emitido_post_cierre`.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { firmarDocumentoPorSesion, TIPOS_FIRMABLES } from "@/lib/firma/documento";
import { provisionarClaves, tieneClaves } from "@/lib/firma/claves";
import { esControlado } from "@/data/controlados";
import { pushAlPaciente } from "@/lib/push";
import { enviarEmailDocumentacionDisponible } from "@/lib/email";

type Body = {
  tipo?: "consulta" | "turno";
  diagnostico?: string;
  receta?: string;
  indicaciones?: string;
  certificado?: string;
  dias_reposo?: number | null;
  orden?: string;
  evolucion?: string;
  evolucion_editada?: boolean;
};

type DocNuevo = {
  tipo: string;
  contenido: string;
  tratamiento?: string | null;
  dias_reposo?: number | null;
};

const ESTADO_CERRADO = { consulta: "completada", turno: "completado" } as const;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });

  // Solo columnas con GRANT para authenticated (regla de grants en CLAUDE.md).
  const { data: medico } = await supabase
    .from("medicos")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!medico) return NextResponse.json({ ok: false, error: "No es médico" }, { status: 403 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Body inválido" }, { status: 400 });
  }

  const canal: "consulta" | "turno" = body.tipo === "turno" ? "turno" : "consulta";
  const tabla = canal === "turno" ? "turnos" : "consultas";
  const columnaFk = canal === "turno" ? "turno_id" : "consulta_id";

  const admin = createAdminClient();

  // ── Guard 1: el médico de la sesión tiene que ser el que atendió ──────────
  const { data: registro } = await admin
    .from(tabla)
    .select("id, estado, medico_id, paciente_id, evolucion, reintegro_estado")
    .eq("id", id)
    .maybeSingle();

  if (!registro) return NextResponse.json({ ok: false, error: "Atención no encontrada" }, { status: 404 });
  if (registro.medico_id !== medico.id) {
    return NextResponse.json({ ok: false, error: "No atendiste esta consulta" }, { status: 403 });
  }

  // ── Guard 2: solo atenciones CERRADAS ────────────────────────────────────
  // Una atención abierta se documenta por el flujo normal, que además maneja el
  // video y el cierre. Este endpoint es exclusivamente reparación.
  if (registro.estado !== ESTADO_CERRADO[canal]) {
    return NextResponse.json(
      { ok: false, error: "Esta atención todavía no está cerrada. Documentala desde la consulta." },
      { status: 409 }
    );
  }

  // ── Guard 3: nada de canceladas ni reembolsadas ──────────────────────────
  if (registro.reintegro_estado === "reembolsado") {
    return NextResponse.json(
      { ok: false, error: "Esta consulta fue reembolsada: no se puede emitir documentación." },
      { status: 409 }
    );
  }

  // ── Guard 4: el firmante tiene que estar habilitado ──────────────────────
  // A diferencia del cierre normal (donde el documento ya salió y la firma es
  // best-effort), acá la emisión todavía no ocurrió: un médico suspendido o
  // rechazado no estrena documentos nuevos con su matrícula.
  const { data: estadoMedico } = await admin
    .from("medicos")
    .select("estado_registro, refeps_validado, es_cuenta_test")
    .eq("id", medico.id)
    .maybeSingle();

  const habilitado =
    !!estadoMedico &&
    estadoMedico.estado_registro === "aprobado" &&
    (estadoMedico.refeps_validado === true || estadoMedico.es_cuenta_test === true);

  if (!habilitado) {
    return NextResponse.json(
      { ok: false, error: "Tu cuenta no está habilitada para emitir documentación." },
      { status: 403 }
    );
  }

  // ── Datos de la atención ─────────────────────────────────────────────────
  const diagnostico = (body.diagnostico ?? "").trim();
  if (!diagnostico) {
    return NextResponse.json({ ok: false, error: "Falta el diagnóstico." }, { status: 400 });
  }

  const receta = (body.receta ?? "").trim();
  const indicaciones = (body.indicaciones ?? "").trim();
  const certificado = (body.certificado ?? "").trim();
  const orden = (body.orden ?? "").trim();
  const evolucion = (body.evolucion ?? "").trim();
  const diasReposo =
    typeof body.dias_reposo === "number" && Number.isInteger(body.dias_reposo) && body.dias_reposo >= 1
      ? body.dias_reposo
      : null;

  // Certificado de reposo sin días: dato jurídico obligatorio (art. 210 LCT).
  if ((certificado || diasReposo) && !diasReposo) {
    return NextResponse.json(
      { ok: false, error: "El certificado de reposo requiere elegir las horas o los días de reposo." },
      { status: 400 }
    );
  }

  // Sustancias controladas: mismo bloqueo que el borrador (requieren receta con
  // firma digital, que este camino no emite).
  if (receta) {
    for (const palabra of receta.split(/[\s,;.()/\-]+/)) {
      if (palabra.length >= 4 && esControlado(palabra)) {
        return NextResponse.json(
          { ok: false, error: "La receta contiene una sustancia controlada. Requiere receta con firma digital." },
          { status: 422 }
        );
      }
    }
  }

  // pacientes.id (asimetría de schema): en turnos `paciente_id` YA es pacientes.id;
  // en consultas es auth.users.id y hay que resolverlo.
  let pacienteId: string | null = null;
  let pacienteCuil: string | null = null;
  if (canal === "turno") {
    pacienteId = registro.paciente_id ?? null;
    const { data: p } = await admin.from("pacientes").select("cuil").eq("id", pacienteId ?? "").maybeSingle();
    pacienteCuil = p?.cuil ?? null;
  } else {
    const { data: p } = await admin
      .from("pacientes")
      .select("id, cuil")
      .eq("user_id", registro.paciente_id ?? "")
      .maybeSingle();
    pacienteId = p?.id ?? null;
    pacienteCuil = p?.cuil ?? null;
  }

  if (!pacienteId) {
    return NextResponse.json({ ok: false, error: "No se encontró al paciente de esta atención." }, { status: 409 });
  }

  // ── Guard 5: no emitir dos veces lo mismo ────────────────────────────────
  // Lo que ya salió firmado es inmutable: si el tipo ya existe para esta
  // atención, se omite. No hay update ni delete en todo este endpoint.
  const { data: yaEmitidos, error: errorYaEmitidos } = await admin
    .from("documentos")
    .select("tipo")
    .eq(columnaFk, id)
    .in("tipo", [...TIPOS_FIRMABLES]);

  if (errorYaEmitidos) {
    return NextResponse.json(
      { ok: false, error: "No se pudo verificar qué documentos ya tiene esta consulta." },
      { status: 500 }
    );
  }

  const tiposEmitidos = new Set((yaEmitidos ?? []).map((d) => d.tipo));

  const avisos: string[] = [];
  const omitidos: string[] = [];
  const candidatos: DocNuevo[] = [];

  if (receta) {
    // Sin CUIL no hay receta válida (mismo criterio que el cierre normal).
    if (!pacienteCuil) {
      avisos.push("La receta no se emitió: al paciente le falta el CUIL en su perfil.");
    } else {
      candidatos.push({ tipo: "receta", contenido: receta });
    }
  }
  if (indicaciones) candidatos.push({ tipo: "indicaciones", contenido: indicaciones });
  if (certificado || diasReposo) {
    candidatos.push({
      tipo: "certificado",
      contenido: certificado,
      tratamiento: certificado || indicaciones || null,
      dias_reposo: diasReposo,
    });
  }
  if (orden) candidatos.push({ tipo: "orden", contenido: orden });

  // Fallback del cierre normal: sin ningún documento explícito, el diagnóstico
  // igual le llega al paciente como indicaciones.
  if (candidatos.length === 0) {
    candidatos.push({ tipo: "indicaciones", contenido: diagnostico });
  }

  const aEmitir = candidatos.filter((d) => {
    if (tiposEmitidos.has(d.tipo)) {
      omitidos.push(d.tipo);
      return false;
    }
    return true;
  });

  if (aEmitir.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        error:
          omitidos.length > 0
            ? "Esa documentación ya se le entregó al paciente. Un documento firmado no se puede reemplazar."
            : "No hay documentación nueva para emitir.",
        omitidos,
      },
      { status: 409 }
    );
  }

  // ── Emisión ──────────────────────────────────────────────────────────────
  const ahora = new Date().toISOString();

  const filasBase = aEmitir.map((d) => ({
    consulta_id: canal === "turno" ? null : id,
    turno_id: canal === "turno" ? id : null,
    paciente_id: pacienteId,
    medico_id: medico.id,
    tipo: d.tipo,
    diagnostico,
    contenido: d.contenido,
    tratamiento: d.tratamiento ?? null,
    dias_reposo: d.dias_reposo ?? null,
  }));

  // Marca de emisión post-cierre. Si la migración 20260808 todavía no se aplicó,
  // PostgREST rechaza las columnas desconocidas: en ese caso emitimos igual sin la
  // marca. Entregarle el documento al paciente pesa más que la columna de auditoría.
  let insertados: { id: string; tipo: string }[] = [];
  const conMarca = await admin
    .from("documentos")
    .insert(filasBase.map((f) => ({ ...f, emitido_post_cierre: true, emitido_post_cierre_at: ahora })))
    .select("id, tipo");

  if (conMarca.error) {
    console.warn(
      `[completar-documentacion] insert con marca post-cierre falló (${conMarca.error.message}); reintento sin marca`
    );
    const sinMarca = await admin.from("documentos").insert(filasBase).select("id, tipo");
    if (sinMarca.error) {
      console.error("[completar-documentacion] no se pudieron guardar los documentos:", sinMarca.error.message);
      return NextResponse.json(
        { ok: false, error: "No se pudieron guardar los documentos. Probá de nuevo." },
        { status: 500 }
      );
    }
    insertados = sinMarca.data ?? [];
  } else {
    insertados = conMarca.data ?? [];
  }

  if (insertados.length === 0) {
    return NextResponse.json(
      { ok: false, error: "No se pudieron guardar los documentos. Probá de nuevo." },
      { status: 500 }
    );
  }

  // ── Evolución: se completa SOLO si estaba vacía ──────────────────────────
  // El estado de la atención NO se toca: sigue cerrada, con su cierre_origen
  // original. Lo único que se rellena es el hueco que dejó el cierre automático.
  if (evolucion && !(registro.evolucion ?? "").trim()) {
    await admin
      .from(tabla)
      .update({
        evolucion,
        evolucion_validada_at: ahora,
        evolucion_editada: body.evolucion_editada === true,
      })
      .eq("id", id);
  }

  // ── Firma: MISMO camino que el cierre normal ─────────────────────────────
  // `firmarDocumentoPorSesion` es exactamente lo que ejecuta /api/documentos/firmar:
  // RSA-SHA256 con la clave del médico, identidad congelada y log en firma_logs.
  // Si falla, el documento YA está entregado y el PDF lo muestra "sin sello":
  // la firma nunca bloquea ni revierte la entrega.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "no-informada";
  const userAgent = req.headers.get("user-agent") || "no-informado";
  let firmados = 0;
  try {
    if (!(await tieneClaves(medico.id))) await provisionarClaves(medico.id);
    for (const doc of insertados) {
      const r = await firmarDocumentoPorSesion(doc.id, medico.id, { userId: user.id, ip, userAgent });
      if (r.ok) firmados++;
      else console.error(`[completar-documentacion] documento sin firmar: ${r.error}`);
    }
  } catch (err) {
    console.error("[completar-documentacion] fallo general de firma:", err instanceof Error ? err.message : err);
  }

  // ── Aviso al paciente: los canales que ya funcionan ──────────────────────
  // Push (el mismo de "tus documentos ya están disponibles") + mail. Fire-and-forget:
  // un problema de notificación no puede tirar abajo una emisión que ya ocurrió.
  pushAlPaciente(pacienteId, {
    title: "📄 Docto",
    body: "Tu médico agregó documentación de tu consulta. Ya la podés ver.",
    url: "/mis-consultas",
    tag: `docs-${id}`,
  }).catch(() => {});

  enviarEmailDocumentacionDisponible({
    pacienteId,
    medicoId: medico.id,
    tipos: insertados.map((d) => d.tipo),
  }).catch(() => {});

  return NextResponse.json({
    ok: true,
    emitidos: insertados.map((d) => d.tipo),
    firmados,
    omitidos,
    avisos,
  });
}
