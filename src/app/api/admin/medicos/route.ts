import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verificarAdmin, getAdminUser } from "@/lib/admin-auth";
import { logAdminAction, ADMIN_ACTIONS } from "@/lib/admin-audit";
import { validarMedicoREFEPS } from "@/lib/refeps/validar";
import { enviarEmailMedicoAprobado } from "@/lib/email";
import { camposFaltantesMedico } from "@/lib/perfil-medico";
import { derivarJurisdicciones } from "@/lib/jurisdicciones";

// Diagnóstico + robustez (15/06/2026): el gate REFEPS al aprobar se colgaba desde
// Vercel y la función moría sin completar (refeps_validado_at quedaba null).
// maxDuration evita la muerte por timeout corto; los logs [aprobar/refeps] +
// [refeps/token] + [refeps/buscar] muestran dónde y cuánto tarda la validación.
export const maxDuration = 60;

/**
 * Gate de seguridad regulatoria: un médico REAL no puede quedar `aprobado` sin
 * validación REFEPS activa, JAMÁS. Si ya está validado, pasa. Si no, valida
 * contra el Bus REFEPS en el momento y solo deja aprobar si la matrícula figura
 * ENCONTRADA y ACTIVA en el registro oficial. Las cuentas de test
 * (`es_cuenta_test`) quedan exentas (infra interna de pruebas).
 *
 * Se usa en `aprobar` y `reactivar` (ambas dejan al médico en `aprobado`).
 * Backstop a nivel DB: constraint `medicos_aprobado_requiere_refeps`.
 */
async function asegurarRefepsParaAprobar(
  admin: ReturnType<typeof createAdminClient>,
  medicoId: string
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const { data: medico } = await admin
    .from("medicos")
    .select("dni, refeps_validado, es_cuenta_test")
    .eq("id", medicoId)
    .single();

  if (!medico) return { ok: false, error: "Médico no encontrado", status: 404 };
  if (medico.es_cuenta_test) return { ok: true };
  if (medico.refeps_validado === true) return { ok: true };

  if (!medico.dni) {
    return {
      ok: false,
      error:
        "No se puede aprobar: el médico no tiene DNI cargado para validar contra REFEPS.",
      status: 422,
    };
  }

  console.log(`[aprobar/refeps] validando médico ${medicoId} (DNI ${medico.dni})…`);
  const _tRefeps = Date.now();
  const resultado = await validarMedicoREFEPS(medico.dni);
  console.log(`[aprobar/refeps] resultado en ${Date.now() - _tRefeps}ms — encontrado=${resultado.encontrado} activo=${resultado.activo} error=${resultado.error ?? "-"}`);
  // Strippear `raw` (FHIR completo con datos personales) antes de persistir.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { raw: _raw, ...resultadoSinRaw } = resultado;
  const ahora = new Date().toISOString();

  // Errores de SISTEMA (el Bus del Ministerio no respondió) NO son "no figura en REFEPS":
  // son transitorios. Un timeout devuelve encontrado=false igual que un no-encontrado real,
  // pero significan cosas distintas. NO persistir un falso negativo ni bloquear como
  // no-encontrado — dejar refeps_validado como estaba y pedir reintento. (El médico puede
  // estar perfectamente registrado; solo el Bus estaba lento/caído.)
  const ERRORES_SISTEMA = new Set(["REFEPS_TIMEOUT", "REFEPS_AUTH_ERROR", "REFEPS_ERROR_INTERNO"]);
  if (!resultado.encontrado && resultado.error && ERRORES_SISTEMA.has(resultado.error)) {
    // Solo dejamos rastro del intento (refeps_data) para diagnóstico; NO tocamos refeps_validado.
    await admin.from("medicos").update({ refeps_data: resultadoSinRaw }).eq("id", medicoId);
    return {
      ok: false,
      error:
        "No pudimos verificar REFEPS en este momento: el registro del Ministerio no respondió. Reintentá en unos minutos (el dato del médico puede estar perfecto).",
      status: 503,
    };
  }

  if (resultado.encontrado && resultado.activo) {
    // Alcance del médico para el ruteo por jurisdicción (Regla A): las provincias de sus
    // matrículas HABILITADAS, derivadas de REFEPS. Solo se persiste si viene con contenido,
    // para no pisar con vacío un set ya válido (fail-safe). Si viene vacío se loguea.
    const { jurisdicciones, sinResolver } = derivarJurisdicciones(resultado.matriculas);
    if (jurisdicciones.length === 0) {
      console.warn(`[aprobar/refeps] médico ${medicoId} sin jurisdicción canónica derivable (sinResolver=${JSON.stringify(sinResolver)})`);
    }
    await admin
      .from("medicos")
      .update({
        refeps_validado: true,
        refeps_data: resultadoSinRaw,
        refeps_validado_at: ahora,
        ...(jurisdicciones.length ? { jurisdicciones } : {}),
      })
      .eq("id", medicoId);
    return { ok: true };
  }

  // Validación fallida: persistir el intento y BLOQUEAR la aprobación.
  await admin
    .from("medicos")
    .update({
      refeps_validado: false,
      refeps_data: resultadoSinRaw,
      refeps_validado_at: ahora,
    })
    .eq("id", medicoId);

  const detalle = !resultado.encontrado
    ? "la matrícula/DNI no figura en REFEPS"
    : "la matrícula figura INACTIVA en REFEPS";
  return {
    ok: false,
    error: `No se puede aprobar: ${detalle}. Verificá los datos del médico (DNI/matrícula) antes de aprobar.`,
    status: 422,
  };
}

export async function GET(req: NextRequest) {
  const user = await verificarAdmin();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const estado = req.nextUrl.searchParams.get("estado");
  const admin = createAdminClient();

  let query = admin
    .from("medicos")
    .select("id, nombre_completo, email, dni, tipo_matricula, numero_matricula, provincia_matricula, especialidad, foto_credencial_url, estado_registro, created_at, cuit, user_id, domicilio, verificado, verificado_at, verificado_por, disponible, notas_admin, slug, categoria, refeps_validado, refeps_data, refeps_validado_at, identidad_validada, identidad_validada_at, didit_status, telefono, celular_personal, domicilio_consultorio, foto_url, firma_manuscrita_url")
    .eq("es_cuenta_test", false)
    .order("created_at", { ascending: true });

  if (estado) {
    query = query.eq("estado_registro", estado);
  }

  const { data: medicos, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Estado de onboarding por médico: qué requisitos le faltan para poder ATENDER.
  // Mismo cálculo que el gate de "disponible" (campos de la fila + MP activo + firma
  // electrónica). Permite al admin ver de un vistazo quién está listo y a quién empujar.
  const ids = (medicos ?? []).map((m) => m.id);
  const [mpRes, firmaRes] = await Promise.all([
    ids.length
      ? admin.from("medicos_mp_accounts").select("medico_id").eq("estado", "activo").in("medico_id", ids)
      : Promise.resolve({ data: [] as { medico_id: string }[] }),
    ids.length
      ? admin.from("medico_claves").select("medico_id").in("medico_id", ids)
      : Promise.resolve({ data: [] as { medico_id: string }[] }),
  ]);
  const mpSet = new Set((mpRes.data ?? []).map((r) => r.medico_id));
  const firmaSet = new Set((firmaRes.data ?? []).map((r) => r.medico_id));

  // Total de requisitos (calculado del mismo source of truth, no hardcodeado).
  const totalRequisitos = camposFaltantesMedico(
    {}, { mpConectado: false, firmaConfigurada: false }
  ).length;
  // Los 3 operativos que de verdad bloquean atender (sin cobrar / firmar / avisar).
  const CRITICOS: Record<string, string> = {
    "Cobros (Mercado Pago)": "Mercado Pago",
    "Firma electrónica": "Firma electrónica",
    "Celular personal": "Celular",
  };

  const enriquecidos = (medicos ?? []).map((m) => {
    const onb = { mpConectado: mpSet.has(m.id), firmaConfigurada: firmaSet.has(m.id) };
    const faltantes = camposFaltantesMedico(m, onb).map((c) => c.label);
    const criticosFaltantes = faltantes.filter((l) => l in CRITICOS).map((l) => CRITICOS[l]);
    return {
      ...m,
      faltantes,                                   // lista completa (tooltip)
      faltantesCount: faltantes.length,
      totalRequisitos,
      criticosFaltantes,                           // subset operativo (chip)
      sinEmpezar: faltantes.length >= totalRequisitos - 1, // solo tiene la matrícula
      listoParaAtender: faltantes.length === 0,
    };
  });
  return NextResponse.json({ medicos: enriquecidos });
}

export async function PATCH(req: NextRequest) {
  const user = await verificarAdmin();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const body = await req.json();
  const { medicoId, accion, motivo } = body;
  if (!medicoId || !accion) {
    return NextResponse.json({ error: "medicoId y accion son obligatorios" }, { status: 400 });
  }

  const admin = createAdminClient();
  const ahora = new Date().toISOString();
  const adminUser = await getAdminUser(user.id);

  if (accion === "aprobar") {
    // Gate REFEPS: imposible aprobar un médico real sin matrícula activa.
    const gate = await asegurarRefepsParaAprobar(admin, medicoId);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const { error } = await admin
      .from("medicos")
      .update({
        verificado: true,
        estado_registro: "aprobado",
        verificado_at: ahora,
        verificado_por: user.email,
      })
      .eq("id", medicoId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (adminUser) {
      await logAdminAction({
        adminUserId: adminUser.id,
        accion: ADMIN_ACTIONS.APROBAR_MEDICO,
        recursoTipo: "medico",
        recursoId: medicoId,
      });
    }
    // Email de bienvenida al médico recién aprobado (founder). No bloquea ni
    // rompe la aprobación: la función captura sus propios errores.
    await enviarEmailMedicoAprobado(medicoId);
    return NextResponse.json({ ok: true, estado: "aprobado" });
  }

  if (accion === "rechazar") {
    if (!motivo) return NextResponse.json({ error: "Motivo obligatorio para rechazar" }, { status: 400 });
    const { error } = await admin
      .from("medicos")
      .update({
        estado_registro: "rechazado",
        verificado: false,
        notas_admin: motivo,
      })
      .eq("id", medicoId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (adminUser) {
      await logAdminAction({
        adminUserId: adminUser.id,
        accion: ADMIN_ACTIONS.RECHAZAR_MEDICO,
        recursoTipo: "medico",
        recursoId: medicoId,
        motivo,
      });
    }
    return NextResponse.json({ ok: true, estado: "rechazado" });
  }

  if (accion === "suspender") {
    if (!motivo) return NextResponse.json({ error: "Motivo obligatorio para suspender" }, { status: 400 });
    const { error } = await admin
      .from("medicos")
      .update({
        estado_registro: "suspendido",
        verificado: false,
        disponible: false,
        notas_admin: motivo,
      })
      .eq("id", medicoId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (adminUser) {
      await logAdminAction({
        adminUserId: adminUser.id,
        accion: ADMIN_ACTIONS.SUSPENDER_MEDICO,
        recursoTipo: "medico",
        recursoId: medicoId,
        motivo,
      });
    }
    return NextResponse.json({ ok: true, estado: "suspendido" });
  }

  if (accion === "reactivar") {
    if (!motivo || motivo.trim().length < 10) {
      return NextResponse.json({ error: "Motivo obligatorio (min 10 caracteres)" }, { status: 400 });
    }
    // Reactivar deja al médico en `aprobado` → mismo gate REFEPS que aprobar.
    const gate = await asegurarRefepsParaAprobar(admin, medicoId);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const { error } = await admin
      .from("medicos")
      .update({
        estado_registro: "aprobado",
        verificado: true,
        verificado_at: ahora,
        verificado_por: user.email,
        notas_admin: motivo,
      })
      .eq("id", medicoId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (adminUser) {
      await logAdminAction({
        adminUserId: adminUser.id,
        accion: ADMIN_ACTIONS.REACTIVAR_MEDICO,
        recursoTipo: "medico",
        recursoId: medicoId,
        motivo,
      });
    }
    return NextResponse.json({ ok: true, estado: "aprobado" });
  }

  if (accion === "cambiar_categoria") {
    if (!adminUser || adminUser.nivel !== "super_admin") {
      return NextResponse.json({ error: "Solo super_admin puede cambiar categoria" }, { status: 403 });
    }

    const { nuevaCategoria } = body;
    if (!["founder", "tradicional"].includes(nuevaCategoria)) {
      return NextResponse.json({ error: "Categoria invalida" }, { status: 400 });
    }
    if (!motivo || motivo.trim().length < 10) {
      return NextResponse.json({ error: "Motivo obligatorio (min 10 caracteres)" }, { status: 400 });
    }

    const { data: anterior } = await admin
      .from("medicos")
      .select("categoria")
      .eq("id", medicoId)
      .single();

    if (anterior?.categoria === nuevaCategoria) {
      return NextResponse.json({ error: "El medico ya tiene esa categoria" }, { status: 400 });
    }

    const { error } = await admin
      .from("medicos")
      .update({ categoria: nuevaCategoria })
      .eq("id", medicoId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await logAdminAction({
      adminUserId: adminUser.id,
      accion: ADMIN_ACTIONS.CAMBIAR_CATEGORIA_MEDICO,
      recursoTipo: "medico",
      recursoId: medicoId,
      payloadAnterior: { categoria: anterior?.categoria },
      payloadNuevo: { categoria: nuevaCategoria },
      motivo,
    });

    return NextResponse.json({ ok: true, categoria: nuevaCategoria });
  }

  return NextResponse.json({ error: "Accion no reconocida" }, { status: 400 });
}
