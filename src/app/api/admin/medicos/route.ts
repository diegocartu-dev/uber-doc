import { NextRequest, NextResponse } from "next/server";
import { normalizarTelefonoAR } from "@/lib/telefono";
import { createAdminClient } from "@/lib/supabase/admin";
import { verificarAdmin, getAdminUser } from "@/lib/admin-auth";
import { logAdminAction, ADMIN_ACTIONS } from "@/lib/admin-audit";
import { validarMedicoREFEPS } from "@/lib/refeps/validar";
import { enviarEmailMedicoAprobado } from "@/lib/email";
import { camposFaltantesMedico } from "@/lib/perfil-medico";
import { derivarJurisdicciones, normalizarJurisdiccion } from "@/lib/jurisdicciones";
import { diagnosticoSinPisar } from "@/lib/refeps/persistir-diagnostico";
import {
  declaradaDesdeRefeps,
  esUtilizable,
  normalizarNumeroMatricula,
  MOTIVO_DNI_NO_COINCIDE,
  type MatriculaDeRefeps,
} from "@/lib/medicos/matricula-refeps";
import { obtenerDecisionDidit } from "@/lib/didit/client";
import { aplicarDecisionAprobada, soloDigitos } from "@/lib/didit/reconciliar";
import { moverSlugSiNuncaSeAprobo } from "@/lib/medicos/slug-matricula";

// Diagnóstico + robustez (15/06/2026): el gate REFEPS al aprobar se colgaba desde
// Vercel y la función moría sin completar (refeps_validado_at quedaba null).
// maxDuration evita la muerte por timeout corto; los logs [aprobar/refeps] +
// [refeps/token] + [refeps/buscar] muestran dónde y cuánto tarda la validación.
// «Usar esta» encadena Didit (hasta 15 s) y REFEPS (hasta ~51 s con reintentos).
export const maxDuration = 120;

// El Bus no respondió: no es un "no figura". Ante estos no se decide nada.
const ERRORES_SISTEMA_REFEPS = new Set(["REFEPS_TIMEOUT", "REFEPS_AUTH_ERROR", "REFEPS_ERROR_INTERNO"]);

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
    .select("dni, refeps_validado, es_cuenta_test, refeps_data")
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
    await admin.from("medicos").update({ refeps_data: diagnosticoSinPisar(medico.refeps_data, resultadoSinRaw, ahora) }).eq("id", medicoId);
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
    .select("id, nombre_completo, email, dni, tipo_matricula, numero_matricula, provincia_matricula, especialidad, foto_credencial_url, estado_registro, created_at, cuit, user_id, domicilio, verificado, verificado_at, verificado_por, disponible, notas_admin, slug, categoria, refeps_validado, refeps_data, refeps_validado_at, jurisdicciones, identidad_validada, identidad_validada_at, didit_status, telefono, celular_personal, domicilio_consultorio, foto_url, firma_manuscrita_url")
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

  // Corregir el contacto de un profesional desde el panel.
  //
  // POR QUÉ EXISTE: `celular_personal` es el destino de los avisos por WhatsApp.
  // Un profesional con el número mal cargado no se entera de que un paciente lo
  // está esperando. Hasta ahora el panel ni siquiera MOSTRABA el teléfono, así
  // que un pedido de soporte no se podía resolver — solo mirar.
  //
  // El profesional además ya puede corregirlo solo desde su perfil; esto es la
  // vía de soporte para cuando pide ayuda en vez de entrar.
  if (accion === "cambiar_contacto") {
    if (!adminUser) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    const { celular_personal, telefono } = body;
    if (celular_personal === undefined && telefono === undefined) {
      return NextResponse.json({ error: "Nada para cambiar" }, { status: 400 });
    }

    const cambios: Record<string, string | null> = {};

    if (celular_personal !== undefined) {
      const crudo = typeof celular_personal === "string" ? celular_personal.trim() : "";
      if (!crudo) {
        cambios.celular_personal = null;
      } else {
        // Misma validación que usa el profesional en su perfil: un número que la
        // normalización no resuelve se guardaría igual y el aviso moriría en
        // silencio al enviarse.
        const normalizado = normalizarTelefonoAR(crudo);
        if (!normalizado) {
          return NextResponse.json(
            { error: "El celular tiene que ser un móvil argentino de 10 dígitos (código de área + número)." },
            { status: 400 }
          );
        }
        cambios.celular_personal = normalizado;
      }
    }

    if (telefono !== undefined) {
      cambios.telefono = (typeof telefono === "string" ? telefono.trim() : "") || null;
    }

    const { data: anterior } = await admin
      .from("medicos")
      .select("celular_personal, telefono")
      .eq("id", medicoId)
      .single();

    const { error } = await admin.from("medicos").update(cambios).eq("id", medicoId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await logAdminAction({
      adminUserId: adminUser.id,
      accion: ADMIN_ACTIONS.CAMBIAR_CONTACTO_MEDICO,
      recursoTipo: "medico",
      recursoId: medicoId,
      payloadAnterior: { celular_personal: anterior?.celular_personal, telefono: anterior?.telefono },
      payloadNuevo: cambios,
      motivo: motivo || null,
    });

    return NextResponse.json({ ok: true, ...cambios });
  }

  // Poner como matrícula del profesional una de las que REFEPS tiene para su DNI.
  //
  // POR QUÉ EXISTE: cuando el cruce de identidad no cierra, el panel decía
  // "corregilo en la ficha" y la ficha no tenía cómo: cada caso terminaba en una
  // corrección por SQL. Un número mal tipeado ya se resuelve solo
  // (lib/didit/reconciliar.ts); esto es para lo que queda — declaró una
  // jurisdicción que REFEPS no tiene, o hay más de una — donde hace falta que
  // alguien elija. No se escribe ningún número: solo se puede elegir uno que
  // REFEPS ya devolvió para esa persona.
  if (accion === "usar_matricula_refeps") {
    if (!adminUser) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    const elegida = body.matricula as { numero?: unknown; tipo?: unknown } | undefined;
    if (typeof elegida?.numero !== "string" || typeof elegida?.tipo !== "string") {
      return NextResponse.json({ error: "Falta la matrícula elegida" }, { status: 400 });
    }

    const { data: ficha, error: errFicha } = await admin
      .from("medicos")
      .select(
        "dni, tipo_matricula, numero_matricula, provincia_matricula, provincia, identidad_validada, biometria_exenta, didit_status, didit_session_id, identidad_revision_motivo, verificado, verificado_at, slug, es_cuenta_test, nombre_completo"
      )
      .eq("id", medicoId)
      .single();
    if (errFicha || !ficha) return NextResponse.json({ error: "Profesional no encontrado" }, { status: 404 });
    if (ficha.identidad_validada === true) {
      return NextResponse.json(
        { error: "La identidad ya está validada: la matrícula quedó congelada y no se puede cambiar." },
        { status: 409 }
      );
    }
    // Solo cuando el cruce de identidad quedó sin cerrar POR LA MATRÍCULA (es para
    // lo que existe). Fuera de ese caso, cambiar la matrícula no arregla nada y a
    // un aprobado lo saca de la clínica.
    if (
      ficha.biometria_exenta === true ||
      ficha.didit_status !== "In Review" ||
      !ficha.identidad_revision_motivo ||
      !ficha.didit_session_id
    ) {
      return NextResponse.json(
        { error: "Este profesional no tiene un cruce de identidad pendiente: no hay nada que corregir acá." },
        { status: 409 }
      );
    }
    if (ficha.identidad_revision_motivo === MOTIVO_DNI_NO_COINCIDE) {
      return NextResponse.json(
        { error: "Lo que no coincide es el DNI, no la matrícula: primero hay que corregir el DNI." },
        { status: 409 }
      );
    }
    if (ficha.es_cuenta_test === true) {
      return NextResponse.json({ error: "Las cuentas de prueba no se consultan contra REFEPS." }, { status: 400 });
    }
    // Aprobado: el trigger de la base lo devuelve a revisión al cambiarle la
    // matrícula. Se hace solo si quien aprieta ya lo sabe.
    if (ficha.verificado === true && body.confirmado !== true) {
      return NextResponse.json(
        {
          error: "Este profesional está aprobado: al cambiarle la matrícula vuelve a revisión y hay que aprobarlo de nuevo.",
          requiereConfirmacion: true,
        },
        { status: 409 }
      );
    }

    // El DNI que vale es el que verificó la biometría, no el de la ficha (que el
    // profesional puede cambiar mientras no esté validado). Se le pregunta a
    // Didit, como hace el cruce.
    let dniDidit = "";
    try {
      const decision = await obtenerDecisionDidit(ficha.didit_session_id as string);
      if (decision.status !== "Approved") {
        return NextResponse.json(
          { error: "Didit ya no tiene aprobada esta verificación de identidad. No se cambió nada." },
          { status: 409 }
        );
      }
      dniDidit = soloDigitos(decision.id_verifications?.[0]?.document_number);
    } catch {
      return NextResponse.json({ error: "Didit no respondió. No se cambió nada: probá de nuevo en un momento." }, { status: 503 });
    }
    if (!dniDidit || dniDidit !== soloDigitos(ficha.dni)) {
      return NextResponse.json(
        { error: "El DNI de la ficha no es el del documento verificado: primero hay que corregir el DNI." },
        { status: 409 }
      );
    }

    // La matrícula se valida contra REFEPS EN VIVO por ese DNI, no contra
    // `refeps_data` guardado: esa columna puede estar vieja (un timeout la pisa)
    // y no es una fuente en la que apoyar una escritura.
    const refeps = await validarMedicoREFEPS(dniDidit);
    if (!refeps.encontrado) {
      const transitorio = !!refeps.error && ERRORES_SISTEMA_REFEPS.has(refeps.error);
      return NextResponse.json(
        {
          error: transitorio
            ? "REFEPS no respondió. No se cambió nada: probá de nuevo en un momento."
            : "REFEPS no devolvió ningún profesional para el DNI de esta ficha.",
        },
        { status: transitorio ? 503 : 400 }
      );
    }
    const enRefeps = ((refeps.matriculas ?? []) as MatriculaDeRefeps[]).find(
      (m) =>
        esUtilizable(m) &&
        normalizarJurisdiccion(m.tipo) === normalizarJurisdiccion(elegida.tipo as string) &&
        normalizarNumeroMatricula(m.numero) === normalizarNumeroMatricula(elegida.numero as string)
    );
    const nueva = enRefeps ? declaradaDesdeRefeps(enRefeps) : null;
    if (!nueva) {
      return NextResponse.json(
        { error: "REFEPS no tiene hoy esa matrícula como de médico y habilitada para este DNI." },
        { status: 400 }
      );
    }

    // Solo si la ficha sigue como se leyó: el profesional puede estar editándola,
    // y a alguien lo pueden haber aprobado mientras se consultaba REFEPS.
    let escritura = admin
      .from("medicos")
      .update({ ...nueva, provincia: nueva.provincia_matricula })
      .eq("id", medicoId)
      .eq("identidad_validada", false)
      .eq("verificado", ficha.verificado === true);
    for (const col of ["dni", "tipo_matricula", "numero_matricula", "provincia_matricula", "provincia"] as const) {
      const valor = ficha[col] as string | null;
      escritura = valor === null ? escritura.is(col, null) : escritura.eq(col, valor);
    }
    const { data: escritas, error } = await escritura.select("id");
    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "Esa matrícula ya está cargada en otra cuenta de Docto." }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!escritas?.length) {
      return NextResponse.json({ error: "La ficha cambió mientras tanto. Recargá la página y probá de nuevo." }, { status: 409 });
    }

    await logAdminAction({
      adminUserId: adminUser.id,
      accion: ADMIN_ACTIONS.CORREGIR_MATRICULA_MEDICO,
      recursoTipo: "medico",
      recursoId: medicoId,
      payloadAnterior: {
        tipo_matricula: ficha.tipo_matricula,
        numero_matricula: ficha.numero_matricula,
        provincia_matricula: ficha.provincia_matricula,
      },
      payloadNuevo: { ...nueva },
      motivo: motivo || "Elegida entre las matrículas de REFEPS",
    });

    // El slug sigue a la matrícula solo si nunca estuvo aprobado (se decide con
    // la ficha de ANTES: a un aprobado el trigger le acaba de borrar la aprobación).
    await moverSlugSiNuncaSeAprobo(admin, medicoId, ficha, {
      tipo: nueva.tipo_matricula,
      numero: nueva.numero_matricula,
    });

    // Cierra el cruce en el momento, por el mismo camino que el webhook y el cron
    // (el único que escribe identidad_validada), con el REFEPS que ya se consultó.
    const cruce = await aplicarDecisionAprobada(
      admin,
      {
        id: medicoId,
        dni: ficha.dni,
        numero_matricula: nueva.numero_matricula,
        identidad_validada: false,
        nombre_completo: ficha.nombre_completo,
        didit_status: ficha.didit_status,
      },
      dniDidit,
      { refeps, alertar: false }
    );

    // Se informa el estado real de la ficha después, no el supuesto.
    const { data: despues } = await admin
      .from("medicos")
      .select(
        "tipo_matricula, numero_matricula, provincia_matricula, estado_registro, verificado, verificado_at, verificado_por, identidad_validada, didit_status, identidad_revision_motivo, refeps_validado, refeps_data, jurisdicciones"
      )
      .eq("id", medicoId)
      .single();
    return NextResponse.json({ ok: true, cruce: cruce.outcome, ficha: despues ?? null });
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
