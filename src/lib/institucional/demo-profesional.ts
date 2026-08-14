// src/lib/institucional/demo-profesional.ts
// El PROFESIONAL DE DEMOSTRACIÓN — la cuenta que recibe un participante de la
// reunión para atender en vivo. SOLO instancia institucional.
//
// ── QUÉ TIENE QUE PODER HACER, Y QUÉ NO ──────────────────────────────────────
// TIENE que poder: entrar a su dashboard, levantar agenda (a mano o pidiéndosela
// a Nova), ponerse disponible para consulta inmediata, atender una videollamada
// y emitir una receta con su QR de verificación funcionando. Si algo de eso
// falla, la demo no existe.
//
// NO tiene que poder: pasar por un profesional real. El participante no está
// matriculado, así que TODO documento que emita sale con la marca
// "DEMOSTRACIÓN — SIN VALIDEZ LEGAL" (marca de agua + leyenda al pie + cartel en
// la página pública de verificación). Eso no es un detalle cosmético: es lo
// único que impide que un papel firmado en una sala de reuniones termine en un
// mostrador de farmacia.
//
// ── POR QUÉ `es_cuenta_test` Y NO UN CAMINO NUEVO ────────────────────────────
// El B2C ya resolvió este problema: hay 73 usos de `es_cuenta_test` que eximen a
// una cuenta de prueba de los requisitos que un humano no puede cumplir en una
// demo — perfil completo, gate de identidad biométrica y, en la base, el
// constraint `medicos_aprobado_requiere_refeps` (que exime explícitamente a las
// cuentas test). Esquivar ese patrón para inventar exenciones nuevas sería
// escribir por segunda vez una lógica que ya está probada, y la segunda es la
// que se olvida de un caso.
//
// `demo_sesion_id` es OTRA cosa y las dos conviven a propósito:
//   · `es_cuenta_test` = "no cuentes esto como real" (lo que ya sabe el B2C);
//   · `demo_sesion_id` = "esto es de ESTA reunión" — de ahí salen la marca de
//     agua del documento y el borrado de la reunión.

import { randomBytes } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { esInstitucional } from "@/lib/instancia";
import { getConfigInstitucion } from "@/lib/institucional/config";
import { provisionarClaves } from "@/lib/firma/claves";
import { emailDemo, type DatosParticipante } from "@/lib/institucional/demo";

export interface ProfesionalDemoCreado {
  medicoId: string;
  userId: string;
  especialidad: string;
  /**
   * ¿Quedaron las claves de firma?
   *
   * Viaja hasta la pantalla a propósito. Sin esto, el único registro de que la
   * firma no se pudo provisionar era una línea en los logs de Vercel: la
   * invitación devolvía `ok`, el QR se mostraba igual, y el fallo aparecía
   * recién en la Escena 4 —"Médico sin claves de firma activas"— con el
   * documento sin sello y la página de verificación en ámbar, proyectada.
   */
  clavesOk: boolean;
}

export type ResultadoProfesionalDemo =
  | { ok: true; profesional: ProfesionalDemoCreado }
  | { ok: false; error: string };

/**
 * Matrícula del profesional de demostración.
 *
 * Se inventa a propósito con un formato que NO puede confundirse con una
 * matrícula real ni chocar con la de nadie: si acá saliera un número plausible,
 * el papel de la demo estaría atribuyéndole una prescripción a una persona real
 * que no tuvo nada que ver. Sale impresa tal cual en el documento, y eso es
 * bueno: la matrícula es el primer lugar donde un farmacéutico mira.
 */
export function matriculaDemo(sufijo: string): string {
  return `DEMO-${sufijo.toUpperCase()}`;
}

/**
 * Da de alta al profesional de la demo: cuenta auth + ficha de `medicos` +
 * claves de firma. Idempotencia por participante la maneja el caller (una fila
 * de `demo_participantes` = una cuenta).
 *
 * Sin contraseña JAMÁS: su llave es el enlace temporal (migración 026), igual
 * que la del paciente.
 */
export async function provisionarProfesionalDemo(params: {
  sesionId: string;
  datos: DatosParticipante;
  /** Título elegido en el panel ("Dr." / "Dra."). Sin dato, el nombre va pelado. */
  titulo?: string | null;
}): Promise<ResultadoProfesionalDemo> {
  if (!esInstitucional()) {
    return { ok: false, error: "El modo demo solo existe en la instancia institucional." };
  }

  const config = await getConfigInstitucion();

  // La especialidad tiene que ser una del piloto: la oferta del otorgador
  // filtra por `config.especialidades`, así que un profesional fuera de esa
  // lista existe pero es invisible — el peor final posible para una demo.
  const especialidad =
    params.datos.especialidad && config.especialidades.includes(params.datos.especialidad)
      ? params.datos.especialidad
      : config.especialidades[0];
  if (!especialidad) {
    return {
      ok: false,
      error:
        "La institución no tiene ninguna especialidad configurada. Cargala en Institución antes de invitar profesionales.",
    };
  }

  const admin = createAdminClient();
  const sufijo = randomBytes(4).toString("hex");
  const email = emailDemo(sufijo, config.dominio);

  const { data: creado, error: errAuth } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { origen: "demo", rol: "profesional" },
  });
  if (errAuth || !creado?.user) {
    console.error("[demo] createUser del profesional falló:", errAuth?.message);
    return { ok: false, error: "No se pudo crear la cuenta del profesional. Probá de nuevo." };
  }

  const { data: fila, error: errInsert } = await admin
    .from("medicos")
    .insert({
      user_id: creado.user.id,
      nombre_completo: params.datos.nombre,
      titulo: (params.titulo ?? "").trim() || null,
      email,
      especialidad,
      tipo_matricula: "MN",
      numero_matricula: matriculaDemo(sufijo),
      slug: `demo-${sufijo}`,
      // El domicilio que sale impreso en el papel es el de la institución: el
      // participante no tiene consultorio y el documento no puede inventarle uno.
      domicilio: config.nombre,
      domicilio_consultorio: config.nombre,
      // Celular del participante: es lo que hace que le llegue el WhatsApp de
      // "tenés un paciente esperando" durante la reunión. Es dato de una persona
      // real y vive SOLO acá y en `demo_participantes`.
      celular_personal: params.datos.celular,
      telefono: params.datos.celular,
      // La duración la define la INSTITUCIÓN (R10), no el profesional.
      duracion_consulta: config.slot_duracion_min,
      // La ventana de CI también es de la institución; se copia para que el
      // dashboard del profesional muestre algo coherente.
      disponible_desde: config.ci_ventana_inicio,
      disponible_hasta: config.ci_ventana_fin,
      // Arranca APAGADO: ponerse disponible es parte del guion de la reunión,
      // y es el propio participante el que lo hace delante de todos.
      disponible: false,
      verificado: true,
      estado_registro: "aprobado",
      // El patrón del B2C para "esto no es real" (ver el encabezado).
      es_cuenta_test: true,
      demo_sesion_id: params.sesionId,
    })
    .select("id")
    .single();

  if (errInsert || !fila) {
    console.error("[demo] insert del profesional falló:", errInsert?.message);
    // Sin ficha, la cuenta auth no sirve para nada: rollback best-effort.
    await admin.auth.admin.deleteUser(creado.user.id).catch(() => {});
    return { ok: false, error: "No se pudo crear el perfil del profesional. Probá de nuevo." };
  }

  // Claves de firma: sin esto el documento sale SIN sello y la página de
  // verificación diría "documento sin sello electrónico" — justo la pantalla
  // que la demo quiere mostrar funcionando. Que firme una cuenta de
  // demostración no es un problema: el papel entero está marcado como tal.
  let clavesOk = true;
  try {
    await provisionarClaves(fila.id);
  } catch (err) {
    console.error("[demo] No se pudieron provisionar las claves de firma:", err);
    // No se aborta el alta: el profesional puede atender igual y documentar; lo
    // que pierde es el sello. Pero el fallo SALE de acá y se pinta en la fila
    // del participante, con un botón para reintentar: es la única pieza del alta
    // cuya falla no se veía en ninguna pantalla.
    clavesOk = false;
  }

  return {
    ok: true,
    profesional: { medicoId: fila.id, userId: creado.user.id, especialidad, clavesOk },
  };
}

/**
 * Vuelve a intentar las claves de firma de un profesional de la demo.
 *
 * El botón "Reintentar firma" de la pantalla de la reunión. Idempotente: si ya
 * las tiene, `provisionarClaves` no duplica nada.
 */
export async function reintentarClavesDemo(
  medicoId: string
): Promise<{ ok: boolean; error?: string }> {
  if (!esInstitucional()) {
    return { ok: false, error: "El modo demo solo existe en la instancia institucional." };
  }
  try {
    await provisionarClaves(medicoId);
    return { ok: true };
  } catch (err) {
    console.error("[demo] Reintento de claves de firma fallado:", err);
    return { ok: false, error: "Siguen sin salir las claves de firma. Mirá los logs." };
  }
}
