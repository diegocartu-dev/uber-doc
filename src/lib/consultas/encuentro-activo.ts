// ¿El paciente ya está adentro de una atención?
//
// REGLA (decisión de Diego, 09/08/2026): "como usar un Uber y querer pedir
// otro". Si el paciente YA PAGÓ, esa atención es la suya y no puede abrir otra:
// lo llevamos ahí. Si todavía NO pagó, es libre de dejar a ese profesional y
// elegir otro — igual que cancelarle a un chofer antes de que llegue.
//
// LO QUE ESTABA MAL ANTES
// El guard de `crearConsulta` miraba `["esperando","aceptada","en_curso"]` y se
// olvidaba de `pagada`, que es JUSTO el estado donde hay plata comprometida.
// O sea: el único caso que había que blindar era el que estaba abierto, y el
// único que había que dejar libre (impago) era el que estaba trabado con un
// cartel sin salida. El camino de turnos sí lo tenía bien.
//
// POR QUÉ UN TURNO AGENDADO NO BLOQUEA
// Solo cuentan los turnos donde el paciente está EFECTIVAMENTE adentro
// (`en_espera` = ya entró a la sala, `en_curso` = lo están atendiendo). Un turno
// `confirmado` para el jueves no es un viaje en progreso: no tiene por qué
// impedirle una consulta inmediata hoy.
//
// LA LIBERACIÓN NO SE FUERZA DESDE ACÁ
// Cuando el paciente no asiste o se vence el plazo, el encuentro cambia de
// estado (`ausente_paciente`, `completada`, `cancelada`…) y deja de figurar en
// estas listas solo. Este módulo no decide vencimientos, solo lee estados.
// OJO: hoy el turno tiene ese plazo (cron cada 10 min, 20 de gracia) y la
// consulta inmediata NO — su único barrido es el cron de las 3 AM.

import type { SupabaseClient } from "@supabase/supabase-js";
import { estadoPagoConsulta } from "@/lib/estado-pago-consulta";

/**
 * Estados en los que una CI sigue viva. Si está pagada o impaga NO se decide por
 * el estado: se decide con `estadoPagoConsulta`, que mira también `mp_status`.
 *
 * Por qué no alcanza el estado: un pago REAL de CI salta de `aceptada` directo a
 * `en_curso` (lo hace el webhook de MP); `pagada` solo la escribe la simulación
 * de cuentas de test. Y una consulta con el pago EN CAMINO (`in_process`,
 * `authorized`, `pending`) sigue en `aceptada` con plata retenida — tratarla
 * como impaga dejaba que el paciente la abandonara mientras MP acreditaba, y la
 * pantalla encima le afirmaba "todavía no la pagaste".
 */
const CI_VIVA = ["esperando", "aceptada", "pagada", "en_curso"];

/** Turno en el que el paciente ya está adentro. Ver nota de arriba. */
const TURNO_EN_CURSO = ["en_espera", "en_curso"];

export type EncuentroActivo = {
  canal: "consulta" | "turno";
  id: string;
  medicoId: string;
  medicoNombre: string;
  /** true = hay plata comprometida. Define si bloquea o si se puede abandonar. */
  pagado: boolean;
  /**
   * El pago existe pero MP todavía no lo acreditó (cupón, revisión, tarjeta
   * autorizada sin capturar). Bloquea igual —la plata está retenida— pero la
   * pantalla NO puede afirmar "ya está paga": todavía no lo está.
   */
  pagoEnCamino?: boolean;
  /** A dónde mandar al paciente para retomarlo. */
  href: string;
};

async function nombreDelMedico(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  medicoId: string
): Promise<string> {
  // Solo columnas con GRANT para `authenticated` (ver regla de grants en
  // CLAUDE.md): sumar una columna sin grant haría fallar la query ENTERA y
  // devolver null en silencio.
  const { data } = await supabase
    .from("medicos")
    .select("nombre_completo")
    .eq("id", medicoId)
    .maybeSingle();
  return data?.nombre_completo?.trim() || "el profesional";
}

/**
 * Devuelve la atención en la que el paciente ya está metido, o `null`.
 *
 * Prioriza lo pagado: si tiene una CI pagada y además una solicitud impaga, la
 * que manda es la pagada — es donde está la plata y donde lo esperan.
 *
 * @param pacienteRowId `pacientes.id` (los turnos lo referencian así). Si no se
 *   conoce, se omiten los turnos: `consultas.paciente_id` es `auth.users.id` y
 *   los dos no son intercambiables (asimetría de schema por canal).
 */
export async function buscarEncuentroActivo(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  userId: string,
  pacienteRowId: string | null
): Promise<EncuentroActivo | null> {
  // Se traen TODAS las vivas y se clasifican en JS: el estado solo no alcanza
  // (ver la nota de CI_VIVA). `mp_status` es imprescindible acá.
  const { data: cis } = await supabase
    .from("consultas")
    .select("id, medico_id, estado, mp_status")
    .eq("paciente_id", userId)
    .in("estado", CI_VIVA)
    .order("created_at", { ascending: false })
    .limit(10);

  const conPlata = (cis ?? []).find(
    (c) => estadoPagoConsulta(c.estado, c.mp_status) !== "falta_pagar"
  );

  if (conPlata) {
    return {
      canal: "consulta",
      id: conPlata.id,
      medicoId: conPlata.medico_id,
      medicoNombre: await nombreDelMedico(supabase, conPlata.medico_id),
      pagado: true,
      pagoEnCamino: estadoPagoConsulta(conPlata.estado, conPlata.mp_status) === "en_camino",
      href: `/consulta/${conPlata.id}/confirmacion`,
    };
  }

  if (pacienteRowId) {
    const { data: turno } = await supabase
      .from("turnos")
      .select("id, medico_id")
      .eq("paciente_id", pacienteRowId)
      .in("estado", TURNO_EN_CURSO)
      .order("fecha", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (turno) {
      return {
        canal: "turno",
        id: turno.id,
        medicoId: turno.medico_id,
        medicoNombre: await nombreDelMedico(supabase, turno.medico_id),
        pagado: true,
        href: `/turno/${turno.id}/espera`,
      };
    }
  }

  const ciImpaga = (cis ?? []).find(
    (c) => estadoPagoConsulta(c.estado, c.mp_status) === "falta_pagar"
  );

  if (ciImpaga) {
    return {
      canal: "consulta",
      id: ciImpaga.id,
      medicoId: ciImpaga.medico_id,
      medicoNombre: await nombreDelMedico(supabase, ciImpaga.medico_id),
      pagado: false,
      href: `/sala-espera/${ciImpaga.id}`,
    };
  }

  return null;
}
