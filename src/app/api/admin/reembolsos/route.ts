import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { etiquetaDestino } from "@/lib/pagos/destinos-puro";
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
  // A dónde devolverle (destinos_pago): etiqueta, hace cuánto lo declaró y, si
  // es un cambio reciente, hasta cuándo está bloqueado.
  destino: string | null;
  destino_declarado_hace: string | null;
  destino_bloqueado_hasta: string | null;
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

  // En consultas `paciente_id` es el user_id; en turnos es `pacientes.id`. Se
  // busca por las dos claves, así el nombre sale en los dos canales (antes
  // las consultas mostraban "—").
  const { data: pacientes } = pacienteIds.size
    ? await admin
        .from("pacientes")
        .select("id, nombre_completo, user_id")
        .or(`id.in.(${[...pacienteIds].join(",")}),user_id.in.(${[...pacienteIds].join(",")})`)
    : { data: [] as { id: string; nombre_completo: string; user_id: string | null }[] };
  const pacienteNombre = new Map<string, string>();
  const pacienteUserId = new Map<string, string | null>();
  for (const p of pacientes ?? []) {
    pacienteNombre.set(p.id, p.nombre_completo);
    if (p.user_id) pacienteNombre.set(p.user_id, p.nombre_completo);
    pacienteUserId.set(p.id, p.user_id);
  }

  // A dónde se le devuelve la plata (lib/pagos/destinos): lo que el paciente
  // declaró al pagar. En consultas `paciente_id` ya es el user_id; en turnos
  // es `pacientes.id`. Si la tabla no está migrada, queda vacío (no se cae).
  const userIdsDestino = new Set<string>();
  for (const [clave, info] of recursoInfo) {
    if (!info.paciente_id) continue;
    userIdsDestino.add(clave.startsWith("consulta:") ? info.paciente_id : (pacienteUserId.get(info.paciente_id) ?? ""));
  }
  userIdsDestino.delete("");
  const { data: destinos } = userIdsDestino.size
    ? await admin
        .from("destinos_pago")
        .select("user_id, tipo, valor, usable_desde, created_at")
        .in("user_id", [...userIdsDestino])
        .eq("rol", "paciente")
        .eq("vigente", true)
    : { data: [] as { user_id: string; tipo: "mp_email" | "alias" | "cvu" | "cbu"; valor: string; usable_desde: string; created_at: string }[] };
  const destinoPorUser = new Map((destinos ?? []).map((d) => [d.user_id, d]));
  const haceCuanto = (iso: string): string => {
    const horas = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 3_600_000));
    if (horas < 1) return "hace minutos";
    if (horas < 48) return `hace ${horas} h`;
    return `hace ${Math.round(horas / 24)} días`;
  };
  const resolverDestino = (tipo: string, recursoId: string) => {
    const vacio = { destino: null as string | null, destino_declarado_hace: null as string | null, destino_bloqueado_hasta: null as string | null };
    const info = recursoInfo.get(`${tipo}:${recursoId}`);
    if (!info?.paciente_id) return vacio;
    const userId = tipo === "consulta" ? info.paciente_id : pacienteUserId.get(info.paciente_id);
    const d = userId ? destinoPorUser.get(userId) : undefined;
    if (!d) return vacio;
    return {
      destino: etiquetaDestino(d),
      destino_declarado_hace: haceCuanto(d.created_at),
      destino_bloqueado_hasta: Date.parse(d.usable_desde) > Date.now() ? d.usable_desde : null,
    };
  };

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
      ...resolverDestino(r.tipo, r.recurso_id),
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
