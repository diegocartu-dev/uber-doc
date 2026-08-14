import type { SupabaseClient } from "@supabase/supabase-js";
import { insertarSlotsSinDuplicar } from "@/lib/agenda/insertar-slots";
import { createAdminClient } from "@/lib/supabase/admin";
import { perfilMedicoCompleto, camposFaltantesMedico } from "@/lib/perfil-medico";
import { esInstitucional } from "@/lib/instancia";

// ─────────────────────────────────────────────────────────────────────────────
// crearAgendaModelo — ÚNICO punto de verdad para crear una agenda (modelo +
// franjas + turnos), con rango de fechas y recurrencia por día de semana.
//
// Lo usan tanto el formulario manual del médico como Nova (asistente IA), para
// honrar el principio "Nova y el botón son la misma acción, un solo origen".
//
// Garantías:
//  - NUNCA crea encima de un turno YA RESERVADO por un paciente (freno duro).
//  - Para choques con agendas VACÍAS (slots disponibles/bloqueados), aplica la
//    resolución "el modelo más nuevo gana": bloquea los viejos que se pisan.
//    No genera doble reserva.
// ─────────────────────────────────────────────────────────────────────────────

export type Franja = { dia_semana: number; hora_inicio: string; hora_fin: string };

export type CrearAgendaInput = {
  /** medicos.id (PK) — NO el auth user id. turnos.medico_id referencia medicos.id. */
  medicoId: string;
  nombre: string;
  fecha_inicio: string; // YYYY-MM-DD
  fecha_fin: string; // YYYY-MM-DD
  duracion_turno: number; // minutos
  precio: number;
  franjas: Franja[]; // dia_semana: 1=lunes … 7=domingo
  /**
   * B2C: 'clinica_virtual' | 'consultorio_privado'. Instancia institucional
   * (spec institucional §4.7): 'acordado' (la levanta la institución) |
   * 'ofrecido' (la publica el profesional). En modo institucional los canales
   * B2C que manda la UI clonada del médico se MAPEAN a 'ofrecido' — así el
   * médico conserva su pantalla sin tocarla (regla de clonado).
   */
  canal_origen: "clinica_virtual" | "consultorio_privado" | "acordado" | "ofrecido";
  creado_por_nova?: boolean;
};

export type ConflictoConPaciente = {
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  estado: string;
};

export type CrearAgendaResult =
  | { ok: false; motivo: "validacion"; mensaje: string }
  | { ok: false; motivo: "conflicto_pacientes"; conflictos: ConflictoConPaciente[]; mensaje: string }
  | { ok: false; motivo: "conflicto_agenda"; mensaje: string }
  | {
      ok: true;
      modeloId: string;
      turnosCreados: number;
      dias: number;
      agendasViejasBloqueadas: number;
    };

// Estados que significan "un paciente está comprometido con este turno futuro".
// Clasificamos por ESTADO, no por paciente_id: los turnos cancelados/reprogramados
// RETIENEN paciente_id pero NO ocupan el slot (hallazgo de Roberto).
const ESTADOS_OCUPADOS_CON_PACIENTE = ["reservado_pendiente", "confirmado", "en_espera", "en_curso"];

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const HORA_RE = /^\d{2}:\d{2}(:\d{2})?$/;

/** "HH:MM" o "HH:MM:SS" → minutos desde medianoche. */
function aMinutos(hora: string): number {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
}

/** JS getDay() (0=domingo) → DB dia_semana (1=lunes … 7=domingo). */
function jsDayToDbDay(jsDay: number): number {
  return jsDay === 0 ? 7 : jsDay;
}

const DIAS_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
/** "2026-06-30" → "el martes 30/6" (para mensajes al médico). Pivot T12:00:00 para no
 *  caer en el drift de zona horaria (new Date("YYYY-MM-DD") interpreta UTC → día anterior). */
function fechaAmigable(fecha: string): string {
  const d = new Date(fecha + "T12:00:00");
  return `el ${DIAS_SEMANA[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
}

/** Genera los slots [inicio,fin) de duración fija dentro de una franja. */
function generarSlots(
  horaInicio: string,
  horaFin: string,
  duracion: number
): { hora_inicio: string; hora_fin: string }[] {
  const slots: { hora_inicio: string; hora_fin: string }[] = [];
  let cursor = aMinutos(horaInicio);
  const fin = aMinutos(horaFin);
  while (cursor + duracion <= fin) {
    const ini = `${Math.floor(cursor / 60).toString().padStart(2, "0")}:${(cursor % 60).toString().padStart(2, "0")}`;
    const f = cursor + duracion;
    const finSlot = `${Math.floor(f / 60).toString().padStart(2, "0")}:${(f % 60).toString().padStart(2, "0")}`;
    slots.push({ hora_inicio: ini, hora_fin: finSlot });
    cursor = f;
  }
  return slots;
}

export async function crearAgendaModelo(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  input: CrearAgendaInput
): Promise<CrearAgendaResult> {
  const { medicoId, nombre, fecha_inicio, fecha_fin, duracion_turno, franjas } = input;
  let { precio, canal_origen } = input;

  // ── MODO INSTITUCIONAL (spec institucional §4.7) — deltas gateados ─────────
  // En B2C, esInstitucional() es false y este bloque no ejecuta NADA: los
  // canales institucionales se rechazan y todo sigue byte a byte idéntico.
  const esInst = esInstitucional();
  if (!esInst && (canal_origen === "acordado" || canal_origen === "ofrecido")) {
    return { ok: false, motivo: "validacion", mensaje: "Canal de agenda inválido." };
  }
  if (esInst) {
    // 1. Canal SIEMPRE explícito de los dos motores institucionales. La UI
    //    clonada del médico manda 'clinica_virtual'/'consultorio_privado' →
    //    acá eso ES el motor "ofrecido" (horarios que publica el profesional).
    //    El caller institucional (/admin/agendas) manda 'acordado'.
    if (canal_origen !== "acordado" && canal_origen !== "ofrecido") {
      canal_origen = "ofrecido";
    }

    // 2. La duración del slot la define la INSTITUCIÓN, no el médico (decisión
    //    12/08; institucion_config.slot_duracion_min). Se RECHAZA cualquier
    //    otra — vale para el panel institucional Y para la agenda ofrecida.
    const { getConfigInstitucion } = await import("@/lib/institucional/config");
    const config = await getConfigInstitucion();
    if (duracion_turno !== config.slot_duracion_min) {
      return {
        ok: false,
        motivo: "validacion",
        mensaje: `En esta institución la duración de la consulta es de ${config.slot_duracion_min} minutos (la define la institución).`,
      };
    }

    // 3. El paciente no paga NUNCA (R2): el precio de la agenda es 0 siempre.
    //    El precio real por consulta vive en la config comercial (metering).
    precio = 0;

    // 4. Gate del paso 0: se saltea la pata Mercado Pago (acá nadie cobra por
    //    la plataforma), la FIRMA sí queda — sostiene el pie del documento.
    //    REFEPS ya se gateó en la aprobación del profesional.
    const adminGate = createAdminClient();
    const [medicoInstRes, clavesRes] = await Promise.all([
      adminGate
        .from("medicos")
        .select("id, firma_manuscrita_url, demo_sesion_id")
        .eq("id", medicoId)
        .maybeSingle(),
      adminGate.from("medico_claves").select("id").eq("medico_id", medicoId).maybeSingle(),
    ]);
    if (medicoInstRes.error || !medicoInstRes.data) {
      return { ok: false, motivo: "validacion", mensaje: "No se pudo verificar el perfil del profesional. Probá de nuevo." };
    }
    // Cuenta de DEMOSTRACIÓN (migración 025): exenta del gate de firma, por el
    // mismo motivo por el que `es_cuenta_test` exime del perfil completo y de
    // REFEPS en el B2C — el participante de una reunión no es un profesional
    // matriculado y no puede cumplir un requisito pensado para uno. La firma
    // existe para sostener el pie del documento; el documento de una demo NO se
    // sostiene: se marca "SIN VALIDEZ LEGAL" de punta a punta.
    const esDemo = medicoInstRes.data.demo_sesion_id != null;
    if (!esDemo && (!medicoInstRes.data.firma_manuscrita_url || !clavesRes.data)) {
      return {
        ok: false,
        motivo: "validacion",
        mensaje: "El profesional todavía no tiene la firma configurada. Sin firma no hay documentos válidos: configurala antes de abrir la agenda.",
      };
    }
  } else {
  // 0. Gate duro (Diego 20/07): sin Mercado Pago activo (+ perfil completo:
  // firma, celular, etc.) NO se publica agenda — el paciente reservaría y el
  // pago explotaría contra una cuenta MP inexistente. Espejo exacto del gate
  // de "disponible" (dashboard/actions.ts). Vale para el formulario Y para
  // Nova (ambos entran por acá — único punto de verdad). Cuentas test exentas
  // vía perfilMedicoCompleto. Lecturas por SERVICE ROLE: la completitud
  // incluye celular_personal (sin GRANT para authenticated — el cliente RLS
  // devolvería null silencioso, lección del outage 19-24/06).
  const adminGate = createAdminClient();
  const [medicoRes, mpRes, firmaRes] = await Promise.all([
    adminGate
      .from("medicos")
      .select(
        "nombre_completo, especialidad, tipo_matricula, numero_matricula, telefono, celular_personal, domicilio_consultorio, foto_url, firma_manuscrita_url, es_cuenta_test"
      )
      .eq("id", medicoId)
      .maybeSingle(),
    adminGate
      .from("medicos_mp_accounts")
      .select("estado")
      .eq("medico_id", medicoId)
      .eq("estado", "activo")
      .maybeSingle(),
    adminGate.from("medico_claves").select("id").eq("medico_id", medicoId).maybeSingle(),
  ]);
  if (medicoRes.error || !medicoRes.data) {
    return { ok: false, motivo: "validacion", mensaje: "No se pudo verificar tu perfil. Probá de nuevo." };
  }
  const onbGate = { mpConectado: !!mpRes.data, firmaConfigurada: !!firmaRes.data };
  if (!perfilMedicoCompleto(medicoRes.data, onbGate)) {
    const faltan = camposFaltantesMedico(medicoRes.data, onbGate).map((c) => c.label);
    return {
      ok: false,
      motivo: "validacion",
      mensaje: `Antes de abrir tu agenda completá tu perfil para poder cobrar y firmar. Falta: ${faltan.join(", ")}.`,
    };
  }
  }

  // 1. Validación
  if (!nombre?.trim() || !fecha_inicio || !fecha_fin || !franjas || franjas.length === 0) {
    return { ok: false, motivo: "validacion", mensaje: "Faltan datos: nombre, fechas o al menos una franja." };
  }
  if (!FECHA_RE.test(fecha_inicio) || !FECHA_RE.test(fecha_fin)) {
    return { ok: false, motivo: "validacion", mensaje: "Formato de fecha inválido (esperado YYYY-MM-DD)." };
  }
  if (fecha_inicio > fecha_fin) {
    return { ok: false, motivo: "validacion", mensaje: "La fecha de inicio no puede ser posterior a la de fin." };
  }
  // Regla Diego 17/07: vigencia máxima 60 días — sin agendas eternas (terminan
  // ofreciendo turnos que nadie atiende, por olvido o error). Autoridad server:
  // cubre el form, Nova y cualquier caller futuro.
  {
    const maxFin = new Date(fecha_inicio + "T12:00:00");
    maxFin.setDate(maxFin.getDate() + 60);
    const maxFinISO = `${maxFin.getFullYear()}-${(maxFin.getMonth() + 1).toString().padStart(2, "0")}-${maxFin.getDate().toString().padStart(2, "0")}`;
    if (fecha_fin > maxFinISO) {
      return { ok: false, motivo: "validacion", mensaje: "Una agenda puede durar hasta 60 días. Creála con un fin dentro de ese plazo y renovála cuando venza." };
    }
  }
  if (!Number.isFinite(duracion_turno) || duracion_turno <= 0) {
    return { ok: false, motivo: "validacion", mensaje: "La duración del turno debe ser un número positivo." };
  }
  // Invariante (mismo espíritu que #270): una agenda sin precio genera slots
  // imposibles de pagar (crear-v2 los rechaza con 422). Corta acá — cubre el form
  // Y el camino de Nova, que cae a medicos.precio_consulta (NULL en médicos nuevos).
  // En modo institucional NO aplica: el precio se forzó a 0 arriba (el paciente
  // no paga; crear-v2 está apagado por Capa B).
  if (!esInst && (!Number.isFinite(precio) || precio <= 0)) {
    return { ok: false, motivo: "validacion", mensaje: "Poné el valor de la consulta para esta agenda." };
  }
  for (const f of franjas) {
    if (!HORA_RE.test(f.hora_inicio) || !HORA_RE.test(f.hora_fin) || aMinutos(f.hora_inicio) >= aMinutos(f.hora_fin)) {
      return { ok: false, motivo: "validacion", mensaje: "Franja horaria inválida (inicio debe ser anterior a fin)." };
    }
    if (f.dia_semana < 1 || f.dia_semana > 7) {
      return { ok: false, motivo: "validacion", mensaje: "Día de semana inválido (esperado 1=lunes … 7=domingo)." };
    }
  }

  // 2. Calcular los slots que ocuparía la agenda nueva, por fecha
  const franjasPorDia = new Map<number, Franja[]>();
  for (const f of franjas) {
    const arr = franjasPorDia.get(f.dia_semana) ?? [];
    arr.push(f);
    franjasPorDia.set(f.dia_semana, arr);
  }

  type SlotNuevo = { fecha: string; hora_inicio: string; hora_fin: string };
  const slotsNuevos: SlotNuevo[] = [];
  let diasConFranja = 0;

  const inicio = new Date(fecha_inicio + "T12:00:00");
  // Cap de generación inicial a 30 días: el cron generar-slots extiende el
  // horizonte día a día hasta fecha_fin (min(fecha_fin, hoy+30)), igual que
  // siempre. Alinea el productor on-demand con el horizonte real de reserva del
  // paciente (30 días) y acota el batch inicial (una agenda de 60 días no
  // necesita sus ~última quincena materializada el día uno).
  const finRango = new Date(fecha_fin + "T12:00:00");
  const cap = new Date();
  cap.setDate(cap.getDate() + 30);
  cap.setHours(12, 0, 0, 0);
  const fin = finRango < cap ? finRango : cap;
  for (let d = new Date(inicio); d <= fin; d.setDate(d.getDate() + 1)) {
    const dbDay = jsDayToDbDay(d.getDay());
    const franjasDelDia = franjasPorDia.get(dbDay);
    if (!franjasDelDia) continue;
    const fecha = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")}`;
    let huboSlot = false;
    for (const franja of franjasDelDia) {
      for (const s of generarSlots(franja.hora_inicio, franja.hora_fin, duracion_turno)) {
        slotsNuevos.push({ fecha, hora_inicio: s.hora_inicio, hora_fin: s.hora_fin });
        huboSlot = true;
      }
    }
    if (huboSlot) diasConFranja++;
  }

  // Con el cap de 30 días, una agenda que arranca más adelante genera 0 slots
  // AHORA y el cron los crea cuando el horizonte la alcanza — eso es válido.
  // Solo es error si el rango completo quedó dentro del horizonte y aun así no
  // salió ningún turno (franjas más cortas que la duración, etc.).
  if (slotsNuevos.length === 0 && finRango <= cap) {
    return { ok: false, motivo: "validacion", mensaje: "El rango y la duración no permiten crear ningún turno." };
  }

  // 3. FRENO DURO: ¿algún slot nuevo se pisa con un turno YA RESERVADO por paciente?
  const { data: ocupados } = await supabase
    .from("turnos")
    .select("fecha, hora_inicio, hora_fin, estado")
    .eq("medico_id", medicoId)
    .gte("fecha", fecha_inicio)
    .lte("fecha", fecha_fin)
    .in("estado", ESTADOS_OCUPADOS_CON_PACIENTE);

  if (ocupados && ocupados.length > 0) {
    // Intersección precisa por (fecha + solape de horas). Dos intervalos [a,b) y
    // [c,d) se pisan si a < d && c < b.
    const conflictos: ConflictoConPaciente[] = [];
    for (const t of ocupados) {
      const tIni = aMinutos(t.hora_inicio);
      const tFin = aMinutos(t.hora_fin);
      const choca = slotsNuevos.some(
        (s) => s.fecha === t.fecha && aMinutos(s.hora_inicio) < tFin && tIni < aMinutos(s.hora_fin)
      );
      if (choca) {
        conflictos.push({ fecha: t.fecha, hora_inicio: t.hora_inicio, hora_fin: t.hora_fin, estado: t.estado });
      }
    }
    if (conflictos.length > 0) {
      return {
        ok: false,
        motivo: "conflicto_pacientes",
        conflictos,
        mensaje: `Hay ${conflictos.length} turno${conflictos.length > 1 ? "s" : ""} reservado${conflictos.length > 1 ? "s" : ""} por pacientes en ese horario. No creo nada para no generar una doble reserva: revisá esa agenda manualmente si querés modificarla.`,
      };
    }
  }

  // 3.5. R1 — no crear una agenda que se PISE EN HORARIO con otra agenda ya existente
  //      (turnos disponibles de otro modelo, CUALQUIER canal). El médico no puede atender
  //      dos cosas a la vez → se bloquea con aviso y NO se crea nada. Ojo: dos agendas que
  //      NO se pisan en horario (aunque compartan el día / sean de otro canal) SÍ conviven
  //      (eso lo resuelve la coexistencia canal+hora-aware — BUG2). El índice único no
  //      incluye canal, así que además el mismo horario exacto entre canales no podría
  //      coexistir a nivel de datos: bloquear al crear es lo correcto y honesto.
  const { data: agendados } = await supabase
    .from("turnos")
    .select("fecha, hora_inicio, hora_fin, canal_origen")
    .eq("medico_id", medicoId)
    .eq("estado", "disponible")
    .gte("fecha", fecha_inicio)
    .lte("fecha", fecha_fin);

  if (agendados && agendados.length > 0) {
    const choque = agendados.find((t) => {
      const tIni = aMinutos(t.hora_inicio);
      const tFin = aMinutos(t.hora_fin);
      return slotsNuevos.some(
        (s) => s.fecha === t.fecha && aMinutos(s.hora_inicio) < tFin && tIni < aMinutos(s.hora_fin)
      );
    });
    if (choque) {
      const NOMBRES_CANAL: Record<string, string> = {
        consultorio_privado: "Consultorio particular",
        clinica_virtual: "Clínica virtual",
        // Motores institucionales (solo aparecen en la instancia):
        acordado: "Turno acordado",
        ofrecido: "Turno ofrecido",
      };
      const canalNombre = NOMBRES_CANAL[choque.canal_origen] ?? "Clínica virtual";
      return {
        ok: false,
        motivo: "conflicto_agenda",
        mensaje: `Ya tenés una agenda de ${canalNombre} que se pisa con ese horario (${fechaAmigable(choque.fecha)} desde las ${choque.hora_inicio.slice(0, 5)}). Elegí otro horario o editá la agenda que ya tenés.`,
      };
    }
  }

  // 4. INSERT del modelo
  const { data: modelo, error: errModelo } = await supabase
    .from("agenda_modelos")
    .insert({
      medico_id: medicoId,
      nombre,
      fecha_inicio,
      fecha_fin,
      duracion_turno,
      precio,
      canal_origen,
      activo: true,
      creado_por_nova: input.creado_por_nova ?? false,
    })
    .select("id")
    .single();

  if (errModelo || !modelo) {
    // Logueamos la causa real (RLS, constraint, conexión) en vez de enmascararla
    // como error de validación — facilita el diagnóstico. No hay PII acá.
    console.error("[crearAgendaModelo] insert agenda_modelos falló:", errModelo?.message);
    return { ok: false, motivo: "validacion", mensaje: "No se pudo crear el modelo de agenda." };
  }

  // 5. INSERT de franjas. Si falla, los turnos se crean igual, PERO la idempotencia
  // del caller compara franjas → si no se guardaron, no detectaría un duplicado.
  // Logueamos para no perder la causa.
  const { error: errFranjas } = await supabase.from("agenda_franjas").insert(
    franjas.map((f) => ({
      modelo_id: modelo.id,
      dia_semana: f.dia_semana,
      hora_inicio: f.hora_inicio,
      hora_fin: f.hora_fin,
    }))
  );
  if (errFranjas) {
    console.error("[crearAgendaModelo] insert agenda_franjas falló:", errFranjas.message);
  }

  // 6. INSERT de turnos vía helper compartido (idempotente contra slots ACTIVOS).
  // Gate Roberto #261: acá había un upsert onConflict que (a) REQUIERE el índice
  // único total — con el índice parcial 20260713 fallaría ENTERO en cada creación
  // de agenda — y (b) descartaba el error → modelo+franjas creados con CERO turnos
  // y mensaje de éxito (agenda huérfana silenciosa, en el flujo de onboarding).
  const turnosParaInsertar = slotsNuevos.map((s) => ({
    medico_id: medicoId,
    modelo_id: modelo.id,
    fecha: s.fecha,
    hora_inicio: s.hora_inicio,
    hora_fin: s.hora_fin,
    estado: "disponible",
    monto: precio,
    canal_origen,
  }));

  const { insertados: turnosCreados, errorLectura } = await insertarSlotsSinDuplicar(
    supabase,
    medicoId,
    turnosParaInsertar,
    (msg, detalle) => console.error(`[crearAgendaModelo] ${msg}:`, JSON.stringify(detalle))
  );
  if (errorLectura) {
    // No se pudo leer los slots existentes → el helper no insertó nada (fail-safe).
    // El modelo/franjas ya existen; devolvemos error real en vez de éxito vacío.
    console.error("[crearAgendaModelo] lectura de slots existentes falló:", errorLectura);
    return {
      ok: false,
      motivo: "validacion",
      mensaje: "No se pudieron crear los turnos de la agenda. Probá de nuevo en unos minutos.",
    };
  }

  // 7. Resolución de choques con agendas VACÍAS: el modelo más nuevo gana →
  //    bloquear los turnos disponibles de OTROS modelos que se pisen con los nuevos.
  //    GUARD (Roberto #1): solo bloqueamos si ESTE modelo creó turnos reservables.
  //    Si creó 0 (p.ej. una segunda creación idéntica concurrente cuyos slots
  //    colisionaron todos con el índice único), no tiene nada que imponer y NO
  //    debe bloquear los slots que la otra creación acaba de generar.
  let agendasViejasBloqueadas = 0;
  const { data: viejos } = turnosCreados > 0
    ? await supabase
        .from("turnos")
        .select("id, fecha, hora_inicio, hora_fin")
        .eq("medico_id", medicoId)
        .eq("estado", "disponible")
        .neq("modelo_id", modelo.id)
        .eq("canal_origen", canal_origen) // solo pisa turnos del MISMO canal (clínica/consultorio conviven)
        .gte("fecha", fecha_inicio)
        .lte("fecha", fecha_fin)
    : { data: null };

  if (viejos && viejos.length > 0) {
    const idsABloquear = viejos
      .filter((v) => {
        const vIni = aMinutos(v.hora_inicio);
        const vFin = aMinutos(v.hora_fin);
        return slotsNuevos.some(
          (s) => s.fecha === v.fecha && aMinutos(s.hora_inicio) < vFin && vIni < aMinutos(s.hora_fin)
        );
      })
      .map((v) => v.id);

    for (let i = 0; i < idsABloquear.length; i += 500) {
      await supabase
        .from("turnos")
        .update({ estado: "bloqueado" })
        .in("id", idsABloquear.slice(i, i + 500));
    }
    agendasViejasBloqueadas = idsABloquear.length;
  }

  return { ok: true, modeloId: modelo.id, turnosCreados, dias: diasConFranja, agendasViejasBloqueadas };
}
