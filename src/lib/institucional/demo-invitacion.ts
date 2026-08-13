// src/lib/institucional/demo-invitacion.ts
// INVITAR y LIMPIAR — las dos operaciones que Diego usa en la reunión.
// SOLO instancia institucional.
//
// Invitar es "nombre + celular y listo": el sistema crea la cuenta, la ficha
// (de profesional o de paciente, según el rol) y el enlace temporal, y devuelve
// la URL UNA vez para que la pantalla la muestre como QR. El token pelado no se
// guarda en ningún lado — en la base queda solo su sha256, igual que el del
// paciente institucional.
//
// Limpiar es la contracara y por eso vive en el mismo archivo: lo que se crea
// acá se borra acá, en orden inverso y explícito. Los participantes son
// personas reales; su nombre y su celular no pueden quedar dando vueltas en la
// base de la provincia después de la reunión.

import { createAdminClient } from "@/lib/supabase/admin";
import { esInstitucional } from "@/lib/instancia";
import { getConfigInstitucion } from "@/lib/institucional/config";
import { crearAccesoLink, revocarAccesosDeSujeto } from "@/lib/institucional/accesos";
import { provisionarProfesionalDemo } from "@/lib/institucional/demo-profesional";
import {
  emailDemo,
  validarParticipante,
  ESPERA_DEMO,
  type DatosParticipante,
  type DatosParticipanteRaw,
  type ParticipanteDemo,
} from "@/lib/institucional/demo";
import { randomBytes } from "crypto";

// ─── El paciente de la demo ──────────────────────────────────────────────────

/**
 * Alta del paciente de una reunión.
 *
 * NO reusa `provisionarPaciente` (el alta del padrón) a propósito: esa función
 * exige DNI, fecha de nacimiento y sexo porque son los requisitos mínimos del
 * padrón provincial (R17), y acá el requisito es "nombre y celular" — lo que se
 * puede pedir en voz alta en una sala de reuniones sin frenar la demo.
 *
 * La consecuencia de esa diferencia es la única razón por la que el panel
 * ofrece DNI y fecha de nacimiento como OPCIONALES: si se cargan, salen
 * impresos en el documento y el papel se ve completo proyectado. Si no, el
 * papel sale igual.
 *
 * Y el DNI JAMÁS se inventa: un número sintético podría chocar con el de una
 * persona real del padrón, y el papel de la demo estaría nombrando a alguien
 * que no estuvo en la reunión.
 */
async function provisionarPacienteDemo(params: {
  sesionId: string;
  datos: DatosParticipante;
}): Promise<{ ok: true; pacienteId: string; userId: string } | { ok: false; error: string }> {
  const config = await getConfigInstitucion();
  const admin = createAdminClient();
  const email = emailDemo(randomBytes(4).toString("hex"), config.dominio);

  const { data: creado, error: errAuth } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { origen: "demo", rol: "paciente" },
  });
  if (errAuth || !creado?.user) {
    console.error("[demo] createUser del paciente falló:", errAuth?.message);
    return { ok: false, error: "No se pudo crear la cuenta del paciente. Probá de nuevo." };
  }

  const { data: fila, error: errInsert } = await admin
    .from("pacientes")
    .insert({
      user_id: creado.user.id,
      nombre_completo: params.datos.nombre,
      dni: params.datos.dni,
      fecha_nacimiento: params.datos.fecha_nacimiento,
      telefono: params.datos.celular,
      demo_sesion_id: params.sesionId,
      es_cuenta_test: true,
      provisionado_via: "panel",
      provisionado_detalle: { demo_sesion_id: params.sesionId },
      provisionado_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (errInsert || !fila) {
    console.error("[demo] insert del paciente falló:", errInsert?.message);
    await admin.auth.admin.deleteUser(creado.user.id).catch(() => {});
    return {
      ok: false,
      error:
        errInsert?.code === "23505"
          ? "Ese DNI ya está en el padrón. Cargalo sin DNI o usá otro."
          : "No se pudo crear la ficha del paciente. Probá de nuevo.",
    };
  }

  return { ok: true, pacienteId: fila.id, userId: creado.user.id };
}

// ─── Invitación ──────────────────────────────────────────────────────────────

export interface Invitacion {
  participante: ParticipanteDemo;
  /**
   * URL con el token PELADO. Viaja UNA vez, hasta la pantalla que la pinta como
   * QR. Nunca se persiste (en la base va el sha256) y nunca se loguea.
   */
  url: string;
}

export type ResultadoInvitacion =
  | { ok: true; invitacion: Invitacion }
  | { ok: false; error: string };

export async function invitarParticipante(params: {
  sesionId: string;
  raw: DatosParticipanteRaw;
  /** Título del profesional ("Dr." / "Dra."), opcional. */
  titulo?: string | null;
}): Promise<ResultadoInvitacion> {
  if (!esInstitucional()) {
    return { ok: false, error: "El modo demo solo existe en la instancia institucional." };
  }

  const val = validarParticipante(params.raw);
  if (!val.ok) return { ok: false, error: val.error };
  const datos = val.datos;

  const admin = createAdminClient();
  const { data: sesion } = await admin
    .from("demo_sesiones")
    .select("id, cerrada_at")
    .eq("id", params.sesionId)
    .maybeSingle();
  if (!sesion) return { ok: false, error: "Esa reunión no existe." };
  if (sesion.cerrada_at) {
    return { ok: false, error: "Esa reunión ya se limpió. Creá una nueva para invitar." };
  }

  let medicoId: string | null = null;
  let pacienteId: string | null = null;
  let userId: string;

  if (datos.rol === "profesional") {
    const res = await provisionarProfesionalDemo({
      sesionId: params.sesionId,
      datos,
      titulo: params.titulo,
    });
    if (!res.ok) return { ok: false, error: res.error };
    medicoId = res.profesional.medicoId;
    userId = res.profesional.userId;
  } else {
    const res = await provisionarPacienteDemo({ sesionId: params.sesionId, datos });
    if (!res.ok) return { ok: false, error: res.error };
    pacienteId = res.pacienteId;
    userId = res.userId;
  }

  // El enlace. El profesional aterriza en su dashboard; el paciente, en la
  // pantalla de espera que salta sola a su turno en cuanto el call center se lo
  // asigne (el destino real lo resuelve el minteo — ver `destinoDemoPaciente`).
  const acceso = await crearAccesoLink({
    medicoId: medicoId ?? undefined,
    pacienteId: pacienteId ?? undefined,
    destino: medicoId ? "/dashboard" : ESPERA_DEMO,
    // Lo emite un admin de Docto, que no es operador de la institución: por eso
    // el origen propio (migración 026) y `operadorId: null`.
    operadorId: null,
    origen: "demo",
    esDemo: true,
    // Sin canal automático: en la reunión el enlace se entrega por QR
    // proyectado. El WhatsApp es un botón aparte, y solo si hay plantilla.
    canal: null,
    enviadoA: null,
  });
  if (!acceso) {
    return {
      ok: false,
      error: "Se creó la cuenta pero no se pudo emitir el enlace. Volvé a generar el QR.",
    };
  }

  const { data: participante, error: errPart } = await admin
    .from("demo_participantes")
    .insert({
      sesion_id: params.sesionId,
      nombre: datos.nombre,
      celular: datos.celular,
      rol: datos.rol,
      estado: "invitado",
      user_id: userId,
      medico_id: medicoId,
      paciente_id: pacienteId,
      acceso_id: acceso.accesoId,
    })
    .select(
      "id, sesion_id, nombre, celular, rol, estado, user_id, medico_id, paciente_id, acceso_id, entro_at, created_at"
    )
    .single();

  if (errPart || !participante) {
    console.error("[demo] insert del participante falló:", errPart?.message);
    return {
      ok: false,
      error: "La cuenta se creó pero no quedó registrada en la reunión. Limpiá la reunión y volvé a cargarlo.",
    };
  }

  return {
    ok: true,
    invitacion: { participante: participante as ParticipanteDemo, url: acceso.url },
  };
}

/**
 * Vuelve a acuñar el enlace de un participante que ya está cargado.
 *
 * Para el caso más probable de una reunión: alguien cerró la pestaña, se quedó
 * sin batería, o el QR se escaneó desde el teléfono equivocado. Emitir uno nuevo
 * REVOCA el anterior (`crearAccesoLink` lo hace solo), que es exactamente lo que
 * se espera cuando el enlace terminó en el teléfono de otro.
 */
export async function regenerarEnlace(participanteId: string): Promise<ResultadoInvitacion> {
  if (!esInstitucional()) {
    return { ok: false, error: "El modo demo solo existe en la instancia institucional." };
  }
  const admin = createAdminClient();
  const { data: p } = await admin
    .from("demo_participantes")
    .select(
      "id, sesion_id, nombre, celular, rol, estado, user_id, medico_id, paciente_id, acceso_id, entro_at, created_at"
    )
    .eq("id", participanteId)
    .maybeSingle();
  if (!p) return { ok: false, error: "Ese participante no existe." };

  const acceso = await crearAccesoLink({
    medicoId: (p.medico_id as string | null) ?? undefined,
    pacienteId: (p.paciente_id as string | null) ?? undefined,
    destino: p.medico_id ? "/dashboard" : ESPERA_DEMO,
    operadorId: null,
    origen: "demo",
    esDemo: true,
    canal: null,
    enviadoA: null,
  });
  if (!acceso) return { ok: false, error: "No se pudo emitir el enlace nuevo. Probá de nuevo." };

  const { error } = await admin
    .from("demo_participantes")
    .update({ acceso_id: acceso.accesoId, estado: "invitado", entro_at: null })
    .eq("id", participanteId);
  if (error) {
    console.error("[demo] No se pudo actualizar el acceso del participante:", error.message);
  }

  return {
    ok: true,
    invitacion: {
      participante: { ...(p as ParticipanteDemo), acceso_id: acceso.accesoId, estado: "invitado" },
      url: acceso.url,
    },
  };
}

// ─── Limpiar la reunión ──────────────────────────────────────────────────────

export interface ResultadoLimpieza {
  ok: boolean;
  /** Qué NO se pudo borrar, con su motivo. Vacío = quedó limpio de verdad. */
  problemas: string[];
  participantes: number;
}

/**
 * Borra todo lo que la reunión creó, y nada más.
 *
 * ── POR QUÉ EL ORDEN ES EXPLÍCITO Y NO UNA CASCADA ───────────────────────────
 * Una cascada sobre `medicos` o `pacientes` en la base de una provincia es
 * exactamente el botón que no se quiere tener. Acá se borra lo que se creó, en
 * orden inverso al de creación, tabla por tabla y por id — y lo que no se pudo
 * borrar se REPORTA en vez de quedar en silencio.
 *
 * La fila de `demo_sesiones` sobrevive, marcada como cerrada: queda el registro
 * de que la reunión ocurrió, sin un solo dato personal adentro (el nombre y el
 * celular se van con los participantes).
 */
export async function limpiarSesionDemo(sesionId: string): Promise<ResultadoLimpieza> {
  if (!esInstitucional()) {
    return { ok: false, problemas: ["El modo demo solo existe en la instancia institucional."], participantes: 0 };
  }

  const admin = createAdminClient();
  const problemas: string[] = [];
  const anotar = (que: string, error: { message: string } | null) => {
    if (error) problemas.push(`${que}: ${error.message}`);
  };

  const { data: participantes } = await admin
    .from("demo_participantes")
    .select("id, user_id, medico_id, paciente_id")
    .eq("sesion_id", sesionId);
  const filas = participantes ?? [];

  const medicoIds = filas.map((p) => p.medico_id as string | null).filter((x): x is string => !!x);
  const pacienteIds = filas.map((p) => p.paciente_id as string | null).filter((x): x is string => !!x);
  const userIds = filas.map((p) => p.user_id as string | null).filter((x): x is string => !!x);

  // ⚠ NO ALCANZA CON LOS PARTICIPANTES. El escenario precargado crea pacientes
  // de utilería (los que rellenan la agenda para que no se vea vacía) que NO
  // tienen fila en `demo_participantes` — nadie los invitó. Si la limpieza
  // mirara solo la lista de invitados, esos se quedarían para siempre en el
  // padrón de la provincia, indistinguibles de un vecino real.
  //
  // La fuente de verdad de "esto es de esta reunión" es `demo_sesion_id`, así
  // que se pregunta también por ahí y se unen los dos conjuntos.
  {
    const [{ data: medicosSesion }, { data: pacientesSesion }] = await Promise.all([
      admin.from("medicos").select("id, user_id").eq("demo_sesion_id", sesionId),
      admin.from("pacientes").select("id, user_id").eq("demo_sesion_id", sesionId),
    ]);
    for (const m of medicosSesion ?? []) {
      if (!medicoIds.includes(m.id as string)) medicoIds.push(m.id as string);
      const u = m.user_id as string | null;
      if (u && !userIds.includes(u)) userIds.push(u);
    }
    for (const pa of pacientesSesion ?? []) {
      if (!pacienteIds.includes(pa.id as string)) pacienteIds.push(pa.id as string);
      const u = pa.user_id as string | null;
      if (u && !userIds.includes(u)) userIds.push(u);
    }
  }

  // 0. Apagar los enlaces y echar las sesiones abiertas ANTES de borrar nada:
  //    si alguien está adentro con su teléfono, que quede afuera primero.
  for (const medicoId of medicoIds) await revocarAccesosDeSujeto({ medicoId });
  for (const pacienteId of pacienteIds) await revocarAccesosDeSujeto({ pacienteId });

  // 1. Los encuentros de la reunión (de acá salen casi todas las dependencias).
  const turnoIds: string[] = [];
  const consultaIds: string[] = [];
  if (medicoIds.length > 0) {
    const { data: t } = await admin.from("turnos").select("id").in("medico_id", medicoIds);
    turnoIds.push(...(t ?? []).map((f) => f.id as string));
    const { data: c } = await admin.from("consultas").select("id").in("medico_id", medicoIds);
    consultaIds.push(...(c ?? []).map((f) => f.id as string));
  }
  if (pacienteIds.length > 0) {
    const { data: t } = await admin.from("turnos").select("id").in("paciente_id", pacienteIds);
    for (const f of t ?? []) if (!turnoIds.includes(f.id as string)) turnoIds.push(f.id as string);
  }
  if (userIds.length > 0) {
    const { data: c } = await admin.from("consultas").select("id").in("paciente_id", userIds);
    for (const f of c ?? []) if (!consultaIds.includes(f.id as string)) consultaIds.push(f.id as string);
  }

  // 2. Todo lo que cuelga de un encuentro. Se borra ANTES que el encuentro.
  const porEncuentro: { tabla: string; columna: string; ids: string[] }[] = [
    { tabla: "descargas_hc", columna: "turno_id", ids: turnoIds },
    { tabla: "descargas_hc", columna: "consulta_id", ids: consultaIds },
    { tabla: "documentos", columna: "turno_id", ids: turnoIds },
    { tabla: "documentos", columna: "consulta_id", ids: consultaIds },
    { tabla: "recetas", columna: "turno_id", ids: turnoIds },
    { tabla: "recetas", columna: "consulta_id", ids: consultaIds },
    { tabla: "video_presencia", columna: "turno_id", ids: turnoIds },
    { tabla: "video_presencia", columna: "consulta_id", ids: consultaIds },
    { tabla: "sala_espera_entradas", columna: "turno_id", ids: turnoIds },
    { tabla: "sala_espera_entradas", columna: "consulta_id", ids: consultaIds },
    { tabla: "encuentros_metering", columna: "recurso_id", ids: [...turnoIds, ...consultaIds] },
    { tabla: "asignaciones", columna: "recurso_id", ids: [...turnoIds, ...consultaIds] },
  ];
  for (const paso of porEncuentro) {
    if (paso.ids.length === 0) continue;
    const { error } = await admin.from(paso.tabla).delete().in(paso.columna, paso.ids);
    anotar(`${paso.tabla}.${paso.columna}`, error);
  }

  // 3. Los encuentros.
  if (turnoIds.length > 0) {
    const { error } = await admin.from("turnos").delete().in("id", turnoIds);
    anotar("turnos", error);
  }
  if (consultaIds.length > 0) {
    const { error } = await admin.from("consultas").delete().in("id", consultaIds);
    anotar("consultas", error);
  }

  // 4. El registro de la reunión (tiene FK a accesos_link, medicos y pacientes:
  //    se va antes que ellos). Acá se van el nombre y el celular.
  {
    const { error } = await admin.from("demo_participantes").delete().eq("sesion_id", sesionId);
    anotar("demo_participantes", error);
  }

  // 5. Lo que cuelga del profesional y del paciente.
  const porSujeto: { tabla: string; columna: string; ids: string[] }[] = [
    { tabla: "accesos_link", columna: "medico_id", ids: medicoIds },
    { tabla: "accesos_link", columna: "paciente_id", ids: pacienteIds },
    { tabla: "documentos", columna: "medico_id", ids: medicoIds },
    { tabla: "documentos", columna: "paciente_id", ids: pacienteIds },
    { tabla: "nova_mensajes", columna: "medico_id", ids: medicoIds },
    { tabla: "nova_conversaciones", columna: "medico_id", ids: medicoIds },
    { tabla: "nova_perfiles", columna: "medico_id", ids: medicoIds },
    { tabla: "firma_logs", columna: "medico_id", ids: medicoIds },
    { tabla: "otp_firma", columna: "medico_id", ids: medicoIds },
    { tabla: "medico_claves", columna: "medico_id", ids: medicoIds },
    { tabla: "medico_paciente_perfil", columna: "medico_id", ids: medicoIds },
    { tabla: "notificaciones_medico", columna: "medico_id", ids: medicoIds },
    { tabla: "disponibilidad_log", columna: "medico_id", ids: medicoIds },
    { tabla: "acuerdos_servicio", columna: "medico_id", ids: medicoIds },
    { tabla: "acuerdo_semanas", columna: "medico_id", ids: medicoIds },
    { tabla: "asignaciones", columna: "medico_id", ids: medicoIds },
    { tabla: "asignaciones", columna: "paciente_id", ids: pacienteIds },
    { tabla: "encuentros_metering", columna: "medico_id", ids: medicoIds },
  ];
  for (const paso of porSujeto) {
    if (paso.ids.length === 0) continue;
    const { error } = await admin.from(paso.tabla).delete().in(paso.columna, paso.ids);
    anotar(`${paso.tabla}.${paso.columna}`, error);
  }

  // 6. Las agendas (franjas antes que modelos).
  if (medicoIds.length > 0) {
    const { data: modelos } = await admin.from("agenda_modelos").select("id").in("medico_id", medicoIds);
    const modeloIds = (modelos ?? []).map((m) => m.id as string);
    if (modeloIds.length > 0) {
      anotar("agenda_franjas", (await admin.from("agenda_franjas").delete().in("modelo_id", modeloIds)).error);
      anotar("agenda_modelos", (await admin.from("agenda_modelos").delete().in("id", modeloIds)).error);
    }
  }

  // 7. Las fichas.
  if (medicoIds.length > 0) {
    anotar("medicos", (await admin.from("medicos").delete().in("id", medicoIds)).error);
  }
  if (pacienteIds.length > 0) {
    anotar("pacientes", (await admin.from("pacientes").delete().in("id", pacienteIds)).error);
  }

  // 8. Las cuentas auth. Van últimas y son las más frágiles (`aceptaciones_legales`
  //    y compañía pueden retenerlas): si alguna no se va, se reporta y listo — es
  //    una casilla no entregable de un subdominio sin MX, no un dato personal.
  for (const userId of userIds) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) problemas.push(`cuenta de acceso: ${error.message}`);
  }

  // 9. La reunión queda cerrada, vacía y con su fecha: el registro de que pasó.
  anotar(
    "demo_sesiones",
    (await admin.from("demo_sesiones").update({ cerrada_at: new Date().toISOString() }).eq("id", sesionId)).error
  );

  return { ok: problemas.length === 0, problemas, participantes: filas.length };
}
