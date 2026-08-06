import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarDesdeBandeja } from "@/lib/correo";
import { sendDoctoAlert } from "@/lib/alertas";
import { withCron } from "@/lib/cron-guard";
import { duracionHumana } from "@/lib/crons-meta";

/**
 * Recupero de registros médicos abandonados + vigía de la cola de aprobación.
 *
 * Contexto (06/08/2026): 14 médicos reales crearon su cuenta y abandonaron el
 * formulario; en 20 días NINGUNO volvió solo, porque no existía ningún
 * recordatorio automático — los únicos mails de recupero los mandó el CEO a
 * mano desde la Bandeja. Además había médicos en `pendiente_revision` hace 18
 * días sin que nadie vigilara esa cola (la pantalla les promete "menos de 24
 * horas").
 *
 * Parte A — recupero: usuarios de auth con role "medico", cuenta de entre 24 h
 * y 21 días, SIN fila en `medicos` (la fila se crea recién al completar los
 * datos profesionales) → un único mail desde contacto@ (Bandeja) invitando a
 * retomar en /registro-medico/continuar. Dedupe doble: fila previa en `correos`
 * con el mismo asunto (cubre los recuperos manuales del CEO) + marca durable
 * `docto_recupero_registro_at` en app_metadata.
 *
 * Parte B — vigía: si hay médicos reales en `pendiente_revision` hace más de
 * 24 h, UNA alerta diaria a Diego con la lista y el link al panel.
 */

export const maxDuration = 60;

const ASUNTO_RECUPERO = "Te falta un paso para empezar a atender en Docto";
const TOPE_POR_CORRIDA = 20;
const DIA_MS = 24 * 60 * 60 * 1000;

// Cuentas internas o de prueba que jamás deben recibir el recupero.
const EMAILS_EXCLUIDOS = ["pruebas-docto", "+registro", "@docto.com.ar"];

/** Primera palabra de full_name, capitalizada ("MARIA JOSE" → "Maria"). */
function primerNombre(fullName: unknown): string {
  const palabra = String(fullName ?? "").trim().split(/\s+/)[0] ?? "";
  if (!palabra) return "doctor/a";
  return palabra.charAt(0).toUpperCase() + palabra.slice(1).toLowerCase();
}

export const GET = withCron("recuperar-registros", async () => {
  const admin = createAdminClient();
  const ahora = Date.now();

  // ── Parte A: recupero de registros abandonados ─────────────────────────────

  // Todos los usuarios de auth, PAGINADO (ya hay más de 50; listUsers sin
  // params devuelve solo la primera página y el bug sería silencioso).
  const usuarios: User[] = [];
  const PER_PAGE = 1000;
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PER_PAGE });
    if (error) throw new Error(`listUsers (página ${page}): ${error.message}`);
    usuarios.push(...data.users);
    if (data.users.length < PER_PAGE) break;
  }

  // Fila en `medicos` = registro completado (se crea al cargar los datos
  // profesionales). Los que la tienen no son abandono.
  const { data: filasMedicos, error: errMedicos } = await admin
    .from("medicos")
    .select("user_id");
  if (errMedicos) throw new Error(`medicos: ${errMedicos.message}`);
  const completaron = new Set((filasMedicos ?? []).map((m) => m.user_id as string));

  // Dedupe 1: ya hay un mail con este asunto en `correos` (cubre los recuperos
  // manuales que mandó el CEO desde la Bandeja). Se ignoran los intentos
  // fallidos (error_envio): un envío que nunca salió no cuenta como recibido.
  const { data: yaEnviados, error: errCorreos } = await admin
    .from("correos")
    .select("para")
    .eq("asunto", ASUNTO_RECUPERO)
    .is("error_envio", null);
  if (errCorreos) throw new Error(`correos: ${errCorreos.message}`);
  const yaMaileados = new Set(
    (yaEnviados ?? []).map((c) => String(c.para ?? "").toLowerCase())
  );

  const candidatos = usuarios.filter((u) => {
    if (u.user_metadata?.role !== "medico") return false;
    const email = (u.email ?? "").toLowerCase();
    if (!email) return false;
    if (EMAILS_EXCLUIDOS.some((patron) => email.includes(patron))) return false;
    // Ventana: más de 24 h (no atosigar al que se registró recién) y menos de
    // 21 días (no revivir cuentas frías con un mail fuera de contexto).
    const edadMs = ahora - Date.parse(u.created_at);
    if (edadMs <= DIA_MS || edadMs >= 21 * DIA_MS) return false;
    if (completaron.has(u.id)) return false;
    if (yaMaileados.has(email)) return false;
    // Dedupe 2: marca durable en el propio usuario.
    if (u.app_metadata?.docto_recupero_registro_at) return false;
    return true;
  });

  const recuperosEnviados: string[] = [];
  const recuperosFallidos: string[] = [];
  for (const u of candidatos.slice(0, TOPE_POR_CORRIDA)) {
    const email = (u.email ?? "").toLowerCase();
    // La firma "—\nDocto\ndocto.com.ar" la agrega enviarDesdeBandeja; acá NO.
    const cuerpo = `Hola ${primerNombre(u.user_metadata?.full_name)}, creaste tu cuenta en Docto pero quedó pendiente el último paso: cargar tus datos profesionales.\n\nPodés completarlo en dos minutos acá:\nhttps://www.docto.com.ar/registro-medico/continuar\n\nSi tenés cualquier problema, respondé este mail y te ayudamos.\n\nValentina`;

    const resultado = await enviarDesdeBandeja({
      para: email,
      asunto: ASUNTO_RECUPERO,
      cuerpo,
    });
    if (!resultado.ok) {
      // No se marca app_metadata: mañana se reintenta (la fila fallida en
      // `correos` tampoco bloquea, el dedupe filtra por error_envio IS NULL).
      recuperosFallidos.push(`${email}: ${resultado.error}`);
      continue;
    }

    const { error: errMarca } = await admin.auth.admin.updateUserById(u.id, {
      app_metadata: {
        ...u.app_metadata,
        docto_recupero_registro_at: new Date().toISOString(),
      },
    });
    if (errMarca) {
      // El mail ya salió y quedó registrado en `correos` (dedupe 1 lo cubre);
      // solo dejar constancia de que la marca durable no se pudo escribir.
      console.error(`[recuperar-registros] no pude marcar app_metadata de ${email}: ${errMarca.message}`);
    }
    recuperosEnviados.push(email);
  }

  // ── Parte B: vigía de la cola de aprobación ────────────────────────────────

  const { data: pendientes, error: errPendientes } = await admin
    .from("medicos")
    .select("nombre_completo, created_at")
    .eq("estado_registro", "pendiente_revision")
    .eq("es_cuenta_test", false)
    .lt("created_at", new Date(ahora - DIA_MS).toISOString())
    .order("created_at", { ascending: true });
  if (errPendientes) throw new Error(`medicos pendientes: ${errPendientes.message}`);

  const colaVieja = pendientes ?? [];
  if (colaVieja.length > 0) {
    const lista = colaVieja
      .map(
        (m) =>
          `● ${m.nombre_completo} — esperando hace ${duracionHumana(
            (ahora - Date.parse(m.created_at)) / 60_000
          )}`
      )
      .join("\n");
    // El cron corre 1 vez al día: una alerta diaria mientras la cola siga
    // vieja es el comportamiento buscado, no hace falta throttle extra.
    await sendDoctoAlert(
      "🟡 Médicos esperando aprobación hace más de 24 h",
      `La pantalla de verificación les promete "menos de 24 horas" y estos médicos ya la pasaron:\n\n${lista}\n\nRevisalos acá:\nhttps://www.docto.com.ar/admin/medicos\n\n———\nDetalle técnico (para Claude): cron recuperar-registros, ${colaVieja.length} fila(s) de medicos en pendiente_revision con más de 24 h (es_cuenta_test excluidas).`
    );
  }

  if (recuperosEnviados.length > 0) {
    console.log(`[recuperar-registros] ${recuperosEnviados.length} recuperos enviados:`, recuperosEnviados.join(", "));
  }
  if (recuperosFallidos.length > 0) {
    console.error(`[recuperar-registros] ${recuperosFallidos.length} fallidos:`, recuperosFallidos.join(" | "));
  }

  return NextResponse.json({
    revisados: usuarios.length,
    recuperos_enviados: recuperosEnviados,
    recuperos_fallidos: recuperosFallidos,
    pendientes_alertados: colaVieja.length,
  });
});
