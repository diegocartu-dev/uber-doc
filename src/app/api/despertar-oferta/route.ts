// Piloto "despertar oferta dormida" (Diego 31/08, guardrails de Tomás): un
// paciente busca atención, su provincia tiene profesionales y NINGUNO está en
// línea — el momento B, el 73% de la demanda perdida. En vez de dejarlo mirando
// una vidriera apagada, se les avisa a los profesionales de su provincia que
// hay demanda AHORA. Ataca la causa (oferta dormida), no el síntoma.
//
// GUARDRAILS, todos no-negociables (el canal ya quemó a una profesional con 17
// avisos en una madrugada):
// - Lo dispara el PACIENTE con un toque explícito, nunca la carga de la página.
// - Solo profesionales con OPT-IN (columna avisos_demanda_optin, la activa
//   Diego con el OK de cada uno).
// - Tope: 1 aviso por profesional por día. Ventana: 8 a 22 AR.
// - Máximo 3 profesionales por disparo, y tope global de 10 avisos por hora
//   (freno ante cualquier loop o abuso).
// - Solo candidatos que PODRÍAN atender ya mismo si se conectan: aprobados,
//   identidad ok, con precio y cuenta de cobros, jurisdicción del paciente,
//   apagados AHORA pero activos en los últimos 14 días (los que nunca se
//   conectan no se despiertan por WhatsApp — se reclutan).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizarJurisdiccion } from "@/lib/jurisdicciones";
import { identidadHabilitada } from "@/lib/perfil-medico";
import { estadoCuentaMp } from "@/lib/mp-cuenta";
import { avisarDemandaProvincia } from "@/lib/whatsapp";
import { trackEvent } from "@/lib/funnel";

const MAX_POR_DISPARO = 3;
const TOPE_GLOBAL_HORA = 10;
const VENTANA_AR = { desde: 8, hasta: 22 };
const ACTIVO_DIAS = 14;

export async function POST(_req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const admin = createAdminClient();
  const { data: pac } = await admin
    .from("pacientes")
    .select("id, provincia, es_cuenta_test")
    .eq("user_id", user.id)
    .maybeSingle();
  const juris = normalizarJurisdiccion(pac?.provincia);
  if (!pac || !juris) return NextResponse.json({ avisados: 0 });

  // Ventana horaria AR: fuera de 8-22 no se despierta a nadie.
  const ahoraAR = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
  const hora = ahoraAR.getHours();
  if (hora < VENTANA_AR.desde || hora >= VENTANA_AR.hasta) {
    return NextResponse.json({ avisados: 0, fueraDeHorario: true });
  }

  // Tope global por hora: freno duro ante loops o abuso, del lado del servidor.
  const hace1h = new Date(Date.now() - 3600_000).toISOString();
  const { count: enviadosHora } = await admin
    .from("whatsapp_envios")
    .select("id", { count: "exact", head: true })
    .eq("plantilla", "demanda_provincia")
    .eq("resultado", "enviado")
    .gte("created_at", hace1h);
  if ((enviadosHora ?? 0) >= TOPE_GLOBAL_HORA) return NextResponse.json({ avisados: 0 });

  // Candidatos: opt-in + ofertables si se conectaran (misma vara que la clínica).
  const [{ data: medicosRaw }, { data: cuentasMp }] = await Promise.all([
    admin
      .from("medicos")
      .select("id, jurisdicciones, precio_consulta, identidad_validada, biometria_exenta, es_cuenta_test, disponible, avisos_demanda_optin")
      .eq("verificado", true)
      .eq("estado_registro", "aprobado")
      .eq("oculto_clinica", false)
      .eq("avisos_demanda_optin", true)
      .eq("disponible", false)
      .eq("es_cuenta_test", pac.es_cuenta_test === true),
    admin.from("medicos_mp_accounts").select("medico_id, estado, expires_at"),
  ]);
  const puedeCobrar = new Map((cuentasMp ?? []).map((c) => [c.medico_id, estadoCuentaMp(c) !== "no_conectado"]));

  let candidatos = (medicosRaw ?? []).filter(
    (m) =>
      ((m.jurisdicciones ?? []) as string[]).includes(juris) &&
      !!m.precio_consulta &&
      puedeCobrar.get(m.id) === true &&
      identidadHabilitada(m)
  );

  if (candidatos.length > 0) {
    const ids = candidatos.map((m) => m.id);
    const desde = new Date(Date.now() - ACTIVO_DIAS * 86400_000).toISOString();
    // Activo reciente: se conectó al menos una vez en la ventana.
    const { data: activos } = await admin
      .from("disponibilidad_log")
      .select("medico_id")
      .in("medico_id", ids)
      .gte("at", desde);
    const activosSet = new Set((activos ?? []).map((a) => a.medico_id));
    // Tope diario POR profesional (día AR = desde las 03 UTC).
    const hoyAR = new Date(ahoraAR); hoyAR.setHours(0, 0, 0, 0);
    const desdeHoyUTC = new Date(hoyAR.getTime() + 3 * 3600_000).toISOString();
    const { data: avisadosHoy } = await admin
      .from("whatsapp_envios")
      .select("medico_id")
      .eq("plantilla", "demanda_provincia")
      .in("medico_id", ids)
      .gte("created_at", desdeHoyUTC);
    const yaAvisados = new Set((avisadosHoy ?? []).map((a) => a.medico_id));
    candidatos = candidatos.filter((m) => activosSet.has(m.id) && !yaAvisados.has(m.id));
  }

  const aAvisar = candidatos.slice(0, MAX_POR_DISPARO);
  let avisados = 0;
  for (const m of aAvisar) {
    const ok = await avisarDemandaProvincia(m.id, juris, { disparador: "paciente_busco" });
    if (ok) avisados++;
  }

  // Medición del piloto: cada disparo queda registrado, también con cero
  // avisados — "no hubo a quién despertar" es dato para el kill criterion.
  void trackEvent({
    evento: "rescate_ofrecido",
    pacienteId: user.id,
    metadata: { momento: "despertar_oferta", provincia: juris, candidatos: candidatos.length, avisados },
  });

  return NextResponse.json({ avisados });
}
