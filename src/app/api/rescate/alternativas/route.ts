// Alternativas VIVAS para el menú de rescate (sprint 31/08): qué ofrecerle al
// paciente cuya atención se cayó — pedido de CI que nadie aceptó, o turno pago
// con profesional ausente.
//
// Solo sirve alternativas sobre una caída REAL y PROPIA: el recurso (consulta o
// turno) debe ser del paciente autenticado y estar en un estado terminal de
// rescate. Sin eso, esto sería un buscador de oferta con exclusiones
// arbitrarias, y además emitiría `rescate_ofrecido` (la medición) por consultas
// ajenas.
//
// Regla del Uber ANTES de ofrecer: si el paciente tiene otra atención con plata
// comprometida, no se le pintan CTAs que van a rebotar en crearConsulta — se
// devuelve el encuentro para que la pantalla lo lleve ahí (hallazgo del panel:
// existe el caso cruzado "CI paga en curso + turno caído a la vez").

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { alternativasVivas } from "@/lib/oferta";
import { buscarEncuentroActivo } from "@/lib/consultas/encuentro-activo";
import { trackEvent } from "@/lib/funnel";

// Estados desde los que el rescate tiene sentido. Más permisivo que "solo
// medico_ausente" a propósito: la rama `cancelada` de la sala también ofrece
// el menú (pedido sin aceptar vencido o retirado).
const CONSULTA_RESCATABLE = new Set(["cancelada", "rechazada", "medico_ausente"]);
const TURNO_RESCATABLE = new Set(["ausente_medico", "cancelado_medico"]);

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const consultaId = req.nextUrl.searchParams.get("consultaId");
  const turnoId = req.nextUrl.searchParams.get("turnoId");
  if (!consultaId === !turnoId) {
    return NextResponse.json({ error: "consultaId O turnoId" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Fila del paciente: provincia (jurisdicción del rescate), carril test, y el
  // id que referencian los turnos (asimetría de schema conocida).
  const { data: pac } = await admin
    .from("pacientes")
    .select("id, provincia, es_cuenta_test")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!pac) return NextResponse.json({ error: "Sin perfil de paciente" }, { status: 403 });

  let momento: "ci_caida" | "turno_caido";
  let excluirMedicoId: string | null = null;
  let especialidad: string | null = null;

  if (consultaId) {
    const { data: c } = await admin
      .from("consultas")
      .select("paciente_id, medico_id, estado, medicos(especialidad)")
      .eq("id", consultaId)
      .maybeSingle();
    if (!c || c.paciente_id !== user.id) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
    if (!CONSULTA_RESCATABLE.has(c.estado)) return NextResponse.json({ error: "Sin rescate para este estado" }, { status: 409 });
    momento = "ci_caida";
    excluirMedicoId = c.medico_id;
    const mc = c.medicos as { especialidad: string } | { especialidad: string }[] | null;
    especialidad = (Array.isArray(mc) ? mc[0]?.especialidad : mc?.especialidad) ?? null;
  } else {
    const { data: t } = await admin
      .from("turnos")
      .select("paciente_id, medico_id, estado, medicos(especialidad)")
      .eq("id", turnoId!)
      .maybeSingle();
    if (!t || t.paciente_id !== pac.id) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    if (!TURNO_RESCATABLE.has(t.estado)) return NextResponse.json({ error: "Sin rescate para este estado" }, { status: 409 });
    momento = "turno_caido";
    excluirMedicoId = t.medico_id;
    const mt = t.medicos as { especialidad: string } | { especialidad: string }[] | null;
    especialidad = (Array.isArray(mt) ? mt[0]?.especialidad : mt?.especialidad) ?? null;
  }

  // Regla del Uber: con plata comprometida en OTRA atención no se ofrece nada.
  const encuentro = await buscarEncuentroActivo(admin, user.id, pac.id);
  if (encuentro && encuentro.pagado && encuentro.id !== consultaId && encuentro.id !== turnoId) {
    return NextResponse.json({ bloqueado: { href: encuentro.href, medicoNombre: encuentro.medicoNombre } });
  }

  const alternativas = await alternativasVivas({
    provincia: pac.provincia,
    especialidad,
    excluirMedicoId,
    pacienteEsTest: pac.es_cuenta_test === true,
  });

  // La medición va ANTES del render y también con cero opciones: "no tuvimos
  // qué ofrecer" es exactamente el dato que faltaba en los casos históricos.
  void trackEvent({
    evento: "rescate_ofrecido",
    pacienteId: user.id,
    metadata: {
      momento,
      recursoId: consultaId ?? turnoId,
      especialidadPedida: especialidad,
      opciones: {
        ci: alternativas.ciAhora.length,
        turnos: alternativas.turnos.length,
        mismaEspecialidad: [...alternativas.ciAhora, ...alternativas.turnos].some((a) => a.mismaEspecialidad),
      },
    },
  });

  return NextResponse.json({ alternativas, especialidadPedida: especialidad });
}
