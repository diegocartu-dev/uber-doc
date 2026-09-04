// Carga las unidades del tablero desde producción con la clave de servicio y
// las clasifica con el MISMO motor que usa el resto del producto:
// `clasificar.ts` (escalera intento/consulta), `plata.ts` (cobrado, fee,
// devuelto), `reservas.ts` (reservas abandonadas), `resultado-busqueda.ts`
// (qué pasó con cada búsqueda), `mp-cuenta.ts` (¿puede cobrar?) y
// `perfil-medico.ts` (¿está listo para atender?).
//
// Reglas que este archivo cumple y el script de identidades verifica:
// · filtro de cuentas de prueba BILATERAL (médico O paciente);
// · reservas abandonadas afuera (se cuentan en `ocultos`);
// · la plata de un turno reprogramado vive en la RAÍZ de la cadena
//   `turno_origen_id`, que puede tener más de un nivel;
// · un pago se acredita a UNA sola búsqueda; un checkout abierto no es pago;
// · paginación real con `traerTodo` (PostgREST corta en 1000 sin avisar);
// · de `medicos` viajan booleanos, nunca celular, DNI ni notas.
//
// Cualquier error de la base LANZA: un cero silencioso es una mentira que se
// lee bien.

import { createAdminClient } from "@/lib/supabase/admin";
import { clasificarAtencion, clasificarTurno, type FilaAtencion } from "@/lib/consultas/clasificar";
import { pagada, reintegrada, reintegroEnCurso, comisionDe, causaEnCriollo } from "@/lib/insights/plata";
import { esReservaAbandonada, esReservaViva } from "@/lib/insights/reservas";
import { fechaAR, fechaARdeISO, lunesDeSemanaAR, medianocheARenUTC, horaARdeISO, minutoARdeISO } from "@/lib/insights/fechas";
import { decidirResultado, type DesenlacePedido } from "@/lib/insights/resultado-busqueda";
import { estadoCuentaMp } from "@/lib/mp-cuenta";
import { camposFaltantesMedico, identidadHabilitada } from "@/lib/perfil-medico";
import { COBERTURA, mesAnterior } from "./cobertura";
import { traerTodo, PAGINA } from "./traer-todo";
import type { Atencion, Busqueda, CiHora, DatosTablero, Medico, Paciente, Slot } from "./tipos";

const SLOT = new Set(["disponible", "bloqueado", "bloqueado_sin_cobro"]);
const EVENTOS = ["clinica_vista", "medico_elegido", "pago_vista", "pago_creado", "pago_aprobado", "pago_rechazado", "triage_paso", "triage_bloqueado"];
const CAP_CI_MS = 16 * 3600_000; // un intervalo de CI abierto se capea a 16 h (igual que /insights/oferta)
const SESION_GAP_MS = 30 * 60_000; // huecos de más de 30 min separan búsquedas (igual que /insights/funnel)
const VENTANA_RESULTADO_MS = 2 * 3600_000;

type Fila = { id?: unknown } & Record<string, unknown>;
const str = (v: unknown): string | null => (v == null ? null : String(v));
const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);
const bool = (v: unknown): boolean => !!v;
const lleno = (v: unknown) => typeof v === "string" && v.trim().length > 0;
const mesDe = (f: string) => f.slice(0, 7);
const minutosEntre = (a?: string | null, b?: string | null): number | null => (a && b ? Math.round((Date.parse(b) - Date.parse(a)) / 60000) : null);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Un valor de `metadata` que va a pantalla solo se acepta si es una clave corta y limpia; el resto se descarta (la escribe el cliente). */
const clave = (v: unknown): string | null => (typeof v === "string" && /^[a-z_]{1,40}$/.test(v) ? v : null);
/** Cursor keyset: la página siguiente arranca después del último `id` visto. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cur = (q: any, c: string | null): PromiseLike<{ data: Fila[] | null; error: { message: string } | null; count?: number | null }> => (c ? q.gt("id", c) : q).order("id").limit(PAGINA);

export type OpcionesCarga = { hoy?: string };

export async function cargarTablero(opts: OpcionesCarga = {}): Promise<DatosTablero> {
  const HOY = opts.hoy ?? fechaAR();
  const ventanaRodante = mesAnterior(HOY.slice(0, 7), 11) + "-01";
  const DESDE = ventanaRodante > COBERTURA.ventana ? ventanaRodante : COBERTURA.ventana;
  const DESDE_UTC = medianocheARenUTC(DESDE);
  const AHORA = Date.now();
  const admin = createAdminClient();

  const [medsTestRaw, pacsRaw, medsRaw, clavesRaw, mpRaw, agendasRaw, consRaw, turnosRaw, docsRaw, slotsRaw, logRaw, evRaw, esperandoRaw, refundsRaw, alertasRaw, avisosRaw, mensajesRaw, ausenciasRaw, deudaRaw] = await Promise.all([
    traerTodo<Fila>("medicos (test)", (c) => cur(admin.from("medicos").select("id", { count: "exact" }).eq("es_cuenta_test", true), c)),
    traerTodo<Fila>("pacientes", (c) => cur(admin.from("pacientes").select("id, user_id, nombre, apellido, nombre_completo, provincia, created_at, es_cuenta_test", { count: "exact" }), c)),
    traerTodo<Fila>("medicos", (c) =>
      cur(
        admin
          .from("medicos")
          .select("id, nombre_completo, especialidad, especialidades_adicionales, jurisdicciones, provincia, categoria, disponible, disponible_desde, disponible_hasta, disponible_desde_at, created_at, verificado_at, estado_registro, dado_de_baja, identidad_validada, biometria_exenta, agenda_pausada_at, precio_consulta, modalidad_atencion, oculto_clinica, tipo_matricula, numero_matricula, celular_personal, domicilio_consultorio, foto_url, firma_manuscrita_url, es_cuenta_test", { count: "exact" })
          .in("estado_registro", ["aprobado", "pendiente_revision", "suspendido"]),
        c,
      ),
    ),
    traerTodo<Fila>("medico_claves", (c) => cur(admin.from("medico_claves").select("id, medico_id", { count: "exact" }), c)),
    traerTodo<Fila>("medicos_mp_accounts", (c) => cur(admin.from("medicos_mp_accounts").select("id, medico_id, estado, expires_at, updated_at", { count: "exact" }), c)),
    traerTodo<Fila>("agenda_modelos", (c) => cur(admin.from("agenda_modelos").select("id, medico_id, activo, fecha_fin", { count: "exact" }), c)),
    traerTodo<Fila>("consultas", (c) =>
      cur(
        admin
          .from("consultas")
          .select("id, paciente_id, medico_id, especialidad, estado, created_at, aceptada_at, en_curso_at, completada_at, desconectado_at, canal_origen, pago_id, monto, mp_status, mp_application_fee, comision_docto_pct, reintegro_estado, resolucion_motivo, resuelta_por, sala_video_url, mp_payment_created_at", { count: "exact" })
          .gte("created_at", DESDE_UTC),
        c,
      ),
    ),
    traerTodo<Fila>("turnos (atenciones)", (c) =>
      cur(
        admin
          .from("turnos")
          .select("id, medico_id, paciente_id, fecha, hora_inicio, estado, monto, pago_id, created_at, reservado_hasta, canal_origen, turno_origen_id, mp_status, mp_application_fee, comision_docto_pct, reintegro_estado, resolucion_motivo, resuelta_por, motivo_cancelacion, sala_video_url, en_curso_at, completada_at, desconectado_at, mp_payment_created_at", { count: "exact" })
          .gte("fecha", DESDE)
          .not("estado", "in", "(disponible,bloqueado,bloqueado_sin_cobro)"),
        c,
      ),
    ),
    traerTodo<Fila>("documentos", (c) => cur(admin.from("documentos").select("id, consulta_id, turno_id, tipo", { count: "exact" }).gte("created_at", DESDE_UTC), c)),
    traerTodo<Fila>("turnos (lugares)", (c) =>
      cur(admin.from("turnos").select("id, medico_id, paciente_id, fecha, hora_inicio, estado", { count: "exact" }).gte("fecha", DESDE).not("estado", "in", "(bloqueado,bloqueado_sin_cobro)"), c),
    ),
    traerTodo<Fila>("disponibilidad_log", (c) => cur(admin.from("disponibilidad_log").select("id, medico_id, online, at", { count: "exact" }).gte("at", new Date(Date.parse(DESDE_UTC) - CAP_CI_MS).toISOString()), c)),
    traerTodo<Fila>("eventos_funnel", (c) => cur(admin.from("eventos_funnel").select("id, evento, paciente_id, medico_id, metadata, created_at", { count: "exact" }).gte("created_at", DESDE_UTC).in("evento", EVENTOS), c)),
    traerTodo<Fila>("consultas (esperando)", (c) => cur(admin.from("consultas").select("id, medico_id, paciente_id, created_at", { count: "exact" }).eq("estado", "esperando"), c)),
    traerTodo<Fila>("refunds_pendientes", (c) => cur(admin.from("refunds_pendientes").select("id, tipo, medico_id, estado, intentos, creado_at, neto_medico, application_fee", { count: "exact" }).neq("estado", "resuelto"), c)),
    traerTodo<Fila>("alertas_admin", (c) => cur(admin.from("alertas_admin").select("id, tipo, titulo, severidad, entidad_tipo, created_at", { count: "exact" }).eq("estado", "pendiente"), c)),
    traerTodo<Fila>("whatsapp_envios", (c) => cur(admin.from("whatsapp_envios").select("id, medico_id, disparador, resultado, twilio_status, created_at", { count: "exact" }).gte("created_at", DESDE_UTC), c)),
    traerTodo<Fila>("mensajes_internos_medicos", (c) => cur(admin.from("mensajes_internos_medicos").select("id, medico_id, titulo, severidad, leido, created_at", { count: "exact" }).gte("created_at", DESDE_UTC), c)),
    traerTodo<Fila>("ausencias_medico", (c) => cur(admin.from("ausencias_medico").select("id, medico_id, tipo, motivo, detectado_at", { count: "exact" }), c)),
    traerTodo<Fila>("medicos_deuda", (c) => cur(admin.from("medicos_deuda").select("id, medico_id, monto, origen_tipo, estado, monto_recuperado, creado_at", { count: "exact" }), c)),
  ]);

  // ── cuentas de prueba: bilateral ─────────────────────────────────────────
  const testMed = new Set(medsTestRaw.map((m) => String(m.id)));
  const testPac = new Set<string>();
  for (const p of pacsRaw) if (bool(p.es_cuenta_test)) { testPac.add(String(p.id)); if (p.user_id) testPac.add(String(p.user_id)); }
  const esTest = (m?: string | null, p?: string | null) => (!!m && testMed.has(m)) || (!!p && testPac.has(p));

  // ── pacientes reales ─────────────────────────────────────────────────────
  const pacKey = new Map<string, string>(); // id y user_id → clave (pacientes.id)
  const pacientesBase = pacsRaw
    .filter((p) => !bool(p.es_cuenta_test))
    .map((p) => {
      const key = String(p.id);
      pacKey.set(key, key);
      if (p.user_id) pacKey.set(String(p.user_id), key);
      const nombre = lleno(p.nombre) && lleno(p.apellido) ? `${p.nombre} ${p.apellido}` : String(p.nombre_completo ?? "");
      const iniciales = nombre.split(/\s+/).filter(Boolean).map((s) => s[0].toUpperCase() + ".").slice(0, 2).join(" ") || "—";
      const alta = fechaARdeISO(String(p.created_at));
      return { key, nombre: nombre || "Sin nombre", iniciales, provincia: str(p.provincia), alta, altaSemana: lunesDeSemanaAR(String(p.created_at)) };
    });
  const pacDe = (id: unknown): string | null => (id ? pacKey.get(String(id)) ?? null : null);

  // ── profesionales ────────────────────────────────────────────────────────
  const tieneClave = new Set(clavesRaw.map((c) => String(c.medico_id)));
  const mpPorMed = new Map<string, Fila>();
  for (const c of mpRaw) {
    const id = String(c.medico_id);
    const prev = mpPorMed.get(id);
    if (!prev || String(c.updated_at ?? "") > String(prev.updated_at ?? "")) mpPorMed.set(id, c);
  }
  const agendasPorMed = new Map<string, number>();
  for (const a of agendasRaw) if (bool(a.activo) && (!a.fecha_fin || String(a.fecha_fin).slice(0, 10) >= HOY)) agendasPorMed.set(String(a.medico_id), (agendasPorMed.get(String(a.medico_id)) ?? 0) + 1);
  // Un lugar es (profesional, fecha, hora). Una cancelación del paciente re-ofrece el mismo lugar en otra fila: se cuenta una vez, y es libre si alguna de sus filas está disponible.
  const lugares = new Map<string, { medicoId: string; fecha: string; libre: boolean }>();
  for (const s of slotsRaw) {
    const medicoId = String(s.medico_id);
    if (testMed.has(medicoId) || (s.paciente_id && testPac.has(String(s.paciente_id)))) continue;
    const fecha = String(s.fecha).slice(0, 10);
    const k = `${medicoId}|${fecha}|${String(s.hora_inicio ?? "")}`;
    const e = lugares.get(k) ?? { medicoId, fecha, libre: false };
    if (s.estado === "disponible") e.libre = true;
    lugares.set(k, e);
  }
  const slotsFuturosPorMed = new Map<string, number>();
  for (const l of lugares.values()) if (l.libre && l.fecha >= HOY) slotsFuturosPorMed.set(l.medicoId, (slotsFuturosPorMed.get(l.medicoId) ?? 0) + 1);
  const ultimoOnlinePorMed = new Map<string, string>();
  for (const l of logRaw) if (bool(l.online)) { const id = String(l.medico_id); const at = String(l.at); if ((ultimoOnlinePorMed.get(id) ?? "") < at) ultimoOnlinePorMed.set(id, at); }
  const ausenciasPorMed = new Map<string, number>();
  for (const x of ausenciasRaw) ausenciasPorMed.set(String(x.medico_id), (ausenciasPorMed.get(String(x.medico_id)) ?? 0) + 1);
  const deudaPorMed = new Map<string, number>();
  for (const d of deudaRaw) if (d.estado !== "saldada") deudaPorMed.set(String(d.medico_id), (deudaPorMed.get(String(d.medico_id)) ?? 0) + num(d.monto) - num(d.monto_recuperado));

  const medicos: Medico[] = medsRaw
    .filter((m) => !bool(m.es_cuenta_test))
    .map((m) => {
      const id = String(m.id);
      const cuenta = mpPorMed.get(id);
      const mp = estadoCuentaMp(cuenta ? { estado: str(cuenta.estado), expires_at: str(cuenta.expires_at) } : null);
      const faltantes = camposFaltantesMedico(
        {
          nombre_completo: str(m.nombre_completo),
          especialidad: str(m.especialidad),
          tipo_matricula: str(m.tipo_matricula),
          numero_matricula: str(m.numero_matricula),
          celular_personal: lleno(m.celular_personal) ? "x" : null,
          domicilio_consultorio: lleno(m.domicilio_consultorio) ? "x" : null,
          foto_url: lleno(m.foto_url) ? "x" : null,
          firma_manuscrita_url: lleno(m.firma_manuscrita_url) ? "x" : null,
        },
        { mpConectado: mp === "conectado", firmaConfigurada: tieneClave.has(id) },
      ).map((c) => c.label);
      const jur = Array.isArray(m.jurisdicciones) ? (m.jurisdicciones as unknown[]).map(String) : null;
      return {
        id,
        nombre: String(m.nombre_completo ?? "—"),
        especialidad: str(m.especialidad) ?? "—",
        adicionales: Array.isArray(m.especialidades_adicionales) ? (m.especialidades_adicionales as unknown[]).map(String) : [],
        provincias: jur ?? (m.provincia ? [String(m.provincia)] : []),
        categoria: str(m.categoria),
        estado: String(m.estado_registro),
        baja: bool(m.dado_de_baja),
        aprobado: m.verificado_at ? fechaARdeISO(String(m.verificado_at)) : null,
        registro: fechaARdeISO(String(m.created_at)),
        identidad: identidadHabilitada({ identidad_validada: bool(m.identidad_validada), biometria_exenta: bool(m.biometria_exenta), es_cuenta_test: false }),
        faltantes,
        mp,
        disponible: bool(m.disponible),
        disponibleDesde: m.disponible_desde ? String(m.disponible_desde).slice(0, 5) : null,
        disponibleHasta: m.disponible_hasta ? String(m.disponible_hasta).slice(0, 5) : null,
        disponibleDesdeAt: str(m.disponible_desde_at),
        agendasActivas: agendasPorMed.get(id) ?? 0,
        agendaPausada: !!m.agenda_pausada_at,
        slotsFuturos: slotsFuturosPorMed.get(id) ?? 0,
        ultimoOnline: ultimoOnlinePorMed.has(id) ? fechaARdeISO(ultimoOnlinePorMed.get(id)!) : null,
        ausencias: ausenciasPorMed.get(id) ?? 0,
        deuda: deudaPorMed.get(id) ?? 0,
        precio: m.precio_consulta == null ? null : num(m.precio_consulta),
        modalidad: str(m.modalidad_atencion),
        ocultoClinica: bool(m.oculto_clinica),
      };
    });
  const medNombre = new Map(medicos.map((m) => [m.id, m.nombre]));
  const medEsp = new Map(medicos.map((m) => [m.id, m.especialidad]));

  // ── documentos por atención ──────────────────────────────────────────────
  const docsPorCons = new Map<string, string[]>();
  const docsPorTurno = new Map<string, string[]>();
  for (const d of docsRaw) {
    if (d.consulta_id) docsPorCons.set(String(d.consulta_id), [...(docsPorCons.get(String(d.consulta_id)) ?? []), String(d.tipo)]);
    if (d.turno_id) docsPorTurno.set(String(d.turno_id), [...(docsPorTurno.get(String(d.turno_id)) ?? []), String(d.tipo)]);
  }

  // ── consultas inmediatas ─────────────────────────────────────────────────
  const atenciones: Atencion[] = [];
  const instantePedido = new Map<string, number>(); // id → ms del pedido (CI: created_at; turno: reserva)
  let consultasTest = 0;
  for (const c of consRaw) {
    const medicoId = String(c.medico_id), pacienteId = str(c.paciente_id);
    if (esTest(medicoId, pacienteId)) { consultasTest++; continue; }
    const fila = c as unknown as FilaAtencion & { created_at: string };
    const cl = clasificarAtencion(fila);
    const creado = String(c.created_at);
    const fecha = fechaARdeISO(creado);
    const filaPago = { monto: num(c.monto), mp_status: str(c.mp_status), mp_application_fee: str(c.mp_application_fee), comision_docto_pct: str(c.comision_docto_pct), reintegro_estado: str(c.reintegro_estado), resolucion_motivo: str(c.resolucion_motivo) };
    const id = String(c.id);
    instantePedido.set(id, Date.parse(creado));
    atenciones.push({
      id, tipo: "ci", fecha, semana: lunesDeSemanaAR(creado), mes: mesDe(fecha), hora: horaARdeISO(creado), min: minutoARdeISO(creado),
      medicoId, medico: medNombre.get(medicoId) ?? "—", especialidad: str(c.especialidad) ?? medEsp.get(medicoId) ?? "—", paciente: pacDe(pacienteId),
      canal: c.canal_origen === "consultorio_privado" ? "consultorio" : "clinica",
      estado: String(c.estado), nivel: cl.nivel, desenlace: cl.desenlace, origen: cl.origenAceptacion, aceptada: cl.fueAceptada, pagada: cl.fuePagada,
      cobrado: pagada(filaPago) ? num(c.monto) : 0, fee: pagada(filaPago) ? comisionDe(filaPago) : 0,
      reintegrado: reintegrada(filaPago) ? num(c.monto) : 0, reintegroEnCurso: reintegroEnCurso(filaPago) ? num(c.monto) : 0,
      causa: str(c.resolucion_motivo), causaTexto: c.resolucion_motivo ? causaEnCriollo(String(c.resolucion_motivo)) : null, resueltaPor: str(c.resuelta_por),
      minAceptar: minutosEntre(creado, str(c.aceptada_at)), minEspera: minutosEntre(str(c.mp_payment_created_at) ?? str(c.aceptada_at), str(c.en_curso_at)),
      minDuracion: minutosEntre(str(c.en_curso_at), str(c.completada_at) ?? str(c.desconectado_at)), documentos: docsPorCons.get(id) ?? [],
    });
  }

  // ── turnos: cadena de reprogramaciones completa ──────────────────────────
  const turnoPorId = new Map(turnosRaw.map((t) => [String(t.id), t]));
  for (let nivel = 0; nivel < 6; nivel++) {
    const faltan = [...new Set(turnosRaw.map((t) => str(t.turno_origen_id)).filter((id): id is string => !!id && !turnoPorId.has(id)))];
    if (!faltan.length) break;
    const padres = await traerTodo<Fila>("turnos (raíces de cadena)", (c) =>
      cur(
        admin
          .from("turnos")
          .select("id, medico_id, paciente_id, fecha, hora_inicio, estado, monto, pago_id, created_at, reservado_hasta, canal_origen, turno_origen_id, mp_status, mp_application_fee, comision_docto_pct, reintegro_estado, resolucion_motivo, resuelta_por, motivo_cancelacion, sala_video_url, en_curso_at, completada_at, desconectado_at, mp_payment_created_at", { count: "exact" })
          .in("id", faltan),
        c,
      ),
    );
    for (const p of padres) turnoPorId.set(String(p.id), p);
    turnosRaw.push(...padres);
  }
  const tieneHijo = new Set(turnosRaw.map((t) => str(t.turno_origen_id)).filter(Boolean));
  let turnosTest = 0, reservasAbandonadas = 0, reprogramadosOrigen = 0;
  for (const t of turnosRaw) {
    const estado = String(t.estado);
    if (SLOT.has(estado)) continue;
    if (String(t.fecha) < DESDE) continue; // una raíz de cadena anterior a la ventana solo aporta su pago
    const medicoId = String(t.medico_id), pacienteId = str(t.paciente_id);
    if (esTest(medicoId, pacienteId)) { turnosTest++; continue; }
    const reserva = { estado, reservado_hasta: str(t.reservado_hasta), mp_status: str(t.mp_status) };
    if (esReservaAbandonada(reserva)) { reservasAbandonadas++; continue; }
    if (estado === "reprogramado" && tieneHijo.has(String(t.id))) { reprogramadosOrigen++; continue; }
    // La plata vive en la RAÍZ de la cadena (puede haber más de un nivel).
    let pago: Fila = t, cur: Fila = t;
    const vistos = new Set<string>();
    while (!pago.mp_status && cur.turno_origen_id && !vistos.has(String(cur.turno_origen_id))) {
      vistos.add(String(cur.turno_origen_id));
      const o = turnoPorId.get(String(cur.turno_origen_id));
      if (!o) break;
      cur = o;
      if (o.mp_status) pago = o;
    }
    const filaPago = { monto: num(pago.monto ?? t.monto), mp_status: str(pago.mp_status), mp_application_fee: str(pago.mp_application_fee), comision_docto_pct: str(pago.comision_docto_pct), reintegro_estado: str(t.reintegro_estado) ?? str(pago.reintegro_estado), resolucion_motivo: str(t.resolucion_motivo) };
    const filaClas: FilaAtencion = { estado, mp_status: filaPago.mp_status, pago_id: str(pago.pago_id), resuelta_por: str(t.resuelta_por), resolucion_motivo: str(t.resolucion_motivo), sala_video_url: str(t.sala_video_url), en_curso_at: str(t.en_curso_at) };
    const viva = esReservaViva({ estado, reservado_hasta: str(t.reservado_hasta), mp_status: filaPago.mp_status });
    const cl = clasificarTurno(filaClas);
    const fecha = String(t.fecha).slice(0, 10);
    const hi = String(t.hora_inicio ?? "00:00");
    const id = String(t.id);
    const reservadoMs = Date.parse(String(t.created_at));
    instantePedido.set(id, reservadoMs);
    atenciones.push({
      id, tipo: "turno", fecha, semana: lunesDeSemanaAR(fecha + "T12:00:00Z"), mes: mesDe(fecha), hora: parseInt(hi.slice(0, 2), 10) || 0, min: parseInt(hi.slice(3, 5), 10) || 0,
      medicoId, medico: medNombre.get(medicoId) ?? "—", especialidad: medEsp.get(medicoId) ?? "—", paciente: pacDe(pacienteId),
      canal: t.canal_origen === "consultorio_privado" ? "consultorio" : "clinica",
      estado: viva ? "reservando" : estado, nivel: cl.nivel, desenlace: cl.desenlace, origen: cl.origenAceptacion, aceptada: cl.fueAceptada, pagada: cl.fuePagada,
      cobrado: pagada(filaPago) ? filaPago.monto : 0, fee: pagada(filaPago) ? comisionDe(filaPago) : 0,
      reintegrado: reintegrada(filaPago) ? filaPago.monto : 0, reintegroEnCurso: reintegroEnCurso(filaPago) ? filaPago.monto : 0,
      causa: str(t.resolucion_motivo) ?? (t.motivo_cancelacion ? "motivo_libre" : null), causaTexto: t.resolucion_motivo ? causaEnCriollo(String(t.resolucion_motivo)) : str(t.motivo_cancelacion), resueltaPor: str(t.resuelta_por),
      minAceptar: null, minEspera: null, minDuracion: minutosEntre(str(t.en_curso_at), str(t.completada_at) ?? str(t.desconectado_at)), documentos: docsPorTurno.get(id) ?? [],
      reservadoEl: fechaARdeISO(String(t.created_at)), reservadoMs, origenTurno: !!t.turno_origen_id,
    });
  }

  // ── oferta: lugares publicados (libres + tomados) y horas de CI ──────────
  const slotsAgg = new Map<string, Slot>();
  for (const l of lugares.values()) {
    const k = l.medicoId + "|" + l.fecha;
    const e = slotsAgg.get(k) ?? { medicoId: l.medicoId, fecha: l.fecha, n: 0, libres: 0 };
    e.n++;
    if (l.libre) e.libres++;
    slotsAgg.set(k, e);
  }
  const slots = [...slotsAgg.values()].sort((a, b) => a.fecha.localeCompare(b.fecha));

  const porMed = new Map<string, { online: boolean; at: number }[]>();
  for (const l of [...logRaw].sort((a, b) => String(a.at).localeCompare(String(b.at)))) {
    const id = String(l.medico_id);
    if (testMed.has(id)) continue;
    const arr = porMed.get(id) ?? [];
    arr.push({ online: bool(l.online), at: Date.parse(String(l.at)) });
    porMed.set(id, arr);
  }
  const ciHoras: CiHora[] = [];
  const distribuir = (medicoId: string, start: number, end: number) => {
    let t = Math.max(start, Date.parse(DESDE_UTC));
    while (t < end) {
      const arMs = t - 3 * 3600_000;
      const hora = Math.floor(arMs / 3600_000) % 24;
      const next = (Math.floor(arMs / 3600_000) + 1) * 3600_000 + 3 * 3600_000;
      const fin = Math.min(end, next);
      const iso = new Date(t).toISOString();
      const fecha = fechaARdeISO(iso);
      ciHoras.push({ medicoId, fecha, hora, horas: (fin - t) / 3600_000 });
      t = fin;
    }
  };
  for (const [id, evs] of porMed) {
    let open: number | null = null;
    for (const e of evs) {
      if (e.online) { if (open === null) open = e.at; }
      else if (open !== null) { distribuir(id, open, e.at); open = null; }
    }
    if (open !== null) distribuir(id, open, Math.min(AHORA, open + CAP_CI_MS));
  }
  const medsVerif = medicos.filter((m) => m.estado === "aprobado" && !m.baja);
  const ciOnlineEn = (tMs: number, prov: string | null): number => {
    let n = 0;
    for (const m of medsVerif) {
      if (prov && !m.provincias.includes(prov)) continue;
      const arr = porMed.get(m.id);
      if (!arr) continue;
      let est = false;
      for (const e of arr) { if (e.at > tMs) break; est = e.online; }
      if (est) n++;
    }
    return n;
  };

  // ── búsquedas: sesiones de vistas de la clínica ──────────────────────────
  type Snap = { provincia?: string; medicosVisibles?: number; ciOnline?: number; conAgendaTurnos?: number };
  type Sesion = { pac: string; t0: number; tFin: number; vistas: number; snap: Snap | null };
  const eventos = [...evRaw]
    .filter((e) => e.paciente_id && !esTest(null, String(e.paciente_id)))
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  const sesiones: Sesion[] = [];
  const ultima = new Map<string, Sesion>();
  for (const e of eventos) {
    if (e.evento !== "clinica_vista") continue;
    const pac = String(e.paciente_id);
    const t = Date.parse(String(e.created_at));
    const meta = (e.metadata ?? {}) as Snap;
    const conSnap = meta.provincia != null || meta.medicosVisibles != null;
    const prev = ultima.get(pac);
    if (prev && t - prev.tFin <= SESION_GAP_MS) { prev.tFin = t; prev.vistas++; if (conSnap && !prev.snap) prev.snap = meta; }
    else { const s: Sesion = { pac, t0: t, tFin: t, vistas: 1, snap: conSnap ? meta : null }; sesiones.push(s); ultima.set(pac, s); }
  }
  type Avance = { evento: string; t: number; modo: string | null; medicoId: string | null; paso: string | null };
  const avances = new Map<string, Avance[]>();
  for (const e of eventos) {
    if (e.evento === "clinica_vista") continue;
    const meta = (e.metadata ?? {}) as { modo?: string; medicoId?: string; paso?: string; motivo?: string };
    const pac = String(e.paciente_id);
    const arr = avances.get(pac) ?? [];
    arr.push({ evento: String(e.evento), t: Date.parse(String(e.created_at)), modo: clave(meta.modo), medicoId: typeof meta.medicoId === "string" && UUID.test(meta.medicoId) ? meta.medicoId : null, paso: clave(meta.paso) ?? clave(meta.motivo) });
    avances.set(pac, arr);
  }
  // Pedidos de CI por paciente (user_id), ya clasificados; y todas las atenciones por clave de paciente con el instante del pedido.
  const consPorPac = new Map<string, { t: number; medicoId: string; cl: ReturnType<typeof clasificarAtencion> }[]>();
  for (const c of consRaw) {
    if (esTest(String(c.medico_id), str(c.paciente_id)) || !c.paciente_id) continue;
    const arr = consPorPac.get(String(c.paciente_id)) ?? [];
    arr.push({ t: Date.parse(String(c.created_at)), medicoId: String(c.medico_id), cl: clasificarAtencion(c as unknown as FilaAtencion) });
    consPorPac.set(String(c.paciente_id), arr);
  }
  const atPorPac = new Map<string, { t: number; a: Atencion }[]>();
  for (const a of atenciones) {
    if (!a.paciente) continue;
    const arr = atPorPac.get(a.paciente) ?? [];
    arr.push({ t: instantePedido.get(a.id) ?? 0, a });
    atPorPac.set(a.paciente, arr);
  }
  const pacProvUser = new Map<string, string | null>();
  for (const p of pacsRaw) { pacProvUser.set(String(p.id), str(p.provincia)); if (p.user_id) pacProvUser.set(String(p.user_id), str(p.provincia)); }
  // Cada atención se acredita a UNA sola búsqueda: la última cuyo inicio la precede dentro de la ventana.
  const sesionDe = (pac: string, t: number): Sesion | null => {
    let mejor: Sesion | null = null;
    for (const s of sesiones) {
      if (s.pac !== pac) continue;
      if (t >= s.t0 && t <= s.tFin + VENTANA_RESULTADO_MS && (!mejor || s.t0 > mejor.t0)) mejor = s;
    }
    return mejor;
  };
  const busquedas: Busqueda[] = sesiones.map((s) => {
    const prov = (typeof s.snap?.provincia === "string" && s.snap.provincia.length <= 40 ? s.snap.provincia : null) ?? pacProvUser.get(s.pac) ?? null;
    const medicosProv = s.snap?.medicosVisibles ?? (prov ? medsVerif.filter((m) => m.provincias.includes(prov)).length : 0);
    const ciOnline = s.snap?.ciOnline ?? ciOnlineEn(s.t0, prov);
    const en = (t: number) => t >= s.t0 && t <= s.tFin + VENTANA_RESULTADO_MS;
    const av = (avances.get(s.pac) ?? []).filter((a) => en(a.t));
    const elecciones = av.filter((a) => a.evento === "medico_elegido" && a.modo !== "lead");
    const eligio = elecciones.length > 0;
    const llegoAlPago = av.some((a) => a.evento === "pago_creado" || a.evento === "pago_vista");
    const key = pacDe(s.pac);
    const mias = (key ? atPorPac.get(key) ?? [] : []).filter((x) => sesionDe(s.pac, x.t) === s).map((x) => x.a);
    const cons = (consPorPac.get(s.pac) ?? []).filter((c) => en(c.t) && sesionDe(s.pac, c.t) === s);
    const seAtendio = mias.some((a) => a.desenlace === "atendida");
    const pago = mias.some((a) => a.pagada); // plata acreditada; un checkout abierto no cuenta
    const alguienAcepto = cons.some((c) => c.cl.fueAceptada);
    const desenlaces: DesenlacePedido[] = cons.map((c) => c.cl.desenlace as DesenlacePedido);
    const consIds = new Set(cons.map((c) => c.medicoId));
    for (const el of elecciones) if (el.medicoId && !consIds.has(el.medicoId)) desenlaces.push(el.modo === "turno" ? "no_reservo" : "no_pidio");
    const r = decidirResultado({ provincia: prov, medicosProvincia: medicosProv, ciOnline, hayOfertaEnElPais: medsVerif.length > 0, seAtendio, pago, eligio, alguienAcepto, desenlaces });
    const triage = av.filter((a) => a.evento === "triage_paso").map((a) => a.paso).filter((x): x is string => !!x);
    const bloqueo = av.find((a) => a.evento === "triage_bloqueado")?.paso ?? null;
    const iso = new Date(s.t0).toISOString();
    const fecha = fechaARdeISO(iso);
    // Solo un profesional que existe en la lista: el id lo escribe el cliente.
    const elegido = elecciones[0]?.medicoId && medNombre.has(elecciones[0].medicoId) ? elecciones[0].medicoId : null;
    return {
      fecha, semana: lunesDeSemanaAR(iso), mes: mesDe(fecha), hora: horaARdeISO(iso), min: minutoARdeISO(iso),
      paciente: key, provincia: prov, medicosProv, ciOnline, agendaTurnos: s.snap?.conAgendaTurnos ?? null, fotoExacta: !!s.snap, vistas: s.vistas,
      eligio, modo: elecciones[0]?.modo ?? null, medicoElegido: elegido ? medNombre.get(elegido) ?? "—" : null, medicoElegidoId: elegido,
      pidio: mias.length > 0, llegoAlPago, pago, seAtendio, atenciones: mias.map((a) => a.id),
      resultado: r.resultado, matchHabia: r.matchHabia, triage: triage.at(-1) ?? null, bloqueo,
    };
  });

  // ── pacientes: activación ────────────────────────────────────────────────
  const vioClinica = new Set(eventos.filter((e) => e.evento === "clinica_vista").map((e) => pacDe(e.paciente_id)));
  const eligioAlguien = new Set(eventos.filter((e) => e.evento === "medico_elegido").map((e) => pacDe(e.paciente_id)));
  const pidio = new Set(atenciones.map((a) => a.paciente));
  const consulto = new Map<string, string[]>();
  for (const a of atenciones) {
    if (a.nivel === "consulta" && (a.pagada || a.desenlace === "atendida") && a.paciente) consulto.set(a.paciente, [...(consulto.get(a.paciente) ?? []), a.fecha]);
  }
  const pacientes: Paciente[] = pacientesBase.map((p) => ({
    ...p,
    vioClinica: vioClinica.has(p.key),
    eligio: eligioAlguien.has(p.key),
    pidio: pidio.has(p.key),
    consultas: (consulto.get(p.key) ?? []).length,
    primeraConsulta: (consulto.get(p.key) ?? []).sort()[0] ?? null,
  }));

  // ── lo que espera acción ahora ───────────────────────────────────────────
  const esperando = esperandoRaw
    .filter((c) => !esTest(String(c.medico_id), str(c.paciente_id)))
    .map((c) => ({ id: String(c.id), medico: medNombre.get(String(c.medico_id)) ?? "—", medicoId: String(c.medico_id), paciente: pacDe(c.paciente_id), desde: String(c.created_at), min: Math.round((AHORA - Date.parse(String(c.created_at))) / 60000) }));

  const datos: DatosTablero = {
    generado: new Date().toISOString(),
    hoy: HOY,
    cobertura: COBERTURA,
    ocultos: { consultasTest, turnosTest, reservasAbandonadas, reprogramadosOrigen },
    atenciones,
    pacientes,
    busquedas,
    slots,
    ciHoras,
    medicos,
    esperando,
    refunds: refundsRaw.map((r) => ({ id: String(r.id), tipo: String(r.tipo ?? ""), medico: medNombre.get(String(r.medico_id)) ?? "—", estado: String(r.estado), intentos: num(r.intentos), desde: fechaARdeISO(String(r.creado_at)), neto: num(r.neto_medico), fee: num(r.application_fee) })),
    alertas: alertasRaw.map((a) => ({ id: String(a.id), tipo: String(a.tipo ?? ""), titulo: String(a.titulo ?? ""), severidad: String(a.severidad ?? ""), entidad: str(a.entidad_tipo), fecha: fechaARdeISO(String(a.created_at)) })),
    avisos: avisosRaw.filter((a) => !testMed.has(String(a.medico_id))).map((a) => { const c = String(a.created_at); const f = fechaARdeISO(c); return { medicoId: String(a.medico_id), fecha: f, hora: horaARdeISO(c), min: minutoARdeISO(c), mes: mesDe(f), disparador: str(a.disparador), resultado: str(a.resultado), entrega: str(a.twilio_status) }; }),
    mensajes: mensajesRaw.filter((a) => !testMed.has(String(a.medico_id))).map((a) => { const c = String(a.created_at); return { medicoId: String(a.medico_id), fecha: fechaARdeISO(c), hora: horaARdeISO(c), min: minutoARdeISO(c), titulo: String(a.titulo ?? ""), severidad: str(a.severidad), leido: bool(a.leido) }; }),
    ausencias: ausenciasRaw.filter((a) => !testMed.has(String(a.medico_id))).map((a) => ({ medicoId: String(a.medico_id), fecha: fechaARdeISO(String(a.detectado_at)), tipo: String(a.tipo ?? ""), motivo: str(a.motivo) })),
    deuda: deudaRaw.filter((d) => !testMed.has(String(d.medico_id))).map((d) => ({ medicoId: String(d.medico_id), monto: num(d.monto), origen: str(d.origen_tipo), estado: String(d.estado), recuperado: num(d.monto_recuperado), fecha: fechaARdeISO(String(d.creado_at)) })),
  };
  return datos;
}
