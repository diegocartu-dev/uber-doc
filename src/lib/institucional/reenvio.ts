// src/lib/institucional/reenvio.ts
// Reenvío SELF-SERVICE del enlace de acceso (spec §5.4, R19; mock 02 estado F).
// SOLO instancia institucional.
//
// ── LA REGLA QUE ORDENA TODO ESTE ARCHIVO ────────────────────────────────────
// El enlace se manda SIEMPRE al contacto que ya está en el padrón. JAMÁS al
// que la persona escribe en el formulario. El DNI y el celular que se tipean
// son una LLAVE para encontrar la fila, no un destino: si alguien conoce un
// DNI ajeno, lo peor que puede lograr es que el paciente de verdad reciba su
// propio enlace en su propio teléfono.
//
// Por lo mismo, la respuesta es siempre la misma ("si estás en el padrón, te
// lo mandamos"): ni un dato distinto según el DNI exista o no. Esta pantalla
// es pública y sin esa disciplina sería un buscador de padrón provincial.
//
// Los topes (1 cada N minutos, M por día) salen del config de la institución
// (migración 011), no de constantes: son política, y la política todavía es
// una propuesta pendiente de cierre.

import { createAdminClient } from "@/lib/supabase/admin";
import { esInstitucional } from "@/lib/instancia";
import { getConfigInstitucion } from "@/lib/institucional/config";
import { normalizarTelefonoAR } from "@/lib/telefono";
import { enviarTwilio, twilioConfigurado } from "@/lib/whatsapp";
import { getFlag } from "@/lib/feature-flags";
import { crearAccesoLink } from "@/lib/institucional/accesos";
import { fechaLabelAR } from "@/lib/institucional/avisos";
import { mailTurnoAsignadoPaciente } from "@/lib/institucional/emails";
import { articuloMedico, formatNombreMedico } from "@/lib/utils/texto";

/** Estados de turno a los que TIENE sentido mandar a alguien de nuevo. */
const VIVOS = ["confirmado", "en_espera", "en_curso"];
/** Terminados: el enlace sigue sirviendo para los documentos (R19). */
const TERMINADOS = ["completado", "ausente_paciente", "ausente_medico"];

const DIA_MS = 24 * 3600_000;

const primerNombre = (n: string | null | undefined): string =>
  (n ?? "").trim().split(/\s+/)[0] || "";

interface TurnoParaReenvio {
  id: string;
  fecha: string;
  hora_inicio: string;
  medico_id: string;
  estado: string;
}

/**
 * Elige a qué turno mandar el enlace. Primero el próximo que todavía se puede
 * atender; si no hay ninguno, el último que pasó y sigue dentro de la vigencia
 * de documentos (que es justo el caso "perdí la receta").
 */
export function elegirTurnoParaReenvio(
  turnos: TurnoParaReenvio[],
  ahoraMs: number,
  vigenciaDias: number,
  instanteDe: (fecha: string, hora: string) => number
): TurnoParaReenvio | null {
  const vivos = turnos
    .filter((t) => VIVOS.includes(t.estado))
    .map((t) => ({ t, ms: instanteDe(t.fecha, t.hora_inicio) }))
    // Tolerancia hacia atrás: un turno que empezó hace un rato sigue siendo
    // "el de ahora" — el profesional puede estar corriendo tarde.
    .filter((x) => x.ms > ahoraMs - 3 * 3600_000)
    .sort((a, b) => a.ms - b.ms);
  if (vivos.length > 0) return vivos[0].t;

  const pasados = turnos
    .filter((t) => TERMINADOS.includes(t.estado))
    .map((t) => ({ t, ms: instanteDe(t.fecha, t.hora_inicio) }))
    .filter((x) => x.ms > ahoraMs - vigenciaDias * DIA_MS)
    .sort((a, b) => b.ms - a.ms);
  return pasados[0]?.t ?? null;
}

/** ¿Puede pedir otro enlace? Parte pura: cooldown + techo diario. */
export function permiteReenvio(
  emisionesRecientesMs: number[],
  ahoraMs: number,
  cooldownMinutos: number,
  maxPorDia: number
): boolean {
  const ultimoMs = Math.max(...emisionesRecientesMs, 0);
  if (ultimoMs && ahoraMs - ultimoMs < cooldownMinutos * 60_000) return false;
  const enElDia = emisionesRecientesMs.filter((ms) => ahoraMs - ms < DIA_MS).length;
  return enElDia < maxPorDia;
}

/**
 * Busca en el padrón, decide si corresponde, re-acuña el token (lo que revoca
 * el anterior) y lo manda al contacto registrado.
 *
 * NUNCA devuelve por qué no se mandó: el resultado es siempre el mismo del
 * lado del que pide. Lo que pasó queda en los logs del servidor.
 */
export async function reenviarAccesoSelfService(params: {
  dni: string;
  celular: string;
}): Promise<void> {
  if (!esInstitucional()) return;

  try {
    const dni = (params.dni ?? "").replace(/\D/g, "");
    const celular = normalizarTelefonoAR(params.celular);
    if (dni.length < 6 || !celular) return;

    const admin = createAdminClient();
    const config = await getConfigInstitucion();

    const { data: paciente } = await admin
      .from("pacientes")
      .select("id, nombre_completo, telefono, email")
      .eq("dni", dni)
      .maybeSingle();
    if (!paciente) return;

    // El celular tipeado tiene que COINCIDIR con el del padrón. No es un
    // destino: es la segunda mitad de la llave (anti-enumeración por DNI).
    const registrado = normalizarTelefonoAR(paciente.telefono);
    if (!registrado || registrado !== celular) return;

    // Cooldown + techo diario sobre las emisiones recientes del paciente.
    const desde = new Date(Date.now() - DIA_MS).toISOString();
    const { data: emisiones } = await admin
      .from("accesos_link")
      .select("created_at")
      .eq("paciente_id", paciente.id)
      .gte("created_at", desde)
      .order("created_at", { ascending: false });
    const recientes = (emisiones ?? []).map((e) => new Date(e.created_at).getTime());
    if (
      !permiteReenvio(
        recientes,
        Date.now(),
        config.reenvio_cooldown_minutos,
        config.reenvio_max_por_dia
      )
    ) {
      console.warn("[reenvio] Pedido dentro del cooldown o sobre el techo diario");
      return;
    }

    const { data: turnos } = await admin
      .from("turnos")
      .select("id, fecha, hora_inicio, medico_id, estado")
      .eq("paciente_id", paciente.id)
      .order("fecha", { ascending: false })
      .limit(30);

    const { instanteAR } = await import("@/lib/institucional/pantalla-turno");
    const turno = elegirTurnoParaReenvio(
      (turnos ?? []) as TurnoParaReenvio[],
      Date.now(),
      config.vigencia_documentos_dias,
      instanteAR
    );
    if (!turno) {
      console.warn("[reenvio] El paciente no tiene ningún turno al que mandarlo");
      return;
    }

    const { data: medico } = await admin
      .from("medicos")
      .select("nombre_completo, titulo, especialidad")
      .eq("id", turno.medico_id)
      .maybeSingle();
    const nombreMedico = formatNombreMedico(medico?.nombre_completo ?? "", medico?.titulo ?? null);
    const especialidad = medico?.especialidad ?? "";

    const waOn = (await getFlag("whatsapp_institucional").catch(() => false)) && twilioConfigurado();
    const canal: "whatsapp" | "mail" | null = waOn ? "whatsapp" : paciente.email ? "mail" : null;
    if (!canal) {
      console.warn("[reenvio] Sin canal para reenviar");
      return;
    }

    // Re-acuñar revoca el token anterior (regla: un token vivo por paciente y
    // encuentro). El viejo deja de servir en el mismo instante: si el enlace
    // se filtró por el celular perdido, este pedido lo apaga.
    const acceso = await crearAccesoLink({
      pacienteId: paciente.id,
      turnoId: turno.id,
      destino: `/turno/${turno.id}/acceso`,
      operadorId: null,
      origen: "reenvio_paciente",
      canal,
      enviadoA: canal === "whatsapp" ? registrado : (paciente.email as string),
      encuentroMs: instanteAR(turno.fecha, turno.hora_inicio),
    });
    if (!acceso) return;

    const fechaLabel = fechaLabelAR(turno.fecha);
    const hora = turno.hora_inicio.slice(0, 5);
    const hoyAR = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Argentina/Buenos_Aires",
    }).format(new Date());

    if (canal === "whatsapp") {
      // Es HOY → la plantilla de recordatorio ("Hoy a las X hs…"). Otro día →
      // la de asignación, que es la única que lleva la fecha adentro.
      const esHoy = turno.fecha === hoyAR;
      const sid = esHoy ? config.wa_plantillas?.recordatorio : config.wa_plantillas?.turno_asignado;
      if (!sid) {
        console.error("[reenvio] Falta la plantilla de WhatsApp en el config");
        return;
      }
      const articulo = articuloMedico(medico?.titulo ?? null);
      const vars: Record<string, string> = esHoy
        ? {
            "1": primerNombre(paciente.nombre_completo),
            "2": hora,
            // La plantilla aprobada dice "con la Dra. …": el artículo lo arma
            // el que envía (nota de inyección de etapa0/plantillas-whatsapp).
            "3": `${articulo ? `${articulo} ` : ""}${nombreMedico}`.trim(),
            "4": especialidad,
            "5": acceso.url,
          }
        : {
            "1": config.nombre,
            "2": primerNombre(paciente.nombre_completo),
            "3": fechaLabel,
            "4": hora,
            "5": nombreMedico,
            "6": especialidad,
            "7": acceso.url,
            "8": config.telefono_ayuda ?? "a tu centro de salud",
          };
      const ok = await enviarTwilio(registrado, sid, vars);
      if (!ok && paciente.email) {
        await mailTurnoAsignadoPaciente({
          to: paciente.email,
          nombrePaciente: primerNombre(paciente.nombre_completo),
          fechaLabel,
          hora,
          medicoNombre: nombreMedico,
          especialidad,
          link: acceso.url,
        });
      }
      return;
    }

    await mailTurnoAsignadoPaciente({
      to: paciente.email as string,
      nombrePaciente: primerNombre(paciente.nombre_completo),
      fechaLabel,
      hora,
      medicoNombre: nombreMedico,
      especialidad,
      link: acceso.url,
    });
  } catch (err) {
    // Nunca lanza: el que pide siempre ve la misma pantalla neutra.
    console.error("[reenvio] Falló el reenvío self-service:", err);
  }
}
