import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verificarAdmin } from "@/lib/admin-auth";

// Dash de admin de reembolsos (Ola 3 / ticket 3D, sección 5 de la política).
// Cuatro vistas: cola de reembolsos pendientes + reintentos, acción requerida
// (cobertura manual CVU), y deuda del médico.

interface ColaRow {
  id: string;
  tipo: "turno" | "consulta";
  recurso_id: string;
  medico: string;
  paciente: string;
  monto: number;
  estado: string;
  intentos: number;
  ultimo_error: string | null;
  ultimo_intento_at: string;
  proximo_intento_at: string;
  creado_at: string;
  motivo: string | null;
}

interface AccionRow {
  id: string;
  tipo: "turno" | "consulta";
  recurso_id: string;
  medico: string;
  paciente: string;
  monto: number;
  creado_at: string;
  ultimo_error: string | null;
  // CVU del paciente: se captura en el ticket 3A (todavía no existe la columna).
  cvu: string | null;
}

interface DeudaRow {
  medico_id: string;
  medico: string;
  total_debe: number;
  total_recuperado: number;
  restante: number;
  items: number;
}

export async function GET() {
  const user = await verificarAdmin();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const admin = createAdminClient();

  const [{ data: refunds }, { data: deudas }] = await Promise.all([
    admin
      .from("refunds_pendientes")
      .select("id, tipo, recurso_id, medico_id, neto_medico, application_fee, estado, intentos, ultimo_error, ultimo_intento_at, proximo_intento_at, creado_at")
      .neq("estado", "resuelto")
      .order("creado_at", { ascending: false }),
    admin
      .from("medicos_deuda")
      .select("medico_id, monto, monto_recuperado, estado")
      .neq("estado", "saldada"),
  ]);

  const refundsList = refunds ?? [];
  const deudasList = deudas ?? [];

  // ── Batch-fetch de entidades relacionadas (sin FKs de PostgREST) ──
  const medicoIds = new Set<string>();
  const turnoIds: string[] = [];
  const consultaIds: string[] = [];
  for (const r of refundsList) {
    medicoIds.add(r.medico_id);
    if (r.tipo === "consulta") consultaIds.push(r.recurso_id);
    else turnoIds.push(r.recurso_id);
  }
  for (const d of deudasList) medicoIds.add(d.medico_id);

  const [{ data: medicos }, { data: turnos }, { data: consultas }] = await Promise.all([
    medicoIds.size
      ? admin.from("medicos").select("id, nombre_completo").in("id", [...medicoIds])
      : Promise.resolve({ data: [] as { id: string; nombre_completo: string }[] }),
    turnoIds.length
      ? admin.from("turnos").select("id, paciente_id, motivo_cancelacion").in("id", turnoIds)
      : Promise.resolve({ data: [] as { id: string; paciente_id: string; motivo_cancelacion: string | null }[] }),
    consultaIds.length
      ? admin.from("consultas").select("id, paciente_id, motivo_consulta").in("id", consultaIds)
      : Promise.resolve({ data: [] as { id: string; paciente_id: string; motivo_consulta: string | null }[] }),
  ]);

  const medicoNombre = new Map((medicos ?? []).map((m) => [m.id, m.nombre_completo]));
  const recursoInfo = new Map<string, { paciente_id: string; motivo: string | null }>();
  for (const t of turnos ?? []) recursoInfo.set(`turno:${t.id}`, { paciente_id: t.paciente_id, motivo: t.motivo_cancelacion });
  for (const c of consultas ?? []) recursoInfo.set(`consulta:${c.id}`, { paciente_id: c.paciente_id, motivo: c.motivo_consulta });

  const pacienteIds = new Set<string>();
  for (const info of recursoInfo.values()) if (info.paciente_id) pacienteIds.add(info.paciente_id);

  const { data: pacientes } = pacienteIds.size
    ? await admin.from("pacientes").select("id, nombre_completo").in("id", [...pacienteIds])
    : { data: [] as { id: string; nombre_completo: string }[] };
  const pacienteNombre = new Map((pacientes ?? []).map((p) => [p.id, p.nombre_completo]));

  const resolverPaciente = (tipo: string, recursoId: string): string => {
    const info = recursoInfo.get(`${tipo}:${recursoId}`);
    if (!info?.paciente_id) return "—";
    return pacienteNombre.get(info.paciente_id) ?? "—";
  };
  const resolverMotivo = (tipo: string, recursoId: string): string | null =>
    recursoInfo.get(`${tipo}:${recursoId}`)?.motivo ?? null;

  // ── Vista 1 + 2: cola de reembolsos pendientes / reintentos ──
  const cola: ColaRow[] = refundsList
    .filter((r) => r.estado === "pendiente" || r.estado === "fee_pendiente")
    .map((r) => ({
      id: r.id,
      tipo: r.tipo,
      recurso_id: r.recurso_id,
      medico: medicoNombre.get(r.medico_id) ?? "—",
      paciente: resolverPaciente(r.tipo, r.recurso_id),
      monto: Number(r.neto_medico) + Number(r.application_fee),
      estado: r.estado,
      intentos: r.intentos,
      ultimo_error: r.ultimo_error,
      ultimo_intento_at: r.ultimo_intento_at,
      proximo_intento_at: r.proximo_intento_at,
      creado_at: r.creado_at,
      motivo: resolverMotivo(r.tipo, r.recurso_id),
    }));

  // ── Vista 3: acción requerida (escalado → cobertura manual CVU) ──
  const accionRequerida: AccionRow[] = refundsList
    .filter((r) => r.estado === "escalado")
    .map((r) => ({
      id: r.id,
      tipo: r.tipo,
      recurso_id: r.recurso_id,
      medico: medicoNombre.get(r.medico_id) ?? "—",
      paciente: resolverPaciente(r.tipo, r.recurso_id),
      monto: Number(r.neto_medico) + Number(r.application_fee),
      creado_at: r.creado_at,
      ultimo_error: r.ultimo_error,
      cvu: null, // pendiente de captura (ticket 3A)
    }));

  // ── Vista 4: deuda del médico (agrupada) ──
  const deudaPorMedico = new Map<string, { debe: number; recuperado: number; items: number }>();
  for (const d of deudasList) {
    const acc = deudaPorMedico.get(d.medico_id) ?? { debe: 0, recuperado: 0, items: 0 };
    acc.debe += Number(d.monto);
    acc.recuperado += Number(d.monto_recuperado);
    acc.items += 1;
    deudaPorMedico.set(d.medico_id, acc);
  }
  const deudasView: DeudaRow[] = [...deudaPorMedico.entries()]
    .map(([medico_id, v]) => ({
      medico_id,
      medico: medicoNombre.get(medico_id) ?? "—",
      total_debe: v.debe,
      total_recuperado: v.recuperado,
      restante: Math.max(0, v.debe - v.recuperado),
      items: v.items,
    }))
    .sort((a, b) => b.restante - a.restante);

  return NextResponse.json({
    cola,
    accionRequerida,
    deudas: deudasView,
    resumen: {
      pendientes: cola.length,
      accionRequerida: accionRequerida.length,
      deudaTotalRestante: deudasView.reduce((s, d) => s + d.restante, 0),
      // Plata total pendiente de devolver (suma de la cola) — para verlo de una mirada.
      montoPendienteTotal: cola.reduce((s, r) => s + r.monto, 0),
    },
  });
}
