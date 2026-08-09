// POST /api/medico/documentos-pendientes
//
// Avisa al médico, de forma PERSISTENTE, que una atención suya se cerró sin que
// la documentación llegara al paciente. Y, con `accion: "estado"`, le dice al
// cartel del dashboard si esa marca sigue vigente.
//
// POR QUÉ EXISTE
// Al finalizar una consulta el médico es redirigido al dashboard y el guardado
// de documentos corre después, en segundo plano. Si ese guardado falla no hay
// pantalla donde mostrarle el error: hasta hoy el trabajo se perdía en silencio
// y nadie se enteraba (un caso de junio apareció recién en la auditoría de
// agosto; otro de agosto lo reclamó el paciente cinco días después).
//
// Este endpoint escribe una fila en `notificaciones_medico` — el canal que ya
// alimenta la campanita del dashboard. No inventa tabla ni canal nuevo.
//
// REGLA: este endpoint NUNCA bloquea ni revierte nada. Es un aviso. Si falla,
// el médico igual ve el cartel local del dashboard (lib/documentacion-pendiente).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { TIPOS_FIRMABLES } from "@/lib/firma/documento";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Motivo = "documentos" | "cierre";
type Canal = "consulta" | "turno";

type Body = {
  /** "aviso" (default, retrocompatible) deja la notificación; "estado" solo consulta. */
  accion?: "aviso" | "estado";
  consultaId?: string;
  tipo?: Canal;
  motivo?: Motivo;
  /** Solo para `accion: "estado"`. */
  items?: { id?: string; tipo?: Canal }[];
};

/** Techo para el chequeo de estado: el cartel local guarda como mucho 3 marcas. */
const MAX_ITEMS_ESTADO = 5;

/**
 * Estados desde los que el médico TODAVÍA puede volver a entrar a la atención y
 * emitir lo que falta. Espejan los guards de las pantallas:
 *   - consulta: workspace/page.tsx admite 'pagada', 'en_curso' y —desde el
 *     08/08— 'completada', donde entra en modo "completar documentación";
 *   - turno: /turno/[turnoId]/video, ídem con 'completado'.
 * Si el estado no está acá, el CTA "Completar ahora" devolvería al médico al
 * dashboard — un loop con un cartel que no puede resolver. Por eso se calcula
 * server-side y el cartel cambia el texto en vez de mentirle.
 *
 * 'completada'/'completado' entraron acá el 08/08 junto con el camino de volver
 * a una atención cerrada. Antes el cartel le decía al médico "ya figura cerrada,
 * escribinos a soporte@" — un consejo que hoy es falso y lo manda a abrir un
 * ticket por algo que resuelve solo en treinta segundos. Cuando cambie el guard
 * de esas pantallas, este mapa tiene que cambiar con él.
 */
const REABRIBLES: Record<Canal, string[]> = {
  consulta: ["pagada", "en_curso", "completada"],
  turno: [
    "reservado_pendiente",
    "confirmado",
    "en_espera",
    "en_curso",
    "completado",
  ],
};

/**
 * Atención ya cerrada: de estas se encarga la tarjeta "Documentación pendiente"
 * del inicio, que las lista leyendo la base (src/lib/atenciones-sin-documentar.ts).
 * El cartel local del navegador cubre el otro caso —la atención que quedó
 * ABIERTA, que esa tarjeta no puede ver— y para las cerradas se calla. Sin este
 * reparto el médico veía dos avisos ámbar apilados sobre la misma consulta.
 */
const CERRADAS: Record<Canal, string[]> = {
  consulta: ["completada"],
  turno: ["completado"],
};

/** Consulta inmediata: `en_curso_at`/`created_at` son timestamptz → hora argentina. */
function momentoConsulta(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const tz: Intl.DateTimeFormatOptions = { timeZone: "America/Argentina/Buenos_Aires" };
  const hora = d.toLocaleTimeString("es-AR", { ...tz, hour: "2-digit", minute: "2-digit" });
  const fecha = d.toLocaleDateString("es-AR", { ...tz, day: "2-digit", month: "2-digit" });
  return `${hora} del ${fecha}`;
}

/**
 * Turno: `fecha` es date y `hora_inicio` es time — ya están en hora local
 * argentina. Se arman a mano a propósito: pasarlos por `new Date()` los
 * interpretaría como UTC y correría la hora.
 */
function momentoTurno(fecha: string | null, horaInicio: string | null): string {
  if (!fecha || !horaInicio) return "";
  const [anio, mes, dia] = fecha.split("-");
  if (!anio || !mes || !dia) return "";
  return `${horaInicio.slice(0, 5)} del ${dia}/${mes}`;
}

type Atencion = { medicoId: string | null; estado: string | null; momento: string };

async function leerAtencion(
  admin: ReturnType<typeof createAdminClient>,
  tipo: Canal,
  id: string
): Promise<Atencion> {
  if (tipo === "turno") {
    const { data } = await admin
      .from("turnos")
      .select("medico_id, estado, fecha, hora_inicio")
      .eq("id", id)
      .maybeSingle();
    return {
      medicoId: data?.medico_id ?? null,
      estado: data?.estado ?? null,
      momento: momentoTurno(data?.fecha ?? null, data?.hora_inicio ?? null),
    };
  }
  const { data } = await admin
    .from("consultas")
    .select("medico_id, estado, en_curso_at, created_at")
    .eq("id", id)
    .maybeSingle();
  return {
    medicoId: data?.medico_id ?? null,
    estado: data?.estado ?? null,
    momento: momentoConsulta(data?.en_curso_at ?? data?.created_at ?? null),
  };
}

/** ¿La atención ya tiene documentos clínicos emitidos? (= la entrega salió bien) */
async function tieneDocumentos(
  admin: ReturnType<typeof createAdminClient>,
  tipo: Canal,
  id: string
): Promise<boolean> {
  const { data, error } = await admin
    .from("documentos")
    .select("id")
    .eq(tipo === "turno" ? "turno_id" : "consulta_id", id)
    .in("tipo", [...TIPOS_FIRMABLES])
    .limit(1);
  // Ante un error de lectura NO se dice "ya está entregado": eso borraría el
  // aviso de algo que quizá sigue sin entregar. Fail-safe hacia el aviso.
  if (error) return false;
  return (data?.length ?? 0) > 0;
}

/** El médico de la sesión, o null si el usuario no es médico. */
async function medicoDeLaSesion(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<string | null> {
  // Solo columnas con GRANT para authenticated (ver regla de grants en CLAUDE.md).
  const { data } = await supabase.from("medicos").select("id").eq("user_id", userId).maybeSingle();
  return data?.id ?? null;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Body inválido" }, { status: 400 });
  }

  const medicoId = await medicoDeLaSesion(supabase, user.id);
  if (!medicoId) return NextResponse.json({ ok: false, error: "No es médico" }, { status: 403 });

  const admin = createAdminClient();

  // -------------------------------------------------------------------------
  // accion: "estado" — el cartel del dashboard pregunta si la marca sigue viva
  // -------------------------------------------------------------------------
  // Sin esto el cartel puede mentir de dos formas: seguir mostrando un aviso de
  // algo que YA se entregó, y ofrecer un botón "Completar ahora" hacia una
  // pantalla que rechaza la atención y devuelve al dashboard (loop).
  if (body.accion === "estado") {
    const items = (Array.isArray(body.items) ? body.items : []).slice(0, MAX_ITEMS_ESTADO);
    const estados: {
      id: string;
      entregado: boolean;
      reabrible: boolean;
      cerrada: boolean;
    }[] = [];

    for (const item of items) {
      const id = item?.id;
      const tipo: Canal = item?.tipo === "turno" ? "turno" : "consulta";
      if (!id || !UUID_RE.test(id)) continue;

      const atencion = await leerAtencion(admin, tipo, id);
      // Atención ajena o inexistente: no se filtra nada de ella, se omite.
      if (!atencion.medicoId || atencion.medicoId !== medicoId) continue;

      estados.push({
        id,
        entregado: await tieneDocumentos(admin, tipo, id),
        reabrible: REABRIBLES[tipo].includes(String(atencion.estado ?? "")),
        // Ya cerrada → de esta atención se encarga la tarjeta del servidor
        // ("Documentación pendiente"), que la lista con su propio botón. El
        // cartel local se calla para no dejar dos avisos ámbar apilados
        // diciendo lo mismo sobre la misma consulta.
        cerrada: CERRADAS[tipo].includes(String(atencion.estado ?? "")),
      });
    }

    return NextResponse.json({ ok: true, estados });
  }

  // -------------------------------------------------------------------------
  // accion: "aviso" (default) — deja la notificación persistente
  // -------------------------------------------------------------------------
  const id = body.consultaId;
  const tipo: Canal = body.tipo === "turno" ? "turno" : "consulta";
  const motivo: Motivo = body.motivo === "cierre" ? "cierre" : "documentos";

  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ ok: false, error: "Atención inválida" }, { status: 400 });
  }

  // La atención tiene que ser de este médico: nadie se avisa a sí mismo sobre
  // una consulta ajena.
  const atencion = await leerAtencion(admin, tipo, id);

  if (!atencion.medicoId || atencion.medicoId !== medicoId) {
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 403 });
  }

  const referencia = atencion.momento ? `de las ${atencion.momento}` : "reciente";
  const reabrible = REABRIBLES[tipo].includes(String(atencion.estado ?? ""));
  const dondeVolver =
    tipo === "turno" ? "Volvé a entrar a ese turno" : "Volvé a entrar a esa consulta";

  // Qué hacer ahora. Depende de si el médico puede volver a entrar: mandarlo a
  // una pantalla que lo rebota al dashboard es peor que no decirle nada.
  const comoResolver = reabrible
    ? `${dondeVolver} y completala para que le lleguen al paciente.`
    : "Esta atención quedó anulada, así que no se puede completar desde el consultorio. Escribinos a soporte@docto.com.ar mencionando el horario y la resolvemos nosotros.";

  const titulo = "Quedó documentación sin entregar";
  const mensaje =
    motivo === "cierre"
      ? `Los documentos de tu consulta ${referencia} sí llegaron al paciente, pero no se pudo guardar la evolución.\n\nLo que escribiste está guardado. ${comoResolver}`
      : `Tu consulta ${referencia} se cerró sin que los documentos llegaran al paciente.\n\nLo que escribiste NO se perdió: quedó guardado. ${comoResolver}`;

  // Anti-duplicado: un reintento no debe llenarle la campanita de carteles
  // iguales. El par (título, mensaje) ya incluye la hora de la atención, así que
  // alcanza como clave natural mientras el aviso siga sin leer.
  const { data: yaAvisado } = await admin
    .from("notificaciones_medico")
    .select("id")
    .eq("medico_id", medicoId)
    .eq("titulo", titulo)
    .eq("mensaje", mensaje)
    .eq("leida", false)
    .limit(1);

  if (yaAvisado && yaAvisado.length > 0) {
    return NextResponse.json({ ok: true, duplicado: true });
  }

  const { error } = await admin.from("notificaciones_medico").insert({
    medico_id: medicoId,
    titulo,
    mensaje,
    // `enviada_por` queda null a propósito: no la mandó un admin, la generó el
    // sistema al detectar que la entrega no se completó.
  });

  if (error) {
    console.error("[documentacion-pendiente] no se pudo avisar al médico:", error.message);
    return NextResponse.json({ ok: false, error: "No se pudo registrar el aviso" });
  }

  // Log de servidor para que la falla también sea visible desde operaciones y no
  // dependa de que el médico mire la campanita.
  console.error(
    `[documentacion-pendiente] ${tipo} ${id} sin entregar (motivo=${motivo}, reabrible=${reabrible}) — médico avisado`
  );

  return NextResponse.json({ ok: true });
}
