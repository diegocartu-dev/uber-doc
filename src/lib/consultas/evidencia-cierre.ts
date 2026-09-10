// La caja negra de la consulta, escrita en la base (decisión Diego, 10/09/2026:
// "tenemos que medir y guardar la data del 100% de las consultas que se cancelan").
//
// ── POR QUÉ ──────────────────────────────────────────────────────────────────
// Todo lo que sabíamos sobre por qué se cayó una consulta vivía en dos lugares
// que no duran: los registros del servidor (8 días) y la consola del navegador
// del paciente (cero). Por eso, del análisis del 09/09, los dos casos de agosto
// ya no se pudieron reconstruir: los registros habían vencido.
//
// Acá se baja a la base, en el momento del cierre, lo que se sabe de esa
// consulta: si el paciente llegó a ver el botón de pagar, si lo tocó, cuándo dio
// señales de estar mirando por última vez, y qué pasó con el aviso que le
// mandamos. Un `jsonb` para no tener que migrar cada vez que aparezca un dato
// nuevo que valga la pena guardar.
//
// ── REGLAS ───────────────────────────────────────────────────────────────────
// · Best-effort SIEMPRE: registrar la evidencia jamás puede impedir un cierre.
//   Un cierre que no se escribe deja a un paciente atrapado; una evidencia que
//   no se escribe solo nos deja sin saber.
// · Se escribe UNA vez, al cerrar. No se pisa: si ya hay evidencia, se respeta
//   la primera (el cierre real), no la del proceso que pasó después.
// · Sin datos personales: horas y banderas, nada de teléfonos ni nombres. El
//   repo es público y esto se lee desde el panel.

import { createAdminClient } from "@/lib/supabase/admin";

export type EvidenciaCierre = {
  /** Cuándo se escribió esta evidencia (ISO). */
  at: string;
  /** Segundos entre la aceptación y el cierre. null si nunca se aceptó. */
  seg_aceptada_a_cierre: number | null;
  /** ¿La pantalla del paciente llegó a mostrarle el botón de pagar? */
  vio_boton: boolean;
  /** ¿Tocó el botón? (beacon del cliente, sobrevive a que todo lo demás falle) */
  toco_boton: boolean;
  /** ¿El intento llegó al servidor? Si tocó y esto es false, se rompió en el medio. */
  intento_llego_al_servidor: boolean;
  /** Segundos desde el último latido de presencia al cerrar. null si nunca hubo. */
  seg_desde_ultimo_latido: number | null;
  /** Resultado del aviso por WhatsApp: "enviado", "sin_celular", … null si no hubo. */
  aviso_whatsapp: string | null;
  /** Entrega real según Twilio: "delivered", "undelivered", … null si no volvió. */
  aviso_whatsapp_entrega: string | null;
  /** Errores del navegador del paciente registrados en esta consulta. */
  errores_cliente: number;
};

/**
 * Junta lo que se sabe de una consulta y lo escribe en `consultas.cierre_evidencia`.
 * Nunca lanza. Llamar DESPUÉS de haber escrito el cierre.
 */
export async function registrarEvidenciaCierre(consultaId: string): Promise<void> {
  try {
    const admin = createAdminClient();

    const { data: consulta } = await admin
      .from("consultas")
      .select("paciente_id, aceptada_at, resuelta_at, cierre_evidencia")
      .eq("id", consultaId)
      .maybeSingle();
    if (!consulta) return;
    // Ya hay evidencia: la primera es la del cierre real, no se pisa.
    if (consulta.cierre_evidencia) return;

    // Ventana acotada: los eventos de esta consulta son necesariamente posteriores
    // a que se pidiera. Sin este corte, la query trae la tabla entera (crece sin
    // techo) para responder por una sola consulta. 12 h cubre de sobra cualquier
    // CI, incluida una que se haya quedado colgada.
    const desdeISO = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
    const [{ data: eventos }, { data: entradas }, { data: avisos }] = await Promise.all([
      admin
        .from("eventos_funnel")
        .select("evento, metadata")
        .in("evento", ["pago_vista", "pago_toque", "pago_intento", "error_cliente"])
        // Filtrado por el paciente de ESTA consulta, no solo por fecha: PostgREST
        // corta en 1000 filas por defecto, y un día con muchos `error_cliente`
        // podría empujar fuera de la ventana justo los eventos que se buscan —
        // dando una evidencia incompleta, que es peor que no tenerla.
        .eq("paciente_id", consulta.paciente_id)
        .gte("created_at", desdeISO),
      admin
        .from("sala_espera_entradas")
        .select("ultimo_latido_at")
        .eq("consulta_id", consultaId),
      admin
        .from("whatsapp_envios")
        .select("resultado, twilio_status")
        .eq("consulta_id", consultaId)
        .eq("plantilla", "paciente_aceptada")
        .order("created_at", { ascending: false })
        .limit(1),
    ]);

    // Los eventos guardan la consulta con dos nombres según quién los emite: el
    // cliente escribe `consultaId`, el servidor `recursoId`.
    const deEstaConsulta = (m: unknown): boolean => {
      const o = (m ?? {}) as Record<string, unknown>;
      return o.consultaId === consultaId || o.recursoId === consultaId;
    };
    const propios = (eventos ?? []).filter((e) => deEstaConsulta(e.metadata));
    const hubo = (nombre: string) => propios.some((e) => e.evento === nombre);

    const cerradaAt = consulta.resuelta_at ? new Date(consulta.resuelta_at).getTime() : Date.now();
    const aceptadaAt = consulta.aceptada_at ? new Date(consulta.aceptada_at).getTime() : null;

    const latidos = (entradas ?? [])
      .map((e) => (e.ultimo_latido_at ? new Date(e.ultimo_latido_at).getTime() : NaN))
      .filter((t) => !isNaN(t));
    const ultimoLatido = latidos.length ? Math.max(...latidos) : null;

    const aviso = (avisos ?? [])[0] ?? null;

    const evidencia: EvidenciaCierre = {
      at: new Date().toISOString(),
      seg_aceptada_a_cierre: aceptadaAt ? Math.round((cerradaAt - aceptadaAt) / 1000) : null,
      vio_boton: hubo("pago_vista"),
      toco_boton: hubo("pago_toque"),
      intento_llego_al_servidor: hubo("pago_intento"),
      seg_desde_ultimo_latido: ultimoLatido ? Math.round((cerradaAt - ultimoLatido) / 1000) : null,
      aviso_whatsapp: aviso?.resultado ?? null,
      aviso_whatsapp_entrega: aviso?.twilio_status ?? null,
      errores_cliente: propios.filter((e) => e.evento === "error_cliente").length,
    };

    await admin
      .from("consultas")
      .update({ cierre_evidencia: evidencia })
      .eq("id", consultaId)
      .is("cierre_evidencia", null);
  } catch {
    // Nunca romper un cierre por no poder explicarlo.
  }
}
