import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verificarAdmin } from "@/lib/admin-auth";
import { setsDeTest, esTest, leerSoloReales } from "@/lib/insights/filtro-test";
import { fechaAR, medianocheARenUTC } from "@/lib/insights/fechas";
import { sinReservasAbandonadas } from "@/lib/insights/reservas";

// ── Página "Especialidades" v2 (directivas Diego 28/07) ──────────────────────
// 1. Solo las especialidades que TENEMOS (con médicos; una sin médicos solo
//    aparece si tuvo demanda en el período → señal de reclutamiento).
// 2. Cada card lista QUÉ médicos la componen y DE QUÉ provincias son.
// 3. Doctrina de plata del tablero: Cobrado real de MP (CI + turnos, refunds
//    excluidos) — muere el GMV teórico. Espera CI: afuera (no es un indicador
//    que sirva hoy — dicho por Diego en la página Médicos).
// 4. Cuenta también TURNOS (antes solo CI): la especialidad del turno es la
//    del médico.

const SLOT = new Set(["disponible", "bloqueado"]);

type Esp = {
  total: number;
  atendidas: number;
  totalCI: number;
  totalTurnoClinica: number;
  totalTurnoConsultorio: number;
  cobrado: number;
  medicosActivos: Set<string>;
  medicosTotal: Set<string>;
  medicos: { nombre: string; jurisdicciones: string[]; disponible: boolean }[];
};

export async function GET(req: NextRequest) {
  const user = await verificarAdmin();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const dias = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get("dias") ?? "30", 10) || 30, 1), 365);
  const soloReales = leerSoloReales(req.nextUrl.searchParams);
  const desde = fechaAR(dias);
  const admin = createAdminClient();

  const [{ data: medicosRaw }, { data: consultasRaw }, { data: turnosRaw }, { data: refundsRaw }, sets] = await Promise.all([
    admin.from("medicos").select("id, nombre_completo, especialidad, disponible, es_cuenta_test, jurisdicciones").eq("verificado", true),
    admin.from("consultas").select("id, estado, medico_id, paciente_id, especialidad, created_at, monto, mp_status").gte("created_at", medianocheARenUTC(desde)),
    admin.from("turnos").select("id, estado, medico_id, paciente_id, fecha, monto, mp_status, turno_origen_id, canal_origen, reservado_hasta").gte("fecha", desde),
    admin.from("refunds_pendientes").select("tipo, recurso_id").eq("estado", "resuelto"),
    setsDeTest(admin),
  ]);

  const medicos = (medicosRaw ?? []).filter((m) => !soloReales || !m.es_cuenta_test);
  const consultas = (consultasRaw ?? []).filter((c) => !soloReales || !esTest(sets, c.medico_id, c.paciente_id));
  // + reservas ABANDONADAS afuera (ver lib/insights/reservas.ts): retención de
  // 15 min vencida sin pago. Sumaban demanda fantasma a la especialidad.
  const turnos = sinReservasAbandonadas(
    (turnosRaw ?? [])
      .filter((t) => !SLOT.has(t.estado))
      .filter((t) => !soloReales || !esTest(sets, t.medico_id, t.paciente_id)),
  );

  // Refunds ejecutados: el pago sigue "approved" pero la plata volvió al
  // paciente. En turnos reprogramados la plata vive en la fila ORIGINAL de la
  // cadena (turno_origen_id) — se excluyen también los ancestros.
  const refundeados = new Set((refundsRaw ?? []).map((r) => `${r.tipo}:${r.recurso_id}`));
  {
    const origenDe = new Map((turnosRaw ?? []).map((t) => [t.id, t.turno_origen_id as string | null]));
    for (const r of refundsRaw ?? []) {
      if (r.tipo !== "turno") continue;
      let cursor = origenDe.get(r.recurso_id) ?? null;
      for (let paso = 0; cursor && paso < 10; paso++) {
        refundeados.add(`turno:${cursor}`);
        cursor = origenDe.get(cursor) ?? null;
      }
    }
  }

  const espMap = new Map<string, Esp>();
  const espDe = (nombre: string): Esp => {
    let e = espMap.get(nombre);
    if (!e) {
      e = { total: 0, atendidas: 0, totalCI: 0, totalTurnoClinica: 0, totalTurnoConsultorio: 0, cobrado: 0, medicosActivos: new Set(), medicosTotal: new Set(), medicos: [] };
      espMap.set(nombre, e);
    }
    return e;
  };

  const especialidadDeMedico = new Map(medicos.map((m) => [m.id, m.especialidad]));

  for (const m of medicos) {
    const e = espDe(m.especialidad);
    e.medicosTotal.add(m.id);
    if (m.disponible) e.medicosActivos.add(m.id);
    e.medicos.push({
      nombre: m.nombre_completo,
      jurisdicciones: (m.jurisdicciones as string[] | null) ?? [],
      disponible: !!m.disponible,
    });
  }

  for (const c of consultas) {
    const e = espDe(c.especialidad ?? especialidadDeMedico.get(c.medico_id) ?? "Sin especialidad");
    e.total++;
    e.totalCI++;
    if (c.estado === "completada") e.atendidas++;
    if (c.mp_status === "approved" && !refundeados.has(`consulta:${c.id}`)) e.cobrado += Number(c.monto) || 0;
  }
  for (const t of turnos) {
    const esp = especialidadDeMedico.get(t.medico_id);
    if (!esp) continue; // médico test filtrado o no verificado
    const e = espDe(esp);
    e.total++;
    if (t.canal_origen === "consultorio_privado") e.totalTurnoConsultorio++;
    else e.totalTurnoClinica++;
    if (t.estado === "completado") e.atendidas++;
    if (t.mp_status === "approved" && !refundeados.has(`turno:${t.id}`)) e.cobrado += Number(t.monto) || 0;
  }

  const result = [...espMap.entries()]
    // "Solo las que tenemos": con médicos. Sin médicos solo si hubo demanda
    // en el período (señal de reclutamiento, no catálogo fantasma).
    .filter(([, d]) => d.medicosTotal.size > 0 || d.total > 0)
    .map(([especialidad, d]) => {
      const sinMedicos = d.medicosActivos.size === 0 && d.total > 0;
      const ratio = d.medicosActivos.size > 0 ? d.total / d.medicosActivos.size : sinMedicos ? Infinity : 0;
      let demanda: "alta" | "media" | "ok" = "ok";
      if (ratio > 10 || (d.total > 3 && d.medicosActivos.size === 0)) demanda = "alta";
      else if (ratio > 5) demanda = "media";

      return {
        especialidad,
        total: d.total,
        atendidas: d.atendidas,
        totalCI: d.totalCI,
        totalTurnoClinica: d.totalTurnoClinica,
        totalTurnoConsultorio: d.totalTurnoConsultorio,
        cobrado: d.cobrado,
        medicosActivos: d.medicosActivos.size,
        medicosTotal: d.medicosTotal.size,
        medicos: d.medicos.sort((a, b) => Number(b.disponible) - Number(a.disponible) || a.nombre.localeCompare(b.nombre)),
        demanda,
        atencionesPorMedicoActivo: d.medicosActivos.size > 0 ? Math.round((d.total / d.medicosActivos.size) * 10) / 10 : null,
        sinMedicos,
      };
    })
    .sort((a, b) => b.cobrado - a.cobrado || b.total - a.total || b.medicosTotal - a.medicosTotal);

  return NextResponse.json({ especialidades: result });
}
