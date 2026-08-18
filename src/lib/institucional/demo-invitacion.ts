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
import { getConfigInstitucion, dominioLimpio } from "@/lib/institucional/config";
import { crearAccesoLink, revocarAccesosDeSujeto } from "@/lib/institucional/accesos";
import { provisionarProfesionalDemo } from "@/lib/institucional/demo-profesional";
import { prepararEscenario } from "@/lib/institucional/demo-escenario";
import {
  emailDemo,
  validarParticipante,
  ESPERA_DEMO,
  NOMBRE_UTILERIA,
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
    // Mismo motivo que en el profesional: sin `full_name`, cualquier pantalla
    // que salude cae al email interno de la cuenta de utilería.
    user_metadata: { origen: "demo", rol: "paciente", full_name: params.datos.nombre.trim() },
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
      // ── EL ALIAS NO ENTREGABLE VA A LA FICHA, A PROPÓSITO ─────────────────
      // El celular del participante es OPCIONAL (el camino garantizado es el QR
      // proyectado, y la pantalla se lo promete: "sin celular entra igual"),
      // pero el call center exige `telefono || email` para poder asignarle algo
      // — sin ninguno de los dos, el botón de asignar queda deshabilitado y el
      // participante entra, ve "ya estás adentro", y nadie le puede dar un
      // turno hasta que alguien tipee un teléfono en vivo.
      //
      // El alias satisface ese guard sin inventarle un celular a nadie, y no
      // sale un solo mail: el subdominio `demo.` no tiene MX, y además los
      // avisos lo reconocen y ni lo intentan (ver `esAliasDemo`).
      email,
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
   * `false` SOLO cuando el alta del profesional no pudo dejarle claves de firma.
   * `undefined` para un paciente (no firma nada).
   */
  firmaLista?: boolean;
  /**
   * `false` cuando el alta del profesional no pudo dejarle la agenda armada.
   * `undefined` para un paciente (no tiene agenda). La agenda viene con el alta:
   * un profesional sin agenda no sirve para nada en la demo.
   */
  agendaLista?: boolean;
  /**
   * URL con el token. En una demo se guarda además en claro (migración 029)
   * para poder volver a dibujar el QR; en un acceso real, en la base va solo el
   * sha256. Nunca se loguea.
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
    // `fecha` ancla la vigencia del enlace (ver `inicioDelDiaDeLaReunion`).
    .select("id, cerrada_at, fecha")
    .eq("id", params.sesionId)
    .maybeSingle();
  if (!sesion) return { ok: false, error: "Esa reunión no existe." };
  if (sesion.cerrada_at) {
    return { ok: false, error: "Esa reunión ya se limpió. Creá una nueva para invitar." };
  }

  let medicoId: string | null = null;
  let pacienteId: string | null = null;
  let userId: string;
  let firmaLista: boolean | undefined;

  if (datos.rol === "profesional") {
    const res = await provisionarProfesionalDemo({
      sesionId: params.sesionId,
      datos,
      titulo: params.titulo,
    });
    if (!res.ok) return { ok: false, error: res.error };
    medicoId = res.profesional.medicoId;
    userId = res.profesional.userId;
    firmaLista = res.profesional.clavesOk;
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

  // ── LA AGENDA VIENE CON EL ALTA ────────────────────────────────────────────
  // Antes esto era un segundo botón ("Preparar agenda") que había que tocar
  // para CADA profesional. Diego, 18/08/2026: *"¿cuál es la función de invitar
  // a un médico sin agenda y tener que hacer doble trabajo con todos?"*
  //
  // Ninguna: un profesional sin agenda no sirve para nada en la demo — el call
  // center no tiene qué asignarle y la escena se cae. Si el alta ya sabe que es
  // un profesional, la agenda es parte del alta.
  //
  // Best-effort a propósito: si la preparación falla, el profesional YA está
  // creado y con su QR listo. Devolver un error acá haría perder el alta entera
  // por un escenario que se puede rehacer. El fallo se informa y el botón manual
  // sigue existiendo para reintentarlo.
  let agendaLista = false;
  if (medicoId) {
    try {
      const escenario = await prepararEscenario({ medicoId, sesionId: params.sesionId });
      agendaLista = escenario.ok;
      if (!escenario.ok) {
        console.error("[demo] la agenda del profesional no quedó lista:", escenario.alertas);
      }
    } catch (err) {
      console.error("[demo] prepararEscenario falló:", (err as Error).message);
    }
  }

  return {
    ok: true,
    invitacion: {
      participante: participante as ParticipanteDemo,
      url: acceso.url,
      firmaLista,
      agendaLista,
    },
  };
}

/**
 * El enlace que YA TIENE el participante. Solo emite uno si no hay ninguno.
 *
 * Es la pieza que borra el enredo entero de esta pantalla. Antes, "Ver QR" y
 * "Mandar por WhatsApp" llamaban los dos a `regenerarEnlace`, porque el token
 * en claro no se guardaba en ningún lado: la única forma de volver a mostrar un
 * QR era fabricar otro… y fabricar otro DEJA AFUERA a quien ya había entrado.
 * De ahí salían el botón rojo "Regenerar", un diálogo de seis renglones
 * explicándole al usuario el modelo de tokens, y la escena que Diego describió
 * el 18/08/2026: *"escaneá el QR y viví; el invitado existe o no"*.
 *
 * Con la migración 029 el token de una demo se guarda y se puede volver a leer,
 * así que mostrar el QR vuelve a ser una lectura y no una escritura. Nadie
 * queda afuera por mirar.
 *
 * Emite uno nuevo en dos casos, los dos correctos: el participante todavía no
 * tenía enlace, o el que tenía fue revocado (lo sacaron de la demo y lo vuelven
 * a invitar).
 */
export async function enlaceDelParticipante(
  participanteId: string
): Promise<ResultadoInvitacion> {
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

  if (p.acceso_id) {
    const { data: acceso } = await admin
      .from("accesos_link")
      .select("token_demo, revocado_at")
      .eq("id", p.acceso_id as string)
      .maybeSingle();

    const token = acceso?.token_demo as string | null | undefined;
    if (token && !acceso?.revocado_at) {
      const config = await getConfigInstitucion();
      return {
        ok: true,
        invitacion: {
          participante: p as ParticipanteDemo,
          url: `https://${dominioLimpio(config.dominio)}/acceso/t/${token}`,
        },
      };
    }
  }

  // Sin enlace vivo: recién acá se emite, y emitir es lo correcto porque no hay
  // ninguno a quien echar.
  return regenerarEnlace(participanteId);
}

/**
 * Vuelve a acuñar el enlace de un participante que ya está cargado.
 *
 * Para el caso más probable de una reunión: alguien cerró la pestaña, se quedó
 * sin batería, o el QR se escaneó desde el teléfono equivocado.
 *
 * ── PRIMERO SE ECHA AL QUE ESTÁ ADENTRO, DESPUÉS SE ACUÑA ────────────────────
 * `crearAccesoLink` revoca el token anterior solo, y eso alcanzaba para el caso
 * "cerré la pestaña" y para ningún otro: un token revocado no impide nada a
 * quien YA lo usó, porque la sesión que minteó se renueva sola por refresh
 * token. O sea que "regenerar el QR" —que es lo que uno hace justo cuando el
 * enlace terminó en el teléfono equivocado— no echaba a nadie.
 *
 * `revocarAccesosDeSujeto` sí: apaga los enlaces y cierra las sesiones abiertas
 * de esa persona. Va ANTES de acuñar el nuevo para no matar el que se acaba de
 * emitir.
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

  // Ver el encabezado: revocar el token viejo no echa a quien ya entró con él.
  const medicoPrevio = (p.medico_id as string | null) ?? undefined;
  const pacientePrevio = (p.paciente_id as string | null) ?? undefined;
  await revocarAccesosDeSujeto(medicoPrevio ? { medicoId: medicoPrevio } : { pacienteId: pacientePrevio! });

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

/**
 * Lo que la base NO deja borrar, por diseño y con service role incluido.
 *
 * `recetas`, `firma_logs`, `otp_firma` y `medico_claves` tienen trigger
 * anti-DELETE desde la auditoría de firma (20260522, reforzado en 20260807):
 * son evidencia criptográfica de no-repudio con retención de 10 años, y un
 * DELETE ahí levanta excepción. La limpieza de la reunión NI LO INTENTA — y no
 * porque falle, sino porque intentarlo sería pedirle a la base que rompa una
 * garantía que existe para el caso en que un juez pregunte quién firmó qué.
 *
 * La consecuencia es la que manda el diseño de abajo: si el participante firmó
 * un documento —que es exactamente lo que muestra la Escena 4— su ficha de
 * `medicos` NO se puede borrar, porque `medico_claves.medico_id` y
 * `firma_logs.medico_id` la sostienen. Para eso está la anonimización.
 */
const APPEND_ONLY = ["recetas", "firma_logs", "otp_firma", "medico_claves"] as const;

/** Postgres: violación de FK. Algo que no se puede borrar está reteniendo la fila. */
const FK_VIOLATION = "23503";

/**
 * Cinturón: ninguna tabla de evidencia entra a un paso de borrado.
 *
 * El tirante es que no están en las listas. Este es el cinturón, y existe porque
 * la lista de tablas a borrar es lo más fácil de ampliar de este archivo: el día
 * que alguien sume `recetas` "para que la limpieza quede completa", el DELETE
 * levanta excepción, la limpieza se reporta fallada, y el que la corre en una
 * sala de reuniones no tiene forma de entender por qué.
 */
function borrable(tabla: string, problemas: string[]): boolean {
  if (!(APPEND_ONLY as readonly string[]).includes(tabla)) return true;
  problemas.push(
    `${tabla} es evidencia de firma (append-only): no se borra. Sacala de la lista de la limpieza.`
  );
  return false;
}

/**
 * Borra documentos de la reunión UNO POR UNO, y no con un `.in()`.
 *
 * ── POR QUÉ ──────────────────────────────────────────────────────────────────
 * Un DELETE con `.in()` es UNA sentencia: si una sola de las filas está retenida
 * por `firma_logs.documento_id` (append-only, sin ON DELETE), Postgres devuelve
 * 23503 y ABORTA LA SENTENCIA ENTERA. O sea que el documento firmado —el único
 * que de verdad no se puede borrar— se llevaba puestos a todos los demás: la
 * evolución y la orden, que ni firma tienen, sobrevivían con el nombre y el
 * contenido clínico de la demostración adentro.
 *
 * Fila por fila, cada 23503 retiene solo a su propia fila y todo lo demás se va.
 * Son unos pocos documentos por reunión: el costo es irrelevante al lado de
 * dejar historia clínica de utilería colgada en la base de la provincia.
 */
async function borrarDocumentosUnoPorUno(
  columna: string,
  ids: string[],
  retenidos: string[],
  problemas: string[]
): Promise<void> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("documentos").select("id").in(columna, ids);
  if (error) {
    problemas.push(`documentos.${columna}: ${error.message}`);
    return;
  }
  let porFirma = 0;
  const retenidosIds: string[] = [];
  for (const fila of data ?? []) {
    const { error: errFila } = await admin.from("documentos").delete().eq("id", fila.id as string);
    if (!errFila) continue;
    if (errFila.code === FK_VIOLATION) {
      porFirma++;
      retenidosIds.push(fila.id as string);
    } else problemas.push(`documentos.${columna}: ${errFila.message}`);
  }
  if (porFirma > 0) {
    const borrado = await borrarContenidoClinicoRetenido(retenidosIds, problemas);
    retenidos.push(
      `${porFirma} documento(s) firmado(s) quedaron en la base: los retiene su registro de firma, ` +
        `que es append-only. No llevan el nombre de nadie (el sello se emitió con nombre de utilería) ` +
        `y su página de verificación pública dice que son de demostración.` +
        (borrado
          ? ` Lo que el participante escribió a mano adentro de esos documentos (indicaciones, ` +
            `diagnóstico, tratamiento) SÍ se borró: es texto libre y podía llevar el nombre de ` +
            `cualquiera. Como el sello cubre ese texto, la página de verificación de esos ` +
            `documentos ahora dice "alterado" — es la verdad y es el precio correcto.`
          : "")
    );
  }
}

/**
 * Le saca a un documento RETENIDO el texto clínico que el participante escribió
 * a mano.
 *
 * ── POR QUÉ, SI EL SELLO NO LLEVA NOMBRES ────────────────────────────────────
 * Porque el sello es una cosa y `documentos.contenido` es otra. El snapshot de
 * identidad se emite con nombre de utilería desde el principio, pero el cuerpo
 * del documento es lo que la persona TIPEÓ en el workspace delante de la sala:
 * si en una indicación escribió el nombre del ministro, ese nombre queda en la
 * base de la provincia para siempre, porque la fila no se puede borrar.
 *
 * Solo corre sobre los documentos que el DELETE NO pudo llevarse (23503). Los
 * que se borran no necesitan esto, y los que quedan ya no le sirven a nadie: la
 * reunión terminó.
 *
 * ── LA CONSECUENCIA, DICHA ───────────────────────────────────────────────────
 * El hash de la firma cubre el contenido, así que al vaciarlo la verificación
 * pública de ESE documento pasa a decir "alterado". Es literalmente lo que pasó
 * —lo alteramos nosotros, a propósito, para sacar datos de personas— y es un
 * papel que ya venía marcado "SIN VALIDEZ LEGAL" de punta a punta. Entre una
 * página que dice "alterado" sobre un papel de demostración y el nombre de un
 * tercero guardado para siempre, no hay duda.
 *
 * Se escribe un texto y no `null`: no sabemos si alguna de esas columnas es NOT
 * NULL en la instancia, y un placeholder funciona con las dos.
 */
const TEXTO_BORRADO = "(borrado al cerrar la reunión de demostración)";

async function borrarContenidoClinicoRetenido(
  ids: string[],
  problemas: string[]
): Promise<boolean> {
  if (ids.length === 0) return false;
  const admin = createAdminClient();
  const { error } = await admin
    .from("documentos")
    .update({
      contenido: TEXTO_BORRADO,
      diagnostico: TEXTO_BORRADO,
      tratamiento: TEXTO_BORRADO,
    })
    .in("id", ids);
  if (error) {
    problemas.push(
      `No se pudo borrar el contenido clínico de ${ids.length} documento(s) retenido(s): ` +
        `${error.message}. Ese texto lo escribió el participante a mano y puede llevar el nombre ` +
        `de un tercero: reintentá la limpieza.`
    );
    return false;
  }
  return true;
}

export interface ResultadoLimpieza {
  ok: boolean;
  /**
   * Lo que falló INESPERADAMENTE y hay que reintentar. Mientras haya algo acá,
   * la reunión NO se marca como cerrada: el botón "Limpiar reunión" sigue vivo
   * en la pantalla y se puede volver a correr.
   */
  problemas: string[];
  /**
   * Lo que la base retuvo POR DISEÑO (evidencia de firma) y quedó ANONIMIZADO
   * en vez de borrado. No es una falla: es el único final posible cuando el
   * participante firmó algo, y cumple la promesa que importa — el nombre y el
   * celular de esa persona ya no están en la base de la provincia.
   */
  retenidos: string[];
  participantes: number;
}

/**
 * Texto con el que se reemplaza el nombre de una persona real.
 *
 * Es el MISMO juego de nombres que se congela de entrada en los registros
 * inmutables (`NOMBRE_UTILERIA`): si la ficha sobrevive y el documento firmado
 * también, los dos tienen que decir lo mismo. Dos textos distintos para el mismo
 * hecho invitan a preguntarse si son dos personas.
 */
const NOMBRE_ANONIMO = NOMBRE_UTILERIA;

/**
 * Borra todo lo que la reunión creó, y nada más.
 *
 * ── POR QUÉ EL ORDEN ES EXPLÍCITO Y NO UNA CASCADA ───────────────────────────
 * Una cascada sobre `medicos` o `pacientes` en la base de una provincia es
 * exactamente el botón que no se quiere tener. Acá se borra lo que se creó, en
 * orden inverso al de creación, tabla por tabla y por id — y lo que no se pudo
 * borrar se REPORTA en vez de quedar en silencio.
 *
 * ── EL ALCANCE SALE DE LA MARCA, NO DE UNA INFERENCIA ────────────────────────
 * Los encuentros se recolectan por `es_demo = true`, que es LA MISMA marca que
 * decide si algo se factura. Antes se juntaban por `medico_id` a secas, o sea
 * asumiendo que "todo lo que tocó un profesional de demo es de la demo". Esa
 * asunción no la garantiza nada: con un solo paciente real asignado por error al
 * participante, esta función borraba de forma irreversible el turno, la
 * evolución y la receta de una persona real del padrón — y con éxito, o sea sin
 * aparecer en `problemas`.
 *
 * Si aparece un encuentro del profesional de demo SIN la marca, no se toca y se
 * reporta: es el síntoma de que alguien real se le asignó.
 *
 * ── LO QUE NO SE PUEDE BORRAR SE ANONIMIZA ───────────────────────────────────
 * Ver `APPEND_ONLY`. Cuando la evidencia de firma retiene una ficha, la fila
 * sobrevive pero SIN datos de la persona: nombre de utilería, sin celular, sin
 * DNI. `demo_sesion_id` se conserva a propósito — es lo que la mantiene fuera de
 * la oferta del call center y del padrón del panel, para siempre.
 *
 * La fila de `demo_sesiones` sobrevive, marcada como cerrada: queda el registro
 * de que la reunión ocurrió, sin un solo dato personal adentro.
 */
export async function limpiarSesionDemo(sesionId: string): Promise<ResultadoLimpieza> {
  if (!esInstitucional()) {
    return {
      ok: false,
      problemas: ["El modo demo solo existe en la instancia institucional."],
      retenidos: [],
      participantes: 0,
    };
  }

  const admin = createAdminClient();
  const problemas: string[] = [];
  const retenidos: string[] = [];
  /** Anota un fallo separando "hay que reintentar" de "la evidencia lo retiene". */
  const anotar = (que: string, error: { message: string; code?: string } | null) => {
    if (!error) return;
    if (error.code === FK_VIOLATION) retenidos.push(`${que}: lo retiene evidencia de firma`);
    else problemas.push(`${que}: ${error.message}`);
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

  // 1. Los encuentros DE LA REUNIÓN. `es_demo` y nada más: ver el encabezado.
  const turnoIds: string[] = [];
  const consultaIds: string[] = [];
  /** Encuentros del profesional de demo que NO llevan la marca: no se tocan. */
  let ajenos = 0;
  const sumar = (destino: string[], filasEncontradas: { id: string; es_demo?: boolean }[]) => {
    for (const f of filasEncontradas) {
      if (f.es_demo !== true) {
        ajenos++;
        continue;
      }
      if (!destino.includes(f.id)) destino.push(f.id);
    }
  };
  if (medicoIds.length > 0) {
    const { data: t } = await admin.from("turnos").select("id, es_demo").in("medico_id", medicoIds);
    sumar(turnoIds, (t ?? []) as { id: string; es_demo?: boolean }[]);
    const { data: c } = await admin.from("consultas").select("id, es_demo").in("medico_id", medicoIds);
    sumar(consultaIds, (c ?? []) as { id: string; es_demo?: boolean }[]);
  }
  if (pacienteIds.length > 0) {
    const { data: t } = await admin.from("turnos").select("id, es_demo").in("paciente_id", pacienteIds);
    sumar(turnoIds, (t ?? []) as { id: string; es_demo?: boolean }[]);
  }
  if (userIds.length > 0) {
    const { data: c } = await admin.from("consultas").select("id, es_demo").in("paciente_id", userIds);
    sumar(consultaIds, (c ?? []) as { id: string; es_demo?: boolean }[]);
  }
  if (ajenos > 0) {
    // Esto no debería pasar nunca (el profesional de demo está fuera de la
    // oferta del call center). Si pasa, la limpieza NO lo borra y lo dice: es un
    // encuentro de alguien real, y su historia clínica no es de esta reunión.
    problemas.push(
      `${ajenos} encuentro(s) del profesional de la demo NO están marcados como demostración: ` +
        `NO se borraron. Revisalos a mano antes de dar la reunión por limpia.`
    );
  }

  // 2. Todo lo que cuelga de un encuentro. Se borra ANTES que el encuentro.
  //    `recetas` NO está en esta lista: ver APPEND_ONLY.
  const porEncuentro: { tabla: string; columna: string; ids: string[] }[] = [
    { tabla: "descargas_hc", columna: "turno_id", ids: turnoIds },
    { tabla: "descargas_hc", columna: "consulta_id", ids: consultaIds },
    { tabla: "documentos", columna: "turno_id", ids: turnoIds },
    { tabla: "documentos", columna: "consulta_id", ids: consultaIds },
    { tabla: "video_presencia", columna: "turno_id", ids: turnoIds },
    { tabla: "video_presencia", columna: "consulta_id", ids: consultaIds },
    { tabla: "sala_espera_entradas", columna: "turno_id", ids: turnoIds },
    { tabla: "sala_espera_entradas", columna: "consulta_id", ids: consultaIds },
    { tabla: "encuentros_metering", columna: "recurso_id", ids: [...turnoIds, ...consultaIds] },
    { tabla: "asignaciones", columna: "recurso_id", ids: [...turnoIds, ...consultaIds] },
  ];
  for (const paso of porEncuentro) {
    if (!borrable(paso.tabla, problemas)) continue;
    if (paso.ids.length === 0) continue;
    if (paso.tabla === "documentos") {
      await borrarDocumentosUnoPorUno(paso.columna, paso.ids, retenidos, problemas);
      continue;
    }
    const { error } = await admin.from(paso.tabla).delete().in(paso.columna, paso.ids);
    anotar(`${paso.tabla}.${paso.columna}`, error);
  }

  // 3. El registro de la reunión (tiene FK a accesos_link, medicos y pacientes:
  //    se va antes que ellos). Acá se van el nombre y el celular.
  {
    const { error } = await admin.from("demo_participantes").delete().eq("sesion_id", sesionId);
    anotar("demo_participantes", error);
  }

  // 4. Lo que cuelga del profesional y del paciente.
  const porSujeto: { tabla: string; columna: string; ids: string[] }[] = [
    { tabla: "accesos_link", columna: "medico_id", ids: medicoIds },
    { tabla: "accesos_link", columna: "paciente_id", ids: pacienteIds },
    { tabla: "documentos", columna: "medico_id", ids: medicoIds },
    { tabla: "documentos", columna: "paciente_id", ids: pacienteIds },
    { tabla: "nova_mensajes", columna: "medico_id", ids: medicoIds },
    { tabla: "nova_conversaciones", columna: "medico_id", ids: medicoIds },
    { tabla: "nova_perfiles", columna: "medico_id", ids: medicoIds },
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
    if (!borrable(paso.tabla, problemas)) continue;
    if (paso.ids.length === 0) continue;
    if (paso.tabla === "documentos") {
      await borrarDocumentosUnoPorUno(paso.columna, paso.ids, retenidos, problemas);
      continue;
    }
    const { error } = await admin.from(paso.tabla).delete().in(paso.columna, paso.ids);
    anotar(`${paso.tabla}.${paso.columna}`, error);
  }

  // 5. Las agendas (franjas antes que modelos).
  if (medicoIds.length > 0) {
    const { data: modelos } = await admin.from("agenda_modelos").select("id").in("medico_id", medicoIds);
    const modeloIds = (modelos ?? []).map((m) => m.id as string);
    if (modeloIds.length > 0) {
      anotar("agenda_franjas", (await admin.from("agenda_franjas").delete().in("modelo_id", modeloIds)).error);
      anotar("agenda_modelos", (await admin.from("agenda_modelos").delete().in("id", modeloIds)).error);
    }
  }

  // 6. Los encuentros. Los que tengan receta quedan retenidos por diseño.
  if (turnoIds.length > 0) {
    anotar("turnos", (await admin.from("turnos").delete().in("id", turnoIds)).error);
  }
  if (consultaIds.length > 0) {
    anotar("consultas", (await admin.from("consultas").delete().in("id", consultaIds)).error);
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
    if (error) retenidos.push(`cuenta de acceso: ${error.message}`);
  }

  // 9. ── LA PROMESA DEL MÓDULO ──────────────────────────────────────────────
  //    Lo que sobrevivió pierde a la persona. Es el paso que hace verdadero el
  //    encabezado de este archivo ("su nombre y su celular no pueden quedar
  //    dando vueltas en la base de la provincia") en el caso más probable de
  //    todos: el participante firmó una receta, y por eso su ficha no se puede
  //    borrar. Corre SIEMPRE, aunque los deletes hayan dicho que sí: cuesta dos
  //    UPDATE y cierra el caso en que uno de ellos mintió.
  await anonimizarSobrevivientes(sesionId, retenidos, problemas);

  // 10. La reunión queda cerrada SOLO si no quedó nada por reintentar. Con
  //     problemas abiertos se deja sin cerrar a propósito: `cerrada_at` es lo
  //     único que decide si la pantalla sigue mostrando el botón "Limpiar
  //     reunión", y marcarla igual dejaba la reunión limpia en la UI y sucia en
  //     la base, sin ninguna forma de reintentar.
  if (problemas.length === 0) {
    anotar(
      "demo_sesiones",
      (await admin.from("demo_sesiones").update({ cerrada_at: new Date().toISOString() }).eq("id", sesionId)).error
    );
  }

  return { ok: problemas.length === 0, problemas, retenidos, participantes: filas.length };
}

/**
 * Le saca la persona a lo que la evidencia de firma no dejó borrar.
 *
 * `demo_sesion_id` se conserva A PROPÓSITO: es lo que mantiene a esa ficha fuera
 * de la oferta del call center, del padrón del panel y del chip de CI activa. Es
 * la marca que hace que un fantasma sea inofensivo.
 */
async function anonimizarSobrevivientes(
  sesionId: string,
  retenidos: string[],
  problemas: string[]
): Promise<void> {
  const admin = createAdminClient();

  const { data: medicos, error: errM } = await admin
    .from("medicos")
    .update({
      nombre_completo: NOMBRE_ANONIMO.profesional,
      titulo: null,
      celular_personal: null,
      telefono: null,
      disponible: false,
    })
    .eq("demo_sesion_id", sesionId)
    .select("id");
  if (errM) problemas.push(`anonimizar profesionales: ${errM.message}`);
  else if ((medicos ?? []).length > 0) {
    retenidos.push(
      `${medicos!.length} ficha(s) de profesional quedaron en la base (las retiene su firma) ` +
        `y se anonimizaron: sin nombre, sin celular y fuera de la oferta.`
    );
  }

  // ── SE VACÍA LA FICHA ENTERA, NO LOS CAMPOS DEL ALTA ─────────────────────
  // El alta de un paciente de demostración escribe cuatro campos (nombre, DNI,
  // fecha de nacimiento, celular), pero la ficha NO se queda con esos cuatro: en
  // la reunión el participante pasa por "Tu información médica" y por el modal
  // de datos, y ahí tipea sexo, CUIL y su cobertura — obra social, plan y número
  // de afiliado. Son datos reales de una persona real, sobre su salud, en la
  // base de la provincia. Anonimizar solo lo que el alta escribió los dejaba
  // intactos.
  //
  // El CUIL va con el DNI o no va: se deriva del DNI y el sexo, así que dejarlo
  // es dejar el documento escrito de otra forma.
  const { data: pacientes, error: errP } = await admin
    .from("pacientes")
    .update({
      nombre_completo: NOMBRE_ANONIMO.paciente,
      telefono: null,
      dni: null,
      cuil: null,
      fecha_nacimiento: null,
      sexo_dni: null,
      tiene_cobertura: false,
      obra_social: null,
      obra_social_id: null,
      obra_social_otra: null,
      nro_afiliado: null,
      plan_obra_social: null,
    })
    .eq("demo_sesion_id", sesionId)
    .select("id");
  if (errP) problemas.push(`anonimizar pacientes: ${errP.message}`);
  else if ((pacientes ?? []).length > 0) {
    retenidos.push(
      `${pacientes!.length} ficha(s) de paciente quedaron en la base y se anonimizaron: ` +
        `sin nombre, sin celular, sin DNI y sin los datos de cobertura que se hayan cargado.`
    );
  }
}

// ─── El barrido: ninguna reunión queda abierta para siempre ──────────────────

/**
 * Horas después de las cuales una reunión abierta se limpia sola.
 *
 * El único apagador que había era el botón "Limpiar reunión". Si nadie lo tocaba
 * —y en una gira de tres o cuatro reuniones eso pasa— quedaban dando vueltas en
 * la base de la provincia el nombre y el celular de gente que fue a una reunión,
 * fichas de profesional con agenda cargada, y pacientes de utilería en el
 * padrón. Nada de eso tiene fecha de vencimiento propia.
 *
 * 24 h deja pasar la reunión más larga imaginable con margen, y es más que la
 * vigencia del enlace (`HORAS_ACCESO_DEMO`), así que cuando el barrido llega los
 * accesos ya estaban muertos: lo que limpia son los datos, no una puerta.
 *
 * ── ESTO NO ES UN VENCIMIENTO ────────────────────────────────────────────────
 * Decisión de Diego (18/08/2026): la demo y sus accesos **no vencen**; se
 * terminan cuando él toca **Eliminar demo**. Este barrido no es la puerta —
 * es el señor de la limpieza.
 *
 * Existe por una obligación que no es de producto: una demo abandonada deja en
 * la base de la provincia el nombre y el celular de personas reales que fueron
 * a una presentación. Eso no puede quedar ahí para siempre porque nadie tocó un
 * botón. Por eso el plazo es LARGO (30 días): tiene que ser imposible que le
 * pise una preparación, y solo debe alcanzar a lo que quedó olvidado de verdad.
 *
 * La versión anterior contaba 24 h desde la CREACIÓN, y eso sí era un
 * saboteador: una demo preparada con días de anticipación se autoborraba la
 * víspera, con participantes, agenda y escenario adentro.
 */
export const HORAS_REUNION_ABIERTA = 24 * 30;

export interface ResumenBarridoDemo {
  abiertas: number;
  limpiadas: number;
  conProblemas: { sesionId: string; problemas: string[] }[];
}

/**
 * Limpia las reuniones que quedaron abiertas de más. Idempotente y sin PII en
 * los logs: ids y contadores, nunca nombres.
 */
export async function cerrarReunionesVencidas(
  horas = HORAS_REUNION_ABIERTA
): Promise<ResumenBarridoDemo> {
  const resumen: ResumenBarridoDemo = { abiertas: 0, limpiadas: 0, conProblemas: [] };
  if (!esInstitucional()) return resumen;

  const admin = createAdminClient();
  const corteCreacion = new Date(Date.now() - horas * 3600_000).toISOString();
  const { data, error } = await admin
    .from("demo_sesiones")
    .select("id")
    .is("cerrada_at", null)
    .lt("created_at", corteCreacion)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[demo] No se pudieron listar las reuniones vencidas:", error.message);
    return resumen;
  }

  const vencidas = (data ?? []).map((s) => s.id as string);
  resumen.abiertas = vencidas.length;
  for (const sesionId of vencidas) {
    const res = await limpiarSesionDemo(sesionId);
    if (res.ok) resumen.limpiadas++;
    else resumen.conProblemas.push({ sesionId, problemas: res.problemas });
  }
  return resumen;
}
