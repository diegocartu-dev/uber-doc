import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verificarAdmin } from "@/lib/admin-auth";

export async function GET() {
  const user = await verificarAdmin();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("sala_espera_entradas")
    .select(`
      id, paciente_id, medico_id, tipo, entrada_en,
      consulta_id, turno_id,
      paciente:pacientes(nombre_completo, dni, email),
      medico:medicos(nombre_completo)
    `)
    .is("salida_en", null)
    .order("entrada_en", { ascending: true });

  if (error) {
    console.error("[admin/sala-espera/activos] Error:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }

  // Limpieza perezosa de entradas zombie: si la consulta/turno asociado ya está
  // en estado terminal, la entrada quedó colgada (nada la cierra al finalizar —
  // el cron diario recién la cerraría a las >24h). Acá se cierra y se excluye:
  // el panel se auto-sanea con solo cargarse. El cron queda como backstop para
  // entradas sin consulta asociada.
  const TERMINALES_CONSULTA = new Set(["completada", "cancelada", "rechazada", "expirada"]);
  const TERMINALES_TURNO = new Set(["completado", "cancelado_paciente", "cancelado_medico", "ausente_paciente", "expirado"]);

  const abiertas = (data || []) as Array<Record<string, unknown>>;
  const consultaIds = [...new Set(abiertas.map((e) => e.consulta_id).filter(Boolean))] as string[];
  const turnoIds = [...new Set(abiertas.map((e) => e.turno_id).filter(Boolean))] as string[];

  const [consultasRes, turnosRes] = await Promise.all([
    consultaIds.length > 0
      ? supabase.from("consultas").select("id, estado").in("id", consultaIds)
      : Promise.resolve({ data: [] as { id: string; estado: string }[] }),
    turnoIds.length > 0
      ? supabase.from("turnos").select("id, estado").in("id", turnoIds)
      : Promise.resolve({ data: [] as { id: string; estado: string }[] }),
  ]);

  const estadoConsulta = new Map((consultasRes.data ?? []).map((c) => [c.id, c.estado]));
  const estadoTurno = new Map((turnosRes.data ?? []).map((t) => [t.id, t.estado]));

  const zombies: string[] = [];
  const vivas = abiertas.filter((e) => {
    const ec = e.consulta_id ? estadoConsulta.get(e.consulta_id as string) : null;
    const et = e.turno_id ? estadoTurno.get(e.turno_id as string) : null;
    const terminada = (!!ec && TERMINALES_CONSULTA.has(ec)) || (!!et && TERMINALES_TURNO.has(et));
    if (terminada) zombies.push(e.id as string);
    return !terminada;
  });

  if (zombies.length > 0) {
    await supabase
      .from("sala_espera_entradas")
      .update({ salida_en: new Date().toISOString(), motivo_salida: "consulta_finalizada" })
      .in("id", zombies)
      .is("salida_en", null);
  }

  const entradas = vivas.map((e: Record<string, unknown>) => {
    const minutos = Math.floor(
      (Date.now() - new Date(e.entrada_en as string).getTime()) / 60000
    );
    return {
      ...e,
      tiempo_espera_min: minutos,
      urgencia: minutos > 20 ? "alta" : minutos > 10 ? "media" : "baja",
    };
  });

  return NextResponse.json({ entradas });
}
